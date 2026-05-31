import { describe, it, expect } from 'vitest'
import { buildCanonicalKey } from '@/lib/capabilities'
import {
  selectPublishableItems,
  projectVocab,
  projectItemsFromTypedRows,
  type VocabStagingItem,
  type VocabStagingClozeContext,
} from '../../projectors/vocab'
import type { TypedItemRow } from '../../loadFromDb'

const baseItem = (overrides: Partial<VocabStagingItem>): VocabStagingItem => ({
  base_text: 'halo',
  item_type: 'word',
  context_type: 'vocabulary_list',
  translation_nl: 'hallo',
  translation_en: 'hello',
  pos: 'greeting',
  level: 'A1',
  review_status: 'pending_review',
  ...overrides,
})

describe('selectPublishableItems — deferred-dialogue gate (legacy 422–465)', () => {
  it('publishes a dialogue_chunk that has BOTH translation_nl AND a cloze context', () => {
    const items = [
      baseItem({
        base_text: 'Apa kabar',
        item_type: 'dialogue_chunk',
        translation_nl: 'Hoe gaat het',
        context_type: 'dialogue',
      }),
    ]
    const cloze: VocabStagingClozeContext[] = [
      { learning_item_slug: 'apa kabar', source_text: 'Apa ___', translation_text: 'Hoe ___' },
    ]
    const { publishable, deferred } = selectPublishableItems({ learningItems: items, clozeContexts: cloze })
    expect(publishable).toHaveLength(1)
    expect(deferred).toHaveLength(0)
  })

  it('defers a dialogue_chunk missing translation_nl', () => {
    const items = [
      baseItem({
        base_text: 'Apa kabar',
        item_type: 'dialogue_chunk',
        translation_nl: '',
        context_type: 'dialogue',
      }),
    ]
    const cloze: VocabStagingClozeContext[] = [
      { learning_item_slug: 'apa kabar', source_text: 'Apa ___', translation_text: 'Hoe ___' },
    ]
    const { publishable, deferred, deferredKeys } = selectPublishableItems({ learningItems: items, clozeContexts: cloze })
    expect(publishable).toHaveLength(0)
    expect(deferred).toHaveLength(1)
    expect(deferredKeys.has('Apa kabar')).toBe(true)
  })

  it('defers a dialogue_chunk missing a matching cloze context', () => {
    const items = [
      baseItem({
        base_text: 'Apa kabar',
        item_type: 'dialogue_chunk',
        translation_nl: 'Hoe gaat het',
        context_type: 'dialogue',
      }),
    ]
    const { publishable, deferred } = selectPublishableItems({ learningItems: items, clozeContexts: [] })
    expect(publishable).toHaveLength(0)
    expect(deferred).toHaveLength(1)
  })

  it('non-dialogue_chunk items are never deferred regardless of cloze coverage', () => {
    const items = [baseItem({ base_text: 'halo', item_type: 'word' })]
    const { publishable, deferred } = selectPublishableItems({ learningItems: items, clozeContexts: [] })
    expect(publishable).toHaveLength(1)
    expect(deferred).toHaveLength(0)
  })
})

describe("projectVocab — re-publish refreshes 'published' items", () => {
  // Regression: prior implementation filtered out review_status='published',
  // so a second publish never re-upserted items whose translations were
  // enriched in between runs. Lesson-9 hit this on 2026-05-13: 87/92 items
  // got fresh EN translations from the LLM but learningItems: 0 were
  // upserted because every item was marked 'published' from a prior run.
  it("includes review_status='published' items in perItemPlans", () => {
    const out = projectVocab({
      lessonNumber: 9,
      lessonId: 'lesson-9-uuid',
      level: 'A1',
      sections: [],
      learningItems: [
        baseItem({ base_text: 'makan', review_status: 'published' }),
        baseItem({ base_text: 'minum', review_status: 'pending_review' }),
      ],
      clozeContexts: [],
    })
    const baseTexts = out.perItemPlans.map((p) => p.item.base_text).sort()
    expect(baseTexts).toEqual(['makan', 'minum'])
  })

  it("still excludes other non-publishable statuses (e.g. 'deprecated')", () => {
    const out = projectVocab({
      lessonNumber: 9,
      lessonId: 'lesson-9-uuid',
      level: 'A1',
      sections: [],
      learningItems: [
        baseItem({ base_text: 'makan', review_status: 'published' }),
        baseItem({ base_text: 'old-word', review_status: 'deprecated' as 'published' }),
      ],
      clozeContexts: [],
    })
    const baseTexts = out.perItemPlans.map((p) => p.item.base_text)
    expect(baseTexts).toEqual(['makan'])
  })
})

