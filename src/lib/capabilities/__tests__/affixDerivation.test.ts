import { describe, it, expect } from 'vitest'
import { deriveAffixedForm, UnsupportedAffixError } from '../affixDerivation'

// ── L13 golden fixture (Spec 2 §3.1) ─────────────────────────────────────────
// The 14 hand-authored pairs from scripts/data/staging/lesson-13/morphology-patterns.ts.
// The engine must reproduce `derived` + `allomorphClass` exactly, and the
// templated allomorphRule must begin with the catalog affix `meN-` (so the lesson
// stage's deriveAffix recovers a catalog-valid affix → HC31 passes).
const L13_PAIRS: Array<{ root: string; derived: string; allomorphClass: string }> = [
  { root: 'masak', derived: 'memasak', allomorphClass: 'me' },
  { root: 'lihat', derived: 'melihat', allomorphClass: 'me' },
  { root: 'baca', derived: 'membaca', allomorphClass: 'mem' },
  { root: 'beli', derived: 'membeli', allomorphClass: 'mem' },
  { root: 'cari', derived: 'mencari', allomorphClass: 'men' },
  { root: 'dengar', derived: 'mendengar', allomorphClass: 'men' },
  { root: 'jual', derived: 'menjual', allomorphClass: 'men' },
  { root: 'ganti', derived: 'mengganti', allomorphClass: 'meng' },
  { root: 'ambil', derived: 'mengambil', allomorphClass: 'meng' },
  { root: 'tulis', derived: 'menulis', allomorphClass: 'men' },
  { root: 'tukar', derived: 'menukar', allomorphClass: 'men' },
  { root: 'pukul', derived: 'memukul', allomorphClass: 'mem' },
  { root: 'potong', derived: 'memotong', allomorphClass: 'mem' },
  { root: 'kirim', derived: 'mengirim', allomorphClass: 'meng' },
]

describe('deriveAffixedForm — meN- golden fixture (L13 pilot)', () => {
  for (const { root, derived, allomorphClass } of L13_PAIRS) {
    it(`reproduces ${root} → ${derived} (${allomorphClass}-)`, () => {
      const r = deriveAffixedForm(root, 'meN-')
      expect(r.derived).toBe(derived)
      expect(r.allomorphClass).toBe(allomorphClass)
      expect(r.affixType).toBe('prefix')
      expect(r.productive).toBe(true)
      // Rule note is well-formed Dutch starting with the affix label.
      expect(r.allomorphRule).toMatch(/^meN- /)
    })
  }
})

describe('deriveAffixedForm — nasalisation rules', () => {
  it('elides K/P/S/T initial consonants', () => {
    expect(deriveAffixedForm('kirim', 'meN-').derived).toBe('mengirim') // k drops → meng
    expect(deriveAffixedForm('pukul', 'meN-').derived).toBe('memukul') // p drops → mem
    expect(deriveAffixedForm('sapu', 'meN-').derived).toBe('menyapu') // s drops → meny
    expect(deriveAffixedForm('tulis', 'meN-').derived).toBe('menulis') // t drops → men
    expect(deriveAffixedForm('sapu', 'meN-').allomorphClass).toBe('meny')
  })

  it('keeps the initial consonant for non-eliding classes', () => {
    expect(deriveAffixedForm('baca', 'meN-').derived).toBe('membaca') // b kept
    expect(deriveAffixedForm('ganti', 'meN-').derived).toBe('mengganti') // g kept
  })

  it('uses meng- before a vowel and notes "een klinker"', () => {
    const r = deriveAffixedForm('ambil', 'meN-')
    expect(r.derived).toBe('mengambil')
    expect(r.allomorphRule).toContain('een klinker')
  })

  it('derives peN- with the same slot logic', () => {
    expect(deriveAffixedForm('tulis', 'peN-').derived).toBe('penulis') // t drops → pen
    expect(deriveAffixedForm('baca', 'peN-').derived).toBe('pembaca') // b kept → pem
    expect(deriveAffixedForm('kirim', 'peN-').allomorphClass).toBe('peng')
    expect(deriveAffixedForm('lihat', 'peN-').allomorphRule).toMatch(/^peN- /)
  })

  it('applies the static exception table', () => {
    expect(deriveAffixedForm('punya', 'meN-').derived).toBe('mempunyai')
    expect(deriveAffixedForm('bom', 'meN-').derived).toBe('mengebom')
    expect(deriveAffixedForm('bom', 'meN-').allomorphClass).toBe('menge')
    expect(deriveAffixedForm('ajar', 'ber-').derived).toBe('belajar')
    expect(deriveAffixedForm('kerja', 'ber-').derived).toBe('bekerja')
  })
})

