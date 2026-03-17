// src/__tests__/sm2.test.ts
import { describe, it, expect } from 'vitest'
import { calculateNextReview } from '@/lib/sm2'

describe('SM-2 Algorithm', () => {
  it('resets interval and repetitions on "again"', () => {
    const result = calculateNextReview('again', 2.5, 10, 5)
    expect(result.intervalDays).toBe(1)
    expect(result.repetitions).toBe(0)
    expect(result.easinessFactor).toBeLessThan(2.5)
  })

  it('sets interval to 1 on first successful repetition', () => {
    const result = calculateNextReview('good', 2.5, 1, 0)
    expect(result.intervalDays).toBe(1)
    expect(result.repetitions).toBe(1)
  })

  it('sets interval to 6 on second successful repetition', () => {
    const result = calculateNextReview('good', 2.5, 1, 1)
    expect(result.intervalDays).toBe(6)
    expect(result.repetitions).toBe(2)
  })

  it('calculates interval based on EF for subsequent repetitions', () => {
    const result = calculateNextReview('good', 2.5, 6, 2)
    // interval = 6 * 2.5 = 15
    expect(result.intervalDays).toBe(15)
    expect(result.repetitions).toBe(3)
  })

  it('provides a bonus for "easy" quality', () => {
    const result = calculateNextReview('easy', 2.5, 6, 2)
    // interval = round(6 * EF) * 1.3
    // EF' = 2.5 + (0.1 - (3-3)*(0.08 + (3-3)*0.02)) = 2.6
    // interval = round(6 * 2.6) * 1.3 = round(15.6) * 1.3 = 16 * 1.3 = 20.8 -> round 21?
    // Wait, the code says: interval = Math.round(currentInterval * ef); if (easy) interval = Math.round(interval * 1.3)
    // 6 * 2.6 = 15.6 -> round = 16. 16 * 1.3 = 20.8 -> round = 21.
    expect(result.intervalDays).toBe(21)
  })

  it('never lets easiness factor drop below 1.3', () => {
    const ef = 1.3
    const result = calculateNextReview('again', ef, 1, 0)
    expect(result.easinessFactor).toBe(1.3)
  })
})
