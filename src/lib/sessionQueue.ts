// src/lib/sessionQueue.ts
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  LearnerItemState, LearnerSkillState,
  ExerciseItem, SessionQueueItem,
  LearnerGrammarState, GrammarPatternWithLesson,
} from '@/types/learning'
import type { ExerciseVariant } from '@/types/learning'
import {
  getSemanticGroup,
  pickDistractorCascade,
  type DistractorCandidate,
} from '@/lib/distractors'
import { normalizeTtsText } from '@/lib/ttsNormalize'
import type { SessionAudioMap } from '@/services/audioService'
import { capabilityMigrationFlags, isExerciseTypeEnabled } from '@/lib/featureFlags'
import { runSessionCapabilityDiagnosticsIfEnabled } from '@/lib/capabilities/sessionCapabilityDiagnostics'

export type SessionMode = 'standard' | 'lesson_practice' | 'lesson_review'

// Fraction of the session filled with grammar exercises (standard mode only).
const GRAMMAR_SESSION_RATIO = 0.15

export interface SessionBuildInput {
  allItems: LearningItem[]
  meaningsByItem: Record<string, ItemMeaning[]>
  contextsByItem: Record<string, ItemContext[]>
  variantsByItem: Record<string, ItemAnswerVariant[]>
  exerciseVariantsByContext?: Record<string, ExerciseVariant[]>
  itemStates: Record<string, LearnerItemState>
  skillStates: Record<string, LearnerSkillState[]>
  preferredSessionSize: number
  lessonFilter: string | null
  userLanguage: 'en' | 'nl'
  lessonOrder?: Record<string, number>
  sessionMode?: SessionMode
  // Grammar scheduling inputs
  grammarPatterns?: GrammarPatternWithLesson[]
  grammarStates?: Record<string, LearnerGrammarState>        // keyed by grammar_pattern_id
  grammarVariantsByPattern?: Record<string, ExerciseVariant[]> // keyed by grammar_pattern_id
  // Audio-exercise inputs (listening_mcq, future dictation)
  audioMap?: SessionAudioMap
  listeningEnabled?: boolean  // user setting; default true
}

interface CandidateItem {
  item: LearningItem
  state: LearnerItemState | null
  skills: LearnerSkillState[]
  // Set for due items: the specific skill that triggered inclusion.
  // selectExercises uses this to serve the matching exercise instead of randomising,
  // so the due skill is always what gets reviewed.
  targetSkillType?: string
}

