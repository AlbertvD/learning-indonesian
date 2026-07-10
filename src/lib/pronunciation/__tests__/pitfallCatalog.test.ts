import { describe, it, expect } from 'vitest'
import { getPitfallsForL1, allExampleWords, allMinimalPairWords, PAIR_DRILL_VOICES } from '../pitfallCatalog'
import { normalizeTtsText } from '@/lib/ttsNormalize'

describe('getPitfallsForL1', () => {
  it('returns the Dutch-speaker pitfalls (includes Dutch-only, excludes English-only)', () => {
    const ids = getPitfallsForL1('nl').map((p) => p.id)
    // The hard-g (Dutch /x/ → Indonesian /g/) is a Dutch-speaker pitfall.
    expect(ids).toContain('hard-g')
    // The tapped-r is an English-speaker pitfall (Dutch already taps/trills) — not for NL.
    expect(ids).not.toContain('tapped-r')
  })

  it('returns the English-speaker pitfalls (includes English-only, excludes Dutch-only)', () => {
    const ids = getPitfallsForL1('en').map((p) => p.id)
    expect(ids).toContain('tapped-r')
    expect(ids).not.toContain('hard-g')
  })

  it('returns pitfalls in teaching order (rank-sorted ascending)', () => {
    for (const l1 of ['nl', 'en'] as const) {
      const ranks = getPitfallsForL1(l1).map((p) => p.rank)
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }
  })

  it('gives every L1 a non-empty pitfall set', () => {
    expect(getPitfallsForL1('nl').length).toBeGreaterThan(0)
    expect(getPitfallsForL1('en').length).toBeGreaterThan(0)
  })

  // Task U-B (review UP4) — the catalog completion pinned the exact view sizes:
  // 15 total pitfalls, 10 in the NL view, 11 in the EN view (the four new
  // entries + the two shared-view members, penultimate-stress and ny-digraph).
  it('gives the NL view 10 pitfalls and the EN view 11 pitfalls (UP4 catalog completion)', () => {
    expect(getPitfallsForL1('nl').length).toBe(10)
    expect(getPitfallsForL1('en').length).toBe(11)
  })
})

describe('catalog integrity', () => {
  const all = [...getPitfallsForL1('nl'), ...getPitfallsForL1('en')]
  const distinct = new Map(all.map((p) => [p.id, p]))

  it('has unique ids and unique ranks', () => {
    const ids = [...distinct.keys()]
    const ranks = [...distinct.values()].map((p) => p.rank)
    expect(new Set(ranks).size).toBe(ranks.length)
    expect(ids.length).toBeGreaterThan(0)
  })

  it('has ranks contiguous from 1..15 across the whole catalog (UP4)', () => {
    const ranks = [...distinct.values()].map((p) => p.rank).sort((a, b) => a - b)
    expect(distinct.size).toBe(15)
    expect(ranks).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
  })

  it('gives every pitfall at least one example word, all TTS-resolvable', () => {
    for (const p of distinct.values()) {
      expect(p.examples.length, `${p.id} has no examples`).toBeGreaterThan(0)
      for (const w of p.examples) {
        expect(normalizeTtsText(w).length, `${p.id} example "${w}" not TTS-resolvable`).toBeGreaterThan(0)
      }
    }
  })

  it('exposes every example + minimal-pair word, normalized, with no blanks, including the UP4 new words', () => {
    const words = allExampleWords()
    expect(words.length).toBeGreaterThan(0)
    for (const w of words) expect(w.length).toBeGreaterThan(0)
    // The four new UP4 pitfalls' example words + the two pre-existing minimal-pair
    // words that only ever appeared as a `b` member (kari, makam).
    for (const expected of ['susu', 'nyaman', 'pulau', 'bicara', 'kari', 'makam']) {
      expect(words, `allExampleWords() missing "${expected}"`).toContain(expected)
    }
  })

  it('gives well-formed minimal pairs where present (distinct, audible, both-language contrast)', () => {
    const withPairs = [...distinct.values()].filter((p) => (p.minimalPairs?.length ?? 0) > 0)
    // At least one pitfall must carry a minimal pair (the perception drill's input).
    expect(withPairs.length).toBeGreaterThan(0)
    for (const p of withPairs) {
      for (const mp of p.minimalPairs!) {
        expect(normalizeTtsText(mp.a)).not.toBe(normalizeTtsText(mp.b))
        expect(normalizeTtsText(mp.a).length).toBeGreaterThan(0)
        expect(normalizeTtsText(mp.b).length).toBeGreaterThan(0)
        expect(mp.contrastNl.length, `${p.id} pair missing NL contrast`).toBeGreaterThan(0)
        expect(mp.contrastEn.length, `${p.id} pair missing EN contrast`).toBeGreaterThan(0)
      }
    }
  })

  // Round 2 (review UP3, docs/plans/2026-07-09-uitspraak-round2.md §1) — the
  // pinned pair counts after this round's additions: c-ch 2, final-consonants
  // 2, hard-g 3, tapped-r 2, unaspirated-stops 3 (its first pairs), plus the
  // unchanged pre-existing pairs (u-oe/e-two-sounds/ng-digraph/ny-digraph/
  // w-sound/j-sound/pure-vowels/diphthongs-au-ai/initial-ng/penultimate-stress
  // carry none, by design — no clean lexical contrast).
  it('carries the round-2 pair counts per pitfall (UP3)', () => {
    const byId = new Map(distinct.entries())
    const countOf = (id: string) => byId.get(id)?.minimalPairs?.length ?? 0
    expect(countOf('c-ch')).toBe(2)
    expect(countOf('final-consonants')).toBe(2)
    expect(countOf('hard-g')).toBe(3)
    expect(countOf('tapped-r')).toBe(2)
    expect(countOf('unaspirated-stops')).toBe(3)
    // Untouched by round 2 — still no clean lexical contrast.
    expect(countOf('e-two-sounds')).toBe(0)
  })

  it('exports exactly 3 PAIR_DRILL_VOICES, Achird first (the app-wide default seeding voice)', () => {
    expect(PAIR_DRILL_VOICES).toEqual([
      'id-ID-Chirp3-HD-Achird',
      'id-ID-Chirp3-HD-Despina',
      'id-ID-Chirp3-HD-Orus',
    ])
  })

  it('allMinimalPairWords() returns only pair words (a narrower set than allExampleWords), including the new round-2 pairs', () => {
    const pairWords = allMinimalPairWords()
    const exampleWords = allExampleWords()
    expect(pairWords.length).toBeGreaterThan(0)
    expect(pairWords.length).toBeLessThan(exampleWords.length)
    for (const w of pairWords) {
      expect(w.length).toBeGreaterThan(0)
      expect(exampleWords).toContain(w)
    }
    for (const expected of ['curang', 'kurang', 'tuang', 'baki', 'garam', 'karam', 'tari', 'tali', 'bagi', 'parang', 'barang', 'tua', 'dua']) {
      expect(pairWords, `allMinimalPairWords() missing "${expected}"`).toContain(expected)
    }
    // A plain example word with no pair (e.g. 'gula') must NOT show up here.
    expect(pairWords).not.toContain('gula')
  })
})
