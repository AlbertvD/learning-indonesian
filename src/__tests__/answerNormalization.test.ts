import { describe, it, expect } from 'vitest'
import { normalizeAnswer, checkAnswer } from '@/lib/answerNormalization'

describe('normalizeAnswer', () => {
  it('trims whitespace', () => {
    expect(normalizeAnswer('  rumah  ')).toBe('rumah')
  })

  it('folds case', () => {
    expect(normalizeAnswer('Rumah')).toBe('rumah')
  })

  it('strips punctuation', () => {
    expect(normalizeAnswer('rumah!')).toBe('rumah')
    expect(normalizeAnswer('rumah.')).toBe('rumah')
    expect(normalizeAnswer("it's")).toBe('its')
  })

  it('removes parentheticals', () => {
    expect(normalizeAnswer('house (building)')).toBe('house')
  })

  it('handles combined transforms', () => {
    expect(normalizeAnswer('  Rumah Besar!  ')).toBe('rumah besar')
  })
})

describe('checkAnswer', () => {
  it('matches exact canonical answer', () => {
    const result = checkAnswer('rumah', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('matches with normalization', () => {
    const result = checkAnswer('  Rumah  ', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('matches a known variant', () => {
    const result = checkAnswer('home', 'house', ['home', 'dwelling'])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('accepts typo within Levenshtein distance 1 of canonical', () => {
    const result = checkAnswer('rumha', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(true)
  })

  it('accepts typo within Levenshtein distance 1 of variant', () => {
    const result = checkAnswer('hom', 'house', ['home'])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(true)
  })

  it('rejects wrong answers', () => {
    const result = checkAnswer('kucing', 'rumah', [])
    expect(result.isCorrect).toBe(false)
    expect(result.isFuzzy).toBe(false)
  })

  it('rejects answers beyond Levenshtein distance 1', () => {
    const result = checkAnswer('membeli', 'memberi', [])
    expect(result.isCorrect).toBe(false)
  })
})
