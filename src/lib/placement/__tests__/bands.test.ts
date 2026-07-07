import { describe, it, expect } from 'vitest'
import { orderBandsByRankCutoff, type PlacementBand } from '../bands'

describe('orderBandsByRankCutoff', () => {
  it('sorts ascending by rankCutoff regardless of input order', () => {
    const bands: PlacementBand[] = [
      { slug: 'top-1000', rankCutoff: 1000 },
      { slug: 'top-100', rankCutoff: 100 },
      { slug: 'top-500', rankCutoff: 500 },
      { slug: 'top-300', rankCutoff: 300 },
    ]

    expect(orderBandsByRankCutoff(bands).map(band => band.slug)).toEqual([
      'top-100', 'top-300', 'top-500', 'top-1000',
    ])
  })

  it('leaves an already-sorted ladder unchanged', () => {
    const bands: PlacementBand[] = [
      { slug: 'top-100', rankCutoff: 100 },
      { slug: 'top-300', rankCutoff: 300 },
      { slug: 'top-500', rankCutoff: 500 },
      { slug: 'top-1000', rankCutoff: 1000 },
    ]

    expect(orderBandsByRankCutoff(bands)).toEqual(bands)
  })

  it('does not mutate the input array', () => {
    const bands: PlacementBand[] = [
      { slug: 'top-500', rankCutoff: 500 },
      { slug: 'top-100', rankCutoff: 100 },
    ]
    const original = [...bands]

    orderBandsByRankCutoff(bands)

    expect(bands).toEqual(original)
  })
})