export function buildSessionQueue(input: SessionBuildInput): SessionQueueItem[] {
  if (input.sessionMode === 'lesson_practice' || input.sessionMode === 'lesson_review') {
    return []
  }

  const effectiveSessionSize = input.preferredSessionSize
  const now = new Date()

  // 1. Filter eligible items (by lesson, by language)
  const eligibleItems = filterEligible(input)

  // 2. Split: due items (any skill with next_due_at <= now) vs new items (no state or stage=new)
  const dueItems: CandidateItem[] = []
  const newItems: CandidateItem[] = []

  for (const item of eligibleItems) {
    const state = input.itemStates[item.id] ?? null
    const skills = input.skillStates[item.id] ?? []

    if (state?.suspended) continue

    if (!state || state.stage === 'new') {
      newItems.push({ item, state, skills })
      continue
    }

    // Trust FSRS: one candidate per due skill — ensures the due skill is actually reviewed.
    // Grouping all due skills under one item (old behaviour) let selectExercises serve
    // a non-due skill, leaving the due skill unreviewed and the item stuck.
    const dueSkills = skills.filter(s => s.next_due_at && new Date(s.next_due_at) <= now)
    for (const dueSkill of dueSkills) {
      dueItems.push({ item, state, skills, targetSkillType: dueSkill.skill_type })
    }
  }

  // 3. Sort due items: most overdue first, using the specific due skill's next_due_at
  dueItems.sort((a, b) => {
    const dueTime = (c: CandidateItem) => {
      const skill = c.skills.find(s => s.skill_type === c.targetSkillType)
      return skill?.next_due_at ? new Date(skill.next_due_at).getTime() : Infinity
    }
    return dueTime(a) - dueTime(b)
  })

  // Deduplicate: one item per session. If an item has multiple due skills, keep only
  // the most-overdue one (first after sort). Remaining due skills carry over to the
  // next session — showing the same word 3× in a row violates spaced repetition intent.
  const seenItemIds = new Set<string>()
  const dedupedDueItems: CandidateItem[] = []
  for (const candidate of dueItems) {
    if (!seenItemIds.has(candidate.item.id)) {
      seenItemIds.add(candidate.item.id)
      dedupedDueItems.push(candidate)
    }
  }
  dueItems.splice(0, dueItems.length, ...dedupedDueItems)

  // 4. Order new items by lesson order — earlier lessons first.
  // The combined slice at step 5 naturally limits new items to whatever space remains
  // after due items fill their slots, up to effectiveSessionSize total.
  const gatedNew = sortByLessonOrder(newItems, input.contextsByItem, input.lessonOrder)

  // 5. Determine grammar slot count
  const grammarSlots = Math.max(1, Math.round(effectiveSessionSize * GRAMMAR_SESSION_RATIO))

  // Vocab slots are the remainder after grammar is allocated.
  const vocabSlots = effectiveSessionSize - grammarSlots

  // 6. Build vocab exercises
  const candidates = [...dueItems, ...gatedNew].slice(0, vocabSlots)

  const vocabQueue: SessionQueueItem[] = []
  for (const candidate of candidates) {
    const exercises = selectExercises(
      candidate,
      input.meaningsByItem,
      input.contextsByItem,
      input.variantsByItem,
      input.exerciseVariantsByContext,
      input.userLanguage,
      eligibleItems,
      input.audioMap,
      input.listeningEnabled !== false,
    )
    for (const exercise of exercises) {
      vocabQueue.push({
        source: 'vocab',
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: candidate.skills.find(s => s.skill_type === exercise.skillType) ?? null,
      })
    }
  }

  // 7. Build grammar exercises
  const grammarQueue: SessionQueueItem[] = grammarSlots > 0
    ? buildGrammarQueue(input, grammarSlots, now)
    : []

  // 8. Interleave grammar evenly through the vocab queue
  const interleaved = interleaveQueues(
    orderQueue(vocabQueue.slice(0, vocabSlots)),
    grammarQueue,
  )

  const queue = interleaved.slice(0, effectiveSessionSize)
  runSessionCapabilityDiagnosticsIfEnabled({
    enabled: capabilityMigrationFlags.sessionDiagnostics,
    items: queue,
  })
  return queue
}

function buildGrammarQueue(
  input: SessionBuildInput,
  slots: number,
  now: Date,
): SessionQueueItem[] {
  const { grammarPatterns = [], grammarStates = {}, grammarVariantsByPattern = {} } = input
  if (grammarPatterns.length === 0) return []

  // Partition into due, new, and not-yet-due patterns
  const duePatterns: GrammarPatternWithLesson[] = []
  const newPatterns: GrammarPatternWithLesson[] = []

  for (const pattern of grammarPatterns) {
    const state = grammarStates[pattern.id]
    const variants = grammarVariantsByPattern[pattern.id] ?? []
    if (variants.length === 0) continue  // skip patterns with no exercises

    if (!state || state.stage === 'new') {
      newPatterns.push(pattern)
    } else if (state.due_at && new Date(state.due_at) <= now) {
      duePatterns.push(pattern)
    }
  }

  // Sort due patterns: most overdue first
  duePatterns.sort((a, b) => {
    const stateA = grammarStates[a.id]
    const stateB = grammarStates[b.id]
    const tA = stateA?.due_at ? new Date(stateA.due_at).getTime() : Infinity
    const tB = stateB?.due_at ? new Date(stateB.due_at).getTime() : Infinity
    return tA - tB
  })

  // Sort new patterns: lowest lesson order first (natural curriculum drip)
  newPatterns.sort((a, b) => a.introduced_by_lesson_order - b.introduced_by_lesson_order)

  const candidates = [...duePatterns, ...newPatterns].slice(0, slots)

  const queue: SessionQueueItem[] = []
  for (const pattern of candidates) {
    const variants = grammarVariantsByPattern[pattern.id] ?? []
    // Defense in depth: never schedule speaking until ASR is wired — the
    // DB gate (exercise_type_availability.session_enabled=false) is load-bearing;
    // this filter ensures a flag flip can't silently corrupt FSRS state.
    const nonSpeakingVariants = variants.filter(v => v.exercise_type !== 'speaking')
    if (nonSpeakingVariants.length === 0) continue
    const variant = nonSpeakingVariants[Math.floor(Math.random() * nonSpeakingVariants.length)]
    const exercise = makeGrammarExercise(pattern, variant)
    queue.push({
      source: 'grammar',
      exerciseItem: exercise,
      grammarState: grammarStates[pattern.id] ?? null,
      grammarPatternId: pattern.id,
    })
  }

  return queue
}

