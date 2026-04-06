// src/lib/sessionEngine.ts
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  LearnerItemState, LearnerSkillState,
  ExerciseItem, SessionQueueItem,
} from '@/types/learning'
import type { ExerciseVariant } from '@/types/contentGeneration'
import { getRetrievability } from '@/lib/fsrs'

export type SessionMode = 'standard' | 'backlog_clear' | 'recall_sprint' | 'push_to_productive' | 'quick'

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
  // lessonId → order_index; when provided, new items are gated by lesson mastery
  lessonOrder?: Record<string, number>
  sessionMode?: SessionMode
}

// Fraction of a lesson's items that must reach 'retrieving' (or higher) before
// new items from the next lesson are introduced.
const LESSON_MASTERY_THRESHOLD = 0.70

// Stages considered "mastered" for the purpose of lesson gating.
const MASTERED_STAGES = new Set(['retrieving', 'productive', 'maintenance'])

interface CandidateItem {
  item: LearningItem
  state: LearnerItemState | null
  skills: LearnerSkillState[]
  category: 'due' | 'anchoring' | 'weak' | 'new'
  priority: number
}

// Fraction of the session that can be new items when reviews are present.
// Scales with session size so a user who wants 25 words gets more new items
// than one who wants 10.
const NEW_ITEMS_FRACTION = 0.25  // e.g. 6 new items in a 25-word session

/**
 * Build a session queue from the learning item pool.
 */
