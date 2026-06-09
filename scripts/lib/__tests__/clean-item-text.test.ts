import { describe, it, expect } from 'vitest'
import { cleanItemText } from '../clean-item-text'

describe('cleanItemText', () => {
  it('drops a trailing pronunciation gloss', () => {
    expect(cleanItemText('cek (cèk)')).toBe('cek')
    expect(cleanItemText('copet (copèt)')).toBe('copet')
    expect(cleanItemText('presiden (présidèn)')).toBe('presiden')
    expect(cleanItemText('merah (mérah)')).toBe('merah')
  })

  it('drops a trailing abbreviation / dialect note', () => {
    expect(cleanItemText('rupiah (Rp)')).toBe('rupiah')
    expect(cleanItemText('hari ulang tahun (H.U.T.)')).toBe('hari ulang tahun')
    expect(cleanItemText('nggak (Jakarta)')).toBe('nggak')
  })

  it('drops a redundant trailing gloss', () => {
    expect(cleanItemText('deh! (deh)')).toBe('deh!')
    expect(cleanItemText('lewat (lewat)')).toBe('lewat')
  })

  it('keeps the optional letter/word for inline parens', () => {
    expect(cleanItemText('k(e)ran')).toBe('keran')
    expect(cleanItemText('tidak (ada) apa-apa')).toBe('tidak ada apa-apa')
  })

  it('leaves paren-free text untouched', () => {
    expect(cleanItemText('menukar')).toBe('menukar')
    expect(cleanItemText('uang logam')).toBe('uang logam')
    expect(cleanItemText('apa-apa')).toBe('apa-apa')
  })

  it('trims and collapses whitespace it introduces', () => {
    expect(cleanItemText('tukar  (ruilen)')).toBe('tukar') // trailing gloss → dropped
    expect(cleanItemText('a (b) c')).toBe('a b c') // inline → content "b" kept
  })

  it('never returns empty for an all-parenthetical input', () => {
    expect(cleanItemText('(only)')).toBe('(only)')
  })
})
