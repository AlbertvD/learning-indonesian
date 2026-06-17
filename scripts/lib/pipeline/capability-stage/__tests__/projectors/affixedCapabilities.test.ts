import { describe, it, expect } from 'vitest'
import { buildCanonicalKey, CAPABILITY_PROJECTION_VERSION } from '@/lib/capabilities'
import { sourceRefForLearningItem } from '../../../../content-pipeline-output'
import { projectAffixedCapabilities } from '../../projectors/affixedCapabilities'
import type { TypedAffixedPair } from '../../loadFromDb'

// ADR 0018 prereq (ii): the root-vocabulary recognition cap key, byte-matching
// vocab.ts (vocabulary_src / recognise_meaning_from_text_cap / id_to_l1 / text / nl).
function rootVocabKey(rootText: string): string {
  return buildCanonicalKey({
    sourceKind: 'vocabulary_src',
    sourceRef: sourceRefForLearningItem(rootText),
    capabilityType: 'recognise_meaning_from_text_cap',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
  })
}
const ROOT_VOCAB_KEY_1 = rootVocabKey('baca')
const ROOT_VOCAB_KEY_2 = rootVocabKey('tulis')

// Two real-shaped pairs from lesson 9 (the morphology-introducing lesson).
// source_ref is byte-identical to affixedFormPairSourceRef(lessonNumber, pair)
// per runner.ts:903-907 (verified against live DB — M-3).
const pair1: TypedAffixedPair = {
  id: 'uuid-1',
  lesson_id: 'lesson-9-uuid',
  section_id: null,
  source_ref: 'lesson-9/morphology/membaca-baca',
  affix: 'meN-',
  root_text: 'baca',
  derived_text: 'membaca',
  allomorph_rule: 'meN- + baca → membaca (nasal assimilation b→m)',
}

const pair2: TypedAffixedPair = {
  id: 'uuid-2',
  lesson_id: 'lesson-9-uuid',
  section_id: 'section-uuid-1',
  source_ref: 'lesson-9/morphology/menulis-tulis',
  affix: 'meN-',
  root_text: 'tulis',
  derived_text: 'menulis',
  allomorph_rule: 'meN- + tulis → menulis (nasal assimilation t→n)',
}

// Pre-computed canonical keys (pin literal values so any silent change in the
// key formula fails the test immediately — same pattern as vocab.test.ts).
const RECOGNITION_KEY_1 = buildCanonicalKey({
  sourceKind: 'word_form_pair_src',
  sourceRef: pair1.source_ref,
  capabilityType: 'recognise_word_form_link_cap',
  direction: 'derived_to_root',
  modality: 'text',
  learnerLanguage: 'none',
})

const RECALL_KEY_1 = buildCanonicalKey({
  sourceKind: 'word_form_pair_src',
  sourceRef: pair1.source_ref,
  capabilityType: 'produce_derived_form_cap',
  direction: 'root_to_derived',
  modality: 'text',
  learnerLanguage: 'none',
})

const RECOGNITION_KEY_2 = buildCanonicalKey({
  sourceKind: 'word_form_pair_src',
  sourceRef: pair2.source_ref,
  capabilityType: 'recognise_word_form_link_cap',
  direction: 'derived_to_root',
  modality: 'text',
  learnerLanguage: 'none',
})

const RECALL_KEY_2 = buildCanonicalKey({
  sourceKind: 'word_form_pair_src',
  sourceRef: pair2.source_ref,
  capabilityType: 'produce_derived_form_cap',
  direction: 'root_to_derived',
  modality: 'text',
  learnerLanguage: 'none',
})

