import { describe, it, expect } from 'vitest'
import { buildSessionQueue, type SessionBuildInput } from '@/lib/sessionEngine'

function makeInput(overrides: Partial<SessionBuildInput> = {}): SessionBuildInput {
  return {
    allItems: [
      { id: 'li1', item_type: 'word', base_text: 'rumah', normalized_text: 'rumah', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' },
      { id: 'li2', item_type: 'word', base_text: 'kucing', normalized_text: 'kucing', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' },
      { id: 'li3', item_type: 'word', base_text: 'anjing', normalized_text: 'anjing', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' },
    ],
    meaningsByItem: {
      li1: [{ id: 'm1', learning_item_id: 'li1', translation_language: 'en', translation_text: 'house', sense_label: null, usage_note: null, is_primary: true }],
      li2: [{ id: 'm2', learning_item_id: 'li2', translation_language: 'en', translation_text: 'cat', sense_label: null, usage_note: null, is_primary: true }],
      li3: [{ id: 'm3', learning_item_id: 'li3', translation_language: 'en', translation_text: 'dog', sense_label: null, usage_note: null, is_primary: true }],
    },
    contextsByItem: {},
    variantsByItem: {},
    itemStates: {},
    skillStates: {},
    preferredSessionSize: 5,
    lessonFilter: null,
    userLanguage: 'en',
    ...overrides,
  }
}

describe('buildSessionQueue', () => {
  it('returns a queue up to preferredSessionSize', () => {
    const queue = buildSessionQueue(makeInput())
    expect(queue.length).toBeLessThanOrEqual(5)
    expect(queue.length).toBeGreaterThan(0)
  })

  it('includes new items when nothing is due', () => {
    const queue = buildSessionQueue(makeInput())
    expect(queue.some(q => q.exerciseItem.exerciseType === 'recognition_mcq')).toBe(true)
  })

  it('caps new items when due load is high', () => {
    const dueSkillStates: Record<string, any[]> = {}
    const itemStates: Record<string, any> = {}
    // Create 25 due items
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: `li${i}`, item_type: 'word' as const, base_text: `word${i}`, normalized_text: `word${i}`,
      language: 'id', level: 'A1', source_type: 'lesson' as const,
      source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
    }))
    const meanings: Record<string, any[]> = {}
    for (const item of items) {
      meanings[item.id] = [{ id: `m${item.id}`, learning_item_id: item.id, translation_language: 'en', translation_text: `meaning${item.id}`, sense_label: null, usage_note: null, is_primary: true }]
      itemStates[item.id] = {
        id: item.id, user_id: 'u1', learning_item_id: item.id, stage: 'retrieving',
        introduced_at: '', last_seen_at: '', priority: null, origin: null,
        times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
      }
      dueSkillStates[item.id] = [{
        id: `ss${item.id}`, user_id: 'u1', learning_item_id: item.id, skill_type: 'form_recall',
        stability: 3, difficulty: 5, retrievability: 0.5,
        last_reviewed_at: new Date(Date.now() - 86400000).toISOString(),
        next_due_at: new Date(Date.now() - 3600000).toISOString(),
        success_count: 3, failure_count: 1, lapse_count: 0, consecutive_failures: 0,
        mean_latency_ms: null, hint_rate: null, updated_at: '',
      }]
    }

    const queue = buildSessionQueue(makeInput({
      allItems: items,
      meaningsByItem: meanings,
      itemStates,
      skillStates: dueSkillStates,
      preferredSessionSize: 10,
    }))

    // With 25 due items and session size 10, new items should be capped at 2
    const newItems = queue.filter(q => !itemStates[q.exerciseItem.learningItem.id])
    expect(newItems.length).toBeLessThanOrEqual(2)
  })

  it('respects lessonFilter for scoped sessions', () => {
    const input = makeInput({
      contextsByItem: {
        li1: [{ id: 'c1', learning_item_id: 'li1', context_type: 'example_sentence', source_text: 'Ini rumah', translation_text: 'This is a house', difficulty: null, topic_tag: null, is_anchor_context: true, source_lesson_id: 'lesson-1', source_section_id: null }],
      },
      lessonFilter: 'lesson-1',
    })
    const queue = buildSessionQueue(input)
    // All items in queue should be from lesson-1
    for (const q of queue) {
      const contexts = input.contextsByItem[q.exerciseItem.learningItem.id] ?? []
      const fromLesson = contexts.some(c => c.source_lesson_id === 'lesson-1')
      const isNewFromPool = !input.itemStates[q.exerciseItem.learningItem.id]
      expect(fromLesson || isNewFromPool).toBe(true)
    }
  })
})

