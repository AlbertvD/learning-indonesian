import { describe, it, expect } from 'vitest'
import { normalizeTtsText } from '@/lib/ttsNormalize'

describe('normalizeTtsText', () => {
  it('lowercases text', () => {
    expect(normalizeTtsText('Apa Kabar')).toBe('apa kabar')
  })

  it('trims whitespace', () => {
    expect(normalizeTtsText('  batik  ')).toBe('batik')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeTtsText('apa   kabar')).toBe('apa kabar')
  })

  it('keeps punctuation (TTS prosody depends on it)', () => {
    expect(normalizeTtsText('Apa kabar?')).toBe('apa kabar?')
    expect(normalizeTtsText('Selamat pagi!')).toBe('selamat pagi!')
    expect(normalizeTtsText('Hotel itu, ya.')).toBe('hotel itu, ya.')
  })

  it('handles empty string', () => {
    expect(normalizeTtsText('')).toBe('')
  })

  it('normalizes tabs and newlines to single space', () => {
    expect(normalizeTtsText("apa\tkabar\nbaik")).toBe('apa kabar baik')
  })
})
