import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  levenshteinDistance,
  similarityScore,
  detectMeaningChange,
} from '../../scripts/lib/text-similarity'

describe('normalizeText', () => {
  it('lowercases and trims', () => {
    expect(normalizeText('  Saya Mau  ')).toBe('saya mau')
  })

  it('strips punctuation', () => {
    expect(normalizeText('Apa kabar?')).toBe('apa kabar')
    expect(normalizeText("it's good!")).toBe('its good')
  })

  it('collapses whitespace', () => {
    expect(normalizeText('saya   ke   pasar')).toBe('saya ke pasar')
  })

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('')
  })
})

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('rumah', 'rumah')).toBe(0)
  })

  it('returns length for empty vs non-empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3)
    expect(levenshteinDistance('abc', '')).toBe(3)
  })

  it('handles single substitution', () => {
    expect(levenshteinDistance('rumah', 'rumeh')).toBe(1)
  })

  it('handles insertion', () => {
    expect(levenshteinDistance('rumah', 'rumaah')).toBe(1)
  })

  it('handles deletion', () => {
    expect(levenshteinDistance('rumah', 'rmah')).toBe(1)
  })

  it('handles completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3)
  })
})

describe('similarityScore', () => {
  it('returns 1.0 for identical texts', () => {
    expect(similarityScore('Saya ke pasar', 'Saya ke pasar')).toBe(1.0)
  })

  it('returns 1.0 for texts differing only in case/punctuation', () => {
    expect(similarityScore('Apa kabar?', 'apa kabar')).toBe(1.0)
  })

  it('returns high score for minor differences', () => {
    const score = similarityScore('Saya ke pasar', 'Saya ke psar')
    expect(score).toBeGreaterThan(0.85)
  })

  it('returns low score for very different texts', () => {
    const score = similarityScore('Saya ke pasar', 'Rumah besar murah')
    expect(score).toBeLessThan(0.5)
  })

  it('returns 0.0 when one text is empty', () => {
    expect(similarityScore('rumah', '')).toBe(0.0)
    expect(similarityScore('', 'rumah')).toBe(0.0)
  })

  it('returns 1.0 when both are empty', () => {
    expect(similarityScore('', '')).toBe(1.0)
  })
})

describe('detectMeaningChange', () => {
  it('detects missing negation word', () => {
    const result = detectMeaningChange(
      'Saya tidak mau makan',
      'Saya mau makan',
    )
    expect(result.changed).toBe(true)
    expect(result.details).toContain('tidak')
  })

  it('detects added negation word', () => {
    const result = detectMeaningChange(
      'Saya mau makan',
      'Saya tidak mau makan',
    )
    expect(result.changed).toBe(true)
    expect(result.details).toContain('tidak')
  })

  it('detects missing pronoun', () => {
    const result = detectMeaningChange(
      'Saya ke pasar',
      'ke pasar',
    )
    expect(result.changed).toBe(true)
    expect(result.details).toContain('saya')
  })

  it('returns no change for identical text', () => {
    const result = detectMeaningChange(
      'Saya ke pasar',
      'Saya ke pasar',
    )
    expect(result.changed).toBe(false)
  })

  it('returns no change for non-critical word differences', () => {
    const result = detectMeaningChange(
      'Saya makan nasi goreng',
      'Saya makan nasi putih',
    )
    expect(result.changed).toBe(false)
  })

  it('detects missing tense marker', () => {
    const result = detectMeaningChange(
      'Dia sudah makan',
      'Dia makan',
    )
    expect(result.changed).toBe(true)
    expect(result.details).toContain('sudah')
  })

  it('detects multiple missing critical words', () => {
    const result = detectMeaningChange(
      'Saya tidak akan pergi',
      'pergi',
    )
    expect(result.changed).toBe(true)
    expect(result.details).toContain('saya')
    expect(result.details).toContain('tidak')
    expect(result.details).toContain('akan')
  })
})
