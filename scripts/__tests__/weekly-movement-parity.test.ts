// ADR 0015 structural parity (layer a) for weekly movement (#210).
//
// The mastery-rung predicate lives in two places that must stay in lockstep:
// TS `labelForCapability` (src/lib/analytics/mastery/masteryModel.ts) and the SQL
// mirror `indonesian._mastery_label` (scripts/migration.sql, used by
// get_weekly_movement). This test asserts the SQL mirror carries the same
// thresholds + the same NULL-handling structure. A literal-only check is
// insufficient (it would miss a coalesce→bare-column regression), so the recency
// and stability coalesce clauses are asserted explicitly. The semantic layer (b)
// — recompute via deriveWeeklyMovement vs the RPC over live events — lives in
// check-supabase-deep.ts.
//
// Slice 3 note (2026-07-08/09, docs/plans/2026-07-08-vocab-mode-set-reduction-
// and-graduation.md §5, ADR 0027 Analytics note): `isRecent` (mastered.ts) became
// STABILITY-SCALED — `Math.max(30, 2 * stability)` days instead of a flat 30 —
// but `_mastery_label` (this file's SQL side) was deliberately left UNCHANGED
// (Minimum Mechanism, spec §5 "Open question": get_weekly_movement is a fast
// weekly pulse, not a persistent lesson-tile %, so the flat-window "pre-existing
// mature-card flicker" is lower-stakes here). So as of Slice 3 the TWO SIDES OF
// THIS PARITY GUARD INTENTIONALLY DIVERGE on the recency window shape — this
// test now pins the REVIEW/STABILITY THRESHOLDS (still identical) and the 30-day
// FLOOR (still textually present on both sides), not full recency-window parity.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const masterySrc = readFileSync(join(root, 'src/lib/analytics/mastery/masteryModel.ts'), 'utf8')
const masteredSrc = readFileSync(join(root, 'src/lib/analytics/mastery/mastered.ts'), 'utf8')
const migrationSrc = readFileSync(join(root, 'scripts/migration.sql'), 'utf8')

// Isolate the SQL _mastery_label body.
const sqlLabel = /create or replace function indonesian\._mastery_label[\s\S]*?\$\$;/.exec(migrationSrc)?.[0] ?? ''

describe('weekly movement: SQL _mastery_label ⟷ TS labelForCapability parity', () => {
  it('TS canonical predicate (mastered.ts) uses reviewCount≥4, stability≥14, and a 30-day recency FLOOR', () => {
    // Slice 2 (2026-07-08, vocab-mode-set-reduction §4.1) extracted the
    // thresholds into `hasMasteryStrength`; `isCapabilityMastered` now COMPOSES
    // it with `isRecent` rather than inlining the literal — anchor on the
    // extracted function's body, and assert the composition separately, so
    // this stays a meaningful lockstep guard rather than a stale string match.
    expect(/input\.reviewCount >= 4 && \(input\.stability \?\? 0\) >= 14/.test(masteredSrc)).toBe(true)
    expect(/hasMasteryStrength\(input\)\s*&&\s*isRecent/.test(masteredSrc)).toBe(true)
    // Slice 3: the recency window is now `Math.max(30, 2 * (stability ?? 0))`
    // days — the literal `30 * 24 * 60 * 60 * 1000` this test used to anchor on
    // no longer appears verbatim (the multiplier is now a runtime `windowDays`,
    // not the bare digit 30). Anchor on the Math.max(...) floor instead.
    expect(/Math\.max\(30, 2 \* \(stability \?\? 0\)\)/.test(masteredSrc)).toBe(true)
    expect(/windowDays \* 24 \* 60 \* 60 \* 1000/.test(masteredSrc)).toBe(true)
  })

  it('SQL mirror carries the same mastered threshold (review_count ≥ 4, stability ≥ 14, 30-day recency floor)', () => {
    expect(sqlLabel).not.toBe('')
    expect(/p_review_count >= 4/.test(sqlLabel)).toBe(true)
    expect(/coalesce\(p_stability, 0\) >= 14/.test(sqlLabel)).toBe(true)
    // _mastery_label keeps its FLAT 30-day window post-Slice-3 (see file header
    // note) — this is the SAME literal the pre-Slice-3 test asserted, still true,
    // just no longer proof of full recency-window parity with mastered.ts.
    expect(/interval '30 days'/.test(sqlLabel)).toBe(true)
    // recency is NULL-guarded, not a bare comparison
    expect(/p_last_reviewed is not null/.test(sqlLabel)).toBe(true)
  })

  it('SQL mirror carries the same strengthening threshold (review_count ≥ 3 OR stability ≥ 5)', () => {
    expect(/p_review_count >= 3 or coalesce\(p_stability, 0\) >= 5/.test(sqlLabel)).toBe(true)
  })

  it('SQL mirror gates at_risk on a genuine lapse (failing AND lapsed), matching TS', () => {
    // 2026-06-12: at_risk = consecutiveFailureCount > 0 AND lapseCount > 0; a
    // never-lapsed failing word routes to 'introduced', not 'at_risk' (still acquiring).
    expect(/when p_consec > 0 and p_lapse > 0 then 'at_risk'/.test(sqlLabel)).toBe(true)
    // no naked consec-only at_risk clause survives
    expect(/when p_consec > 0 then 'at_risk'/.test(sqlLabel)).toBe(false)
    // never-lapsed failing → introduced
    expect(/when p_consec > 0 then 'introduced'/.test(sqlLabel)).toBe(true)
    // TS side: lapseCount gates at_risk (the failing branch's ternary)
    expect(/lapseCount > 0[\s\S]{0,40}'at_risk'/.test(masterySrc)).toBe(true)
  })
})
