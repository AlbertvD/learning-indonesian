import { describe, it, expect } from 'vitest'
import { buildNarrationSsml } from '../narrator'
import type { TranscriptSegment } from '@/services/podcastService'

const segments: TranscriptSegment[] = [
  { idx: 0, id: 'Ibu pergi ke pasar.', nl: 'Moeder gaat naar de markt.', en: 'Mother goes to the market.' },
  { idx: 1, id: 'Dia membeli ikan.', nl: 'Ze koopt vis.', en: 'She buys fish.' },
]

describe('buildNarrationSsml', () => {
  it('narrates the Indonesian sentences at the level-graded rate and pause', () => {
    const ssml = buildNarrationSsml(segments, 'A1')
    expect(ssml).toContain('<speak>')
    expect(ssml).toContain('<prosody rate="85%">') // A1 = 0.85
    expect(ssml).toContain('<break time="800ms"/>') // learner pause
    expect(ssml).toContain('Ibu pergi ke pasar.')
    expect(ssml).toContain('Dia membeli ikan.')
  })

  it('uses a natural pace and shorter pauses at B1', () => {
    const ssml = buildNarrationSsml(segments, 'B1')
    expect(ssml).toContain('<prosody rate="100%">')
    expect(ssml).toContain('<break time="300ms"/>')
  })

  it('escapes XML-significant characters in the sentence text', () => {
    const ssml = buildNarrationSsml([{ idx: 0, id: 'Ibu & anak <pergi>', nl: '', en: '' }], 'A2')
    expect(ssml).toContain('Ibu &amp; anak &lt;pergi&gt;')
  })
})
