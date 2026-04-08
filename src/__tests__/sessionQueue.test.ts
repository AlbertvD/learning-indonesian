// src/__tests__/sessionQueue.test.ts
import { describe, it, expect } from 'vitest'
import { buildSessionQueue } from '@/lib/sessionQueue'
import type { SessionBuildInput } from '@/lib/sessionQueue'
import type { LearningItem, LearnerItemState, LearnerSkillState, ItemMeaning, SessionQueueItem } from '@/types/learning'

// ---- helpers ----

function makeItem(id: string): LearningItem {
  return { id, item_type: 'word', base_text: id, normalized_text: id, language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '' }
}

function makeItemState(itemId: string, stage: LearnerItemState['stage']): LearnerItemState {
  return { id: 'state-' + itemId, user_id: 'u1', learning_item_id: itemId, stage, introduced_at: '', last_seen_at: '', priority: null, origin: null, times_seen: 1, is_leech: false, suspended: false, gate_check_passed: null, updated_at: '' }
}

function makeMeaning(itemId: string): ItemMeaning {
  return { id: 'm-' + itemId, learning_item_id: itemId, translation_language: 'en', translation_text: 'word', is_primary: true, sense_label: null, usage_note: null }
}

function makeSkillState(itemId: string, overrides: Partial<LearnerSkillState> = {}): LearnerSkillState {
  return {
    id: 'skill-' + itemId,
    user_id: 'u1',
    learning_item_id: itemId,
    skill_type: 'recognition',
    stability: 2.0,
    difficulty: 5.0,
    retrievability: 0.9,
    last_reviewed_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    next_due_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago = due
    success_count: 5,
    failure_count: 0,
    lapse_count: 0,
    consecutive_failures: 0,
    mean_latency_ms: null,
    hint_rate: null,
    updated_at: '',
    ...overrides,
  }
}

function futureDate(days = 5): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function pastDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function baseInput(overrides: Partial<SessionBuildInput> = {}): SessionBuildInput {
  return {
    allItems: [],
    meaningsByItem: {},
    contextsByItem: {},
    variantsByItem: {},
    itemStates: {},
    skillStates: {},
    preferredSessionSize: 20,
    dailyNewItemsLimit: 5,
    lessonFilter: null,
    userLanguage: 'en',
    ...overrides,
  }
}

// ---- tests ----

describe('buildSessionQueue — core', () => {
  it('returns empty queue when no items', () => {
    expect(buildSessionQueue(baseInput())).toHaveLength(0)
  })

  it('includes due items', () => {
    const item = makeItem('i1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [makeMeaning('i1')] },
      itemStates: { i1: makeItemState('i1', 'anchoring') },
      skillStates: { i1: [makeSkillState('i1')] }, // due 2 days ago
    }))
    expect(result).toHaveLength(1)
  })

  it('excludes items not yet due', () => {
    const item = makeItem('i1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [makeMeaning('i1')] },
      itemStates: { i1: makeItemState('i1', 'anchoring') },
      skillStates: { i1: [makeSkillState('i1', { next_due_at: futureDate(5) })] },
    }))
    expect(result).toHaveLength(0)
  })

  it('respects preferredSessionSize cap', () => {
    const items = Array.from({ length: 30 }, (_, i) => makeItem(`i${i}`))
    const result = buildSessionQueue(baseInput({
      allItems: items,
      meaningsByItem: Object.fromEntries(items.map(it => [it.id, [makeMeaning(it.id)]])),
      itemStates: Object.fromEntries(items.map(it => [it.id, makeItemState(it.id, 'anchoring')])),
      skillStates: Object.fromEntries(items.map(it => [it.id, [makeSkillState(it.id)]])),
      preferredSessionSize: 10,
    }))
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('respects dailyNewItemsLimit for new items', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(`new${i}`))
    const result = buildSessionQueue(baseInput({
      allItems: items,
      meaningsByItem: Object.fromEntries(items.map(it => [it.id, [makeMeaning(it.id)]])),
      dailyNewItemsLimit: 3,
      preferredSessionSize: 20,
    }))
    expect(result.length).toBeLessThanOrEqual(3)
  })
})

describe('buildSessionQueue — FSRS scheduling (the core fix)', () => {
  it('anchoring item with future next_due_at is NOT included', () => {
    const item = makeItem('anchor1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { anchor1: [makeMeaning('anchor1')] },
      itemStates: { anchor1: makeItemState('anchor1', 'anchoring') },
      skillStates: { anchor1: [makeSkillState('anchor1', { next_due_at: futureDate(3) })] },
    }))
    // KEY: anchoring items must NOT bypass FSRS scheduling
    expect(result).toHaveLength(0)
  })

  it('anchoring item with past next_due_at IS included', () => {
    const item = makeItem('anchor1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { anchor1: [makeMeaning('anchor1')] },
      itemStates: { anchor1: makeItemState('anchor1', 'anchoring') },
      skillStates: { anchor1: [makeSkillState('anchor1')] }, // due 2 days ago
    }))
    expect(result).toHaveLength(1)
  })

  it('suspended items are excluded regardless of due date', () => {
    const item = makeItem('sus1')
    const state = makeItemState('sus1', 'anchoring')
    state.suspended = true
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { sus1: [makeMeaning('sus1')] },
      itemStates: { sus1: state },
      skillStates: { sus1: [makeSkillState('sus1')] },
    }))
    expect(result).toHaveLength(0)
  })

  it('most-overdue items appear before less-overdue items', () => {
    const items = [makeItem('overdue10'), makeItem('overdue1')]
    const result = buildSessionQueue(baseInput({
      allItems: items,
      meaningsByItem: Object.fromEntries(items.map(it => [it.id, [makeMeaning(it.id)]])),
      itemStates: Object.fromEntries(items.map(it => [it.id, makeItemState(it.id, 'retrieving')])),
      skillStates: {
        overdue10: [makeSkillState('overdue10', { next_due_at: pastDate(10) })],
        overdue1: [makeSkillState('overdue1', { next_due_at: pastDate(1) })],
      },
    }))
    // overdue10 should come before overdue1 in the queue
    const ids = result.map((r: SessionQueueItem) => r.exerciseItem.learningItem.id)
    expect(ids.indexOf('overdue10')).toBeLessThan(ids.indexOf('overdue1'))
  })
})