/** @internal exported for tests */
export function makeGrammarExercise(
  _pattern: GrammarPatternWithLesson,
  variant: ExerciseVariant,
): ExerciseItem {
  const exerciseType = variant.exercise_type as ExerciseItem['exerciseType']
  const payload = variant.payload_json
  const answerKey = variant.answer_key_json

  const base: ExerciseItem = {
    learningItem: null,
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'recognition',
    exerciseType,
  }

  switch (exerciseType) {
    case 'contrast_pair': {
      // Grammar contrast_pair payloads store options as [{id, text}] objects.
      // ContrastPairExercise compares option values directly to correctOptionId,
      // so we normalise both to plain text strings here.
      const rawOpts = payload.options as Array<{ id: string; text: string } | string>
      const correctId = (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || ''
      const optionTexts: [string, string] = (rawOpts ?? []).map(o =>
        typeof o === 'string' ? o : o.text
      ) as [string, string]
      const correctText = (() => {
        const match = rawOpts?.find(o => typeof o !== 'string' && o.id === correctId)
        return match && typeof match !== 'string' ? match.text : correctId
      })()
      return {
        ...base,
        skillType: 'recognition',
        contrastPairData: {
          promptText: payload.promptText || '',
          targetMeaning: payload.targetMeaning || '',
          options: optionTexts,
          correctOptionId: correctText,
          explanationText: payload.explanationText || '',
        },
      }
    }

    case 'sentence_transformation':
      return {
        ...base,
        skillType: 'form_recall',
        sentenceTransformationData: {
          sourceSentence: payload.sourceSentence || '',
          transformationInstruction: payload.transformationInstruction || '',
          acceptableAnswers: (answerKey?.acceptableAnswers as string[]) || (payload.acceptableAnswers as string[]) || [],
          hintText: payload.hintText as string | undefined,
          explanationText: payload.explanationText || '',
        },
      }

    case 'constrained_translation':
      return {
        ...base,
        skillType: 'meaning_recall',
        constrainedTranslationData: {
          sourceLanguageSentence: payload.sourceLanguageSentence || '',
          requiredTargetPattern: payload.requiredTargetPattern || '',
          patternName: _pattern.name || '',
          acceptableAnswers: (answerKey?.acceptableAnswers as string[]) || (payload.acceptableAnswers as string[]) || [],
          disallowedShortcutForms: (answerKey?.disallowedShortcutForms as string[] | undefined) ?? (payload.disallowedShortcutForms as string[] | undefined),
          explanationText: payload.explanationText || '',
        },
      }

    case 'cloze_mcq':
      return {
        ...base,
        skillType: 'recognition',
        clozeMcqData: {
          sentence: payload.sentence || '',
          translation: (payload.translation as string | null) ?? null,
          options: (payload.options as string[]) || [],
          correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || '',
          explanationText: (payload.explanationText as string) || undefined,
        },
      }

    default:
      return base
  }
}

/**
 * Interleave grammar items evenly through the vocab queue.
 * Grammar items are placed at regular intervals so they feel natural, not bunched.
 */
function interleaveQueues(
  vocabQueue: SessionQueueItem[],
  grammarQueue: SessionQueueItem[],
): SessionQueueItem[] {
  if (grammarQueue.length === 0) return vocabQueue
  if (vocabQueue.length === 0) return grammarQueue

  const result: SessionQueueItem[] = []
  const total = vocabQueue.length + grammarQueue.length
  // Place grammar items at evenly spaced positions (1-indexed, at least position 2
  // so we don't start with grammar).
  const step = Math.floor(total / grammarQueue.length)

  let vi = 0  // vocab index
  let gi = 0  // grammar index

  for (let pos = 0; pos < total; pos++) {
    // Insert a grammar item every `step` positions, but never at position 0
    const insertGrammarHere = gi < grammarQueue.length && pos > 0 && (pos % step === step - 1)
    if (insertGrammarHere) {
      result.push(grammarQueue[gi++])
    } else if (vi < vocabQueue.length) {
      result.push(vocabQueue[vi++])
    } else {
      result.push(grammarQueue[gi++])
    }
  }

  return result
}

export function filterEligible(input: SessionBuildInput): LearningItem[] {
  let items = input.allItems
  if (input.lessonFilter) {
    const lessonItemIds = new Set<string>()
    for (const [itemId, contexts] of Object.entries(input.contextsByItem)) {
      if (contexts.some(c => c.source_lesson_id === input.lessonFilter)) lessonItemIds.add(itemId)
    }
    items = items.filter(i => lessonItemIds.has(i.id))
  }
  return items.filter(i => {
    const meanings = input.meaningsByItem[i.id] ?? []
    const contexts = input.contextsByItem[i.id] ?? []

    // dialogue_chunk requires BOTH a user-language meaning AND a cloze-typed
    // context. Productive-stage routes to recognition_mcq (needs the Dutch
    // prompt from the meaning); retrieving-stage routes to cloze (needs a
    // cloze context). Without both, one stage or the other renders broken.
    // This enforces the C-1 contract from
    // docs/plans/2026-04-24-dialogue-pipeline-completion.md at runtime —
    // defense in depth beyond the publish-time gate.
    if (i.item_type === 'dialogue_chunk') {
      const hasMeaning = meanings.some(m => m.translation_language === input.userLanguage)
      const hasCloze = contexts.some(c => c.context_type === 'cloze')
      return hasMeaning && hasCloze
    }

    // Non-dialogue items (word / phrase / sentence): lenient OR-logic — a
    // user-language meaning covers recognition / meaning_recall / typed_recall;
    // a context with a published exercise_variant covers published-variant
    // rendering. Either path is sufficient.
    if (meanings.some(m => m.translation_language === input.userLanguage)) return true
    return contexts.some(ctx => (input.exerciseVariantsByContext?.[ctx.id] ?? []).length > 0)
  })
}

function sortByLessonOrder(
  items: CandidateItem[],
  contextsByItem: Record<string, ItemContext[]>,
  lessonOrder?: Record<string, number>,
): CandidateItem[] {
  if (!lessonOrder) return items
  const itemOrder = (itemId: string): number => {
    const contexts = contextsByItem[itemId] ?? []
    const orders = contexts.map(c => c.source_lesson_id ? (lessonOrder[c.source_lesson_id] ?? 9999) : 9999)
    return orders.length > 0 ? Math.min(...orders) : 9999
  }
  return [...items].sort((a, b) => itemOrder(a.item.id) - itemOrder(b.item.id))
}


function selectExercises(
  candidate: CandidateItem,
  meaningsByItem: Record<string, ItemMeaning[]>,
  contextsByItem: Record<string, ItemContext[]>,
  variantsByItem: Record<string, ItemAnswerVariant[]>,
  exerciseVariantsByContext?: Record<string, ExerciseVariant[]>,
  userLanguage: 'en' | 'nl' = 'nl',
  allItems: LearningItem[] = [],
  audioMap?: SessionAudioMap,
  listeningEnabled: boolean = true,
): ExerciseItem[] {
  const { item, state, targetSkillType } = candidate
  const meanings = meaningsByItem[item.id] ?? []
  const contexts = contextsByItem[item.id] ?? []
  const variants = variantsByItem[item.id] ?? []
  const stage = state?.stage ?? 'new'

  const exercises: ExerciseItem[] = []
  const isSentenceType = item.item_type === 'sentence' || item.item_type === 'dialogue_chunk'

  // canListen: all gates passed for listening_mcq. Hoisted so D.2 stage
  // branches + any future due-skill routing can share the same check.
  const canListen =
    isExerciseTypeEnabled('listening_mcq') &&
    listeningEnabled &&
    (item.item_type === 'word' || item.item_type === 'phrase') &&
    stage !== 'new' &&
    hasAudioFor(item, audioMap ?? new Map())
  // Dictation: same gates as listening plus its own feature flag.
  // Stage gate is stricter — only retrieving+ (form_recall is productive-skill).
  const canDictate =
    canListen &&
    isExerciseTypeEnabled('dictation') &&
    stage !== 'anchoring'

  // Whether the item has a cloze-eligible context: must be context_type 'cloze' specifically.

  const hasAnchorContext = contexts.some(c => c.context_type === 'cloze')

  // If a specific skill is targeted (due items), serve the matching exercise directly.
  // This is the FSRS contract: if the scheduler says skill X is due, we review skill X —
  // not a randomly chosen skill that happens to share the same item.
  if (targetSkillType) {
    switch (targetSkillType) {
      case 'recognition': {
        const out: ExerciseItem[] = [makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem)]
        // Form-recall introduction. The anchoring → retrieving promotion gate
        // (src/lib/stages.ts:42-54) requires recognition + meaning_recall but
        // not form_recall, so items can reach retrieving with only a
        // recognition skill row. Once there, they have nothing form_recall-
        // shaped that's ever due, so the queue keeps pulling them for
        // recognition forever — they can never promote to productive
        // (which gates on form_recall) and never contribute to recall_quality.
        // When we serve recognition for such an item, append a one-time
        // typed_recall (or cloze for sentence types with anchor context) so
        // the first form_recall review creates the skill row and FSRS takes
        // over from there.
        const isMaturedStage = stage === 'retrieving' || stage === 'productive' || stage === 'maintenance'
        const hasFormRecall = candidate.skills.some(s => s.skill_type === 'form_recall')
        if (isMaturedStage && !hasFormRecall) {
          if (isSentenceType && hasAnchorContext) {
            out.push(makeClozeExercise(item, meanings, contexts, variants))
          } else if (!isSentenceType) {
            out.push(makeTypedRecall(item, meanings, contexts, variants))
          }
        }
        return out
      }
      case 'meaning_recall':
        return [makeMeaningRecall(item, meanings, contexts, variants)]
      case 'form_recall': {
        // Uniform pick over eligible options. typed_recall is always eligible;
        // cloze and dictation join only if their preconditions hold. When all
        // three eligible: 33/33/33. When two: 50/50. When one: always typed.
        const formOptions: Array<() => ExerciseItem> = [
          () => makeTypedRecall(item, meanings, contexts, variants),
        ]
        if (hasAnchorContext) formOptions.push(() => makeClozeExercise(item, meanings, contexts, variants))
        if (canDictate) formOptions.push(() => makeDictation(item, meanings, contexts, variants))
        return [formOptions[Math.floor(Math.random() * formOptions.length)]()]
      }
      default:
        // Unknown skill type — fall through to stage-based selection
        break
    }
  }

  // Determine which exercises are appropriate for this stage
  if (stage === 'new' || stage === 'anchoring') {
    if (stage === 'anchoring') {
      const roll = Math.random()
      if (hasAnchorContext) {
        // Split the recognition_mcq tail (roll >= 0.70, 30% slice) 50/50
        // with listening_mcq when canListen: ~15% listening, ~15% recognition.
        if (roll < 0.25) {
          exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        } else if (roll < 0.50) {
          exercises.push(makeMeaningRecall(item, meanings, contexts, variants))
        } else if (roll < 0.70) {
          exercises.push(makeClozeMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        } else if (canListen && roll < 0.85) {
          exercises.push(makeListeningMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        } else {
          exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        }
      } else {
        // No-anchor anchoring: split recognition_mcq tail similarly.
        if (roll < 0.30) {
          exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        } else if (roll < 0.55) {
          exercises.push(makeMeaningRecall(item, meanings, contexts, variants))
        } else if (canListen && roll < 0.77) {
          exercises.push(makeListeningMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        } else {
          exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        }
      }
    } else {
      exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
    }
  } else if (stage === 'retrieving') {
    if (isSentenceType) {
      exercises.push(Math.random() < 0.6
        ? makeClozeMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem)
        : makeClozeExercise(item, meanings, contexts, variants))
    } else {
      const roll = Math.random()
      if (hasAnchorContext && roll < 0.40) {
        exercises.push(makeClozeMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
      } else if (roll < 0.65) {
        exercises.push(makeMeaningRecall(item, meanings, contexts, variants))
      } else if (hasAnchorContext && roll < 0.82) {
        exercises.push(makeClozeExercise(item, meanings, contexts, variants))
      } else {
        // Retrieving typed_recall tail (~18%). Split 50/50 with dictation
        // when canDictate → ~9% each. Preserves form-recall-via-typed budget.
        exercises.push(
          canDictate && Math.random() < 0.5
            ? makeDictation(item, meanings, contexts, variants)
            : makeTypedRecall(item, meanings, contexts, variants)
        )
      }
    }
  } else {
    // productive / maintenance: rotate across all available exercise types.
    if (isSentenceType) {
      exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
    } else {
      const hasPublishedVariants = contexts.some(ctx => (exerciseVariantsByContext?.[ctx.id] ?? []).length > 0)

      if (hasPublishedVariants) {
        for (const context of contexts) {
          // Defense in depth: filter speaking at the pick site too, so a stale
          // DB gate flip can't sneak a speaking variant through.
          const publishedVariants = (exerciseVariantsByContext?.[context.id] ?? [])
            .filter(v => v.exercise_type !== 'speaking')
          if (publishedVariants.length > 0) {
            const variant = publishedVariants[Math.floor(Math.random() * publishedVariants.length)]
            exercises.push(makePublishedExercise(item, meanings, context, variant))
            break
          }
        }
      }

      if (exercises.length === 0) {
        const roll = Math.random()
        if (roll < 0.35) {
          // Productive/maintenance typed_recall lead (35%). Split 50/50 with
          // dictation when canDictate → ~17% each. Preserves form-recall
          // budget while adding audio-form-recall practice.
          exercises.push(
            canDictate && Math.random() < 0.5
              ? makeDictation(item, meanings, contexts, variants)
              : makeTypedRecall(item, meanings, contexts, variants)
          )
        } else if (roll < 0.60 && hasAnchorContext) {
          exercises.push(makeClozeExercise(item, meanings, contexts, variants))
        } else if (roll < 0.80) {
          exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        } else {
          // Split the 20% recognition_mcq tail 50/50 with listening_mcq when
          // canListen: ~10% listening, ~10% recognition — preserves the 20%
          // recognition-skill budget while adding audio-recognition practice.
          if (canListen && Math.random() < 0.5) {
            exercises.push(makeListeningMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
          } else {
            exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
          }
        }
      }
    }
  }

  return exercises
}

// pickDistractorCascade + helpers + STRUCTURALLY_SIMILAR_TYPES moved to
// src/lib/distractors/. DistractorCandidate type imported above.

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function makeRecognitionMCQ(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = primaryMeaning?.translation_text ?? ''

  // Build candidate pool for the shared cascade. Each candidate's option is
  // its user-language translation; POS + semantic group travel with it.
  const pool: DistractorCandidate[] = allItems
    .filter(i => i.id !== item.id)
    .flatMap(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      if (!t || t === correctAnswer) return []
      return [{
        id: i.id,
        option: t,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: getSemanticGroup(t, userLanguage),
      }]
    })

  const target = {
    itemType: item.item_type,
    pos: item.pos ?? null,
    level: item.level,
    semanticGroup: getSemanticGroup(correctAnswer, userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3, correctAnswer)

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'recognition_mcq',
    distractors,
  }
}

function makeTypedRecall(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
): ExerciseItem {
  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'form_recall',
    exerciseType: 'typed_recall',
  }
}

function makeMeaningRecall(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
): ExerciseItem {
  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'meaning_recall',
    exerciseType: 'meaning_recall',
  }
}

/**
 * Dictation — audio prompt, typed Indonesian answer. Structurally identical
 * to typed_recall; only exerciseType differs so the component renders
 * audio-only input.
 *
 * @internal exported for tests
 */
export function makeDictation(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
): ExerciseItem {
  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'form_recall',
    exerciseType: 'dictation',
  }
}