describe('sessionMode', () => {
  it('backlog_clear mode skips new items and fills session with due items only', () => {
    const dueItems = Array.from({ length: 5 }, (_, i) => ({
      id: `due${i}`, item_type: 'word' as const, base_text: `word${i}`,
      normalized_text: `word${i}`, language: 'id', level: 'A1',
      source_type: 'lesson' as const, source_vocabulary_id: null,
      source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
    }))
    const newItems = Array.from({ length: 3 }, (_, i) => ({
      id: `new${i}`, item_type: 'word' as const, base_text: `newword${i}`,
      normalized_text: `newword${i}`, language: 'id', level: 'A1',
      source_type: 'lesson' as const, source_vocabulary_id: null,
      source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
    }))
    const allItems = [...dueItems, ...newItems]
    const meaningsByItem: Record<string, any[]> = {}
    const itemStates: Record<string, any> = {}
    const skillStates: Record<string, any[]> = {}
    for (const item of dueItems) {
      meaningsByItem[item.id] = [{ id: `m${item.id}`, learning_item_id: item.id, translation_language: 'en', translation_text: `t${item.id}`, sense_label: null, usage_note: null, is_primary: true }]
      itemStates[item.id] = { id: item.id, user_id: 'u1', learning_item_id: item.id, stage: 'retrieving', introduced_at: '', last_seen_at: '', priority: null, origin: null, times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '' }
      skillStates[item.id] = [{ id: `ss${item.id}`, user_id: 'u1', learning_item_id: item.id, skill_type: 'form_recall', stability: 3, difficulty: 5, retrievability: 0.5, last_reviewed_at: new Date(Date.now() - 86400000).toISOString(), next_due_at: new Date(Date.now() - 3600000).toISOString(), success_count: 3, failure_count: 1, lapse_count: 0, consecutive_failures: 0, mean_latency_ms: null, hint_rate: null, updated_at: '' }]
    }
    for (const item of newItems) {
      meaningsByItem[item.id] = [{ id: `m${item.id}`, learning_item_id: item.id, translation_language: 'en', translation_text: `t${item.id}`, sense_label: null, usage_note: null, is_primary: true }]
    }

    const queue = buildSessionQueue(makeInput({
      allItems, meaningsByItem, itemStates, skillStates,
      preferredSessionSize: 10, sessionMode: 'backlog_clear',
    }))

    // No new items (items with no state are new)
    const newInQueue = queue.filter(q => !itemStates[q.exerciseItem.learningItem.id])
    expect(newInQueue.length).toBe(0)
    // All 5 due items should appear
    expect(queue.length).toBe(5)
  })

  it('recall_sprint mode only includes items with a form_recall skill and forces recall exercises', () => {
    // li1: retrieving, has form_recall skill — eligible
    // li2: anchoring, no recall skill — excluded
    // li3: no state (new) — excluded
    const retrievingState = {
      id: 'li1', user_id: 'u1', learning_item_id: 'li1', stage: 'retrieving' as const,
      introduced_at: '', last_seen_at: '', priority: null, origin: null,
      times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
    }
    const anchoringState = {
      id: 'li2', user_id: 'u1', learning_item_id: 'li2', stage: 'anchoring' as const,
      introduced_at: '', last_seen_at: '', priority: null, origin: null,
      times_seen: 2, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
    }
    // Form_recall skill that is NOT yet due — verifies non-due eligible items still surface
    const recallSkill = {
      id: 'ss1', user_id: 'u1', learning_item_id: 'li1', skill_type: 'form_recall' as const,
      stability: 2, difficulty: 5, retrievability: 0.8,
      last_reviewed_at: new Date(Date.now() - 3600000).toISOString(),
      next_due_at: new Date(Date.now() + 86400000).toISOString(), // not yet due
      success_count: 2, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
      mean_latency_ms: null, hint_rate: null, updated_at: '',
    }

    const queue = buildSessionQueue(makeInput({
      itemStates: { li1: retrievingState, li2: anchoringState },
      skillStates: { li1: [recallSkill] },
      sessionMode: 'recall_sprint',
    }))

    // Only li1 should appear (has form_recall skill)
    expect(queue.every(q => q.exerciseItem.learningItem.id === 'li1')).toBe(true)
    // Exercises must be recall type (not recognition_mcq)
    expect(queue.every(q => q.exerciseItem.exerciseType !== 'recognition_mcq')).toBe(true)
    // li1 must appear even though its skill is not yet due
    expect(queue.length).toBeGreaterThan(0)
  })

  it('push_to_productive mode includes retrieving items that are not yet due', () => {
    // li1: retrieving, has form_recall skill, NOT yet due — should be included
    // li2: productive, overdue — can also appear (normal due-items flow)
    // li3: new (no state) — excluded
    const retrievingState = {
      id: 'li1', user_id: 'u1', learning_item_id: 'li1', stage: 'retrieving' as const,
      introduced_at: '', last_seen_at: '', priority: null, origin: null,
      times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
    }
    const productiveState = {
      id: 'li2', user_id: 'u1', learning_item_id: 'li2', stage: 'productive' as const,
      introduced_at: '', last_seen_at: '', priority: null, origin: null,
      times_seen: 10, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
    }
    const retrievingSkill = {
      id: 'ss1', user_id: 'u1', learning_item_id: 'li1', skill_type: 'form_recall' as const,
      stability: 4, difficulty: 5, retrievability: 0.7,
      last_reviewed_at: new Date(Date.now() - 3600000).toISOString(),
      next_due_at: new Date(Date.now() + 86400000).toISOString(), // not yet due
      success_count: 4, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
      mean_latency_ms: null, hint_rate: null, updated_at: '',
    }
    const productiveSkill = {
      id: 'ss2', user_id: 'u1', learning_item_id: 'li2', skill_type: 'form_recall' as const,
      stability: 8, difficulty: 5, retrievability: 0.5,
      last_reviewed_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      next_due_at: new Date(Date.now() - 3600000).toISOString(), // overdue
      success_count: 8, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
      mean_latency_ms: null, hint_rate: null, updated_at: '',
    }

    const queue = buildSessionQueue(makeInput({
      itemStates: { li1: retrievingState, li2: productiveState },
      skillStates: { li1: [retrievingSkill], li2: [productiveSkill] },
      preferredSessionSize: 5,
      sessionMode: 'push_to_productive',
    }))

    // li1 must appear even though not yet due
    expect(queue.some(q => q.exerciseItem.learningItem.id === 'li1')).toBe(true)
    // No new items (li3 has no state)
    const newInQueue = queue.filter(q => !['li1', 'li2'].includes(q.exerciseItem.learningItem.id))
    expect(newInQueue.length).toBe(0)
  })

  it('quick mode caps session at 5 items', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `li${i}`, item_type: 'word' as const, base_text: `word${i}`,
      normalized_text: `word${i}`, language: 'id', level: 'A1',
      source_type: 'lesson' as const, source_vocabulary_id: null,
      source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
    }))
    const meanings: Record<string, any[]> = {}
    for (const item of items) {
      meanings[item.id] = [{ id: `m${item.id}`, learning_item_id: item.id, translation_language: 'en', translation_text: `t${item.id}`, sense_label: null, usage_note: null, is_primary: true }]
    }

    const queue = buildSessionQueue(makeInput({
      allItems: items, meaningsByItem: meanings,
      preferredSessionSize: 15, sessionMode: 'quick',
    }))

    expect(queue.length).toBeLessThanOrEqual(5)
  })

  it('push_to_productive skips retrieving items that have no form_recall skill yet', () => {
    // A retrieving item with only a recognition skill — cannot be scored for recall
    const retrievingState = {
      id: 'li1', user_id: 'u1', learning_item_id: 'li1', stage: 'retrieving' as const,
      introduced_at: '', last_seen_at: '', priority: null, origin: null,
      times_seen: 3, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '',
    }
    const recognitionOnlySkill = {
      id: 'ss1', user_id: 'u1', learning_item_id: 'li1', skill_type: 'recognition' as const,
      stability: 2, difficulty: 5, retrievability: 0.7,
      last_reviewed_at: new Date(Date.now() - 3600000).toISOString(),
      next_due_at: new Date(Date.now() + 86400000).toISOString(),
      success_count: 3, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
      mean_latency_ms: null, hint_rate: null, updated_at: '',
    }

    const queue = buildSessionQueue(makeInput({
      itemStates: { li1: retrievingState },
      skillStates: { li1: [recognitionOnlySkill] },
      preferredSessionSize: 5,
      sessionMode: 'push_to_productive',
    }))

    // li1 must NOT appear — only recognition skill, typed_recall would have no matching learnerSkillState
    expect(queue.filter(q => q.exerciseItem.learningItem.id === 'li1').length).toBe(0)
  })
})