export function buildSessionQueue(input: SessionBuildInput): SessionQueueItem[] {
  const { allItems, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, itemStates, skillStates, preferredSessionSize, lessonFilter, userLanguage, lessonOrder } = input
  const sessionMode = input.sessionMode ?? 'standard'

  // quick mode uses a fixed small session size to reduce friction
  const effectiveSessionSize = sessionMode === 'quick' ? 5 : preferredSessionSize

  // Filter items by lesson if scoped
  let eligibleItems = allItems
  if (lessonFilter) {
    const lessonItemIds = new Set<string>()
    for (const [itemId, contexts] of Object.entries(contextsByItem)) {
      if (contexts.some(c => c.source_lesson_id === lessonFilter)) {
        lessonItemIds.add(itemId)
      }
    }
    eligibleItems = allItems.filter(i => lessonItemIds.has(i.id))
  }

  // Filter to items that have meanings in the user's language
  eligibleItems = eligibleItems.filter(i => {
    const meanings = meaningsByItem[i.id] ?? []
    return meanings.some(m => m.translation_language === userLanguage)
  })

  // recall_sprint: restrict to items that have a form_recall skill.
  // New and anchoring items produce recognition-only exercises and cannot
  // improve recall quality, so they are excluded.
  if (sessionMode === 'recall_sprint') {
    eligibleItems = eligibleItems.filter(item => {
      const state = itemStates[item.id]
      if (!state || state.stage === 'anchoring') return false
      const skills = skillStates[item.id] ?? []
      return skills.some(s => s.skill_type === 'form_recall')
    })
  }

  // Categorize items
  const now = new Date()
  const dueItems: CandidateItem[] = []
  const anchoringItems: CandidateItem[] = []  // seen but not yet stable — always reinforce
  const weakItems: CandidateItem[] = []
  const newItems: CandidateItem[] = []

  for (const item of eligibleItems) {
    const state = itemStates[item.id] ?? null
    const skills = skillStates[item.id] ?? []

    if (!state || state.stage === 'new') {
      newItems.push({ item, state, skills, category: 'new', priority: 0 })
      continue
    }

    if (state.suspended) continue

    // Anchoring items: just introduced, not yet stable.
    // Always reinforce regardless of FSRS due date — they haven't been seen
    // enough times to survive a gap. Overdue anchoring items get higher priority.
    if (state.stage === 'anchoring') {
      const isOverdue = skills.some(s => s.next_due_at && new Date(s.next_due_at) <= now)
      anchoringItems.push({ item, state, skills, category: 'anchoring', priority: isOverdue ? 1 : 0.6 })
      continue
    }

    // recall_sprint: force all eligible items into dueItems regardless of due date.
    // The eligibleItems filter guarantees these items have a form_recall skill.
    if (sessionMode === 'recall_sprint') {
      const minRetrievability = skills.length > 0
        ? Math.min(...skills.filter(s => s.skill_type === 'form_recall').map(s =>
            s.last_reviewed_at ? getRetrievability(s.stability, new Date(s.last_reviewed_at)) : 1
          ))
        : 1
      dueItems.push({ item, state, skills, category: 'due', priority: 1 - minRetrievability })
      continue
    }

    // push_to_productive: force retrieving-stage items that have a form_recall skill
    // into dueItems regardless of due date. Higher stability = closer to graduating =
    // higher priority. Items with only recognition skill are excluded — typed_recall
    // exercises would have no matching learnerSkillState for scoring.
    if (sessionMode === 'push_to_productive' && state.stage === 'retrieving') {
      const hasRecallSkill = skills.some(s => s.skill_type === 'form_recall')
      if (!hasRecallSkill) continue
      const maxStability = Math.max(...skills.map(s => s.stability))
      dueItems.push({ item, state, skills, category: 'due', priority: maxStability / 20 })
      continue
    }

    // Check if any skill is due
    const dueSkills = skills.filter(s => s.next_due_at && new Date(s.next_due_at) <= now)
    if (dueSkills.length > 0) {
      // Priority: lowest retrievability = most overdue
      const minRetrievability = Math.min(...dueSkills.map(s =>
        s.last_reviewed_at ? getRetrievability(s.stability, new Date(s.last_reviewed_at)) : 1
      ))
      dueItems.push({ item, state, skills, category: 'due', priority: 1 - minRetrievability })
    }

    // Weak items: high lapse count or only recognition (no recall skill yet)
    const hasHighLapses = skills.some(s => s.lapse_count >= 3)
    const hasOnlyRecognition = skills.length === 1 && skills[0].skill_type === 'recognition'
    if (hasHighLapses || hasOnlyRecognition) {
      weakItems.push({ item, state, skills, category: 'weak', priority: hasHighLapses ? 1 : 0.5 })
    }
  }

  // Sort by priority (highest first)
  dueItems.sort((a, b) => b.priority - a.priority)
  anchoringItems.sort((a, b) => b.priority - a.priority)
  weakItems.sort((a, b) => b.priority - a.priority)

  // Gate new items by lesson mastery: sort by lesson order and drop items from
  // lessons that haven't been unlocked yet.
  const gatedNewItems = lessonOrder
    ? applyLessonGate(newItems, eligibleItems, itemStates, contextsByItem, lessonOrder)
    : newItems

  // Slot allocation — adjusted by session mode
  // backlog_clear: maximise due reviews, zero anchoring, zero weak, zero new
  const dueSlots = (sessionMode === 'backlog_clear')
    ? effectiveSessionSize
    : Math.round(effectiveSessionSize * 0.55)
  const anchoringSlots = (sessionMode === 'backlog_clear')
    ? 0
    : Math.round(effectiveSessionSize * 0.20)
  const weakSlots = (sessionMode === 'backlog_clear')
    ? 0
    : Math.round(effectiveSessionSize * 0.10)

  const pickedDue = dueItems.slice(0, dueSlots)
  const pickedAnchoring = anchoringItems.slice(0, anchoringSlots)
  const pickedWeak = weakItems.slice(0, weakSlots)

  const reviewsFilled = pickedDue.length + pickedAnchoring.length + pickedWeak.length
  const newSlots = (sessionMode === 'backlog_clear' || sessionMode === 'recall_sprint' || sessionMode === 'push_to_productive')
    ? 0
    : calculateNewSlots(dueItems.length, anchoringItems.length, reviewsFilled, effectiveSessionSize)
  const pickedNew = gatedNewItems.slice(0, newSlots)

  // Build exercise items from picked candidates
  const queue: SessionQueueItem[] = []

  for (const candidate of [...pickedDue, ...pickedAnchoring, ...pickedWeak]) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, userLanguage, eligibleItems, sessionMode)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: candidate.skills.find(s => s.skill_type === exercise.skillType) ?? null,
      })
    }
  }

  for (const candidate of pickedNew) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, userLanguage, eligibleItems, sessionMode)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: null,
      })
    }
  }

  // Trim to session size
  const trimmed = queue.slice(0, effectiveSessionSize)

  // Apply ordering rules: interleave types, start with easy, delay new items
  return orderQueue(trimmed)
}

/**
 * Filter and sort new items so that:
 * 1. Items from lower-order lessons come first.
 * 2. Items from lesson N+1 are only included once lesson N has reached
 *    LESSON_MASTERY_THRESHOLD (fraction of its items at 'retrieving' or higher).
 *
 * Items already in progress (anchoring/retrieving/etc.) from any lesson are
 * never filtered — the gate only controls NEW item introduction.
 */
