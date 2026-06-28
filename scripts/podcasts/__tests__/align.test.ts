import { describe, it, expect } from 'vitest'
import { alignWordTimings, assertValidTimings } from '../align'
import type { TranscriptSegment } from '@/services/podcastService'

// Minimal aligned segments (only `id` matters for alignment; nl/en pass through).
function seg(idx: number, id: string): TranscriptSegment {
  return { idx, id, nl: `nl${idx}`, en: `en${idx}` }
}

describe('alignWordTimings', () => {
  it('assigns each script word the timing of its 1:1-matched STT word, keeping authored spelling', () => {
    const segments = [seg(0, 'Ibu pergi.'), seg(1, 'Dia membeli ikan.')]
    const stt = [
      { word: 'ibu', start: 0.0, end: 0.4 },
      { word: 'pergi', start: 0.4, end: 0.9 },
      { word: 'dia', start: 1.5, end: 1.8 },
      { word: 'membeli', start: 1.8, end: 2.3 },
      { word: 'ikan', start: 2.3, end: 2.8 },
    ]

    const result = alignWordTimings(segments, stt)

    // Authored spelling/case/punctuation preserved; timing borrowed from STT.
    expect(result[0].words).toEqual([
      { word: 'Ibu', start: 0.0, end: 0.4 },
      { word: 'pergi.', start: 0.4, end: 0.9 },
    ])
    expect(result[1].words).toEqual([
      { word: 'Dia', start: 1.5, end: 1.8 },
      { word: 'membeli', start: 1.8, end: 2.3 },
      { word: 'ikan.', start: 2.3, end: 2.8 },
    ])
    // nl/en untouched.
    expect(result[0].nl).toBe('nl0')
  })

  it('keeps later words correctly timed when STT drops a word (interpolates the gap)', () => {
    const segments = [seg(0, 'Saya suka makan nasi.')]
    // STT dropped "suka"; the words it DID recognise keep their true timings.
    const stt = [
      { word: 'saya', start: 0.0, end: 0.4 },
      { word: 'makan', start: 0.9, end: 1.3 },
      { word: 'nasi', start: 1.3, end: 1.8 },
    ]

    const result = alignWordTimings(segments, stt)
    const words = result[0].words!

    expect(words.map((w) => w.word)).toEqual(['Saya', 'suka', 'makan', 'nasi.'])
    // Matched words keep their real STT timing — NOT shifted by the drop.
    expect(words[0]).toEqual({ word: 'Saya', start: 0.0, end: 0.4 })
    expect(words[2]).toEqual({ word: 'makan', start: 0.9, end: 1.3 })
    expect(words[3]).toEqual({ word: 'nasi.', start: 1.3, end: 1.8 })
    // The dropped word is interpolated into the gap between its neighbours.
    expect(words[1].word).toBe('suka')
    expect(words[1].start).toBeGreaterThanOrEqual(0.4)
    expect(words[1].end).toBeLessThanOrEqual(0.9)
    expect(words[1].end).toBeGreaterThanOrEqual(words[1].start)
  })

  it('guarantees positive duration when STT returns a zero-length word', () => {
    // Google STT can return endTime == startTime for a clipped final token
    // (observed live: "saja!" at 22.6→22.6). The aligner must still emit end>start.
    const result = alignWordTimings([seg(0, 'Saya pergi saja!')], [
      { word: 'saya', start: 0.0, end: 0.4 },
      { word: 'pergi', start: 0.4, end: 0.9 },
      { word: 'saja', start: 22.6, end: 22.6 },
    ])
    const last = result[0].words![2]
    expect(last.word).toBe('saja!')
    expect(last.end).toBeGreaterThan(last.start)
    expect(() => assertValidTimings(result)).not.toThrow()
  })

  it('spreads a collapsed cluster across the over-long word that absorbed it (tail-drop recovery)', () => {
    // STT recognised only 'a' and 'e', dropping b/c/d and lumping that audio into
    // a 2.5s 'e' — the real-world tail-drop. The dropped words would otherwise
    // bunch at one instant (skip) while 'e' holds for seconds (hover).
    const result = alignWordTimings([seg(0, 'a b c d e')], [
      { word: 'a', start: 0.0, end: 0.4 },
      { word: 'e', start: 0.5, end: 3.0 },
    ])
    const starts = result[0].words!.map((w) => w.start)
    // No 3 consecutive words bunched within 0.15s any more.
    for (let i = 0; i + 2 < starts.length; i++) {
      expect(starts[i + 2] - starts[i]).toBeGreaterThan(0.15)
    }
    // 'e' is pushed toward its real position, not left at 0.5 holding 2.5s.
    expect(result[0].words![4].start).toBeGreaterThan(1.0)
  })

  it('output of a real alignment passes the pre-write validator', () => {
    const result = alignWordTimings([seg(0, 'Ibu pergi makan.')], [
      { word: 'ibu', start: 0.0, end: 0.4 },
      { word: 'pergi', start: 0.4, end: 0.9 },
      { word: 'makan', start: 0.9, end: 1.4 },
    ])
    expect(() => assertValidTimings(result)).not.toThrow()
  })
})

describe('assertValidTimings', () => {
  const base = (words: { word: string; start: number; end: number }[]): TranscriptSegment[] => [
    { idx: 0, id: 'x', nl: 'x', en: 'x', words },
  ]

  it('throws when a word has end <= start', () => {
    expect(() => assertValidTimings(base([{ word: 'a', start: 1.0, end: 1.0 }]))).toThrow(/end/i)
  })

  it('throws when starts are not monotonic', () => {
    expect(() =>
      assertValidTimings(base([
        { word: 'a', start: 0.5, end: 0.8 },
        { word: 'b', start: 0.3, end: 0.6 }, // starts before 'a' — out of order
      ])),
    ).toThrow(/monoton/i)
  })

  it('throws when a segment carries an empty words array', () => {
    expect(() => assertValidTimings(base([]))).toThrow(/empty|no words/i)
  })

  it('ignores segments without timings (un-timed episodes are valid)', () => {
    expect(() => assertValidTimings([{ idx: 0, id: 'x', nl: 'x', en: 'x' }])).not.toThrow()
  })
})
