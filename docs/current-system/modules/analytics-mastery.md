---
module: analytics-mastery
surface: src/lib/analytics/mastery/
last_verified_against_code: 2026-07-11
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
  getSkillModeGaps, getGrammarTopics, getStubbornWords, getTroublesomeWords,
  getFunnelSeries }` (+ the standalone `getWeeklyMovement` RPC wrapper); every
  method has a default-client wrapper of the same name. All readers except
  content-unit/pattern share one `allLearnerEvidence(userId)` fetch (states →
  caps → activation → lesson-number).
  **Narrowed to two RPCs** (2026-07-11,
  `docs/plans/2026-07-11-mastery-evidence-rpc-narrowing.md`, fixing a silent
  PGRST_DB_MAX_ROWS truncation risk — the C1 finding): `allLearnerEvidence` and
  `getFunnelSeries`'s capability/state/activation/lesson set are sourced from
  ONE scalar-jsonb RPC, `get_mastery_evidence(p_user_id)` — same idiom as
  `get_session_build_data` (immune to row truncation; `states` unfiltered
  beyond `user_id`; `capabilities` filtered ONLY `retired_at is null`, no
  readiness/publication filter — parity with the pre-cutover client join).
  `getFunnelSeries`'s events come from a second RPC,
  `get_funnel_series_events(p_user_id, p_window_start)`, returning a bounded
  `{baseline, window_events}` pair (latest pre-window event per capability +
  everything since) instead of the learner's lifetime event history — exact
  for `deriveFunnelSeries`, see §3. The content-unit/pattern readers
  (`getContentUnitMastery`/`getPatternMastery`) are UNCHANGED: they still use
  the direct, chunked `learner_capability_state`/`learning_capabilities` reads
  (`capabilityRowsByIds`/`learnerStates`, both via `chunkedIn`) — this
  narrowing does not touch them (guarded by HC52).
  **In-flight dedup** (fixing the C2 finding — five Voortgang cards each
  independently calling `allLearnerEvidence`): the `get_mastery_evidence` RPC
  call is deduped per `(client, userId)` in a module-level `WeakMap`, entry
  created on fetch start and evicted on settle (resolve AND reject) — no TTL.
  Concurrent callers on one page load coalesce into a single network call; a
  call issued after the in-flight one settles always gets a fresh fetch. This
  keeps every reader **observationally identical to the uncached path** —
  same data, same errors, same read-only/deterministic behaviour — dedup is
  purely a transport optimisation, not a caching layer with its own
  invalidation semantics.
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
- **Troublesome ("keep getting wrong") words** (Home surface, a convenience
  aggregation over an existing action — not a new intervention, 2026-07-09,
  `docs/plans/2026-07-09-home-mnemonic-weak-words-surface.md`): pure deriver
  `deriveTroublesomeWords({evidence, now?})` → `TroublesomeWord[]`
  (`{sourceRef, sourceKind}` — raw, no label; a label would require importing
  `lib/mnemonics`, and since `mnemonics/affordance.ts` already imports
  `isStubborn` FROM this module, that would close a back-edge cycle — target-arch
  Rule #7) + IO wrapper `getTroublesomeWords(userId)`. Set = at-risk
  (`labelForCapability(e,now) === 'at_risk'`) ∪ stubborn (`isStubborn(e)`) —
  reuses both canonical predicates verbatim (mutually exclusive at the cap
  level, so no double-count), scoped to vocabulary words only via
  `funnelBucket(sourceKind) === 'vocab'` (excludes `null`, `'grammar'`, AND
  `'morphology'`/`word_form_pair_src` — the latter narrowed 2026-07-09: its
  `lesson-N/morphology/<slug>` source_ref has no clean string label and belongs
  to the Affix Trainer), deduped by `source_ref` (mirrors
  `StubbornWordsCard`'s C1 fix), sorted descending by each word's max
  `consecutiveFailureCount` ("most currently-stuck first"). Returns the FULL
  troublesome set — un-hooked filtering (Home shows only words without a saved
  memory hook) is the caller's concern, so the reader stays a reusable
  projection. TS-only (no SQL mirror, no RPC).
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
  truth shared with Weekly Movement (and HC28, ADR 0015). TS-only. **A funnel's
  `strengthening + mastered` is the "usable" count** the Voortgang surface
  headlines with (`MasteryLadder`'s achievement headline, the hub's per-topic
  summaries, `GrowthCurveCard`'s single climbing area) — computed at the UI
  layer from the plain rung counts, not a separate deriver.
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

`labelForCapability` (`masteryModel.ts:177`) maps one capability's evidence
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

`toEvidence` (`:1100`) joins `learning_capabilities` rows to the learner's
`learner_capability_state` and the activated-lesson set into
`CapabilityMasteryEvidence[]`; podcast caps (null `lesson_id`) count as
activated (ADR 0006). For `allLearnerEvidence`/`getFunnelSeries`, the three
inputs `toEvidence` joins (states, capabilities, activated-lesson set) are all
sourced from ONE `get_mastery_evidence` RPC call (`rawMasteryEvidence`,
`:1055`) rather than `listActivatedLessons` + a direct client read — the
content-unit/pattern readers (`evidenceForCapabilities`, `:1177`) still call
`listActivatedLessons` from `lib/lessons` directly, since they are not on the
RPC path. `deriveMasteryDimensions` buckets evidence by `MasteryDimension`
(`dimensionForCapability`, `:140`), labelling each dimension by `weakestLabel`
and scoring `confidence`. The scope derivers roll the dimensions up via
`weakestLabel` + `aggregateConfidence`.

**`weakestLabel` rollup is per content-unit / pattern / overview — NOT per
lesson.** Lesson-level mastery is a *coverage percentage* (`mastered / introducible`)
computed in the RPC, deliberately not a `weakestLabel` rollup (one un-mastered
cap would otherwise drag a ~400-cap lesson to its weakest label). See the
lesson-status spec / `lessons-overview` module.

## 4. Invariants

- Read-only; no writes, no scheduling.
- Retired caps excluded (`retired_at is null`, `capabilityRowsByIds` `:1154`;
  `get_mastery_evidence`'s `evidence_caps` CTE mirrors the same filter server-side).
- `mastered` is level-independent and strict; a forgiving signal would get a
  *different word*, never a diluted `mastered` (CONTEXT.md → Mastered).

## 5. Seams

- **Upstream**: `lib/capabilities/` (types), `lib/lessons/` (`listActivatedLessons`
  — content-unit/pattern readers only, see §3), `lib/chunkedQuery` (content-unit/
  pattern readers only), `lib/supabase`. Two RPCs: `indonesian.get_mastery_evidence`
  and `indonesian.get_funnel_series_events` (`scripts/migration.sql`, appended
  next to `get_session_build_data`) — the `allLearnerEvidence`/`getFunnelSeries`
  transport (2026-07-11 narrowing, see §1). Guarded by **HC52** (static source
  check — no unbounded client-side `learner_capability_state`/
  `capability_review_events` read; the retained chunked `learnerStates` path
  must stay present) and **HC53** (live parity under real authenticated-role
  RLS — signs in as the E2E test user, asserts non-empty states/capabilities/
  baseline, then parity-compares RPC A vs direct service-role reads and
  `deriveFunnelSeries(baseline ∪ window)` vs the same deriver over the full
  event history).
- **Downstream consumers**: the Voortgang surfaces **do** consume this model
  (updated 2026-07-09 for the hub redesign): the five progress details share
  `MasteryFunnelPanel` ← `getMasteryFunnels` (all-lessons + per-lesson
  funnels, the latter from `deriveMasteryFunnelByLesson`), which passes the
  scoped `MasteryFunnel` to **`MasteryLadder`** (replaces the retired
  `MasteryJourney`) and renders the at-risk `ListCard` itself when supplied
  `onAtRiskClick`; Grammatica's per-lesson drill-down `GrammarPatternList` ←
  `getGrammarTopics`/`deriveGrammarTopics`; `SkillModeGapsCard` ←
  `deriveSkillModeGaps`; the moeilijke-woorden callout ← `deriveStubbornWords`;
  the home movement card ← `deriveWeeklyMovement`; the Voortgang hub's five
  live-summary subtitles ← `getMasteryFunnel` (all-lessons, unscoped) +
  `engagement.practiceTime`. Home's troublesome-words nudge
  (`pages/Dashboard.tsx` → conditional `ListCard` →
  `components/mnemonics/TroublesomeWordsSheet` → `MnemonicWordChips`) ←
  `deriveTroublesomeWords`/`getTroublesomeWords`.
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
