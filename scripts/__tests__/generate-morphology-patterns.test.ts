import { describe, it, expect } from 'vitest'
import {
  generateMorphologyPatterns,
  resolvableBaseSlugs,
  coveredClasses,
  type LessonCategory,
} from '../generate-morphology-patterns'
import { morphologyRoots } from '../data/staging/lesson-13/morphology-roots'

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

// Every L13 root exists as a learning_item (the pilot verified this).
const KNOWN = new Set(morphologyRoots.map((r) => r.root))

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
    roots: morphologyRoots,
    categories: L13_CATEGORIES,
    knownItemSlugs: KNOWN,
  })

  it('produces no author-time errors and one pair per root', () => {
    expect(errors).toEqual([])
    expect(pairs).toHaveLength(morphologyRoots.length)
  })

  it('reproduces every pilot pair (derived + class + patternSourceRef)', () => {
    for (const p of pairs) {
      const exp = EXPECT[p.root]
      expect(exp, `unexpected root ${p.root}`).toBeTruthy()
      expect(p.derived).toBe(exp.derived)
      expect(p.allomorphClass).toBe(exp.cls)
      expect(p.patternSourceRef).toBe(exp.ref)
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

  it('rejects a suffix (cannot round-trip HC31)', () => {
    const { errors } = generateMorphologyPatterns({
      lessonNumber: 10,
      roots: [{ root: 'masak', affix: '-an', illustratesCategory: A1 }],
      categories: [{ title: A1, examples: [] }],
      knownItemSlugs: KNOWN,
    })
    expect(errors[0]).toMatch(/suffix derivation is deferred/)
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
