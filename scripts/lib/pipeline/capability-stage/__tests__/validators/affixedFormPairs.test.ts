import { describe, it, expect } from 'vitest'
import { validateAffixedFormPairs } from '../../validators/affixedFormPairs'
import type { AffixedFormPairRowInput } from '../../adapter'

// CS12 (PR 3) — typed `affixed_form_pairs` shape gate. Mirrors validateDialogueClozes.

function row(overrides: Partial<AffixedFormPairRowInput> = {}): AffixedFormPairRowInput {
  return {
    capability_id: 'cap-recall-id',
    source_ref: 'lesson-9/morphology/meN-baca-membaca',
    lesson_id: 'lesson-9-uuid',
    root_text: 'baca',
    derived_text: 'membaca',
    allomorph_rule: 'meN- becomes mem- before b.',
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