/**
 * True if the item has an audio clip for the given voice.
 * Uses normalizeTtsText (not learning_items.normalized_text) per the
 * audio infrastructure contract — see docs/plans/2026-04-16-exercise-audio-design.md.
 *
 * @internal exported for tests
 */
export function hasAudioFor(
  item: LearningItem,
  audioMap: SessionAudioMap,
): boolean {
  return audioMap.has(normalizeTtsText(item.base_text))
}

/**
 * Runtime builder for listening_mcq. Mirrors makeRecognitionMCQ exactly —
 * the only difference from recognition_mcq is exerciseType, which the
 * component reads to decide whether to hide the Indonesian text.
 *
 * @internal exported for tests
 */
export function makeListeningMcq(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = primaryMeaning?.translation_text ?? ''

  const pool: DistractorCandidate[] = allItems
    .filter(i => i.id !== item.id)
    .flatMap(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      if (!t || t === correctAnswer) return []
      return [{
        id: i.id,
        option: t,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: getSemanticGroup(t, userLanguage),
      }]
    })

  const target = {
    itemType: item.item_type,
    pos: item.pos ?? null,
    level: item.level,
    semanticGroup: getSemanticGroup(correctAnswer, userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3, correctAnswer)

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'listening_mcq',
    distractors,
  }
}

