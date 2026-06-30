import { describe, expect, it } from 'vitest'
import type { Podcast } from '@/services/textService'
import {
  contentTokens,
  isReadable,
  normalizeReadingToken,
  toReadableText,
} from '../readableText'
import { isFunctionWord } from '../functionWords'

function podcast(overrides: Partial<Podcast>): Podcast {
  return {
    id: 'p1', title: 'Test', description: null, audio_path: 'a.mp3', audio_path_en: null,
    transcript_indonesian: null, transcript_english: null, transcript_dutch: null,
    transcript_segments: null, attribution: null, level: 'A1',
    duration_seconds: null, created_at: '2026-01-01', ...overrides,
  }
}

describe('normalizeReadingToken', () => {
  it('lowercases and strips surrounding punctuation', () => {
    expect(normalizeReadingToken('Gelap.')).toBe('gelap')
    expect(normalizeReadingToken('"rumah,"')).toBe('rumah')
    expect(normalizeReadingToken('membaca')).toBe('membaca')
  })
  it('preserves internal hyphens (reduplication)', () => {
    expect(normalizeReadingToken('oleh-oleh')).toBe('oleh-oleh')
  })
})

describe('toReadableText', () => {
  const text = toReadableText(
    podcast({
      transcript_segments: [
        { idx: 0, id: 'Manu pergi ke pasar.', nl: 'Manu gaat naar de markt.', en: 'Manu goes to the market.' },
      ],
    }),
  )

  it('tags sentence-initial capitalised word as NOT a proper noun', () => {
    const manu = text.segments[0].tokens[0]
    expect(manu.normalized).toBe('manu')
    expect(manu.isProperNoun).toBe(false) // first word — sentence case, not a name
  })

  it('keeps NL/EN sentence alignment per segment', () => {
    expect(text.segments[0].nl).toBe('Manu gaat naar de markt.')
    expect(text.segments[0].en).toBe('Manu goes to the market.')
  })

  it('detects a mid-sentence capitalised word as a proper noun', () => {
    const t = toReadableText(
      podcast({ transcript_segments: [{ idx: 0, id: 'Saya bertemu Budi hari ini.', nl: '', en: '' }] }),
    )
    const budi = t.segments[0].tokens.find((tok) => tok.normalized === 'budi')!
    expect(budi.isProperNoun).toBe(true)
  })
})

describe('contentTokens', () => {
  it('excludes proper nouns and function words, dedupes', () => {
    const t = toReadableText(
      podcast({
        transcript_segments: [
          { idx: 0, id: 'Saya pergi ke pasar dan Budi pergi juga.', nl: '', en: '' },
        ],
      }),
    )
    const tokens = contentTokens(t, isFunctionWord)
    expect(tokens).toContain('pasar')
    expect(tokens).toContain('pergi')
    expect(tokens).not.toContain('saya') // function word
    expect(tokens).not.toContain('dan') // function word
    expect(tokens).not.toContain('ke') // function word
    expect(tokens).not.toContain('budi') // proper noun
    expect(tokens.filter((x) => x === 'pergi')).toHaveLength(1) // deduped
  })
})

describe('isReadable', () => {
  it('is true only when the podcast has segments', () => {
    expect(isReadable(podcast({ transcript_segments: [{ idx: 0, id: 'Halo.', nl: '', en: '' }] }))).toBe(true)
    expect(isReadable(podcast({ transcript_segments: null }))).toBe(false)
    expect(isReadable(podcast({ transcript_segments: [] }))).toBe(false)
  })
})