describe('projectVocab — Decision 5b: contextual_cloze emission driven by clozeContexts', () => {
  it('emits zero contextual_cloze capabilities when there are no cloze contexts', () => {
    const out = projectVocab({
      lessonNumber: 9,
      lessonId: 'lesson-9-uuid',
      level: 'A1',
      sections: [
        {
          id: 'sec1',
          title: 'Dialoog',
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [{ text: 'Apa kabar', speaker: 'Andi' }],
          },
        },
      ],
      learningItems: [baseItem({})],
      clozeContexts: [],
    })
    expect(out.contextualClozeCapabilities).toHaveLength(0)
  })

  it('emits a contextual_cloze capability for each dialogue line whose slug matches a cloze context', () => {
    const out = projectVocab({
      lessonNumber: 9,
      lessonId: 'lesson-9-uuid',
      level: 'A1',
      sections: [
        {
          id: 'sec1',
          title: 'Dialoog',
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [
              { text: 'Apa kabar', speaker: 'Andi' },
              { text: 'Baik baik', speaker: 'Budi' },
            ],
          },
        },
      ],
      learningItems: [baseItem({})],
      clozeContexts: [
        { learning_item_slug: 'apa kabar', source_text: '___ kabar?', translation_text: 'Hoe ___?' },
      ],
    })
    expect(out.contextualClozeCapabilities).toHaveLength(1)
    expect(out.contextualClozeCapabilities[0].sourceKind).toBe('dialogue_line')
    expect(out.contextualClozeCapabilities[0].sourceRef).toContain('lesson-9/section-1/line-0')
  })
})

// ---------------------------------------------------------------------------
// Task 4: projectItemsFromTypedRows — pure item projector from DB rows
// ---------------------------------------------------------------------------

const baseTypedRow = (overrides: Partial<TypedItemRow>): TypedItemRow => ({
  id: 'row-uuid-1',
  section_id: 'section-uuid-1',
  lesson_id: 'lesson-uuid-1',
  display_order: 0,
  source_item_ref: 'lesson-4/section-1/item-0',
  item_type: 'word',
  indonesian_text: 'Halo',
  l1_translation: 'Hallo',
  l2_translation: 'Hello',
  section_kind: 'vocabulary',
  ...overrides,
})

