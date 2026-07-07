import { describe, it, expect } from 'vitest'
import {
  selectNextItem,
  PLACEMENT_START_BAND_SLUG,
  PLACEMENT_SAMPLES_PER_BAND,
  PLACEMENT_MAX_ITEMS,
  type PlacementItem,
  type AnswerOutcome,
} from '../staircase'
import type { PlacementBand } from '../bands'

const BANDS: PlacementBand[] = [
  { slug: 'top-100', rankCutoff: 100 },
  { slug: 'top-300', rankCutoff: 300 },
  { slug: 'top-500', rankCutoff: 500 },
  { slug: 'top-1000', rankCutoff: 1000 },
]

function poolOf(slug: string, count: number): PlacementItem[] {
  return Array.from({ length: count }, (_, i) => ({ normalizedText: `${slug}-word-${i}`, bandSlug: slug }))
}

function standardItemsByBand(perBand = 5): Map<string, readonly PlacementItem[]> {
  return new Map(BANDS.map(band => [band.slug, poolOf(band.slug, perBand)]))
}

function outcome(bandSlug: string, index: number, correct: boolean): AnswerOutcome {
  return { normalizedText: `${bandSlug}-word-${index}`, bandSlug, correct }
}

describe('selectNextItem — staircase mechanics', () => {
  it('starts at the configured start band when no outcomes exist yet', () => {
    expect(PLACEMENT_START_BAND_SLUG).toBe('top-300')
    const next = selectNextItem({ bands: BANDS, itemsByBand: standardItemsByBand(), outcomes: [] })
    expect(next).toEqual({ normalizedText: 'top-300-word-0', bandSlug: 'top-300' })
  })

  it('steps one rung harder after a correct answer', () => {
    const next = selectNextItem({
      bands: BANDS,
      itemsByBand: standardItemsByBand(),
      outcomes: [outcome('top-300', 0, true)],
    })
    expect(next?.bandSlug).toBe('top-500')
  })

  it('steps one rung easier after a wrong answer', () => {
    const next = selectNextItem({
      bands: BANDS,
      itemsByBand: standardItemsByBand(),
      outcomes: [outcome('top-300', 0, false)],
    })
    expect(next?.bandSlug).toBe('top-100')
  })

  it('clamps at the hardest band on repeated correct answers', () => {
    const next = selectNextItem({
      bands: BANDS,
      itemsByBand: standardItemsByBand(),
      outcomes: [
        outcome('top-300', 0, true),
        outcome('top-500', 0, true),
        outcome('top-1000', 0, true),
      ],
    })
    expect(next).toEqual({ normalizedText: 'top-1000-word-1', bandSlug: 'top-1000' })
  })

  it('clamps at the easiest band on repeated wrong answers', () => {
    const next = selectNextItem({
      bands: BANDS,
      itemsByBand: standardItemsByBand(),
      outcomes: [
        outcome('top-300', 0, false),
        outcome('top-100', 0, false),
      ],
    })
    expect(next).toEqual({ normalizedText: 'top-100-word-1', bandSlug: 'top-100' })
  })

  it('picks the first unused pool item deterministically, never an already-asked one', () => {
    const next = selectNextItem({
      bands: BANDS,
      itemsByBand: standardItemsByBand(),
      outcomes: [
        outcome('top-300', 0, true),
        outcome('top-500', 0, true),
        outcome('top-500', 1, false), // steps back down to top-300
      ],
    })
    // top-300-word-0 already asked; next unused top-300 item is word-1.
    expect(next).toEqual({ normalizedText: 'top-300-word-1', bandSlug: 'top-300' })
  })

  it('walks to the next-harder band once the preferred band has hit its sample quota', () => {
    expect(PLACEMENT_SAMPLES_PER_BAND).toBe(3)
    const outcomes: AnswerOutcome[] = [
      outcome('top-500', 0, true),
      outcome('top-500', 1, true),
      outcome('top-500', 2, true), // top-500 quota reached (3 samples)
      outcome('top-300', 1, true), // last outcome: steps up toward top-500, which is full
    ]
    const next = selectNextItem({ bands: BANDS, itemsByBand: standardItemsByBand(), outcomes })
    expect(next?.bandSlug).toBe('top-1000')
  })

  it('walks to the easier neighbor when the harder one is also exhausted', () => {
    const outcomes: AnswerOutcome[] = [
      outcome('top-500', 0, true),
      outcome('top-500', 1, true),
      outcome('top-500', 2, true), // top-500 quota reached
      outcome('top-1000', 0, true),
      outcome('top-1000', 1, true),
      outcome('top-1000', 2, true), // top-1000 quota reached too
      outcome('top-300', 1, true), // last outcome: steps up toward the exhausted top-500
    ]
    const next = selectNextItem({ bands: BANDS, itemsByBand: standardItemsByBand(), outcomes })
    // top-500 and top-1000 both full; falls back to top-300 (still has room), which
    // has word-1 already asked so the next unused pool item is word-0.
    expect(next).toEqual({ normalizedText: 'top-300-word-0', bandSlug: 'top-300' })
  })

  it('skips a band whose pool is exhausted even though its sample quota has room', () => {
    const itemsByBand = standardItemsByBand()
    itemsByBand.set('top-500', []) // no items available at all for this band
    const outcomes: AnswerOutcome[] = [outcome('top-300', 0, true)] // steps up toward top-500
    const next = selectNextItem({ bands: BANDS, itemsByBand, outcomes })
    expect(next?.bandSlug).toBe('top-1000')
  })

  it('falls back to the start band when the last outcome references an unknown band slug', () => {
    const outcomes: AnswerOutcome[] = [{ normalizedText: 'x', bandSlug: 'not-a-real-band', correct: true }]
    const next = selectNextItem({ bands: BANDS, itemsByBand: standardItemsByBand(), outcomes })
    // Defensive fallback: unknown slug -> treated as if from the start band (top-300),
    // then stepped harder for the correct answer -> top-500.
    expect(next?.bandSlug).toBe('top-500')
  })

  it('returns null immediately when there are no bands', () => {
    const next = selectNextItem({ bands: [], itemsByBand: new Map(), outcomes: [] })
    expect(next).toBeNull()
  })

  it('converges to null once every band has reached its sample quota', () => {
    const outcomes: AnswerOutcome[] = BANDS.flatMap(band => [
      outcome(band.slug, 0, true),
      outcome(band.slug, 1, true),
      outcome(band.slug, 2, true),
    ])
    expect(outcomes).toHaveLength(BANDS.length * PLACEMENT_SAMPLES_PER_BAND)
    const next = selectNextItem({ bands: BANDS, itemsByBand: standardItemsByBand(), outcomes })
    expect(next).toBeNull()
  })

  it('is bounded by PLACEMENT_MAX_ITEMS even when room remains on the ladder', () => {
    // 10 bands x large pools so per-band sample counts stay under quota (max 3)
    // for all 24 outcomes — convergence would NOT explain a null result here;
    // only the explicit PLACEMENT_MAX_ITEMS cap can.
    const manyBands: PlacementBand[] = Array.from({ length: 10 }, (_, i) => ({
      slug: `band-${i}`,
      rankCutoff: (i + 1) * 100,
    }))
    const itemsByBand = new Map(manyBands.map(band => [band.slug, poolOf(band.slug, 5)]))
    const outcomes: AnswerOutcome[] = Array.from({ length: PLACEMENT_MAX_ITEMS }, (_, i) => {
      const band = manyBands[i % manyBands.length]
      const occurrence = Math.floor(i / manyBands.length)
      return outcome(band.slug, occurrence, true)
    })
    expect(outcomes).toHaveLength(PLACEMENT_MAX_ITEMS)
    // Sanity: at least one band still has room (count < quota AND unused pool left).
    const countsBySlug = new Map<string, number>()
    for (const o of outcomes) countsBySlug.set(o.bandSlug, (countsBySlug.get(o.bandSlug) ?? 0) + 1)
    expect([...countsBySlug.values()].some(count => count < PLACEMENT_SAMPLES_PER_BAND)).toBe(true)

    const next = selectNextItem({ bands: manyBands, itemsByBand, outcomes })
    expect(next).toBeNull()
  })
})
