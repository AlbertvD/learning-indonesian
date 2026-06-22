import { describe, it, expect } from 'vitest'
import {
  projectAffixedFormPairs,
  type AffixedFormPairsProjectionInput,
} from '../../projectors/morphology'

// PR 3 slice: projectAffixedFormPairs maps each word_form_pair_src cap to ONE
// typed `affixed_form_pairs` row (capability_id, source_ref, lesson_id,
// root_text, derived_text, allomorph_rule). It is the sole persisted
// representation; no capability_artifacts are emitted. Fail-loud (CS12 finding)
// when a ready cap has no id / no source pair / an empty required field.

const recallKey =
  'cap:v1:word_form_pair_src:lesson-9/morphology/meN-baca-membaca:produce_derived_form_cap:root_to_derived:text:none'
const recognitionKey =
  'cap:v1:word_form_pair_src:lesson-9/morphology/meN-baca-membaca:recognise_word_form_link_cap:derived_to_root:text:none'
const afpSourceRef = 'lesson-9/morphology/meN-baca-membaca'

function basePair() {
  return {
    root: 'baca',
    derived: 'membaca',
    allomorphRule: 'meN- becomes mem- before b.',
    affix: 'meN-',
    patternSourceRef: 'l9-men-active',
    affixType: 'prefix',
    affixGloss: 'active/agent verb-former',
    allomorphClass: 'mem',
    circumfixLeft: null,
    circumfixRight: null,
    productive: true,
  }
}

function baseInput(overrides: Partial<AffixedFormPairsProjectionInput> = {}): AffixedFormPairsProjectionInput {
  return {
    capabilities: [
      { canonicalKey: recallKey, sourceKind: 'word_form_pair_src', sourceRef: afpSourceRef },
      { canonicalKey: recognitionKey, sourceKind: 'word_form_pair_src', sourceRef: afpSourceRef },
    ],
    capabilityIdsByKey: new Map([
      [recallKey, 'cap-recall-id'],
      [recognitionKey, 'cap-recognition-id'],
    ]),
    pairsBySourceRef: new Map([[afpSourceRef, basePair()]]),
    patternIdsBySlug: new Map([['l9-men-active', 'gp-men-id']]),
    lessonId: 'lesson-9-uuid',
    ...overrides,
  }
}

const afpFullRow = {
  source_ref: afpSourceRef,
  lesson_id: 'lesson-9-uuid',
  root_text: 'baca',
  derived_text: 'membaca',
  allomorph_rule: 'meN- becomes mem- before b.',
  grammar_pattern_id: 'gp-men-id',
  affix: 'meN-',
  affix_type: 'prefix',
  affix_gloss: 'active/agent verb-former',
  allomorph_class: 'mem',
  circumfix_left: null,
  circumfix_right: null,
  productive: true,
  carrier_text: null,
  derived_gloss_nl: null,
  derived_gloss_en: null,
}

