// scripts/lib/answerCoverage.ts
//
// The Part-2 coverage guard (docs/plans/2026-07-06-answer-variant-coverage.md
// §"Part 2 — Coverage guard"): a single shared predicate over an item's total
// accepted-answer set (primary gloss + `item_answer_variants`), consumed by
// TWO warning-level metrics in check-supabase-deep.ts (HC42):
//
//   - thin-set:      the total accepted set is a SINGLE L1 form.
//   - unfair-length: the SHORTEST accepted alternative is a phrase of >= N
//                    tokens (default 4) — `jalan="rijden/gaan/lopen"` is fair
//                    (shortest = 1 token); `apa kabar="hoe gaat het ermee"` is
//                    not (shortest = 4 tokens, and it's the only alternative).
//
// Health-check only — this is content coverage, not structural breakage, so
// callers report it as `warn(...)`, never `fail(...)`.
//
// Reuses `splitAlternatives` (the SAME "/"-and-";" split the runtime grader
// and CS19 use) so this metric can never disagree with what the grader
// actually accepts as one alternative vs several.
import { splitAlternatives } from '@/lib/capabilities'

function tokenCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export interface AnswerCoverageAssessment {
  /** Deduped (trim + lowercase compared), post-`splitAlternatives` set of every
   *  accepted L1 form: the primary gloss plus all accepted variant texts. */
  alternatives: string[]
  /** The total accepted set resolves to a single L1 form. */
  isThinSet: boolean
  /** Token count of the shortest alternative (0 when the set is empty). */
  shortestAlternativeTokenCount: number
  /** The shortest accepted alternative is a phrase of >= threshold tokens —
   *  even the "easiest" accepted answer is unfairly long to type from scratch. */
  isUnfairLength: boolean
}

/**
 * Assess one item's total accepted-answer coverage: primary gloss (e.g.
 * `translation_nl`) plus its accepted variant texts (`item_answer_variants`,
 * already filtered by language + `is_accepted` — see
 * `answerNormalization.acceptedVariantTexts`).
 */
export function assessAnswerCoverage(
  primaryAnswer: string,
  variantTexts: readonly string[],
  unfairLengthThresholdTokens = 4,
): AnswerCoverageAssessment {
  const rawTargets = [primaryAnswer, ...variantTexts].filter((t) => t.trim().length > 0)
  const alternatives = Array.from(new Set(
    rawTargets
      .flatMap(splitAlternatives)
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0),
  ))

  const shortestAlternativeTokenCount = alternatives.length > 0
    ? Math.min(...alternatives.map(tokenCount))
    : 0

  return {
    alternatives,
    isThinSet: alternatives.length <= 1,
    shortestAlternativeTokenCount,
    isUnfairLength: shortestAlternativeTokenCount >= unfairLengthThresholdTokens,
  }
}
