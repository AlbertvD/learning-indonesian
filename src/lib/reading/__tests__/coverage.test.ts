import { describe, expect, it } from 'vitest'
import type { Podcast } from '@/services/podcastService'
import { computeCoverage, orderByCoverage } from '../coverage'
import { toReadableText } from '../readableText'
import { isFunctionWord } from '../functionWords'

function textOf(id: string): ReturnType<typeof toReadableText> {
  const p = {
    id, title: id, description: null, audio_path: '', transcript_indonesian: null,
    transcript_english: null, transcript_dutch: null, attribution: null, level: 'A1',
    duration_seconds: null, created_at: '',
    // "Saya"(fn) "membaca"(unknown) "buku"(known) "dan"(fn) "Budi"(name) "pergi"(unknown)
    transcript_segments: [{ idx: 0, id: 'Saya membaca buku dan Budi pergi.', nl: '', en: '' }],
  } as Podcast
  return toReadableText(p)
}

describe('computeCoverage', () => {
  it('counts function words + known tokens over non-proper-noun tokens', () => {
    const text = textOf('t')
    // content word tokens (Budi excluded as proper noun): saya, membaca, buku, dan, pergi = 5
    // function words: saya, dan (2). known set: buku (1). → (2+1)/5 = 0.6
    const cov = computeCoverage(text, new Set(['buku']), isFunctionWord)
    expect(cov).toBeCloseTo(0.6, 5)
  })

  it('is 1.0 when every non-name token is known or a function word', () => {
    const text = textOf('t')
    expect(computeCoverage(text, new Set(['membaca', 'buku', 'pergi']), isFunctionWord)).toBe(1)
  })

  it('returns 0 for an empty text', () => {
    const empty = toReadableText({ ...textOf('e'), } as never) // segments replaced below
    expect(computeCoverage({ id: 'e', title: 'e', level: null, segments: [] }, new Set(), isFunctionWord)).toBe(0)
    void empty
  })
})

describe('orderByCoverage', () => {
  it('orders most-comprehensible-first, ties by key', () => {
    const ranked = [
      { item: { t: 'b' }, coverage: 0.5 },
      { item: { t: 'a' }, coverage: 0.9 },
      { item: { t: 'c' }, coverage: 0.5 },
    ]
    const ordered = orderByCoverage(ranked, (x) => x.t)
    expect(ordered.map((r) => r.item.t)).toEqual(['a', 'b', 'c'])
  })
})
