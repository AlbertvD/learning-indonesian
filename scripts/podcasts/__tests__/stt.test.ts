import { describe, it, expect } from 'vitest'
import { parseTimepointSeconds, extractSttWords } from '../stt'

describe('parseTimepointSeconds', () => {
  it('parses Google STT "N.Ns" duration strings to seconds', () => {
    expect(parseTimepointSeconds('0.100s')).toBeCloseTo(0.1)
    expect(parseTimepointSeconds('2.860374927s')).toBeCloseTo(2.860374927)
    expect(parseTimepointSeconds('1s')).toBe(1)
    expect(parseTimepointSeconds('0s')).toBe(0)
  })
})

describe('extractSttWords', () => {
  it('flattens recognized words across result blocks into timed words', () => {
    const response = {
      results: [
        {
          alternatives: [
            {
              transcript: 'kita bisa',
              words: [
                { startTime: '0.100s', endTime: '0.800s', word: 'kita' },
                { startTime: '0.800s', endTime: '1.100s', word: 'bisa' },
              ],
            },
          ],
        },
        {
          alternatives: [
            { transcript: 'melihat', words: [{ startTime: '1.100s', endTime: '1.400s', word: 'melihat' }] },
          ],
        },
      ],
    }

    expect(extractSttWords(response)).toEqual([
      { word: 'kita', start: 0.1, end: 0.8 },
      { word: 'bisa', start: 0.8, end: 1.1 },
      { word: 'melihat', start: 1.1, end: 1.4 },
    ])
  })

  it('returns an empty array when STT recognized nothing', () => {
    expect(extractSttWords({})).toEqual([])
    expect(extractSttWords({ results: [] })).toEqual([])
  })
})
