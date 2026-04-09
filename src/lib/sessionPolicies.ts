// src/lib/sessionPolicies.ts
import type { SessionQueueItem, ExerciseTypeAvailability } from '@/types/learning'
import { isExerciseTypeEnabled } from './featureFlags'

export interface SessionPoliciesContext {
  sessionInteractionCap: number

  // Exercise type availability
  exerciseTypeAvailability?: Record<string, ExerciseTypeAvailability>

  // Grammar patterns (confusion groups)
  grammarPatterns?: Record<string, { confusion_group?: string }>
}

/**
 * Apply policy layers on top of the raw session queue.
 * Policies are applied in order:
 * 1. Exercise availability gating
 * 2. Approved content check (deferred — Phase 2+)
 * 3. Grammar-aware interleaving
 * 4. Consecutive type cap
 * 5. Queue trimming
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

  // 5. Queue trimming
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
    const exerciseType = item.exerciseItem.exerciseType
    // Feature flag gate (env var) — takes precedence
    if (!isExerciseTypeEnabled(exerciseType)) return false
    // DB availability gate
    const availability = context.exerciseTypeAvailability?.[exerciseType]
    // Fail-open: if availability data couldn't be loaded (service error), pass through
    // so a transient DB failure doesn't break the entire session. Compare to
    // exerciseAvailabilityService.isSessionEnabled which is fail-closed — that
    // method is used for explicit checks, not bulk session filtering.
    if (!availability) return true
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

  // Interleave groups to avoid adjacent items from same group.
  // Round-robin: take one item per group per round until all groups are exhausted.
  const ordered: SessionQueueItem[] = []
  const groups = Array.from(grouped.values())

  let round = 0
  let anyAddedThisRound = true
  while (ordered.length < queue.length && anyAddedThisRound) {
    anyAddedThisRound = false
    for (const group of groups) {
      if (ordered.length >= queue.length) break
      if (round < group.length) {
        ordered.push(group[round])
        anyAddedThisRound = true
      }
    }
    round++
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
 * Trim queue to session interaction cap.
 * The engine already orders the queue by priority (anchoring > due > new),
 * so a simple slice preserves the correct priority ordering.
 */
function trimQueueToCapacity(
  queue: SessionQueueItem[],
  sessionInteractionCap: number,
): SessionQueueItem[] {
  return queue.slice(0, sessionInteractionCap)
}
