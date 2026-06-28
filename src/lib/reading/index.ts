/**
 * `lib/reading/` — the Lezen (Read) reader domain (PRD #299).
 *
 * Reuses `textService` for the texts; owns the ReadableText view-model, the
 * tap-to-gloss cascade, and per-learner coverage ordering. Does NOT import
 * `session-builder` in Phase 1 (that is the Phase-2 harvest edge).
 */
import type { Podcast } from '@/services/textService'
import { fetchCoverageKnownTokens, fetchItemGlosses } from './adapter'
import { affixCandidates } from './affixStrip'
import { computeCoverage, orderByCoverage, type RankedText } from './coverage'
import { isFunctionWord } from './functionWords'
import { resolveGloss, type GlossResult } from './gloss'
import {
  contentTokens,
  isReadable,
  toReadableText,
  type ReadableText,
  type ReadingToken,
} from './readableText'

export type { ReadableText, ReadingSegment, ReadingToken } from './readableText'
export type { GlossResult, GlossSource, ItemGloss } from './gloss'
export type { RankedText } from './coverage'
export { isReadable, toReadableText } from './readableText'
export { isFunctionWord } from './functionWords'
export { affixCandidates } from './affixStrip'
export { computeCoverage, orderByCoverage } from './coverage'
export { resolveGloss } from './gloss'

/** Every normalized form to fetch glosses for: each word token + its affix roots. */
function glossLookupTokens(text: ReadableText): string[] {
  const out = new Set<string>()
  for (const seg of text.segments) {
    for (const tok of seg.tokens) {
      if (!tok.isWord || tok.isProperNoun) continue
      out.add(tok.normalized)
      for (const cand of affixCandidates(tok.normalized)) out.add(cand)
    }
  }
  return [...out]
}

export interface LoadedReader {
  text: ReadableText
  /** Resolve a tapped token's gloss using its sentence's NL translation as fallback. */
  glossFor: (segmentIdx: number, token: ReadingToken) => GlossResult
}

/** Build everything the reader page needs for one story: view-model + a gloss resolver. */
export async function loadReader(podcast: Podcast): Promise<LoadedReader> {
  const text = toReadableText(podcast)
  const glosses = await fetchItemGlosses(glossLookupTokens(text))
  const nlBySegment = new Map(text.segments.map((s) => [s.idx, s.nl]))
  return {
    text,
    glossFor: (segmentIdx, token) =>
      resolveGloss(token, {
        glosses,
        sentenceNl: nlBySegment.get(segmentIdx) ?? '',
        affixCandidates,
      }),
  }
}

/** Coverage of one already-built ReadableText for one learner (one RPC call). */
async function coverageOf(text: ReadableText, userId: string): Promise<number> {
  const tokens = contentTokens(text, isFunctionWord)
  const known = await fetchCoverageKnownTokens(userId, tokens)
  return computeCoverage(text, known, isFunctionWord)
}

/**
 * The reader's story list: readable podcasts ranked most-comprehensible-first for
 * this learner. Coverage is computed per text (8-text corpus → 8 cheap RPC calls).
 */
export async function rankReadableTexts(
  podcasts: Podcast[],
  userId: string,
): Promise<RankedText<Podcast>[]> {
  const readable = podcasts.filter(isReadable)
  const ranked = await Promise.all(
    readable.map(async (p) => ({
      item: p,
      coverage: await coverageOf(toReadableText(p), userId),
    })),
  )
  return orderByCoverage(ranked, (p) => p.title)
}

export type { ReadableText as ReaderText }
export { contentTokens }