function applyLessonGate(
  newItems: CandidateItem[],
  allEligibleItems: LearningItem[],
  itemStates: Record<string, LearnerItemState>,
  contextsByItem: Record<string, ItemContext[]>,
  lessonOrder: Record<string, number>,
): CandidateItem[] {
  // Build itemId → lesson order_index (use lowest order if item spans lessons)
  const itemLessonOrder = (itemId: string): number => {
    const contexts = contextsByItem[itemId] ?? []
    const orders = contexts
      .map(c => c.source_lesson_id ? (lessonOrder[c.source_lesson_id] ?? 9999) : 9999)
    return orders.length > 0 ? Math.min(...orders) : 9999
  }

  // Compute mastery for each lesson: fraction of eligible items at a mastered stage
  const lessonItems: Record<number, string[]> = {}  // orderIndex → itemIds
  for (const item of allEligibleItems) {
    const order = itemLessonOrder(item.id)
    if (!lessonItems[order]) lessonItems[order] = []
    lessonItems[order].push(item.id)
  }

  const masteryByOrder: Record<number, number> = {}
  for (const [orderStr, itemIds] of Object.entries(lessonItems)) {
    const order = Number(orderStr)
    if (itemIds.length === 0) { masteryByOrder[order] = 1; continue }
    const mastered = itemIds.filter(id => {
      const stage = itemStates[id]?.stage
      return stage ? MASTERED_STAGES.has(stage) : false
    }).length
    masteryByOrder[order] = mastered / itemIds.length
  }

  // Determine the highest lesson order whose new items are unlocked.
  // Lesson 1 is always unlocked. Each subsequent lesson requires the previous
  // one to have reached LESSON_MASTERY_THRESHOLD.
  const sortedOrders = Object.keys(lessonItems).map(Number).sort((a, b) => a - b)
  let maxUnlockedOrder = sortedOrders[0] ?? 1  // always unlock the first lesson
  for (let i = 1; i < sortedOrders.length; i++) {
    const prev = sortedOrders[i - 1]
    if ((masteryByOrder[prev] ?? 0) >= LESSON_MASTERY_THRESHOLD) {
      maxUnlockedOrder = sortedOrders[i]
    } else {
      break  // stop at first locked lesson
    }
  }

  // Filter to items from unlocked lessons, sorted by lesson order then original order
  return newItems
    .filter(c => itemLessonOrder(c.item.id) <= maxUnlockedOrder)
    .sort((a, b) => itemLessonOrder(a.item.id) - itemLessonOrder(b.item.id))
}

function calculateNewSlots(
  dueCount: number,
  anchoringCount: number,
  reviewsFilled: number,
  sessionSize: number,
): number {
  // Heavy review load: skip new items entirely
  if (dueCount > 40) return 0

  const remainingCapacity = sessionSize - reviewsFilled

  // Nothing to review at all (fresh start or full reset): fill the session
  // with new items so the user gets their target number of items.
  if (dueCount === 0 && anchoringCount === 0) return remainingCapacity

  // Reviews are present: cap new items as a fraction of the session size
  // (scales with preference — 6 new items for 25-word session vs 3 for 10-word)
  // but never exceed remaining capacity.
  const cap = Math.max(3, Math.round(sessionSize * NEW_ITEMS_FRACTION))
  return Math.min(cap, remainingCapacity)
}

