---
status: draft
implementation: null
reviewed_by: [architect, data-architect]   # both APPROVED 2026-06-09; status held at draft per author instruction (promote to `approved` when greenlit for build)
supersedes: []
grounded_against:
  - docs/target-architecture.md (lib/analytics LOCKED incl. mastery sub-module — :179; analytics bimodal TS+Postgres — :644; lib/lessons consumed-by analytics.mastery — :573; mastery decomposition deferred — :682-719)
  - src/lib/mastery/masteryModel.ts (canonical mastered predicate — :174-182)
  - src/lib/lessons/overviewStatus.ts (order-gate + recommender being retired)
  - src/lib/lessons/overview.ts (model builder being simplified)
  - src/pages/Lessons.tsx (the consumer)
  - scripts/migration.sql (get_lessons_overview RPC — :1958)
---

# Lesson status — two sources of truth

## Operating Context (read first)

Build-stage, single learner, disposable data. This spec touches **only read-side
code + one RPC return-shape edit** — no data migration, no table DDL, no
live-system safety machinery. The deferred materialised rollup (§9) is named so
it isn't lost, **not** built.

## 1. Problem

The Lessons overview, the in-lesson activation checkbox, and the session builder
disagree about "where am I in the course," because three divergent status
systems exist:

1. **Activation** — `learner_lesson_activation` (presence row = activated;
   `migration.sql` table at PK `(user_id, lesson_id)`). The lesson-page checkbox
   writes it and the **session builder treats it as the authoritative gate**.
2. **Overview badge** — `src/lib/lessons/overviewStatus.ts` decision tree
   (`not_started/in_progress/in_practice/practiced/later/coming_later`) with a
   sequential `earlierLessonsSatisfied` **order-gate** (`overviewStatus.ts:45`).
   `Lessons.tsx:208` feeds `eligibleIntroducedItemCount = ready_capability_count`,
   so a lesson only counts "practiced" when **100% of all ready caps** are
   practiced (`overviewStatus.ts:49-54`). That 100% is **unreachable**: the
   receptive-before-productive staging gate (`pedagogy.ts:309-339`) always keeps
   *some* productive sibling locked, so e.g. L1 sits at 369/405 forever →
   permanently `in_practice` → `overviewStatus.ts:45` then forces every later
   lesson to `later`. This is the bug the user sees.
3. **Mastery model** — `src/lib/mastery/masteryModel.ts` produces a strict,
   learner-facing `mastered` definition but has **zero consumers** (verified: no
   imports outside its folder/tests). The `MasteryFunnel` on Progress.tsx is a
   separate `itemsByStage` calc (`src/components/progress/MasteryFunnel.tsx`),
   not this model. The right signal is computed but unwired.

The same 100%-unreachable bug also poisons the **recommended-lesson** hero:
`recommendLesson` (`overviewStatus.ts:104,117`) recommends the earliest
`in_practice` lesson, and a lesson leaves `in_practice` only at the unreachable
`practiced` (100%) state — so it recommends Lesson 1 forever, even after weeks of
practice.

## 2. The two statuses and their single sources

A lesson tile surfaces **exactly two** learner-facing facts, each bound to one
source. Nothing else.

| Status | Definition | Single source |
|---|---|---|
| **Activation** | started / not started — a boolean the learner controls | `EXISTS` row in `learner_lesson_activation(user_id, lesson_id)` |
| **Learner mastery** | how much of the lesson is mastered, as a **percentage** | `mastered_capability_count / introducible_capability_count` |

There is **no lesson-level label ladder** (`learning/strengthening/...`). The
lesson learner-status is **one number: `% mastered`**. "Not started" is carried
by the activation status, not by a label — so a `%`-only readout never has to
distinguish "not started" from "started but nothing mastered yet."

The per-dimension breakdown, `at_risk` surfacing, and the funnel **stay in the
analytics module's own surfaces** (Progress page). They are out of scope here.

## 3. The `introducible` set (denominator)

