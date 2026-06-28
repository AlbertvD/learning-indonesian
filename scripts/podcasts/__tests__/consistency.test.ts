import { describe, it, expect } from 'vitest'
import { transcriptDrift } from '../assemble'
import type { TranscriptSegment } from '@/services/textService'

const segments: TranscriptSegment[] = [
  { idx: 0, id: 'Ibu pergi.', nl: 'Moeder gaat.', en: 'Mother goes.' },
  { idx: 1, id: 'Dia membeli ikan.', nl: 'Ze koopt vis.', en: 'She buys fish.' },
]
const id = 'Ibu pergi.\n\nDia membeli ikan.'
const nl = 'Moeder gaat.\n\nZe koopt vis.'
const en = 'Mother goes.\n\nShe buys fish.'

describe('transcriptDrift', () => {
  it('returns null when the full-text columns equal the joined segments', () => {
    expect(transcriptDrift({ transcript_segments: segments, transcript_indonesian: id, transcript_dutch: nl, transcript_english: en })).toBeNull()
  })

  it('returns null when there are no segments to check (legacy rows)', () => {
    expect(transcriptDrift({ transcript_segments: null, transcript_indonesian: 'anything', transcript_dutch: null, transcript_english: null })).toBeNull()
    expect(transcriptDrift({ transcript_segments: [], transcript_indonesian: 'anything', transcript_dutch: null, transcript_english: null })).toBeNull()
  })

  it('reports drift when a full-text column diverges from its segments', () => {
    const drift = transcriptDrift({ transcript_segments: segments, transcript_indonesian: 'Ibu pergi.', transcript_dutch: nl, transcript_english: en })
    expect(drift).toMatch(/indonesian/i)
  })
})
