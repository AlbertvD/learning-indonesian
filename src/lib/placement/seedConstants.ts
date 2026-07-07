// Frozen FSRS seed constants for placement (Bet-1 slice 2, ADR 0026 §4.3).
//
// A placement-seeded `learner_capability_state` row represents a word the
// learner already knows — pre-set to look like a card that has been answered
// `Good` three times (review_count = 3 → 'strengthening' in both mastery
// readers). The stability/difficulty below are DERIVED ONCE from the real FSRS
// engine (ts-fsrs@5.3.2 with the exact params the commit edge function uses)
// by simulating createEmptyCard → 3× Good at due-date cadence.
//
// These are the SINGLE SOURCE OF TRUTH. The `apply_placement_result` RPC bakes
// the same literals (migration.sql), and `seedConstants.test.ts`:
//   1. RE-DERIVES them from ts-fsrs and fails if they drift (the version pin —
//      any ts-fsrs bump or param change without re-derivation breaks the test);
//   2. asserts the golden no-cliff property (seed → one real Good review does
//      not drop stability — the elapsed≈0 conservative residual, ADR 0026 §4.3);
//   3. asserts the RPC literals in migration.sql match these values (SQL↔TS
//      parity, so the server-side seed can't silently diverge).
//
// Never re-implement FSRS math in PL/pgSQL — the RPC only stores these frozen
// numbers, it does not compute them.

/** Tied to the commit RPC's version gate (migration.sql; edge fn ScheduleSnapshot). */
export const PLACEMENT_FSRS_VERSION = 'ts-fsrs:language-learning-v1' as const

/** review_count the seed row carries → 'strengthening' (never 'introduced'/'mastered'). */
export const PLACEMENT_SEED_REVIEW_COUNT = 3 as const

/** Stability of a review_count=3 (3×Good) card under the live engine params. */
export const PLACEMENT_SEED_STABILITY = 63.14846207

/** Difficulty of the same card. Always paired with the stability above. */
export const PLACEMENT_SEED_DIFFICULTY = 5.33894278
