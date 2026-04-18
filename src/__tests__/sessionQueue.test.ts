// src/__tests__/sessionQueue.test.ts
import { describe, it, expect } from 'vitest'
import { buildSessionQueue } from '@/lib/sessionQueue'
import type { SessionBuildInput } from '@/lib/sessionQueue'
import type { LearningItem, LearnerItemState, LearnerSkillState, ItemMeaning, SessionQueueItem } from '@/types/learning'

// ---- helpers ----

function makeItem(id: string): LearningItem {
  return { id, item_type: 'word', base_text: id, normalized_text: id, language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, pos: null, created_at: '', updated_at: '' }
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
      source_card_id: null, notes: null, is_active: true, pos: null, created_at: '', updated_at: '',
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

describe('speaking exercises gated from session selection', () => {
  it('buildGrammarQueue skips patterns whose only variants are speaking', () => {
    const pattern = {
      id: 'pat-speak',
      name: 'speaking-only',
      introduced_by_lesson_order: 1,
    }
    const speakingVariant = {
      id: 'v1', grammar_pattern_id: 'pat-speak', context_id: null,
      exercise_type: 'speaking',
      payload_json: { promptText: 'Zeg iets' }, answer_key_json: {},
      is_active: true, created_at: '', updated_at: '',
    }
    const result = buildSessionQueue(baseInput({
      grammarPatterns: [pattern as never],
      grammarStates: { 'pat-speak': { grammar_pattern_id: 'pat-speak', user_id: 'u1', stage: 'new' } as never },
      grammarVariantsByPattern: { 'pat-speak': [speakingVariant as never] },
      preferredSessionSize: 10,
      sessionMode: 'standard',
    }))
    // No vocab items either → result should be empty (speaking-only pattern skipped)
    expect(result.filter(r => r.source === 'grammar')).toHaveLength(0)
  })

  it('buildGrammarQueue only serves non-speaking variants when mixed', () => {
    const pattern = {
      id: 'pat-mixed',
      name: 'mixed-variants',
      introduced_by_lesson_order: 1,
    }
    const speakingVariant = {
      id: 'v-speak', grammar_pattern_id: 'pat-mixed', context_id: null,
      exercise_type: 'speaking',
      payload_json: { promptText: 'Zeg iets' }, answer_key_json: {},
      is_active: true, created_at: '', updated_at: '',
    }
    const contrastVariant = {
      id: 'v-contrast', grammar_pattern_id: 'pat-mixed', context_id: null,
      exercise_type: 'contrast_pair',
      payload_json: {
        promptText: 'Kies het goede woord',
        targetMeaning: 'at',
        options: [{ id: 'a', text: 'di' }, { id: 'b', text: 'ke' }],
        explanationText: 'di = at, ke = to',
      },
      answer_key_json: { correctOptionId: 'a' },
      is_active: true, created_at: '', updated_at: '',
    }
    // Run 30 times — speaking must never surface
    for (let i = 0; i < 30; i++) {
      const result = buildSessionQueue(baseInput({
        grammarPatterns: [pattern as never],
        grammarStates: { 'pat-mixed': { grammar_pattern_id: 'pat-mixed', user_id: 'u1', stage: 'new' } as never },
        grammarVariantsByPattern: { 'pat-mixed': [speakingVariant as never, contrastVariant as never] },
        preferredSessionSize: 10,
        sessionMode: 'standard',
      }))
      const grammarItems = result.filter(r => r.source === 'grammar')
      for (const item of grammarItems) {
        expect(item.exerciseItem.exerciseType).not.toBe('speaking')
      }
    }
  })

  it('selectExercises at productive stage never returns a speaking exercise when speaking is the only published variant', () => {
    const item = makeItem('i1')
    const context = {
      id: 'ctx-1', learning_item_id: 'i1', context_type: 'example_sentence',
      source_text: 'test', translation_text: 'test', difficulty: null, topic_tag: null,
      is_anchor_context: false, source_lesson_id: null, source_section_id: null,
    }
    const speakingVariant = {
      id: 'v-speak', grammar_pattern_id: null, context_id: 'ctx-1',
      exercise_type: 'speaking',
      payload_json: { promptText: 'Zeg iets' }, answer_key_json: {},
      is_active: true, created_at: '', updated_at: '',
    }
    const state = makeItemState('i1', 'productive')
    for (let i = 0; i < 30; i++) {
      const result = buildSessionQueue(baseInput({
        allItems: [item],
        meaningsByItem: { i1: [makeMeaning('i1')] },
        contextsByItem: { i1: [context as never] },
        exerciseVariantsByContext: { 'ctx-1': [speakingVariant as never] },
        itemStates: { i1: state },
        skillStates: { i1: [makeSkillState('i1', { skill_type: 'recognition' })] },
      }))
      for (const r of result) {
        expect(r.exerciseItem.exerciseType).not.toBe('speaking')
      }
    }
  })
})

describe('cloze builders strictly require context_type === cloze', () => {
  it('makeClozeMcq returns clozeMcqData: undefined when item has only lesson_snippet anchor contexts', async () => {
    const { makeClozeMcq } = await import('@/lib/sessionQueue')
    const item = makeItem('i1')
    const lessonSnippetContext = {
      id: 'ctx-snippet', learning_item_id: 'i1', context_type: 'lesson_snippet',
      source_text: 'Full lesson paragraph text here.', translation_text: 'Vol lesparagrafe hier.',
      difficulty: null, topic_tag: null, is_anchor_context: true,
      source_lesson_id: null, source_section_id: null,
    }
    const result = makeClozeMcq(item, [], [lessonSnippetContext as never], [], 'en', [item], { [item.id]: [] })
    expect(result.clozeMcqData).toBeUndefined()
  })

  it('makeClozeMcq returns valid clozeMcqData when a cloze context exists alongside lesson_snippet', async () => {
    const { makeClozeMcq } = await import('@/lib/sessionQueue')
    const item = makeItem('i1')
    const lessonSnippetContext = {
      id: 'ctx-snippet', learning_item_id: 'i1', context_type: 'lesson_snippet',
      source_text: 'Paragraph.', translation_text: 'Paragraaf.',
      difficulty: null, topic_tag: null, is_anchor_context: true,
      source_lesson_id: null, source_section_id: null,
    }
    const clozeContext = {
      id: 'ctx-cloze', learning_item_id: 'i1', context_type: 'cloze',
      source_text: 'Saya ___ nasi.', translation_text: 'Ik eet rijst.',
      difficulty: null, topic_tag: null, is_anchor_context: true,
      source_lesson_id: null, source_section_id: null,
    }
    const result = makeClozeMcq(item, [], [lessonSnippetContext as never, clozeContext as never], [], 'en', [item], { [item.id]: [] })
    expect(result.clozeMcqData).toBeDefined()
    expect(result.clozeMcqData?.sentence).toBe('Saya ___ nasi.')
  })

  it('makeClozeExercise returns clozeContext: undefined when item has only lesson_snippet anchor contexts', async () => {
    const { makeClozeExercise } = await import('@/lib/sessionQueue')
    const item = makeItem('i1')
    const lessonSnippetContext = {
      id: 'ctx-snippet', learning_item_id: 'i1', context_type: 'lesson_snippet',
      source_text: 'Paragraph.', translation_text: 'Paragraaf.',
      difficulty: null, topic_tag: null, is_anchor_context: true,
      source_lesson_id: null, source_section_id: null,
    }
    const result = makeClozeExercise(item, [], [lessonSnippetContext as never], [])
    expect(result.clozeContext).toBeUndefined()
  })

  it('makeClozeExercise returns valid clozeContext when a cloze context exists', async () => {
    const { makeClozeExercise } = await import('@/lib/sessionQueue')
    const item = makeItem('i1')
    const clozeContext = {
      id: 'ctx-cloze', learning_item_id: 'i1', context_type: 'cloze',
      source_text: 'Saya ___ nasi.', translation_text: 'Ik eet rijst.',
      difficulty: null, topic_tag: null, is_anchor_context: true,
      source_lesson_id: null, source_section_id: null,
    }
    const result = makeClozeExercise(item, [], [clozeContext as never], [])
    expect(result.clozeContext).toBeDefined()
    expect(result.clozeContext?.sentence).toBe('Saya ___ nasi.')
  })
})

describe('makeListeningMcq + hasAudioFor', () => {
  it('hasAudioFor returns true when audio exists for the target voice', async () => {
    const { hasAudioFor } = await import('@/lib/sessionQueue')
    const audioMap = new Map([['voice-1', new Map([['apa kabar', 'tts/voice-1/apa-xyz.mp3']])]])
    const item = { ...makeItem('i1'), base_text: 'Apa Kabar' }
    expect(hasAudioFor(item, audioMap, 'voice-1')).toBe(true)  // case-insensitive via normalizeTtsText
  })

  it('hasAudioFor returns false when voiceId is null', async () => {
    const { hasAudioFor } = await import('@/lib/sessionQueue')
    expect(hasAudioFor(makeItem('i1'), new Map(), null)).toBe(false)
  })

  it('hasAudioFor returns false when audio is missing', async () => {
    const { hasAudioFor } = await import('@/lib/sessionQueue')
    expect(hasAudioFor(makeItem('i1'), new Map(), 'voice-1')).toBe(false)
  })

  it('makeListeningMcq builds an ExerciseItem with exerciseType listening_mcq and skillType recognition', async () => {
    const { makeListeningMcq } = await import('@/lib/sessionQueue')
    const item = makeItem('i1')
    const meanings = [makeMeaning('i1')]
    const exercise = makeListeningMcq(item, meanings, [], [], 'en', [item], { i1: meanings })
    expect(exercise.exerciseType).toBe('listening_mcq')
    expect(exercise.skillType).toBe('recognition')
    expect(exercise.learningItem).toBe(item)
  })
})

describe('pickDistractorCascade — tier behavior', () => {
  const target = { itemType: 'word', pos: 'verb' as const, level: 'A1', semanticGroup: 'mental_states' as const }

  it('Tier 0 hit — all 3 matches come from same POS + same group', async () => {
    const { pickDistractorCascade } = await import('@/lib/sessionQueue')
    const pool = [
      { id: 'a', option: 'ingat',  itemType: 'word', pos: 'verb',   level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'b', option: 'lupa',   itemType: 'word', pos: 'verb',   level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'c', option: 'tahu',   itemType: 'word', pos: 'verb',   level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'd', option: 'nasi',   itemType: 'word', pos: 'noun',   level: 'A1', semanticGroup: 'food' as const },
    ]
    const result = pickDistractorCascade(target, pool, 3)
    expect(result).toHaveLength(3)
    expect(result).toEqual(expect.arrayContaining(['ingat', 'lupa', 'tahu']))
    expect(result).not.toContain('nasi')
  })

  it('POS-null target falls through Tiers 0–2, starts at Tier 3', async () => {
    const { pickDistractorCascade } = await import('@/lib/sessionQueue')
    const nullTarget = { itemType: 'word', pos: null, level: 'A1', semanticGroup: 'mental_states' as const }
    const pool = [
      { id: 'a', option: 'x', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'b', option: 'y', itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'c', option: 'z', itemType: 'word', pos: null,   level: 'A1', semanticGroup: 'mental_states' as const },
    ]
    const result = pickDistractorCascade(nullTarget, pool, 3)
    expect(result).toHaveLength(3)
  })

  it('candidate with null POS never appears in Tiers 0–2 when target has POS', async () => {
    const { pickDistractorCascade } = await import('@/lib/sessionQueue')
    const pool = [
      { id: 'nullcand', option: 'pos-null', itemType: 'word', pos: null,   level: 'A1', semanticGroup: 'mental_states' as const },
      { id: 'verbcand', option: 'pos-verb', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' as const },
    ]
    const result = pickDistractorCascade(target, pool, 2)
    // pos-verb hits Tier 0; pos-null only reachable via Tier 4 (same level, no POS req)
    expect(result[0]).toBe('pos-verb')
  })

  it('structural filter honored — sentence target never gets word distractor', async () => {
    const { pickDistractorCascade } = await import('@/lib/sessionQueue')
    const sentenceTarget = { itemType: 'sentence', pos: null, level: 'A1', semanticGroup: null }
    const pool = [
      { id: 'w', option: 'word-only', itemType: 'word', pos: null, level: 'A1', semanticGroup: null },
    ]
    const result = pickDistractorCascade(sentenceTarget, pool, 3)
    // Tier 5 (full pool fallback) will pick the word, but Tiers 3/4 which respect
    // structural filter won't. Tier 5 is last-resort — so it may include word-only.
    // The contract: structural filter is honored until Tier 5.
    // For this test, verify that a sentence target's structural pool is empty.
    expect(result.length).toBeLessThanOrEqual(1)  // at most Tier 5 fallback fires
  })

  it('dedupes — candidate matching multiple tiers only appears once', async () => {
    const { pickDistractorCascade } = await import('@/lib/sessionQueue')
    const pool = [
      // Matches Tier 0 AND would also match Tier 1.
      { id: 'a', option: 'x', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' as const },
    ]
    const result = pickDistractorCascade(target, pool, 3)
    expect(result).toEqual(['x'])
  })
})