function selectExercises(
  candidate: CandidateItem,
  meaningsByItem: Record<string, ItemMeaning[]>,
  contextsByItem: Record<string, ItemContext[]>,
  variantsByItem: Record<string, ItemAnswerVariant[]>,
  exerciseVariantsByContext?: Record<string, ExerciseVariant[]>,
  userLanguage: 'en' | 'nl' = 'en',
  allItems: LearningItem[] = [],
  sessionMode: SessionMode = 'standard',
): ExerciseItem[] {
  const { item, state } = candidate
  const meanings = meaningsByItem[item.id] ?? []
  const contexts = contextsByItem[item.id] ?? []
  const variants = variantsByItem[item.id] ?? []
  const stage = state?.stage ?? 'new'

  const exercises: ExerciseItem[] = []
  const isSentenceType = item.item_type === 'sentence' || item.item_type === 'dialogue_chunk'

  // recall_sprint / quick: force recall exercise type.
  // quick mode only applies recall-biasing to items that already have a form_recall
  // skill (retrieving+); new and anchoring items fall through to recognition MCQ.
  const hasRecallSkill = candidate.skills.some(s => s.skill_type === 'form_recall')
  if (sessionMode === 'recall_sprint' || (sessionMode === 'quick' && hasRecallSkill && stage !== 'new' && stage !== 'anchoring')) {
    if (isSentenceType) {
      return [makeClozeExercise(item, meanings, contexts, variants)]
    }
    return [makeTypedRecall(item, meanings, contexts, variants)]
  }

  // Whether the item has a usable context sentence for cloze (anchor context counts)
  const hasAnchorContext = contexts.some(c => c.is_anchor_context || c.context_type === 'cloze')

  // Determine which exercises are appropriate for this stage
  if (stage === 'new' || stage === 'anchoring') {
    // New items: always start with forward recognition (Indonesian → translation).
    // Anchoring items: mix in cued_recall (translation → pick Indonesian) ~35% of
    // the time so the reverse direction gets tested before the item graduates.
    if (stage === 'anchoring' && Math.random() < 0.35) {
      exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems))
    } else {
      exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
    }
  } else if (stage === 'retrieving') {
    if (isSentenceType) {
      exercises.push(makeClozeExercise(item, meanings, contexts, variants))
    } else if (hasAnchorContext && Math.random() > 0.5) {
      // Word items with a context sentence: alternate between cloze and typed recall
      // to vary the recall surface without changing the skill being scored.
      exercises.push(makeClozeExercise(item, meanings, contexts, variants))
    } else {
      exercises.push(makeTypedRecall(item, meanings, contexts, variants))
    }
  } else {
    // productive / maintenance: rotate across all available exercise types.
    if (isSentenceType) {
      exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
    } else {
      // Check if there are published variants for this item's contexts
      const hasPublishedVariants = contexts.some(ctx => (exerciseVariantsByContext?.[ctx.id] ?? []).length > 0)

      if (hasPublishedVariants) {
        // Prefer published variants (contrast_pair, sentence_transformation, constrained_translation)
        for (const context of contexts) {
          const publishedVariants = exerciseVariantsByContext?.[context.id] ?? []
          if (publishedVariants.length > 0) {
            const variant = publishedVariants[Math.floor(Math.random() * publishedVariants.length)]
            exercises.push(makePublishedExercise(item, meanings, context, variant))
            break
          }
        }
      }

      // Fallback: rotate between typed_recall, cloze, cued_recall, and recognition_mcq
      // so productive/maintenance sessions stay varied without published variants.
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

  // Build distractors from other items at same level
  const distractors = allItems
    .filter(i => i.id !== item.id && i.level === item.level)
    .map(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      return (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
    })
    .filter((d): d is string => d != null && d !== correctAnswer)

  // Fisher-Yates shuffle and take 3
  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]]
  }

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'recognition_mcq',
    distractors: distractors.slice(0, 3),
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

  // Distractors: Indonesian base_text from other items at the same level
  const distractors = allItems
    .filter(i => i.id !== item.id && i.level === item.level)
    .map(i => i.base_text)
    .filter(Boolean)

  // Fisher-Yates shuffle and take 3
  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]]
  }

  // Include the correct answer among 4 shuffled options
  const options = [item.base_text, ...distractors.slice(0, 3)].sort(() => Math.random() - 0.5)

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'cued_recall',
    cuedRecallData: {
      promptMeaningText,
      options,
      correctOptionId: item.base_text,
    },
  }
}

function makeClozeExercise(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
): ExerciseItem {
  // Find a cloze-type context, or use an anchor context
  const clozeContext = contexts.find(c => c.context_type === 'cloze')
    ?? contexts.find(c => c.is_anchor_context)

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

function makePublishedExercise(
  item: LearningItem,
  meanings: ItemMeaning[],
  context: ItemContext,
  variant: ExerciseVariant,
): ExerciseItem {
  const exerciseType = variant.exercise_type as
    | 'contrast_pair'
    | 'sentence_transformation'
    | 'constrained_translation'
    | 'speaking'

  const payload = variant.payload_json

  const baseExercise: ExerciseItem = {
    learningItem: item,
    meanings,
    contexts: [context],
    answerVariants: [],
    skillType: 'form_recall', // Placeholder; actual will be determined by type
    exerciseType: exerciseType,
  }

  // Map published variant payload to exercise-specific data
  switch (exerciseType) {
    case 'contrast_pair':
      return {
        ...baseExercise,
        skillType: 'recognition',
        contrastPairData: {
          promptText: payload.promptText || '',
          targetMeaning: payload.targetMeaning || '',
          options: payload.options || ['', ''],
          correctOptionId: payload.correctOptionId || '0',
          explanationText: payload.explanationText || '',
        },
      }

    case 'sentence_transformation':
      return {
        ...baseExercise,
        skillType: 'form_recall',
        sentenceTransformationData: {
          sourceSentence: payload.sourceSentence || '',
          transformationInstruction: payload.transformationInstruction || '',
          acceptableAnswers: payload.acceptableAnswers || [],
          hintText: payload.hintText,
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
          acceptableAnswers: payload.acceptableAnswers || [],
          disallowedShortcutForms: payload.disallowedShortcutForms,
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

  // Put 1-2 recognition MCQs first for an easy start, then shuffle the rest
  const recognition = queue.filter(q => q.exerciseItem.exerciseType === 'recognition_mcq')
  const rest = queue.filter(q => q.exerciseItem.exerciseType !== 'recognition_mcq')

  const ordered: SessionQueueItem[] = []
  ordered.push(...recognition.splice(0, Math.min(2, recognition.length)))

  const remaining = [...recognition, ...rest].sort(() => Math.random() - 0.5)
  ordered.push(...remaining)

  return ordered
}
