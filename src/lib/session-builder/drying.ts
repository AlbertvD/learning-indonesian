// Queue-drying detector. Relocated from src/lib/session/queueDrying.ts; not
// yet wired from builder.ts. Wiring + rewrite lands in PR-B per
// docs/plans/2026-05-16-fold-session-builder-design.md §4.1.
//
// PR-A preserves the existing detection rule verbatim using locally-scoped
// types (the posture and planner-mode types it referenced are deleted in
// this fold). PR-B replaces the suppression rule with a simpler
// backlog-or-mode check.

import type { SessionMode, SessionDiagnostic } from '@/lib/session-builder/model'

type LegacyBacklogPressure = 'light' | 'medium' | 'heavy' | 'huge'
type LegacyPosture = 'balanced' | 'light_recovery' | 'review_first' | 'comeback'

export interface QueueDryingInput {
  goodCandidateCount: number
  preferredSessionSize: number
  backlogPressure: LegacyBacklogPressure
  currentLessonHasEligibleIntroductions: boolean
  nextLessonNeedsExposure: boolean
  mode: SessionMode
  posture: LegacyPosture
}

function isIntentionallyShort(input: QueueDryingInput): boolean {
  if (input.posture === 'comeback') return true
  return input.posture === 'review_first' && input.backlogPressure !== 'light'
}

export function buildQueueDryingDiagnostic(input: QueueDryingInput): SessionDiagnostic | null {
  if (isIntentionallyShort(input)) return null
  if (input.backlogPressure !== 'light') return null
  if (input.currentLessonHasEligibleIntroductions) return null
  if (!input.nextLessonNeedsExposure) return null

  const preferredSize = Math.max(1, input.preferredSessionSize)
  if (input.goodCandidateCount >= preferredSize * 0.7) return null

  return {
    severity: 'warn',
    reason: 'learning_pipeline_drying_up',
    details: 'session.pipelineDryingUp',
  }
}
