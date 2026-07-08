---
module: session-builder
surface: src/lib/session-builder/
last_verified_against_code: 2026-07-08
status: stable
---

# Session builder

**Surface:** `src/lib/session-builder/`

**Files (13):**

| File | LOC | Role |
|---|---|---|
| `adapter.ts` | 416 | Supabase reads — projects to planner/composer types. Also derives `currentLessonId` + `nextLessonNeedsExposure` for the drying detector. Exports `sessionBuilderAdapter` + `createSessionBuilderAdapter(client?)`. Since 2026-05-22 also exposes `loadForceCapabilitySnapshot(canonicalKey, userId)` for the `?force_capability` dev bypass (PR 0 §3.8) and throws `CapabilityNotFoundError` (defined here) when the key does not resolve. |
| `builder.ts` | 486 | Orchestrator. Runs three selection passes, calls `resolveCandidate`, builds the queue-drying diagnostic, composes the plan. Exports `buildSession` + the test-only `loadCapabilitySessionPlan`. Since 2026-05-22 also exports `buildForceCapabilitySession({...})` — invoked by `buildSession` when `forceCapabilityKey` is set; bypasses the planner and emits a one-card session against the named capability. |
| `compose.ts` | ~175 | Packs candidate triples into `SessionBlock`s; emits diagnostics on resolution failure. Exports `compose`. Also hosts the **grammar due-floor** (`reserveGrammarDueFloor` + the tunable `GRAMMAR_DUE_FLOOR_FRACTION = 0.2`), a pure family-aware selection over the overdue-ordered due list — see §3.2 / §4 (added 2026-07-06, `docs/plans/2026-07-05-grammar-exposure-session-quota-design.md`). |
| `model.ts` | ~68 | Types + the shared `capabilityFamily`/`CapabilityFamily` axis (moved here from `pedagogy.ts` 2026-07-06 so both the planner round-robin and the composer due-floor read it without a sideways import). Also `SessionMode`, `SessionPlan`, `SessionBlock`, `SessionDiagnostic`, `CapabilityReviewSessionContext`. |
| `pedagogy.ts` | ~470 | New-introduction planner: `gate` (suppression-rule engine) → `prioritize` (lesson-major + within-lesson family round-robin) → `allocate` (budget fill). Exports `planLearningPath` + the pure, test-exposed `prioritizeCandidates` and `capabilityFamily`. |
| `loadBudget.ts` | 53 | Per-mode budget rules. Three branches (`lesson_review`, `lesson_practice`, default `standard`). Exports `decideLoadBudget`. |
| `labels.ts` | 66 | Per-capability display copy + exercise/skill helpers. Exports `capabilityDisplay`, `exerciseLabel`, `skillLabel`, `CAPABILITY_DISPLAY`. |
| `audibleTexts.ts` | 104 | Audible-text harvest — `audibleTextFieldsOf` (per builder) + `collectAudibleTexts` (aggregator). |
| `drying.ts` | 42 | Queue-drying detector. Wired into the builder in PR-B (2026-05-16). Suppresses when the due backlog exceeds preferred size or the mode is lesson-scoped; otherwise fires when the current lesson has no eligible introductions, the next lesson is still inactive, and the candidate pool is below 70% of preferred size. |
| `dueFilter.ts` | ~110 | Date+flag filter over `LearnerCapabilityStateRow[]` — `getDueCapabilitiesFromRows` (pure) + `getDueCapabilities` (async wrapper over `CapabilitySchedulerReadAdapter`). FSRS math lives server-side per ADR 0003; this file just reads the persisted `next_due_at` plus the activation / readiness / publication flags. **Ordering (2026-06-25):** due rows are bucketed by whole-days-overdue (`floor((now − next_due_at)/24h)`), most-overdue bucket first, then **Fisher-Yates shuffled within each bucket** before the limit slice. Production passes no `random` so it uses `Math.random` (fresh order every build); tests inject `random` for determinism. This breaks the self-perpetuating alphabetical order a strict `next_due_at` sort produced (same-grade cards get identical FSRS intervals, so `next_due_at` preserved their alphabetical introduction sequence and replayed it every session). Folded out of `lib/capabilities/` 2026-05-20 — the file's only consumer is this module (`builder.ts`, `adapter.ts`). |
| `siblingBury.ts` | ~55 | Pure `buryThinSiblings(candidates, sourceRefOf, usedRefs)` (kept survivors) + `partitionBuried(...)` (returns `{ kept, buried }` so the planner can record buried as `sibling_buried`). Keeps the first candidate per `source_ref`, drops the rest, mutating/threading `usedRefs` across passes. The in-memory enforcement of one-capability-per-word-per-day. Added 2026-06-09 (`docs/plans/2026-06-09-sibling-burying-design.md`); `partitionBuried` + before-allocate move 2026-06-09 (`docs/plans/2026-06-09-sibling-bury-before-allocate-fix.md`). |
| `knownWordCoverage.ts` | 95 | Sentence-comprehensibility gate. **Not yet wired** — survives as documentation per fold plan §10. |
| `index.ts` | 19 | Public-API barrel. |

**Consumers (production):**
- `src/pages/Session.tsx:11-17, 99` — sole runtime caller. Imports `buildSession`, `collectAudibleTexts`, `sessionBuilderAdapter`, and the `SessionMode`/`SessionPlan` types from `@/lib/session-builder`.
- `src/components/experience/{ExperiencePlayer,CapabilityExerciseFrame,buildFeedbackInput,types,RecapScreen}.tsx` — consume `SessionPlan`/`SessionBlock` via the barrel.
- `src/components/experience/RecapScreen.tsx:3, 95` — consumes `capabilityDisplay(...).label` for the recap headline.
- 12 files under `src/lib/exercises/builders/` — consume `audibleTextFieldsOf` via the barrel.
- `src/services/capabilityContentService.ts:10` — imports `SessionBlock` from the barrel.

