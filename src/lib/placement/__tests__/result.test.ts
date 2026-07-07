import { describe, it, expect } from 'vitest'
import { assemblePlacementResult } from '../result'
import type { PlacementBand } from '../bands'
import type { AnswerOutcome } from '../staircase'

const BANDS: PlacementBand[] = [
  { slug: 'top-100', rankCutoff: 100 },
  { slug: 'top-300', rankCutoff: 300 },
  { slug: 'top-500', rankCutoff: 500 },
  { slug: 'top-1000', rankCutoff: 1000 },
]

function outcome(bandSlug: string, index: number, correct: boolean): AnswerOutcome {
  return { normalizedText: `${bandSlug}-word-${index}`, bandSlug, correct }
}

describe('assemblePlacementResult', () => {
  it('clears no band and knows nothing when every answer was wrong', () => {
    const outcomes: AnswerOutcome[] = [
      outcome('top-100', 0, false),
      outcome('top-100', 1, false),
      outcome('top-100', 2, false),
    ]
    expect(assemblePlacementResult(BANDS, outcomes)).toEqual({
      clearedBandSlugs: [],
      knownTexts: [],
    })
  })

  it('clears no band and knows nothing when the probe recorded zero outcomes', () => {
    expect(assemblePlacementResult(BANDS, [])).toEqual({
      clearedBandSlugs: [],
      knownTexts: [],
    })
  })

  it('clears every band up to and including the highest fully-correct one', () => {
    const outcomes: AnswerOutcome[] = [
      outcome('top-100', 0, true),
      outcome('top-100', 1, true),
      outcome('top-100', 2, true),
      outcome('top-300', 0, true),
      outcome('top-300', 1, true),
      outcome('top-300', 2, true),
      outcome('top-500', 0, true),
      outcome('top-500', 1, true),
      outcome('top-500', 2, true),
      outcome('top-1000', 0, true),
      outcome('top-1000', 1, true),
      outcome('top-1000', 2, true),
    ]
    const result = assemblePlacementResult(BANDS, outcomes)
    expect(result.clearedBandSlugs).toEqual(['top-100', 'top-300', 'top-500', 'top-1000'])
    expect(result.knownTexts).toHaveLength(12)
    expect(new Set(result.knownTexts).size).toBe(12)
  })

  it('includes an easier band in clearedBandSlugs even when that band was NOT itself fully cleared', () => {
    const outcomes: AnswerOutcome[] = [
      outcome('top-100', 0, true),
      outcome('top-100', 1, true),
      outcome('top-100', 2, true),
      // top-300: partially wrong — NOT individually cleared.
      outcome('top-300', 0, true),
      outcome('top-300', 1, false),
      // top-500: all correct — this is the highest fully-cleared band.
      outcome('top-500', 0, true),
      outcome('top-500', 1, true),
      outcome('top-500', 2, true),
      // top-1000: never tested.
    ]
    const result = assemblePlacementResult(BANDS, outcomes)
    expect(result.clearedBandSlugs).toEqual(['top-100', 'top-300', 'top-500'])
  })

  it('does NOT include a partially-wrong band, or any harder band, when nothing above it clears', () => {
    const outcomes: AnswerOutcome[] = [
      outcome('top-100', 0, true),
      outcome('top-100', 1, true),
      outcome('top-100', 2, true),
      // top-300: partially wrong, and nothing harder was ever tested/cleared.
      outcome('top-300', 0, true),
      outcome('top-300', 1, false),
    ]
    const result = assemblePlacementResult(BANDS, outcomes)
    expect(result.clearedBandSlugs).toEqual(['top-100'])
  })

  it('dedupes knownTexts and includes only correctly-answered texts', () => {
    const outcomes: AnswerOutcome[] = [
      outcome('top-100', 0, true),
      outcome('top-100', 0, true), // duplicate correct answer for the same text
      outcome('top-100', 1, false), // never answered correctly — excluded
    ]
    const result = assemblePlacementResult(BANDS, outcomes)
    expect(result.knownTexts).toEqual(['top-100-word-0'])
  })

  it('an untested band contributes nothing to clearedBandSlugs on its own', () => {
    const outcomes: AnswerOutcome[] = [
      outcome('top-1000', 0, true),
      outcome('top-1000', 1, true),
      outcome('top-1000', 2, true),
    ]
    // top-1000 alone clears — top-100/top-300/top-500 were never tested but are
    // still included as easier bands (the monotone-frontier assumption).
    const result = assemblePlacementResult(BANDS, outcomes)
    expect(result.clearedBandSlugs).toEqual(['top-100', 'top-300', 'top-500', 'top-1000'])
    expect(result.knownTexts).toEqual(['top-1000-word-0', 'top-1000-word-1', 'top-1000-word-2'])
  })
})
