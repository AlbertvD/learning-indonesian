import { describe, it, expect } from 'vitest'
import { itemSlug } from '../itemSlug'

describe('itemSlug', () => {
  it('lowercases', () => {
    expect(itemSlug('Bandar')).toBe('bandar')
  })

  it('trims leading and trailing whitespace', () => {
    expect(itemSlug('  bandar  ')).toBe('bandar')
  })

  it('preserves internal spaces (does NOT hyphenate)', () => {
    expect(itemSlug('bandar udara')).toBe('bandar udara')
    expect(itemSlug('Selamat Pagi')).toBe('selamat pagi')
  })

  it('preserves Indonesian reduplication hyphens', () => {
    expect(itemSlug('oleh-oleh')).toBe('oleh-oleh')
    expect(itemSlug('baik-baik saja')).toBe('baik-baik saja')
    expect(itemSlug('sama-sama')).toBe('sama-sama')
  })

  it('preserves internal multi-space (no whitespace collapse)', () => {
    expect(itemSlug('bandar  udara')).toBe('bandar  udara')
  })

  it('preserves accent annotations (parenthetical pronunciation)', () => {
    expect(itemSlug('beres (bèrès)')).toBe('beres (bèrès)')
  })

  it('preserves trailing asterisks (passive marker)', () => {
    expect(itemSlug('dibawa*')).toBe('dibawa*')
  })

  it('is idempotent', () => {
    const inputs = ['Bandar Udara', '  oleh-oleh  ', 'BERES (BÈRÈS)']
    for (const s of inputs) {
      expect(itemSlug(itemSlug(s))).toBe(itemSlug(s))
    }
  })

  it('handles empty string', () => {
    expect(itemSlug('')).toBe('')
  })

  it('handles whitespace-only input', () => {
    expect(itemSlug('   ')).toBe('')
  })

  it('preserves punctuation that is part of the canonical form', () => {
    expect(itemSlug('apa?')).toBe('apa?')
    expect(itemSlug('!')).toBe('!')
  })
})