describe('projectItemsFromTypedRows — pure item projector from typed DB rows', () => {
  it('projects a single word item with NL+EN translations', () => {
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out = projectItemsFromTypedRows({
      rows,
      lessonId: 'lesson-uuid-1',
      level: 'A1',
    })

    expect(out.perItemPlans).toHaveLength(1)
    const plan = out.perItemPlans[0]
    // normalized_text = itemSlug(indonesian_text) = lowercase+trim
    expect(plan.learningItemInput.base_text).toBe('Halo')
    expect(plan.normalizedText).toBe('halo')
    expect(plan.learningItemInput.item_type).toBe('word')
    expect(plan.learningItemInput.translation_nl).toBe('Hallo')
    expect(plan.learningItemInput.translation_en).toBe('Hello')
    expect(plan.learningItemInput.level).toBe('A1')
    expect(plan.learningItemInput.language).toBe('id')
    expect(plan.learningItemInput.source_type).toBe('lesson')
  })

  it('projects a phrase item with word+phrase distinction preserved', () => {
    const rows: TypedItemRow[] = [
      baseTypedRow({
        id: 'row-uuid-2',
        source_item_ref: 'lesson-4/section-2/item-1',
        item_type: 'phrase',
        indonesian_text: 'Apa kabar',
        l1_translation: 'Hoe gaat het',
        l2_translation: 'How are you',
        section_kind: 'dialogue',
      }),
    ]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A2' })

    expect(out.perItemPlans).toHaveLength(1)
    const plan = out.perItemPlans[0]
    expect(plan.learningItemInput.item_type).toBe('phrase')
    expect(plan.normalizedText).toBe('apa kabar')
    expect(plan.learningItemInput.translation_nl).toBe('Hoe gaat het')
    expect(plan.learningItemInput.translation_en).toBe('How are you')
    expect(plan.learningItemInput.level).toBe('A2')
  })

  it('handles null l2_translation (EN translation optional)', () => {
    const rows: TypedItemRow[] = [
      baseTypedRow({ l2_translation: null }),
    ]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    const plan = out.perItemPlans[0]
    expect(plan.learningItemInput.translation_nl).toBe('Hallo')
    expect(plan.learningItemInput.translation_en).toBeNull()
  })

  it('produces correct canonical keys for item capabilities', () => {
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    const { capabilities } = out.perItemPlans[0]
    // Each item emits text_recognition, l1_to_id_choice, meaning_recall, form_recall
    expect(capabilities.length).toBeGreaterThanOrEqual(4)
    const capTypes = capabilities.map((c) => c.capabilityType).sort()
    expect(capTypes).toContain('text_recognition')
    expect(capTypes).toContain('l1_to_id_choice')
    expect(capTypes).toContain('meaning_recall')
    expect(capTypes).toContain('form_recall')
    // sourceRef = 'learning_items/<normalized_text>'
    for (const cap of capabilities) {
      expect(cap.sourceRef).toBe('learning_items/halo')
      expect(cap.sourceKind).toBe('item')
      expect(cap.lessonId).toBe('lesson-uuid-1')
      // canonical key shape: cap:v1:item:learning_items/halo:<type>:<direction>:text:<lang>
      expect(cap.canonicalKey).toMatch(/^cap:v1:item:/)
    }
  })

  it('produces stable canonical keys (deterministic, pure)', () => {
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out1 = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    const out2 = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    expect(out1.perItemPlans[0].capabilities.map((c) => c.canonicalKey)).toEqual(
      out2.perItemPlans[0].capabilities.map((c) => c.canonicalKey),
    )
  })

  it('pinned exact canonical_key literals — cutover equivalence guard (FIX 2)', () => {
    // IMPORTANT: These literal strings must be byte-identical to what the legacy
    // capabilityCatalog.ts emits for the same item. FSRS state is keyed on
    // canonical_key, so any drift here would silently orphan learner progress
    // at the Task-6 cutover. If this test fails, the cutover is NOT safe.
    //
    // encodeSegment escapes % and : but NOT /, so the slash is a literal slash.
    // learnerLanguage is 'nl' because typed DB rows guarantee NL (l1_translation
    // non-null). The legacy 'none' fallback is unreachable here.
    const rows: TypedItemRow[] = [baseTypedRow({})] // indonesian_text: 'Halo' → normalizedText: 'halo'
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    const { capabilities } = out.perItemPlans[0]
    const byType = Object.fromEntries(capabilities.map((c) => [c.capabilityType, c.canonicalKey]))

    expect(byType['text_recognition']).toBe(
      'cap:v1:item:learning_items/halo:text_recognition:id_to_l1:text:nl',
    )
    expect(byType['l1_to_id_choice']).toBe(
      'cap:v1:item:learning_items/halo:l1_to_id_choice:l1_to_id:text:nl',
    )
    expect(byType['meaning_recall']).toBe(
      'cap:v1:item:learning_items/halo:meaning_recall:id_to_l1:text:nl',
    )
    expect(byType['form_recall']).toBe(
      'cap:v1:item:learning_items/halo:form_recall:l1_to_id:text:nl',
    )
  })

  it('canonical_key matches buildCanonicalKey tuple — equivalence pin for Task-6 cutover', () => {
    // Explicit equivalence pin: the projector must produce the SAME key as the
    // legacy capabilityCatalog.ts would for the same sourceRef/capabilityType/direction.
    // This test builds the expected key via buildCanonicalKey (same function both paths use)
    // and asserts identity — so a change to buildCanonicalKey's encoding rules would
    // be caught here rather than silently diverging at cutover.
    const sourceRef = 'learning_items/halo'
    const expectedTextRecognition = buildCanonicalKey({
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'text_recognition',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'nl',
    })
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    const textRecog = out.perItemPlans[0].capabilities.find((c) => c.capabilityType === 'text_recognition')
    expect(textRecog?.canonicalKey).toBe(expectedTextRecognition)
  })

  it('produces the anchor context from the item row', () => {
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    const plan = out.perItemPlans[0]
    expect(plan.anchorContext.source_text).toBe('Halo')
    expect(plan.anchorContext.translation_text).toBe('Hallo')
    // context_type MUST be a value the item_contexts CHECK constraint allows.
    // 'lesson_snippet' (NOT section_kind — 'vocabulary' etc. violate the CHECK,
    // which is what broke the first live publish).
    const VALID_ITEM_CONTEXT_TYPES = [
      'example_sentence', 'dialogue', 'cloze', 'lesson_snippet',
      'vocabulary_list', 'exercise_prompt',
    ]
    expect(plan.anchorContext.context_type).toBe('lesson_snippet')
    expect(VALID_ITEM_CONTEXT_TYPES).toContain(plan.anchorContext.context_type)
  })

  it('anchor context_type is CHECK-valid regardless of section_kind (never leaks section_kind)', () => {
    // Regression guard for the first-live-publish bug: section_kind values
    // ('vocabulary'/'expressions'/'numbers') are NOT valid item_contexts.context_type.
    const VALID_ITEM_CONTEXT_TYPES = [
      'example_sentence', 'dialogue', 'cloze', 'lesson_snippet',
      'vocabulary_list', 'exercise_prompt',
    ]
    for (const sk of ['vocabulary', 'expressions', 'numbers'] as const) {
      const out = projectItemsFromTypedRows({
        rows: [baseTypedRow({ section_kind: sk })], lessonId: 'lesson-uuid-1', level: 'A1',
      })
      expect(VALID_ITEM_CONTEXT_TYPES).toContain(out.perItemPlans[0].anchorContext.context_type)
    }
  })

  it('handles multiple items from different sections', () => {
    const rows: TypedItemRow[] = [
      baseTypedRow({ id: 'r1', source_item_ref: 'lesson-4/section-1/item-0', indonesian_text: 'Halo', l1_translation: 'Hallo', l2_translation: 'Hello', section_kind: 'vocabulary' }),
      baseTypedRow({ id: 'r2', source_item_ref: 'lesson-4/section-2/item-0', indonesian_text: 'Makan', l1_translation: 'Eten', l2_translation: 'To eat', section_kind: 'dialogue' }),
    ]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    expect(out.perItemPlans).toHaveLength(2)
    const normalizedTexts = out.perItemPlans.map((p) => p.normalizedText).sort()
    expect(normalizedTexts).toEqual(['halo', 'makan'])
  })

  it('emits all items regardless of whether they are in existing state (skip-if-exists is the writer job)', () => {
    // The projector does NOT filter using existingItemsByNormalizedText.
    // It emits all items; Task 6 (writer) decides which to skip.
    // This test documents that contract explicitly.
    const rows: TypedItemRow[] = [
      baseTypedRow({ id: 'r1', indonesian_text: 'Halo', l1_translation: 'Hallo', l2_translation: 'Hello' }),
      baseTypedRow({ id: 'r2', source_item_ref: 'lesson-4/section-1/item-1', indonesian_text: 'Makan', l1_translation: 'Eten', l2_translation: 'To eat' }),
    ]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    // Both items are projected even if they were already in the DB
    expect(out.perItemPlans).toHaveLength(2)
  })

  it('produces sourceRef as learning_items/<normalized_text>', () => {
    const rows: TypedItemRow[] = [
      baseTypedRow({ indonesian_text: 'Selamat pagi', l1_translation: 'Goedemorgen', l2_translation: 'Good morning' }),
    ]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    const plan = out.perItemPlans[0]
    for (const cap of plan.capabilities) {
      expect(cap.sourceRef).toBe('learning_items/selamat pagi')
    }
  })

  it('anchor context_type is always lesson_snippet, NOT section_kind', () => {
    // section_kind ('dialogue'/'vocabulary'/…) must NOT leak into the anchor
    // context_type — only the 6 item_contexts CHECK values are legal, and the
    // anchor is the introducing lesson snippet. (Regression: the first live
    // publish failed because section_kind='vocabulary' violated the CHECK.)
    const rows: TypedItemRow[] = [
      baseTypedRow({ section_kind: 'dialogue' }),
    ]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    expect(out.perItemPlans[0].anchorContext.context_type).toBe('lesson_snippet')
  })
})
