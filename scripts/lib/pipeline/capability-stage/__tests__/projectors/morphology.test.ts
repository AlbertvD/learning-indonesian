import { describe, it, expect } from 'vitest'
import {
  MORPHOLOGY_PATTERN_SLUGS,
  lessonIntroducesMorphology,
  projectAffixedFormPairs,
  type AffixedFormPairsProjectionInput,
} from '../../projectors/morphology'

describe('lessonIntroducesMorphology — Decision 3 gate', () => {
  it('returns false when no morphology slug is present (lessons 1–8 today)', () => {
    expect(lessonIntroducesMorphology(['intensifier-position', 'verb-ordering-abc'])).toBe(false)
  })

  it('returns false for an empty list', () => {
    expect(lessonIntroducesMorphology([])).toBe(false)
  })

  it('returns true when a morphology slug is present (e.g. men-active in lesson 9)', () => {
    expect(lessonIntroducesMorphology(['men-active', 'intensifier-position'])).toBe(true)
  })

  it('MORPHOLOGY_PATTERN_SLUGS includes the canonical lesson 9 slug', () => {
    expect(MORPHOLOGY_PATTERN_SLUGS.has('men-active')).toBe(true)
  })
})

// PR 3 slice: projectAffixedFormPairs maps each affixed_form_pair cap to ONE
// typed `affixed_form_pairs` row (capability_id, source_ref, lesson_id,
// root_text, derived_text, allomorph_rule). It is the sole persisted
// representation; no capability_artifacts are emitted. Fail-loud (CS12 finding)
// when a ready cap has no id / no source pair / an empty required field.

const recallKey =
  'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none'
const recognitionKey =
  'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recognition:derived_to_root:text:none'
const afpSourceRef = 'lesson-9/morphology/meN-baca-membaca'

function baseInput(overrides: Partial<AffixedFormPairsProjectionInput> = {}): AffixedFormPairsProjectionInput {
  return {
    capabilities: [
      { canonicalKey: recallKey, sourceKind: 'affixed_form_pair', sourceRef: afpSourceRef },
      { canonicalKey: recognitionKey, sourceKind: 'affixed_form_pair', sourceRef: afpSourceRef },
    ],
    capabilityIdsByKey: new Map([
      [recallKey, 'cap-recall-id'],
      [recognitionKey, 'cap-recognition-id'],
    ]),
    pairsBySourceRef: new Map([
      [afpSourceRef, { root: 'baca', derived: 'membaca', allomorphRule: 'meN- becomes mem- before b.' }],
    ]),
    lessonId: 'lesson-9-uuid',
    ...overrides,
  }
}

describe('projectAffixedFormPairs — happy path', () => {
  it('emits one row per affixed_form_pair cap (2 caps per linguistic pair share root/derived/rule)', () => {
    const out = projectAffixedFormPairs(baseInput())
    expect(out.findings).toEqual([])
    expect(out.rows).toEqual([
      {
        capability_id: 'cap-recall-id',
        source_ref: afpSourceRef,
        lesson_id: 'lesson-9-uuid',
        root_text: 'baca',
        derived_text: 'membaca',
        allomorph_rule: 'meN- becomes mem- before b.',
      },
      {
        capability_id: 'cap-recognition-id',
        source_ref: afpSourceRef,
        lesson_id: 'lesson-9-uuid',
        root_text: 'baca',
        derived_text: 'membaca',
        allomorph_rule: 'meN- becomes mem- before b.',
      },
    ])
  })

  it('ignores non-affixed_form_pair capabilities', () => {
    const out = projectAffixedFormPairs(baseInput({
      capabilities: [
        { canonicalKey: 'cap:v1:item:learning_items/baca:text_recognition:id_to_l1:text:nl', sourceKind: 'item', sourceRef: 'learning_items/baca' },
        { canonicalKey: recallKey, sourceKind: 'affixed_form_pair', sourceRef: afpSourceRef },
      ],
    }))
    expect(out.findings).toEqual([])
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].capability_id).toBe('cap-recall-id')
  })

  it('trims surrounding whitespace on each field', () => {
    const out = projectAffixedFormPairs(baseInput({
      capabilities: [{ canonicalKey: recallKey, sourceKind: 'affixed_form_pair', sourceRef: afpSourceRef }],
      pairsBySourceRef: new Map([[afpSourceRef, { root: '  baca ', derived: ' membaca  ', allomorphRule: '  rule.  ' }]]),
    }))
    expect(out.findings).toEqual([])
    expect(out.rows[0]).toMatchObject({ root_text: 'baca', derived_text: 'membaca', allomorph_rule: 'rule.' })
  })
})

describe('projectAffixedFormPairs — fail-loud (CS12) error cases', () => {
  it('emits CS12 and skips the row when the cap id is unresolved', () => {
    const out = projectAffixedFormPairs(baseInput({
      capabilityIdsByKey: new Map([[recognitionKey, 'cap-recognition-id']]), // recall id missing
    }))
    expect(out.rows.map((r) => r.capability_id)).toEqual(['cap-recognition-id'])
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0]).toMatchObject({ gate: 'CS12', severity: 'error' })
    expect(out.findings[0].message).toContain('no upserted capability id')
  })

  it('emits CS12 and skips the row when no source pair exists for the source_ref', () => {
    const out = projectAffixedFormPairs(baseInput({ pairsBySourceRef: new Map() }))
    expect(out.rows).toEqual([])
    expect(out.findings).toHaveLength(2)
    expect(out.findings.every((f) => f.gate === 'CS12' && f.severity === 'error')).toBe(true)
    expect(out.findings[0].message).toContain('no source pair')
  })

  it('emits CS12 and skips the row when a required field is empty (NOT NULL columns)', () => {
    const out = projectAffixedFormPairs(baseInput({
      capabilities: [{ canonicalKey: recallKey, sourceKind: 'affixed_form_pair', sourceRef: afpSourceRef }],
      pairsBySourceRef: new Map([[afpSourceRef, { root: 'baca', derived: 'membaca', allomorphRule: '' }]]),
    }))
    expect(out.rows).toEqual([])
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0]).toMatchObject({ gate: 'CS12', severity: 'error' })
    expect(out.findings[0].message).toContain('allomorphRule')
  })

  it('returns empty output when there are no affixed_form_pair caps', () => {
    const out = projectAffixedFormPairs(baseInput({ capabilities: [] }))
    expect(out.rows).toEqual([])
    expect(out.findings).toEqual([])
  })
})
