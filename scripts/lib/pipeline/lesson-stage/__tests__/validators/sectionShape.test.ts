import { describe, it, expect } from 'vitest'
import { validateSectionShape } from '../../validators/sectionShape'
import type { ProjectSectionsOutput } from '../../projectSections'

function clean(): ProjectSectionsOutput {
  return {
    sectionMeta: [],
    itemRows: [
      { sourceSectionOrderIndex: 2, display_order: 0, source_item_ref: 'lesson-9/section-2/item-0', item_type: 'word', indonesian_text: 'kaki', l1_translation: 'voet', l2_translation: 'foot' },
    ],
    grammarCategories: [
      { sourceSectionOrderIndex: 4, display_order: 0, title: 'A-B-C', title_en: 'A-B-C', rules: ['r'], rules_en: ['r-en'], examples: [{ indonesian: 'Saya datang.', dutch: 'Ik kom.', english: 'I come.' }] },
    ],
    grammarTopics: [{ sourceSectionOrderIndex: 4, topic_label: 'x' }],
    affixedPairs: [
      { source_ref: 'lesson-9/morphology/meN-baca-membaca', pattern_source_ref: null, affix: 'meN-', root_text: 'baca', derived_text: 'membaca', allomorph_rule: 'meN- becomes mem-.' },
    ],
  }
}

describe('validateSectionShape (GT9)', () => {
  it('passes a fully-populated projection', () => {
    expect(validateSectionShape(clean())).toEqual([])
  })

  it('flags item rows missing l2_translation (EN) as error', () => {
    const p = clean()
    p.itemRows[0].l2_translation = null
    const findings = validateSectionShape(p)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ gate: 'GT9', severity: 'error' })
    expect(findings[0].message).toMatch(/l2_translation/)
  })

  it('flags item rows missing l1_translation (NL) as error', () => {
    const p = clean()
    p.itemRows[0].l1_translation = ''
    const findings = validateSectionShape(p)
    expect(findings.some((f) => f.severity === 'error' && /l1_translation/.test(f.message))).toBe(true)
  })

  it('flags grammar categories missing title_en or rules_en', () => {
    const p = clean()
    p.grammarCategories[0].title_en = null
    p.grammarCategories[0].rules_en = ['']
    const findings = validateSectionShape(p)
    expect(findings.filter((f) => f.severity === 'error').length).toBeGreaterThanOrEqual(2)
    expect(findings.some((f) => /title_en/.test(f.message))).toBe(true)
    expect(findings.some((f) => /rules_en/.test(f.message))).toBe(true)
  })

  it('flags grammar examples missing english', () => {
    const p = clean()
    p.grammarCategories[0].examples = [{ indonesian: 'x', dutch: 'y', english: null }]
    const findings = validateSectionShape(p)
    expect(findings.some((f) => f.severity === 'error' && /example.*english/i.test(f.message))).toBe(true)
  })

  it('flags affixed pairs missing required fields', () => {
    const p = clean()
    p.affixedPairs[0].affix = ''
    p.affixedPairs[0].allomorph_rule = ''
    const findings = validateSectionShape(p)
    expect(findings.filter((f) => f.severity === 'error').length).toBeGreaterThanOrEqual(2)
  })

  it('flags rules_en length mismatch with rules', () => {
    const p = clean()
    p.grammarCategories[0].rules = ['r1', 'r2']
    p.grammarCategories[0].rules_en = ['only-one']
    const findings = validateSectionShape(p)
    expect(findings.some((f) => /rules_en/.test(f.message))).toBe(true)
  })
})
