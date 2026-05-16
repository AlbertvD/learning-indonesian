import { describe, expect, it } from 'vitest'
import { decideLoadBudget } from '@/lib/session-builder/loadBudget'

describe('load budgets', () => {
  it('standard mode reserves most work for reviews and caps new patterns', () => {
    expect(decideLoadBudget({
      mode: 'standard',
      preferredSessionSize: 15,
      dueCount: 4,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: true,
      maxNewPatterns: 1,
    }))
  })

  it('standard mode reports review-backlog reason when due capabilities fill the session', () => {
    expect(decideLoadBudget({
      mode: 'standard',
      preferredSessionSize: 12,
      dueCount: 20,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: false,
      reason: 'review_backlog_exhausts_budget',
      targetSessionSize: 12,
    }))
  })

  it('adds explicit lesson practice and lesson review budgets', () => {
    expect(decideLoadBudget({
      mode: 'lesson_practice',
      preferredSessionSize: 25,
      dueCount: 4,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: true,
      maxNewCapabilities: 21,
      targetSessionSize: 25,
      allowQueuePadding: false,
      reason: 'lesson_practice_selected_lesson_budget',
    }))

    expect(decideLoadBudget({
      mode: 'lesson_review',
      preferredSessionSize: 25,
      dueCount: 4,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      targetSessionSize: 25,
      allowQueuePadding: false,
      reason: 'lesson_review_suppresses_new_content',
    }))
  })
})
