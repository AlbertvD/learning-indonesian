---
module: lessons-overview
surface: src/lib/lessons/overview.ts (+ adapter.ts overview reads)
last_verified_against_code: 2026-06-09
status: stable
---

# Lessons overview (`lib/lessons/` — overview surface)

The read model behind the **Lessons catalog page** (`src/pages/Lessons.tsx`),
rendered as one `LessonCard` (`src/components/lessons/LessonCard.tsx`) per row. It
turns one `get_lessons_overview` RPC read into one tile row per published lesson,
each carrying the single-sourced facts the tile shows. It does no scheduling and
walks no cross-lesson state.

> Scope: this spec covers the overview surface only. Activation writes
> (`activation.ts`), practice actions (`actionModel.ts`), and lesson-domain reads
> (`adapter.ts` `getLessons*`) are siblings in the same module, not covered here.

## 1. The facts (single sources)

| Fact | Source | Field |
|---|---|---|
| **Activation** | `learner_lesson_activation` row EXISTS | `row.isActivated` |
| **% mastered** | `mastered / introducible` (server-side) | `row.masteredPercent` |
| **% practiced** | `practiced / introducible` (server-side) | `row.practicedPercent` |
| **CEFR level** | `lessons.level` passthrough | `row.level` |

`introducible` = `ready ∧ published ∧ not-retired` lesson caps (the denominator).
`mastered` = the strict predicate (CONTEXT.md → Mastered), counted in SQL.
`practiced` = `review_count ≥ 1` (canonical `PRACTICED_MIN_REVIEWS` in
`overview.ts`), counted in SQL over the same introducible filter — **nested**:
`mastered ⊆ practiced ⊆ introducible`, so `practicedPercent ≥ masteredPercent`.
The two render as the tile's two stacked nested progress bars (geoefend over
beheerst). The **level** is a passthrough for the CEFR badge (see
`cefr-level-rubric.md`). A further orthogonal fact — **prepared**
(`isPrepared`, registry membership) — controls openability (`href`), not status.

## 2. Public interface

`overview.ts`:
- `buildLessonOverviewModel({ lessons, counts, grammarTopics, preparedLessonIds })`
  → `{ rows: LessonOverviewRow[] }` (order-sorted, published-only).
- `lessonMasteredPercent({ isActivated, masteredCount, introducibleCount })`
  → `number | null` (null when not activated or `introducibleCount === 0`;
  clamped to ≤ 100).
- `lessonPracticedPercent({ isActivated, practicedCount, introducibleCount })`
  → `number | null` — same null rule + clamp as mastered; `0` (not null) when
  activated with nothing practiced yet.
- `PRACTICED_MIN_REVIEWS` — the canonical practiced threshold (= 1), mirrored by
  the SQL `practiced_count` filter (parity test: `lessons-overview-mastery-parity`).
- `isPublishedOverviewLesson(lesson)`.
- Types: `LessonOverviewModel`, `LessonOverviewRow`, `LessonOverviewModelLesson`,
  `LessonOverviewCapabilityCounts`.

`adapter.ts` (overview reads): `getLessonsOverview(userId)` → `LessonOverviewRpcRow[]`;
`extractLessonGrammarTopics`, `formatGrammarTopicTag`, `LessonGrammarTopic`.

## 3. `LessonOverviewRow`

`{ lessonId, orderIndex, title, level, isActivated, masteredCount, practicedCount,
introducibleCount, masteredPercent, practicedPercent, isPrepared, href,
grammarTopicTag }`. No status enum, no CTA/action label — `Lessons.tsx` derives the
activation pill label + tone, cleans the display title (strips `Les N -` + the L14
short-title override), and passes the bars / level / status to `LessonCard`. The
redundant `Doorgaan`/`Open les` CTA was removed in the tile redesign — the whole
card is the link.

## 4. Internal flow

`Lessons.tsx` calls `getLessonsOverview` once → maps each RPC row to
`LessonOverviewCapabilityCounts { lessonId, isActivated, masteredCount,
practicedCount, introducibleCount }` + collects `preparedLessonIds` from the
bespoke-page registry → `buildLessonOverviewModel` produces order-sorted,
published-only tile rows, computing `masteredPercent` + `practicedPercent` per row,
passing `level` through, and `href` from `isPrepared`. Each row renders as a
`LessonCard`: banner (number + display title), full grammar row, the two nested
bars, and the level badge + status pill as a right-hand meta column.

## 5. Invariants

- **No sequential locking.** A later lesson is openable regardless of earlier
  lessons (activation is the learner's gate). The retired `overviewStatus`
  order-gate is gone.
- **No recommended-lesson hero.** The catalog is flat; Today/Session is the CTA.
- `masteredPercent` is `null` (not `0`) when there's nothing to show — the tile
  then shows activation only, never "0/0".
- `% mastered` is server-aggregated (ADR 0015); the page does only `mastered /
  introducible`.

## 6. Seams

- **Upstream**: `get_lessons_overview` RPC (`scripts/migration.sql`), the
  bespoke-page registry (`src/pages/lessons/registry.ts`).
- **The `mastered` numerator** is owned by `analytics-mastery` (the SQL mirrors
  its predicate) — see `docs/current-system/modules/analytics-mastery.md`.
- **Downstream**: `src/pages/Lessons.tsx` → `src/components/lessons/LessonCard.tsx`
  (the bespoke tile view).

## 7. What this spec does NOT cover

- The `mastered` predicate definition → `analytics-mastery.md` + CONTEXT.md.
- Activation writes → `activation.ts` / `set_lesson_activation` RPC.
- The lesson reader / in-lesson experience → `lesson-renderer.md`.
