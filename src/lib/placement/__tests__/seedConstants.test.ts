import { describe, it, expect } from 'vitest'
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs'
import type { Card, FSRSParameters } from 'ts-fsrs'
import {
  PLACEMENT_SEED_STABILITY,
  PLACEMENT_SEED_DIFFICULTY,
  PLACEMENT_SEED_REVIEW_COUNT,
} from '../seedConstants'

// ── Engine params — MUST mirror the deployed commit edge function ──────────────
// supabase/functions/commit-capability-answer-report/index.ts:4-11. Duplicated
// here (Deno `npm:` import vs npm import cannot share a module). The mirror is
// guarded against drift by the source-parity test in
// scripts/__tests__/placement-seed-parity.test.ts (node context: greps the edge
// function for these weights + the RPC's SQL literals). Keep the three in sync.
const fsrsParams: FSRSParameters = {
  ...generatorParameters(),
  request_retention: 0.80,
  enable_short_term: false,
  learning_steps: [],
  relearning_steps: [],
  w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.62, 0.4, 1.26, 0.29, 2.52],
}
const scheduler = fsrs(fsrsParams)

/** Simulate a fresh card answered Good N times at due-date cadence. */
function afterNGood(n: number): Card {
  let card = createEmptyCard(new Date('2026-01-01T00:00:00Z'))
  let t = new Date('2026-01-01T00:00:00Z')
  for (let i = 0; i < n; i++) {
    const r = scheduler.next(card, t, Rating.Good)
    card = r.card
    t = new Date(card.due)
  }
  return card
}

describe('placement seed constants (ADR 0026 §4.3 · §7.5 version pin)', () => {
  it('re-derives to the frozen stability/difficulty — the version pin', () => {
    // If ts-fsrs or the params ever change, this recomputes and the exported
    // constants must be re-derived (and the RPC literals updated) or CI fails.
    const card = afterNGood(PLACEMENT_SEED_REVIEW_COUNT)
    expect(card.stability).toBeCloseTo(PLACEMENT_SEED_STABILITY, 6)
    expect(card.difficulty).toBeCloseTo(PLACEMENT_SEED_DIFFICULTY, 6)
    expect(card.state).toBe(2) // Review state — what the edge fn continues from
  })

  it('golden round-trip: first real Good review does not cliff stability', () => {
    // The edge fn treats a seeded row (last_reviewed_at NULL) with
    // preReviewRetrievability = 1, i.e. elapsed ≈ 0. Reconstruct that exact card
    // and apply one Good — stability must not DROP (conservative-but-safe, §4.3).
    const t = new Date('2026-06-01T00:00:00Z')
    const seeded = {
      ...createEmptyCard(t),
      stability: PLACEMENT_SEED_STABILITY,
      difficulty: PLACEMENT_SEED_DIFFICULTY,
      last_review: undefined,
      state: 2,
    } as Card
    const after = scheduler.next(seeded, t, Rating.Good)
    expect(after.card.stability).toBeGreaterThanOrEqual(PLACEMENT_SEED_STABILITY)
    expect(Number.isFinite(after.card.stability)).toBe(true)
    expect(after.card.difficulty).toBeGreaterThan(0)
  })
})