```
introducible(L) := learning_capabilities where
                     lesson_id = L
                 ∧ readiness_status = 'ready'
                 ∧ publication_status = 'published'
                 ∧ retired_at IS NULL
```

This is the lesson's full **schedulable** content — learner-independent, one SQL
filter. We **reject** subtracting a "non-introducible subset" from the
denominator (the memory's first instinct):

- Caps that are *staged-locked right now* (receptive-before-productive,
  `pedagogy.ts:309-339`) are introducible **eventually**; they belong in the
  denominator. A lesson sitting below 100% while the learner works through staged
  siblings is **correct**, not a bug — once we show a **percentage** instead of a
  binary gate, and once the order-gate is gone (§4).
- The only caps that would *permanently* cap a lesson below 100% are
  **orphan-suppressed** caps (the #166 pattern-cap class, `pedagogy.ts:329-339`).
  That is a **gate/content defect to fix at the source**, never a denominator
  exclusion — subtracting them would *hide* the defect. (Minimum Mechanism: don't
  build a denominator filter to paper over a gate bug.)

**Activation does not change the denominator.** A non-activated lesson's caps are
still introducible; activation changes only whether the learner has begun (and,
in the analytics model, the `introduced` vs `not_assessed` cap label —
`masteryModel.ts:177`). A non-activated lesson reads `0% mastered` naturally.

## 4. What is retired

`src/lib/lessons/overviewStatus.ts` is **deleted in full**, with it:

- the `LessonOverviewStatus` enum
  (`not_started/in_progress/in_practice/practiced/later/coming_later`);
- the **sequential order-gate** `earlierLessonsSatisfied` / `later`
  (`overviewStatus.ts:45`) — **no sequential locking**; activation is the
  learner-controlled gate;
- the 100%-of-ready `practiced` rule (`overviewStatus.ts:49-62`);
- the **recommended-lesson apparatus** — `recommendLesson`,
  `isLessonSatisfiedForRecommendation`, `earliestByStatus`,
  `overviewActionLabel`, and `recommendedLessonId`/`recommendedRow` on the model.
  **There is no recommended-lesson hero.** Rationale: the Today/Session flow is
  the only real call-to-action (target-arch data-flow: `[ Today ] ← only
  call-to-action`); a second, lesson-granular recommender on the catalog page is
  weaker, competing mechanism — and was driven by the same unreachable-100% bug.

**Kept, but relocated:** `formatGrammarTopicTag` and the `LessonGrammarTopic`
type both currently live *inside* `overviewStatus.ts` (`:75-89`, `:32`) and are
consumed by `overview.ts:165` + `adapter.ts:146` (`extractLessonGrammarTopics`).
Since `overviewStatus.ts` is deleted, **move `formatGrammarTopicTag` +
`LessonGrammarTopic` into `adapter.ts`** — the natural seam, where
`extractLessonGrammarTopics` already produces the `LessonGrammarTopic[]` it
consumes. Its unit test (`src/lib/lessons/__tests__/overviewStatus.test.ts:127-131`,
the only coverage for `formatGrammarTopicTag`) **moves with it**, not deleted
with the rest of `overviewStatus.test.ts`.

**Kept as-is:** `extractLessonGrammarTopics` (grammar-topic tag on the tile is
unaffected), and the **prepared** concept — a lesson is
*openable* iff it has a bespoke page (`bespokeLessonIdSet`, registry membership;
`Lessons.tsx:225`). "Prepared" is orthogonal to the two statuses; a non-prepared
lesson renders a disabled tile ("Not available yet"). It is **not** part of the
`introducible` set or the order-gate.

## 5. The `mastered` predicate (canonical — one definition, mirrored)

The strict cap-level predicate lives canonically in **CONTEXT.md** (§11 of this
spec) and is implemented in two places that must agree:

**TS** — `labelForCapability` (`masteryModel.ts:174-182`) returns `'mastered'`:
```
reviewCount >= 4 ∧ stability >= 14 ∧ isRecent(lastReviewedAt, 30d)
∧ lapseCount = 0 ∧ consecutiveFailureCount = 0      (at_risk override, :175)
```

**SQL** — inside `get_lessons_overview`, the mirror:
```sql
-- mirror of labelForCapability (masteryModel.ts:174-182). Notes for the parity
-- test (§12) and future readers:
--   • review_count >= 4 SUBSUMES the TS `reviewCount === 0 → introduced/not_assessed`
--     short-circuit (:176-178) — a 0-review row can never satisfy >= 4, so no
--     separate zero-review branch is needed here.
--   • coalesce(...) mirrors TS `?? 0` (:179-180); these are load-bearing, NOT
--     cosmetic — a bare column would let NULL leak. The parity test asserts the
--     coalesce wrappers exist, not just the literals.
--   • last_reviewed_at >= ... is the SQL form of isRecent (:168-172): a NULL
--     last_reviewed_at yields a NULL predicate, so the row is NOT counted —
--     matching isRecent's `if (!iso) return false`.
--   • lapse=0 ∧ consec=0 mirrors the at_risk override (:175): TS exits to
--     at_risk *before* the mastered check; as additive ANDs the SQL excludes the
--     same rows. Equivalent for every concrete row.
review_count >= 4
  and coalesce(stability, 0) >= 14
  and last_reviewed_at >= now() - interval '30 days'
  and coalesce(lapse_count, 0) = 0
  and coalesce(consecutive_failure_count, 0) = 0
```

This duplication is **deliberate and guarded** (ADR 0015, §10) — a TS↔SQL
**parity test** (§12) makes drift impossible. It is *not* a single-source-of-truth
violation.

## 6. Compute model — server-side aggregation (Option A)

`% mastered` is computed **inside Postgres**, in the `get_lessons_overview` RPC
that the Lessons page already calls once per load (`adapter.ts:267`). The browser
receives ~N finished rows (one per lesson) and does only `mastered / introducible`.

**Why not crunch client-side:** the alternative — fetch all lesson caps + the
learner's full `learner_capability_state` to the browser and aggregate in JS —
ships ~10,000 rows to compute an N-row answer, scales badly with users, and
contradicts target-arch:644 ("heavy aggregation in Postgres analytics
functions"). Server-side aggregation is **per-user**, index-backed, and adds
**zero** new round trips.

### RPC return-shape delta — `get_lessons_overview` (`migration.sql:1958`)

| Field | Change | Why |
|---|---|---|
| `ready_capability_count` | **keep** | the introducible **denominator** |
| `mastered_capability_count` | **ADD** `count(*) filter (mastered predicate)` | the **numerator** |
| `practiced_eligible_capability_count` | **DROP** | only `overviewStatus` read it; retired in §4 |
| `has_started_lesson` | **REPLACE → `is_activated`** = `EXISTS learner_lesson_activation` only | Status-1 single source; drops the legacy `lesson_progress` union. That union (`migration.sql:2019-2023`) is the **last live read of `lesson_progress` inside this RPC**; its write path is **dead-but-compiled** — **verified `grep -rn markLessonComplete src/` → only `progressService.ts:11,15` (its own def + comment), no production caller.** This supersedes two **stale** docs that call it live (`docs/audits/2026-05-25-pr7-pre-drop-audit.md:25,679,711` "Runtime writer"; `docs/plans/2026-05-18-fold-lib-lessons.md:67,433` "Active caller in pages/Lesson.tsx") — re-grep confirms neither is true today. *Out of scope (genuinely unaffected):* (i) `getUserLessonProgress` on the Progress page (`useProgressData.ts:93`) reads `lesson_progress` directly, not via this RPC; (ii) the Dashboard "Continue where you left off" widget reads via `lessonService`, not this RPC's `has_started_lesson`; (iii) the `lesson_progress` table itself is **not** dropped here (only this RPC read), so the leaderboard view (`migration.sql:277-295`) is untouched. |
| denominator CTE | **ADD `and c.retired_at is null`** | match `introducible`; the CTE (`migration.sql:1980-1986`) lacks this filter today — a real correctness fix |

The `ready_count`/`mastered_count` filters apply over the lesson-joined CTE
exactly as `ready_count` does today (`migration.sql:1988-1997`).

**Migration mechanics:** the RETURNS TABLE shape changes (drop/add/rename
columns), and `CREATE OR REPLACE` **cannot** alter a function's `RETURNS
TABLE(...)` shape — so the body must `DROP FUNCTION` first. The live source
**already** does this (`migration.sql:1957`: `drop function if exists
indonesian.get_lessons_overview(uuid);` immediately before the create) — retain
that preamble. `CASCADE` is **not** needed: the function's only dependents are
the `grant` (`:2032`) and the `adapter.ts:267` client caller — **verified** no DB
object (view/trigger) references it (`grep get_lessons_overview` → grant +
adapter + tests only).

**The `lesson_capabilities` CTE SELECT list must be rewritten** — the current
join projects only `s.activation_state, s.review_count` (`migration.sql:1982`),
which is insufficient for the `mastered` predicate's five columns. The new CTE
(keeping the `drop function if exists …; create …` preamble already at `:1957`):

```sql
with lesson_capabilities as (
  select c.lesson_id, c.id as capability_id,
         c.readiness_status, c.publication_status,
         s.review_count, s.stability, s.last_reviewed_at,   -- NEW: mastered predicate
         s.lapse_count, s.consecutive_failure_count          -- NEW: at_risk override
         -- DROPPED s.activation_state — only practiced_count (retired) used it
  from indonesian.learning_capabilities c
  left join indonesian.learner_capability_state s
    on s.capability_id = c.id and s.user_id = p_user_id
  where c.lesson_id is not null
    and c.retired_at is null                                 -- NEW: introducible
),
capability_counts as (
  select lesson_id,
         count(*) filter (
           where readiness_status = 'ready' and publication_status = 'published'
         )::int as ready_count,                              -- introducible denominator
         count(*) filter (
           where readiness_status = 'ready' and publication_status = 'published'
             and review_count >= 4
             and coalesce(stability, 0) >= 14
             and last_reviewed_at >= now() - interval '30 days'
             and coalesce(lapse_count, 0) = 0
             and coalesce(consecutive_failure_count, 0) = 0
         )::int as mastered_count                            -- NEW numerator
  from lesson_capabilities group by lesson_id
)
```

And the outer select replaces the `has_started_lesson` union with `is_activated`
(pure activation EXISTS, dropping the `lesson_progress` branch at
`migration.sql:2019-2023`).

## 7. Module changes

### 7.1 `src/lib/mastery/` → `src/lib/analytics/mastery/` (relocation)
Target-arch:179 locks `lib/analytics/` "(incl. mastery sub-module)" as the home;
target-arch:573 lists `lib/analytics/mastery/` as a consumer of `lib/lessons`.
This spec adds the first real consumer, so we land at the seam now. Move
`src/lib/mastery/masteryModel.ts` → `src/lib/analytics/mastery/masteryModel.ts`
and its test (`src/__tests__/masteryModel.test.ts` →
`src/lib/analytics/mastery/__tests__/masteryModel.test.ts`); update the barrel.
No re-export shim is needed — there are no existing consumers to break. A
**module spec** `docs/current-system/modules/analytics-mastery.md` is created
(first non-trivial file in the new top-level folder, per CLAUDE.md).

**Deferred (explicitly out of scope, tracked):** target-arch:682-719 specifies
`mastery/` as a *decomposed* sub-module
(`index.ts`/`model.ts`/`rules.ts`/`derive.ts`/`aggregate.ts`/`adapter.ts`,
folding the ~480-LOC `masteryModel.ts`). This spec **relocates the single file
unchanged** — landing at the correct seam, not a parallel surface — and defers
that intra-module decomposition to the full `analytics/` fold. The relocation is
interim, not the final shape.

### 7.2 `src/lib/lessons/`
- **Delete** `overviewStatus.ts` — first moving `formatGrammarTopicTag` +
  `LessonGrammarTopic` into `adapter.ts` and their test into
  `adapter`'s test file (per §4).
- **Simplify** `overview.ts`: drop `LessonOverviewSignal`, `LessonOverviewExposure`,
  `normalizeSignalsForLessons` (the order-walk), `buildLessonOverviewSignals`,
  `recommend*`. `buildLessonOverviewModel` reduces to a pure map: RPC rows →
  tile rows `{ lessonId, orderIndex, title, isActivated, masteredCount,
  introducibleCount, isPrepared, grammarTopicTag, href }`. No cross-lesson state.
- **Adapter** (`adapter.ts:57`): update `LessonOverviewRpcRow` to the new shape
  (`is_activated`, `mastered_capability_count`; drop `has_started_lesson`,
  `practiced_eligible_capability_count`). Also now hosts `formatGrammarTopicTag` +
  `LessonGrammarTopic` (moved from `overviewStatus.ts`, per §4).
- **`overview.ts` import re-point:** `overview.ts:2-10` currently imports
  `formatGrammarTopicTag` + `LessonGrammarTopic` from `./overviewStatus` and uses
  the former at `:165`; after the move these re-import from `./adapter`.
- **Barrel** (`index.ts`): `index.ts:30,38` currently re-export the **kept**
  `formatGrammarTopicTag` + `LessonGrammarTopic` *from `./overviewStatus`* —
  **re-point** those two to `./adapter` (not merely drop them), then drop the
  genuinely-retired `overviewStatus` re-exports (`decideLessonOverviewStatus`,
  `isLessonSatisfiedForRecommendation`, `overviewActionLabel`, `recommendLesson`,
  `LessonOverviewStatus`, `LessonOverviewSignal`).

### 7.3 `src/pages/Lessons.tsx`
- Remove the recommended-lesson hero `<section>` (`Lessons.tsx:323-340`) and all
  `recommendedRow`/`isNewLearnerStart` logic.
- Tile renders: **activation pill** + **`{pct}% mastered`** (omitted when
  `introducibleCount === 0` or not activated → show activation only) + existing
  grammar-topic tag + prepared/disabled availability.
- Replace `STATUS_TONE` enum map (`Lessons.tsx:114-121`) with activation-derived
  tone (activated → `accent`/`success`, else `neutral`).

### 7.4 i18n (`src/lib/i18n.ts`, EN + NL)
- **Add:** `masteryPercent` (template `'{pct}% mastered'` / `'{pct}% beheerst'`),
  `activationActive` (`'Active'` / `'Actief'`), `notStarted` (reuse
  `statusNotStarted`).
- **Remove:** `statusInProgress/InPractice/Practiced/Later`, `recommendedLesson*`,
  `startWithLesson1*`. **Keep:** `statusComingLater` (non-prepared badge),
  `actionOpenLesson`, `actionContinue`, `actionNotAvailableYet`.

## 8. Edge cases

- **`introducibleCount === 0`** (lesson seeded with no ready+published caps):
  show activation only, no `%` (avoid `0/0`).
- **Not activated, caps exist:** `0% mastered` is suppressed; tile shows
  "Not started" + Open action (if prepared).
- **Regression:** a lapsed cap stops counting as `mastered`
  (`masteryModel.ts:175` returns `at_risk` before the `mastered` check at :179),
  so `% mastered` **falls automatically**. No separate at-risk tile signal.
- **Non-prepared lesson:** disabled tile, "Not available yet", no `href`
  (unchanged from today's `coming_later`).

## 9. Scaling note (deferred — documented, not built)

On-demand RPC aggregation scales linearly and is index-backed (§ Supabase
Requirements), fine to ~1000 users. The one scale-time evolution, **not specced
here**: materialise

```
learner_lesson_mastery (user_id, lesson_id, mastered_count, introducible_count, updated_at)
  PK (user_id, lesson_id)
```
updated on the write path (the `commit-capability-answer-report` edge function
runs on every review), turning the RPC read into a point-select. It is a
**drop-in behind the same RPC contract** — the client keeps reading
`mastered_capability_count` — so choosing on-demand now costs zero future
optionality. Deferred per Operating Context (no write-path denormalisation
pre-launch).

## 10. ADR 0015 (deliverable — lands with implementation)

**ADR 0015 — Read-model aggregation runs server-side; a parity-tested mirrored
predicate is not a single-source violation.**

- *Status:* Accepted.
- *Context:* `lib/analytics` is bimodal (TS orchestration + Postgres aggregation,
  target-arch:644). A per-learner read aggregation (e.g. lesson `% mastered`) can
  be computed by shipping raw rows to the browser (single TS definition, but
  ~10⁴ rows/load, worse at scale) or in the RPC already on the request path
  (small result, but the business predicate now exists in SQL *and* TS). The
  repo's loud single-source / Minimum-Mechanism rules appear to forbid the
  duplication.
- *Decision:* Per-learner read aggregations compute **server-side in the RPC**,
  returning small results — not by crunching raw rows client-side. When this
  forces a business predicate into SQL that also exists in TS, the **canonical
  definition lives in CONTEXT.md** and a **parity test** guards both
  implementations. That is the accepted reconciliation, **not** drift.
- *Consequences:* names the parity-test obligation **and its shape** — a
  structural literal/coalesce assert (catches threshold + NULL-handling drift) is
  **not sufficient alone**; it must be paired with a semantic deep-check that
  recomputes the value via the TS predicate against live data and asserts
  equality (§12). Future reviewers stop re-litigating the duplication; the
  pattern is the default reached for first. Lived example: this spec — `mastered`
  mirrored in `masteryModel.ts` + the RPC, guarded by the §12 two-layer parity
  test.
- *Considered alternatives:* client-side aggregation (rejected: bandwidth/CPU at
  scale, contradicts target-arch:644); a SQL-function-only predicate that TS
  calls per-cap (rejected: N round trips); deferring all aggregation to a
  materialised table (rejected: premature live-system machinery, §9).

## 11. CONTEXT.md additions (deliverable — lands with implementation)

Add/extend these glossary entries (current-system docs change *with* the code):

- **Mastered (capability):** the one strict, level-independent definition —
  `reviewCount ≥ 4 ∧ stability ≥ 14d ∧ reviewed within 30d ∧ no lapse/consecutive
  failure`. The single source mirrored by `masteryModel.ts` and the
  `get_lessons_overview` RPC (ADR 0015). If a forgiving "good enough" signal is
  ever wanted it gets a **different word** (e.g. "proficient"), never a diluted
  `mastered`.
- **Introducible (capability of a lesson):** `ready ∧ published ∧ not-retired`,
  lesson-scoped — the lesson's full schedulable content. Permanent
  unreachability is a gate defect to fix at source, never a denominator
  exclusion.
- **Lesson learner status:** `% mastered = mastered / introducible`. A single
  percentage; **no lesson-level label**. Paired with **Activation status**
  (`learner_lesson_activation` presence) — the two surfaced facts per lesson.
- **Cap-level mastery ladder** (analytics-internal, for completeness):
  `at_risk / not_assessed / introduced / learning / strengthening / mastered`
  (`masteryModel.ts:174-182`). Rolled up per content-unit/pattern in analytics
  surfaces — **not** per lesson.
- **Update "Mastery Model" + "Lesson Experience Module" entries** to reference
  the wired consumer (lesson tile) and the retirement of `overviewStatus`.

## 12. CLAUDE.md "Preferred solutions" row (deliverable)

Add one row:

> | Read aggregation | server-side RPC aggregation (small result) > ship rows to crunch client-side; a mirrored predicate is OK if parity-tested (ADR 0015) |

## Supabase Requirements

### Schema changes
- **Tables/columns:** **none.** No new tables, no new columns, no data migration.
- **RPC:** edit `indonesian.get_lessons_overview(uuid)` in `scripts/migration.sql`
  (the canonical source) per §6 — add `mastered_capability_count`, drop
  `practiced_eligible_capability_count`, replace `has_started_lesson` with
  `is_activated`, add `retired_at is null` to the denominator CTE. `drop
  function … ; create … ` idiom (return-shape change). Re-grant `execute … to
  authenticated`.
- **RLS policies:** **N/A** — no new tables. The RPC is `security invoker`; it
  reads `learner_capability_state` / `learner_lesson_activation` under their
  existing owner-only RLS, so a call only ever counts the caller's own rows.
- **Grants:** unchanged (`grant execute on function … to authenticated`,
  `migration.sql:2032`).

### homelab-configs changes
- [ ] PostgREST schema exposure: **N/A** — `indonesian` already exposed.
- [ ] Kong CORS: **N/A** — no new origins/headers.
- [ ] GoTrue: **N/A**.
- [ ] Storage: **N/A**.

### Indexes
- **None to add.** The per-user aggregation is already covered by:
  `learning_capabilities_lesson_idx` `(lesson_id) where lesson_id is not null`
  (`migration.sql:1909`), `learning_capabilities_readiness_publication_idx`
  `(readiness_status, publication_status)` (`:1243`),
  `learning_capabilities_active_idx` `(lesson_id, source_kind) where retired_at
  is null` (`:2786`), and `learner_capability_state UNIQUE(user_id,
  capability_id)` (`:1285`). **data-architect to confirm the query plan.**

### Health check additions
- `scripts/check-supabase.ts` (anon, functional): assert
  `get_lessons_overview(test_user)` returns the new shape
  (`mastered_capability_count` present, `practiced_eligible_capability_count` +
  `has_started_lesson` absent, `is_activated` present).
- `scripts/check-supabase-deep.ts` (service, structural): **semantic parity**
  check — recompute `% mastered` for the test user via the TS predicate and
  assert it equals the RPC's `mastered_capability_count` per lesson (catches drift
  the unit-level literal test can't). **Note:** this runs under SERVICE_KEY
  (`check-supabase-deep.ts:17`), which **bypasses RLS** — so it does *not* prove
  the `security invoker` invoker path works for an authenticated caller. The
  authenticated-role test (§Testing 5) is the mandatory companion that closes
  that hole.

## Testing

1. **TS↔SQL parity (the ADR-0015 obligation) — two layers, because literals
   alone are insufficient.** The literal test catches *threshold* drift but
   **not** NULL-handling drift (a maintainer replacing `coalesce(stability,0)`
   with bare `stability`, or dropping the `last_reviewed_at >= …` recency clause)
   — exactly the divergence class the data-architect flagged. So the guard is
   **both** of:
   - **(a) Unit-level structural assert** — extract from the `get_lessons_overview`
     SQL body in `migration.sql`: the threshold literals (`4`, `14`, `30`,
     `lapse=0`, `consec=0`) **and** the presence of `coalesce(stability, …)`,
     `coalesce(lapse_count, …)`, `coalesce(consecutive_failure_count, …)`, and the
     `last_reviewed_at >= now() - interval '30 days'` clause. Assert each against
     the canonical constants/wrappers in `masteryModel.ts` `labelForCapability`.
     Lives at `scripts/__tests__/lessons-overview-mastery-parity.test.ts`
     (sibling to the precedent
     `scripts/__tests__/retire-source-progress-migration.test.ts`, which asserts
     on SQL text the same way).
   - **(b) Semantic deep-check** (Supabase Requirements → health checks): recompute
     `% mastered` per lesson via the TS predicate for the test user and assert
     equality with the RPC's `mastered_capability_count`. This catches any
     behavioural divergence the structural test can't.

   ADR 0015's text states explicitly that **(a) alone is not a sufficient parity
   guard** — (a)+(b) together are.
2. **`overview.ts`** unit tests: rewrite for the simplified map (drop the
   order-walk / recommender tests); assert `% mastered` math, `introducible=0`
   suppression, not-activated → 0%, prepared/disabled.
3. **`Lessons.test.tsx`**: update `overviewRow` helper to the new RPC shape;
   assert tile shows activation + `% mastered`, **no hero**, no sequential
   locking (a later lesson is openable regardless of earlier-lesson state).
4. **Migration**: `make migrate-idempotent-check` (RPC drop+create twice green);
   `make check-supabase` / `-deep`.
5. **Authenticated-role RLS test (CRITICAL — the numerator runs through an
   RLS-gated join).** The RPC is `security invoker` (`migration.sql:1974`) and
   this change **widens its join into `learner_capability_state` from 2 columns
   to 6** — the four added columns (`stability, last_reviewed_at, lapse_count,
   consecutive_failure_count`) drive the *entire* `mastered_capability_count`.
   `learner_capability_state` has owner-only RLS (`migration.sql:1334,1346-1348`).
   If RLS ever denies the join, every authenticated caller silently gets
   `mastered_count = 0` → every lesson reads `0% mastered`, **with no error** —
   the 2026-05-08 lesson-reader regression class. Neither existing check catches
   this: the §1(b) semantic deep-check runs in `check-supabase-deep.ts` under the
   **SERVICE_KEY** (`check-supabase-deep.ts:17`), which *bypasses RLS*; the
   anon/functional `check-supabase.ts` is shape-only. **Required:** a test that
   `set local role authenticated` + `set local request.jwt.claims` (`claims.sub` =
   a seeded user with a known-mastered cap on a lesson) and asserts a **non-zero**
   `mastered_capability_count` for that lesson — proving the RLS-gated join
   returns the owner's rows under the invoker path, not just under service_role.

## Plan grounding (target-architecture + module specs)

- `lib/analytics/` is **LOCKED incl. mastery sub-module** (target-arch:179) and is
  a **consumer of `lib/lessons`** via `isLessonActivated` (target-arch:573) — so
  landing `deriveLessonMastery`/the mastery relocation here is the target seam,
  not a parallel branch.
- Analytics is **bimodal: TS orchestration + Postgres aggregation**
  (target-arch:644) — the server-side `% mastered` is the documented shape.
- `lib/lessons/` is **LOCKED** (target-arch:170s); this change *removes* code
  (overviewStatus) and *simplifies* `overview.ts` — no new parallel surface.
- No module spec exists for `lib/lessons` overview today (only
  `lesson-renderer.md`); "retire overviewStatus" updates **code + tests + the new
  `analytics-mastery.md` spec**, not a missing lessons spec.

## Deliverables checklist

- [ ] Relocate `src/lib/mastery/` → `src/lib/analytics/mastery/` + barrel + test.
- [ ] `docs/current-system/modules/analytics-mastery.md` (new module spec).
- [ ] Move `formatGrammarTopicTag` + `LessonGrammarTopic` (+ their test) into
      `adapter.ts`; then delete `overviewStatus.ts`; simplify `overview.ts`;
      update `adapter.ts` (`LessonOverviewRpcRow:57`), `index.ts` barrel.
- [ ] `Lessons.tsx`: remove hero (`:323-340`), rewrite the raw-row loop
      (`:191-228`, drops `has_started_lesson`/`practiced_eligible_capability_count`
      reads), replace `STATUS_TONE` (`:114-121`), render two statuses; i18n delta.
- [ ] `get_lessons_overview` RPC edit in `scripts/migration.sql` + parity-safe
      mirror of the `mastered` predicate.
- [ ] ADR 0015 (§10). CONTEXT.md additions (§11). CLAUDE.md row (§12).
- [ ] Tests §1–5 (incl. the CRITICAL authenticated-role RLS test); health-check
      additions.
- [ ] `docs/current-system/modules/lessons-overview.md` — the `lib/lessons`
      overview surface now changes its public interface (deletes `overviewStatus`,
      simplifies `overview.ts`, changes `LessonOverviewModel`), so its module spec
      is due (CLAUDE.md: write/update the spec the same commit the interface
      changes; only `lesson-renderer.md` exists today).
