import type { SessionMode } from '@/lib/session-builder/model'

export interface LoadBudgetInput {
  mode: SessionMode
  preferredSessionSize: number
  dueCount: number
}

export interface LoadBudgetDecision {
  allowNewCapabilities: boolean
  maxNewCapabilities: number
  maxNewPatterns: number
  maxNewConcepts: number
  maxNewProductionTasks: number
  maxHiddenAudioTasks: number
  maxSourceSwitches: number
  targetSessionSize: number
  allowQueuePadding: boolean
  reason: string
}

export function decideLoadBudget(input: LoadBudgetInput): LoadBudgetDecision {
  const targetSessionSize = Math.max(0, input.preferredSessionSize)
  const openSlots = Math.max(0, targetSessionSize - input.dueCount)

  if (input.mode === 'lesson_review') {
    return {
      allowNewCapabilities: false, maxNewCapabilities: 0, maxNewPatterns: 0,
      maxNewConcepts: 0, maxNewProductionTasks: 0, maxHiddenAudioTasks: 0,
      maxSourceSwitches: 0, targetSessionSize, allowQueuePadding: false,
      reason: 'lesson_review_suppresses_new_content',
    }
  }

  if (input.mode === 'lesson_practice') {
    return {
      allowNewCapabilities: openSlots > 0, maxNewCapabilities: openSlots,
      maxNewPatterns: openSlots, maxNewConcepts: openSlots,
      maxNewProductionTasks: openSlots, maxHiddenAudioTasks: targetSessionSize,
      maxSourceSwitches: 0, targetSessionSize, allowQueuePadding: false,
      reason: 'lesson_practice_selected_lesson_budget',
    }
  }

  // Standard mode fills every open slot with new caps when the eligible pool
  // can supply them — the learner's `preferredSessionSize` is the contract.
  // Was previously capped at `min(openSlots, max(1, floor(targetSize * 0.25)))`
  // with per-type ceilings of 1; the cap silently truncated sessions when due
  // counts were low. See docs/plans/2026-05-17-honor-profile-session-size.md.
  // `maxSourceSwitches: 1` stays distinct from lesson_practice (which uses 0).
  return {
    allowNewCapabilities: openSlots > 0, maxNewCapabilities: openSlots,
    maxNewPatterns: openSlots, maxNewConcepts: openSlots,
    maxNewProductionTasks: openSlots, maxHiddenAudioTasks: targetSessionSize,
    maxSourceSwitches: 1, targetSessionSize, allowQueuePadding: false,
    reason: openSlots > 0 ? 'standard_daily_budget' : 'review_backlog_exhausts_budget',
  }
}
