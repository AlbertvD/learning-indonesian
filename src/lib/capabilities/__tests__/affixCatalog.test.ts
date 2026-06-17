import { describe, it, expect } from 'vitest'
import {
  AFFIX_CATALOG,
  AFFIX_SET,
  isCatalogAffix,
  affixCatalogEntry,
  allomorphClassesFor,
  distractorAffixes,
} from '../affixCatalog'

describe('affix catalog', () => {
  it('every entry has a non-empty affix + a valid affix_type', () => {
    const types = new Set(['prefix', 'suffix', 'confix', 'reduplication'])
    for (const e of AFFIX_CATALOG) {
      expect(e.affix.length).toBeGreaterThan(0)
      expect(types.has(e.affixType)).toBe(true)
      expect(e.gloss.length).toBeGreaterThan(0)
    }
  })

  it('affix labels are unique', () => {
    const labels = AFFIX_CATALOG.map((e) => e.affix)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('AFFIX_SET + isCatalogAffix agree with the catalog', () => {
    expect(isCatalogAffix('meN-')).toBe(true)
    expect(isCatalogAffix('-kan')).toBe(true)
    expect(isCatalogAffix('not-an-affix')).toBe(false)
    expect(AFFIX_SET.has('ke-…-an')).toBe(true)
  })

  it('only meN-/peN- carry allomorph classes; others have none', () => {
    expect(allomorphClassesFor('meN-')).toEqual(['me', 'mem', 'men', 'meny', 'meng', 'menge'])
    expect(allomorphClassesFor('peN-').length).toBeGreaterThan(0)
    expect(allomorphClassesFor('ber-')).toEqual([])
    expect(allomorphClassesFor('-kan')).toEqual([])
  })

  it('affixCatalogEntry returns the entry or undefined', () => {
    expect(affixCatalogEntry('di-')?.affixType).toBe('prefix')
    expect(affixCatalogEntry('nope')).toBeUndefined()
  })

  it('distractorAffixes excludes the correct affix and prefers same affix_type first', () => {
    const ds = distractorAffixes('meN-')
    expect(ds).not.toContain('meN-')
    // same-type (prefix) distractors come before suffix/confix/reduplication ones
    const firstSuffixIdx = ds.findIndex((a) => affixCatalogEntry(a)?.affixType !== 'prefix')
    const prefixesAfterFirstSuffix = ds.slice(firstSuffixIdx).filter((a) => affixCatalogEntry(a)?.affixType === 'prefix')
    expect(prefixesAfterFirstSuffix).toEqual([])
    // enough to fill a 4-option MCQ (3 distractors)
    expect(ds.length).toBeGreaterThanOrEqual(3)
  })
})