describe('projectAffixedCapabilities', () => {
  it('emits 2 capabilities per pair (recognition + recall), 4 total for 2 pairs', () => {
    const caps = projectAffixedCapabilities({
      pairs: [pair1, pair2],
      lessonId: 'lesson-9-uuid',
    })
    expect(caps).toHaveLength(4)
  })

  it('emits recognise_word_form_link_cap cap with exact canonical key and fields', () => {
    const caps = projectAffixedCapabilities({
      pairs: [pair1],
      lessonId: 'lesson-9-uuid',
    })

    const recognition = caps.find((c) => c.capabilityType === 'recognise_word_form_link_cap')
    expect(recognition).toBeDefined()
    expect(recognition!.canonicalKey).toBe(RECOGNITION_KEY_1)
    // Literal pin — any key-formula change will fail here.
    // encodeSegment (canonicalKey.ts) only encodes '%' → '%25' and ':' → '%3A';
    // '/' is NOT percent-encoded, so source_ref path separators appear literally.
    expect(RECOGNITION_KEY_1).toBe(
      'cap:v1:word_form_pair_src:lesson-9/morphology/membaca-baca:recognise_word_form_link_cap:derived_to_root:text:none',
    )
    expect(recognition!.sourceKind).toBe('word_form_pair_src')
    expect(recognition!.sourceRef).toBe(pair1.source_ref)
    expect(recognition!.direction).toBe('derived_to_root')
    expect(recognition!.modality).toBe('text')
    expect(recognition!.learnerLanguage).toBe('none')
    expect(recognition!.projectionVersion).toBe(CAPABILITY_PROJECTION_VERSION)
    expect(recognition!.lessonId).toBe('lesson-9-uuid')
    expect(recognition!.requiredArtifacts).toEqual([])
    // ADR 0018: the recognition cap gates on the root-vocab cap (the rule prereq is
    // added only when ruleCapKeyBySlug is supplied — see the dedicated test below).
    expect(recognition!.prerequisiteKeys).toEqual([ROOT_VOCAB_KEY_1])
  })

  it('emits produce_derived_form_cap cap with exact canonical key and fields', () => {
    const caps = projectAffixedCapabilities({
      pairs: [pair1],
      lessonId: 'lesson-9-uuid',
    })

    const recall = caps.find((c) => c.capabilityType === 'produce_derived_form_cap')
    expect(recall).toBeDefined()
    expect(recall!.canonicalKey).toBe(RECALL_KEY_1)
    // Literal pin — encodeSegment does not encode '/'
    expect(RECALL_KEY_1).toBe(
      'cap:v1:word_form_pair_src:lesson-9/morphology/membaca-baca:produce_derived_form_cap:root_to_derived:text:none',
    )
    expect(recall!.sourceKind).toBe('word_form_pair_src')
    expect(recall!.sourceRef).toBe(pair1.source_ref)
    expect(recall!.direction).toBe('root_to_derived')
    expect(recall!.modality).toBe('text')
    expect(recall!.learnerLanguage).toBe('none')
    expect(recall!.projectionVersion).toBe(CAPABILITY_PROJECTION_VERSION)
    expect(recall!.lessonId).toBe('lesson-9-uuid')
    expect(recall!.requiredArtifacts).toEqual([])
    // produce prereqs: the sibling recognition cap (within-pair) + the root-vocab
    // cross-source-kind gate (ADR 0018).
    expect(recall!.prerequisiteKeys).toEqual([RECOGNITION_KEY_1, ROOT_VOCAB_KEY_1])
  })

  it('recall prerequisiteKeys points to sibling recognition cap (per-pair)', () => {
    const caps = projectAffixedCapabilities({
      pairs: [pair1, pair2],
      lessonId: 'lesson-9-uuid',
    })

    const recall1 = caps.find(
      (c) => c.capabilityType === 'produce_derived_form_cap' && c.sourceRef === pair1.source_ref,
    )
    const recall2 = caps.find(
      (c) => c.capabilityType === 'produce_derived_form_cap' && c.sourceRef === pair2.source_ref,
    )

    expect(recall1!.prerequisiteKeys).toEqual([RECOGNITION_KEY_1, ROOT_VOCAB_KEY_1])
    expect(recall2!.prerequisiteKeys).toEqual([RECOGNITION_KEY_2, ROOT_VOCAB_KEY_2])
  })

  it('sourceRef is taken verbatim from TypedAffixedPair.source_ref (DB-native, not recomputed)', () => {
    const caps = projectAffixedCapabilities({
      pairs: [pair1],
      lessonId: 'lesson-9-uuid',
    })
    // Every cap's sourceRef must be byte-identical to pair.source_ref —
    // the join key that runner.ts step-7c uses: cap.sourceRef ↔ affixedPairsBySourceRef key.
    for (const cap of caps) {
      expect(cap.sourceRef).toBe(pair1.source_ref)
    }
  })

  it('stamps lessonId from the input on every cap', () => {
    const caps = projectAffixedCapabilities({
      pairs: [pair1, pair2],
      lessonId: 'lesson-9-uuid',
    })
    for (const cap of caps) {
      expect(cap.lessonId).toBe('lesson-9-uuid')
    }
  })

  it('emits EXACTLY 2 caps per pair regardless of allomorph_class (no per-pair allomorph cap — retired 2026-06-17)', () => {
    // Nasalization is taught at the rule tier (grammar_pattern_src, ADR 0017), not per
    // word_form_pair. allomorph_class is stored on the row but spawns no capability.
    const allomorphPair: TypedAffixedPair = {
      ...pair2,
      allomorph_class: 'men',
    } as TypedAffixedPair
    const caps = projectAffixedCapabilities({ pairs: [allomorphPair], lessonId: 'lesson-9-uuid' })
    expect(caps).toHaveLength(2)
    expect(caps.map((c) => c.capabilityType).sort()).toEqual(
      ['produce_derived_form_cap', 'recognise_word_form_link_cap'],
    )
    expect(caps.some((c) => c.capabilityType === 'recognise_allomorph_from_root_cap')).toBe(false)
  })

  it('skips produce_derived_form_cap for productive=false (lexicalised) pairs', () => {
    const lexicalised = { ...pair1, productive: false } as TypedAffixedPair
    const caps = projectAffixedCapabilities({ pairs: [lexicalised], lessonId: 'lesson-9-uuid' })
    expect(caps.some((c) => c.capabilityType === 'produce_derived_form_cap')).toBe(false)
    // the recognition cap is still emitted (recognition is always valid)
    expect(caps.some((c) => c.capabilityType === 'recognise_word_form_link_cap')).toBe(true)
  })

  it('adds the rule→application prereq (the pattern recognise cap key) when ruleCapKeyBySlug is supplied (ADR 0018 prereq i)', () => {
    const withSlug = { ...pair1, pattern_source_ref: 'l9-men-active' } as TypedAffixedPair
    const RULE_KEY = 'cap:v1:grammar_pattern_src:lesson-9/pattern-l9-men-active:recognise_grammar_pattern_cap:none:text:none'
    const caps = projectAffixedCapabilities({
      pairs: [withSlug],
      lessonId: 'lesson-9-uuid',
      ruleCapKeyBySlug: new Map([['l9-men-active', RULE_KEY]]),
    })
    const recognition = caps.find((c) => c.capabilityType === 'recognise_word_form_link_cap')!
    // both cross-source-kind gates present: rule first, then root-vocab.
    expect(recognition.prerequisiteKeys).toEqual([RULE_KEY, ROOT_VOCAB_KEY_1])
    const produce = caps.find((c) => c.capabilityType === 'produce_derived_form_cap')!
    expect(produce.prerequisiteKeys).toEqual([RECOGNITION_KEY_1, RULE_KEY, ROOT_VOCAB_KEY_1])
  })

  it('returns empty array for empty pairs input', () => {
    const caps = projectAffixedCapabilities({
      pairs: [],
      lessonId: 'lesson-9-uuid',
    })
    expect(caps).toHaveLength(0)
  })

  it('canonical keys for both pairs are distinct', () => {
    const caps = projectAffixedCapabilities({
      pairs: [pair1, pair2],
      lessonId: 'lesson-9-uuid',
    })
    const keys = caps.map((c) => c.canonicalKey)
    const unique = new Set(keys)
    expect(unique.size).toBe(4)
    // Verify both recognition keys are present
    expect(keys).toContain(RECOGNITION_KEY_1)
    expect(keys).toContain(RECALL_KEY_1)
    expect(keys).toContain(RECOGNITION_KEY_2)
    expect(keys).toContain(RECALL_KEY_2)
  })
})
