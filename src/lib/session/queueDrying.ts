import type { BacklogPressure, SessionPosture } from '@/lib/pedagogy/sessionPosture'
import type { PlannerSessionMode } from '@/lib/pedagogy/loadBudgets'
import type { SessionDiagnostic } from '@/lib/session/sessionPlan'

export interface QueueDryingInput {
  goodCandidateCount: number
  preferredSessionSize: number
  backlogPressure: BacklogPressure
  currentLessonHasEligibleIntroductions: boolean
  nextLessonNeedsExposure: boolean
  mode: PlannerSessionMode
  posture: SessionPosture
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
