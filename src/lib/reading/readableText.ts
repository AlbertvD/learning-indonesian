/**
 * ReadableText view-model — normalises a story `Podcast` (its `transcript_segments`,
 * already ID/NL/EN sentence-aligned) into the shape the Lezen reader renders: tagged
 * tokens per sentence segment, with proper-noun detection and reading-normalised
 * forms that match `learning_items.normalized_text` for gloss + coverage lookups.
 *
 * Pure — no I/O. The reader (`components/reading/`) renders `ReadableText`; the
 * gloss + coverage modules consume its tokens.
 */
import type { Podcast, TranscriptSegment } from '@/services/textService'

export interface ReadingToken {
  /** Surface form as written, incl. punctuation — what the reader displays. */
  raw: string
  /** Lowercased, surrounding-punctuation-stripped; matches learning_items.normalized_text. */
  normalized: string
  /** Heuristic: capitalised AND not sentence-initial → a likely name; never glossed. */
  isProperNoun: boolean
  /** False for pure-punctuation / empty tokens (not glossable, not counted in coverage). */
  isWord: boolean
}

export interface ReadingSegment {
  idx: number
  /** Indonesian sentence. */
  id: string
  /** Dutch translation (the sentence-level fallback gloss). */
  nl: string
  /** English translation. */
  en: string
  tokens: ReadingToken[]
}

export interface ReadableText {
  id: string
  title: string
  level: string | null
  segments: ReadingSegment[]
}

const LETTER = /[a-zà-ÿ]/i

/** Strip leading/trailing non-letter chars, lowercase; preserve internal hyphens. */
export function normalizeReadingToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[^a-zà-ÿ]+/i, '')
    .replace(/[^a-zà-ÿ-]+$/i, '')
}

function tokenizeSegment(idText: string): ReadingToken[] {
  const rawTokens = idText.split(/\s+/).filter(Boolean)
  return rawTokens.map((raw, i) => {
    const normalized = normalizeReadingToken(raw)
    const isWord = normalized.length > 0 && LETTER.test(normalized)
    // proper-noun heuristic: starts uppercase AND not the first word of the sentence.
    const firstLetter = raw.replace(/^[^A-Za-zÀ-ÿ]+/, '').charAt(0)
    const isCapitalized = firstLetter !== '' && firstLetter === firstLetter.toUpperCase()
    const isProperNoun = isWord && isCapitalized && i > 0
    return { raw, normalized, isProperNoun, isWord }
  })
}

export function toReadableText(podcast: Podcast): ReadableText {
  const segments: ReadingSegment[] = (podcast.transcript_segments ?? []).map(
    (seg: TranscriptSegment) => ({
      idx: seg.idx,
      id: seg.id,
      nl: seg.nl,
      en: seg.en,
      tokens: tokenizeSegment(seg.id),
    }),
  )
  return { id: podcast.id, title: podcast.title, level: podcast.level, segments }
}

/** A podcast is readable iff it carries sentence-aligned segments. */
export function isReadable(podcast: Podcast): boolean {
  return (podcast.transcript_segments?.length ?? 0) > 0
}

/**
 * Distinct content tokens to send to `get_text_coverage` — every glossable word
 * except proper nouns and function words (those are handled client-side: names
 * excluded, function words always-known). Lowercased, deduped.
 */
export function contentTokens(
  text: ReadableText,
  isFunctionWord: (t: string) => boolean,
): string[] {
  const out = new Set<string>()
  for (const seg of text.segments) {
    for (const tok of seg.tokens) {
      if (!tok.isWord || tok.isProperNoun) continue
      if (isFunctionWord(tok.normalized)) continue
      out.add(tok.normalized)
    }
  }
  return [...out]
}
