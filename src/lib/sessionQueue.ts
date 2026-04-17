// src/lib/sessionQueue.ts
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  LearnerItemState, LearnerSkillState,
  ExerciseItem, SessionQueueItem,
  LearnerGrammarState, GrammarPatternWithLesson,
} from '@/types/learning'
import type { ExerciseVariant } from '@/types/learning'
import { getSemanticGroup } from '@/lib/semanticGroups'

export type SessionMode = 'standard' | 'backlog_clear' | 'quick'

// Fraction of the session filled with grammar exercises.
// backlog_clear and quick modes exclude grammar entirely.
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
  const sessionMode: SessionMode = (['standard', 'backlog_clear', 'quick'].includes(input.sessionMode ?? ''))
    ? input.sessionMode as SessionMode
    : 'standard'
  const effectiveSessionSize = sessionMode === 'quick' ? 5 : input.preferredSessionSize
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
  const gatedNew = sessionMode === 'backlog_clear'
    ? []
    : sortByLessonOrder(newItems, input.contextsByItem, input.lessonOrder)

  // 5. Determine grammar slot count (0 for backlog_clear and quick)
  const grammarSlots = (sessionMode === 'standard')
    ? Math.max(1, Math.round(effectiveSessionSize * GRAMMAR_SESSION_RATIO))
    : 0

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

  return interleaved.slice(0, effectiveSessionSize)
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

function filterEligible(input: SessionBuildInput): LearningItem[] {
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
    if (meanings.some(m => m.translation_language === input.userLanguage)) return true
    const contexts = input.contextsByItem[i.id] ?? []
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
  userLanguage: 'en' | 'nl' = 'en',
  allItems: LearningItem[] = [],
): ExerciseItem[] {
  const { item, state, targetSkillType } = candidate
  const meanings = meaningsByItem[item.id] ?? []
  const contexts = contextsByItem[item.id] ?? []
  const variants = variantsByItem[item.id] ?? []
  const stage = state?.stage ?? 'new'

  const exercises: ExerciseItem[] = []
  const isSentenceType = item.item_type === 'sentence' || item.item_type === 'dialogue_chunk'

  // Whether the item has a cloze-eligible context: must be context_type 'cloze' specifically.

  const hasAnchorContext = contexts.some(c => c.context_type === 'cloze')

  // If a specific skill is targeted (due items), serve the matching exercise directly.
  // This is the FSRS contract: if the scheduler says skill X is due, we review skill X —
  // not a randomly chosen skill that happens to share the same item.
  if (targetSkillType) {
    switch (targetSkillType) {
      case 'recognition':
        return [makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem)]
      case 'meaning_recall':
        return [makeMeaningRecall(item, meanings, contexts, variants)]
      case 'form_recall':
        if (hasAnchorContext && Math.random() < 0.5) {
          return [makeClozeExercise(item, meanings, contexts, variants)]
        }
        return [makeTypedRecall(item, meanings, contexts, variants)]
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
        if (roll < 0.25) {
          exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems))
        } else if (roll < 0.50) {
          exercises.push(makeMeaningRecall(item, meanings, contexts, variants))
        } else if (roll < 0.70) {
          exercises.push(makeClozeMcq(item, meanings, contexts, variants, allItems))
        } else {
          exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        }
      } else {
        if (roll < 0.30) {
          exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems))
        } else if (roll < 0.55) {
          exercises.push(makeMeaningRecall(item, meanings, contexts, variants))
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
        ? makeClozeMcq(item, meanings, contexts, variants, allItems)
        : makeClozeExercise(item, meanings, contexts, variants))
    } else {
      const roll = Math.random()
      if (hasAnchorContext && roll < 0.40) {
        exercises.push(makeClozeMcq(item, meanings, contexts, variants, allItems))
      } else if (roll < 0.65) {
        exercises.push(makeMeaningRecall(item, meanings, contexts, variants))
      } else if (hasAnchorContext && roll < 0.82) {
        exercises.push(makeClozeExercise(item, meanings, contexts, variants))
      } else {
        exercises.push(makeTypedRecall(item, meanings, contexts, variants))
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
          exercises.push(makeTypedRecall(item, meanings, contexts, variants))
        } else if (roll < 0.60 && hasAnchorContext) {
          exercises.push(makeClozeExercise(item, meanings, contexts, variants))
        } else if (roll < 0.80) {
          exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems))
        } else {
          exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
        }
      }
    }
  }

  return exercises
}

// Semantic groups for MCQ distractor selection moved to src/lib/semanticGroups.ts.

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Items that look structurally similar enough to be plausible distractors for each other.
// sentence and dialogue_chunk are both multi-sentence/long forms.
// word and phrase are both short forms — mixing them is fine.
// Never mix short (word/phrase) with long (sentence/dialogue_chunk).
const STRUCTURALLY_SIMILAR_TYPES: Record<string, string[]> = {
  word: ['word', 'phrase'],
  phrase: ['word', 'phrase'],
  sentence: ['sentence', 'dialogue_chunk'],
  dialogue_chunk: ['sentence', 'dialogue_chunk'],
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

  // Build candidate pool with type info for filtering
  const otherTranslations: Array<{ translation: string; level: string; itemType: string }> = allItems
    .filter(i => i.id !== item.id)
    .flatMap(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      return t && t !== correctAnswer ? [{ translation: t, level: i.level, itemType: i.item_type }] : []
    })

  const allowedTypes = STRUCTURALLY_SIMILAR_TYPES[item.item_type] ?? [item.item_type]
  const structuralPool = otherTranslations.filter(d => allowedTypes.includes(d.itemType))

  const correctGroup = getSemanticGroup(correctAnswer, userLanguage)

  // Priority 1: same structural shape + same semantic group
  const sameGroup = correctGroup
    ? shuffle(structuralPool.filter(d => getSemanticGroup(d.translation, userLanguage) === correctGroup).map(d => d.translation))
    : []
  // Priority 2: same structural shape + same level
  const sameLevel = shuffle(structuralPool.filter(d => d.level === item.level && !sameGroup.includes(d.translation)).map(d => d.translation))
  // Priority 3: same structural shape, any level
  const sameShape = shuffle(structuralPool.filter(d => !sameGroup.includes(d.translation) && !sameLevel.includes(d.translation)).map(d => d.translation))
  // Priority 4: full pool fallback (only reached if structural pool has fewer than 3 items)
  const fullFallback = shuffle(otherTranslations.filter(d => !sameGroup.includes(d.translation) && !sameLevel.includes(d.translation) && !sameShape.includes(d.translation)).map(d => d.translation))

  const distractors = [...sameGroup, ...sameLevel, ...sameShape, ...fullFallback].slice(0, 3)

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

function makeCuedRecall(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
): ExerciseItem {
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const promptMeaningText = primaryMeaning?.translation_text ?? ''

  const distractors = allItems
    .filter(i => i.id !== item.id && i.level === item.level)
    .map(i => i.base_text)
    .filter(Boolean)

  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]]
  }

  const options = shuffle([item.base_text, ...distractors.slice(0, 3)])

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
  allItems: LearningItem[],
): ExerciseItem {
  const clozeContext = contexts.find(c => c.context_type === 'cloze')

  const distractors = allItems
    .filter(i => i.id !== item.id && i.level === item.level)
    .map(i => i.base_text)
    .filter(Boolean)

  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]]
  }

  const options = shuffle([item.base_text, ...distractors.slice(0, 3)])

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
