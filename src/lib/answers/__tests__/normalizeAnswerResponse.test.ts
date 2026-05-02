import { describe, it, expect } from 'vitest'
import { normalizeAnswerResponse } from '../normalizeAnswerResponse'

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
    // Empty string is falsy → null. Matches legacy ExerciseShell behaviour
    // where an empty rawResponse means "no answer provided".
    expect(normalizeAnswerResponse('')).toBe(null)
  })

  it('preserves internal whitespace', () => {
    expect(normalizeAnswerResponse('saya makan nasi')).toBe('saya makan nasi')
  })
})
