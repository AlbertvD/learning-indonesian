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
  it('TS canonical predicate (mastered.ts) uses reviewCount≥4, stability≥14, 30-day recency', () => {
    expect(/reviewCount >= 4 && \(input\.stability \?\? 0\) >= 14 && isRecent/.test(masteredSrc)).toBe(true)
    expect(/30 \* 24 \* 60 \* 60 \* 1000/.test(masteredSrc)).toBe(true)
  })

  it('SQL mirror carries the same mastered threshold (review_count ≥ 4, stability ≥ 14, 30-day recency)', () => {
    expect(sqlLabel).not.toBe('')
    expect(/p_review_count >= 4/.test(sqlLabel)).toBe(true)
    expect(/coalesce\(p_stability, 0\) >= 14/.test(sqlLabel)).toBe(true)
    expect(/interval '30 days'/.test(sqlLabel)).toBe(true)
    // recency is NULL-guarded, not a bare comparison
    expect(/p_last_reviewed is not null/.test(sqlLabel)).toBe(true)
  })

  it('SQL mirror carries the same strengthening threshold (review_count ≥ 3 OR stability ≥ 5)', () => {
    expect(/p_review_count >= 3 or coalesce\(p_stability, 0\) >= 5/.test(sqlLabel)).toBe(true)
  })

  it('SQL mirror short-circuits at_risk on a CURRENT failure only (self-healing), matching TS', () => {
    // 2026-06-11: at_risk = consecutiveFailureCount > 0; the cumulative lapse clause is gone.
    expect(/p_consec > 0 then 'at_risk'/.test(sqlLabel)).toBe(true)
    expect(/p_lapse > 0 then 'at_risk'/.test(sqlLabel)).toBe(false)
    expect(/evidence\.consecutiveFailureCount > 0\) return 'at_risk'/.test(masterySrc)).toBe(true)
    expect(/lapseCount > 0\) return 'at_risk'/.test(masterySrc)).toBe(false)
  })
})
