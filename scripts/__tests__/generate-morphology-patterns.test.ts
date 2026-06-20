import { describe, it, expect } from 'vitest'
import {
  generateMorphologyPatterns,
  resolvableBaseSlugs,
  coveredClasses,
  extractSentences,
  harvestCarrier,
  type LessonCategory,
} from '../generate-morphology-patterns'
// NB: the golden proof pins a FIXED pilot fixture below — NOT the live
// lesson-13/morphology-roots.ts, which ADR 0020 makes a generated+expanded file.

// The L13 grammar categories (titles + authored examples) as in lesson.ts. The
// examples seed the class cross-check's covered-set; the titles seed slug minting.
const A1 = 'A1. ME- zonder verandering (me-)'
const A2 = 'A2. ME- met aangepast voorvoegsel (mem-, men-, meng-)'
const B = 'B. ME- met verandering van de eerste klank (K, P, S, T)'

const L13_CATEGORIES: LessonCategory[] = [
  { title: 'De ME-vorm: de bedrijvende werkwoordsvorm', examples: [] },
  {
    title: A1,
    examples: [
      { indonesian: 'lihat → melihat' },
      { indonesian: 'nanti → menanti' },
      { indonesian: 'rasa → merasa' },
    ],
  },
  {
    title: A2,
    examples: [
      { indonesian: 'baca → membaca' },
      { indonesian: 'cari → mencari' },
      { indonesian: 'ambil → mengambil' },
    ],
  },
  {
    title: B,
    examples: [
      { indonesian: 'kirim → mengirim' },
      { indonesian: 'potong → memotong' },
      { indonesian: 'simpan → menyimpan' },
      { indonesian: 'tukar → menukar' },
    ],
  },
]

// The 14 hand-authored L13 pilot pairs as a FIXED fixture — the engine's golden
// proof. ADR 0020: the live lesson-13/morphology-roots.ts is now GENERATED and
// expanded by the proposer, so the engine regression guard pins this, not the file.
const PILOT_ROOTS = [
  { root: 'masak', affix: 'meN-', illustratesCategory: A1 },
  { root: 'lihat', affix: 'meN-', illustratesCategory: A1 },
  { root: 'baca', affix: 'meN-', illustratesCategory: A2 },
  { root: 'beli', affix: 'meN-', illustratesCategory: A2 },
  { root: 'cari', affix: 'meN-', illustratesCategory: A2 },
  { root: 'dengar', affix: 'meN-', illustratesCategory: A2 },
  { root: 'jual', affix: 'meN-', illustratesCategory: A2 },
  { root: 'ganti', affix: 'meN-', illustratesCategory: A2 },
  { root: 'ambil', affix: 'meN-', illustratesCategory: A2 },
  { root: 'tulis', affix: 'meN-', illustratesCategory: B },
  { root: 'tukar', affix: 'meN-', illustratesCategory: B },
  { root: 'pukul', affix: 'meN-', illustratesCategory: B },
  { root: 'potong', affix: 'meN-', illustratesCategory: B },
  { root: 'kirim', affix: 'meN-', illustratesCategory: B },
]
// Every pilot root exists as a learning_item (the pilot verified this).
const KNOWN = new Set(PILOT_ROOTS.map((r) => r.root))

