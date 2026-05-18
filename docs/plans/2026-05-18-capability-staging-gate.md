---
status: implementing
---

# Capability staging gate + session-block interleave

**Author:** albert
**Date:** 2026-05-18
**Module touched:** `src/lib/session-builder/`

## 1. Problem

Two distinct UX issues observed in `albert@duin.home`'s 36-hour activity (2026-05-17 → 2026-05-18):

**Issue A — same word, multiple tests, same session, often back-to-back.** 30.1% of reviews (43/143) were part of a within-session repeat-group on the same `source_ref`. Worst case: `apa kabar?` tested three times in 31 seconds (`text_recognition` at 22:14:20, `l1_to_id_choice` at 22:14:43, `meaning_recall` at 22:14:51 in session `e2202d55`).

**Issue B — productive tests fire same day as introduction.** When a new vocabulary item enters the session, all four capability types (`text_recognition`, `meaning_recall`, `l1_to_id_choice`, `form_recall`) currently become eligible simultaneously. The learner is asked to produce an Indonesian form from memory on the same day they're first shown it.

Both issues share a root cause: **the planner and composer treat each capability as an independent SR card with no awareness that several capabilities can share a `source_ref`**.

## 2. Pedagogical principles

| Principle | Source | Consequence here |
|---|---|---|
| Receptive before productive | Nation's Four Strands; Krashen Input Hypothesis | Don't ask the learner to *produce* a form they haven't yet stabilised at the *recognise* level |
| Genuine retrieval requires intervening items | Karpicke 2009 (expanding retrieval) | Two tests of the same word within ~30s aren't retrieval practice — the answer is still in working memory |
| Dual-coding strengthens traces | Paivio | Multiple tests on the same item across modalities/directions is *good* — it's the timing that's wrong, not the repetition itself |

## 3. Capability-type phase taxonomy

From `src/lib/capabilities/capabilityTypes.ts:32-44`, twelve types sort into four phases. Classification is grounded in the actual exercise rendered (`labels.ts:20-79` for the learner-facing description; `renderContracts.ts:42-88` for the capability-type → exercise-type mapping):

| Phase | Cognitive process | Capability types |
|---|---|---|
| **1. Receptive recognition** | input → "I know this" | `text_recognition`, `audio_recognition`, `podcast_gist` |
| **2. Receptive recall** | input → produce L1 meaning | `meaning_recall` |
| **3. Productive recognition (MCQ)** | L1 / cue → choose ID from options | `l1_to_id_choice`, `pattern_contrast` |
| **4. Productive recall (typed / free)** | L1 / cue → produce ID from memory | `form_recall`, `contextual_cloze`, `dictation`, `root_derived_recognition`, `root_derived_recall`, `pattern_recognition` |

Phases 1+2 are receptive (input-driven). Phases 3+4 are productive (output-driven). The staging gate distinguishes "phase ≥ 3" from "phase ≤ 2".

### 3.1 Conservative classification for many-to-many capability-type → exercise mappings

`renderContracts.ts:42-88` shows several capability types map to **both** MCQ (Phase 3) and free-recall (Phase 4) exercise families:

| Capability type | Phase-3 exercise | Phase-4 exercise | Plan classifies as |
|---|---|---|---|
| `contextual_cloze` | `cloze_mcq` (renderContracts.ts:78-82) | `cloze` (renderContracts.ts:73-77) | **Phase 4** |
| `root_derived_recognition` | `cued_recall` (renderContracts.ts:49) | `typed_recall` (renderContracts.ts:54) | **Phase 4** |
| `root_derived_recall` | `cued_recall` (renderContracts.ts:49) | `typed_recall` (renderContracts.ts:54) | **Phase 4** |

The plan adopts the **higher-phase classification** for each many-to-many case. Rationale: phase is a *learner readiness* signal. If a capability *can* resolve into Phase 4, gating at Phase 4 ensures the learner is ready for the hardest possible resolution. The cost is occasionally over-restricting Phase-3 resolutions (a typed-cloze that ends up rendering as MCQ-cloze). The benefit is never under-restricting (an unstable item never gets the hardest variant). The over-restriction unwinds the moment the receptive sibling stabilizes — at most one extra day.

### 3.2 `pattern_contrast` and `pattern_recognition` notes