**Status (2026-05-22):** stable. Spec rewritten 2026-05-16 as the after-spec of PR-A of the session-builder fold (commit `55edbf5`). PR-A consolidated nine files from `src/lib/session/`, `src/lib/pedagogy/`, and `src/services/capabilitySessionDataService.ts` into this module; deleted three orphaned modules + the entire posture system + two dead planner inputs; rewrote `labels.ts` to a per-capability map with `satisfies` exhaustiveness. PR-B (queue-drying wiring) and PR-C/D (recency badge, capability descriptions) ride in separate follow-on PRs — see fold plan §5.

**2026-05-22 — force-capability dev bypass (PR 0 §3.8).** `buildSession` now accepts an optional `forceCapabilityKey` arg; when set, it routes through `buildForceCapabilitySession` instead of the planner. `adapter.ts` resolves the canonical_key → capability + readiness, and seeds a dormant `learner_capability_state` row idempotently on first hit. Used by `src/pages/Session.tsx` (admin-gated via `profile.isAdmin` + `import.meta.env.DEV || VITE_ALLOW_FORCE_CAPABILITY`) and by `scripts/force-capability-answer.ts` (per-PR post-deploy gate). Plus `toProjectedCapability` reads the typed column `prerequisite_keys` (the `required_artifacts` column it also read was dropped in Slice 4b, #102; `requiredArtifacts` now defaults to `[]`); `skillType` is derived via `deriveSkillTypeFromCapabilityType` from `capabilityTypes.ts`.

---

## 1. Purpose

Given a learner and a session mode, return a `SessionPlan` — an ordered list of `SessionBlock` rows the player renders one card at a time. Each block carries the inflated `ExerciseRenderPlan` needed to render the card plus the `reviewContext` needed to commit an answer.

**Pure read.** No DB writes. No identity minted by the builder itself (`Session.tsx:90` mints `sessionId` upstream via `crypto.randomUUID()`). No side effects.

**Deterministic.** Two calls with identical inputs and identical learner state produce identical output. Implication: the builder is a *query*, not a generator; it can be called as many times as needed.

---

## 2. Public interface

Sole runtime entry point — `builder.ts:341-381`:

```typescript
export async function buildSession(input: {
  enabled: boolean
  sessionId: string
  userId: string
  mode: SessionMode
  now: Date
  limit: number
  preferredSessionSize: number
  selectedLessonId?: string
  selectedSourceRefs?: string[]
  adapter: CapabilitySessionDataAdapter
}): Promise<SessionPlan>
```

The `enabled` flag is a hard gate (`builder.ts:200-202, 353-355`) — throws if false. There is no on/off product surface; it is always true at the only call site (`Session.tsx:100`). Slimmer-API work (drop `enabled`, `sessionId`, `limit`, `preferredSessionSize`, `adapter`) is deferred to the exercise-content fold — see §7.

`SessionMode` — `model.ts:5`:

```typescript
type SessionMode = 'standard' | 'lesson_practice' | 'lesson_review'
```

`SessionPlan` — `model.ts:39-46`:

```typescript
interface SessionPlan {
  id: string
  mode: SessionMode
  title: string
  blocks: SessionBlock[]
  recapPolicy: 'standard'
  diagnostics: SessionDiagnostic[]
}
```

`SessionBlock` — `model.ts:22-31`:

```typescript
interface SessionBlock {
  id: string                              // `${sessionId}:due:${canonicalKey}` etc.
  kind: 'due_review' | 'new_introduction'
  renderPlan: ExerciseRenderPlan          // baked in at planning time
  capabilityId: string
  canonicalKeySnapshot: string
  stateVersion?: number
  reviewContext: CapabilityReviewSessionContext
  pendingActivation?: PendingActivationSessionItem
}
```

The block carries the already-resolved `renderPlan`. **This differs from the target architecture** (`docs/target-architecture.md:1526`), which specifies an abstract `{ capabilityId, exerciseType }` with resolution delegated to `lib/exercise-content/`. The boundary shift is owned by the next fold (exercise-content), not this one — see §7.

Internal entry points also exported from `builder.ts:168-339`:

- `loadCapabilitySessionPlan(input)` (`builder.ts:199-339`) — same logic but accepts a pre-loaded `CapabilitySessionDataSnapshot` instead of fetching it. Used by tests.
- `resolveCandidate(meta, ctx)` (`builder.ts:168-197`) — the shared resolver helper called by all three passes. Used by `__tests__/resolveCandidate.test.ts`.

The adapter contract — `builder.ts:48-50`:

```typescript
interface CapabilitySessionDataAdapter extends CapabilitySchedulerReadAdapter {
  loadCapabilitySessionData(request: CapabilitySessionDataRequest): Promise<CapabilitySessionDataSnapshot>
}
```

The production implementation lives at `adapter.ts:201-310`.

---

## 3. Internal flow

### 3.1 Adapter — one `get_session_build_data` RPC call

`adapter.ts`. On each invocation, `loadCapabilitySessionData` makes **one** call to
`indonesian.get_session_build_data(p_user_id, p_mode, p_selected_source_refs,
p_day_start)` (SECURITY INVOKER, `migration.sql`; spec:
`docs/plans/2026-07-02-session-data-narrowing-rpc.md`). The RPC returns a single
`jsonb` object (scalar → structurally immune to `PGRST_DB_MAX_ROWS` row truncation)
carrying six pieces the adapter previously fetched as six parallel queries
(historically documented here as "five reads" — the sixth, activated
collection/harvest member refs via `resolveActivatedMemberRefs`, was added 2026-06-13
and never reflected; both counts are now historical):

1. **`capabilities`** — ready+published+non-retired rows **narrowed server-side** to the
   sufficiency predicate (clauses A–E: has-a-state-row ∪ activated-lesson ∪
   activated-collection/harvest ref ∪ podcast null-`lesson_id` ∪ scoped source_refs).
   Payload scales with the learner's activated surface, not the catalog.
2. **`learner_states`** — ALL of the user's `learner_capability_state` rows,
   unconditionally (clause A — due caps ignore activation; prerequisite satisfaction
   reads state rows only).
3. **`activated_lesson_ids`** — the user's `learner_lesson_activation` rows.
4. **`lessons`** — every `lessons` row (`id`, `order_index`) for
   `deriveLessonProgression` (small catalog).
5. **`reviewed_today_capability_ids`** — review events since `p_day_start` (the
   **browser-local** midnight the adapter computes from `request.now` —
   server-side `now()` would drift the sibling-bury day boundary).
6. **`activated_member_refs`** — collections ∪ reading-harvest member refs in the
   `learning_items/<normalized_text>` form, mirroring
   `lib/collections/membership.resolveActivatedMemberRefs` (ADR-0015 mirrored
   predicate; guarded by the two-layer parity tests + live HC40).

Sufficiency proof (why the narrowed catalog cannot change the SessionPlan): the spec's
consumer→fields table; guards: `scripts/__tests__/session-build-data-rpc-migration.test.ts`
(structural), `src/lib/session-builder/__tests__/rpcSnapshotParity.test.ts` (semantic),
HC40 in `check-supabase-deep.ts` (live RPC-vs-planner recompute).

(Historical: Slice 4b, #102 removed the `capability_artifacts` read; 2026-07-02 the
whole fan-out was replaced by this RPC.)

The adapter then:
- Builds `capabilitiesByKey: Map<string, ProjectedCapability>` and `readinessByKey: Map<string, CapabilityReadiness>` via `validateCapability`. Capabilities with incomplete metadata are recorded with `readinessByKey.set(key, { status: 'unknown', ... })` and skipped from `readyCapabilities`.
- Computes `dueCount` via `getDueCapabilitiesFromRows` (a flat date filter — no FSRS math; FSRS lives server-side per ADR 0003).
- Computes `recentFailures` from rows with `consecutiveFailureCount ≥ 2`.
- Derives `currentLessonId` (the activated lesson with the highest `order_index`, or `null` if no activations) and `nextLessonNeedsExposure` (true iff a lesson with `order_index = current.order_index + 1` exists and is not activated). Both feed the drying detector in §3.8.

Output is a `CapabilitySessionDataSnapshot` carrying `schedulerRows`, `capabilitiesByKey`, `readinessByKey`, `currentLessonId`, `nextLessonNeedsExposure`, and `plannerInput` (typed `Omit<PedagogyInput, 'mode' | 'now'>`). (Slice 4b removed the `artifactIndex` field.)

### 3.2 Orchestrator — three selection passes through one resolver

`builder.ts:199-339`. After the adapter snapshot is loaded:

**Step A — lesson-scope validation** (`builder.ts:92-105, 204-211`). For `lesson_practice` / `lesson_review` modes, both `selectedLessonId` and `selectedSourceRefs[]` must be present and non-empty. If not, a `SessionPlan` with a single `critical` diagnostic (`missing_selected_lesson`) is returned immediately. No further work happens.

**Step B — pass 1: due capabilities** (`builder.ts`). `getDueCapabilities` (`dueFilter.ts`) is called with `limit = MAX_SAFE_INTEGER` to get the **full** overdue-ordered due list (the projection stays family-agnostic — it migrates to `lib/analytics/upcoming/` per the target). In **standard** mode the builder then applies `reserveGrammarDueFloor(orderedDue, limit, familyOf)` (`compose.ts`) — guaranteeing grammar family up to `floor(limit * GRAMMAR_DUE_FLOOR_FRACTION)` of the due slots before the size cut, so grammar isn't drowned by the vocab-majority due pool (grammar was ~6% of the owner's reviews, 2026-07-05 audit). Lesson-scoped modes keep the exact legacy top-N cut. `familyOf` resolves family from the loaded `capabilitiesByKey` snapshot — family knowledge never enters the due projection. Result is filtered to lesson scope when applicable, then each due item is resolved via the shared `resolveCandidate` helper.

