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

// The one strict, level-independent `mastered` rule (CONTEXT.md → Mastered).
// Excludes the at_risk override — a lapse / consecutive failure makes a cap
// at_risk, never mastered — so callers that need the full label apply that
// check first.
export function isCapabilityMastered(input: {
  reviewCount: number
  stability?: number | null
  lastReviewedAt?: string | null
  lapseCount: number
  consecutiveFailureCount: number
}, now: Date = new Date()): boolean {
  if (input.consecutiveFailureCount > 0 || input.lapseCount > 0) return false
  return input.reviewCount >= 4 && (input.stability ?? 0) >= 14 && isRecent(input.lastReviewedAt, now)
}
