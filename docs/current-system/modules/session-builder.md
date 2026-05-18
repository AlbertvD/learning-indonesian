---
module: session-builder
surface: src/lib/session-builder/
last_verified_against_code: 2026-05-18
status: stable
---

# Session builder

**Surface:** `src/lib/session-builder/`

**Files (11):**

| File | LOC | Role |
|---|---|---|
| `adapter.ts` | 350 | Supabase reads — projects to planner/composer types. Also derives `currentLessonId` + `nextLessonNeedsExposure` for the drying detector. Exports `sessionBuilderAdapter` + `createSessionBuilderAdapter(client?)`. |
| `builder.ts` | 418 | Orchestrator. Runs three selection passes, calls `resolveCandidate`, builds the queue-drying diagnostic, composes the plan. Exports `buildSession` + the test-only `loadCapabilitySessionPlan`. |
| `compose.ts` | 115 | Packs candidate triples into `SessionBlock`s; emits diagnostics on resolution failure. Exports `compose`. |
| `model.ts` | 46 | Types only — `SessionMode`, `SessionPlan`, `SessionBlock`, `SessionDiagnostic`, `CapabilityReviewSessionContext`. |
| `pedagogy.ts` | 252 | Suppression-rule engine that picks new capabilities to introduce. Exports `planLearningPath`. |
| `loadBudget.ts` | 53 | Per-mode budget rules. Three branches (`lesson_review`, `lesson_practice`, default `standard`). Exports `decideLoadBudget`. |
| `labels.ts` | 66 | Per-capability display copy + exercise/skill helpers. Exports `capabilityDisplay`, `exerciseLabel`, `skillLabel`, `CAPABILITY_DISPLAY`. |
| `audibleTexts.ts` | 104 | Audible-text harvest — `audibleTextFieldsOf` (per builder) + `collectAudibleTexts` (aggregator). |
| `drying.ts` | 42 | Queue-drying detector. Wired into the builder in PR-B (2026-05-16). Suppresses when the due backlog exceeds preferred size or the mode is lesson-scoped; otherwise fires when the current lesson has no eligible introductions, the next lesson is still inactive, and the candidate pool is below 70% of preferred size. |
| `knownWordCoverage.ts` | 95 | Sentence-comprehensibility gate. **Not yet wired** — survives as documentation per fold plan §10. |
| `index.ts` | 19 | Public-API barrel. |

**Consumers (production):**
- `src/pages/Session.tsx:11-17, 99` — sole runtime caller. Imports `buildSession`, `collectAudibleTexts`, `sessionBuilderAdapter`, and the `SessionMode`/`SessionPlan` types from `@/lib/session-builder`.
- `src/components/experience/{ExperiencePlayer,CapabilityExerciseFrame,buildFeedbackInput,types,RecapScreen}.tsx` — consume `SessionPlan`/`SessionBlock` via the barrel.
- `src/components/experience/RecapScreen.tsx:3, 95` — consumes `capabilityDisplay(...).label` for the recap headline.
- 12 files under `src/lib/exercises/builders/` — consume `audibleTextFieldsOf` via the barrel.
- `src/lib/capabilities/capabilityScheduler.ts:2` — imports `SessionMode` from the barrel.
- `src/services/capabilityContentService.ts:10` — imports `SessionBlock` from the barrel.

**Status (2026-05-16):** stable. Spec rewritten 2026-05-16 as the after-spec of PR-A of the session-builder fold (commit `55edbf5`). PR-A consolidated nine files from `src/lib/session/`, `src/lib/pedagogy/`, and `src/services/capabilitySessionDataService.ts` into this module; deleted three orphaned modules + the entire posture system + two dead planner inputs; rewrote `labels.ts` to a per-capability map with `satisfies` exhaustiveness. PR-B (queue-drying wiring) and PR-C/D (recency badge, capability descriptions) ride in separate follow-on PRs — see fold plan §5.

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

### 3.1 Adapter — four parallel Supabase reads

`adapter.ts`. On each invocation:

