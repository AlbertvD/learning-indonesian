import { describe, it, expect } from 'vitest'
import { validateAffixedFormPairs, affixedPayloadFindings } from '../../validators/affixedFormPairs'
import type { AffixedFormPairRowInput } from '../../adapter'

// CS12 (PR 3 + morphology phase-b) — typed `affixed_form_pairs` shape + payload gate.

function row(overrides: Partial<AffixedFormPairRowInput> = {}): AffixedFormPairRowInput {
  return {
    capability_id: 'cap-recall-id',
    source_ref: 'lesson-9/morphology/meN-baca-membaca',
    lesson_id: 'lesson-9-uuid',
    root_text: 'baca',
    derived_text: 'membaca',
    allomorph_rule: 'meN- becomes mem- before b.',
    grammar_pattern_id: 'gp-men-id',
    affix: 'meN-',
    affix_type: 'prefix',
    affix_gloss: 'active verb-former',
    allomorph_class: 'mem',
    circumfix_left: null,
    circumfix_right: null,
    productive: true,
    carrier_text: null,
    derived_gloss_nl: null,
    derived_gloss_en: null,
    ...overrides,
  }
}

describe('validateAffixedFormPairs (CS12)', () => {
  it('passes well-formed rows', () => {
    expect(validateAffixedFormPairs([
      row(),
      row({ capability_id: 'cap-recognition-id' }),
    ])).toEqual([])
  })

  it('flags a malformed source_ref', () => {
    const findings = validateAffixedFormPairs([row({ source_ref: 'garbage/path' })])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ gate: 'CS12', severity: 'error' })
    expect(findings[0].message).toContain('malformed source_ref')
  })

  it('flags an empty root_text / derived_text / allomorph_rule', () => {
    expect(validateAffixedFormPairs([row({ root_text: '  ' })])[0].message).toContain('root_text')
    expect(validateAffixedFormPairs([row({ derived_text: '' })])[0].message).toContain('derived_text')
    expect(validateAffixedFormPairs([row({ allomorph_rule: '' })])[0].message).toContain('allomorph_rule')
  })

  it('flags a duplicate capability_id (the table has UNIQUE(capability_id))', () => {
    const findings = validateAffixedFormPairs([row(), row()])
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('duplicate')
  })
})

describe('affixedPayloadFindings (Layer-1 morphology payload invariants)', () => {
  it('passes a well-formed allomorphic prefix row', () => {
    expect(affixedPayloadFindings(row())).toEqual([])
  })

  it('flags a missing grammar_pattern_id', () => {
    expect(affixedPayloadFindings(row({ grammar_pattern_id: '' }))[0].message).toContain('grammar_pattern_id')
  })

  it('flags an invalid affix_type', () => {
    expect(affixedPayloadFindings(row({ affix_type: 'bogus' }))[0].message).toContain('affix_type')
    expect(affixedPayloadFindings(row({ affix_type: null }))[0].message).toContain('affix_type')
  })

  it('flags null productive', () => {
    expect(affixedPayloadFindings(row({ productive: null }))[0].message).toContain('productive')
  })

  it('flags an affix not in the catalog', () => {
    const f = affixedPayloadFindings(row({ affix: 'zzz-', allomorph_class: null }))
    expect(f[0].message).toContain('not in the affix catalog')
  })

  it('flags meN-/peN- without an allomorph_class', () => {
    expect(affixedPayloadFindings(row({ affix: 'meN-', allomorph_class: null }))[0].message).toContain('allomorph_class')
    expect(affixedPayloadFindings(row({ affix: 'peN-', allomorph_class: '' }))[0].message).toContain('allomorph_class')
  })

  it('does NOT require allomorph_class for a non-nasalising affix', () => {
    expect(affixedPayloadFindings(row({ affix: 'ber-', allomorph_class: null }))).toEqual([])
  })

  it('flags a confix missing circumfix columns', () => {
    const f = affixedPayloadFindings(row({ affix: 'ke-…-an', affix_type: 'confix', allomorph_class: null, circumfix_left: 'ke', circumfix_right: null }))
    expect(f[0].message).toContain('circumfix')
  })

  it('passes a well-formed confix row', () => {
    expect(affixedPayloadFindings(row({
      affix: 'ke-…-an', affix_type: 'confix', allomorph_class: null,
      circumfix_left: 'ke', circumfix_right: 'an',
    }))).toEqual([])
  })

  it('flags a reduplication row that carries circumfix pieces (ADR 0019)', () => {
    const f = affixedPayloadFindings(row({
      affix: 'reduplication', affix_type: 'reduplication', allomorph_class: null,
      root_text: 'anak', derived_text: 'anak-anak', circumfix_left: 'anak', circumfix_right: null,
    }))
    expect(f.some(x => x.message.includes('reduplication'))).toBe(true)
  })

  it('flags a carrier that does not contain derived_text as a whole word', () => {
    // "dinaikkannya" contains "dinaikkan" only as a substring — must NOT pass.
    const f = affixedPayloadFindings(row({
      affix: 'di-…-kan', affix_type: 'confix', allomorph_class: null,
      circumfix_left: 'di', circumfix_right: 'kan', root_text: 'naik', derived_text: 'dinaikkan',
      carrier_text: 'Bendera dinaikkannya tinggi',
    }))
    expect(f.some(x => x.message.includes('carrier_text'))).toBe(true)
  })

  it('passes a carrier that contains derived_text as a whole word', () => {
    expect(affixedPayloadFindings(row({
      affix: 'meN-…-kan', affix_type: 'confix', allomorph_class: null,
      circumfix_left: 'mem', circumfix_right: 'kan', root_text: 'beli', derived_text: 'membelikan',
      carrier_text: 'Ibu membelikan anaknya buku',
    }))).toEqual([])
  })

  it('derived gloss is NULL-tolerant (both null passes — un-glossed is valid)', () => {
    expect(affixedPayloadFindings(row({ derived_gloss_nl: null, derived_gloss_en: null }))).toEqual([])
  })

  it('passes a fully bilingual derived gloss (both set)', () => {
    expect(affixedPayloadFindings(row({ derived_gloss_nl: 'lezen', derived_gloss_en: 'to read' }))).toEqual([])
  })

  it('flags a half-authored derived gloss (one set, one null) as both-or-neither', () => {
    expect(affixedPayloadFindings(row({ derived_gloss_nl: 'lezen', derived_gloss_en: null }))[0].message).toContain('half-authored derived gloss')
    expect(affixedPayloadFindings(row({ derived_gloss_nl: '  ', derived_gloss_en: 'to read' }))[0].message).toContain('half-authored derived gloss')
  })
})
