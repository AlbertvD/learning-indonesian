import { describe, it, expect } from 'vitest'
import { candidateSlugs } from '../../projectors/slugs'

describe('candidateSlugs (legacy 130–158 verbatim port)', () => {
  it('returns the exact lower+trim slug first', () => {
    expect(candidateSlugs('Beres')[0]).toBe('beres')
    expect(candidateSlugs('  Beres  ')[0]).toBe('beres')
  })

  it('strips trailing parentheticals: "beres (bèrès)" → "beres"', () => {
    const variants = candidateSlugs('beres (bèrès)')
    expect(variants).toContain('beres (bèrès)')
    expect(variants).toContain('beres')
  })

  it('strips trailing asterisk: "dibawa*" → "dibawa"', () => {
    const variants = candidateSlugs('dibawa*')
    expect(variants).toContain('dibawa*')
    expect(variants).toContain('dibawa')
  })

  it('strips both: "disetrika* (foo)" → "disetrika"', () => {
    const variants = candidateSlugs('disetrika* (foo)')
    expect(variants).toContain('disetrika')
  })

  it('preserves hyphens (oleh-oleh, sama-sama, baik-baik)', () => {
    expect(candidateSlugs('oleh-oleh')).toEqual(['oleh-oleh'])
    expect(candidateSlugs('sama-sama')).toEqual(['sama-sama'])
  })

  it('deduplicates while preserving priority order', () => {
    // Both `noAsterisk` and `noParens` and `stripped` all collapse to "beres"
    // when input has no decoration; we expect a single-entry array.
    expect(candidateSlugs('beres')).toEqual(['beres'])
  })
})
