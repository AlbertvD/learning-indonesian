---
module: analytics-mastery
surface: src/lib/analytics/mastery/
last_verified_against_code: 2026-06-09
status: partial
---

# Mastery model (`lib/analytics/mastery/`)

The read-only sub-module of `lib/analytics/` that derives **learner-facing
mastery** from capability review state. It schedules nothing and writes nothing.
It is the canonical home of the strict **`mastered`** definition that the rest of
the app (and the `get_lessons_overview` RPC, via a parity-tested SQL mirror —
ADR 0015) defers to.

> `status: partial` — this spec covers the model + the canonical predicate. The
> target-architecture decomposition of `masteryModel.ts` into
> `model.ts`/`rules.ts`/`derive.ts`/`aggregate.ts`/`adapter.ts`
> (target-architecture.md:682-719) is **deferred**; today the module is the
> single file `masteryModel.ts`, relocated unchanged from `lib/mastery/` in the
> lesson-status two-sources change.

## 1. Public interface

All in `masteryModel.ts`:

- **Pure derivers** (no IO): `deriveMasteryDimensions(evidence, now?)`,
  `deriveContentUnitMastery({userId, contentUnitId, evidence, now?})`,
  `derivePatternMastery({userId, patternId, evidence, now?})`,
  `deriveMasteryOverview({userId, evidence, now?})`.
- **IO model**: `createMasteryModel(client)` → `{ getContentUnitMastery,
  getPatternMastery, getMasteryOverview }`; default-client wrappers
  `getContentUnitMastery / getPatternMastery / getMasteryOverview`.
- **Types**: `MasteryLabel`, `MasteryConfidence`, `MasteryDimension`,
  `CapabilityMasteryEvidence`, `MasteryDimensionSummary`, `ContentUnitMastery`,
  `PatternMastery`, `MasteryOverview`.

## 2. The canonical `mastered` predicate (single source of truth)

`labelForCapability` (`masteryModel.ts:174-182`) maps one capability's evidence
to a `MasteryLabel` on the ladder
`at_risk / not_assessed / introduced / learning / strengthening / mastered`:

```
consecutiveFailureCount > 0 ∨ lapseCount > 0          → at_risk      (override, :175)
reviewCount === 0                                      → introduced (lesson activated) | not_assessed  (:176-178)
reviewCount ≥ 4 ∧ stability ≥ 14 ∧ isRecent(30d)       → mastered    (:179)
reviewCount ≥ 3 ∨ stability ≥ 5                        → strengthening (:180)
otherwise                                              → learning    (:181)
```

`isRecent` (`:168-172`) is `false` for a null `lastReviewedAt`. The `?? 0`
fallbacks on `stability` are load-bearing (the column is nullable).

**This `mastered` rung is mirrored in SQL** inside `get_lessons_overview`
(`scripts/migration.sql`) to compute per-lesson `% mastered` server-side. The two
implementations are kept in lockstep by a TS↔SQL parity test
(`scripts/__tests__/lessons-overview-mastery-parity.test.ts`) + a semantic
deep-check (`check-supabase-deep.ts`). Per **ADR 0015**, this mirror is a
deliberate, guarded duplication — not a single-source violation. **If you change
the predicate here, change both and the parity test will fail until you do.**

## 3. Internal flow (functional)

`toEvidence` (`:358`) joins `learning_capabilities` rows to the learner's
`learner_capability_state` and the activated-lesson set (`listActivatedLessons`
from `lib/lessons`) into `CapabilityMasteryEvidence[]`; podcast caps (null
`lesson_id`) count as activated (ADR 0006). `deriveMasteryDimensions` buckets
evidence by `MasteryDimension` (`dimensionForCapability`, `:134`), labelling each
dimension by `weakestLabel` and scoring `confidence`. The scope derivers roll the
dimensions up via `weakestLabel` + `aggregateConfidence`.

**`weakestLabel` rollup is per content-unit / pattern / overview — NOT per
lesson.** Lesson-level mastery is a *coverage percentage* (`mastered / introducible`)
computed in the RPC, deliberately not a `weakestLabel` rollup (one un-mastered
cap would otherwise drag a ~400-cap lesson to its weakest label). See the
lesson-status spec / `lessons-overview` module.

## 4. Invariants

- Read-only; no writes, no scheduling.
- Retired caps excluded (`retired_at is null`, `:403`).
- `mastered` is level-independent and strict; a forgiving signal would get a
  *different word*, never a diluted `mastered` (CONTEXT.md → Mastered).

## 5. Seams

- **Upstream**: `lib/capabilities/` (types), `lib/lessons/` (`listActivatedLessons`),
  `lib/chunkedQuery`, `lib/supabase`.
- **Downstream consumers**: `get_lessons_overview` RPC (the `mastered` mirror, for
  the lesson tile's `% mastered`); `components/progress/` surfaces are a *separate*
  `itemsByStage` calc, not this model (see `Progress.tsx` / `MasteryFunnel.tsx`).

## 6. What this spec does NOT cover

- The lesson tile's two statuses (activation + `% mastered`) — see the
  `lessons-overview` module spec and `docs/plans/2026-06-09-lesson-status-two-sources-design.md`.
- The Progress-page funnel — a separate calc, not this model.
- The deferred intra-module decomposition (target-architecture.md:682-719).
