# ADR 0015: Read-model aggregation runs server-side; a parity-tested mirrored predicate is not a single-source violation

## Status

Accepted. Implemented by `docs/plans/2026-06-09-lesson-status-two-sources-design.md`
(the lesson tile's `% mastered`). Complements `docs/target-architecture.md:644`
(analytics is bimodal: TS orchestration + Postgres aggregation).

## Context

`lib/analytics/` is bimodal by design (target-architecture.md:644): orchestration
in TypeScript, **heavy aggregation in Postgres analytics functions**. A concrete
case forced the question into the open — the Lessons overview needs a per-lesson
`% mastered` = `count(mastered caps) / count(introducible caps)`, over ~400 caps
per lesson across ~12+ lessons, per user, on a critical-path page load.

Two ways to compute it:

- **Client-side.** Fetch every lesson capability + the learner's full
  `learner_capability_state` to the browser (~10⁴ rows) and aggregate in JS,
  reusing the single TS `mastered` predicate (`labelForCapability`). One
  definition of `mastered`, but ~10⁴ rows shipped to produce a ~35-row answer,
  and it gets linearly worse per user.
- **Server-side.** Extend the `get_lessons_overview` RPC — already called once by
  the page — with one aggregated column. 35 rows out, no extra round trip,
  per-user and index-backed. **But** the `mastered` predicate now exists in SQL
  *and* TS.

The repo's loud single-source-of-truth / Minimum-Mechanism rules
(`feedback_minimum_mechanism`, `feedback_target_state_over_minimal_diff`) make
the duplication *look* like a defect — and during design the author's first
recommendation was the client-side option *specifically to avoid duplicating the
predicate*, despite target-architecture.md:644 already pointing the other way.
That mistake is the motivation for writing this down: the principle existed in a
long architecture doc, was read, and was still defaulted against.

## Decision

**Per-learner read aggregations (counts, rollups, percentages) compute
server-side, in the RPC already on the request path, returning small results —
not by shipping raw rows to the client to crunch.**

**When this forces a business predicate into SQL that also exists in TS, that is
an accepted, guarded duplication — not a single-source violation — provided:**

1. the **canonical definition is documented** in `CONTEXT.md` (the human source
   of truth both implementations cite);
2. a **parity test** guards both implementations against drift, in two layers:
   - **(a) structural** — assert the SQL extracts the same thresholds *and the
     same NULL-handling structure* (`coalesce` wrappers, recency clause) as the
     TS predicate (a literal-only check is **insufficient** — it misses
     `coalesce`→bare-column drift);
   - **(b) semantic** — a deep-check that recomputes the value via the TS
     predicate against live data and asserts equality with the RPC output.

## Considered alternatives

- **Client-side aggregation (single TS definition).** *Rejected:* ~10⁴ rows per
  page load to produce a 35-row answer; degrades per user; contradicts
  target-architecture.md:644.
- **A SQL-only `is_mastered(...)` function that TS calls per capability.**
  *Rejected:* N round trips; worse than either pure option.
- **Materialise a `learner_lesson_mastery` rollup now, updated on review-commit.**
  *Rejected as premature:* it's live-system write-path machinery the Operating
  Context says to defer pre-launch, and it's a clean drop-in behind the same RPC
  contract later if profiling ever demands it.
- **Forbid the duplication, keep `mastered` in TS only.** *Rejected:* that *is*
  the client-side option; the single-source instinct, applied mechanically here,
  produces the worse system.

## Consequences

- Server-side RPC aggregation is the **default** reached for first for read
  models; reviewers should stop re-litigating the resulting mirrored predicate.
- Every mirrored predicate carries a **parity-test obligation** (both layers).
  The structural-only form is explicitly insufficient.
- Lived example: `mastered` is defined in
  `src/lib/analytics/mastery/masteryModel.ts:174-182` and mirrored in
  `get_lessons_overview` (`scripts/migration.sql`), guarded by
  `scripts/__tests__/lessons-overview-mastery-parity.test.ts` (a) + the
  `check-supabase-deep.ts` semantic parity check (b).
- The cheapest-mechanism rule (`CLAUDE.md` → Minimum Mechanism) still holds:
  prefer a pre-write validator / single definition **unless** server-side
  aggregation is the reason for the duplication; then guard it.
