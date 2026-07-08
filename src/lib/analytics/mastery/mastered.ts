// The canonical, dependency-free `mastered` predicate + its recency helper.
//
// Kept in its own module (no Supabase / no browser client imports) so that
// node/bun scripts — specifically the deep-check semantic parity assertion
// (scripts/check-supabase-deep.ts, ADR 0015 layer b) — can import the SAME
// definition the app uses, without pulling the browser Supabase client.
//
// This predicate is MIRRORED into the get_lessons_overview SQL (ADR 0015) and
// guarded by scripts/__tests__/lessons-overview-mastery-parity.test.ts. Change
// it here and the parity test fails until the SQL mirror matches.

export function isRecent(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false
  const ageMs = now.getTime() - new Date(iso).getTime()
  return ageMs >= 0 && ageMs <= 30 * 24 * 60 * 60 * 1000
}

// The recency-FREE strength core, extracted from `isCapabilityMastered`
// (docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md §4.1, ADR
// 0027). A caller that needs a STABLE, non-oscillating "has this reached the
// mastery bar" signal — e.g. vocab-graduation's due-suppression
// (src/lib/session-builder/graduation.ts) — must use THIS, not
// `isCapabilityMastered`: that predicate additionally requires
// `lastReviewedAt` within `isRecent`'s 30-day window, so a mature card whose
// FSRS interval has grown past 30 days (exactly the horizon where graduation
// matters) would flicker in and out of "mastered" between its own reviews —
// un-graduating and re-graduating the scaffold every build instead of
// converging once. The strength core never reads `lastReviewedAt`, so it is
// monotonic: once true for a lapse-free card, only a NEW failure
// (`consecutiveFailureCount > 0`) can turn it false again.
export function hasMasteryStrength(input: {
  reviewCount: number
  stability?: number | null
  consecutiveFailureCount: number
}): boolean {
  return input.consecutiveFailureCount === 0 && input.reviewCount >= 4 && (input.stability ?? 0) >= 14
}

// The one strict, level-independent `mastered` rule (CONTEXT.md → Mastered).
// Excludes the at_risk override — a *current* failure (consecutiveFailureCount)
// makes a cap at_risk, never mastered — so callers that need the full label
// apply that check first. A past lapse does NOT block mastery: once relearned to
// the bar, a previously-lapsed word counts as mastered again (the at_risk signal
// is self-healing — docs/plans/2026-06-11-at-risk-currently-failing.md).
//
// Composed from the recency-free strength core + the recency window — SAME truth
// table as before the §4.1 extraction. The pre-extraction body's early
// `if (consecutiveFailureCount > 0) return false` was a short-circuit, not a
// distinct branch: `hasMasteryStrength(...) && isRecent(...)` re-checks the same
// condition inside `&&`, so every input yields byte-identical output.
export function isCapabilityMastered(input: {
  reviewCount: number
  stability?: number | null
  lastReviewedAt?: string | null
  lapseCount: number
  consecutiveFailureCount: number
}, now: Date = new Date()): boolean {
  return hasMasteryStrength(input) && isRecent(input.lastReviewedAt, now)
}
