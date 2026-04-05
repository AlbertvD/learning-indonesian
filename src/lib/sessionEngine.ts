// src/lib/sessionEngine.ts
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  LearnerItemState, LearnerSkillState,
  ExerciseItem, SessionQueueItem,
} from '@/types/learning'
import type { ExerciseVariant } from '@/types/contentGeneration'
import { getRetrievability } from '@/lib/fsrs'

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
}

interface CandidateItem {
  item: LearningItem
  state: LearnerItemState | null
  skills: LearnerSkillState[]
  category: 'due' | 'anchoring' | 'weak' | 'new'
  priority: number
}

// Maximum new items introduced per session regardless of how many are due.
// Keeping this low ensures recently-introduced items get reinforced before
// new vocabulary is piled on top.
const MAX_NEW_ITEMS_PER_SESSION = 3

/**
 * Build a session queue from the learning item pool.
 */
export function buildSessionQueue(input: SessionBuildInput): SessionQueueItem[] {
  const { allItems, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, itemStates, skillStates, preferredSessionSize, lessonFilter, userLanguage } = input

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

  // Slot allocation for a session:
  //   55% due reviews  (FSRS-scheduled)
  //   20% anchoring    (recently introduced, always reinforce)
  //   10% weak         (high lapses or recognition-only)
  //   ≤3  new items    (hard cap — don't pile on before old items are stable)
  const dueSlots = Math.round(preferredSessionSize * 0.55)
  const anchoringSlots = Math.round(preferredSessionSize * 0.20)
  const weakSlots = Math.round(preferredSessionSize * 0.10)
  const newSlots = calculateNewSlots(dueItems.length, anchoringItems.length, preferredSessionSize)

  const pickedDue = dueItems.slice(0, dueSlots)
  const pickedAnchoring = anchoringItems.slice(0, anchoringSlots)
  const pickedWeak = weakItems.slice(0, weakSlots)
  const pickedNew = newItems.slice(0, newSlots)

  // Build exercise items from picked candidates
  const queue: SessionQueueItem[] = []

  for (const candidate of [...pickedDue, ...pickedAnchoring, ...pickedWeak]) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, userLanguage, eligibleItems)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: candidate.skills.find(s => s.skill_type === exercise.skillType) ?? null,
      })
    }
  }

  for (const candidate of pickedNew) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, userLanguage, eligibleItems)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: null,
      })
    }
  }

  // Trim to session size
  const trimmed = queue.slice(0, preferredSessionSize)

  // Apply ordering rules: interleave types, start with easy, delay new items
  return orderQueue(trimmed)
}

function calculateNewSlots(dueCount: number, anchoringCount: number, sessionSize: number): number {
  // If there's nothing at all (truly first session), allow a small intro batch
  if (dueCount === 0 && anchoringCount === 0) return Math.min(MAX_NEW_ITEMS_PER_SESSION, sessionSize)
  // When already carrying many due items, don't introduce new ones
  if (dueCount > 40) return 0
  // Otherwise hard cap: never introduce more than MAX_NEW_ITEMS_PER_SESSION at once
  return MAX_NEW_ITEMS_PER_SESSION
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
  const { item, state } = candidate
  const meanings = meaningsByItem[item.id] ?? []
  const contexts = contextsByItem[item.id] ?? []
  const variants = variantsByItem[item.id] ?? []
  const stage = state?.stage ?? 'new'

  const exercises: ExerciseItem[] = []
  const isSentenceType = item.item_type === 'sentence' || item.item_type === 'dialogue_chunk'

  // Determine which exercises are appropriate for this stage
  if (stage === 'new' || stage === 'anchoring') {
    // Recognition MCQ only
    exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
  } else if (stage === 'retrieving') {
    if (isSentenceType) {
      exercises.push(makeClozeExercise(item, meanings, contexts, variants))
    } else {
      exercises.push(makeTypedRecall(item, meanings, contexts, variants))
    }
  } else {
    // productive / maintenance: any exercise type
    // Try to use published variants for grammar-aware types
    if (isSentenceType) {
      exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
    } else {
      // Check if there are published variants for this item's contexts
      const hasPublishedVariants = contexts.some(ctx => (exerciseVariantsByContext?.[ctx.id] ?? []).length > 0)

      if (hasPublishedVariants) {
        // Prefer published variants (contrast_pair, sentence_transformation, constrained_translation)
        // Pick a random published variant
        for (const context of contexts) {
          const publishedVariants = exerciseVariantsByContext?.[context.id] ?? []
          if (publishedVariants.length > 0) {
            const variant = publishedVariants[Math.floor(Math.random() * publishedVariants.length)]
            exercises.push(makePublishedExercise(item, meanings, context, variant))
            break // Use first context with variants
          }
        }
      }

      // Fall back to live content if no published variants
      if (exercises.length === 0) {
        const preferRecall = Math.random() > 0.4
        if (preferRecall) {
          exercises.push(makeTypedRecall(item, meanings, contexts, variants))
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
  const shuffled = distractors.slice(0, 3)

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'recognition_mcq',
    distractors: shuffled,
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