**Step C — pass 2: lesson-scope practice reviews** (`builder.ts:264-303`). Only fires for `lesson_practice` / `lesson_review`. Filters `schedulerRows` to rows that are: active + ready + published + in lesson scope + **not** in the due set + (for `lesson_review`) have at least one prior review. Sorted by `nextDueAt` ascending, then `consecutiveFailureCount` descending. Same `resolveCandidate` helper.

**Step D — pass 3: new introductions** (`builder.ts:305-329`). Calls `planLearningPath(plannerInput)` (`pedagogy.ts:149-251`). Result is the suppression-filtered + budget-limited list of eligible new capabilities. Mode `lesson_review` produces empty. Same `resolveCandidate` helper; each item carries an `activationRequest: { reason: 'eligible_new_capability' }` so the review processor knows to mint the FSRS state row on first answer.

**Step E — queue-drying check** (`builder.ts`, post-PR-B). Once due + new pass outputs are known, the builder calls `buildQueueDryingDiagnostic` with `dueCount + eligibleNewCapabilities.length` as the candidate pool and the snapshot's `currentLessonId` / `nextLessonNeedsExposure`. `currentLessonHasEligibleIntroductions` is computed precisely from `learningPlan.eligibleNewCapabilities.some(e => e.capability.lessonId === currentLessonId)`. If the detector returns a diagnostic, the builder appends it to the `compose` input as `diagnostics: [dryingDiagnostic]`.

