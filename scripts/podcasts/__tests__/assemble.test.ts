import { describe, it, expect } from 'vitest'
import { assembleEpisode, retimeRecord } from '../assemble'
import type { TranscriptSegment } from '@/services/textService'
import type { PodcastData } from '../../data/podcasts'

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

describe('assembleEpisode (read-only text, slice 4 #304)', () => {
  const record = assembleEpisode({
    title: 'Kancil dan Buaya',
    description: 'Een fabel om te lezen.',
    level: 'A1',
    segments,
    audio_filename: null,
    duration_seconds: null,
  })

  it('carries null audio metadata for an audio-less text', () => {
    expect(record.audio_filename).toBeNull()
    expect(record.duration_seconds).toBeNull()
  })

  it('still denormalizes the full-text columns (HC36 invariant)', () => {
    expect(record.transcript_indonesian).toBe('Ibu pergi ke pasar.\n\nDia membeli ikan.')
    expect(record.transcript_segments).toEqual(segments)
  })
})

describe('retimeRecord', () => {
  const existing: PodcastData = {
    title: 'Di Pasar',
    description: 'd',
    level: 'A2',
    duration_seconds: 73,
    audio_filename: 'story-a2-pasar.mp3',
    transcript_indonesian: 'Ibu pergi.\n\nDia makan.',
    transcript_dutch: 'Moeder gaat.\n\nZe eet.',
    transcript_english: 'Mother goes.\n\nShe eats.',
    transcript_segments: [
      { idx: 0, id: 'Ibu pergi.', nl: 'Moeder gaat.', en: 'Mother goes.' },
      { idx: 1, id: 'Dia makan.', nl: 'Ze eet.', en: 'She eats.' },
    ],
    attribution: null,
  }
  const stt = [
    { word: 'ibu', start: 0.0, end: 0.4 },
    { word: 'pergi', start: 0.4, end: 0.9 },
    { word: 'dia', start: 1.5, end: 1.8 },
    { word: 'makan', start: 1.8, end: 2.3 },
  ]

  it('enriches the segments with word timings', () => {
    const out = retimeRecord(existing, stt)
    expect(out.transcript_segments![0].words).toEqual([
      { word: 'Ibu', start: 0.0, end: 0.4 },
      { word: 'pergi.', start: 0.4, end: 0.9 },
    ])
    expect(out.transcript_segments![1].words).toEqual([
      { word: 'Dia', start: 1.5, end: 1.8 },
      { word: 'makan.', start: 1.8, end: 2.3 },
    ])
  })

  it('leaves the denormalized full-text and metadata unchanged', () => {
    const out = retimeRecord(existing, stt)
    expect(out.transcript_indonesian).toBe(existing.transcript_indonesian)
    expect(out.transcript_dutch).toBe(existing.transcript_dutch)
    expect(out.title).toBe('Di Pasar')
    expect(out.audio_filename).toBe('story-a2-pasar.mp3')
    expect(out.duration_seconds).toBe(73)
  })

  it('throws when the record has no segments to re-time', () => {
    expect(() => retimeRecord({ ...existing, transcript_segments: null }, stt)).toThrow(/segment/i)
  })
})
