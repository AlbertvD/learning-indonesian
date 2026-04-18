import { describe, it, expect } from 'vitest'
import { stripAffixes, tokenize } from '../lib/affix'

describe('stripAffixes — basic suffixes', () => {
  it('strips -nya', () => expect(stripAffixes('namanya')).toBe('nama'))
  it('strips -lah', () => expect(stripAffixes('ambillah')).toBe('ambil'))
  it('strips -kah', () => expect(stripAffixes('bisakah')).toBe('bisa'))
  it('strips -ku as suffix', () => expect(stripAffixes('bukuku')).toBe('buku'))
  it('strips -mu as suffix', () => expect(stripAffixes('mobilmu')).toBe('mobil'))
  it('strips -kan', () => expect(stripAffixes('gunakan')).toBe('guna'))
  // Note: berikan (give-to) reduces to 'ikan' because prefix-first sees ber-
  // and 'ikan' (fish) is itself a valid root. Mechanical stripping can't
  // disambiguate beri+kan vs ber+ikan; accept this — both decompositions
  // hit known vocab.
})

describe('stripAffixes — does NOT strip root-final -i (kopi/pagi/tinggi)', () => {
  // We deliberately don't strip '-i' as a suffix (see lib/affix.ts comment).
  // mencari and tertinggi reduce to their proper roots; verbal -i derivations
  // like mempelajari are an accepted false-positive.
  it('mencari → cari (does not strip root-final i)', () => expect(stripAffixes('mencari')).toBe('cari'))
  it('tertinggi → tinggi (does not strip root-final i)', () => expect(stripAffixes('tertinggi')).toBe('tinggi'))
})

describe('stripAffixes — basic prefixes', () => {
  it('strips ber-', () => expect(stripAffixes('berjalan')).toBe('jalan'))
  it('strips ter-', () => expect(stripAffixes('terbaik')).toBe('baik'))
  it('strips ter- (superlative)', () => expect(stripAffixes('tertinggi')).toBe('tinggi'))
  it('strips se-', () => expect(stripAffixes('selebar')).toBe('lebar'))
  it('strips se-', () => expect(stripAffixes('seberat')).toBe('berat'))
  it('strips di- (passive)', () => expect(stripAffixes('dibeli')).toBe('beli'))
  it('strips meng- (vowel root)', () => expect(stripAffixes('mengambil')).toBe('ambil'))
  it('strips ke-', () => expect(stripAffixes('keluar')).toBe('luar'))
})

describe('stripAffixes — does NOT over-strip (B5/B6/B7 regression)', () => {
  it('does not strip me- from merah (basic adjective)', () => expect(stripAffixes('merah')).toBe('merah'))
  it('does not strip pe- from pelan (basic adverb)', () => expect(stripAffixes('pelan')).toBe('pelan'))
  it('does not strip ku- from kucing (cat)', () => expect(stripAffixes('kucing')).toBe('kucing'))
  it('does not strip mu- from mungkin (perhaps)', () => expect(stripAffixes('mungkin')).toBe('mungkin'))
  it('does not strip -i from kopi (coffee)', () => expect(stripAffixes('kopi')).toBe('kopi'))
  it('does not strip -i from pagi (morning)', () => expect(stripAffixes('pagi')).toBe('pagi'))
  it('does not strip -i from nasi (rice)', () => expect(stripAffixes('nasi')).toBe('nasi'))
  it('does not strip -i from hari (day)', () => expect(stripAffixes('hari')).toBe('hari'))
  it('does not strip -i from gigi (tooth)', () => expect(stripAffixes('gigi')).toBe('gigi'))
})

describe('stripAffixes — preserves root letter for meN- (B4 regression)', () => {
  // meN- + b/f/v root: the root letter is preserved (mem + beri = memberi, NOT mem + eri).
  // Stripping 'memb' would lose the b. We must strip only 'mem' (3 chars).
  it('memberi → beri (preserves the b)', () => expect(stripAffixes('memberi')).toBe('beri'))
  it('membaca → baca (preserves the b)', () => expect(stripAffixes('membaca')).toBe('baca'))
  // meN- + j root: same — root letter preserved.
  it('menjual → jual (preserves the j)', () => expect(stripAffixes('menjual')).toBe('jual'))
})

describe('stripAffixes — known limitations', () => {
  // mem- before p morphs the p away (mem + (p)unyai = mempunyai → root punya).
  // We cannot reconstruct the p without a dictionary lookup. We strip 'mem'
  // → 'punyai' which is the closest we get.
  it('mempunyai → punyai (mem- morphs p; cannot reconstruct)', () => {
    expect(stripAffixes('mempunyai')).toBe('punyai')
  })
  // Verbal -i is not stripped, so verb forms like mempelajari (root pelajar)
  // and mengetahui (root tahu) reduce only partially. False-positive cost.
  it('mempelajari → pelajari (verbal -i not stripped — accepted false positive)', () => {
    expect(stripAffixes('mempelajari')).toBe('pelajari')
  })
})

describe('stripAffixes — idempotent', () => {
  it('stripping twice is the same as stripping once', () => {
    const once = stripAffixes('namanya')
    expect(stripAffixes(once)).toBe(once)
  })
  it('a bare root is unchanged', () => {
    expect(stripAffixes('rumah')).toBe('rumah')
  })
})

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world'])
  })
  it('strips punctuation', () => {
    expect(tokenize('Halo, dunia!')).toEqual(['halo', 'dunia'])
  })
  it('splits on hyphens (reduplications)', () => {
    expect(tokenize('anak-anak')).toEqual(['anak', 'anak'])
  })
  it('drops empty tokens', () => {
    expect(tokenize('  hello   ')).toEqual(['hello'])
  })
  it('handles em-dash and quotes by treating them as separators', () => {
    expect(tokenize('"Halo" — dia bilang')).toEqual(['halo', 'dia', 'bilang'])
  })
})
