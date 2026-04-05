import { describe, it, expect } from 'vitest'
import { computeReviewForecast } from '@/utils/progressUtils'
import type { LearnerSkillState } from '@/types/learning'

function makeSkillState(next_due_at: string | null): LearnerSkillState {
  return {
    id: 'test-id',
    user_id: 'user-1',
    learning_item_id: 'item-1',
    skill_type: 'recognition',
    stability: 1,
    difficulty: 0.3,
    retrievability: null,
    repetitions: 1,
    last_interval_days: 1,
    next_due_at,
    last_reviewed_at: null,
    lapse_count: 0,
    consecutive_failures: 0,
    success_count: 0,
    failure_count: 0,
    mean_latency_ms: null,
    hint_rate: null,
    updated_at: new Date().toISOString(),
  } as LearnerSkillState
}

const BASE = new Date('2026-04-05T12:00:00.000Z')

describe('computeReviewForecast', () => {
  it('returns exactly 7 entries', () => {
    const result = computeReviewForecast([], BASE)
    expect(result).toHaveLength(7)
  })

  it('counts skills due on the correct day', () => {
    const skills = [
      makeSkillState('2026-04-05T08:00:00.000Z'), // day 0
      makeSkillState('2026-04-06T14:00:00.000Z'), // day 1
      makeSkillState('2026-04-06T23:00:00.000Z'), // day 1
      makeSkillState('2026-04-09T10:00:00.000Z'), // day 4
    ]
    const result = computeReviewForecast(skills, BASE)
    expect(result[0].count).toBe(1) // day 0
    expect(result[1].count).toBe(2) // day 1
    expect(result[2].count).toBe(0) // day 2
    expect(result[3].count).toBe(0) // day 3
    expect(result[4].count).toBe(1) // day 4
    expect(result[5].count).toBe(0) // day 5
    expect(result[6].count).toBe(0) // day 6
  })

  it('excludes skills with null next_due_at', () => {
    const skills = [makeSkillState(null), makeSkillState('2026-04-05T10:00:00.000Z')]
    const result = computeReviewForecast(skills, BASE)
    expect(result[0].count).toBe(1)
  })

  it('excludes skills due outside the 7-day window', () => {
    const skills = [
      makeSkillState('2026-04-12T10:00:00.000Z'), // day 7 — outside window
      makeSkillState('2026-04-11T23:59:59.000Z'), // day 6 — last day
    ]
    const result = computeReviewForecast(skills, BASE)
    expect(result[6].count).toBe(1)
    const total = result.reduce((sum, d) => sum + d.count, 0)
    expect(total).toBe(1)
  })

  it('returns zero counts for all days when skills list is empty', () => {
    const result = computeReviewForecast([], BASE)
    result.forEach(({ count }) => expect(count).toBe(0))
  })

  it('sets dates starting from baseDate day 0', () => {
    const result = computeReviewForecast([], BASE)
    const day0 = result[0].date
    expect(day0.getFullYear()).toBe(BASE.getFullYear())
    expect(day0.getMonth()).toBe(BASE.getMonth())
    expect(day0.getDate()).toBe(BASE.getDate())
    expect(day0.getHours()).toBe(0)
    expect(day0.getMinutes()).toBe(0)
  })
})
