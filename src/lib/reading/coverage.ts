/**
 * Per-learner lexical-coverage math + ordering for the Lezen reader (Q7).
 *
 * Coverage = the fraction of a text's running words (token-weighted, proper nouns
 * excluded) the learner knows, where "known" = a function word OR a token the
 * server-side `get_text_coverage` RPC returned as known (recognition cap, practiced).
 * Texts are ordered most-comprehensible-first; nothing is hidden (gradient, not cliff).
 *
 * Pure — the known-token set comes from the adapter (the RPC). No I/O here.
 */
import type { ReadableText } from './readableText'

/**
 * Token-weighted coverage in [0, 1]. Denominator = all non-proper-noun word tokens
 * (with repeats — frequent unknowns hurt more, matching the research's token basis).
 */
export function computeCoverage(
  text: ReadableText,
  knownTokens: ReadonlySet<string>,
  isFunctionWord: (t: string) => boolean,
): number {
  let total = 0
  let known = 0
  for (const seg of text.segments) {
    for (const tok of seg.tokens) {
      if (!tok.isWord || tok.isProperNoun) continue
      total += 1
      if (isFunctionWord(tok.normalized) || knownTokens.has(tok.normalized)) known += 1
    }
  }
  return total === 0 ? 0 : known / total
}

export interface RankedText<T> {
  item: T
  coverage: number
}

/**
 * Order most-comprehensible-first. Ties broken by the provided stable key (e.g.
 * title) so the list is deterministic.
 */
export function orderByCoverage<T>(
  ranked: RankedText<T>[],
  keyOf: (item: T) => string,
): RankedText<T>[] {
  return [...ranked].sort(
    (a, b) => b.coverage - a.coverage || keyOf(a.item).localeCompare(keyOf(b.item)),
  )
}