1. **Capabilities** — every `learning_capabilities` row with `readiness_status='ready'` and `publication_status='published'`. No user filter. Yields ~thousands of rows once the catalog grows.
2. **Learner state** — every `learner_capability_state` row for the user. Includes FSRS schedule data + activation state.
3. **Lesson activation** — every `learner_lesson_activation` row for the user (single-boolean per lesson, added by retirement #6).
4. **Lessons** — every `lessons` row (`id`, `order_index`). Used by `deriveLessonProgression` to compute `currentLessonId` + `nextLessonNeedsExposure` for the queue-drying detector. The query is unfiltered because the lesson catalog is small (~tens of rows).

After those resolve, a fifth chunked query fetches `capability_artifacts` for the capability ids in batches (via `chunkedIn` to avoid PostgREST URL-length limits).

The adapter then:
- Builds `capabilitiesByKey: Map<string, ProjectedCapability>` and `readinessByKey: Map<string, CapabilityReadiness>` via `validateCapability`. Capabilities with incomplete metadata are recorded with `readinessByKey.set(key, { status: 'unknown', ... })` and skipped from `readyCapabilities`.
- Computes `dueCount` via `getDueCapabilitiesFromRows` (a flat date filter — no FSRS math; FSRS lives server-side per ADR 0003).
- Computes `recentFailures` from rows with `consecutiveFailureCount ≥ 2`.
- Derives `currentLessonId` (the activated lesson with the highest `order_index`, or `null` if no activations) and `nextLessonNeedsExposure` (true iff a lesson with `order_index = current.order_index + 1` exists and is not activated). Both feed the drying detector in §3.8.

Output is a `CapabilitySessionDataSnapshot` carrying `schedulerRows`, `capabilitiesByKey`, `readinessByKey`, `artifactIndex`, `currentLessonId`, `nextLessonNeedsExposure`, and `plannerInput` (typed `Omit<PedagogyInput, 'mode' | 'now'>`).

### 3.2 Orchestrator — three selection passes through one resolver

`builder.ts:199-339`. After the adapter snapshot is loaded:

**Step A — lesson-scope validation** (`builder.ts:92-105, 204-211`). For `lesson_practice` / `lesson_review` modes, both `selectedLessonId` and `selectedSourceRefs[]` must be present and non-empty. If not, a `SessionPlan` with a single `critical` diagnostic (`missing_selected_lesson`) is returned immediately. No further work happens.

**Step B — pass 1: due capabilities** (`builder.ts:236-262`). `getDueCapabilities` (`capabilityScheduler.ts`) is called with the in-memory `schedulerRows`. Result is filtered to lesson scope when applicable. Each due item then has its exercise resolved via the shared `resolveCandidate` helper.

**Step C — pass 2: lesson-scope practice reviews** (`builder.ts:264-303`). Only fires for `lesson_practice` / `lesson_review`. Filters `schedulerRows` to rows that are: active + ready + published + in lesson scope + **not** in the due set + (for `lesson_review`) have at least one prior review. Sorted by `nextDueAt` ascending, then `consecutiveFailureCount` descending. Same `resolveCandidate` helper.

**Step D — pass 3: new introductions** (`builder.ts:305-329`). Calls `planLearningPath(plannerInput)` (`pedagogy.ts:149-251`). Result is the suppression-filtered + budget-limited list of eligible new capabilities. Mode `lesson_review` produces empty. Same `resolveCandidate` helper; each item carries an `activationRequest: { reason: 'eligible_new_capability' }` so the review processor knows to mint the FSRS state row on first answer.

**Step E — queue-drying check** (`builder.ts`, post-PR-B). Once due + new pass outputs are known, the builder calls `buildQueueDryingDiagnostic` with `dueCount + eligibleNewCapabilities.length` as the candidate pool and the snapshot's `currentLessonId` / `nextLessonNeedsExposure`. `currentLessonHasEligibleIntroductions` is computed precisely from `learningPlan.eligibleNewCapabilities.some(e => e.capability.lessonId === currentLessonId)`. If the detector returns a diagnostic, the builder appends it to the `compose` input as `diagnostics: [dryingDiagnostic]`.

**Step F — compose**. All three pass outputs + the drying diagnostic (if any) hand to `compose`.

The three passes share the resolver loop via `resolveCandidate`. It accepts the caller's `meta` object verbatim and returns either `{ meta, reviewContext, renderPlan }` (resolved) or `{ meta, reviewContext, resolutionFailure }` (failed). The dedup is the load-bearing detail of the §3.1 fold cleanup — see `__tests__/resolveCandidate.test.ts` for the contract.

### 3.3 Planner — suppression-rule engine

`pedagogy.ts:149-252`. Walks candidates in **input order** (the prior `orderedReadyCapabilities` priority sort was deleted in the fold — it was unreachable in production, and promoting it would have been a new opinionated ordering decision).

For each candidate, applies suppression rules in this exact order (`pedagogy.ts:159-242`):

| Rule | Reason emitted | Effect |
|---|---|---|
| `readinessStatus !== 'ready'` | `capability_not_ready` | Skip |
| `publicationStatus !== 'published'` | `capability_not_published` | Skip |
| Lesson-scope mismatch (lesson_practice/lesson_review) | `wrong_session_mode` | Skip |
| State exists and not dormant | `already_active_or_retired` | Skip |
| Any prerequisite key not in `satisfiedKeys` | `missing_prerequisite` | Skip |
| Recent failure fatigue (≥2 consec failures, ≤1h ago) | `recent_failure_fatigue` | Skip |
| Source kind = `podcast_phrase` | `wrong_session_mode` | Skip (no live podcast mode) |
| Lesson not activated | `lesson_not_activated` | Skip |
| Over `maxNewCapabilities` budget | `load_budget_exhausted` | Skip |
| Over `maxNewPatterns` (pattern caps) | `load_budget_exhausted` | Skip |
| Over `maxNewProductionTasks` | `load_budget_exhausted` | Skip |
| Over `maxHiddenAudioTasks` | `load_budget_exhausted` | Skip |

**Removed in the fold** (deleted suppression rules + their inputs, per §2.3 of the fold plan):
- `difficulty_jump` rule + `maxNewDifficultyLevel` input.
- `not_useful_for_current_path` rule + `activeGoalTags` input.

Passed candidates are accumulated into `eligibleNewCapabilities[]` with `activationRecommendation`. Suppressed ones are tracked in `suppressedCapabilities[]` for diagnostics. Return shape — `pedagogy.ts:59-64`:

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

After all three passes, `blocks.slice(0, input.limit)` caps the session at the requested size (`compose.ts:111`). Order is deterministic: all due, then all new (skipped for `lesson_review`), then all practice-review. Diagnostics preserve their order.

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
- **The planner walks candidates in input order.** The prior `orderedReadyCapabilities` priority sort was deleted; any future re-ordering should be a deliberate change with a product motivation.
- **The `CAPABILITY_DISPLAY` map is exhaustive at the type level.** Adding a `CapabilityType` without an entry is a compile error.

---

## 5. Seams (to other modules)

### Upstream (data feeds the builder)

- `learning_capabilities` table — capability catalog (one row per capability, ~thousands when projected).
- `learner_capability_state` table — per-learner FSRS state (ADR 0001). Written by the server-side review processor (`supabase/functions/commit-capability-answer-report/index.ts`, invoked via the `commit-capability-answer-report` Edge Function).
- `learner_lesson_activation` table — single-boolean per (user, lesson). Written by `set_lesson_activation` RPC (`migration.sql:1584`), called from `lib/lessons/` and `authStore.activateStarterLessons`.
- `capability_artifacts` table — per-capability content blobs (meanings, contexts, items, etc.). Validated by `validateCapability` (`lib/capabilities/capabilityContracts.ts`).

### Downstream (the builder feeds these)

- `pages/Session.tsx` — only runtime caller. Receives the `SessionPlan`, hands it to `ExperiencePlayer`, owns the answer-commit lifecycle.
- `components/experience/ExperiencePlayer.tsx` — consumes `SessionPlan.blocks[]`, renders one block at a time per the post-2026-05-13 stepwise redesign (see `docs/current-system/modules/experience.md`).
- `components/experience/RecapScreen.tsx` — consumes `SessionPlan.blocks[]` for end-of-session recap; consumes `capabilityDisplay` from `labels.ts` for per-block headlines.

### Sibling (consumed alongside)

- `lib/exercises/exerciseResolver.ts` — `resolveExercise(capability, readiness, artifactIndex)` is called inline during each pass to inflate the `renderPlan`. Currently lives outside the builder; the exercise-content fold will absorb the resolver into a new `lib/exercise-content/` module.
- `lib/exercises/builders/*` — 12 builders that consume `audibleTextFieldsOf` from the barrel to populate per-block `audibleTexts`.
- `lib/capabilities/capabilityScheduler.ts` — provides `getDueCapabilities` (date+flag filter; no FSRS math) and `getDueCapabilitiesFromRows`. Imports `SessionMode` back from the barrel.
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
