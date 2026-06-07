import { describe, it, expect } from 'vitest'
import {
  splitAlternatives,
  classifyDutchSeparator,
  classifyIndonesianSeparator,
  canonicaliseDutchSeparator,
} from '@/lib/capabilities/separatorConvention'

describe('splitAlternatives', () => {
  it('splits on the canonical "/" separator', () => {
    expect(splitAlternatives('huis / woning')).toEqual(['huis', 'woning'])
  })

  it('splits defensively on ";" (legacy authoring convenience)', () => {
    expect(splitAlternatives('het is goedkoop; de prijs is laag'))
      .toEqual(['het is goedkoop', 'de prijs is laag'])
  })

  it('does NOT split on comma — a comma is part of one answer', () => {
    expect(splitAlternatives('maar, echter')).toEqual(['maar, echter'])
  })

  it('trims segments and drops empties', () => {
    expect(splitAlternatives('a /  / b ;')).toEqual(['a', 'b'])
  })

  it('returns the whole string when no separator is present', () => {
    expect(splitAlternatives('rumah')).toEqual(['rumah'])
  })
})

describe('classifyDutchSeparator', () => {
  it('flags a ";"-separated value as a semicolon violation', () => {
    expect(classifyDutchSeparator('Het is goedkoop; de prijs is laag')).toBe('semicolon')
  })

  it('accepts a canonical "/"-separated value', () => {
    expect(classifyDutchSeparator('huis / woning')).toBeNull()
  })

  it('flags short comma-segments as comma-as-OR', () => {
    expect(classifyDutchSeparator('vader, meneer, u')).toBe('comma_as_or')
  })

  it('accepts a single clause that merely contains an internal comma (>=4 tokens)', () => {
    expect(classifyDutchSeparator('ja, dat is een goed idee')).toBeNull()
  })

  it('does not flag a value that already uses "/" even if it also has a comma', () => {
    expect(classifyDutchSeparator('weg / verdwenen, kwijt')).toBeNull()
  })

  it('respects a caller-supplied exemption denylist', () => {
    const exempt = new Set(['ja, hoor'])
    expect(classifyDutchSeparator('ja, hoor', exempt)).toBeNull()
  })

  it('exempts the seeded set-phrase reply by default (comma = punctuation)', () => {
    // "baik-baik saja" = "Goed, dank u wel" — one reply, not "goed" / "dank u wel".
    expect(classifyDutchSeparator('Goed, dank u wel')).toBeNull()
  })
})

describe('canonicaliseDutchSeparator', () => {
  it('rewrites a comma-as-OR list to "/"', () => {
    expect(canonicaliseDutchSeparator('maar, echter')).toBe('maar / echter')
    expect(canonicaliseDutchSeparator('rijden, gaan, lopen')).toBe('rijden / gaan / lopen')
  })

  it('rewrites a ";"-separated list to "/"', () => {
    expect(canonicaliseDutchSeparator('nieuw; pas')).toBe('nieuw / pas')
  })

  it('rewrites a mixed ";" + comma-as-OR list to a single "/" list', () => {
    expect(canonicaliseDutchSeparator('er is, er zijn; hebben')).toBe('er is / er zijn / hebben')
  })

  it('leaves an already-canonical "/" value unchanged', () => {
    expect(canonicaliseDutchSeparator('huis / woning')).toBe('huis / woning')
  })

  it('leaves a single meaning unchanged', () => {
    expect(canonicaliseDutchSeparator('rumah')).toBe('rumah')
  })

  it('leaves a single clause with a legitimate internal comma unchanged', () => {
    // A long segment is not a comma-as-OR list — classify accepts it, so do we.
    const clause = 'een man die altijd lacht, vooral in de ochtend'
    expect(canonicaliseDutchSeparator(clause)).toBe(clause)
  })

  it('respects the comma exemption denylist (comma = punctuation)', () => {
    expect(canonicaliseDutchSeparator('Goed, dank u wel')).toBe('Goed, dank u wel')
  })

  it('produces a value that classifyDutchSeparator no longer flags', () => {
    for (const v of ['maar, echter', 'nieuw; pas', 'er is, er zijn; hebben', 'dokter, arts']) {
      expect(classifyDutchSeparator(canonicaliseDutchSeparator(v))).toBeNull()
    }
  })
})

describe('classifyIndonesianSeparator', () => {
  it('flags a ";"-separated Indonesian value as a semicolon violation', () => {
    expect(classifyIndonesianSeparator('makan; minum')).toBe('semicolon')
  })

  it('never flags a comma — verbless equatives make short comma-segments normal', () => {
    expect(classifyIndonesianSeparator('dia guru, saya guru')).toBeNull()
  })

  it('accepts a canonical "/"-separated Indonesian value', () => {
    expect(classifyIndonesianSeparator('apa / apakah')).toBeNull()
  })
})
