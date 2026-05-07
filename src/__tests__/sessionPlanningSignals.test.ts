import { describe, expect, it } from 'vitest'
import { deriveSessionPlanningSignals } from '@/lib/session/sessionPlanningSignals'

describe('session planning signals', () => {
  it('counts capability-only sessions as meaningful practice', () => {
    const signals = deriveSessionPlanningSignals({
      learningSessions: [{
        id: 'session-capability',
        startedAt: '2026-04-25T10:00:00.000Z',
        endedAt: '2026-04-25T10:06:00.000Z',
      }],
      legacyReviewEvents: [],
      capabilityReviewEvents: Array.from({ length: 8 }, (_, index) => ({
        sessionId: 'session-capability',
        createdAt: `2026-04-25T10:0${index}:00.000Z`,
      })),
      dueCount: 3,
      eligibleNewMaterialCount: 4,
    })

    expect(signals.lastMeaningfulPracticeAt).toBe('2026-04-25T10:06:00.000Z')
    expect(signals.dueCount).toBe(3)
    expect(signals.eligibleNewMaterialCount).toBe(4)
  })

  it('returns null when no sessions reach the meaningful-practice threshold', () => {
    const signals = deriveSessionPlanningSignals({
      learningSessions: [{
        id: 'session-1',
        startedAt: '2026-04-25T10:00:00.000Z',
        endedAt: '2026-04-25T10:01:00.000Z',
      }],
      legacyReviewEvents: [],
      capabilityReviewEvents: [{ sessionId: 'session-1' }],
      dueCount: 0,
      eligibleNewMaterialCount: 0,
    })

    expect(signals.lastMeaningfulPracticeAt).toBeNull()
  })
})