// Expected derived + class + patternSourceRef from the hand-authored pilot.
const EXPECT: Record<string, { derived: string; cls: string; ref: string }> = {
  masak: { derived: 'memasak', cls: 'me', ref: 'l13-a1-me-zonder-verandering-me' },
  lihat: { derived: 'melihat', cls: 'me', ref: 'l13-a1-me-zonder-verandering-me' },
  baca: { derived: 'membaca', cls: 'mem', ref: 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng' },
  beli: { derived: 'membeli', cls: 'mem', ref: 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng' },
  cari: { derived: 'mencari', cls: 'men', ref: 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng' },
  dengar: { derived: 'mendengar', cls: 'men', ref: 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng' },
  jual: { derived: 'menjual', cls: 'men', ref: 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng' },
  ganti: { derived: 'mengganti', cls: 'meng', ref: 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng' },
  ambil: { derived: 'mengambil', cls: 'meng', ref: 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng' },
  tulis: { derived: 'menulis', cls: 'men', ref: 'l13-b-me-met-verandering-van-de-eerste-klank-k-p-s-t' },
  tukar: { derived: 'menukar', cls: 'men', ref: 'l13-b-me-met-verandering-van-de-eerste-klank-k-p-s-t' },
  pukul: { derived: 'memukul', cls: 'mem', ref: 'l13-b-me-met-verandering-van-de-eerste-klank-k-p-s-t' },
  potong: { derived: 'memotong', cls: 'mem', ref: 'l13-b-me-met-verandering-van-de-eerste-klank-k-p-s-t' },
  kirim: { derived: 'mengirim', cls: 'meng', ref: 'l13-b-me-met-verandering-van-de-eerste-klank-k-p-s-t' },
}

describe('generateMorphologyPatterns — L13 golden proof (file scope)', () => {
  const { pairs, errors } = generateMorphologyPatterns({
    lessonNumber: 13,
    roots: PILOT_ROOTS,
    categories: L13_CATEGORIES,
    knownItemSlugs: KNOWN,
  })

  it('produces no author-time errors and one pair per root', () => {
    expect(errors).toEqual([])
    expect(pairs).toHaveLength(PILOT_ROOTS.length)
  })

  it('reproduces every pilot pair (derived + class + patternSourceRef)', () => {
    for (const p of pairs) {
      const exp = EXPECT[p.root]
      expect(exp, `unexpected root ${p.root}`).toBeTruthy()
      expect(p.derived).toBe(exp.derived)
      expect(p.allomorphClass).toBe(exp.cls)
      expect(p.patternSourceRef).toBe(exp.ref)
      expect(p.affix).toBe('meN-')
      expect(p.affixType).toBe('prefix')
      expect(p.productive).toBe(true)
      expect(p.sourceRef).toBe(`lesson-13/morphology/meN-${p.root}-${p.derived}`)
      expect(p.allomorphRule).toMatch(/^meN- /)
    }
  })
})

describe('generateMorphologyPatterns — author-time guards', () => {
  it('flags a root misfiled under the wrong category (masak=me under B)', () => {
    const { pairs, errors } = generateMorphologyPatterns({
      lessonNumber: 13,
      roots: [{ root: 'masak', affix: 'meN-', illustratesCategory: B }],
      categories: L13_CATEGORIES,
      knownItemSlugs: KNOWN,
    })
    expect(pairs).toHaveLength(0)
    expect(errors[0]).toMatch(/outside the classes its category covers/)
  })

  it('rejects a root that is not a learning_item', () => {
    const { errors } = generateMorphologyPatterns({
      lessonNumber: 13,
      roots: [{ root: 'nonexistent', affix: 'meN-', illustratesCategory: A1 }],
      categories: L13_CATEGORIES,
      knownItemSlugs: KNOWN,
    })
    expect(errors[0]).toMatch(/root-vocab prereq/)
  })

  it('rejects an unknown affix', () => {
    const { errors } = generateMorphologyPatterns({
      lessonNumber: 13,
      roots: [{ root: 'masak', affix: 'xyz-', illustratesCategory: A1 }],
      categories: L13_CATEGORIES,
      knownItemSlugs: KNOWN,
    })
    expect(errors[0]).toMatch(/not in the affix catalog/)
  })

  it('rejects an illustratesCategory that is not a real category title', () => {
    const { errors } = generateMorphologyPatterns({
      lessonNumber: 13,
      roots: [{ root: 'masak', affix: 'meN-', illustratesCategory: 'Not A Real Category' }],
      categories: L13_CATEGORIES,
      knownItemSlugs: KNOWN,
    })
    expect(errors[0]).toMatch(/does not resolve to a unique grammar_patterns slug/)
  })

  it('derives a suffix pair (-an) and carries the explicit affix', () => {
    const { pairs, errors } = generateMorphologyPatterns({
      lessonNumber: 10,
      roots: [{ root: 'masak', affix: '-an', illustratesCategory: A1 }],
      categories: [{ title: A1, examples: [] }],
      knownItemSlugs: KNOWN,
    })
    expect(errors).toEqual([])
    expect(pairs[0]).toMatchObject({ affix: '-an', root: 'masak', derived: 'masakan', allomorphClass: null })
  })
})

describe('resolvableBaseSlugs', () => {
  it('returns clean slugs for unique titles', () => {
    const set = resolvableBaseSlugs(13, [A1, A2, B])
    expect(set.has('l13-a1-me-zonder-verandering-me')).toBe(true)
    expect(set.has('l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng')).toBe(true)
  })

  it('drops a base slug shared by two titles (the projector would disambiguate it)', () => {
    // Two titles that collide under stableSlug.
    const set = resolvableBaseSlugs(13, ['Werkwoorden!', 'werkwoorden'])
    expect(set.has('l13-werkwoorden')).toBe(false)
  })
})

describe('coveredClasses', () => {
  it('derives the class set from a category’s examples', () => {
    const covered = coveredClasses(L13_CATEGORIES[3], 'meN-') // category B
    expect([...covered].sort()).toEqual(['mem', 'meng', 'meny', 'men'].sort())
  })
})

describe('carrier harvest (option B)', () => {
  it('extracts sentences and drops arrow fragments + short ones', () => {
    expect(extractSentences('Ibu membelikan anaknya buku')).toEqual(['Ibu membelikan anaknya buku'])
    expect(extractSentences('tempat → menempatkan')).toEqual([]) // arrow fragment
    expect(extractSentences('turun')).toEqual([]) // single word
  })
  it('parses Latihan a./b. answers into clean carrier sentences', () => {
    const ans = 'a. menaikkan — Dia menaikkan bendera. b. dinaikkan — Bendera dinaikkan Pak guru.'
    expect(extractSentences(ans)).toEqual(['Dia menaikkan bendera', 'Bendera dinaikkan Pak guru'])
  })
  it('honours source priority (grammar beats story) then shortest-wins', () => {
    const grammar = ['Ibu membelikan anaknya sebuah buku baru']
    const story = ['Dia membelikan adik']
    expect(harvestCarrier('membelikan', [grammar, story])).toBe('Ibu membelikan anaknya sebuah buku baru')
    // shortest within the winning tier
    expect(harvestCarrier('membelikan', [[...grammar, 'Ibu membelikan buku']])).toBe('Ibu membelikan buku')
  })
  it('does NOT harvest a clitic-attached surface, and falls back to null', () => {
    expect(harvestCarrier('dinaikkan', [['Bendera dinaikkannya tinggi sekali']])).toBeNull()
  })
})