- `pattern_contrast` (`labels.ts:64-67`): "Kies welke van twee bijna-gelijke Indonesische vormen past in de zin" — forced-choice MCQ between two pre-supplied forms. **Productive recognition / Phase 3.** Currently `renderContracts.ts:83-85` lists `contrast_pair.capabilityTypes: []` — `pattern_contrast` is intentionally unmapped today, so the classification only takes effect once the render contract is wired.
- `pattern_recognition` (`labels.ts:60-63`): "Vul een Indonesische zin aan volgens het juiste grammaticale patroon" — fill-in-the-sentence. Could render as either an MCQ or a typed input depending on the future render contract (`renderContracts.ts` shows no mapping yet). Classified **Phase 4** conservatively; revisit when the render contract is added.

**Note:** `pattern_contrast` and `pattern_recognition` are both currently inert at the runtime — `renderContracts.ts:83-88` (`contrast_pair`) and the entries for sentence_transformation / constrained_translation / speaking carry `capabilityTypes: []`, and no other render contract maps these two types. The staging gate's effect on the pattern capabilities therefore only takes hold once the render contracts are wired up; until then the gate runs but doesn't change session behaviour for these types.

## 4. Rule A — Staging gate (planner suppression rule)

**Where:** `src/lib/session-builder/pedagogy.ts:planLearningPath`.

**Rule (inserted between the existing `recent_failure_fatigue` rule at line 201 and the `isAllowedInSessionMode` check at line 205):**

> For a candidate capability with `capabilityPhase(capabilityType) >= 3`, suppress as `productive_capability_not_unlocked` **unless** some sibling capability sharing the same `source_ref` has:
>
> - `activationState === 'active'`, **AND**
> - `stability >= 1` (in days), **AND**
> - `successfulReviewCount >= 1`

The check is O(states) once at the top of the planner loop (build a `Set<string>` of unlocked `source_ref`s); then O(1) per candidate.

**`successfulReviewCount` derivation.** This field is computed by the adapter at `adapter.ts:227` as `Math.max(0, reviewCount - lapseCount - consecutiveFailureCount)`. It is **not** a literal count of "good" answers — a "hard" rating (FSRS rating 2) bumps `reviewCount` without bumping `lapseCount` or `consecutiveFailureCount`, so it counts toward `successfulReviewCount`. In practice, Albert's data uses only ratings 1 (again) and 3 (good), so the field tracks "good" answers minus lapses minus consecutive-failure streak — a tight proxy for "the learner is moving forward on this trace." The `>= 1` threshold is the minimum signal that *any* forward motion has occurred since the introduction.

**Threshold (`stability >= 1d`) rationale:**

- After a first "good" answer, FSRS initialises stability ≈ 0.21d (≈5h in the live data).
- After one successful re-review the next day, stability climbs past 1d.
- So `>= 1d` operationally means "at least one successful retrieval after the introduction" — the minimum bar for "this trace exists."

**Why this lives in the planner (new-intro path), not the due-review path:**

Active capabilities don't enter the new-intro pass — `pedagogy.ts:192-196` already suppresses them with `already_active_or_retired`. The staging gate only governs *first-time introductions*. Active productive caps from prior sessions are not retroactively blocked.

### 4.1 Type changes

- `PlannerLearnerCapabilityState` (`pedagogy.ts:29-34`): add `stability: number | null`. (DB column already populated; just not projected today.)
- `PlannerReason` union (`pedagogy.ts:36-45`): add `'productive_capability_not_unlocked'`.
- `PlannerCapability` (`pedagogy.ts:10-27`): **no change** — `sourceRef` is already present (line 14).

### 4.2 Adapter plumbing

- `adapter.ts:222-229` (`toPlannerState`): add `stability: row.stability` to the returned object. `LearnerCapabilityStateRow.stability` already exists (`capabilityScheduler.ts:12`).
- **Callers of `toPlannerState` are unaffected.** The function is only called inside `loadCapabilitySessionData` at `adapter.ts:334` (`learnerCapabilityStates: schedulerRows.map(toPlannerState)`). The output flows into `PedagogyInput.learnerCapabilityStates`, which is consumed exclusively by `planLearningPath` (`pedagogy.ts:152`). Adding one optional field to the output shape does not break any consumer — it is the planner that gains visibility into the new field, not any code path that already exists.

### 4.3 New helper

```typescript
function capabilityPhase(type: CapabilityType): 1 | 2 | 3 | 4 {
  switch (type) {
    case 'text_recognition':
    case 'audio_recognition':
    case 'podcast_gist':
      return 1
    case 'meaning_recall':
      return 2
    case 'l1_to_id_choice':
    case 'pattern_contrast':
      return 3
    case 'form_recall':
    case 'contextual_cloze':
    case 'dictation':
    case 'root_derived_recognition':
    case 'root_derived_recall':
    case 'pattern_recognition':
      return 4
  }
}
```

The case arms match the §3 phase table and §3.1 / §3.2 conservative classifications exactly:

