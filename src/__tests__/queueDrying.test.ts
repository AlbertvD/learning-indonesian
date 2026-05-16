import { describe, expect, it } from 'vitest'
import { buildQueueDryingDiagnostic, type QueueDryingInput } from '@/lib/session-builder/drying'

const fireScenario: QueueDryingInput = {
  dueCount: 5,
  preferredSessionSize: 15,
  goodCandidateCount: 4,
  currentLessonHasEligibleIntroductions: false,
  nextLessonNeedsExposure: true,
  mode: 'standard',
}

describe('queue drying diagnostic', () => {
  it('fires when the current lesson is dry and the next lesson is inactive', () => {
    expect(buildQueueDryingDiagnostic(fireScenario)).toEqual({
      severity: 'warn',
      reason: 'learning_pipeline_drying_up',
      details: 'session.pipelineDryingUp',
    })
  })

  it('suppressed when the due backlog already exceeds the preferred session size', () => {
    expect(buildQueueDryingDiagnostic({
      ...fireScenario,
      dueCount: 20,
    })).toBeNull()
  })

  it('suppressed in lesson-scoped modes (they are intentionally narrow)', () => {
    expect(buildQueueDryingDiagnostic({
      ...fireScenario,
      mode: 'lesson_practice',
    })).toBeNull()

    expect(buildQueueDryingDiagnostic({
      ...fireScenario,
      mode: 'lesson_review',
    })).toBeNull()
  })

  it('suppressed when the planner can still introduce material from the current lesson', () => {
    expect(buildQueueDryingDiagnostic({
      ...fireScenario,
      currentLessonHasEligibleIntroductions: true,
    })).toBeNull()
  })

  it('suppressed when the next lesson is already active (or there is no next lesson)', () => {
    expect(buildQueueDryingDiagnostic({
      ...fireScenario,
      nextLessonNeedsExposure: false,
    })).toBeNull()
  })

  it('suppressed when the candidate pool is still ≥70% of the preferred session size', () => {
    // 15 * 0.7 = 10.5, so a count of 11 should suppress.
    expect(buildQueueDryingDiagnostic({
      ...fireScenario,
      goodCandidateCount: 11,
    })).toBeNull()
  })

  it('still fires when the candidate pool is just below the 70% threshold', () => {
    expect(buildQueueDryingDiagnostic({
      ...fireScenario,
      goodCandidateCount: 10,
    })?.reason).toBe('learning_pipeline_drying_up')
  })
})
