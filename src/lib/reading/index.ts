/**
 * `lib/reading/` — the Lezen (Read) reader domain (PRD #299).
 *
 * Reuses `textService` for the texts; owns the ReadableText view-model, the
 * tap-to-gloss cascade, and per-learner coverage ordering. Does NOT import
 * `session-builder` in Phase 1 (that is the Phase-2 harvest edge).
 */
import type { Podcast } from '@/services/textService'
import {
  fetchCoverageKnownTokens,
  fetchItemGlosses,
  fetchItemMorphology,
  fetchMorphologyFamilies,
  insertReadingHarvest,
} from './adapter'
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
export type { GlossResult, GlossSource, ItemGloss, MorphologyGloss } from './gloss'
export type { RankedText } from './coverage'
export { isReadable, toReadableText } from './readableText'
export { isFunctionWord } from './functionWords'
export { computeCoverage, orderByCoverage } from './coverage'
export { resolveGloss } from './gloss'

/** The content word tokens of a text (proper nouns excluded). */
function wordTokens(text: ReadableText): string[] {
  const out = new Set<string>()
  for (const seg of text.segments) {
    for (const tok of seg.tokens) {
      if (!tok.isWord || tok.isProperNoun) continue
      out.add(tok.normalized)
    }
  }
  return [...out]
}

export interface LoadedReader {
  text: ReadableText
  /** Resolve a tapped token's gloss (incl. morphology), sentence NL as the fallback. */
  glossFor: (segmentIdx: number, token: ReadingToken) => GlossResult
}

/** Build everything the reader page needs for one story: view-model + a gloss resolver. */
export async function loadReader(podcast: Podcast): Promise<LoadedReader> {
  const text = toReadableText(podcast)
  const tokens = wordTokens(text)
  // Morphology pre-compute for the text's words → the roots whose meanings/families we need.
  const morphology = await fetchItemMorphology(tokens)
  const roots = [...new Set([...morphology.values()].map((m) => m.root))]
  const [glosses, families] = await Promise.all([
    fetchItemGlosses([...tokens, ...roots]), // surface meanings + root meanings
    fetchMorphologyFamilies(roots),
  ])
  const nlBySegment = new Map(text.segments.map((s) => [s.idx, s.nl]))
  return {
    text,
    glossFor: (segmentIdx, token) =>
      resolveGloss(token, {
        glosses,
        morphology,
        families,
        sentenceNl: nlBySegment.get(segmentIdx) ?? '',
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

/**
 * Harvest a tapped word into the learner's reading set (reader §4, the one new
 * public verb). Writes membership only — eligibility then rides the EXISTING
 * collections gate-OR (`resolveActivatedMemberRefs` reads `learner_reading_harvest`)
 * and FSRS state is minted by the existing review-commit path. `lib/reading` does
 * NOT import `session-builder`; the edge is one-directional (it writes membership,
 * session-builder reads it). `itemId` is the `harvestableItemId` the gloss exposes
 * for an item-backed word.
 */
export async function harvestWord(userId: string, itemId: string): Promise<void> {
  await insertReadingHarvest(userId, itemId)
}

export type { ReadableText as ReaderText }
export { contentTokens }
