import { describe, it, expect } from 'vitest'
import { buildCanonicalKey, CAPABILITY_PROJECTION_VERSION } from '@/lib/capabilities'
import { projectAffixedCapabilities } from '../../projectors/affixedCapabilities'
import type { TypedAffixedPair } from '../../loadFromDb'

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
    expect(recognition!.prerequisiteKeys).toEqual([])
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
    // recall prerequisite is the sibling recognition cap
    expect(recall!.prerequisiteKeys).toEqual([RECOGNITION_KEY_1])
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

    expect(recall1!.prerequisiteKeys).toEqual([RECOGNITION_KEY_1])
    expect(recall2!.prerequisiteKeys).toEqual([RECOGNITION_KEY_2])
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