- `pattern_contrast` → 3 (MCQ per `labels.ts:64-67`)
- `root_derived_recognition`, `root_derived_recall` → 4 (map to `typed_recall` per `renderContracts.ts:54`, conservative)
- `contextual_cloze` → 4 (maps to both `cloze` and `cloze_mcq` per `renderContracts.ts:73-82`, conservative)
- `pattern_recognition` → 4 (no render contract yet; conservative default per §3.2)

The `switch` is exhaustive over the `CapabilityType` union; the TS compiler will flag any new type added to `capabilityTypes.ts:32-44` that doesn't get a phase entry.

### 4.4 What this rule does NOT do

- It does not block active capabilities. Once a capability is active (any phase), it stays in the rotation through the due-review pass.
- It does not block podcast capabilities (`podcast_phrase` is already filtered by `isAllowedInSessionMode`).
- It does not enforce a maximum number of productive intros per session — that remains the job of `maxNewProductionTasks` in `loadBudget.ts`.
- It does not differentiate by user — the gate is per-capability-type and per-`source_ref`, not per-learner-profile.

### 4.5 Morphology carve-out (`affixed_form_pair`)

Morphology capabilities (`source_kind = 'affixed_form_pair'`) have **no Phase 1+2 siblings** in the catalog — both `root_derived_recognition` and `root_derived_recall` are productive per the §3 taxonomy. Applying the staging gate to morphology would permanently orphan-suppress every morphology cap, because there is no receptive sibling that can ever satisfy the unlock condition.

The carve-out exempts `affixed_form_pair` from the staging gate. The sequencing within morphology is preserved by the existing **prerequisite chain** (`prerequisiteKeys` on the projection): `root_derived_recall` is gated behind a successful `root_derived_recognition`, enforced by the `missing_prerequisite` suppression rule at `pedagogy.ts:197-200`. The two mechanisms compose — staging gate handles receptive→productive (vocab/dialogue/grammar); prerequisite chain handles recognition→recall (morphology).

Implementation: a single `capability.sourceKind !== 'affixed_form_pair'` guard in the staging-gate condition (`pedagogy.ts`).

## 5. Rule B — Block interleave (composer post-pass)

**Where:** `src/lib/session-builder/compose.ts:compose`, inserted after the three append loops (line 105) and before `blocks.slice(0, input.limit)` (line 111).

**Algorithm (greedy single-pass):**

```
For i from 0 to blocks.length - 1:
  If any of blocks[i-3..i-1] (clamped to start) has the same sourceRef as blocks[i]:
    Find the smallest j > i where blocks[j].sourceRef differs from all of blocks[i-3..i-1].sourceRef
    If found: swap(blocks[i], blocks[j])
    Else: accept the violation (rare: end-of-queue or all-remaining-same-ref)
  Continue.
```

**Window size = 3.** With `preferredSessionSize = 25` and median ~4s/card, three intervening blocks ≈ 12s of intervening items — long enough to clear the prior answer from working memory, short enough to feel coherent.