describe('deriveAffixedForm — invariant prefixes', () => {
  it('concatenates ber- and di- with null allomorphClass', () => {
    const ber = deriveAffixedForm('main', 'ber-')
    expect(ber.derived).toBe('bermain')
    expect(ber.allomorphClass).toBeNull()
    expect(ber.allomorphRule).toMatch(/^ber- /)
    const di = deriveAffixedForm('baca', 'di-')
    expect(di.derived).toBe('dibaca')
    expect(di.allomorphClass).toBeNull()
    expect(di.allomorphRule).toMatch(/^di- /)
  })
})

describe('deriveAffixedForm — invariant suffixes', () => {
  it('concatenates -an / -kan / -i with null allomorphClass', () => {
    const an = deriveAffixedForm('makan', '-an')
    expect(an.derived).toBe('makanan')
    expect(an.allomorphClass).toBeNull()
    expect(an.affixType).toBe('suffix')
    expect(deriveAffixedForm('beli', '-kan').derived).toBe('belikan')
    expect(deriveAffixedForm('duduk', '-i').derived).toBe('duduki')
  })
})

describe('deriveAffixedForm — confixes (wrap-around; ADR 0019)', () => {
  // Atomic (ke-…-an) and stacked (meN-…-kan) confixes spell identically:
  // prefix-piece + root + suffix-piece. The nasalised left lives in circumfixLeft;
  // allomorphClass stays null for confixes.
  const CONFIX_CASES: Array<{ root: string; affix: string; derived: string; left: string; right: string }> = [
    { root: 'beli', affix: 'meN-…-kan', derived: 'membelikan', left: 'mem', right: 'kan' },
    { root: 'naik', affix: 'meN-…-kan', derived: 'menaikkan', left: 'me', right: 'kan' },
    { root: 'pukul', affix: 'meN-…-kan', derived: 'memukulkan', left: 'mem', right: 'kan' }, // p elides
    { root: 'beli', affix: 'di-…-kan', derived: 'dibelikan', left: 'di', right: 'kan' },
    { root: 'naik', affix: 'di-…-kan', derived: 'dinaikkan', left: 'di', right: 'kan' },
    { root: 'didik', affix: 'pe-…-an', derived: 'pendidikan', left: 'pen', right: 'an' }, // nasalising left
    { root: 'adil', affix: 'ke-…-an', derived: 'keadilan', left: 'ke', right: 'an' }, // atomic, fixed left
  ]
  for (const c of CONFIX_CASES) {
    it(`derives ${c.root} + ${c.affix} → ${c.derived}`, () => {
      const r = deriveAffixedForm(c.root, c.affix)
      expect(r.derived).toBe(c.derived)
      expect(r.affixType).toBe('confix')
      expect(r.circumfixLeft).toBe(c.left)
      expect(r.circumfixRight).toBe(c.right)
      expect(r.allomorphClass).toBeNull()
      expect(r.allomorphRule.startsWith(c.affix)).toBe(true)
    })
  }
})

describe('deriveAffixedForm — reduplication (full)', () => {
  it('derives the root-root copy with null circumfix', () => {
    const r = deriveAffixedForm('anak', 'reduplication')
    expect(r.derived).toBe('anak-anak')
    expect(r.affixType).toBe('reduplication')
    expect(r.circumfixLeft).toBeNull()
    expect(r.circumfixRight).toBeNull()
    expect(r.allomorphClass).toBeNull()
  })
})

describe('deriveAffixedForm — unsupported affixes fail loud', () => {
  it('throws on an unknown affix', () => {
    expect(() => deriveAffixedForm('makan', 'xyz-')).toThrow(UnsupportedAffixError)
  })
  it('throws on a root whose nasalisation class is not rule-derivable', () => {
    // 'q'-initial is neither a catalog class nor in the exception table.
    expect(() => deriveAffixedForm('qari', 'meN-')).toThrow(UnsupportedAffixError)
  })
})
