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

  it('adds balanced posture hard maximums without padding requirements', () => {
    expect(decideLoadBudget({
      mode: 'standard',
      posture: 'balanced',
      preferredSessionSize: 16,
      dueCount: 4,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: true,
      maxNewCapabilities: 4,
      maxNewConcepts: 1,
      maxNewProductionTasks: 1,
      maxSourceSwitches: 1,
      targetSessionSize: 16,
      allowQueuePadding: false,
    }))
  })

  it('keeps light recovery gentle and suppresses new concepts when backlog is medium', () => {
    expect(decideLoadBudget({
      mode: 'standard',
      posture: 'light_recovery',
      preferredSessionSize: 12,
      dueCount: 8,
    })).toEqual(expect.objectContaining({
      maxNewCapabilities: 2,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 1,
      targetSessionSize: 12,
      allowQueuePadding: false,
    }))
  })

  it('uses review-first and comeback budgets to avoid padding with new material', () => {
    expect(decideLoadBudget({
      mode: 'standard',
      posture: 'review_first',
      preferredSessionSize: 12,
      dueCount: 9,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      allowQueuePadding: false,
    }))

    expect(decideLoadBudget({
      mode: 'standard',
      posture: 'comeback',
      preferredSessionSize: 15,
      dueCount: 2,
    })).toEqual(expect.objectContaining({
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 0,
      maxSourceSwitches: 0,
      targetSessionSize: 8,
      allowQueuePadding: false,
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
      maxNewProductionTasks: 2,
      reason: 'pattern_workshop_budget',
    }))
  })
})
