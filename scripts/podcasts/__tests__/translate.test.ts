import { describe, it, expect } from 'vitest'
import { alignTranslations } from '../translate'

describe('alignTranslations', () => {
  it('zips equal-length ID/NL/EN arrays into ordered aligned segments', () => {
    const segs = alignTranslations(
      ['Ibu pergi.', 'Dia membeli ikan.'],
      ['Moeder gaat.', 'Ze koopt vis.'],
      ['Mother goes.', 'She buys fish.'],
    )
    expect(segs).toEqual([
      { idx: 0, id: 'Ibu pergi.', nl: 'Moeder gaat.', en: 'Mother goes.' },
      { idx: 1, id: 'Dia membeli ikan.', nl: 'Ze koopt vis.', en: 'She buys fish.' },
    ])
  })

  it('throws when a translation array has a different length (alignment invariant)', () => {
    expect(() =>
      alignTranslations(['a', 'b'], ['x'], ['p', 'q']),
    ).toThrow(/align/i)
  })
})
