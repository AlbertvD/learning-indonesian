import { describe, it, expect } from 'vitest'
import { assembleEpisode } from '../assemble'
import type { TranscriptSegment } from '@/services/podcastService'

const segments: TranscriptSegment[] = [
  { idx: 0, id: 'Ibu pergi ke pasar.', nl: 'Moeder gaat naar de markt.', en: 'Mother goes to the market.' },
  { idx: 1, id: 'Dia membeli ikan.', nl: 'Ze koopt vis.', en: 'She buys fish.' },
]

describe('assembleEpisode', () => {
  const record = assembleEpisode({
    title: 'Di Pasar',
    description: 'Een verhaaltje op de markt.',
    level: 'A2',
    segments,
    audio_filename: 'story-a2-pasar.mp3',
    duration_seconds: 73,
  })

  it('carries the aligned segments through', () => {
    expect(record.transcript_segments).toEqual(segments)
  })

  it('denormalizes each language full-text as the joined segments (HC invariant)', () => {
    expect(record.transcript_indonesian).toBe('Ibu pergi ke pasar.\n\nDia membeli ikan.')
    expect(record.transcript_dutch).toBe('Moeder gaat naar de markt.\n\nZe koopt vis.')
    expect(record.transcript_english).toBe('Mother goes to the market.\n\nShe buys fish.')
  })

  it('preserves the episode metadata', () => {
    expect(record.title).toBe('Di Pasar')
    expect(record.level).toBe('A2')
    expect(record.audio_filename).toBe('story-a2-pasar.mp3')
    expect(record.duration_seconds).toBe(73)
  })
})
