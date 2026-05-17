import { describe, expect, it } from 'vitest'
import { decideLoadBudget } from '@/lib/session-builder/loadBudget'

describe('load budgets', () => {
  it('standard mode fills openSlots with new caps (no per-type cap)', () => {
    // preferredSessionSize=15, dueCount=4 → openSlots=11. The new-cap budget
    // is openSlots across maxNewCapabilities/Patterns/Concepts/ProductionTasks.
    // See docs/plans/2026-05-17-honor-profile-session-size.md.
    expect(decideLoadBudget({
      mode: 'standard',
      preferredSessionSize: 15,
      dueCount: 4,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: true,
      maxNewCapabilities: 11,
      maxNewPatterns: 11,
      maxNewConcepts: 11,
      maxNewProductionTasks: 11,
      maxSourceSwitches: 1,
      reason: 'standard_daily_budget',
    }))
  })

  it('standard mode fills openSlots with new caps at large session sizes', () => {
    // preferredSessionSize=25, dueCount=6 → openSlots=19. The previous formula
    // capped maxNewCapabilities at floor(25 * 0.25) = 6; the new rule honors
    // the profile preference and lets every open slot accept a new cap.
    expect(decideLoadBudget({
      mode: 'standard',
      preferredSessionSize: 25,
      dueCount: 6,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: true,
      maxNewCapabilities: 19,
      maxNewPatterns: 19,
      maxNewConcepts: 19,
      maxNewProductionTasks: 19,
      reason: 'standard_daily_budget',
    }))
  })

  it('standard mode review-backlog branch keeps every new-cap cap at zero', () => {
    // openSlots = 0 (dueCount >= preferredSessionSize). The per-type caps must
    // collapse to 0 alongside maxNewCapabilities so the planner emits no new
    // content when the backlog already saturates the session.
    expect(decideLoadBudget({
      mode: 'standard',
      preferredSessionSize: 25,
      dueCount: 30,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      maxNewPatterns: 0,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      reason: 'review_backlog_exhausts_budget',
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
