// src/lib/sessionPolicies.ts
import type { SessionQueueItem, ExerciseTypeAvailability } from '@/types/learning'
import { newLearnerDefaults } from './newLearnerDefaults'

export interface SessionPoliciesContext {
  // User demographics
  accountAgeDays: number
  stableItemCount: number
  sessionInteractionCap: number

  // Exercise type availability
  exerciseTypeAvailability?: Record<string, ExerciseTypeAvailability>

  // Grammar patterns (confusion groups)
  grammarPatterns?: Record<string, { confusion_group?: string }>

  // Session progress tracking (for overload detection)
  sessionStarted?: boolean
}

/**
 * Apply policy layers on top of the raw session queue.
 * Policies are applied in order:
 * 1. Exercise availability gating
 * 2. Approved content check
 * 3. Grammar-aware interleaving
 * 4. Consecutive type cap
 * 5. New learner overload protection
 * 6. Mid-session overload detection
 * 7. Queue trimming
 */
export function applyPolicies(
  queue: SessionQueueItem[],
  context: SessionPoliciesContext,
): SessionQueueItem[] {
  let shaped = [...queue]

  // 1. Exercise availability gating
  shaped = filterByExerciseAvailability(shaped, context)

  // 2. Approved content check (not filtering yet - content pipeline in Phase 2+)
  // shaped = filterByApprovedContent(shaped, context)

  // 3. Grammar-aware interleaving
  shaped = applyGrammarAwareInterleaving(shaped, context)

  // 4. Consecutive type cap
  shaped = applyConsecutiveTypeCap(shaped)

  // 5. New learner detection + overload protection
  shaped = applyNewLearnerRules(shaped, context)

  // 6. Mid-session overload detection (not applicable during initial queue build)
  // This will be applied by Session.tsx during the session

  // 7. Queue trimming
  shaped = trimQueueToCapacity(shaped, context.sessionInteractionCap)

  return shaped
}

/**
 * Filter out exercise types where session_enabled = false
 */
function filterByExerciseAvailability(
  queue: SessionQueueItem[],
  context: SessionPoliciesContext,
): SessionQueueItem[] {
  if (!context.exerciseTypeAvailability) {
    return queue
  }

  return queue.filter(item => {
    const availability = context.exerciseTypeAvailability?.[item.exerciseItem.exerciseType]
    if (!availability) {
      return true // No availability data, keep item
    }
    return availability.session_enabled !== false
  })
}

/**
 * Reorder queue to avoid adjacent confusable items.
 * Reads grammar_patterns.confusion_group to identify confusable forms.
 * Simple heuristic: avoid adjacent items from same confusion group.
 */
function applyGrammarAwareInterleaving(
  queue: SessionQueueItem[],
  context: SessionPoliciesContext,
): SessionQueueItem[] {
  if (!context.grammarPatterns || queue.length <= 2) {
    return queue
  }

  // Group items by confusion group
  const grouped: Map<string, SessionQueueItem[]> = new Map()
  const noGroup: SessionQueueItem[] = []

  for (const item of queue) {
    const itemId = item.exerciseItem.learningItem.id
    const pattern = context.grammarPatterns[itemId]
    const group = pattern?.confusion_group

    if (group) {
      if (!grouped.has(group)) {
        grouped.set(group, [])
      }
      grouped.get(group)!.push(item)
    } else {
      noGroup.push(item)
    }
  }

  // Interleave groups to avoid adjacent items from same group
  const ordered: SessionQueueItem[] = []
  const groups = Array.from(grouped.values())

  let groupIndex = 0
  let itemIndex = 0

  // Distribute items from each group
  while (ordered.length < queue.length) {
    let distributed = false

    for (let i = 0; i < groups.length; i++) {
      const group = groups[groupIndex % groups.length]
      if (itemIndex < group.length) {
        ordered.push(group[itemIndex])
        distributed = true
        break
      }
      groupIndex++
    }

    if (!distributed) {
      itemIndex++
      groupIndex = 0
    }
  }

  // If we have ungrouped items, interleave them too
  if (noGroup.length > 0) {
    // Re-interleave to include ungrouped items
    const result: SessionQueueItem[] = []
    let queueIdx = 0
    let noGroupIdx = 0

    for (let i = 0; i < queue.length; i++) {
      // Every 3rd item, use a no-group item if available
      if (i % 3 === 2 && noGroupIdx < noGroup.length) {
        result.push(noGroup[noGroupIdx++])
      } else if (queueIdx < ordered.length) {
        result.push(ordered[queueIdx++])
      } else if (noGroupIdx < noGroup.length) {
        result.push(noGroup[noGroupIdx++])
      }
    }
    return result
  }

  return ordered
}