**Step F — compose**. All three pass outputs + the drying diagnostic (if any) hand to `compose`.

**Sibling burying (2026-06-09; new-intro position corrected same day).** One capability per `source_ref` per build, threaded through the passes in priority order (due → practice → new) via a single mutable `usedRefs` set seeded with the adapter's `reviewedTodayRefs`. The **due** and **practice** passes bury in the builder (`buryThinSiblings`, `builder.ts`), each mutating `usedRefs`. The **new-introduction** bury runs **inside `planLearningPath`** (`partitionBuried`, between `prioritizeCandidates` and `allocateBudget`) — the builder passes the post-due/post-practice accumulated `usedRefs` into the planner as `PedagogyInput.usedSourceRefs`. The most-overdue due sibling wins a word's single daily slot — at **day granularity**: a sibling in an older overdue bucket beats one in a fresher bucket, but two siblings due within the same 24h bucket are shuffled, so which of *those* survives is random (negligible — they differ by <24h of overdue-ness; see `dueFilter.ts` ordering). Among introductions the highest-priority sibling of a *not-today* word survives, and buried caps are recorded as `suppressedCapabilities` (reason `sibling_buried`).

**C1 affix production fast-path exemption (2026-07-08).** Within the new-introduction bury only, `planLearningPath` first partitions `prioritized` into exempt candidates (`ctx.mode === 'affix_practice' && capability.capabilityType === 'produce_derived_form_cap'`) and the rest; only the rest runs through `partitionBuried`, and the exempt candidates are recombined afterward (filtered back in by membership against `prioritized` to preserve order) — `siblingBury.ts` itself is untouched, so the due/practice passes' `buryThinSiblings` calls keep full bury semantics. Rationale: a learner who answers a `recognise_word_form_link_cap` correctly and immediately drills another round of the same affix should reach the matching `produce_derived_form_cap` the SAME day — that is the trainer's drill semantics, not a violation of the per-word rule. The prereq ladder is untouched: the produce cap's `prerequisiteKeys` still require the recognise sibling to be `active` with ≥1 successful review (persisted state from the prior round's atomic commit, ADR 0004) before it gate-passes at all. `recognise_word_form_link_cap` (the sibling type) is deliberately NOT exempt and stays fully subject to burying. See `docs/plans/2026-07-08-affix-production-fastpath.md`.

**Why the new-intro bury is before budget allocation, not after.** It must run *before* `allocateBudget` so the freed slots refill from the next-ranked non-buried words and the session reaches `preferredSessionSize`. The original code buried the *post-budget* eligible list (`builder.ts:344`), which only shrank it — when the top-N were all today's-word siblings the session collapsed to **zero** despite hundreds of eligible new words below the cutoff (live "no cards" bug, user 7eaacda5, 2026-06-09). **Session-size is the contract; burying chooses *which* caps fill it, never *whether*.** The due bury still runs before `dueCount` feeds the planner, so a buried due sibling raises `openSlots` for a different word. See `docs/plans/2026-06-09-sibling-bury-before-allocate-fix.md`.

The three passes share the resolver loop via `resolveCandidate`. It accepts the caller's `meta` object verbatim and returns either `{ meta, reviewContext, renderPlan }` (resolved) or `{ meta, reviewContext, resolutionFailure }` (failed). The dedup is the load-bearing detail of the §3.1 fold cleanup — see `__tests__/resolveCandidate.test.ts` for the contract.

### 3.3 Planner — gate → prioritize → allocate

