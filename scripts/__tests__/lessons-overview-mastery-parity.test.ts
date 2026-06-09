import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// ADR 0015 parity guard, layer (a): the `mastered` predicate is mirrored in two
// places — TS `labelForCapability` (the canonical definition) and the SQL
// `mastered_count` filter inside get_lessons_overview. This test extracts the
// thresholds + NULL-handling structure from BOTH and asserts they agree, so a
// maintainer who changes one (a threshold, or a coalesce wrapper, or the recency
// clause) is forced to change the other. Layer (b) — the semantic deep-check in
// check-supabase-deep.ts — catches any behavioural divergence this can't.

const masterySrc = readFileSync(
  path.resolve('src/lib/analytics/mastery/mastered.ts'),
  'utf8',
)
const migrationSql = readFileSync(path.resolve('scripts/migration.sql'), 'utf8')

// The TS canonical predicate (isCapabilityMastered + isRecent).
const tsMastered = /reviewCount >= (\d+) && \(input\.stability \?\? 0\) >= (\d+) && isRecent/.exec(masterySrc)
const tsRecency = /ageMs <= (\d+) \* 24 \* 60 \* 60 \* 1000/.exec(masterySrc)

// The SQL `mastered_count` filter block (between `count(*) filter (` and `as mastered_count`).
function masteredSqlFilter(): string {
  const end = migrationSql.indexOf(')::int as mastered_count')
  expect(end).toBeGreaterThan(-1)
  const start = migrationSql.lastIndexOf('count(*) filter (', end)
  return migrationSql.slice(start, end)
}

describe('get_lessons_overview mastered predicate ↔ masteryModel parity (ADR 0015)', () => {
  it('extracts the canonical thresholds from masteryModel.ts', () => {
    expect(tsMastered).not.toBeNull()
    expect(tsRecency).not.toBeNull()
  })

  it('SQL mastered filter uses the SAME thresholds as the TS predicate', () => {
    const sql = masteredSqlFilter()
    const [, reviewMin, stabilityMin] = tsMastered!
    const [, recencyDays] = tsRecency!
    expect(reviewMin).toBe('4')
    expect(stabilityMin).toBe('14')
    expect(recencyDays).toBe('30') // isRecent's `30 * 24 * 60 * 60 * 1000` → 30 days
    expect(sql).toContain(`review_count >= ${reviewMin}`)
    expect(sql).toContain(`coalesce(stability, 0) >= ${stabilityMin}`)
    expect(sql).toContain(`interval '${recencyDays} days'`)
  })

  it('SQL mirrors the TS `?? 0` fallbacks as coalesce (NOT bare columns)', () => {
    const sql = masteredSqlFilter()
    // load-bearing: stability is nullable; a bare `stability >= 14` would let
    // NULL leak. The TS uses `(evidence.stability ?? 0)`.
    expect(sql).toContain('coalesce(stability, 0) >=')
    expect(sql).not.toMatch(/[^(]\bstability >= /) // no bare `stability >=`
  })

  it('SQL mirrors the TS at_risk override (lapse=0 ∧ consec-failure=0)', () => {
    const sql = masteredSqlFilter()
    // TS returns at_risk *before* mastered when lapse>0 || consec>0
    // (masteryModel.ts:175), so a mastered row must have both at 0.
    expect(sql).toContain('coalesce(lapse_count, 0) = 0')
    expect(sql).toContain('coalesce(consecutive_failure_count, 0) = 0')
  })

  it('SQL applies the recency clause (mirror of isRecent on last_reviewed_at)', () => {
    const sql = masteredSqlFilter()
    // a NULL last_reviewed_at yields a NULL predicate → row not counted,
    // matching isRecent's `if (!iso) return false`.
    expect(sql).toContain(`last_reviewed_at >= now() - interval '30 days'`)
  })
})
