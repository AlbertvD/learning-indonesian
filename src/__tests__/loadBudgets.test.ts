import { describe, expect, it } from 'vitest'
import { decideLoadBudget } from '@/lib/pedagogy/loadBudgets'

describe('load budgets', () => {
  it('suppresses new capabilities during backlog clear mode', () => {
    expect(decideLoadBudget({
      mode: 'backlog_clear',
      preferredSessionSize: 15,
      dueCount: 12,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      reason: 'backlog_clear_suppresses_new_content',
    }))
  })

  it('limits quick mode to one lightweight introduction', () => {
    expect(decideLoadBudget({
      mode: 'quick',
      preferredSessionSize: 15,
      dueCount: 0,
      allowQuickIntroduction: true,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: true,
      maxNewCapabilities: 1,
      maxNewPatterns: 0,
    }))
  })

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

  it('has explicit budgets for podcast phrases and morphology workshops', () => {
    expect(decideLoadBudget({
      mode: 'podcast',
      preferredSessionSize: 15,
      dueCount: 0,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: true,
      maxNewCapabilities: 3,
      maxNewPatterns: 0,
      reason: 'podcast_phrase_budget',
    }))
    expect(decideLoadBudget({
      mode: 'pattern_workshop',
      preferredSessionSize: 15,
      dueCount: 0,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: true,
      maxNewCapabilities: 2,
      maxNewPatterns: 2,
      reason: 'pattern_workshop_budget',
    }))
  })
})