describe('projectAffixedFormPairs — happy path', () => {
  it('emits one row per word_form_pair_src cap (2 caps per linguistic pair share the payload)', () => {
    const out = projectAffixedFormPairs(baseInput())
    expect(out.findings).toEqual([])
    expect(out.rows).toEqual([
      { ...afpFullRow, capability_id: 'cap-recall-id' },
      { ...afpFullRow, capability_id: 'cap-recognition-id' },
    ])
  })

  it('resolves grammar_pattern_id from the authored slug via patternIdsBySlug', () => {
    const out = projectAffixedFormPairs(baseInput())
    expect(out.rows.every((r) => r.grammar_pattern_id === 'gp-men-id')).toBe(true)
  })

  it('ignores non-word_form_pair_src capabilities', () => {
    const out = projectAffixedFormPairs(baseInput({
      capabilities: [
        { canonicalKey: 'cap:v1:vocabulary_src:learning_items/baca:recognise_meaning_from_text_cap:id_to_l1:text:nl', sourceKind: 'vocabulary_src', sourceRef: 'learning_items/baca' },
        { canonicalKey: recallKey, sourceKind: 'word_form_pair_src', sourceRef: afpSourceRef },
      ],
    }))
    expect(out.findings).toEqual([])
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].capability_id).toBe('cap-recall-id')
  })

  it('projects the bilingual derived gloss from source onto every row (Fix 3)', () => {
    const out = projectAffixedFormPairs(baseInput({
      pairsBySourceRef: new Map([[afpSourceRef, { ...basePair(), derivedGlossNl: 'lezen', derivedGlossEn: 'to read' }]]),
    }))
    expect(out.findings).toEqual([])
    expect(out.rows.every((r) => r.derived_gloss_nl === 'lezen' && r.derived_gloss_en === 'to read')).toBe(true)
  })

  it('emits null glosses (un-glossed) when source has none — empty-string trims to null', () => {
    const out = projectAffixedFormPairs(baseInput({
      pairsBySourceRef: new Map([[afpSourceRef, { ...basePair(), derivedGlossNl: '  ', derivedGlossEn: undefined }]]),
    }))
    expect(out.rows[0].derived_gloss_nl).toBeNull()
    expect(out.rows[0].derived_gloss_en).toBeNull()
  })

  it('trims surrounding whitespace on each field', () => {
    const out = projectAffixedFormPairs(baseInput({
      capabilities: [{ canonicalKey: recallKey, sourceKind: 'word_form_pair_src', sourceRef: afpSourceRef }],
      pairsBySourceRef: new Map([[afpSourceRef, { ...basePair(), root: '  baca ', derived: ' membaca  ', allomorphRule: '  rule.  ' }]]),
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
      capabilities: [{ canonicalKey: recallKey, sourceKind: 'word_form_pair_src', sourceRef: afpSourceRef }],
      pairsBySourceRef: new Map([[afpSourceRef, { root: 'baca', derived: 'membaca', allomorphRule: '' }]]),
    }))
    expect(out.rows).toEqual([])
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0]).toMatchObject({ gate: 'CS12', severity: 'error' })
    expect(out.findings[0].message).toContain('allomorphRule')
  })

  it('returns empty output when there are no word_form_pair_src caps', () => {
    const out = projectAffixedFormPairs(baseInput({ capabilities: [] }))
    expect(out.rows).toEqual([])
    expect(out.findings).toEqual([])
  })

  it('emits CS12 and skips the row when the authored slug resolves to no grammar_pattern_id', () => {
    const out = projectAffixedFormPairs(baseInput({
      capabilities: [{ canonicalKey: recallKey, sourceKind: 'word_form_pair_src', sourceRef: afpSourceRef }],
      patternIdsBySlug: new Map(), // 'l9-men-active' not present
    }))
    expect(out.rows).toEqual([])
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0]).toMatchObject({ gate: 'CS12', severity: 'error' })
    expect(out.findings[0].message).toContain('grammar_pattern_id')
    expect(out.findings[0].message).toContain('l9-men-active')
  })

  it('emits CS12 when the pair carries no pattern slug at all', () => {
    const out = projectAffixedFormPairs(baseInput({
      capabilities: [{ canonicalKey: recallKey, sourceKind: 'word_form_pair_src', sourceRef: afpSourceRef }],
      pairsBySourceRef: new Map([[afpSourceRef, { ...basePair(), patternSourceRef: null }]]),
    }))
    expect(out.rows).toEqual([])
    expect(out.findings[0]).toMatchObject({ gate: 'CS12', severity: 'error' })
    expect(out.findings[0].message).toContain('grammar_pattern_id')
  })
})

describe('projectAffixedFormPairs — morphology_meaning_gloss_missing gate (Task 6 / ADR 0021)', () => {
  const berRef = 'lesson-11/morphology/ber-jalan-berjalan'
  const berMeaningKey =
    'cap:v1:word_form_pair_src:lesson-11/morphology/ber-jalan-berjalan:recognise_meaning_from_text_cap:id_to_l1:text:nl'

  function berPair(glossed: boolean) {
    return {
      root: 'jalan',
      derived: 'berjalan',
      allomorphRule: 'no allomorphy',
      affix: 'ber-',
      patternSourceRef: 'l11-ber',
      affixType: 'prefix',
      affixGloss: null,
      allomorphClass: null,
      circumfixLeft: null,
      circumfixRight: null,
      productive: true,
      ...(glossed ? { derivedGlossNl: 'lopen', derivedGlossEn: 'to walk' } : {}),
    }
  }
  function berInput(glossed: boolean): AffixedFormPairsProjectionInput {
    return {
      capabilities: [{ canonicalKey: berMeaningKey, sourceKind: 'word_form_pair_src', sourceRef: berRef }],
      capabilityIdsByKey: new Map([[berMeaningKey, 'cap-ber-meaning']]),
      pairsBySourceRef: new Map([[berRef, berPair(glossed)]]),
      patternIdsBySlug: new Map([['l11-ber', 'gp-ber-id']]),
      lessonId: 'lesson-11-uuid',
    } as AffixedFormPairsProjectionInput
  }

  it('errors when a TRANSPARENT pair has no derived gloss (meaning-card substrate missing)', () => {
    const out = projectAffixedFormPairs(berInput(false))
    expect(out.findings.some((f) => f.severity === 'error' && /gloss/i.test(f.message))).toBe(true)
    expect(out.rows).toEqual([]) // bad row not written
  })

  it('passes (and writes the gloss) when the transparent pair carries a gloss', () => {
    const out = projectAffixedFormPairs(berInput(true))
    expect(out.findings).toEqual([])
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].derived_gloss_nl).toBe('lopen')
  })

  it('does NOT require a gloss for an allomorphic (formation) pair', () => {
    // baseInput uses meN- with no gloss — formation track, gloss not needed.
    const out = projectAffixedFormPairs(baseInput())
    expect(out.findings).toEqual([])
  })
})