/**
 * Limit consecutive exercise types to max 2 in a row when alternatives exist.
 */
function applyConsecutiveTypeCap(queue: SessionQueueItem[]): SessionQueueItem[] {
  if (queue.length <= 2) return queue

  const maxConsecutive = 2
  const reordered: SessionQueueItem[] = []
  const remaining = [...queue]

  while (remaining.length > 0) {
    const lastN = reordered.slice(-maxConsecutive)
    const lastType = lastN.length > 0 ? lastN[0]?.exerciseItem.exerciseType : null

    // Find next item that differs from last type (if possible)
    let nextIdx = remaining.findIndex(
      item => item.exerciseItem.exerciseType !== lastType || lastN.length < maxConsecutive,
    )

    // If all remaining are same type, just take first
    if (nextIdx === -1) {
      nextIdx = 0
    }

    reordered.push(remaining[nextIdx])
    remaining.splice(nextIdx, 1)
  }

  return reordered
}

/**
 * Detect new learners and apply overload protection.
 * New learner: account_age_days < 30 AND stable_item_count < 50
 * Overload rule: Limit new items severely for new learners
 *
 * Also enforces early stage caps:
 * - 0–30 days: no new items, max 20-day intervals (handled in fsrs.ts)
 * - 30–60 days: reduced new items, max 30-day intervals
 */
function applyNewLearnerRules(
  queue: SessionQueueItem[],
  context: SessionPoliciesContext,
): SessionQueueItem[] {
  const { accountAgeDaysThreshold, stableItemCountThreshold } = newLearnerDefaults
  const isNewLearner = context.accountAgeDays < accountAgeDaysThreshold && context.stableItemCount < stableItemCountThreshold

  if (!isNewLearner) {
    return queue
  }

  // For new learners: keep only due and weak items, remove new items
  return queue.filter(item => {
    // Check if this is a new item (no learner state or stage === 'new')
    const state = item.learnerItemState
    const isNew = !state || state.stage === 'new'
    return !isNew
  })
}

/**
 * Trim queue to session interaction cap.
 * Priority order: keep due > weak > new
 */
function trimQueueToCapacity(
  queue: SessionQueueItem[],
  sessionInteractionCap: number,
): SessionQueueItem[] {
  if (queue.length <= sessionInteractionCap) {
    return queue
  }

  // Categorize by item state
  const due: SessionQueueItem[] = []
  const weak: SessionQueueItem[] = []
  const newItems: SessionQueueItem[] = []

  for (const item of queue) {
    const state = item.learnerItemState
    const isNew = !state || state.stage === 'new'

    if (isNew) {
      newItems.push(item)
    } else {
      // Check if weak: high lapse count or only recognition
      const skills = item.learnerSkillState ? [item.learnerSkillState] : []
      const hasHighLapses = skills.some(s => s.lapse_count >= 3)
      const hasOnlyRecognition = skills.length === 1 && skills[0].skill_type === 'recognition'

      if (hasHighLapses || hasOnlyRecognition) {
        weak.push(item)
      } else {
        due.push(item)
      }
    }
  }

  // Build trimmed queue in priority order
  const trimmed: SessionQueueItem[] = []
  trimmed.push(...due.slice(0, sessionInteractionCap))

  if (trimmed.length < sessionInteractionCap) {
    trimmed.push(...weak.slice(0, sessionInteractionCap - trimmed.length))
  }

  if (trimmed.length < sessionInteractionCap) {
    trimmed.push(...newItems.slice(0, sessionInteractionCap - trimmed.length))
  }

  return trimmed
}
