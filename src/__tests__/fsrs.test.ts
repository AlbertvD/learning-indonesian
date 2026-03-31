import { describe, it, expect } from 'vitest'
import { Rating } from 'ts-fsrs'
import { computeNextState, inferRating } from '@/lib/fsrs'

describe('inferRating', () => {
  it('returns Again for incorrect answers', () => {
    expect(inferRating({ wasCorrect: false, hintUsed: false, isFuzzy: false })).toBe(Rating.Again)
  })

  it('returns Hard for correct with hint', () => {
    expect(inferRating({ wasCorrect: true, hintUsed: true, isFuzzy: false })).toBe(Rating.Hard)
  })

  it('returns Hard for correct with fuzzy match', () => {
    expect(inferRating({ wasCorrect: true, hintUsed: false, isFuzzy: true })).toBe(Rating.Hard)
  })

  it('returns Good for clean correct answer', () => {
    expect(inferRating({ wasCorrect: true, hintUsed: false, isFuzzy: false })).toBe(Rating.Good)
  })
})

describe('computeNextState', () => {
  it('returns valid FSRS state for a first review', () => {
    const result = computeNextState(null, Rating.Good)
    expect(result.stability).toBeGreaterThan(0)
    expect(result.difficulty).toBeGreaterThan(0)
    expect(result.nextDueAt).toBeInstanceOf(Date)
  })

  it('increases stability on Good rating', () => {
    const first = computeNextState(null, Rating.Good)
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    const second = computeNextState(
      { stability: first.stability, difficulty: first.difficulty, lastReviewedAt: tenDaysAgo },
      Rating.Good
    )
    expect(second.stability).toBeGreaterThan(first.stability)
  })

  it('decreases stability on Again rating', () => {
    const first = computeNextState(null, Rating.Good)
    const lapsed = computeNextState(
      { stability: first.stability, difficulty: first.difficulty, lastReviewedAt: new Date() },
      Rating.Again
    )
    expect(lapsed.stability).toBeLessThan(first.stability)
  })
})
