import { describe, it, expect } from 'vitest'
import { deriveWeeklyMovement } from '../masteryModel'
import type { WeeklyReviewEvent } from '../masteryModel'

const NOW = new Date('2026-06-11T12:00:00Z')

function evt(
  sourceRef: string,
  before: Partial<WeeklyReviewEvent['before']>,
  after: Partial<WeeklyReviewEvent['after']>,
): WeeklyReviewEvent {
  const base = { reviewCount: 0, lapseCount: 0, consecutiveFailureCount: 0, stability: null, lastReviewedAt: null }
  return { sourceRef, before: { ...base, ...before }, after: { ...base, ...after } }
}

describe('deriveWeeklyMovement', () => {
  it('counts a word that advanced a rung (learning → strengthening)', () => {
    const events = [
      evt('makan', { reviewCount: 1, stability: 1 }, { reviewCount: 3, stability: 6 }),
    ]
    expect(deriveWeeklyMovement({ events, now: NOW })).toEqual({
      advanced: 1,
      reachedMastered: 0,
      slipped: 0,
    })
  })

  it('counts reaching mastered, and does not double-count the same word', () => {
    const events = [
      // two capabilities of the SAME word both advancing in the window
      evt('makan', { reviewCount: 3, stability: 6 }, { reviewCount: 4, stability: 16, lastReviewedAt: '2026-06-11T11:00:00Z' }),
      evt('makan', { reviewCount: 4, stability: 16, lastReviewedAt: '2026-06-11T11:00:00Z' }, { reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-11T11:30:00Z' }),
    ]
    const m = deriveWeeklyMovement({ events, now: NOW })
    expect(m.reachedMastered).toBe(1)
    expect(m.advanced).toBe(1) // distinct word, counted once
  })

  it('counts a slip to at_risk (a failed review → currently failing)', () => {
    const events = [
      evt('pergi', { reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-10T12:00:00Z' }, { reviewCount: 6, lapseCount: 1, consecutiveFailureCount: 1 }),
    ]
    expect(deriveWeeklyMovement({ events, now: NOW })).toEqual({
      advanced: 0,
      reachedMastered: 0,
      slipped: 1,
    })
  })
})
