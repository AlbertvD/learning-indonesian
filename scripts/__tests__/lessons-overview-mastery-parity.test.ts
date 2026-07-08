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
// The practiced threshold is canonically owned by overview.ts (PRACTICED_MIN_REVIEWS),
// NOT masteryModel.ts — that file's `reviewedCapabilityCount` is an unrelated
// per-dimension breakdown field never surfaced through this RPC. Anchoring here
// keeps the SQL `practiced_count` filter in lockstep with the value the Lessons
// page actually uses.
const overviewSrc = readFileSync(path.resolve('src/lib/lessons/overview.ts'), 'utf8')
const migrationSql = readFileSync(path.resolve('scripts/migration.sql'), 'utf8')

// The TS canonical predicate. Slice 2 (2026-07-08, vocab-mode-set-reduction §4.1)
// extracted the recency-free strength core into `hasMasteryStrength` so
// graduation's due-suppression can reuse it without inheriting the 30-day
// recency term (a mature card's FSRS interval regularly exceeds 30 days,
// which would flicker the extraction in and out of "mastered"). The
// thresholds now live in `hasMasteryStrength`'s body, not inline in
// `isCapabilityMastered` — anchor the regex there so it survives the move.
const tsMastered = /input\.reviewCount >= (\d+) && \(input\.stability \?\? 0\) >= (\d+)/.exec(masterySrc)
const tsRecency = /ageMs <= (\d+) \* 24 \* 60 \* 60 \* 1000/.exec(masterySrc)
// `isCapabilityMastered` must still COMPOSE the strength core with the
// recency window (byte-identical truth table to the pre-extraction inline
// version — see mastered.ts's header comment on the recomposition). A
// maintainer who inlines the thresholds back into `isCapabilityMastered`
// instead of calling `hasMasteryStrength` would silently reintroduce the
// second-definition drift risk this extraction removed.
const tsComposition = /hasMasteryStrength\(input\)\s*&&\s*isRecent\(input\.lastReviewedAt, now\)/.exec(masterySrc)

// The SQL `mastered_count` filter block (between `count(*) filter (` and `as mastered_count`).
function masteredSqlFilter(): string {
  const end = migrationSql.indexOf(')::int as mastered_count')
  expect(end).toBeGreaterThan(-1)
  const start = migrationSql.lastIndexOf('count(*) filter (', end)
  return migrationSql.slice(start, end)
}

// The TS canonical practiced threshold (overview.ts:PRACTICED_MIN_REVIEWS).
const tsPracticedMin = /export const PRACTICED_MIN_REVIEWS = (\d+)/.exec(overviewSrc)

// The SQL `practiced_count` filter block (between `count(*) filter (` and `as practiced_count`).
function practicedSqlFilter(): string {
  const end = migrationSql.indexOf(')::int as practiced_count')
  expect(end).toBeGreaterThan(-1)
  const start = migrationSql.lastIndexOf('count(*) filter (', end)
  return migrationSql.slice(start, end)
}

