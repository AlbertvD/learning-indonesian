import { describe, it, expect } from 'vitest'
import { buildCanonicalKey } from '@/lib/capabilities'
import {
  projectItemsFromTypedRows,
} from '../../projectors/vocab'
import type { TypedItemRow } from '../../loadFromDb'
import type { AudioClipMeta } from '../../adapter'

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

  it('canonicalises a legacy comma/";" l1_translation to the "/" answer convention (#161)', () => {
    // lesson_section_item_rows carries display glosses with comma/";" OR-lists;
    // the projector must rewrite them before they become learning_items.translation_nl
    // (the graded answer surface + the CS19 gate input).
    const rows: TypedItemRow[] = [
      baseTypedRow({ indonesian_text: 'ada', l1_translation: 'er is, er zijn; hebben' }),
      baseTypedRow({ id: 'row-uuid-3', indonesian_text: 'dokter', l1_translation: 'dokter, arts' }),
    ]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    expect(out.perItemPlans[0].learningItemInput.translation_nl).toBe('er is / er zijn / hebben')
    expect(out.perItemPlans[1].learningItemInput.translation_nl).toBe('dokter / arts')
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
    // Each item emits recognise_meaning_from_text_cap, recognise_form_from_meaning_cap, meaning_recall, form_recall
    expect(capabilities.length).toBeGreaterThanOrEqual(4)
    const capTypes = capabilities.map((c) => c.capabilityType).sort()
    expect(capTypes).toContain('recognise_meaning_from_text_cap')
    expect(capTypes).toContain('recognise_form_from_meaning_cap')
    expect(capTypes).toContain('recall_meaning_from_text_cap')
    expect(capTypes).toContain('produce_form_from_meaning_cap')
    // sourceRef = 'learning_items/<normalized_text>'
    for (const cap of capabilities) {
      expect(cap.sourceRef).toBe('learning_items/halo')
      expect(cap.sourceKind).toBe('vocabulary_src')
      expect(cap.lessonId).toBe('lesson-uuid-1')
      // canonical key shape: cap:v1:vocabulary_src:learning_items/halo:<type>:<direction>:text:<lang>
      expect(cap.canonicalKey).toMatch(/^cap:v1:vocabulary_src:/)
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

    expect(byType['recognise_meaning_from_text_cap']).toBe(
      'cap:v1:vocabulary_src:learning_items/halo:recognise_meaning_from_text_cap:id_to_l1:text:nl',
    )
    expect(byType['recognise_form_from_meaning_cap']).toBe(
      'cap:v1:vocabulary_src:learning_items/halo:recognise_form_from_meaning_cap:l1_to_id:text:nl',
    )
    expect(byType['recall_meaning_from_text_cap']).toBe(
      'cap:v1:vocabulary_src:learning_items/halo:recall_meaning_from_text_cap:id_to_l1:text:nl',
    )
    expect(byType['produce_form_from_meaning_cap']).toBe(
      'cap:v1:vocabulary_src:learning_items/halo:produce_form_from_meaning_cap:l1_to_id:text:nl',
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
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'recognise_meaning_from_text_cap',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'nl',
    })
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    const textRecog = out.perItemPlans[0].capabilities.find((c) => c.capabilityType === 'recognise_meaning_from_text_cap')
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


// ---------------------------------------------------------------------------
// Task 5a.1: projectItemsFromTypedRows — audio cap emission
// ---------------------------------------------------------------------------

describe('projectItemsFromTypedRows — audio cap emission (Task 5a.1)', () => {
  const audioMap = new Map<string, AudioClipMeta>([
    ['halo', { storage_path: 'lesson-4/halo.mp3', voice_id: 'Achird' }],
  ])

  // cap-v2 #161 (§0.8): audio caps emit UNCONDITIONALLY — audio is assumed to
  // exist; a missing clip is flagged by the vocab gate (CS23), not skipped here.
  it('emits 6 caps even when item is NOT in audioClipsByNormalizedText (audio assumed)', () => {
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const noAudioMap = new Map<string, AudioClipMeta>() // empty — no audio clip
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1', audioClipsByNormalizedText: noAudioMap })
    expect(out.perItemPlans[0].capabilities).toHaveLength(6)
    const capTypes = out.perItemPlans[0].capabilities.map((c) => c.capabilityType).sort()
    expect(capTypes).toEqual(['produce_form_from_audio_cap', 'produce_form_from_meaning_cap', 'recall_meaning_from_text_cap', 'recognise_form_from_meaning_cap', 'recognise_meaning_from_audio_cap', 'recognise_meaning_from_text_cap'])
  })

  it('emits 6 caps when audioClipsByNormalizedText is not provided (audio assumed)', () => {
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1' })
    expect(out.perItemPlans[0].capabilities).toHaveLength(6)
  })

  it('emits 6 caps (4 base + recognise_meaning_from_audio_cap + dictation) when item IS in audio map', () => {
    const rows: TypedItemRow[] = [baseTypedRow({})] // indonesian_text: 'Halo' → normalizeTtsText → 'halo'
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1', audioClipsByNormalizedText: audioMap })
    expect(out.perItemPlans[0].capabilities).toHaveLength(6)
    const capTypes = out.perItemPlans[0].capabilities.map((c) => c.capabilityType).sort()
    expect(capTypes).toContain('recognise_meaning_from_audio_cap')
    expect(capTypes).toContain('produce_form_from_audio_cap')
  })

  it('audio caps have correct sourceKind, sourceRef, and lessonId', () => {
    const rows: TypedItemRow[] = [baseTypedRow({})] // 'Halo' → normalized 'halo'
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1', audioClipsByNormalizedText: audioMap })
    const caps = out.perItemPlans[0].capabilities
    const audioCaps = caps.filter((c) => c.capabilityType === 'recognise_meaning_from_audio_cap' || c.capabilityType === 'produce_form_from_audio_cap')
    expect(audioCaps).toHaveLength(2)
    for (const cap of audioCaps) {
      expect(cap.sourceKind).toBe('vocabulary_src')
      expect(cap.sourceRef).toBe('learning_items/halo')
      expect(cap.lessonId).toBe('lesson-uuid-1')
      expect(cap.modality).toBe('audio')
    }
  })

  it('recognise_meaning_from_audio_cap has direction=audio_to_l1 and learnerLanguage=nl (first meaning)', () => {
    // Staging path (capabilityCatalog.ts:98): learnerLanguage = item.meanings[0].language
    // Typed-row path: l1_translation is always NL → learnerLanguage = 'nl'
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1', audioClipsByNormalizedText: audioMap })
    const audioCap = out.perItemPlans[0].capabilities.find((c) => c.capabilityType === 'recognise_meaning_from_audio_cap')!
    expect(audioCap.direction).toBe('audio_to_l1')
    expect(audioCap.modality).toBe('audio')
    expect(audioCap.learnerLanguage).toBe('nl')
  })

  it('dictation has direction=audio_to_id and learnerLanguage=none', () => {
    // Staging path (capabilityCatalog.ts:106): learnerLanguage hardcoded 'none' for dictation
    const rows: TypedItemRow[] = [baseTypedRow({})]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1', audioClipsByNormalizedText: audioMap })
    const dictCap = out.perItemPlans[0].capabilities.find((c) => c.capabilityType === 'produce_form_from_audio_cap')!
    expect(dictCap.direction).toBe('audio_to_id')
    expect(dictCap.modality).toBe('audio')
    expect(dictCap.learnerLanguage).toBe('none')
  })

  it('pinned exact canonical_key literals for audio caps — parity gate with staging path', () => {
    // CRITICAL: These keys must be byte-identical to what capabilityCatalog.ts
    // emits for the same item. retireOrphanedCapabilities keys on canonical_key;
    // any drift here would double-write/orphan caps at the 5b cutover.
    // capabilityCatalog.ts:96 — recognise_meaning_from_audio_cap sourceRef = learning_items/<itemSlug(base_text)>
    // where the snapshot id = itemSlug(item.base_text) = 'halo' (from 'Halo')
    const rows: TypedItemRow[] = [baseTypedRow({})] // indonesian_text: 'Halo' → sourceRef: 'learning_items/halo'
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1', audioClipsByNormalizedText: audioMap })
    const caps = out.perItemPlans[0].capabilities
    const byType = Object.fromEntries(caps.map((c) => [c.capabilityType, c.canonicalKey]))

    // Build expected keys via buildCanonicalKey (same function staging path uses)
    const sourceRef = 'learning_items/halo'
    const expectedAudioRecognition = buildCanonicalKey({
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'recognise_meaning_from_audio_cap',
      direction: 'audio_to_l1',
      modality: 'audio',
      learnerLanguage: 'nl',
    })
    const expectedDictation = buildCanonicalKey({
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'produce_form_from_audio_cap',
      direction: 'audio_to_id',
      modality: 'audio',
      learnerLanguage: 'none',
    })

    expect(byType['recognise_meaning_from_audio_cap']).toBe(expectedAudioRecognition)
    expect(byType['produce_form_from_audio_cap']).toBe(expectedDictation)
    // Literal pin (belt + suspenders)
    expect(byType['recognise_meaning_from_audio_cap']).toBe('cap:v1:vocabulary_src:learning_items/halo:recognise_meaning_from_audio_cap:audio_to_l1:audio:nl')
    expect(byType['produce_form_from_audio_cap']).toBe('cap:v1:vocabulary_src:learning_items/halo:produce_form_from_audio_cap:audio_to_id:audio:none')
  })

  it('every word/phrase item gets 6 caps regardless of audio-map membership (audio assumed, §0.8)', () => {
    const rows: TypedItemRow[] = [
      baseTypedRow({ id: 'r1', indonesian_text: 'Halo', l1_translation: 'Hallo' }), // in map
      baseTypedRow({ id: 'r2', source_item_ref: 'lesson-4/section-1/item-1', indonesian_text: 'Makan', l1_translation: 'Eten' }), // NOT in map
    ]
    const out = projectItemsFromTypedRows({ rows, lessonId: 'lesson-uuid-1', level: 'A1', audioClipsByNormalizedText: audioMap })
    const halo = out.perItemPlans.find((p) => p.normalizedText === 'halo')!
    const makan = out.perItemPlans.find((p) => p.normalizedText === 'makan')!
    expect(halo.capabilities).toHaveLength(6)
    expect(makan.capabilities).toHaveLength(6)
  })

})
