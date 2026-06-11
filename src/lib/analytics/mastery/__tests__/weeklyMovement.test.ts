import { describe, it, expect } from 'vitest'
import { deriveWeeklyMovement } from '../masteryModel'
import type { WeeklyReviewEvent } from '../masteryModel'

const NOW = new Date('2026-06-11T12:00:00Z')

function evt(
  capabilityId: string,
  before: Partial<WeeklyReviewEvent['before']>,
  after: Partial<WeeklyReviewEvent['after']>,
): WeeklyReviewEvent {
  const base = { reviewCount: 0, lapseCount: 0, consecutiveFailureCount: 0, stability: null, lastReviewedAt: null }
  return { capabilityId, before: { ...base, ...before }, after: { ...base, ...after } }
}

describe('deriveWeeklyMovement', () => {
  it('counts a capability that advanced a rung (learning → strengthening)', () => {
    const events = [
      evt('cap-1', { reviewCount: 1, stability: 1 }, { reviewCount: 3, stability: 6 }),
    ]
    expect(deriveWeeklyMovement({ events, now: NOW })).toEqual({
      advanced: 1,
      reachedMastered: 0,
      slipped: 0,
    })
  })

  it('counts reaching mastered, and does not double-count the same capability', () => {
    const events = [
      evt('cap-1', { reviewCount: 3, stability: 6 }, { reviewCount: 4, stability: 16, lastReviewedAt: '2026-06-11T11:00:00Z' }),
      // a second advancing review of the same cap in the window
      evt('cap-1', { reviewCount: 4, stability: 16, lastReviewedAt: '2026-06-11T11:00:00Z' }, { reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-11T11:30:00Z' }),
    ]
    const m = deriveWeeklyMovement({ events, now: NOW })
    expect(m.reachedMastered).toBe(1)
    expect(m.advanced).toBe(1) // distinct capability, counted once
  })

  it('counts a slip to at_risk (a failed review → currently failing)', () => {
    const events = [
      evt('cap-2', { reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-10T12:00:00Z' }, { reviewCount: 6, lapseCount: 1, consecutiveFailureCount: 1 }),
    ]
    expect(deriveWeeklyMovement({ events, now: NOW })).toEqual({
      advanced: 0,
      reachedMastered: 0,
      slipped: 1,
    })
  })
})
