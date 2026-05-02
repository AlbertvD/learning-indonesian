import { describe, expect, it } from 'vitest'
import { buildQueueDryingDiagnostic } from '@/lib/session/queueDrying'

describe('queue drying diagnostic', () => {
  it('warns when good candidates are low and the next lesson needs exposure', () => {
    expect(buildQueueDryingDiagnostic({
      goodCandidateCount: 8,
      preferredSessionSize: 12,
      backlogPressure: 'light',
      currentLessonHasEligibleIntroductions: false,
      nextLessonNeedsExposure: true,
      mode: 'standard',
      posture: 'balanced',
    })).toEqual({
      severity: 'warn',
      reason: 'learning_pipeline_drying_up',
      details: 'session.pipelineDryingUp',
    })
  })

  it('does not warn when there is enough good material or meaningful due backlog', () => {
    expect(buildQueueDryingDiagnostic({
      goodCandidateCount: 9,
      preferredSessionSize: 12,
      backlogPressure: 'light',
      currentLessonHasEligibleIntroductions: false,
      nextLessonNeedsExposure: true,
      mode: 'standard',
      posture: 'balanced',
    })).toBeNull()

    expect(buildQueueDryingDiagnostic({
      goodCandidateCount: 8,
      preferredSessionSize: 12,
      backlogPressure: 'medium',
      currentLessonHasEligibleIntroductions: false,
      nextLessonNeedsExposure: true,
      mode: 'standard',
      posture: 'balanced',
    })).toBeNull()
  })

  it('does not warn for intentionally short postures (e.g. comeback)', () => {
    expect(buildQueueDryingDiagnostic({
      goodCandidateCount: 3,
      preferredSessionSize: 12,
      backlogPressure: 'light',
      currentLessonHasEligibleIntroductions: false,
      nextLessonNeedsExposure: true,
      mode: 'standard',
      posture: 'comeback',
    })).toBeNull()
  })

  it('allows light recovery to warn when the queue is genuinely dry', () => {
    expect(buildQueueDryingDiagnostic({
      goodCandidateCount: 3,
      preferredSessionSize: 12,
      backlogPressure: 'light',
      currentLessonHasEligibleIntroductions: false,
      nextLessonNeedsExposure: true,
      mode: 'standard',
      posture: 'light_recovery',
    })?.reason).toBe('learning_pipeline_drying_up')
  })
})
