import { describe, it, expect } from 'vitest'
import { findActiveWord } from '../followAlong'
import type { TranscriptSegment } from '@/services/textService'

const segments: TranscriptSegment[] = [
  {
    idx: 0,
    id: 'Kita bisa.',
    nl: '...',
    en: '...',
    words: [
      { word: 'Kita', start: 0.1, end: 0.8 },
      { word: 'bisa.', start: 0.8, end: 1.1 },
    ],
  },
  {
    idx: 1,
    id: 'Itu beda.',
    nl: '...',
    en: '...',
    words: [
      { word: 'Itu', start: 2.0, end: 2.4 }, // gap 1.1 → 2.0 (inter-sentence pause)
      { word: 'beda.', start: 2.4, end: 2.9 },
    ],
  },
]

describe('findActiveWord', () => {
  it('returns null before the first word starts', () => {
    expect(findActiveWord(segments, 0.0)).toBeNull()
  })

  it('finds the word currently being spoken', () => {
    expect(findActiveWord(segments, 0.5)).toEqual({ segmentIdx: 0, wordIdx: 0 })
    expect(findActiveWord(segments, 0.9)).toEqual({ segmentIdx: 0, wordIdx: 1 })
    expect(findActiveWord(segments, 2.5)).toEqual({ segmentIdx: 1, wordIdx: 1 })
  })

  it('keeps the just-spoken word active through an inter-sentence pause', () => {
    // t=1.5 is in the gap after "bisa." (ends 1.1) and before "Itu" (starts 2.0).
    expect(findActiveWord(segments, 1.5)).toEqual({ segmentIdx: 0, wordIdx: 1 })
  })

  it('returns null for episodes whose segments have no word timings', () => {
    expect(findActiveWord([{ idx: 0, id: 'x', nl: 'x', en: 'x' }], 1.0)).toBeNull()
  })
})
