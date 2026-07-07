// The placement probe's adaptive staircase (Bet-1 slice 2, ADR 0026 §4.1).
//
// A simple integer staircase over the 4-rung frequency-band ladder — NOT IRT
// (staff-engineer review: the bands are coarse, so modelling a continuous
// ability estimate would be false precision). The probe starts mid-ladder,
// steps one rung harder on a correct answer and one rung easier on a wrong
// answer, and stops once every band has either exhausted its sample quota or
// run out of unused pool items (convergence), or PLACEMENT_MAX_ITEMS items
// have been presented (the bound — spec §4.1 "~20-30 items").
//
// Pure + deterministic: no Date.now()/Math.random(). Item selection within a
// chosen band is deterministic by pool order (first unused item) — never
// randomised, so the same (bands, itemsByBand, outcomes) input always
// produces the same next item.

import type { PlacementBand } from '@/lib/placement/bands'

/** One item the probe can present. The exercise wrapper (page layer) supplies
 *  whatever prompt/answer rendering needs; this module only needs enough to
 *  place the item on the ladder and identify it in outcomes. */
export interface PlacementItem {
  normalizedText: string
  bandSlug: string
}

/** The learner's answer to one presented item. */
export interface AnswerOutcome {
  normalizedText: string
  bandSlug: string
  correct: boolean
}

// ── Configurable constants ───────────────────────────────────────────────────

/** Where the staircase starts. Spec §4.1: "start mid-band (e.g. top-300 or
 *  top-500)" — top-300 is the milder of the two, so a learner who is actually
 *  closer to the beginner end doesn't open on an unnecessarily hard item.
 *  Falls back to the ladder's middle index if the supplied bands don't
 *  contain this slug (defensive — never assumed to crash on a different
 *  band set). */
export const PLACEMENT_START_BAND_SLUG = 'top-300'

/** Samples per band before it's considered fully tested. Spec §4.1 / staff-
 *  engineer: "2-3 samples per band make thresholds false precision" — this is
 *  exactly why band clearance (see result.ts) uses ALL-correct rather than a
 *  percentage threshold. */
export const PLACEMENT_SAMPLES_PER_BAND = 3

/** Hard cap on total items presented, independent of convergence. Spec §4.1:
 *  "~20-30 items". */
export const PLACEMENT_MAX_ITEMS = 24

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function startBandIndex(bands: readonly PlacementBand[]): number {
  const index = bands.findIndex(band => band.slug === PLACEMENT_START_BAND_SLUG)
  return index === -1 ? Math.floor(bands.length / 2) : index
}

/** The band index the staircase steps to after the most recent outcome: one
 *  rung harder (index + 1) on correct, one rung easier (index - 1) on wrong,
 *  clamped to the ladder's ends. Falls back to the start band if the outcome
 *  names a band slug that isn't in `bands` (defensive). */
function steppedIndex(bands: readonly PlacementBand[], lastOutcome: AnswerOutcome): number {
  const lastIndex = bands.findIndex(band => band.slug === lastOutcome.bandSlug)
  const fromIndex = lastIndex === -1 ? startBandIndex(bands) : lastIndex
  const direction = lastOutcome.correct ? 1 : -1
  return clamp(fromIndex + direction, 0, bands.length - 1)
}

/** Walks outward from `preferredIndex` (harder first, then easier, at each
 *  growing distance) for the nearest band that still has room, so a step that
 *  lands on an already-exhausted band doesn't stall the probe. Returns null
 *  when no band has room left anywhere on the ladder — the probe has
 *  converged. */
function nearestBandIndexWithRoom(
  bandCount: number,
  preferredIndex: number,
  hasRoom: (index: number) => boolean,
): number | null {
  if (hasRoom(preferredIndex)) return preferredIndex
  for (let distance = 1; distance < bandCount; distance++) {
    const harder = preferredIndex + distance
    const easier = preferredIndex - distance
    if (harder < bandCount && hasRoom(harder)) return harder
    if (easier >= 0 && hasRoom(easier)) return easier
  }
  return null
}

/**
 * Picks the next item to present, or null when the probe is done (converged,
 * or PLACEMENT_MAX_ITEMS has been reached). `itemsByBand` is the pool of
 * candidate items available for each band slug (the caller's DB read); this
 * function never re-presents an item whose normalizedText already appears in
 * `outcomes`.
 */
export function selectNextItem(input: {
  bands: readonly PlacementBand[]
  itemsByBand: ReadonlyMap<string, readonly PlacementItem[]>
  outcomes: readonly AnswerOutcome[]
}): PlacementItem | null {
  const { bands, itemsByBand, outcomes } = input
  if (bands.length === 0) return null
  if (outcomes.length >= PLACEMENT_MAX_ITEMS) return null

  const askedTexts = new Set(outcomes.map(outcome => outcome.normalizedText))
  const unusedItems = (slug: string): PlacementItem[] =>
    (itemsByBand.get(slug) ?? []).filter(item => !askedTexts.has(item.normalizedText))
  const sampledCount = (slug: string): number =>
    outcomes.filter(outcome => outcome.bandSlug === slug).length
  const hasRoom = (index: number): boolean =>
    sampledCount(bands[index].slug) < PLACEMENT_SAMPLES_PER_BAND && unusedItems(bands[index].slug).length > 0

  const preferredIndex = outcomes.length === 0
    ? startBandIndex(bands)
    : steppedIndex(bands, outcomes[outcomes.length - 1])

  const chosenIndex = nearestBandIndexWithRoom(bands.length, preferredIndex, hasRoom)
  if (chosenIndex === null) return null

  return unusedItems(bands[chosenIndex].slug)[0] ?? null
}
