/**
 * produceAnswerFreedom.ts
 *
 * Pure classifier for the G4 grammar-produce-grader audit
 * (docs/plans/2026-07-09-g4-produce-grader-fix.md §2.1, "the unmade design
 * decision, now made"). Decides whether a `sentence_transformation_exercises`
 * / `constrained_translation_exercises` row is `single_element` (one small,
 * localized edit from the prompt — exact-match grading against the canonical
 * answer is fair) or `multi_answer_free` (the answer space has genuine
 * freedom — free word order, multiple lexical choices, or a whole-sentence
 * cross-language translation — so exact-match grading produces false
 * negatives and the row belongs in the enrichment universe).
 *
 * ALGORITHM (spec's classifier rule, operationalized so it is reviewable):
 *
 *   1. Tokenize the prompt ("source") and the canonical answer
 *      (acceptable_answers[0] — the same string the runtime grader treats as
 *      canonical, `checkAnswer(response, acceptable[0], acceptable)` in both
 *      SentenceTransformationExercise.tsx and ConstrainedTranslationExercise.tsx).
 *   2. Compute a token-level LCS-based diff between the two token arrays —
 *      the same "matched anchors + gaps between them" shape a text diff uses.
 *      Each maximal run of tokens that fails to align counts as ONE edit
 *      span, regardless of whether it is an insertion, deletion, or
 *      substitution of any length (spec's "one insertion/replacement/deletion
 *      region"). A word MOVED to a different position (a reordering) breaks
 *      the matched run in two and therefore always produces >=2 spans — the
 *      spec calls out reorderings as multi-answer/free by name, and this
 *      algorithm gets that for free from the diff shape.
 *   3. `single_element` requires BOTH:
 *        - exactly one edit span (no reordering, no multiple independent
 *          free choices scattered through the sentence), AND
 *        - the two sentences share enough context that the edit reads as a
 *          small, LOCALIZED change rather than a free rewrite: at least half
 *          of the shorter sentence's tokens must be matched anchors
 *          (matchedTokenCount / min(sourceLen, answerLen) >= 0.5).
 *      The second condition is what correctly sorts `constrained_translation`
 *      rows into multi_answer_free even when they happen to share one
 *      anchor token (a number, a proper noun, a loanword) with the
 *      cross-language prompt: a translation with real freedom will still be
 *      MOSTLY un-anchored, so the ratio fails even though the edit is
 *      nominally "one span."
 *   4. A degenerate zero-span case (canonical answer normalizes identically
 *      to the prompt) also classifies `single_element` here — the separate,
 *      already-shipped `findIneffectiveProduceReason` guard (HC35) owns that
 *      failure mode; this classifier is not a second implementation of it,
 *      but `spanCount: 0` is preserved in the footprint stats so the report
 *      is honest about it.
 *
 * Every field the classification depends on (`sourceTokenCount`,
 * `answerTokenCount`, `matchedTokenCount`, `spanCount`) is carried in
 * `EditFootprint` and printed per-row in the committed audit report — the
 * classification is meant to be spot-checked by a human against the stats,
 * not trusted blind (spec §2.1: "the classification is reviewable").
 */

/** Lowercase, strip punctuation (keep intra-word hyphens/apostrophes), split
 *  on whitespace. Mirrors `normalizeAnswer`'s punctuation-stripping intent
 *  (src/lib/answerNormalization.ts) but tokenizes into words instead of
 *  collapsing to one comparison string — this classifier needs word
 *  boundaries to diff on. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"“”„‚'`()[\]{}]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export interface EditFootprint {
  sourceTokenCount: number
  answerTokenCount: number
  matchedTokenCount: number
  spanCount: number
}

/** Standard O(n*m) LCS length table over two token arrays (exact-string
 *  equality per cell — sentences here are short, so this is cheap). */
function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

/** Backtrack the LCS table into the ordered list of matched (i, j) index
 *  pairs (0-based into `a`/`b`) — the diff's "anchors." */
function backtrackMatches(dp: number[][], a: string[], b: string[]): Array<[number, number]> {
  const matches: Array<[number, number]> = []
  let i = a.length
  let j = b.length
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      matches.unshift([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return matches
}

/**
 * Compute the token-level edit footprint between a prompt and a canonical
 * answer. Pure — no I/O.
 */
export function computeEditFootprint(sourceText: string, answerText: string): EditFootprint {
  const a = tokenize(sourceText)
  const b = tokenize(answerText)
  const dp = lcsMatrix(a, b)
  const matches = backtrackMatches(dp, a, b)

  let spanCount = 0
  let prevI = -1
  let prevJ = -1
  for (const [i, j] of matches) {
    const hasGapBefore = i > prevI + 1 || j > prevJ + 1
    if (hasGapBefore) spanCount++
    prevI = i
    prevJ = j
  }
  const hasTrailingGap = prevI < a.length - 1 || prevJ < b.length - 1
  if (hasTrailingGap) spanCount++

  return {
    sourceTokenCount: a.length,
    answerTokenCount: b.length,
    matchedTokenCount: matches.length,
    spanCount,
  }
}

export type ProduceAnswerFreedomClass = 'single_element' | 'multi_answer_free'

/** The matched-token ratio floor for `single_element` — see algorithm note
 *  §3 above. Exported so the audit report/tests can cite the exact
 *  threshold rather than a magic number. */
export const MATCHED_RATIO_FLOOR = 0.5

/**
 * Classify an edit footprint. Pure — the reviewable decision function.
 */
export function classifyEditFootprint(fp: EditFootprint): ProduceAnswerFreedomClass {
  if (fp.spanCount === 0) return 'single_element' // identical prompt/answer; HC35's territory, not this classifier's
  if (fp.spanCount !== 1) return 'multi_answer_free'
  const minLen = Math.min(fp.sourceTokenCount, fp.answerTokenCount)
  if (minLen === 0) return 'multi_answer_free'
  const matchedRatio = fp.matchedTokenCount / minLen
  return matchedRatio >= MATCHED_RATIO_FLOOR ? 'single_element' : 'multi_answer_free'
}

/** Convenience: tokenize, compute footprint, classify in one call. */
export function classifyProduceAnswerFreedom(
  sourceText: string,
  answerText: string,
): { footprint: EditFootprint; classification: ProduceAnswerFreedomClass } {
  const footprint = computeEditFootprint(sourceText, answerText)
  return { footprint, classification: classifyEditFootprint(footprint) }
}
