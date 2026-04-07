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
  dailyNewItemsLimit: number
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
  category: 'due' | 'anchoring' | 'new'
  priority: number
}

/**
 * Build a session queue from the learning item pool.
 */
export function buildSessionQueue(input: SessionBuildInput): SessionQueueItem[] {
  const { allItems, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, itemStates, skillStates, preferredSessionSize, dailyNewItemsLimit, lessonFilter, userLanguage, lessonOrder } = input
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

  // Filter to items that have meanings in the user's language.
  // Exception: items with published exercise variants (grammar exercises) carry
  // all content in their payload — they don't need meanings to render.
  eligibleItems = eligibleItems.filter(i => {
    const meanings = meaningsByItem[i.id] ?? []
    if (meanings.some(m => m.translation_language === userLanguage)) return true
    // Check if any context has a published exercise variant
    const contexts = contextsByItem[i.id] ?? []
    return contexts.some(ctx => (exerciseVariantsByContext?.[ctx.id] ?? []).length > 0)
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
  const newItems: CandidateItem[] = []

  for (const item of eligibleItems) {
    const state = itemStates[item.id] ?? null
    const skills = skillStates[item.id] ?? []

    if (!state || state.stage === 'new') {
      newItems.push({ item, state, skills, category: 'new', priority: 0 })
      continue
    }

    if (state.suspended) continue

    // Anchoring items: just introduced, not yet stable (analogous to FSRS learning steps).
    // Respect next_due_at — only include when due, same as any other item.
    // Priority by retrievability so the most-forgotten anchoring items come first.
    if (state.stage === 'anchoring') {
      const dueSkills = skills.filter(s => s.next_due_at && new Date(s.next_due_at) <= now)
      if (dueSkills.length === 0) continue
      const minRetrievability = Math.min(...dueSkills.map(s =>
        s.last_reviewed_at ? getRetrievability(s.stability, new Date(s.last_reviewed_at)) : 1
      ))
      anchoringItems.push({ item, state, skills, category: 'anchoring', priority: 1 - minRetrievability })
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
  }

  // Sort by priority (highest first)
  dueItems.sort((a, b) => b.priority - a.priority)
  anchoringItems.sort((a, b) => b.priority - a.priority)

  // Gate new items by lesson mastery: sort by lesson order and drop items from
  // lessons that haven't been unlocked yet.
  const gatedNewItems = lessonOrder
    ? applyLessonGate(newItems, eligibleItems, itemStates, contextsByItem, lessonOrder)
    : newItems

  // Session composition — FSRS-aligned priority order:
  //   1. Anchoring items always appear (pre-FSRS reinforcement, like learning steps)
  //   2. All FSRS-due items (trust the algorithm's scheduling)
  //   3. New items up to dailyNewItemsLimit
  // Trim to effectiveSessionSize at the end, in priority order.
  //
  // Special modes:
  //   backlog_clear: due reviews only, clears overdue backlog without introducing new items
  //   recall_sprint / push_to_productive: no new items (dueItems already filtered to eligible set)

  let sessionCandidates: CandidateItem[]
  if (sessionMode === 'backlog_clear') {
    sessionCandidates = dueItems
  } else if (sessionMode === 'recall_sprint' || sessionMode === 'push_to_productive') {
    sessionCandidates = dueItems
  } else {
    const pickedNew = gatedNewItems.slice(0, dailyNewItemsLimit)
    sessionCandidates = [...anchoringItems, ...dueItems, ...pickedNew]
  }

  // Build exercise items from all candidates
  const queue: SessionQueueItem[] = []

  for (const candidate of sessionCandidates) {
    const exercises = selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, userLanguage, eligibleItems, sessionMode)
    for (const exercise of exercises) {
      queue.push({
        exerciseItem: exercise,
        learnerItemState: candidate.state,
        learnerSkillState: candidate.skills.find(s => s.skill_type === exercise.skillType) ?? null,
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

  // Whether the item has a cloze-eligible context: must be context_type 'cloze' specifically.
  // lesson_snippet contexts with is_anchor_context=true only contain the bare word as
  // source_text and are not suitable for generating cloze blanks.
  const hasAnchorContext = contexts.some(c => c.context_type === 'cloze')

  // Determine which exercises are appropriate for this stage
  if (stage === 'new' || stage === 'anchoring') {
    // New items: always start with forward recognition (Indonesian → translation).
    // Anchoring items: rotate across all MCQ formats. When a cloze context exists,
    // include cloze_mcq so learners see the word in sentence context early.
    //   With cloze context:    30% recognition_mcq | 25% cued_recall | 25% meaning_recall | 20% cloze_mcq
    //   Without cloze context: 45% recognition_mcq | 30% cued_recall | 25% meaning_recall
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
      // Sentences: lead with cloze_mcq, then progress to typed cloze
      exercises.push(Math.random() < 0.6
        ? makeClozeMcq(item, meanings, contexts, variants, allItems)
        : makeClozeExercise(item, meanings, contexts, variants))
    } else {
      // Words: cloze_mcq leads (if context exists), typed formats follow
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

// Semantic groups for MCQ distractor selection.
// Items in the same group are used as distractors to make the exercise harder.
// Each group is a list of keyword fragments; a translation matches if it contains any keyword.
const SEMANTIC_GROUPS_NL: Array<{ name: string; keywords: string[] }> = [
  { name: 'numbers', keywords: ['nul', 'één', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'twintig', 'dertig', 'veertig', 'vijftig', 'zestig', 'zeventig', 'tachtig', 'negentig', 'honderd', 'duizend', 'nummer', 'getal'] },
  { name: 'greetings', keywords: ['goedemorgen', 'goedemiddag', 'goedenavond', 'goedenacht', 'goedendag', 'hallo', 'hoi', 'dag', 'welkom', 'tot ziens', 'doei', 'hoe gaat het', 'hoe maakt u het'] },
  { name: 'food', keywords: ['rijst', 'kip', 'vlees', 'vis', 'groente', 'fruit', 'saté', 'nasi', 'brood', 'soep', 'noedel', 'tempeh', 'tofu', 'ei', 'maaltijd', 'eten', 'drinken', 'water', 'koffie', 'thee', 'melk', 'sap', 'bier', 'wijn'] },
  { name: 'transport', keywords: ['auto', 'fiets', 'motor', 'bus', 'trein', 'taxi', 'vliegtuig', 'boot', 'vliegveld', 'station', 'rijden', 'vliegen', 'varen'] },
  { name: 'places', keywords: ['huis', 'school', 'restaurant', 'kantoor', 'winkel', 'markt', 'ziekenhuis', 'hotel', 'strand', 'stad', 'dorp', 'land', 'straat', 'gebouw', 'bank', 'bibliotheek', 'kerk', 'moskee', 'park'] },
  { name: 'household', keywords: ['bed', 'stoel', 'tafel', 'kast', 'deur', 'raam', 'bord', 'lepel', 'vork', 'mes', 'glas', 'kop', 'pan', 'zeep', 'handdoek', 'spiegel', 'lamp', 'boek', 'pen', 'sleutel'] },
  { name: 'family', keywords: ['vader', 'moeder', 'broer', 'zus', 'kind', 'zoon', 'dochter', 'opa', 'oma', 'oom', 'tante', 'neef', 'nicht', 'man', 'vrouw', 'vriend', 'vriendin', 'echtgenoot', 'echtgenote', 'familie', 'gezin'] },
  { name: 'question_words', keywords: ['wat?', 'wie?', 'waar?', 'wanneer?', 'waarom?', 'hoe?', 'hoeveel?', 'welk?', 'welke?'] },
  { name: 'colors', keywords: ['rood', 'blauw', 'groen', 'geel', 'zwart', 'wit', 'bruin', 'oranje', 'paars', 'roze', 'grijs', 'kleur'] },
  { name: 'body', keywords: ['hoofd', 'oog', 'oor', 'neus', 'mond', 'tand', 'tong', 'hals', 'arm', 'hand', 'vinger', 'been', 'voet', 'teen', 'buik', 'rug', 'hart', 'lichaam'] },
  { name: 'time', keywords: ['dag', 'nacht', 'ochtend', 'middag', 'avond', 'week', 'maand', 'jaar', 'uur', 'minuut', 'seconde', 'gisteren', 'vandaag', 'morgen', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag', 'januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'] },
  { name: 'pronouns', keywords: ['ik', 'jij', 'hij', 'zij', 'wij', 'jullie', 'zij ', 'mij', 'jou', 'hem', 'haar', 'ons', 'hen', 'zelf'] },
  { name: 'adjectives_size', keywords: ['groot', 'klein', 'lang', 'kort', 'breed', 'smal', 'hoog', 'laag', 'dik', 'dun', 'zwaar', 'licht'] },
  { name: 'adjectives_quality', keywords: ['goed', 'slecht', 'mooi', 'lelijk', 'schoon', 'vies', 'nieuw', 'oud', 'snel', 'langzaam', 'goedkoop', 'duur', 'makkelijk', 'moeilijk', 'warm', 'koud'] },
  { name: 'politeness', keywords: ['alstublieft', 'dank u wel', 'bedankt', 'sorry', 'pardon', 'graag', 'excuseer'] },
]

const SEMANTIC_GROUPS_EN: Array<{ name: string; keywords: string[] }> = [
  { name: 'numbers', keywords: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'number', 'digit'] },
  { name: 'greetings', keywords: ['good morning', 'good afternoon', 'good evening', 'good night', 'hello', 'hi', 'goodbye', 'welcome', 'see you', 'how are you'] },
  { name: 'food', keywords: ['rice', 'chicken', 'meat', 'fish', 'vegetable', 'fruit', 'satay', 'bread', 'soup', 'noodle', 'tempeh', 'tofu', 'egg', 'meal', 'eat', 'drink', 'water', 'coffee', 'tea', 'milk', 'juice', 'beer', 'wine'] },
  { name: 'transport', keywords: ['car', 'bicycle', 'bike', 'motorcycle', 'bus', 'train', 'taxi', 'airplane', 'boat', 'airport', 'station', 'drive', 'fly', 'sail'] },
  { name: 'places', keywords: ['house', 'home', 'school', 'restaurant', 'office', 'shop', 'store', 'market', 'hospital', 'hotel', 'beach', 'city', 'village', 'country', 'street', 'building', 'bank', 'library', 'church', 'mosque', 'park'] },
  { name: 'household', keywords: ['bed', 'chair', 'table', 'cupboard', 'door', 'window', 'plate', 'spoon', 'fork', 'knife', 'glass', 'cup', 'pan', 'soap', 'towel', 'mirror', 'lamp', 'book', 'pen', 'key'] },
  { name: 'family', keywords: ['father', 'mother', 'brother', 'sister', 'child', 'son', 'daughter', 'grandfather', 'grandmother', 'uncle', 'aunt', 'cousin', 'husband', 'wife', 'friend', 'family'] },
  { name: 'question_words', keywords: ['what?', 'who?', 'where?', 'when?', 'why?', 'how?', 'how many?', 'which?'] },
  { name: 'colors', keywords: ['red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'orange', 'purple', 'pink', 'grey', 'gray', 'color', 'colour'] },
  { name: 'body', keywords: ['head', 'eye', 'ear', 'nose', 'mouth', 'tooth', 'tongue', 'neck', 'arm', 'hand', 'finger', 'leg', 'foot', 'toe', 'stomach', 'back', 'heart', 'body'] },
  { name: 'time', keywords: ['day', 'night', 'morning', 'afternoon', 'evening', 'week', 'month', 'year', 'hour', 'minute', 'second', 'yesterday', 'today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
  { name: 'pronouns', keywords: ['i ', ' me', 'you', 'he', 'she', 'we', 'they', 'him', 'her', 'us', 'them', 'myself', 'yourself'] },
  { name: 'adjectives_size', keywords: ['big', 'large', 'small', 'little', 'long', 'short', 'wide', 'narrow', 'high', 'tall', 'low', 'thick', 'thin', 'heavy', 'light'] },
  { name: 'adjectives_quality', keywords: ['good', 'bad', 'beautiful', 'ugly', 'clean', 'dirty', 'new', 'old', 'fast', 'slow', 'cheap', 'expensive', 'easy', 'difficult', 'hard', 'warm', 'hot', 'cold'] },
  { name: 'politeness', keywords: ['please', 'thank you', 'thanks', 'sorry', 'excuse me', 'pardon', 'welcome', 'you\'re welcome'] },
]

function getSemanticGroup(translation: string, language: 'en' | 'nl'): string | null {
  const lower = translation.toLowerCase()
  const groups = language === 'nl' ? SEMANTIC_GROUPS_NL : SEMANTIC_GROUPS_EN
  for (const group of groups) {
    if (group.keywords.some(kw => lower.includes(kw))) {
      return group.name
    }
  }
  return null
}

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

  // Build translation map for all other items
  const otherTranslations: Array<{ translation: string; level: string }> = allItems
    .filter(i => i.id !== item.id)
    .flatMap(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      return t && t !== correctAnswer ? [{ translation: t, level: i.level }] : []
    })

  // Prefer same semantic group; fall back to same level; then anything
  const correctGroup = getSemanticGroup(correctAnswer, userLanguage)

  const sameGroup = correctGroup
    ? shuffle(otherTranslations.filter(d => getSemanticGroup(d.translation, userLanguage) === correctGroup).map(d => d.translation))
    : []
  const sameLevel = shuffle(otherTranslations.filter(d => d.level === item.level && !sameGroup.includes(d.translation)).map(d => d.translation))
  const fallback = shuffle(otherTranslations.filter(d => !sameGroup.includes(d.translation) && !sameLevel.includes(d.translation)).map(d => d.translation))

  const distractors = [...sameGroup, ...sameLevel, ...fallback].slice(0, 3)

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
    skillType: 'meaning_recall',
    exerciseType: 'cued_recall',
    cuedRecallData: {
      promptMeaningText,
      options,
      correctOptionId: item.base_text,
    },
  }
}

function makeClozeMcq(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  allItems: LearningItem[],
): ExerciseItem {
  const clozeContext = contexts.find(c => c.context_type === 'cloze')
    ?? contexts.find(c => c.is_anchor_context)

  // Distractors: base_text from other same-level items
  const distractors = allItems
    .filter(i => i.id !== item.id && i.level === item.level)
    .map(i => i.base_text)
    .filter(Boolean)

  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]]
  }

  const options = [item.base_text, ...distractors.slice(0, 3)].sort(() => Math.random() - 0.5)

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
    skillType: 'form_recall', // Placeholder; actual will be determined by type
    exerciseType: exerciseType,
  }

  // Map published variant payload to exercise-specific data
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
        },
      }

    case 'contrast_pair':
      return {
        ...baseExercise,
        skillType: 'recognition',
        contrastPairData: {
          promptText: payload.promptText || '',
          targetMeaning: payload.targetMeaning || '',
          options: payload.options || ['', ''],
          correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || '',
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

  // Put 1-2 recognition MCQs first for an easy start, then shuffle the rest
  const recognition = queue.filter(q => q.exerciseItem.exerciseType === 'recognition_mcq')
  const rest = queue.filter(q => q.exerciseItem.exerciseType !== 'recognition_mcq')

  const ordered: SessionQueueItem[] = []
  ordered.push(...recognition.splice(0, Math.min(2, recognition.length)))

  const remaining = [...recognition, ...rest].sort(() => Math.random() - 0.5)
  ordered.push(...remaining)

  return ordered
}