**Determinism:** the algorithm walks left-to-right, picks the *smallest* valid swap target, and never re-orders previously-finalised positions. Same input → same output. (Required by the session-builder spec's determinism invariant — `session-builder.md:270`.)

### 5.1 Type changes

**No type changes required.** `ExerciseRenderPlan` already carries `sourceRef` (`exerciseRenderPlan.ts:6`), and the composer's `blocks` array only contains entries with a non-null `renderPlan` (resolution failures are turned into diagnostics and skipped at `compose.ts:53-54`, `:70-71`, `:92-93`). The interleave post-pass reads `block.renderPlan.sourceRef` directly.

- `DueSessionCapabilityInput`: no change.
- `EligibleNewSessionCapabilityInput`: no change.
- `SessionBlock` (`model.ts:22-31`): no change — `sourceRef` is already reachable via `block.renderPlan.sourceRef`.

### 5.2 Builder plumbing

**No `builder.ts` changes required.** All three composer-input construction sites already populate `renderPlan` (containing `sourceRef`) via `resolveCandidate` → `resolveExercise` → render-plan emission. The interleave operates on the finalised `blocks[]` array after compose's three append passes, so it inherits whatever the resolver produced.

### 5.3 What this rule does NOT do

- It does not deduplicate. Two blocks for the same `source_ref` both appear; they're just separated.
- It does not change which blocks enter the session — only their order.
- It does not change the three-pass order at a macro level (due → new → practice-review). The interleave is a local re-sort within the assembled queue.
- It does not interact with the `blocks.slice(0, limit)` cap — the cap still applies *after* interleave.

## 6. Expected impact on Albert's data

Re-running the rules against the 36-hour data, using the §3 phase taxonomy:

- **Session `e2202d55` (Lesson 2 activation):** the `apa kabar?` triple in 31 seconds becomes two events spaced ≥3 blocks apart (the Phase-1 `text_recognition` was already active and due; the Phase-3 `l1_to_id_choice` and Phase-2 `meaning_recall` were dormant — Phase 2 introduces normally, Phase 3 is gated out by Rule A until a sibling stabilises). The `air putih` double (both new-intros: Phase 3 + Phase 2) becomes one event — the Phase 2 `meaning_recall` introduces; the Phase 3 `l1_to_id_choice` is gated out.
- **Lesson-2 starvation:** Lesson 1 has 175 dormant caps for albert. Per `scripts/data/staging/lesson-1/capabilities.ts`, lesson 1's item-derived capabilities are emitted in a uniform 4-way split across the renderable types (`text_recognition`, `meaning_recall`, `l1_to_id_choice`, `form_recall`) — one of each per source_ref. So at the catalog level the four types are equi-numerous and **roughly 50% of the dormants are productive** (Phase 3 `l1_to_id_choice` + Phase 4 `form_recall`) and would be gated by Rule A. The actual proportion among albert's dormants is skewed by which caps activated first — text_recognition tends to activate earliest under the current input-order behaviour, so the dormant pool likely skews even more productive than 50%. Lesson 2 should therefore surface materially faster after activation; the exact factor depends on the active/dormant distribution at the moment of activation. The interleave (Rule B) does not affect lesson visibility; only Rule A does.
- **Lapses:** 19 lapses in 36h were on a mix of receptive + productive caps. Productive lapses on never-stabilised items should largely disappear (those caps won't enter the session in the first place). Receptive lapses are unaffected.

The biggest qualitative win is on Issue A (back-to-back same-word retrievals), which is addressed by both rules in combination. The Lesson-2 starvation issue is meaningfully but not completely addressed by Rule A; the residual ordering bias in the adapter is called out as a separate follow-up in §11.

## 7. Test coverage

### 7.1 Planner tests — `src/__tests__/pedagogyPlanner.test.ts`

| Scenario | Expected |
|---|---|
| Phase 4 candidate, no learner state at all | Suppress with `productive_capability_not_unlocked` |
| Phase 4 candidate, sibling exists but `activationState='dormant'` | Suppress |
| Phase 4 candidate, sibling active but `stability=0.5d` | Suppress (below 1d) |
| Phase 4 candidate, sibling active + `stability=1.0d` + `successfulReviewCount=0` | Suppress (no successful review) |
| Phase 4 candidate, sibling active + `stability=1.0d` + `successfulReviewCount=1` | Admit |
| Phase 3 candidate (`l1_to_id_choice`), unlocked sibling | Admit |
| Phase 1 candidate (`text_recognition`), no sibling state at all | Admit (rule doesn't apply to Phase ≤ 2) |
| Phase 2 candidate (`meaning_recall`), no sibling state at all | Admit |
| Phase 4 candidate, *no* sibling exists at all (orphan productive cap) | Suppress |

### 7.2 Composer tests — new `src/lib/session-builder/__tests__/compose.test.ts`

| Scenario | Expected |
|---|---|
| No repeats | No-op; order preserved |
| Same sourceRef at positions 0 and 1 | Swap position 1 with the next different-ref block |
| Same sourceRef at positions 0 and 3 (gap = 3) | No swap (window is "preceding 3," position 3 looks back at 0,1,2 — 0 is in window) |
| Same sourceRef at positions 0 and 4 (gap = 4) | No swap (window cleared) |
| Three blocks with same sourceRef, ten blocks total | All spaced ≥3 apart after interleave |
| All blocks share the same sourceRef | Accept violation, no infinite loop |
| Determinism: same input twice → same output | Equality |
| `lesson_practice` mode: 6 active caps for one `source_ref` in practice-review pass | Interleave spreads them maximally; accept violations only at end-of-queue once same-ref blocks dominate the tail |

### 7.3 Integration

`capabilitySessionLoader.test.ts` should grow one scenario: a session with a Phase-1 due cap + a Phase-4 new cap for the same item produces blocks in interleaved order (or only one block if Rule A suppresses the Phase 4).

## 8. Supabase Requirements

### Schema changes
- N/A — no schema changes. `stability` column already exists on `learner_capability_state` (per `learner_capability_state` describe output). `sourceRef` already exists on `learning_capabilities` (`source_ref` column).

### homelab-configs changes
- [ ] PostgREST: N/A
- [ ] Kong: N/A
- [ ] GoTrue: N/A
- [ ] Storage: N/A

### Health check additions
- N/A — purely planner/composer logic; no new DB-visible invariants.

### Migration tooling
- `make migrate` — **not needed.** No `scripts/migration.sql` change.
- `make migrate-idempotent-check` — **not needed.** No SQL delta to idempotency-test.
- `make pre-deploy` — recommended (lint + test + build + supabase tier 1 + tier 2) as a final gauntlet, but no new SQL is being applied.

## 9. Migration considerations

- **Existing learners with productive caps already active:** unaffected. The gate operates on first-time introductions only (caps in dormant state). Caps that became active under the prior rules stay active.
- **Existing learners mid-session:** the in-flight session was already built; the change takes effect on the *next* `buildSession` call.
- **Rollback:** revert the PR. No data state changes; the planner and composer go back to the prior behaviour. No data needs reconciling.

## 10. Tuning levers

All thresholds are constants in `pedagogy.ts` / `compose.ts`:

- **Stability threshold (`>= 1d`)** — primary lever. Raise to `>= 2d` if productive caps still feel too early. Lower toward `>= 0.5d` if onboarding feels slow.
- **`successfulReviewCount >= 1`** — could raise to `>= 2` for stricter staging.
- **Interleave window (`3`)** — raise to 5 for more spacing. Lower to 2 for tighter sessions.
- **Phase boundary** — `l1_to_id_choice` could be demoted to a softer gate (count-only, no stability) if MCQ-from-L1 feels over-gated; needs a UX signal first.

### 10.1 Future: retrievability-based gating

A retrievability-aware alternative to the stability threshold would be "retrievability >= 0.7 at session.now," using the FSRS forgetting curve. Retrievability is computed server-side in the answer-commit Edge Function (`supabase/functions/commit-capability-answer-report/index.ts`) but is not projected through `LearnerCapabilityStateRow` (`capabilityScheduler.ts:12-19` carries `stability`, `difficulty`, `lastReviewedAt` but not `retrievability`). Switching the gate would require either (a) projecting `retrievability` through the adapter, or (b) recomputing it client-side from `stability + lastReviewedAt + now`. Either is feasible but out of scope for this PR — `stability >= 1d` is the pragmatic first cut.

None of these are exposed in UI. Tune from review-event aggregates over weeks.

## 11. Out of scope

- A "production drills" mode that disables the gate explicitly.
- Per-learner tuning of the staging threshold.
- Migrating existing already-active productive caps backward into dormant state.
- Changing `isNewProductionTask` (`pedagogy.ts:100-107`) — it remains a separate load-budget cap.
- Rebalancing `daily_new_items_limit` (`profiles` column, currently unused — separate concern).
- Surfacing the staging diagnostic ("locked until you stabilise this word") to the learner. The suppression reason is captured in `suppressedCapabilities[]` for telemetry; UI exposure is a follow-up.
- **Queue-drying detector interaction.** `builder.ts:347-349` computes `currentLessonHasEligibleIntroductions` from `learningPlan.eligibleNewCapabilities`. After Rule A, when a learner exhausts the receptive caps for the current lesson, productive caps remain gated waiting on stability — `currentLessonHasEligibleIntroductions` flips false, and the drying detector may fire a "learning_pipeline_drying_up" diagnostic that's technically true but misleading (the lesson isn't drying; productive caps will unlock on the next session). Documented decision: **accept this for now.** The diagnostic only fires when the next lesson is unactivated AND the pool is below the suppression threshold (`drying.ts`), so the misfire is narrow. A follow-up could differentiate `drying_due_to_staging` from `drying_due_to_exhausted_catalog`, but it requires a new diagnostic reason and copy and is not load-bearing for this PR's success criteria.
- **Adapter input ordering.** The Lesson-2 starvation issue identified in §6 is only partially addressed by Rule A — the primary mechanic (adapter returns `readyCapabilities` without an `ORDER BY` per `adapter.ts:262-268`, so input-order favors earlier-created caps) is unchanged. A separate PR would either `ORDER BY (lesson activation date DESC, created_at)` in the adapter or round-robin by `lessonId` in the planner. Not part of this work.

## 12. References

- `docs/current-system/modules/session-builder.md` — module spec (will be updated as part of this work)
- `docs/adr/0001-capability-based-learning-core.md`
- `docs/adr/0003-fsrs-schedules-capabilities-not-content-sources.md`
- `docs/adr/0006-extend-lesson-id-to-all-capabilities.md`
- 2026-05-18 36h usage review (conversation; not archived)
