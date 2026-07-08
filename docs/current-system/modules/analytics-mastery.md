---
module: analytics-mastery
surface: src/lib/analytics/mastery/
last_verified_against_code: 2026-07-09
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
  getPatternMastery, getMasteryOverview, getMasteryFunnel, getMasteryFunnels,
  getSkillModeGaps, getGrammarTopics, getStubbornWords }` (+ the standalone
  `getWeeklyMovement` RPC wrapper); every method has a default-client wrapper of
  the same name. All readers except content-unit/pattern share one
  `allLearnerEvidence(userId)` fetch (states → caps → activation → lesson-number).
- **Types**: `MasteryLabel`, `MasteryConfidence`, `MasteryDimension`,
  `CapabilityMasteryEvidence` (carries the introducing `lessonNumber` — cap
  `lesson_id` → `lessons.order_index` — for per-lesson funnels),
  `MasteryDimensionSummary`, `ContentUnitMastery`, `PatternMastery`,
  `MasteryOverview`, `MasteryFunnel` / `MasteryFunnels`, `GrammarTopic` /
  `GrammarDimensionProgress`, `SkillModeGap`.
- **Weekly Movement** (the fast pulse on the slow axis): pure deriver
  `deriveWeeklyMovement({events, now?})` + IO wrapper `getWeeklyMovement(userId,
  timezone)` → `WeeklyMovement { advancedVocab, advancedGrammar, reachedMastered,
  slipped }`. Counts **distinct `source_ref`** (word / grammar topic — a unit
  counts once however many of its caps advanced), **split + scoped to the same
  two buckets as the funnel**: vocab (`source_kind 'item'`) and grammar
  (`'pattern'` + `'affixed_form_pair'`); `dialogue_line` / `podcast` excluded.
  Derived read-side from `capability_review_events` before/after rungs (ADR 0016,
  not snapshotted). `getWeeklyMovement` reads the `get_weekly_movement` RPC, whose
  SQL `_mastery_label` mirror is kept in lockstep with `labelForCapability` by
  **HC28** (ADR 0015). `WeeklyReviewEvent` carries `{sourceRef, sourceKind,
  before, after}`.
- **Stubborn ("moeilijk") words** (acquisition-difficulty signal): predicate
  `isStubborn(evidence)` + constant `STUBBORN_THRESHOLD` (4) + pure deriver
  `deriveStubbornWords({evidence})` → `StubbornWord[]` + IO wrapper
  `getStubbornWords(userId)`. `lapseCount === 0 ∧ reviewCount > 0 ∧
  consecutiveFailureCount ≥ 4`. Not a `MasteryLabel`/rung; TS-only (no SQL mirror,
  no RPC), like the funnel/skill/grammar derivers.
- **Vocabulary skill profile** (receptive→productive→aural gap, #211; redesigned
  2026-06-12 from capability-% to **word counts**): pure deriver
  `deriveSkillModeGaps({evidence, now?})` → `SkillModeGap[]` + IO wrapper
  `getSkillModeGaps(userId)`. `SkillMode = 'recognise' | 'produce' | 'listen'`,
  with `ITEM_TYPE_MODE` mapping the seven **item** capability types to a mode
  (grammar/morphology excluded). Counts **distinct words** (`source_ref`, deduped
  — a word has up to 3 recognise / 2 produce / 2 listen caps): `knownWords` = words
  solid in the mode (ANY mode-cap `mastered`/`strengthening`), `practisedWords` =
  words with any mode-cap in scheduling; `strongPct = knownWords/practisedWords`
  is a kept-but-secondary quality ratio (the headline is the *count*, a vocabulary
  size that climbs — Webb 2008; Laufer & Nation 1999 — not a ratio over a growing
  pile, which can't). `confidence` thresholds are in **words** (5/20). TS-only (no
  SQL mirror, no RPC).
- **Mastery progression funnels** (the journey distribution): pure derivers
  `deriveMasteryFunnel({evidence, now?})` → `MasteryFunnels {vocabulary, grammar}`
  (each a `MasteryFunnel` = per-rung counts) and
  `deriveMasteryFunnelByLesson({evidence, now?})` → `Map<lessonNumber,
  MasteryFunnels>`; IO `getMasteryFunnel` (all lessons) and `getMasteryFunnels`
  (all + per-lesson in one fetch). Units are `source_ref` rolled up weakest-wins;
  the vocab/grammar split is `funnelBucket(sourceKind)` (`item`→vocab,
  `pattern`/`affixed_form_pair`→grammar, else excluded) — the single source of
  truth shared with Weekly Movement (and HC28, ADR 0015). TS-only.
- **Grammar topics** (per-pattern drill-down): pure deriver
  `deriveGrammarTopics({evidence, now?})` → `GrammarTopicLabel[]` (per pattern:
  `lessonNumber`, weakest-wins `label`, total `reviewCount`, and `recognise` /
  `contrast` / `produce` `GrammarDimensionProgress` from the
  `recognise_grammar_pattern_cap` / `contrast_grammar_pattern_cap` /
  `produce_grammar_pattern_cap` caps — ADR 0017, the produce facet folds into the
  `pattern_use` dimension, no new `MasteryDimension`)
  + IO `getGrammarTopics` (joins `grammar_patterns` for
  name + explanation, resolving the cap source_ref via `patternSlugFromSourceRef`).
  TS-only.

## 2. The canonical `mastered` predicate (single source of truth)

`labelForCapability` (`masteryModel.ts:169`) maps one capability's evidence
to a `MasteryLabel` on the ladder
`at_risk / not_assessed / introduced / learning / strengthening / mastered`
(current as of 2026-06-12 — the at_risk gate was a permanent OR, then self-healing
consec-only, now the lapse-AND below):

```
consecutiveFailureCount > 0:
    lapseCount > 0   → at_risk        (a genuine lapse: learned, now forgetting)
    lapseCount === 0 → introduced (activated) | not_assessed   (never learned — still acquiring)
