import { describe, it, expect } from 'vitest'
import { normalizeAnswer, checkAnswer, normalizeAnswerResponse } from '@/lib/answerNormalization'

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

  it('accepts any slash-separated alternative in canonical', () => {
    expect(checkAnswer('huis', 'huis / woning', []).isCorrect).toBe(true)
    expect(checkAnswer('woning', 'huis / woning', []).isCorrect).toBe(true)
  })

  it('accepts any slash-separated alternative in a variant', () => {
    expect(checkAnswer('gaan', 'lopen', ['gaan / rijden']).isCorrect).toBe(true)
    expect(checkAnswer('rijden', 'lopen', ['gaan / rijden']).isCorrect).toBe(true)
  })

  it('accepts answer matching canonical stripped of parenthetical', () => {
    expect(checkAnswer('huis', 'huis (gebouw)', []).isCorrect).toBe(true)
  })

  it('accepts slash alternative when canonical has parentheticals', () => {
    expect(checkAnswer('huis', 'huis (gebouw) / woning', []).isCorrect).toBe(true)
    expect(checkAnswer('woning', 'huis (gebouw) / woning', []).isCorrect).toBe(true)
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

  it('accepts any comma-separated alternative in canonical', () => {
    expect(checkAnswer('maar', 'maar, echter', []).isCorrect).toBe(true)
    expect(checkAnswer('maar', 'maar, echter', []).isFuzzy).toBe(false)
    expect(checkAnswer('echter', 'maar, echter', []).isCorrect).toBe(true)
    expect(checkAnswer('echter', 'maar, echter', []).isFuzzy).toBe(false)
  })

  it('accepts a comma-separated alternative that contains a parenthetical hint', () => {
    expect(checkAnswer('weg', 'weg, verdwenen (kwijt)', []).isCorrect).toBe(true)
    expect(checkAnswer('verdwenen', 'weg, verdwenen (kwijt)', []).isCorrect).toBe(true)
  })

  it('accepts a comma-separated alternative even when the alternative itself has punctuation', () => {
    expect(checkAnswer('wc', 'toilet, w.c.', []).isCorrect).toBe(true)
    expect(checkAnswer('toilet', 'toilet, w.c.', []).isCorrect).toBe(true)
  })

  it('accepts both alternatives joined by slash even when canonical uses commas', () => {
    const r = checkAnswer('maar/echter', 'maar, echter', [])
    expect(r.isCorrect).toBe(true)
    expect(r.isFuzzy).toBe(false)
  })

  it('accepts the full comma-joined form as a single answer', () => {
    const r = checkAnswer('maar, echter', 'maar, echter', [])
    expect(r.isCorrect).toBe(true)
    expect(r.isFuzzy).toBe(false)
  })

  it('accepts three-way alternatives', () => {
    expect(checkAnswer('happy', 'happy, pleased, nice', []).isCorrect).toBe(true)
    expect(checkAnswer('pleased', 'happy, pleased, nice', []).isCorrect).toBe(true)
    expect(checkAnswer('nice', 'happy, pleased, nice', []).isCorrect).toBe(true)
  })

  it('still rejects a wrong answer when canonical has alternatives', () => {
    expect(checkAnswer('banana', 'maar, echter', []).isCorrect).toBe(false)
  })
})

describe('normalizeAnswerResponse', () => {
  it('lowercases', () => {
    expect(normalizeAnswerResponse('Hello')).toBe('hello')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeAnswerResponse('  hello  ')).toBe('hello')
  })

  it('does both', () => {
    expect(normalizeAnswerResponse('  HELLO World  ')).toBe('hello world')
  })

  it('returns null for null', () => {
    expect(normalizeAnswerResponse(null)).toBe(null)
  })

  it('returns null for undefined', () => {
    expect(normalizeAnswerResponse(undefined)).toBe(null)
  })

  it('returns null for empty string', () => {
    // Empty string is falsy → null. An empty rawResponse means "no answer
    // provided" and should not be stored as the literal empty string.
    expect(normalizeAnswerResponse('')).toBe(null)
  })

  it('preserves internal whitespace', () => {
    expect(normalizeAnswerResponse('saya makan nasi')).toBe('saya makan nasi')
  })

  it('preserves punctuation (unlike comparison-side normalizeAnswer)', () => {
    expect(normalizeAnswerResponse('  Hello, World!  ')).toBe('hello, world!')
  })
})
