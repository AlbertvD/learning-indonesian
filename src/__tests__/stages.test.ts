import { describe, it, expect } from 'vitest'
import { checkPromotion, checkDemotion } from '@/lib/stages'
import type { LearnerItemState, LearnerSkillState } from '@/types/learning'

// Helpers to build minimal test state
function makeItemState(overrides: Partial<LearnerItemState>): LearnerItemState {
  return {
    id: '1', user_id: 'u1', learning_item_id: 'li1',
    stage: 'new', introduced_at: null, last_seen_at: null,
    priority: null, origin: null, times_seen: 0,
    is_leech: false, suspended: false, gate_check_passed: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeSkillState(overrides: Partial<LearnerSkillState>): LearnerSkillState {
  return {
    id: '1', user_id: 'u1', learning_item_id: 'li1',
    skill_type: 'recognition',
    stability: 0, difficulty: 5, retrievability: null,
    last_reviewed_at: null, next_due_at: null,
    success_count: 0, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
    mean_latency_ms: null, hint_rate: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('checkPromotion', () => {
  it('promotes new → anchoring on first presentation', () => {
    const item = makeItemState({ stage: 'new' })
    expect(checkPromotion(item, null, null)).toBe('anchoring')
  })

  it('promotes anchoring → retrieving when recognition AND meaning_recall thresholds met', () => {
    const item = makeItemState({ stage: 'anchoring', gate_check_passed: true })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 2.5, success_count: 3 })
    const meaningRecall = makeSkillState({ skill_type: 'meaning_recall', stability: 0.5, success_count: 1 })
    expect(checkPromotion(item, recognition, null, meaningRecall)).toBe('retrieving')
  })

  it('does not promote anchoring without enough recognition success', () => {
    const item = makeItemState({ stage: 'anchoring' })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 2.5, success_count: 2 })
    const meaningRecall = makeSkillState({ skill_type: 'meaning_recall', stability: 0.5, success_count: 1 })
    expect(checkPromotion(item, recognition, null, meaningRecall)).toBeNull()
  })

  it('does not promote anchoring without any meaning_recall review', () => {
    const item = makeItemState({ stage: 'anchoring' })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 2.5, success_count: 3 })
    // No meaning_recall skill exists yet
    expect(checkPromotion(item, recognition, null, null)).toBeNull()
  })

  it('does not promote anchoring when meaning_recall exists but has 0 successes', () => {
    const item = makeItemState({ stage: 'anchoring' })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 2.5, success_count: 3 })
    const meaningRecall = makeSkillState({ skill_type: 'meaning_recall', stability: 0.1, success_count: 0 })
    expect(checkPromotion(item, recognition, null, meaningRecall)).toBeNull()
  })

  it('promotes retrieving → productive with all three skills meeting threshold (gate passed)', () => {
    const item = makeItemState({ stage: 'retrieving', gate_check_passed: true })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 6, success_count: 3 })
    const formRecall = makeSkillState({ skill_type: 'form_recall', stability: 6, success_count: 3 })
    const meaningRecall = makeSkillState({ skill_type: 'meaning_recall', stability: 6, success_count: 3 })
    expect(checkPromotion(item, recognition, formRecall, meaningRecall)).toBe('productive')
  })

  it('does not promote retrieving → productive without meaning_recall', () => {
    const item = makeItemState({ stage: 'retrieving', gate_check_passed: true })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 6, success_count: 3 })
    const formRecall = makeSkillState({ skill_type: 'form_recall', stability: 6, success_count: 3 })
    expect(checkPromotion(item, recognition, formRecall, null)).toBeNull()
  })

  it('requires higher threshold for retrieving → productive when gate_check_passed=false', () => {
    const item = makeItemState({ stage: 'retrieving', gate_check_passed: false })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 6, success_count: 4 })
    const formRecall = makeSkillState({ skill_type: 'form_recall', stability: 6, success_count: 4 })
    const meaningRecall = makeSkillState({ skill_type: 'meaning_recall', stability: 6, success_count: 4 })
    // 4 successes < 5 required when gate check failed
    expect(checkPromotion(item, recognition, formRecall, meaningRecall)).toBeNull()
  })

  it('promotes retrieving → productive at exactly 5 successes when gate_check_passed=false', () => {
    const item = makeItemState({ stage: 'retrieving', gate_check_passed: false })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 6, success_count: 5 })
    const formRecall = makeSkillState({ skill_type: 'form_recall', stability: 6, success_count: 5 })
    const meaningRecall = makeSkillState({ skill_type: 'meaning_recall', stability: 6, success_count: 5 })
    expect(checkPromotion(item, recognition, formRecall, meaningRecall)).toBe('productive')
  })

  it('promotes productive → maintenance when all skills high and no lapses', () => {
    const item = makeItemState({ stage: 'productive' })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 22, success_count: 10, lapse_count: 0 })
    const formRecall = makeSkillState({ skill_type: 'form_recall', stability: 22, success_count: 10, lapse_count: 0 })
    const meaningRecall = makeSkillState({ skill_type: 'meaning_recall', stability: 22, success_count: 10, lapse_count: 0 })
    expect(checkPromotion(item, recognition, formRecall, meaningRecall)).toBe('maintenance')
  })

  it('does not promote productive → maintenance if meaning_recall has lapses', () => {
    const item = makeItemState({ stage: 'productive' })
    const recognition = makeSkillState({ skill_type: 'recognition', stability: 22, success_count: 10, lapse_count: 0 })
    const formRecall = makeSkillState({ skill_type: 'form_recall', stability: 22, success_count: 10, lapse_count: 0 })
    const meaningRecall = makeSkillState({ skill_type: 'meaning_recall', stability: 22, success_count: 10, lapse_count: 1 })
    expect(checkPromotion(item, recognition, formRecall, meaningRecall)).toBeNull()
  })
})

describe('checkDemotion', () => {
  it('demotes on 2 consecutive failures', () => {
    const item = makeItemState({ stage: 'productive' })
    const skill = makeSkillState({ consecutive_failures: 2 })
    expect(checkDemotion(item, skill)).toBe('retrieving')
  })

  it('does not demote on 1 failure', () => {
    const item = makeItemState({ stage: 'productive' })
    const skill = makeSkillState({ consecutive_failures: 1 })
    expect(checkDemotion(item, skill)).toBeNull()
  })

  it('floors demotion at anchoring', () => {
    const item = makeItemState({ stage: 'anchoring' })
    const skill = makeSkillState({ consecutive_failures: 2 })
    expect(checkDemotion(item, skill)).toBeNull()
  })

  it('demotes retrieving → anchoring', () => {
    const item = makeItemState({ stage: 'retrieving' })
    const skill = makeSkillState({ consecutive_failures: 2 })
    expect(checkDemotion(item, skill)).toBe('anchoring')
  })
})