reviewCount === 0                    → introduced (activated) | not_assessed
reviewCount ≥ 4 ∧ stability ≥ 14 ∧ isRecent(max(30d, 2×stability)) → mastered
reviewCount ≥ 3 ∨ stability ≥ 5      → strengthening
otherwise                            → learning
```

`at_risk` is **self-healing** (a correct answer clears `consecutiveFailureCount`)
and now means *learned-then-forgetting*; `lapseCount` is the only counter that
survives a failure (the boundary "have you ever learned this word?"). `isRecent`
is `false` for a null `lastReviewedAt`; the `?? 0` stability fallbacks are
load-bearing (nullable column). The recency window is **stability-scaled**
(`mastered.ts:12-28`, Slice 3 of `docs/plans/2026-07-08-vocab-mode-set-reduction-
and-graduation.md`, ADR 0027 Analytics note): `max(30 days, 2 × stability)`, not a
flat 30 — a mature card's FSRS interval routinely exceeds 30 days between its own
reviews, and a flat window would misreport it as stale. `stability` is an OPTIONAL
third arg to `isRecent`; a caller that omits it (e.g. `recentReviewCount` in
`deriveMasteryDimensions`, a confidence-score tally, not a mastery gate) gets the
unscaled 30-day window unchanged. The extracted, recency-FREE core
(`hasMasteryStrength`, `mastered.ts:31-37`) is what vocab-graduation's
due-suppression reuses (`src/lib/session-builder/graduation.ts`) — it never reads
`lastReviewedAt` at all, so it cannot flicker the way the full predicate would at
a fixed window. **Moeilijk** (stubborn) is a *separate* TS signal
(`isStubborn` / `deriveStubbornWords`, `masteryModel.ts`), **not** a `MasteryLabel`
and not a funnel rung — `lapseCount === 0 ∧ consecutiveFailureCount ≥ 4` (a
never-learned word repeatedly failed); surfaced as its own callout, no SQL mirror.
See `docs/plans/2026-06-12-mastery-ladder-lapse-and-stubborn.md`.

**This `mastered` rung is mirrored in SQL** inside `get_lessons_overview`
(`scripts/migration.sql`) to compute per-lesson `% mastered` server-side. The two
implementations are kept in lockstep by a TS↔SQL parity test
(`scripts/__tests__/lessons-overview-mastery-parity.test.ts`) + a semantic
deep-check (`check-supabase-deep.ts`). Per **ADR 0015**, this mirror is a
deliberate, guarded duplication — not a single-source violation. **If you change
the predicate here, change both and the parity test will fail until you do.**
`get_lessons_overview` ALSO carries a mastered-numerator **subsumption** clause
(Slice 3, ADR 0027 Analytics note) with no TS-side twin: a `vocabulary_src`
`recognise_meaning_from_text_cap` (#1) row counts as mastered when its
same-`source_ref`, same-lesson, non-retired `produce_form_from_meaning_cap` (#6)
sibling meets the recency-free `hasMasteryStrength` bar — otherwise a graduated
scaffold (retired from due scheduling by vocab-graduation) would silently drag
lesson `% mastered` down over time. This is deliberately scoped to
`get_lessons_overview` only, NOT `_mastery_label` (`get_weekly_movement` /
`get_collections_overview`) — Minimum Mechanism, see the plan's §5 "Open
question" and ADR 0027's Analytics note. A silent RLS-deny on the sibling's
`learner_capability_state` read would make subsumption never fire without either
guard noticing (both are static source-string checks), so this clause is ALSO
guarded by a live authenticated-role execution test
(`scripts/verify-lessons-overview-rls.ts`, run from `make
verify-lessons-overview-rls`).

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
- **Downstream consumers**: the Voortgang surfaces **do** consume this model
  (updated 2026-06-12): the parallel **Woordenschat** and **Grammatica** pages
  share `MasteryFunnelPanel` ← `getMasteryFunnels` (all-lessons + per-lesson
  funnels, the latter from `deriveMasteryFunnelByLesson`); Grammatica's per-lesson
  drill-down `GrammarPatternList` ← `getGrammarTopics`/`deriveGrammarTopics`;
  `SkillModeGapsCard` ← `deriveSkillModeGaps`; the moeilijke-woorden callout ←
  `deriveStubbornWords`; the home movement card ← `deriveWeeklyMovement`.
  `get_lessons_overview` mirrors the `mastered` predicate in SQL for the lesson
  tile's `% mastered` (parity-tested, ADR 0015). Per-lesson funnels work because
  `CapabilityMasteryEvidence` now carries the introducing `lessonNumber` (the
  cap's `lesson_id` → `lessons.order_index`).
- **Sibling / umbrella**: [[analytics-engagement]] (the Practice Time axis) and
  `analytics.md` (the umbrella read-model map — which surface reads which RPC).

## 6. What this spec does NOT cover

- The lesson tile's two statuses (activation + `% mastered`) — see the
  `lessons-overview` module spec and `docs/plans/2026-06-09-lesson-status-two-sources-design.md`.
- The Practice Time / streak axis — see [[analytics-engagement]].
- The umbrella view of all analytics surfaces + the server-RPC-vs-TS-deriver
  split — see `analytics.md`.
- The deferred intra-module decomposition (target-architecture.md:682-719).
