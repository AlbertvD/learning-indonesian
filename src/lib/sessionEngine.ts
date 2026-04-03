// src/lib/sessionEngine.ts
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  LearnerItemState, LearnerSkillState,
  ExerciseItem, SessionQueueItem,
} from '@/types/learning'
import { getRetrievability } from '@/lib/fsrs'

export interface SessionBuildInput {
  allItems: LearningItem[]
  meaningsByItem: Record<string, ItemMeaning[]>
  contextsByItem: Record<string, ItemContext[]>
  variantsByItem: Record<string, ItemAnswerVariant[]>
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
  category: 'due' | 'weak' | 'new'
  priority: number
}

/**
 * Build a session queue from the learning item pool.
 */
export function buildSessionQueue(input: SessionBuildInput): SessionQueueItem[] {
  const { allItems, meaningsByItem, contextsByItem, variantsByItem, itemStates, skillStates, preferredSessionSize, lessonFilter, userLanguage } = input

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
    const hasOnlyRecognition = skills.length === 1 && skills[0].skill_type === 'recognition' && state.stage !== 'anchoring'
    if (hasHighLapses || hasOnlyRecognition) {
      weakItems.push({ item, state, skills, category: 'weak', priority: hasHighLapses ? 1 : 0.5 })
    }
  }

  // Sort by priority (highest first)
  dueItems.sort((a, b) => b.priority - a.priority)
  weakItems.sort((a, b) => b.priority - a.priority)

  // Calculate slot allocation
  const dueCount = dueItems.length
  const dueSlots = Math.round(preferredSessionSize * 0.55)
  const weakSlots = Math.round(preferredSessionSize * 0.15)
  const newSlots = calculateNewSlots(dueCount, preferredSessionSize)

  // Pick items for each category
  const pickedDue = dueItems.slice(0, dueSlots)
  const pickedWeak = weakItems.slice(0, weakSlots)
  const pickedNew = newItems.slice(0, newSlots)

  // Build exercise items from picked candidates
  const queue: SessionQueueItem[] = []

  for (const candidate of [...pickedDue, ...pickedWeak]) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, userLanguage, eligibleItems)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: candidate.skills.find(s => s.skill_type === exercise.skillType) ?? null,
      })
    }
  }

  for (const candidate of pickedNew) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, userLanguage, eligibleItems)
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

function calculateNewSlots(dueCount: number, sessionSize: number): number {
  // On first run with no due items, allow full session of new items
  if (dueCount === 0) return sessionSize
  // With few due items, limit new items to avoid overwhelming user
  if (dueCount > 40) return 0
  if (dueCount > 20) return Math.min(2, Math.round(sessionSize * 0.15))
  return Math.round(sessionSize * 0.15)
}

function selectExercises(
  candidate: CandidateItem,
  meaningsByItem: Record<string, ItemMeaning[]>,
  contextsByItem: Record<string, ItemContext[]>,
  variantsByItem: Record<string, ItemAnswerVariant[]>,
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
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
    if (isSentenceType) {
      exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
    } else {
      // Alternate between recognition and recall for variety
      const preferRecall = Math.random() > 0.4
      if (preferRecall) {
        exercises.push(makeTypedRecall(item, meanings, contexts, variants))
      } else {
        exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
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

function orderQueue(queue: SessionQueueItem[]): SessionQueueItem[] {
  if (queue.length <= 1) return queue

  // Simple ordering: put recognition MCQ first (easy wins), then interleave
  const recognition = queue.filter(q => q.exerciseItem.exerciseType === 'recognition_mcq')
  const recall = queue.filter(q => q.exerciseItem.exerciseType === 'typed_recall')
  const cloze = queue.filter(q => q.exerciseItem.exerciseType === 'cloze')

  const ordered: SessionQueueItem[] = []

  // Start with 1-2 recognition items for momentum
  ordered.push(...recognition.splice(0, Math.min(2, recognition.length)))

  // Interleave remaining
  const remaining = [...recognition, ...recall, ...cloze].sort(() => Math.random() - 0.5)
  ordered.push(...remaining)

  return ordered
}
