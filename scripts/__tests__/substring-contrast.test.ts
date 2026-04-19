import { describe, it, expect, vi } from 'vitest'

// lint-staging.ts has a top-level process.exit if SUPABASE_SERVICE_KEY is
// missing — set a dummy value before import so the helper can be loaded
// without spinning up the supabase client.
vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key-not-used')

const { isSubstringContrastPattern } = await import('../lint-staging')

describe('isSubstringContrastPattern', () => {
  it('exempts reduplication-* patterns', () => {
    expect(isSubstringContrastPattern('reduplication-plural')).toBe(true)
    expect(isSubstringContrastPattern('reduplication-intensifier')).toBe(true)
  })

  it('exempts comparison/comparative/superlative slug suffixes', () => {
    expect(isSubstringContrastPattern('lebih-comparative')).toBe(true)
    expect(isSubstringContrastPattern('paling-ter-superlative')).toBe(true)
    expect(isSubstringContrastPattern('se-sama-equality-comparison')).toBe(true)
    expect(isSubstringContrastPattern('kurang-diminutive-comparison')).toBe(true)
  })

  it('exempts the explicit slug allowlist', () => {
    expect(isSubstringContrastPattern('no-singular-plural')).toBe(true)
    expect(isSubstringContrastPattern('ada-existential')).toBe(true)
  })

  it('does NOT exempt patterns where substring overlap would be a real bug', () => {
    expect(isSubstringContrastPattern('time-place-word-order')).toBe(false)
    expect(isSubstringContrastPattern('verb-no-conjugation')).toBe(false)
    expect(isSubstringContrastPattern('nya-possessive-suffix')).toBe(false)
    expect(isSubstringContrastPattern('zero-copula')).toBe(false)
  })

  it('returns false for null/undefined/empty input', () => {
    expect(isSubstringContrastPattern(undefined)).toBe(false)
    expect(isSubstringContrastPattern(null)).toBe(false)
    expect(isSubstringContrastPattern('')).toBe(false)
  })

  it('does not match unrelated slugs that happen to contain "comparison" mid-string', () => {
    // The regex is anchored at $; a slug like 'comparison-aware-blah' wouldn't match.
    expect(isSubstringContrastPattern('comparison-aware-blah')).toBe(false)
  })
})
