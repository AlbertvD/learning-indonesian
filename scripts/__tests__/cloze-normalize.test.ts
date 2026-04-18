import { describe, it, expect } from 'vitest'
import { normalizeForClozeCompare, normalizeForExemptLookup } from '../lib/normalize'

describe('normalizeForClozeCompare', () => {
  it('lowercases', () => {
    expect(normalizeForClozeCompare('Monas = Monumen Nasional'))
      .toBe('monas = monumen nasional')
  })

  it('trims whitespace', () => {
    expect(normalizeForClozeCompare('  hallo  ')).toBe('hallo')
  })

  it('strips trailing question marks', () => {
    expect(normalizeForClozeCompare('apa?')).toBe('apa')
    expect(normalizeForClozeCompare('apa kabar?')).toBe('apa kabar')
    expect(normalizeForClozeCompare('berapa harganya?')).toBe('berapa harganya')
  })

  it('strips trailing exclamation marks', () => {
    expect(normalizeForClozeCompare('sih!')).toBe('sih')
    expect(normalizeForClozeCompare('deh!')).toBe('deh')
  })

  it('strips repeated trailing punctuation', () => {
    expect(normalizeForClozeCompare('wow!!!')).toBe('wow')
    expect(normalizeForClozeCompare('wat?!')).toBe('wat')
  })

  it('folds pronunciation diacritics to ASCII', () => {
    expect(normalizeForClozeCompare('léwat (léwat)')).toBe('lewat (lewat)')
    expect(normalizeForClozeCompare('mérah (mérah)')).toBe('merah (merah)')
    expect(normalizeForClozeCompare('dèh')).toBe('deh')
  })

  it('preserves internal punctuation', () => {
    expect(normalizeForClozeCompare("'full AC'")).toBe("'full ac'")
    expect(normalizeForClozeCompare('e-mail')).toBe('e-mail')
  })

  it('is idempotent', () => {
    const once = normalizeForClozeCompare('Monas = Monumen Nasional')
    expect(normalizeForClozeCompare(once)).toBe(once)
  })

  it('matches the base_text ↔ cloze-slug pairs that previously false-positived', () => {
    // Pairs drawn from Round 3 review findings.
    const pairs: Array<[string, string]> = [
      ['apa?', 'apa'],
      ['berapa?', 'berapa'],
      ['apa kabar?', 'apa kabar'],
      ['berapa harganya?', 'berapa harganya'],
      ['sih!', 'sih'],
      ['lewat (léwat)', 'lewat (lewat)'],
      ['merah (mérah)', 'merah (merah)'],
    ]
    for (const [base, slug] of pairs) {
      expect(normalizeForClozeCompare(base)).toBe(normalizeForClozeCompare(slug))
    }
  })
})

describe('normalizeForExemptLookup', () => {
  it('strips the trailing pronunciation parenthetical for exempt lookup', () => {
    expect(normalizeForExemptLookup('deh! (dèh)')).toBe('deh')
    expect(normalizeForExemptLookup('sih (sìh)')).toBe('sih')
    expect(normalizeForExemptLookup('lah')).toBe('lah')
  })

  it('only strips a SINGLE trailing parenthetical, not internal ones', () => {
    // Regular cloze-compare keeps 'lewat (lewat)' identical; exempt lookup
    // collapses it to 'lewat' — that's fine because 'lewat' is not on the
    // exempt list anyway, so the coverage check still requires a context.
    expect(normalizeForExemptLookup('lewat (léwat)')).toBe('lewat')
  })
})
