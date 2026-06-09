---
module: lessons-overview
surface: src/lib/lessons/overview.ts (+ adapter.ts overview reads)
last_verified_against_code: 2026-06-09
status: stable
---

# Lessons overview (`lib/lessons/` — overview surface)

The read model behind the **Lessons catalog page** (`src/pages/Lessons.tsx`). It
turns one `get_lessons_overview` RPC read into one tile row per published lesson,
each carrying the **two single-sourced facts** the tile shows. It does no
scheduling and walks no cross-lesson state.

> Scope: this spec covers the overview surface only. Activation writes
> (`activation.ts`), practice actions (`actionModel.ts`), and lesson-domain reads
> (`adapter.ts` `getLessons*`) are siblings in the same module, not covered here.

## 1. The two facts (single sources)

| Fact | Source | Field |
|---|---|---|
| **Activation** | `learner_lesson_activation` row EXISTS | `row.isActivated` |
| **% mastered** | `mastered / introducible` (server-side) | `row.masteredPercent` |

`introducible` = `ready ∧ published ∧ not-retired` lesson caps (the denominator).
`mastered` = the strict predicate (CONTEXT.md → Mastered), counted in SQL. A
third, orthogonal fact — **prepared** (`isPrepared`, registry membership) —
controls openability (`href`), not status.

## 2. Public interface

`overview.ts`:
- `buildLessonOverviewModel({ lessons, counts, grammarTopics, preparedLessonIds })`
  → `{ rows: LessonOverviewRow[] }` (order-sorted, published-only).
- `lessonMasteredPercent({ isActivated, masteredCount, introducibleCount })`
  → `number | null` (null when not activated or `introducibleCount === 0`;
  clamped to ≤ 100).
- `isPublishedOverviewLesson(lesson)`.
- Types: `LessonOverviewModel`, `LessonOverviewRow`, `LessonOverviewModelLesson`,
  `LessonOverviewCapabilityCounts`.

`adapter.ts` (overview reads): `getLessonsOverview(userId)` → `LessonOverviewRpcRow[]`;
`extractLessonGrammarTopics`, `formatGrammarTopicTag`, `LessonGrammarTopic`.

## 3. `LessonOverviewRow`

`{ lessonId, orderIndex, title, isActivated, masteredCount, introducibleCount,
masteredPercent, isPrepared, href, grammarTopicTag }`. No status enum, no action
label — `Lessons.tsx` derives the activation pill label, tone, action verb, and
`% mastered` subtitle from these fields.

## 4. Internal flow

`Lessons.tsx` calls `getLessonsOverview` once → maps each RPC row to
`LessonOverviewCapabilityCounts { lessonId, isActivated, masteredCount,
introducibleCount }` + collects `preparedLessonIds` from the bespoke-page
registry → `buildLessonOverviewModel` produces order-sorted, published-only tile
rows, computing `masteredPercent` per row and `href` from `isPrepared`.

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
- **Downstream**: `src/pages/Lessons.tsx` only.

## 7. What this spec does NOT cover

- The `mastered` predicate definition → `analytics-mastery.md` + CONTEXT.md.
- Activation writes → `activation.ts` / `set_lesson_activation` RPC.
- The lesson reader / in-lesson experience → `lesson-renderer.md`.