describe('buildSessionQueue — session modes', () => {
  it('backlog_clear: excludes new items', () => {
    const newItem = makeItem('new1')
    const result = buildSessionQueue(baseInput({
      allItems: [newItem],
      meaningsByItem: { new1: [makeMeaning('new1')] },
      sessionMode: 'backlog_clear',
    }))
    expect(result).toHaveLength(0)
  })

  it('quick: caps session at 5 items', () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem(`i${i}`))
    const result = buildSessionQueue(baseInput({
      allItems: items,
      meaningsByItem: Object.fromEntries(items.map(it => [it.id, [makeMeaning(it.id)]])),
      itemStates: Object.fromEntries(items.map(it => [it.id, makeItemState(it.id, 'anchoring')])),
      skillStates: Object.fromEntries(items.map(it => [it.id, [makeSkillState(it.id)]])),
      sessionMode: 'quick',
      preferredSessionSize: 20,
    }))
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('standard: includes both due items and new items', () => {
    const dueItem = makeItem('due1')
    const newItem = makeItem('new1')
    const result = buildSessionQueue(baseInput({
      allItems: [dueItem, newItem],
      meaningsByItem: { due1: [makeMeaning('due1')], new1: [makeMeaning('new1')] },
      itemStates: { due1: makeItemState('due1', 'retrieving') },
      skillStates: { due1: [makeSkillState('due1')] },
    }))
    const ids = result.map((r: SessionQueueItem) => r.exerciseItem.learningItem.id)
    expect(ids).toContain('due1')
    expect(ids).toContain('new1')
  })

  it('lesson-filtered session bypasses lesson gate — user explicitly chose the lesson', () => {
    const item = makeItem('new1')
    // Simulate: item is new, lessonOrder present (gate would normally block it),
    // but lessonFilter is set → gate is skipped
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { new1: [makeMeaning('new1')] },
      contextsByItem: {
        new1: [{ id: 'ctx1', learning_item_id: 'new1', context_type: 'example_sentence',
          source_text: 'test', translation_text: 'test', difficulty: null, topic_tag: null,
          is_anchor_context: false, source_lesson_id: 'lesson-abc', source_section_id: null }],
      },
      lessonFilter: 'lesson-abc',
      lessonOrder: { 'lesson-abc': 2 },
      // No itemStates → stage 'new', would be blocked by gate in global session
    }))
    expect(result.length).toBeGreaterThan(0)
  })

  it('unknown/removed modes fall back to standard without crashing', () => {
    expect(() => buildSessionQueue(baseInput({ sessionMode: 'recall_sprint' as never }))).not.toThrow()
    expect(() => buildSessionQueue(baseInput({ sessionMode: 'push_to_productive' as never }))).not.toThrow()
  })
})

describe('buildSessionQueue — skill-type targeting (FSRS contract)', () => {
  it('due recognition skill produces a recognition_mcq exercise', () => {
    const item = makeItem('i1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [makeMeaning('i1')] },
      itemStates: { i1: makeItemState('i1', 'anchoring') },
      skillStates: { i1: [makeSkillState('i1', { skill_type: 'recognition' })] },
    }))
    expect(result).toHaveLength(1)
    expect(result[0].exerciseItem.skillType).toBe('recognition')
    expect(result[0].exerciseItem.exerciseType).toBe('recognition_mcq')
  })

  it('due meaning_recall skill produces a meaning_recall exercise', () => {
    const item = makeItem('i1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [makeMeaning('i1')] },
      itemStates: { i1: makeItemState('i1', 'retrieving') },
      skillStates: { i1: [makeSkillState('i1', { skill_type: 'meaning_recall' })] },
    }))
    expect(result).toHaveLength(1)
    expect(result[0].exerciseItem.skillType).toBe('meaning_recall')
  })

  it('due form_recall skill produces a form_recall exercise', () => {
    const item = makeItem('i1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [makeMeaning('i1')] },
      itemStates: { i1: makeItemState('i1', 'retrieving') },
      skillStates: { i1: [makeSkillState('i1', { skill_type: 'form_recall' })] },
    }))
    expect(result).toHaveLength(1)
    expect(result[0].exerciseItem.skillType).toBe('form_recall')
  })

  it('item with two due skills produces two queue entries — one per skill', () => {
    const item = makeItem('i1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [makeMeaning('i1')] },
      itemStates: { i1: makeItemState('i1', 'retrieving') },
      skillStates: { i1: [
        makeSkillState('i1', { skill_type: 'recognition' }),
        makeSkillState('i1', { skill_type: 'form_recall', id: 'skill-i1-form' }),
      ]},
      preferredSessionSize: 25,
    }))
    expect(result).toHaveLength(2)
    const skillTypes = result.map(r => r.exerciseItem.skillType)
    expect(skillTypes).toContain('recognition')
    expect(skillTypes).toContain('form_recall')
  })
})