function makeCuedRecall(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const promptMeaningText = primaryMeaning?.translation_text ?? ''

  // Candidate pool for cascade: option is base_text (the Indonesian form shown
  // as the option). Semantic group is looked up via each candidate's own
  // translation so the group filter works even though we render base_text.
  const pool: DistractorCandidate[] = allItems
    .filter(i => i.id !== item.id && i.base_text)
    .map(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      return {
        id: i.id,
        option: i.base_text,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: t ? getSemanticGroup(t, userLanguage) : null,
      }
    })

  const target = {
    itemType: item.item_type,
    pos: item.pos ?? null,
    level: item.level,
    semanticGroup: getSemanticGroup(promptMeaningText, userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3, item.base_text)
  const options = shuffle([item.base_text, ...distractors])

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'meaning_recall',
    exerciseType: 'cued_recall',
    cuedRecallData: {
      promptMeaningText,
      options,
      correctOptionId: item.base_text,
    },
  }
}

/** @internal exported for tests */
export function makeClozeMcq(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const clozeContext = contexts.find(c => c.context_type === 'cloze')

  // Candidate pool mirrors makeCuedRecall: option is base_text; semantic group
  // looked up via each candidate's own translation.
  const pool: DistractorCandidate[] = allItems
    .filter(i => i.id !== item.id && i.base_text)
    .map(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      return {
        id: i.id,
        option: i.base_text,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: t ? getSemanticGroup(t, userLanguage) : null,
      }
    })

  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const targetTranslation = primaryMeaning?.translation_text ?? ''

  const target = {
    itemType: item.item_type,
    pos: item.pos ?? null,
    level: item.level,
    semanticGroup: getSemanticGroup(targetTranslation, userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3, item.base_text)
  const options = shuffle([item.base_text, ...distractors])

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'cloze_mcq',
    clozeMcqData: clozeContext ? {
      sentence: clozeContext.source_text,
      translation: clozeContext.translation_text,
      options,
      correctOptionId: item.base_text,
    } : undefined,
  }
}

