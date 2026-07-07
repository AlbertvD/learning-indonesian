// Placement probe result assembly (Bet-1 slice 2, ADR 0026 §4.1 · §4.2).
//
// "The output... the highest fully-cleared band (staff-engineer: no p(known)
// threshold; 2-3 samples per band make thresholds false precision) — plus the
// concrete list of correctly-answered item normalized_texts" (spec §4.1). A
// band is cleared only if EVERY sampled item in it was answered correctly;
// the result includes that band plus every EASIER band, regardless of
// whether those easier bands were individually all-correct — the ladder
// assumption is that clearing a harder band implies the easier ones too.
//
// Band EXPANSION (turning clearedBandSlugs into a full member-word list) is
// explicitly NOT this module's job — the apply_placement_result RPC does
// that server-side (spec §4.1-§4.2). This module only returns slugs + the
// concrete texts the probe itself tested and got right.

import type { PlacementBand } from '@/lib/placement/bands'
import type { AnswerOutcome } from '@/lib/placement/staircase'

export interface PlacementResult {
  /** The highest fully-cleared band's slug + every easier band's slug, in
   *  the bands' ascending-rankCutoff order. Empty when no band was fully
   *  cleared (including when the learner answered nothing). */
  clearedBandSlugs: string[]
  /** Every normalizedText answered correctly at least once, deduped. */
  knownTexts: string[]
}

/** True iff at least one outcome was recorded against this band slug AND
 *  every one of them was correct. An untested band is not "cleared" — it's
 *  simply unknown, not passed. */
function isBandFullyCleared(bandSlug: string, outcomes: readonly AnswerOutcome[]): boolean {
  const bandOutcomes = outcomes.filter(outcome => outcome.bandSlug === bandSlug)
  return bandOutcomes.length > 0 && bandOutcomes.every(outcome => outcome.correct)
}

/**
 * Assembles the probe's result from the ladder + every recorded outcome.
 * `bands` must be pre-ordered ascending by rankCutoff (see
 * `orderBandsByRankCutoff` in ./bands) — the highest-index fully-cleared band
 * determines the cutoff, and every band at or before it is included.
 */
export function assemblePlacementResult(
  bands: readonly PlacementBand[],
  outcomes: readonly AnswerOutcome[],
): PlacementResult {
  let highestClearedIndex = -1
  bands.forEach((band, index) => {
    if (isBandFullyCleared(band.slug, outcomes)) highestClearedIndex = index
  })

  const clearedBandSlugs = highestClearedIndex === -1
    ? []
    : bands.slice(0, highestClearedIndex + 1).map(band => band.slug)

  const knownTexts = Array.from(new Set(
    outcomes.filter(outcome => outcome.correct).map(outcome => outcome.normalizedText),
  ))

  return { clearedBandSlugs, knownTexts }
}
