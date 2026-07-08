import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasMasteryStrength, isRecent } from '@/lib/analytics/mastery/mastered'

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
// Slice 3 (2026-07-08/09, vocab-mode-set-reduction §5, ADR 0027 Analytics note)
// made the recency window stability-scaled: `Math.max(30, 2 * stability)` days,
// instead of a flat 30. Anchor on the `Math.max(floor, multiplier * ...)` call
// so both the floor (still 30 — the young-card / no-stability-data case) and the
// multiplier (2) are pinned to the SAME literals the SQL `greatest(...)` mirrors.
const tsRecency = /Math\.max\((\d+), (\d+) \* \(stability \?\? 0\)\)/.exec(masterySrc)
// `isCapabilityMastered` must still COMPOSE the strength core with the
// recency window (byte-identical truth table to the pre-extraction inline
// version — see mastered.ts's header comment on the recomposition), now ALSO
// passing `input.stability` through so the window scales for THIS input (Slice 3).
// A maintainer who inlines the thresholds back into `isCapabilityMastered`
// instead of calling `hasMasteryStrength` would silently reintroduce the
// second-definition drift risk this extraction removed.
const tsComposition = /hasMasteryStrength\(input\)\s*&&\s*isRecent\(input\.lastReviewedAt, now, input\.stability\)/.exec(masterySrc)

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

  it('isCapabilityMastered composes hasMasteryStrength with the recency window (Slice 2 extraction, Slice 3 stability passthrough)', () => {
    expect(tsComposition).not.toBeNull()
  })

  it('SQL mastered filter uses the SAME thresholds as the TS predicate', () => {
    const sql = masteredSqlFilter()
    const [, reviewMin, stabilityMin] = tsMastered!
    const [, recencyFloorDays, recencyMultiplier] = tsRecency!
    expect(reviewMin).toBe('4')
    expect(stabilityMin).toBe('14')
    expect(recencyFloorDays).toBe('30') // isRecent's `Math.max(30, ...)` floor
    expect(recencyMultiplier).toBe('2') // isRecent's `2 * stability` scaling factor
    expect(sql).toContain(`review_count >= ${reviewMin}`)
    expect(sql).toContain(`coalesce(stability, 0) >= ${stabilityMin}`)
    expect(sql).toContain(`interval '${recencyFloorDays} days'`)
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

  it('SQL applies the stability-scaled recency clause (mirror of isRecent on last_reviewed_at, Slice 3)', () => {
    const sql = masteredSqlFilter()
    // a NULL last_reviewed_at yields a NULL predicate → row not counted,
    // matching isRecent's `if (!iso) return false`. The window itself is now
    // `greatest(30 days, 2 * stability)` — a flat `interval '30 days'` subtraction
    // would silently undo the Slice 3 fix.
    expect(sql).toContain(`last_reviewed_at >= now() - greatest(`)
    expect(sql).toContain(`interval '30 days'`)
    expect(sql).toContain(`make_interval(days => (coalesce(stability, 0) * 2)::int)`)
    // the OLD flat-window subtraction must be gone (would bypass the fix entirely)
    expect(sql).not.toContain(`last_reviewed_at >= now() - interval '30 days'`)
  })

  // Three-way parity (data-architect M1, 2026-06-13): get_collections_overview
  // defines "known" as `_mastery_label(...) = 'mastered'`, so its mastered
  // definition is the helper's, NOT the inline filter above. This guards that the
  // helper's mastered branch keeps the SAME thresholds, so the two readers can't
  // silently diverge if someone edits one. Chain: inline filter ↔ _mastery_label
  // ↔ masteryModel.ts.
  //
  // Slice 3 note (2026-07-08/09): the recency window comparison here is
  // deliberately the FLOOR only (30 days), not the full stability-scaled
  // expression — `_mastery_label` (get_weekly_movement / get_collections_overview)
  // is OUT OF SCOPE for Slice 3 (Minimum Mechanism, spec §5 "Open question": those
  // two surfaces are a fast weekly pulse and a "known words" reading list, neither
  // regressing the way get_lessons_overview's persistent lesson-tile % would), so
  // it intentionally keeps the flat `interval '30 days'` window post-Slice-3. This
  // assertion still holds because `greatest('30 days', ...)` LITERALLY embeds the
  // same 30-day floor text — it is not proof the two windows behave identically.
  it('_mastery_label mastered branch uses the SAME thresholds as the inline filter (floor only — see note)', () => {
    const end = migrationSql.indexOf("then 'mastered'")
    expect(end).toBeGreaterThan(-1)
    const branch = migrationSql.slice(migrationSql.lastIndexOf('when', end), end)
    const [, reviewMin, stabilityMin] = tsMastered!
    const [, recencyFloorDays] = tsRecency!
    expect(branch).toContain(`p_review_count >= ${reviewMin}`)
    expect(branch).toContain(`coalesce(p_stability, 0) >= ${stabilityMin}`)
    expect(branch).toContain(`interval '${recencyFloorDays} days'`)
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

// Slice 3 (2026-07-08/09, vocab-mode-set-reduction-and-graduation.md §5, ADR
// 0027 Analytics note): the mastered-numerator SUBSUMPTION rule. A #1
// (recognise_meaning_from_text_cap) row also counts as mastered once graduation
// (Slice 2) has retired it from due scheduling, as long as its #6
// (produce_form_from_meaning_cap) sibling — same source_ref, same lesson — has
// reached mastery strength. This is a JOIN-shaped rule (not a single filter
// literal), so on top of the structural SQL assertions below, this section
// builds a small in-memory TS mirror of "counts-as-mastered" (reusing the SAME
// `hasMasteryStrength`/`isRecent` the SQL is a lockstep mirror of) and exercises
// it over a graduated #1 + strength-#6 pair — the exact scenario the live RLS
// test (scripts/verify-lessons-overview-rls.ts) re-proves against the real DB.
describe('get_lessons_overview mastered-numerator subsumption (Slice 3, ADR 0027 Analytics note)', () => {
  it('SQL mastered filter contains the subsumption OR-branch (vocabulary_src #1 ↔ #6 sibling, scoped within the CTE)', () => {
    const sql = masteredSqlFilter()
    expect(sql).toContain("source_kind = 'vocabulary_src'")
    expect(sql).toContain("capability_type = 'recognise_meaning_from_text_cap'")
    expect(sql).toContain('exists (')
    expect(sql).toContain('select 1 from lesson_capabilities sib')
    expect(sql).toContain("sib.capability_type = 'produce_form_from_meaning_cap'")
    // scoped within the lesson (correlated on BOTH lesson_id and source_ref) —
    // never a global self-join across lessons.
    expect(sql).toContain('sib.lesson_id = lesson_capabilities.lesson_id')
    expect(sql).toContain('sib.source_ref = lesson_capabilities.source_ref')
  })

  it('the #6 sibling side of the subsumption clause is RECENCY-FREE (mirrors hasMasteryStrength, not isCapabilityMastered)', () => {
    const sql = masteredSqlFilter()
    // the exists() block's own review/stability/consec checks, with no
    // `last_reviewed_at` term inside it — a recency term on the SIBLING would
    // reintroduce the flicker graduation exists to prevent.
    const existsStart = sql.indexOf('exists (')
    expect(existsStart).toBeGreaterThan(-1)
    const existsBlock = sql.slice(existsStart)
    expect(existsBlock).toContain('coalesce(sib.review_count, 0) >= 4')
    expect(existsBlock).toContain('coalesce(sib.stability, 0) >= 14')
    expect(existsBlock).toContain('coalesce(sib.consecutive_failure_count, 0) = 0')
    expect(existsBlock).not.toContain('sib.last_reviewed_at')
  })

  // TS mirror of "counts-as-mastered", built from the SAME canonical predicates
  // (hasMasteryStrength / isRecent) the SQL mastered_count filter mirrors —
  // exercised over a small in-memory model rather than another regex extraction,
  // since subsumption is a join shape (a single literal can't express it).
  interface MirrorCapRow {
    sourceRef: string
    sourceKind: string
    capabilityType: string
    readinessStatus: string
    publicationStatus: string
    reviewCount: number
    stability: number | null
    lastReviewedAt: string | null
    consecutiveFailureCount: number
  }

  function countsAsMastered(row: MirrorCapRow, lessonSiblings: MirrorCapRow[], now: Date): boolean {
    if (row.readinessStatus !== 'ready' || row.publicationStatus !== 'published') return false
    const ownMastered = hasMasteryStrength(row) && isRecent(row.lastReviewedAt, now, row.stability)
    if (ownMastered) return true
    if (row.sourceKind !== 'vocabulary_src' || row.capabilityType !== 'recognise_meaning_from_text_cap') return false
    return lessonSiblings.some(sib =>
      sib.sourceRef === row.sourceRef
      && sib.sourceKind === 'vocabulary_src'
      && sib.capabilityType === 'produce_form_from_meaning_cap'
      && hasMasteryStrength(sib),
    )
  }

  const now = new Date('2026-07-09T00:00:00Z')
  const baseCap: MirrorCapRow = {
    sourceRef: 'lesson-11/item-42',
    sourceKind: 'vocabulary_src',
    capabilityType: 'recognise_meaning_from_text_cap',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    reviewCount: 0,
    stability: null,
    lastReviewedAt: null,
    consecutiveFailureCount: 0,
  }

  it('a graduated #1 (below its own strength) counts as mastered via a strength-level #6 sibling', () => {
    // #1 itself: suppressed from due scheduling by graduation — review_count
    // never reaches 4 on its own. #6: reviewCount>=4, stability>=14, no failures
    // — meets hasMasteryStrength regardless of lastReviewedAt (recency-free).
    const cap1 = { ...baseCap, reviewCount: 1, stability: 2, lastReviewedAt: '2026-05-01T00:00:00Z' }
    const cap6 = {
      ...baseCap,
      capabilityType: 'produce_form_from_meaning_cap',
      reviewCount: 5,
      stability: 20,
      consecutiveFailureCount: 0,
      lastReviewedAt: '2026-01-01T00:00:00Z', // months old — recency-free, so irrelevant
    }
    expect(countsAsMastered(cap1, [cap6], now)).toBe(true)
    // sanity: #1 does NOT meet its own strength (the whole point of the test)
    expect(hasMasteryStrength(cap1)).toBe(false)
  })

  it('a #1 with no strength-level #6 sibling does NOT count as mastered', () => {
    const cap1 = { ...baseCap, reviewCount: 1, stability: 2, lastReviewedAt: '2026-05-01T00:00:00Z' }
    const weakCap6 = {
      ...baseCap,
      capabilityType: 'produce_form_from_meaning_cap',
      reviewCount: 2, // below the review_count >= 4 bar
      stability: 20,
      consecutiveFailureCount: 0,
      lastReviewedAt: '2026-07-08T00:00:00Z',
    }
    expect(countsAsMastered(cap1, [weakCap6], now)).toBe(false)
  })

  it('subsumption still requires the #1 row itself to satisfy ready/published (unchanged today-filter)', () => {
    const cap1 = { ...baseCap, readinessStatus: 'pending', reviewCount: 1, stability: 2 }
    const cap6 = {
      ...baseCap,
      capabilityType: 'produce_form_from_meaning_cap',
      reviewCount: 5,
      stability: 20,
      consecutiveFailureCount: 0,
    }
    expect(countsAsMastered(cap1, [cap6], now)).toBe(false)
  })

  it('a lapsed #6 (consecutiveFailureCount > 0) does NOT subsume its #1 (lapse reversal is free — spec §2)', () => {
    const cap1 = { ...baseCap, reviewCount: 1, stability: 2 }
    const lapsedCap6 = {
      ...baseCap,
      capabilityType: 'produce_form_from_meaning_cap',
      reviewCount: 5,
      stability: 20,
      consecutiveFailureCount: 1,
    }
    expect(countsAsMastered(cap1, [lapsedCap6], now)).toBe(false)
  })

  it('stability-scaled recency window (Slice 3): a mature own-strength card reviewed 60 days ago still counts when stability is high enough', () => {
    // 2 * stability(40) = 80 days ≥ 60 days ago → recent under the NEW window;
    // would have been EXCLUDED under the old flat 30-day window.
    const matureCap = {
      ...baseCap,
      reviewCount: 6,
      stability: 40,
      consecutiveFailureCount: 0,
      lastReviewedAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    }
    expect(countsAsMastered(matureCap, [], now)).toBe(true)
    // and the OLD fixed-30-day semantics would have failed this same input:
    expect(isRecent(matureCap.lastReviewedAt, now)).toBe(false) // no stability passed → 30-day default
    expect(isRecent(matureCap.lastReviewedAt, now, matureCap.stability)).toBe(true)
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