/** @internal exported for tests */
export function makeClozeExercise(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
): ExerciseItem {
  const clozeContext = contexts.find(c => c.context_type === 'cloze')

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'form_recall',
    exerciseType: 'cloze',
    clozeContext: clozeContext ? {
      sentence: clozeContext.source_text,
      targetWord: item.base_text,
      translation: clozeContext.translation_text,
    } : undefined,
  }
}

/** @internal exported for tests */
export function makePublishedExercise(
  item: LearningItem,
  meanings: ItemMeaning[],
  context: ItemContext,
  variant: ExerciseVariant,
): ExerciseItem {
  const exerciseType = variant.exercise_type as
    | 'cloze_mcq'
    | 'contrast_pair'
    | 'sentence_transformation'
    | 'constrained_translation'
    | 'speaking'

  const payload = variant.payload_json
  const answerKey = variant.answer_key_json

  const baseExercise: ExerciseItem = {
    learningItem: item,
    meanings,
    contexts: [context],
    answerVariants: [],
    skillType: 'form_recall',
    exerciseType: exerciseType,
  }

  switch (exerciseType) {
    case 'cloze_mcq':
      return {
        ...baseExercise,
        skillType: 'recognition',
        clozeMcqData: {
          sentence: payload.sentence || context.source_text || '',
          translation: (payload.translation as string | null) ?? null,
          options: (payload.options as string[]) || [],
          correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || '',
          explanationText: (payload.explanationText as string) || undefined,
        },
      }

    case 'contrast_pair': {
      const rawOptsPublished = (payload.options ?? []) as Array<{ id: string; text: string } | string>
      const correctIdPublished = (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || ''
      const optionTextsPublished: [string, string] = rawOptsPublished.map(o =>
        typeof o === 'string' ? o : o.text
      ) as [string, string]
      const correctTextPublished = (() => {
        const match = rawOptsPublished.find(o => typeof o !== 'string' && o.id === correctIdPublished)
        return match && typeof match !== 'string' ? match.text : correctIdPublished
      })()
      return {
        ...baseExercise,
        skillType: 'recognition',
        contrastPairData: {
          promptText: payload.promptText || '',
          targetMeaning: payload.targetMeaning || '',
          options: optionTextsPublished,
          correctOptionId: correctTextPublished,
          explanationText: payload.explanationText || '',
        },
      }
    }

    case 'sentence_transformation':
      return {
        ...baseExercise,
        skillType: 'form_recall',
        sentenceTransformationData: {
          sourceSentence: payload.sourceSentence || '',
          transformationInstruction: payload.transformationInstruction || '',
          acceptableAnswers: (answerKey?.acceptableAnswers as string[]) || (payload.acceptableAnswers as string[]) || [],
          hintText: payload.hintText as string | undefined,
          explanationText: payload.explanationText || '',
        },
      }

    case 'constrained_translation':
      return {
        ...baseExercise,
        skillType: 'meaning_recall',
        constrainedTranslationData: {
          sourceLanguageSentence: payload.sourceLanguageSentence || '',
          requiredTargetPattern: payload.requiredTargetPattern || '',
          patternName: '',
          acceptableAnswers: (answerKey?.acceptableAnswers as string[]) || (payload.acceptableAnswers as string[]) || [],
          disallowedShortcutForms: (answerKey?.disallowedShortcutForms as string[] | undefined) ?? (payload.disallowedShortcutForms as string[] | undefined),
          explanationText: payload.explanationText || '',
        },
      }

    case 'speaking':
      return {
        ...baseExercise,
        skillType: 'spoken_production',
        speakingData: {
          promptText: payload.promptText || '',
          targetPatternOrScenario: payload.targetPatternOrScenario,
        },
      }

    default:
      return baseExercise
  }
}

function orderQueue(queue: SessionQueueItem[]): SessionQueueItem[] {
  if (queue.length <= 1) return queue

  const recognition = queue.filter(q => q.exerciseItem.exerciseType === 'recognition_mcq')
  const rest = queue.filter(q => q.exerciseItem.exerciseType !== 'recognition_mcq')

  const ordered: SessionQueueItem[] = []
  // Put up to 2 recognition MCQs first for an easy start
  const leadRecognition = recognition.splice(0, Math.min(2, recognition.length))
  ordered.push(...leadRecognition)

  // Preserve the relative order of remaining items (due-date order is already set upstream)
  // Append remaining recognition items followed by the rest in their original order
  const remaining = [...recognition, ...rest]
  ordered.push(...remaining)

  return ordered
}