`pedagogy.ts:planLearningPath`. A thin orchestrator composing three module-internal pure stages
(restored 2026-06-07, issue #166/#125 — see `docs/plans/2026-06-07-lesson-priority-candidate-ordering-design.md`):

```
gate(readyCapabilities, ctx)      → { gatePassing, suppressed }   // suppression-rule engine
→ prioritize(gatePassing)         → ordered candidates           // the restored ordering policy
→ allocate(prioritized, budget)   → { eligible, suppressed }     // budget fill
```

**Stage 1 — `gate`** (`pedagogy.ts:gateCandidates`). The suppression-rule engine. Walks candidates
in input order and partitions them into gate-passing vs suppressed-with-reason. It decides
*eligibility only* — not order, not budget. Rules, in exact order:

| Rule | Reason emitted | Effect |
|---|---|---|
| `readinessStatus !== 'ready'` | `capability_not_ready` | Skip |
| `publicationStatus !== 'published'` | `capability_not_published` | Skip |
| Lesson-scope mismatch (lesson_practice/lesson_review) | `wrong_session_mode` | Skip |
| State exists and not dormant | `already_active_or_retired` | Skip |
| Any prerequisite key not in `satisfiedKeys` | `missing_prerequisite` | Skip |
| Recent failure fatigue (≥2 consec failures, ≤1h ago) | `recent_failure_fatigue` | Skip |
| Phase ≥ 3 capability with no stable receptive sibling for the same `source_ref` (except `affixed_form_pair`, `dialogue_line`, `pattern` — exempt; see staging-gate carve-outs) | `productive_capability_not_unlocked` | Skip |
| Source kind = `podcast_phrase` | `wrong_session_mode` | Skip (no live podcast mode) |
| Lesson not activated | `lesson_not_activated` | Skip |

(The `pattern` carve-out was added 2026-06-07, commit `1e5be88` — its "inert at runtime" premise
expired when Slice 2 made grammar renderable; #166.)

**Stage 2 — `prioritize`** (`pedagogy.ts:prioritizeCandidates`, exported pure). Orders gate-passing
candidates by `(lessonOrder ASC, rankWithinLessonFamily ASC, FAMILY_TIEBREAK, canonicalKey)`.
Lesson-major delivers **soft lesson priority** (lower lessons introduced first; a lesson with no
gate-passing candidate simply contributes nothing, so the next lesson becomes lowest available —
soft-spill, no stall). The within-lesson **family round-robin** (family keyed on `source_kind`
via `capabilityFamily`: item→vocab, dialogue_line→cloze, pattern→grammar, affixed_form_pair→
morphology, podcast→podcast) interleaves the scarce grammar/cloze families with the ~50:1 vocab
majority instead of trailing it. Deterministic — rank is assigned by `canonicalKey` within each
`(lessonOrder, family)` group, so output is independent of DB row order. Distinct from the
composer's `interleaveBySourceRef` (§3.5): `prioritize` governs *which* caps win budget slots;
the composer spaces the *already-selected* blocks.

**Stage 3 — `allocate`** (`pedagogy.ts:allocateBudget`). Fills the load budget from the prioritized
list, applying the per-type ceilings (unchanged math). Overflow → `load_budget_exhausted`, in
prioritized order:

| Budget rule | Reason emitted |
|---|---|
| Over `maxNewCapabilities` (or `!allowNewCapabilities`) | `load_budget_exhausted` |
| Over `maxNewPatterns` (pattern caps) | `load_budget_exhausted` |
| Over `maxNewProductionTasks` | `load_budget_exhausted` |
| Over `maxHiddenAudioTasks` | `load_budget_exhausted` |

`planLearningPath` merges the gate + allocate suppression lists and returns the `LearningPlan`.

**Removed in the fold** (deleted suppression rules + their inputs, per §2.3 of the fold plan):
- `difficulty_jump` rule + `maxNewDifficultyLevel` input.
- `not_useful_for_current_path` rule + `activeGoalTags` input.

**Staging-gate phase taxonomy** (`pedagogy.ts:capabilityPhase`): the rule above gates Phase 3+4 capabilities behind their Phase 1+2 siblings. Mapping from `CapabilityType` to phase:

| Phase | Cognitive process | Capability types |
|---|---|---|
| 1 (receptive recognition) | input → "I know this" | `text_recognition`, `audio_recognition`, `podcast_gist` |
| 2 (receptive recall) | input → produce L1 meaning | `meaning_recall` |
| 3 (productive recognition) | L1 / cue → choose from options | `l1_to_id_choice`, `pattern_contrast` |
| 4 (productive recall) | L1 / cue → produce ID from memory | `form_recall`, `contextual_cloze`, `dictation`, `root_derived_recognition`, `root_derived_recall`, `pattern_recognition` |

Conservative-classification rationale (types that can render as both MCQ and free-recall are placed at Phase 4): see `docs/plans/2026-05-18-capability-staging-gate.md` §3.1. The `affixed_form_pair` carve-out (§4.5 of that plan) exempts morphology from this gate; the prerequisite chain remains the within-pattern sequencing mechanism for morphology.

Allocated candidates become `eligibleNewCapabilities[]` (in prioritized order) with
`activationRecommendation`; everything suppressed by either `gate` or `allocate` is merged into
`suppressedCapabilities[]` for diagnostics. Return shape — `LearningPlan`:

```typescript
interface LearningPlan {
  eligibleNewCapabilities: EligibleCapability[]
  suppressedCapabilities: SuppressedCapability[]
  loadBudget: LoadBudgetDecision
  reasons: PlannerReason[]
}
```

### 3.4 Budgets

`loadBudget.ts:22-53`. Three branches, in evaluation order:

1. `lesson_review` mode → 0 of everything new. `targetSessionSize = preferredSessionSize`.
2. `lesson_practice` mode → `openSlots = max(0, preferredSessionSize - dueCount)` new capabilities. No pattern/production quotas (open slots applies to all). `maxHiddenAudioTasks = preferredSessionSize` (effectively unlimited).
3. Default (standard) → `openSlots = max(0, preferredSessionSize - dueCount)`. Every `maxNew*` field (`maxNewCapabilities`, `maxNewPatterns`, `maxNewConcepts`, `maxNewProductionTasks`) is set to `openSlots`, so the planner can fill every open slot with new caps when the eligible pool can supply them. `maxHiddenAudioTasks = targetSessionSize`. `maxSourceSwitches = 1` (lesson_practice uses 0 — the two modes have different scoping rules). The previous formula capped `maxNewCapabilities` at `min(openSlots, max(1, floor(targetSessionSize * 0.25)))` and the per-type fields at `1`; that historical cap was retired by `docs/plans/2026-05-17-honor-profile-session-size.md` so the learner's `preferredSessionSize` is honoured.

**Removed in the fold** (the unreachable posture/future-mode branches): `comeback`, `review_first`, `light_recovery`, `balanced` postures; `pattern_workshop` and `podcast` modes. None had a runtime caller; their removal eliminated 70+ LOC of dead code.

### 3.5 Composer — pack and cap

`compose.ts:48-115`. Three sequential passes over the three input lists (due → new → practice-review). For each candidate:

- If `renderPlan` is missing (i.e. the resolver returned a failure), append a `warn` diagnostic and skip the block.
- Otherwise, push a `SessionBlock` with `id = \`${sessionId}:<kind>:${canonicalKey}\`` (`compose.ts:58, 75, 97`).

After all three passes, an **interleave post-pass** (`compose.ts:interleaveBySourceRef`, added 2026-05-18) walks the assembled blocks left-to-right. At each position `i`, if any of the preceding `INTERLEAVE_WINDOW = 3` blocks share the same `block.renderPlan.sourceRef`, the algorithm finds the nearest later block with a non-conflicting `sourceRef` and swaps. Violations are accepted at end-of-queue (no swap target available) and when all remaining blocks share a `sourceRef`. Greedy single-pass, deterministic — same input yields same output. Macro three-pass order (due → new → practice-review) is preserved because the interleave only does local swaps.

After the interleave, `blocks.slice(0, input.limit)` caps the session at the requested size (`compose.ts:111`). Diagnostics preserve their order.

`SessionPlan.title` is hard-coded `'Dagelijkse Indonesische oefening'` (`compose.ts:110`). `SessionPlan.recapPolicy` is always `'standard'`.

### 3.6 Audible-text harvest

`audibleTexts.ts:31-104`. Two-tier design:

- **Per-builder** (`audibleTextFieldsOf`, `audibleTexts.ts:31-90`) — given a single inflated `ExerciseItem`, returns every Indonesian-language text field on it (base text, contexts, cloze sentence, MCQ options, sentence-transformation source + answers, constrained-translation target, speaking utterance). Normalised via `normalizeTtsText`. Used by all 12 exercise builders.
- **Session aggregator** (`collectAudibleTexts`, `audibleTexts.ts:97-104`) — given the resolved `CapabilityRenderContext` map, unions every per-block `audibleTexts[]` into a single deduped array. Used by `Session.tsx:124` before calling `fetchSessionAudioMap`.

### 3.7 Labels (per-capability display copy)

`labels.ts:1-117`. Exports a single `CAPABILITY_DISPLAY: Record<CapabilityType, CapabilityDisplay>` map (`labels.ts:20-79`) with one entry per `CapabilityType`. The `as const satisfies Record<CapabilityType, CapabilityDisplay>` assertion (line 79) makes the map exhaustive — a new `CapabilityType` added in `capabilityTypes.ts` will fail compilation here until it gets an entry. The runtime `CAPABILITY_TYPES` array (`capabilityTypes.ts:46-59`) is the iteration target for code that needs to walk every capability type.

`CapabilityDisplay` shape:

```typescript
interface CapabilityDisplay {
  label: string                 // short, e.g. "Betekenis herkennen"
  description: string           // 1 sentence, action-oriented, second person
  example?: string              // e.g. "makan → eten" — optional
}
```

All 12 descriptions and most examples authored in PR-D (`feat(session-builder): capability descriptions (PR-D)`, c19a9d4); the snapshot test at `__tests__/labels.test.ts` guards non-empty fields, no-placeholder strings, exactly one sentence per description with no semicolons.

`capabilityDisplay(type)` returns the entry; `exerciseLabel(type)` and `skillLabel(type)` remain available for narrower lookups. `RecapScreen.tsx:95` uses `capabilityDisplay(b.renderPlan.capabilityType).label` for the recap headline (the prior `exerciseLabel(b.renderPlan.exerciseType)` was a deliberate UX swap — the headline now answers *what skill* not *what UI shape*).

### 3.8 Drying detector (wired in PR-B)

`drying.ts`. Builds a `SessionDiagnostic` warning learners when the queue is dry but the next lesson still needs activation. Suppression rules, in order:

| Rule | Effect |
|---|---|
| `dueCount > preferredSessionSize` | Suppress (backlog explains the short session) |
| `mode !== 'standard'` | Suppress (lesson-scoped modes are intentionally narrow) |
| `currentLessonHasEligibleIntroductions` | Suppress (the planner can still emit material from the current lesson) |
| `!nextLessonNeedsExposure` | Suppress (the next lesson is already active, or there is no next lesson) |
| `goodCandidateCount ≥ preferredSize * 0.7` | Suppress (the candidate pool is still substantial) |
| Otherwise | Fire with `reason='learning_pipeline_drying_up'`, `details='session.pipelineDryingUp'` |

The `currentLessonHasEligibleIntroductions` flag is computed in `builder.ts` from the planner's output (`learningPlan.eligibleNewCapabilities`) rather than approximated in the adapter. This is precise: it counts only capabilities the planner is *willing to surface*, not all dormant ones in the current lesson.

The two adapter-derived inputs (`currentLessonId`, `nextLessonNeedsExposure`) default to `null` / `false` when the learner has no activations or has reached the final lesson — in both cases the detector's `!nextLessonNeedsExposure` rule suppresses the warning. See `adapter.ts:deriveLessonProgression`.

The diagnostic surfaces in the UI via `Session.tsx`, which reads `plan.diagnostics.find(d => d.reason === 'learning_pipeline_drying_up')` and renders a dismissible Mantine `<Alert color="blue">` above the player using the Dutch copy from `src/lib/i18n.ts:217` (`session.pipelineDryingUp`).

---

## 4. Invariants

- **No DB writes from the builder.** All paths through `buildSession` are pure reads. Writes happen elsewhere (Session.tsx → `commitCapabilityAnswerReport` → `commit-capability-answer-report` Edge Function).
- **No identity minted by the builder.** `sessionId` is minted by Session.tsx via `crypto.randomUUID()` (`Session.tsx:90`) and passed through.
- **Determinism.** Same inputs + same DB state → same output.
- **The `enabled` flag is a hard gate, not a runtime feature flag.** It is always `true` at the call site; the parameter is vestigial from the pre-capability flag-gated rollout and removable in the exercise-content fold.
- **Block ids embed the sessionId.** `${sessionId}:due:${canonicalKey}` etc. Block ids are unique within a session and unstable across sessions by design.
- **Capability projection version is fixed.** `CAPABILITY_PROJECTION_VERSION = 'capability-v3'` is stamped into every projection (`adapter.ts:125`). Bumped from `capability-v2` by Decision 3b (PR-1, ADR 0006). Bumping it would invalidate every cached projection.
- **Lesson activation is the eligibility gate for lesson-derived capabilities.** Per ADR 0006 (Decision 3b), every lesson-derived capability has a non-null `lessonId`; the schema CHECK constraint `learning_capabilities_lesson_id_required_for_lessons` enforces this. Capabilities with `lessonId != null` are suppressed unless the lesson is in the learner's `activatedLessons` set (`pedagogy.ts:209`). Podcast source kinds (`podcast_segment`, `podcast_phrase`) are the documented null-lesson carve-out and bypass the gate; they are otherwise filtered as exposure-only (`capabilityContracts.ts:13`) before reaching it.
- **Mode `lesson_review` never introduces new material.** Enforced twice — by `loadBudget.ts:26-32` (budget = 0 of everything) and by `compose.ts:68` (skips the new-introductions pass entirely).
- **Resolution failures degrade the session, not error it.** All three passes pipe through `resolveCandidate` which returns either `{ ..., renderPlan }` or `{ ..., resolutionFailure }`; the composer turns failures into diagnostics and skips the block, never throws.
- **New-introduction candidate ordering (pass 3 only) is deterministic, lesson-major, with within-lesson family round-robin** (`prioritizeCandidates`, `ORDERING_POLICY`). It applies only when the candidate set spans more than one lesson — i.e. `standard` mode; it is a no-op in `lesson_practice`/`lesson_review` (single-lesson sets) and never affects the due (pass 1) or practice-review (pass 2) passes. This is the `orderedReadyCapabilities` concept deliberately restored 2026-06-07 under product motivation #166/#125 — the explicit, motivated re-ordering the prior "walks in input order" invariant required before any reintroduction.
- **The `CAPABILITY_DISPLAY` map is exhaustive at the type level.** Adding a `CapabilityType` without an entry is a compile error.
- **Receptive-before-productive staging gate is enforced for new introductions.** Phase 3+4 capabilities (`l1_to_id_choice`, `form_recall`, `contextual_cloze`, `dictation`, `root_derived_recognition`, `root_derived_recall`, `pattern_contrast`, `pattern_recognition`) are suppressed unless a sibling capability sharing the same `source_ref` has `activationState='active'` AND `stability >= 1` AND `successfulReviewCount >= 1`. **Three source kinds are exempt** because they have no Phase 1+2 sibling at the same `source_ref`: `affixed_form_pair` (morphology — prerequisite chain sequences instead), `dialogue_line` (lesson_activation is the lever), and `pattern` (grammar — added 2026-06-07, commit `1e5be88`; the prior "inert at runtime" premise expired when Slice 2 made grammar renderable, #166). See ADR 0007 and `docs/plans/2026-05-18-capability-staging-gate.md`.
- **The composer interleaves blocks by `source_ref`.** Post-pass after the three append loops; greedy single-pass; window = 3 preceding blocks. Prevents back-to-back retrievals of the same word that don't count as real spaced practice (Karpicke 2009). Macro three-pass order (due → new → practice-review) preserved.
- **Sibling burying: at most one capability per `source_ref` per learner per calendar day.** Enforced in the selection passes via `buryThinSiblings` threading a `usedRefs` set seeded with `reviewedTodayRefs` (§3.2). Pure read — no write, no reschedule; a buried sibling stays overdue/dormant for a later day. The new-intro and practice passes are deterministic given DB state + `now`; the **due** pass is deterministic only at day-bucket granularity — within a 24h overdue bucket the order (and so which sibling survives burying) is randomised by `Math.random` for session-to-session variety (`dueFilter.ts`). Operates one level above the composer's `interleaveBySourceRef`: burying governs day-level *membership*, the interleave spaces *already-selected* blocks. Podcast caps never reach it (filtered upstream as `exposure_only`). See ADR 0007-adjacent rationale + `docs/plans/2026-06-09-sibling-burying-design.md`. **Exception (2026-07-08, C1 affix production fast-path):** within `planLearningPath`'s new-introduction bury only, `produce_derived_form_cap` candidates in `affix_practice` mode are exempt — same-day recognise→produce is the drill's intended behaviour, and the prereq ladder (recognise sibling active + ≥1 successful review) still enforces order. `recognise_word_form_link_cap` (its sibling type) remains fully subject to the rule, as do the due/practice passes and every other mode. See `docs/plans/2026-07-08-affix-production-fastpath.md`.
- **`capabilityPhase` is exhaustive over `CapabilityType`.** Adding a new type without a phase arm fails compilation.
- **The grammar due-floor never changes session size.** `reserveGrammarDueFloor` (`compose.ts`) returns exactly `min(limit, orderedDue.length)` — it only *reorders* which due caps win the slots (promoting grammar sorting below the cut, displacing the least-overdue non-grammar), never dropping one. So the due portion is unchanged in size and `preferredSessionSize` remains the contract; the floor is a floor, not a cap (natural grammar ≥ floor, or no grammar due, → identical to a plain most-overdue slice). Standard mode only; pure and deterministic given the ordered input. The `GRAMMAR_DUE_FLOOR_FRACTION` constant is the single tuning knob.

---

## 5. Seams (to other modules)

### Upstream (data feeds the builder)

- **`indonesian.get_session_build_data` RPC** (`scripts/migration.sql`; spec
  `docs/plans/2026-07-02-session-data-narrowing-rpc.md`) — the adapter's sole
  session-build read since 2026-07-02. Aggregates, server-side and
  learner-narrowed: the capability catalog, the learner's FSRS state rows
  (ADR 0001; written by the `commit-capability-answer-report` Edge Function),
  lesson activations (written by the `set_lesson_activation` RPC via
  `lib/lessons/activation.ts`), the lessons order index, today's review-event
  capability ids, and activated collection/harvest member refs (mirroring
  `lib/collections/membership.ts` — ADR-0015 parity-tested).
- `loadForceCapabilitySnapshot` (dev bypass) still reads
  `learning_capabilities`/`learner_capability_state` directly — out of the RPC's
  scope by design.
- (Slice 4b, #102: the `capability_artifacts` table was dropped — the adapter no longer reads it. Readiness is decided by `validateCapability` via `RENDER_CONTRACTS` routing alone.)

### Downstream (the builder feeds these)

- `pages/Session.tsx` — only runtime caller. Receives the `SessionPlan`, hands it to `ExperiencePlayer`, owns the answer-commit lifecycle.
- `components/experience/ExperiencePlayer.tsx` — consumes `SessionPlan.blocks[]`, renders one block at a time per the post-2026-05-13 stepwise redesign (see `docs/current-system/modules/experience.md`).
- `components/experience/RecapScreen.tsx` — consumes `SessionPlan.blocks[]` for end-of-session recap; consumes `capabilityDisplay` from `labels.ts` for per-block headlines.

### Sibling (consumed alongside)

- `lib/exercises/exerciseResolver.ts` — `resolveExercise(capability, readiness)` is called inline during each pass to inflate the `renderPlan` (the `artifactIndex` arg was removed in Slice 4b, #102). Currently lives outside the builder; the exercise-content fold will absorb the resolver into a new `lib/exercise-content/` module.
- `lib/exercises/builders/*` — 12 builders that consume `audibleTextFieldsOf` from the barrel to populate per-block `audibleTexts`.
- `lib/capabilities/capabilityContracts.ts` — provides `validateCapability` for readiness. Post-PR #65, readiness derives from the shared `RENDER_CONTRACTS` table in `lib/capabilities/renderContracts.ts`; see `docs/current-system/modules/capabilities.md`.
- `services/audioService.ts` — `fetchSessionAudioMap` consumes the aggregator's deduped audible-text list.

---

## 6. Known limitations and follow-ups

**`knownWordCoverage.ts` is unwired.** Survives as documentation. Wiring requires (a) a pipeline change to emit per-content key-word artifacts, (b) a planner suppression rule, (c) a UX surface for the suppressed-because-of-coverage state. Multi-PR effort, no owner yet.

**Per-capability descriptions are placeholder.** `CAPABILITY_DISPLAY` entries carry `label` only; `description` and `example` fields are stub for PR-D to author.

**`builder.ts` is wider than the fold-plan target (386 LOC vs ≤220).** The behavioural acceptance (one shared `resolveCandidate` helper) is met; the LOC overhang is in the three callsites that each construct a different output shape (`DueSessionCapabilityInput` vs `EligibleNewSessionCapabilityInput`). Slimming requires the SessionBlock-abstract / per-card-resolve change owned by the exercise-content fold.

**Session-builder API is wider than the target spec.** Target spec specifies a slimmer `buildSession({ userId, mode, lessonId?, now })` (`docs/target-architecture.md:350-355`). Current API still carries `enabled`, `sessionId`, `limit`, `preferredSessionSize`, `selectedSourceRefs`, `adapter`. Slimming requires the adapter+sessionId concerns to migrate elsewhere — owned by the exercise-content fold.

**SessionBlock carries `renderPlan` (eager resolve).** Target spec defines an abstract block (`{ capabilityId, exerciseType }`) with resolution deferred to per-card render. The current eager design is owned by the exercise-content fold to peel off.

**No `audibleTexts`/`labels`/`planningSignals` bundled into SessionPlan.** Target spec puts these inside the plan. Currently they are computed/exposed separately. Bundling is owned by the exercise-content fold.

**Composer fill ordering is flat three-pass.** The richer "due fragile → due normal → prerequisite repair → recent lesson continuation → small new intro → stretch task" ordering described in the 2026-04-28 rules is not implemented. Open-ended pedagogic work; revisit if real-user data shows the flat ordering causes problems.

---

## 7. What this spec does NOT cover

- **Per-card content resolution.** `resolveExercise`, the artifact registry, distractor selection, and audio URL resolution all live outside the builder. The builder calls `resolveExercise` once per candidate (via `resolveCandidate`) and stores the result; the resolver's internals are a sibling concern. Owned by the future `lib/exercise-content/` module — see `docs/target-architecture.md:1480-1540` § `lib/exercise-content/`.
- **Answer commit / FSRS.** Server-side. Lives in `supabase/functions/commit-capability-answer-report/index.ts` per ADR 0001 and ADR 0003; invoked as the `commit-capability-answer-report` Edge Function (FSRS pulled in inline from `npm:ts-fsrs`). The builder never touches state writes. See `docs/adr/0001-capability-based-learning-core.md` and `docs/adr/0003-fsrs-schedules-capabilities-not-content-sources.md` for the canonical reasoning.
- **Session lifecycle.** Retirement #5 (2026-05-07) deleted explicit `startSession`/`endSession`. The `learning_sessions` row materialises lazily on the first answer-commit; no explicit lifecycle hooks remain. The retirement plan lives in the repo archive — see `ARCHIVE.md` at repo root for the pointer (path mirrors original: `docs/plans/2026-05-07-retire-session-lifecycle.md` under the archive root).
- **Rendering.** Owned by `components/experience/` (the player) and `components/exercises/implementations/` (the 12 per-type renderers). See `docs/current-system/modules/experience.md`.
- **Coverage UX.** `knownWordCoverage.ts` ships in this module but its wiring + UX is downstream work, not part of the builder contract today. Owner: none yet.
- **Queue-drying UX dismissal telemetry.** PR-B's `<Alert>` is dismissable per-mount but the dismissal is not persisted or logged. If we want to know how often learners dismiss vs. act on it, that's a follow-up.
