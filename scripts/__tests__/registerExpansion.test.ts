import { describe, it, expect } from 'vitest'
import { expandRegister, findSubstitutablePositions, substituteAllFormal, type RegisterPairLite } from '../lib/registerExpansion'

const PAIRS: RegisterPairLite[] = [
  { formal: 'tidak', informal: 'nggak' },
  { formal: 'sudah', informal: 'udah' },
  { formal: 'saja', informal: 'aja' },
  { formal: 'begitu', informal: 'gitu' },
]

describe('findSubstitutablePositions', () => {
  it('finds a single matching token position', () => {
    expect(findSubstitutablePositions('Saya tidak tahu.', PAIRS)).toEqual([1])
  })

  it('finds multiple matching token positions', () => {
    expect(findSubstitutablePositions('Saya tidak sudah makan saja.', PAIRS)).toEqual([1, 2, 4])
  })

  it('returns [] when nothing matches', () => {
    expect(findSubstitutablePositions('Saya makan nasi.', PAIRS)).toEqual([])
  })
})

describe('expandRegister — 1 substitutable token', () => {
  it('returns exactly one substituted variant', () => {
    const out = expandRegister('Saya tidak tahu.', PAIRS)
    expect(out).toEqual(['Saya nggak tahu.'])
  })

  it('preserves sentence-initial capitalization on the substituted token', () => {
    const out = expandRegister('Tidak ada apa-apa.', PAIRS)
    expect(out).toContain('Nggak ada apa-apa.')
  })

  it('returns [] for an answer with no substitutable token', () => {
    expect(expandRegister('Saya makan nasi.', PAIRS)).toEqual([])
  })
})

describe('expandRegister — 2-3 substitutable tokens: FULL combination set', () => {
  it('produces 2^2 - 1 = 3 combos for 2 substitutable tokens', () => {
    const out = expandRegister('Saya sudah tidak mau.', PAIRS)
    expect(out).toHaveLength(3)
    expect(out).toContain('Saya udah tidak mau.')   // substitute sudah only
    expect(out).toContain('Saya sudah nggak mau.')  // substitute tidak only
    expect(out).toContain('Saya udah nggak mau.')   // substitute both
  })

  it('produces 2^3 - 1 = 7 combos for 3 substitutable tokens, including MIXED-register forms', () => {
    const out = expandRegister('Saya tidak sudah makan saja.', PAIRS)
    expect(out).toHaveLength(7)
    // the worked example from spec §2.3: tidak+sudah+saja needs a mixed form
    expect(out).toContain('Saya nggak sudah makan saja.')
    expect(out).toContain('Saya tidak udah makan saja.')
    expect(out).toContain('Saya nggak udah makan aja.')
  })

  it('never includes the original unsubstituted answer', () => {
    const original = 'Saya sudah tidak mau.'
    expect(expandRegister(original, PAIRS)).not.toContain(original)
  })
})

describe('expandRegister — >3 substitutable tokens: bounded fallback', () => {
  const fourTokenAnswer = 'Tidak, sudah begitu saja tidak mau.' // tidak(x2), sudah, begitu, saja = 5 positions

  it('produces substitute-all + substitute-each-singly (n+1 variants, not 2^n)', () => {
    const positions = findSubstitutablePositions(fourTokenAnswer, PAIRS)
    expect(positions.length).toBeGreaterThan(3)
    const out = expandRegister(fourTokenAnswer, PAIRS)
    // n+1 unique variants at most (could be fewer if two singly-substituted
    // variants collide, which they won't here since positions are distinct)
    expect(out.length).toBeLessThanOrEqual(positions.length + 1)
    expect(out.length).toBeGreaterThan(0)
  })

  it('includes the substitute-all variant', () => {
    const out = expandRegister(fourTokenAnswer, PAIRS)
    expect(out).toContain('Nggak, udah gitu aja nggak mau.')
  })
})

describe('expandRegister — no register pairs configured', () => {
  it('returns [] when the pairs list is empty', () => {
    expect(expandRegister('Saya tidak tahu.', [])).toEqual([])
  })
})

describe('substituteAllFormal — the HC51 health-check predicate target', () => {
  it('substitutes every formal token in one pass', () => {
    expect(substituteAllFormal('Saya tidak sudah makan saja.', PAIRS)).toBe('Saya nggak udah makan aja.')
  })

  it('returns null when nothing is substitutable', () => {
    expect(substituteAllFormal('Saya makan nasi.', PAIRS)).toBeNull()
  })

  it('is always one of expandRegister\'s returned combos', () => {
    const answer = 'Saya tidak sudah makan saja.'
    const all = substituteAllFormal(answer, PAIRS)
    const combos = expandRegister(answer, PAIRS)
    expect(all).not.toBeNull()
    expect(combos).toContain(all)
  })

  it('preserves sentence-initial capitalization', () => {
    expect(substituteAllFormal('Tidak ada apa-apa.', PAIRS)).toBe('Nggak ada apa-apa.')
  })
})
