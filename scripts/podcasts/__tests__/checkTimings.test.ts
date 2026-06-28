import { describe, it, expect } from 'vitest'
import { analyzeTimings } from '../check-timings'
import type { TranscriptSegment } from '@/services/podcastService'

function seg(idx: number, words: { word: string; start: number; end: number }[]): TranscriptSegment {
  return { idx, id: words.map((w) => w.word).join(' '), nl: '', en: '', words }
}

describe('analyzeTimings', () => {
  it('passes a clean, monotonic episode', () => {
    const r = analyzeTimings([
      seg(0, [{ word: 'a', start: 0.1, end: 0.5 }, { word: 'b', start: 0.5, end: 0.9 }]),
      seg(1, [{ word: 'c', start: 1.2, end: 1.6 }]),
    ])
    expect(r.ok).toBe(true)
    expect(r.collapseRuns).toBe(0)
    expect(r.monotonic).toBe(true)
    expect(r.words).toBe(3)
  })

  it('flags a collapse run (3+ words bunched within 0.15s) and fails', () => {
    const r = analyzeTimings([
      seg(0, [
        { word: 'a', start: 5.0, end: 5.0 },
        { word: 'b', start: 5.0, end: 5.0 },
        { word: 'c', start: 5.0, end: 5.0 },
        { word: 'd', start: 7.0, end: 7.4 },
      ]),
    ])
    expect(r.collapseRuns).toBeGreaterThanOrEqual(1)
    expect(r.ok).toBe(false)
  })

  it('fails when starts are not monotonic', () => {
    const r = analyzeTimings([seg(0, [
      { word: 'a', start: 2.0, end: 2.4 },
      { word: 'b', start: 1.0, end: 1.4 },
    ])])
    expect(r.monotonic).toBe(false)
    expect(r.ok).toBe(false)
  })

  it('reports a long hold as a warning but does not fail on it alone', () => {
    const r = analyzeTimings([seg(0, [
      { word: 'a', start: 0.0, end: 0.4 },
      { word: 'b', start: 4.0, end: 4.4 }, // 4s gap — last word held through a pause
    ])])
    expect(r.longHolds).toBe(1)
    expect(r.ok).toBe(true)
  })
})