describe('get_lessons_overview mastered predicate ↔ masteryModel parity (ADR 0015)', () => {
  it('extracts the canonical thresholds from masteryModel.ts', () => {
    expect(tsMastered).not.toBeNull()
    expect(tsRecency).not.toBeNull()
  })

  it('isCapabilityMastered composes hasMasteryStrength with the recency window (Slice 2 extraction)', () => {
    expect(tsComposition).not.toBeNull()
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

  it('SQL mirrors the TS at_risk override (currently-failing only; a past lapse does NOT block mastery)', () => {
    const sql = masteredSqlFilter()
    // at_risk is self-healing: consecutiveFailureCount > 0 only (2026-06-11). A
    // mastered row needs no current failure — but a past lapse no longer excludes it.
    expect(sql).toContain('coalesce(consecutive_failure_count, 0) = 0')
    expect(sql).not.toContain('coalesce(lapse_count, 0) = 0')
  })

  it('SQL applies the recency clause (mirror of isRecent on last_reviewed_at)', () => {
    const sql = masteredSqlFilter()
    // a NULL last_reviewed_at yields a NULL predicate → row not counted,
    // matching isRecent's `if (!iso) return false`.
    expect(sql).toContain(`last_reviewed_at >= now() - interval '30 days'`)
  })

  // Three-way parity (data-architect M1, 2026-06-13): get_collections_overview
  // defines "known" as `_mastery_label(...) = 'mastered'`, so its mastered
  // definition is the helper's, NOT the inline filter above. This guards that the
  // helper's mastered branch keeps the SAME thresholds, so the two readers can't
  // silently diverge if someone edits one. Chain: inline filter ↔ _mastery_label
  // ↔ masteryModel.ts.
  it('_mastery_label mastered branch uses the SAME thresholds as the inline filter', () => {
    const end = migrationSql.indexOf("then 'mastered'")
    expect(end).toBeGreaterThan(-1)
    const branch = migrationSql.slice(migrationSql.lastIndexOf('when', end), end)
    const [, reviewMin, stabilityMin] = tsMastered!
    const [, recencyDays] = tsRecency!
    expect(branch).toContain(`p_review_count >= ${reviewMin}`)
    expect(branch).toContain(`coalesce(p_stability, 0) >= ${stabilityMin}`)
    expect(branch).toContain(`interval '${recencyDays} days'`)
  })
})

describe('get_lessons_overview practiced predicate ↔ overview.ts parity', () => {
  it('extracts the canonical PRACTICED_MIN_REVIEWS threshold from overview.ts', () => {
    expect(tsPracticedMin).not.toBeNull()
    expect(tsPracticedMin![1]).toBe('1')
  })

  it('SQL practiced filter uses the SAME threshold as PRACTICED_MIN_REVIEWS', () => {
    const sql = practicedSqlFilter()
    const [, practicedMin] = tsPracticedMin!
    // coalesce mirrors the mastered filter's NULL-handling (a NULL review_count is
    // excluded from both), so mastered (>=4) ⊆ practiced (>=1) holds incl. NULL.
    expect(sql).toContain(`coalesce(review_count, 0) >= ${practicedMin}`)
    expect(sql).not.toMatch(/[^(]\breview_count >= [0-3]\b/) // no bare practiced threshold
  })

  it('practiced uses the same introducible filter as the denominator', () => {
    const sql = practicedSqlFilter()
    expect(sql).toContain("readiness_status = 'ready'")
    expect(sql).toContain("publication_status = 'published'")
  })
})

// ADR 0015 parity guard for get_text_coverage (the Lezen reader, PRD #299). Its
// "known" predicate is a COMPOSITE of two reused rules at a NEW SQL site, so it
// owes TWO assertions: (i) its practiced threshold pins to PRACTICED_MIN_REVIEWS,
// and (ii) its recognition-cap literal is the SAME one get_collections_overview
// uses — so neither rule can drift across its two sites.
const RECOGNITION_CAP_LITERAL = "capability_type = 'recognise_meaning_from_text_cap'"

function textCoverageRpc(): string {
  const start = migrationSql.indexOf('function indonesian.get_text_coverage')
  expect(start).toBeGreaterThan(-1)
  const end = migrationSql.indexOf('$$;', start)
  expect(end).toBeGreaterThan(start)
  return migrationSql.slice(start, end)
}

function collectionsOverviewRpc(): string {
  const start = migrationSql.indexOf('function indonesian.get_collections_overview')
  expect(start).toBeGreaterThan(-1)
  const end = migrationSql.indexOf('$$;', start)
  expect(end).toBeGreaterThan(start)
  return migrationSql.slice(start, end)
}

describe('get_text_coverage predicate ↔ canonical predicates parity (ADR 0015)', () => {
  it('(i) reading practiced threshold pins to PRACTICED_MIN_REVIEWS', () => {
    const [, practicedMin] = tsPracticedMin!
    expect(textCoverageRpc()).toContain(`coalesce(s.review_count, 0) >= ${practicedMin}`)
    expect(textCoverageRpc()).not.toMatch(/[^(]\breview_count >= [0-3]\b/) // no bare threshold
  })

  it('(ii) reading recognition-cap literal is the SAME as get_collections_overview', () => {
    expect(textCoverageRpc()).toContain(RECOGNITION_CAP_LITERAL)
    expect(collectionsOverviewRpc()).toContain(RECOGNITION_CAP_LITERAL)
  })
})
