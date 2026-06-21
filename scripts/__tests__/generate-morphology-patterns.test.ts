import { describe, it, expect } from 'vitest'
import {
  generateMorphologyPatterns,
  resolvableBaseSlugs,
  coveredClasses,
  extractSentences,
  harvestCarrier,
  mergeCachedGlosses,
  harvestDescriptionSnippets,
  collectGlossNeeds,
  applyGlosses,
  enrichDerivedGlosses,
  serializePairs,
  type LessonCategory,
  type GeneratedPair,
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

// Expected derived + class + patternSourceRef for the CURRENT L13 staging
// (morphology-roots.ts; kept in sync with that file — extend when roots are added).
const REF_A1 = 'l13-a1-me-zonder-verandering-me'
const REF_A2 = 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng'
const REF_B = 'l13-b-me-met-verandering-van-de-eerste-klank-k-p-s-t'
const EXPECT: Record<string, { derived: string; cls: string; ref: string }> = {
  // A1 — meN- stays me- (l, m, n, r, w, y …)
  masak: { derived: 'memasak', cls: 'me', ref: REF_A1 },
  lihat: { derived: 'melihat', cls: 'me', ref: REF_A1 },
  rasa: { derived: 'merasa', cls: 'me', ref: REF_A1 },
  // A2 — meN- adapts (mem-/men-/meng-)
  baca: { derived: 'membaca', cls: 'mem', ref: REF_A2 },
  beli: { derived: 'membeli', cls: 'mem', ref: REF_A2 },
  baik: { derived: 'membaik', cls: 'mem', ref: REF_A2 },
  besar: { derived: 'membesar', cls: 'mem', ref: REF_A2 },
  beri: { derived: 'memberi', cls: 'mem', ref: REF_A2 },
  bangun: { derived: 'membangun', cls: 'mem', ref: REF_A2 },
  cari: { derived: 'mencari', cls: 'men', ref: REF_A2 },
  dengar: { derived: 'mendengar', cls: 'men', ref: REF_A2 },
  dapat: { derived: 'mendapat', cls: 'men', ref: REF_A2 },
  jual: { derived: 'menjual', cls: 'men', ref: REF_A2 },
  ganti: { derived: 'mengganti', cls: 'meng', ref: REF_A2 },
  ambil: { derived: 'mengambil', cls: 'meng', ref: REF_A2 },
  hadap: { derived: 'menghadap', cls: 'meng', ref: REF_A2 },
  ajar: { derived: 'mengajar', cls: 'meng', ref: REF_A2 },
  // B — meN- elides the initial k/p/s/t
  tulis: { derived: 'menulis', cls: 'men', ref: REF_B },
  tukar: { derived: 'menukar', cls: 'men', ref: REF_B },
  tolong: { derived: 'menolong', cls: 'men', ref: REF_B },
  turut: { derived: 'menurut', cls: 'men', ref: REF_B },
  pukul: { derived: 'memukul', cls: 'mem', ref: REF_B },
  potong: { derived: 'memotong', cls: 'mem', ref: REF_B },
  kirim: { derived: 'mengirim', cls: 'meng', ref: REF_B },
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

// ── Derived-form gloss authoring (Fix 3) ─────────────────────────────────────

function genPair(over: Partial<GeneratedPair> & { sourceRef: string; affix: string; root: string; derived: string }): GeneratedPair {
  return {
    patternSourceRef: 'l13-x', allomorphRule: '', affixType: 'prefix', affixGloss: '',
    allomorphClass: null, productive: true, circumfixLeft: null, circumfixRight: null,
    carrierText: null, derivedGlossNl: null, derivedGlossEn: null, ...over,
  }
}

describe('mergeCachedGlosses (presence-cache)', () => {
  it('carries forward glosses from a prior snapshot, matched by sourceRef', () => {
    const pairs = [genPair({ sourceRef: 'r1', affix: 'meN-', root: 'baca', derived: 'membaca' })]
    mergeCachedGlosses(pairs, [{ sourceRef: 'r1', derivedGlossNl: 'lezen', derivedGlossEn: 'to read' }])
    expect(pairs[0]).toMatchObject({ derivedGlossNl: 'lezen', derivedGlossEn: 'to read' })
  })
  it('does not overwrite a gloss already present on the fresh pair', () => {
    const pairs = [genPair({ sourceRef: 'r1', affix: 'meN-', root: 'baca', derived: 'membaca', derivedGlossNl: 'NEW', derivedGlossEn: 'NEW' })]
    mergeCachedGlosses(pairs, [{ sourceRef: 'r1', derivedGlossNl: 'old', derivedGlossEn: 'old' }])
    expect(pairs[0].derivedGlossNl).toBe('NEW')
  })
  it('ignores cache entries with no matching sourceRef', () => {
    const pairs = [genPair({ sourceRef: 'r1', affix: 'meN-', root: 'baca', derived: 'membaca' })]
    mergeCachedGlosses(pairs, [{ sourceRef: 'other', derivedGlossNl: 'x', derivedGlossEn: 'y' }])
    expect(pairs[0].derivedGlossNl).toBeNull()
  })
})

describe('harvestDescriptionSnippets', () => {
  const categories: LessonCategory[] = [{
    title: 'PE-', examples: [
      { indonesian: 'pembuka', dutch: 'opener (alat untuk membuka)', english: 'opener (tool for opening)' },
      { indonesian: 'lapor → pelapor', dutch: 'rapporteren → rapporteur', english: 'report → reporter' },
    ],
  }]
  it('matches the derived form (substring) and combines the book NL + EN phrasing', () => {
    const pairs = [genPair({ sourceRef: 'r1', affix: 'peN-', root: 'buka', derived: 'pembuka' })]
    const snips = harvestDescriptionSnippets(pairs, categories)
    expect(snips.get('r1')).toBe('pembuka — NL: opener (alat untuk membuka) — EN: opener (tool for opening)')
  })
  it('matches arrow examples too (the form on the right of the arrow)', () => {
    const pairs = [genPair({ sourceRef: 'r2', affix: 'peN-', root: 'lapor', derived: 'pelapor' })]
    expect(harvestDescriptionSnippets(pairs, categories).get('r2')).toContain('rapporteur')
  })
  it('returns no entry when nothing mentions the form', () => {
    const pairs = [genPair({ sourceRef: 'r3', affix: 'peN-', root: 'tidak', derived: 'penidak' })]
    expect(harvestDescriptionSnippets(pairs, categories).has('r3')).toBe(false)
  })
})

describe('collectGlossNeeds', () => {
  const grounding = {
    rootMeanings: new Map([['baca', { nl: 'lezen', en: 'to read' }]]),
    descriptionByRef: new Map([['r1', 'pembaca — NL: lezer']]),
  }
  it('builds a need (with grounding) only for pairs missing a gloss', () => {
    const pairs = [
      genPair({ sourceRef: 'r1', affix: 'meN-', root: 'baca', derived: 'membaca' }),
      genPair({ sourceRef: 'r2', affix: 'meN-', root: 'baca', derived: 'pembaca', derivedGlossNl: 'x', derivedGlossEn: 'y' }),
    ]
    const needs = collectGlossNeeds(pairs, grounding)
    expect(needs).toHaveLength(1)
    expect(needs[0]).toMatchObject({
      sourceRef: 'r1', derived: 'membaca', rootMeaningNl: 'lezen', rootMeaningEn: 'to read',
      descriptionSnippet: 'pembaca — NL: lezer',
    })
    // affix rule comes from the catalog (meN- has a Dutch rule).
    expect(needs[0].affixRuleNl).toBeTruthy()
  })
})

describe('applyGlosses', () => {
  it('sets both fields together; ignores half/blank results', () => {
    const pairs = [
      genPair({ sourceRef: 'r1', affix: 'meN-', root: 'baca', derived: 'membaca' }),
      genPair({ sourceRef: 'r2', affix: 'meN-', root: 'tulis', derived: 'menulis' }),
    ]
    const n = applyGlosses(pairs, new Map([
      ['r1', { nl: 'lezen', en: 'to read' }],
      ['r2', { nl: 'schrijven', en: '  ' }], // blank en → skipped
    ]))
    expect(n).toBe(1)
    expect(pairs[0]).toMatchObject({ derivedGlossNl: 'lezen', derivedGlossEn: 'to read' })
    expect(pairs[1].derivedGlossNl).toBeNull()
  })
})

describe('enrichDerivedGlosses (collect → translate → apply, injectable)', () => {
  it('glosses only un-glossed pairs and round-trips through serialize', async () => {
    const pairs = [
      genPair({ sourceRef: 'lesson-13/morphology/meN-baca-membaca', affix: 'meN-', root: 'baca', derived: 'membaca' }),
      genPair({ sourceRef: 'lesson-13/morphology/meN-tulis-menulis', affix: 'meN-', root: 'tulis', derived: 'menulis', derivedGlossNl: 'schrijven', derivedGlossEn: 'to write' }),
    ]
    const stub = async (needs: { sourceRef: string }[]) =>
      new Map(needs.map((nd) => [nd.sourceRef, { nl: 'lezen', en: 'to read' }]))
    const glossed = await enrichDerivedGlosses(pairs, { rootMeanings: new Map(), descriptionByRef: new Map() }, stub)
    expect(glossed).toBe(1) // only the un-glossed one
    const out = serializePairs(13, pairs)
    expect(out).toContain('derivedGlossNl: "lezen"')
    expect(out).toContain('derivedGlossEn: "to write"') // cached one preserved
  })
})
