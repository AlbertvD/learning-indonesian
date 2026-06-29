import { describe, it, expect } from 'vitest'
import { decompose } from '../affixDecomposition'

// A small known-root lexicon for the predicate. The decomposer must VERIFY against the
// forward engine, so only true derivations of these roots come back.
const ROOTS = new Set([
  'baca', 'tulis', 'lari', 'main', 'makan', 'ajar', 'jual', 'ambil', 'pukul', 'kira',
  'kembang', 'lindung', 'milik', 'jatuh', 'jelas',
])
const isRoot = (w: string) => ROOTS.has(w)

const affixesFor = (surface: string) => decompose(surface, isRoot).map((d) => `${d.root}+${d.affix}`)

describe('decompose', () => {
  it('recovers a nasalising meN- verb (consonant elision)', () => {
    // membaca = me + baca (b keeps); menulis = men + tulis (t elides)
    expect(affixesFor('membaca')).toContain('baca+meN-')
    expect(affixesFor('menulis')).toContain('tulis+meN-')
    expect(affixesFor('memukul')).toContain('pukul+meN-') // p elides
    expect(affixesFor('mengambil')).toContain('ambil+meN-') // vowel
  })

  it('recovers a NASAL confix (meN-…-kan / meN-…-i — the prefix AND suffix together)', () => {
    // mengembangkan = meng + kembang (k elides) + kan; melindungi = me + lindung + i
    expect(affixesFor('mengembangkan')).toContain('kembang+meN-…-kan')
    expect(affixesFor('melindungi')).toContain('lindung+meN-…-i')
    expect(affixesFor('memiliki')).toContain('milik+meN-…-i')
    expect(affixesFor('menjatuhkan')).toContain('jatuh+meN-…-kan')
    expect(affixesFor('menjelaskan')).toContain('jelas+meN-…-kan')
  })

  it('recovers fixed prefixes (ber-, di-)', () => {
    expect(affixesFor('berlari')).toContain('lari+ber-')
    expect(affixesFor('dibaca')).toContain('baca+di-')
  })

  it('recovers a suffix (-an)', () => {
    expect(affixesFor('makanan')).toContain('makan+-an')
  })

  it('returns nothing for a monomorphemic / unknown-root word', () => {
    expect(decompose('rumah', isRoot)).toEqual([]) // not a derivation of any known root
    expect(decompose('dan', isRoot)).toEqual([]) // too short / function word
  })

  it('does not return a candidate whose root is unknown', () => {
    // 'memasak' would strip to 'masak', but 'masak' is not in ROOTS → no result.
    expect(decompose('memasak', isRoot)).toEqual([])
  })

  it('only returns decompositions the forward engine confirms (no false positives)', () => {
    // 'beranda' (a real monomorphemic word) starts with 'ber' but 'anda' deriving with
    // ber- would give 'beranda' — however 'anda' is not in ROOTS, so it is rejected.
    expect(decompose('beranda', isRoot)).toEqual([])
  })
})
