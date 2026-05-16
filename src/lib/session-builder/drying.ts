// Queue-drying detector. Surfaces a learner-facing diagnostic when the
// current lesson is effectively exhausted but the next lesson is still
// inactive — the planner has no introductions to give, the due queue is
// nearly empty, and the only fix is for the learner to activate the next
// lesson. See docs/plans/2026-05-16-fold-session-builder-design.md §4.1.

import type { SessionDiagnostic, SessionMode } from '@/lib/session-builder/model'

export interface QueueDryingInput {
  dueCount: number
  preferredSessionSize: number
  goodCandidateCount: number
  currentLessonHasEligibleIntroductions: boolean
  nextLessonNeedsExposure: boolean
  mode: SessionMode
}

function shouldSuppressDryingWarning(input: QueueDryingInput): boolean {
  // Backlog explains the short session — don't blame drying.
  if (input.dueCount > input.preferredSessionSize) return true
  // Lesson modes are intentionally narrow.
  if (input.mode !== 'standard') return true
  return false
}

function shouldFireDryingWarning(input: QueueDryingInput): boolean {
  if (shouldSuppressDryingWarning(input)) return false
  if (input.currentLessonHasEligibleIntroductions) return false
  if (!input.nextLessonNeedsExposure) return false
  const preferredSize = Math.max(1, input.preferredSessionSize)
  if (input.goodCandidateCount >= preferredSize * 0.7) return false
  return true
}

export function buildQueueDryingDiagnostic(input: QueueDryingInput): SessionDiagnostic | null {
  if (!shouldFireDryingWarning(input)) return null
  return {
    severity: 'warn',
    reason: 'learning_pipeline_drying_up',
    details: 'session.pipelineDryingUp',
  }
}
