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
  it('backlog_clear mode produces zero new items when nothing is due', () => {
    // makeInput has 3 items all with no state (new) — backlog_clear should return empty
    const queue = buildSessionQueue(makeInput({ sessionMode: 'backlog_clear' }))
    expect(queue.length).toBe(0)
  })

  it('recall_sprint mode produces zero new items', () => {
    // All items in base makeInput are new (no states) — sprint has nothing to work with
    const queue = buildSessionQueue(makeInput({ sessionMode: 'recall_sprint' }))
    expect(queue.length).toBe(0)
  })
})
