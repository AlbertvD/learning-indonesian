// Placement probe frequency-band ladder (Bet-1 slice 2, ADR 0026 §4.1).
//
// Mirrors the SHAPE of the four live frequency collections (kind='frequency',
// rank_cutoff 100/300/500/1000 — see docs/current-system/modules/collections.md
// and scripts/collections/seed-collection.ts) WITHOUT importing lib/collections/
// (spec §2 seam — lib/placement/ stays acyclic with lib/collections/). The
// caller (the not-yet-built adapter) resolves the real band rows from the DB
// and passes them in; this module only knows the ladder SHAPE and the
// ascending-by-rankCutoff ordering rule every other function here assumes.

/** One rung of the placement ladder. `slug` matches the live collection's
 *  `slug` column (e.g. 'top-100'); `rankCutoff` matches its `rank_cutoff`. */
export interface PlacementBand {
  slug: string
  rankCutoff: number
}

/**
 * Orders bands ascending by rankCutoff — easiest (top-100) first, hardest
 * (top-1000) last. The staircase and result-assembly functions in this module
 * assume this order; callers sort with this before passing bands in.
 */
export function orderBandsByRankCutoff(bands: readonly PlacementBand[]): PlacementBand[] {
  return [...bands].sort((a, b) => a.rankCutoff - b.rankCutoff)
}
