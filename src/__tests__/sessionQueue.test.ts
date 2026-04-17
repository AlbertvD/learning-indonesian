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

  it('new items are capped by preferredSessionSize', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(`new${i}`))
    const result = buildSessionQueue(baseInput({
      allItems: items,
      meaningsByItem: Object.fromEntries(items.map(it => [it.id, [makeMeaning(it.id)]])),
      preferredSessionSize: 3,
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
    const ids = result.map((r: SessionQueueItem) => r.exerciseItem.learningItem?.id)
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
    const ids = result.map((r: SessionQueueItem) => r.exerciseItem.learningItem?.id)
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

  it('item with two due skills produces only one queue entry — most-overdue skill wins', () => {
    // An item with multiple due skills should appear at most once per session.
    // Showing the same word multiple times violates spaced repetition intent.
    // The remaining due skill carries over to the next session.
    const item = makeItem('i1')
    const result = buildSessionQueue(baseInput({
      allItems: [item],
      meaningsByItem: { i1: [makeMeaning('i1')] },
      itemStates: { i1: makeItemState('i1', 'retrieving') },
      skillStates: { i1: [
        makeSkillState('i1', { skill_type: 'recognition', next_due_at: pastDate(3) }), // more overdue
        makeSkillState('i1', { skill_type: 'form_recall', id: 'skill-i1-form', next_due_at: pastDate(1) }),
      ]},
      preferredSessionSize: 25,
    }))
    expect(result).toHaveLength(1)
    // The most overdue skill (recognition, 3 days ago) is served
    expect(result[0].exerciseItem.skillType).toBe('recognition')
  })
})

describe('makeGrammarExercise — cloze_mcq explanation plumb-through', () => {
  it('populates clozeMcqData.explanationText when the variant payload contains it', async () => {
    const { makeGrammarExercise } = await import('@/lib/sessionQueue')
    const pattern = {
      id: 'pat-1',
      name: 'bukan vs tidak',
      introduced_by_lesson_order: 3,
    } as unknown as Parameters<typeof makeGrammarExercise>[0]
    const variant = {
      id: 'var-1',
      grammar_pattern_id: 'pat-1',
      context_id: null,
      exercise_type: 'cloze_mcq',
      payload_json: {
        sentence: 'Ini ___ buku.',
        translation: 'Dit is geen boek.',
        options: ['bukan', 'tidak'],
        explanationText: 'bukan negates nouns; tidak negates verbs/adjectives.',
      },
      answer_key_json: { correctOptionId: 'bukan' },
      is_active: true,
      created_at: '',
      updated_at: '',
    } as unknown as Parameters<typeof makeGrammarExercise>[1]

    const exercise = makeGrammarExercise(pattern, variant)

    expect(exercise.exerciseType).toBe('cloze_mcq')
    expect(exercise.clozeMcqData?.explanationText).toBe(
      'bukan negates nouns; tidak negates verbs/adjectives.'
    )
  })

  it('leaves explanationText undefined when the payload omits it', async () => {
    const { makeGrammarExercise } = await import('@/lib/sessionQueue')
    const pattern = {
      id: 'pat-2',
      name: 'test',
      introduced_by_lesson_order: 3,
    } as unknown as Parameters<typeof makeGrammarExercise>[0]
    const variant = {
      id: 'var-2',
      grammar_pattern_id: 'pat-2',
      context_id: null,
      exercise_type: 'cloze_mcq',
      payload_json: {
        sentence: 'Ini ___ buku.',
        translation: 'Dit is geen boek.',
        options: ['bukan', 'tidak'],
      },
      answer_key_json: { correctOptionId: 'bukan' },
      is_active: true,
      created_at: '',
      updated_at: '',
    } as unknown as Parameters<typeof makeGrammarExercise>[1]

    const exercise = makeGrammarExercise(pattern, variant)
    expect(exercise.clozeMcqData?.explanationText).toBeUndefined()
  })

  it('makePublishedExercise: populates clozeMcqData.explanationText from payload_json', async () => {
    const { makePublishedExercise } = await import('@/lib/sessionQueue')
    const item = {
      id: 'item-1', item_type: 'word' as const, base_text: 'bukan', normalized_text: 'bukan',
      language: 'id', level: 'A1', source_type: 'lesson' as const, source_vocabulary_id: null,
      source_card_id: null, notes: null, is_active: true, created_at: '', updated_at: '',
    }
    const context = {
      id: 'ctx-1', learning_item_id: 'item-1', context_type: 'example_sentence',
      source_text: 'Ini bukan buku.', translation_text: 'Dit is geen boek.',
      difficulty: null, topic_tag: null, is_anchor_context: false,
      source_lesson_id: null, source_section_id: null,
    } as unknown as Parameters<typeof makePublishedExercise>[2]
    const variant = {
      id: 'var-3', grammar_pattern_id: null, context_id: 'ctx-1',
      exercise_type: 'cloze_mcq',
      payload_json: {
        sentence: 'Ini ___ buku.',
        translation: 'Dit is geen boek.',
        options: ['bukan', 'tidak'],
        explanationText: 'Use bukan for nominal negation.',
      },
      answer_key_json: { correctOptionId: 'bukan' },
      is_active: true, created_at: '', updated_at: '',
    } as unknown as Parameters<typeof makePublishedExercise>[3]

    const exercise = makePublishedExercise(item, [], context, variant)
    expect(exercise.clozeMcqData?.explanationText).toBe('Use bukan for nominal negation.')
  })
})
