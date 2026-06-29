import { describe, it, expect } from 'vitest'
import { getPitfallsForL1, allExampleWords } from '../pitfallCatalog'
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

  it('gives every pitfall at least one example word, all TTS-resolvable', () => {
    for (const p of distinct.values()) {
      expect(p.examples.length, `${p.id} has no examples`).toBeGreaterThan(0)
      for (const w of p.examples) {
        expect(normalizeTtsText(w).length, `${p.id} example "${w}" not TTS-resolvable`).toBeGreaterThan(0)
      }
    }
  })

  it('exposes every example + minimal-pair word, normalized, with no blanks', () => {
    const words = allExampleWords()
    expect(words.length).toBeGreaterThan(0)
    for (const w of words) expect(w.length).toBeGreaterThan(0)
  })
})
