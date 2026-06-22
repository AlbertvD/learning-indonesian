import { describe, it, expect } from 'vitest'
import {
  AFFIX_CATALOG,
  AFFIX_SET,
  isCatalogAffix,
  affixCatalogEntry,
  allomorphClassesFor,
  distractorAffixes,
  routesToMeaningUsage,
} from '../affixCatalog'

describe('routesToMeaningUsage — form-regularity routing (ADR 0021)', () => {
  it('routes single invariant prefix/suffix affixes to meaning/usage', () => {
    for (const a of ['ber-', 'di-', 'ter-', 'se-', 'memper-', '-an', '-kan', '-i']) {
      expect(routesToMeaningUsage(a), a).toBe(true)
    }
  })

  it('keeps allomorphic, confix, and reduplication affixes on formation', () => {
    for (const a of ['meN-', 'peN-', 'ke-…-an', 'meN-…-kan', 'meN-…-i', 'pe-…-an', 'per-…-an', 'di-…-kan', 'reduplication', 'reduplication-an', 'ke-…-an-reduplication']) {
      expect(routesToMeaningUsage(a), a).toBe(false)
    }
  })

  it('fails safe to formation for an unknown affix', () => {
    expect(routesToMeaningUsage('zz-')).toBe(false)
  })

  it('partitions the whole catalog with no overlap or gap', () => {
    for (const e of AFFIX_CATALOG) {
      const meaning = routesToMeaningUsage(e.affix)
      const isInvariantAffix = (e.affixType === 'prefix' || e.affixType === 'suffix') && (e.allomorphClasses?.length ?? 0) === 0
      expect(meaning).toBe(isInvariantAffix)
    }
  })
})

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

  it('every entry carries a unique teaching rank + a valid CEFR level', () => {
    const cefr = new Set(['A1', 'A2', 'B1', 'B2'])
    const ranks = AFFIX_CATALOG.map((e) => e.rank)
    expect(new Set(ranks).size).toBe(ranks.length)
    for (const e of AFFIX_CATALOG) {
      expect(Number.isInteger(e.rank)).toBe(true)
      expect(e.rank).toBeGreaterThan(0)
      expect(cefr.has(e.cefrLevel)).toBe(true)
    }
  })

  it('the core affixes follow the research teaching sequence by rank', () => {
    const byRank = [...AFFIX_CATALOG].sort((a, b) => a.rank - b.rank).map((e) => e.affix)
    // ber- → di- → meN- → -an → -kan → -i → ter- → se- → peN- lead the order.
    expect(byRank.slice(0, 9)).toEqual([
      'ber-', 'di-', 'meN-', '-an', '-kan', '-i', 'ter-', 'se-', 'peN-',
    ])
    // reduplication entries are taught last.
    expect(byRank.at(-1)).toBe('ke-…-an-reduplication')
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

  it('reduplication-an is a catalog affix with a redup+suffix recipe (L22)', () => {
    expect(isCatalogAffix('reduplication-an')).toBe(true)
    const e = affixCatalogEntry('reduplication-an')!
    expect(e.affixType).toBe('reduplication')
    expect(e.composition).toEqual({ reduplicate: true, suffix: 'an' })
  })

  it('ke-…-an-reduplication is a catalog affix with a fixed-prefix + redup + suffix recipe (L22)', () => {
    expect(isCatalogAffix('ke-…-an-reduplication')).toBe(true)
    const e = affixCatalogEntry('ke-…-an-reduplication')!
    expect(e.affixType).toBe('reduplication')
    expect(e.composition).toEqual({ prefix: { fixed: 'ke' }, reduplicate: true, suffix: 'an' })
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
