import { describe, it, expect } from 'vitest'
import { validateItemCoverage } from '../../validators/itemCoverage'
import type { ItemCapForCoverageCheck } from '../../validators/itemCoverage'

describe('validateItemCoverage (CS15)', () => {
  it('passes an empty item cap list', () => {
    expect(validateItemCoverage([])).toEqual([])
  })

  it('passes when all item caps have distractors', () => {
    const caps: ItemCapForCoverageCheck[] = [
      { capabilityKey: 'item:1:makan:word', normalizedText: 'makan', hasDistractors: true },
      { capabilityKey: 'item:1:rumah:word', normalizedText: 'rumah', hasDistractors: true },
    ]
    expect(validateItemCoverage(caps)).toEqual([])
  })

  it('emits CS15 warning for each item cap without distractors', () => {
    const caps: ItemCapForCoverageCheck[] = [
      { capabilityKey: 'item:1:makan:word', normalizedText: 'makan', hasDistractors: false },
    ]
    const findings = validateItemCoverage(caps)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS15')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain('makan')
    expect(findings[0].message).toContain('curated distractor rows')
  })

  it('emits one warning per missing distractor set', () => {
    const caps: ItemCapForCoverageCheck[] = [
      { capabilityKey: 'item:1:makan:word', normalizedText: 'makan', hasDistractors: false },
      { capabilityKey: 'item:1:rumah:word', normalizedText: 'rumah', hasDistractors: true },
      { capabilityKey: 'item:1:besar:word', normalizedText: 'besar', hasDistractors: false },
    ]
    const findings = validateItemCoverage(caps)
    expect(findings).toHaveLength(2)
    expect(findings.map(f => f.context?.itemSlug)).toEqual(['makan', 'besar'])
  })

  it('includes capabilityKey in context', () => {
    const caps: ItemCapForCoverageCheck[] = [
      { capabilityKey: 'item:1:makan:word', normalizedText: 'makan', hasDistractors: false },
    ]
    const findings = validateItemCoverage(caps)
    expect(findings[0].context?.capabilityKey).toBe('item:1:makan:word')
  })
})
