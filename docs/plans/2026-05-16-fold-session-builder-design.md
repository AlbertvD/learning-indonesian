---
status: shipped
implementation: PR #47
merged_at: 2026-05-16
implementation_paths:
  - src/lib/session-builder/
  - src/pages/Session.tsx
implementation_pr_b: PR #48
implementation_pr_b_merged_at: 2026-05-16
implementation_pr_c: PR #49
implementation_pr_c_merged_at: 2026-05-17
supersedes: []
---

# Fold lib/session-builder/

**Date:** 2026-05-16
**Status:** shipped (PR-A merged 2026-05-16; PR-B queue-drying wiring 2026-05-16)

## Goal

Consolidate the scattered session-engine code (`src/lib/session/` + `src/lib/pedagogy/` + `src/services/capabilitySessionDataService.ts`, ~1,942 LOC) into a single deep module at `src/lib/session-builder/` matching the LOCKED layout in `docs/target-architecture.md:343-438`. Along the way, delete provably-dead code, three targeted local cleanups, and three small UX additions agreed during scoping. Net result: ~30% less code, same picking logic, three new product behaviours (drying warning, recency badge, enriched labels), no change to the high-stakes planner rules.

## Before / after

- **Before-spec:** `docs/current-system/modules/session-builder.md` (status: partial, written 2026-05-16). Captures the current scattered state.
- **After-spec (locked):** `docs/target-architecture.md` § `lib/session-builder/` (LOCKED). The file layout this fold targets.
- **Boundary changes deferred to the next fold:** abstract SessionBlock, slimmer public API, audibleTexts/labels/planningSignals bundled into SessionPlan. All owned by the **exercise-content fold** per migration order at `docs/target-architecture.md:1490`.

## Scope summary

This fold does:
1. **Relocate** all surviving files into `src/lib/session-builder/` with the target layout.
2. **Delete** three superseded modules + posture system + dead planner inputs.
3. **Three local cleanups** that are safe within the relocate.
4. **Three product additions** (queue-drying wiring, recency badge, per-capability descriptions).

This fold does **not** redesign the planner's suppression rules, change the SessionBlock shape, slim the public API, or wire `knownWordCoverage`. All four are explicitly out of scope — see §10.

---

## 1. File mapping

### 1.1 Relocations (move + rename, no logic change)

| Current path | New path | Notes |
|---|---|---|
| `src/services/capabilitySessionDataService.ts` | `src/lib/session-builder/adapter.ts` | Drop the `capabilitySessionDataService` export name; export as `sessionBuilderAdapter` + `createSessionBuilderAdapter(client?)`. |
| `src/lib/session/capabilitySessionLoader.ts` | `src/lib/session-builder/builder.ts` | Rename top-level entry from `loadCapabilitySessionPlanForUser` → `buildSession`. Keep parameter shape for now (slimmer API is exercise-content fold's job). The decomposed `loadCapabilitySessionPlan` becomes a private helper. |
| `src/lib/session/sessionComposer.ts` | `src/lib/session-builder/compose.ts` | Drop `session` prefix per the naming convention at `docs/target-architecture.md:125`. Rename `composeSession` → `compose`. |
| `src/lib/session/sessionPlan.ts` | `src/lib/session-builder/model.ts` | Per target spec's `model.ts`. Types only. |
| `src/lib/session/sessionLabels.ts` | `src/lib/session-builder/labels.ts` | Enriched in §3 to per-capability descriptions. |
| `src/lib/session/collectAudibleTexts.ts` | `src/lib/session-builder/audibleTexts.ts` | Per-builder `audibleTextFieldsOf` stays public — 12 builders consume it. The session-level `collectAudibleTexts` aggregator also stays public — `Session.tsx:122` consumes it. |
| `src/lib/session/queueDrying.ts` | `src/lib/session-builder/drying.ts` | Wired into the builder in §3. |
| `src/lib/pedagogy/pedagogyPlanner.ts` | `src/lib/session-builder/pedagogy.ts` | Slimmed in §2.3. |
| `src/lib/pedagogy/loadBudgets.ts` | `src/lib/session-builder/loadBudget.ts` | Posture branches deleted in §2.2; future modes deleted in §2.2. |

A new file:

| New path | Purpose |
|---|---|
| `src/lib/session-builder/index.ts` | Barrel. Re-exports the public API: `buildSession`, `compose`, `sessionBuilderAdapter`, types from `model.ts`, `audibleTextFieldsOf`, `collectAudibleTexts`, `capabilityDisplay`. |

After the fold, `src/lib/session/` and `src/lib/pedagogy/` will not exist. `src/services/capabilitySessionDataService.ts` will not exist.

### 1.2 Caller updates (mechanical)

| Caller | What changes |
|---|---|
| `src/pages/Session.tsx:11,16,18,21,22` | Update 5 import paths to point at `@/lib/session-builder`; replace `loadCapabilitySessionPlanForUser` → `buildSession`; replace `capabilitySessionDataService` → `sessionBuilderAdapter`. |
| `src/components/experience/types.ts:2` | Update import path. |
| `src/components/experience/buildFeedbackInput.ts:3` | Update import path. |
| `src/components/experience/CapabilityExerciseFrame.tsx:19` | Update import path. |
| `src/components/experience/ExperiencePlayer.tsx:13` | Update import path. |
| `src/components/experience/RecapScreen.tsx:3-4` | Update import paths. Switch from `exerciseLabel` to `capabilityDisplay(...).label` for the primary label (see §3 enrichment). |
| `src/lib/exercises/builders/*` (12 files) | Update `@/lib/session/collectAudibleTexts` → `@/lib/session-builder/audibleTexts` (or via the barrel `@/lib/session-builder`). |
| `src/lib/capabilities/capabilityScheduler.ts:2` | Update `SessionMode` import path. |
| All tests under `src/__tests__/` referencing the old paths | Mechanical update. Test colocation into the module is deferred to step 8 of the migration order — these tests stay in `src/__tests__/` for now. |

---

## 2. Deletions

### 2.1 Three orphaned modules (zero production callers)

Each is documented in the before-spec §2 with file:line evidence of zero callers.

| File | LOC | Why delete |
|---|---|---|
| `src/lib/pedagogy/lessonIntroduction.ts` | 85 | Superseded by `learner_lesson_activation` table + `set_lesson_activation` RPC (retirement #6, 2026-05-07). Per-content-kind introduction state replaced by single-boolean lesson activation. |
| `src/lib/session/sessionItemIdentity.ts` | 42 | Superseded. Block ids are now canonical-key-based in `sessionComposer.ts:58`; idempotency keys are built inline in `Session.tsx:160`. The helper was designed for the retired legacy session-queue path. |
| `src/lib/session/learnerSkillLabels.ts` | 73 | The 7-family skill taxonomy direction is rejected. Replaced by per-capability descriptions in the enriched `labels.ts` (§3). |

Delete the corresponding test files alongside.

### 2.2 Posture system (three files / dead branches)

Decision recorded in scoping: the arithmetic default budget already handles the returning-learner case correctly via `openSlots = max(0, preferredSessionSize - dueCount)`. The four-band posture system adds opinionated tuning, introduces a glance-reviewer failure mode, and isn't worth the complexity. Replaced with smaller targeted behaviours (see §4).

| File / fragment | LOC | Why delete |
|---|---|---|
| `src/lib/pedagogy/sessionPosture.ts` | 67 | All callers are themselves orphaned (only `sessionPlanningSignals.ts` and `loadBudgets.ts` posture branches). `isMeaningfulPractice` does not feed any current product behaviour — current streak uses a different (looser) rule. |
| `src/lib/session/sessionPlanningSignals.ts` | 66 | Computes `lastMeaningfulPracticeAt` for posture detection. Replaced by a direct read of `learning_sessions.started_at` for the recency badge (§4). |
| `loadBudgets.ts` posture branches (`comeback`, `review_first`, `light_recovery`, `balanced`) | ~70 of 169 | Unreachable — `posture` is never passed from Session.tsx. |
| `loadBudgets.ts` future-mode branches (`pattern_workshop`, `podcast`) | ~25 of 169 | Unreachable — no caller invokes these modes. |
| `loadBudgets.ts` posture/future entries in `PlannerSessionMode` type | trivial | Type narrows to `'standard' \| 'lesson_practice' \| 'lesson_review'` — at which point it becomes identical to `SessionMode` and the two names collapse to one (see §8 risk row). |
| `src/lib/i18n.ts:217-222` + `:503-508` (`posture.*` strings, NL + EN), `:224-232` + `:510-518` (`skillLabels.*` strings, NL + EN) | ~30 | Unused after posture + skill-family deletions. |

### 2.2.1 Posture-ripple sites (five additional touch points)

Removing `SessionPosture` as a type cascades through the orchestrator and planner. Each site below is in addition to the file-level deletions in the table above.

| Site | What to do |
|---|---|
| `capabilitySessionLoader.ts:23` — `posture?: SessionPosture` on `CapabilitySessionLoaderInput` | Remove the field. |
| `capabilitySessionLoader.ts:280` — `posture: input.posture` passed into `planLearningPath(...)` | Remove the forward. |
| `pedagogyPlanner.ts:71` — `PedagogyInput.posture?: SessionPosture` | Remove the field. |
| `loadBudgets.ts:9` — `LoadBudgetInput.posture?: SessionPosture` | Remove the field. |
| `pedagogyPlanner.ts:128-134` — `orderedReadyCapabilities` priority reorder | **Delete the reorder entirely.** The branch is unreachable at runtime today (before-spec §3.3 / §6). Promoting it to unconditional would be a new opinionated ordering decision the user has not asked for; deletion preserves current runtime behaviour exactly. The helper `balancedIntroductionPriority` at `:119-126` becomes orphaned and is also deleted. |

After §2.2 + §2.2.1, `loadBudget.ts` shrinks from 169 → ~50 LOC: three branches (`lesson_review`, `lesson_practice`, default for `standard`) plus the `LoadBudgetDecision` shape.

Delete the corresponding test files alongside (`sessionPosture.test.ts`, `sessionPlanningSignals.test.ts`, the dead-branch portions of `loadBudgets.test.ts`, any test asserting `balancedIntroductionPriority`-based ordering).

### 2.3 Dead planner inputs

`pedagogyPlanner.ts` accepts inputs that are hard-coded in the adapter with no UI driving them:

| Input | Hard-coded at | Suppression rule it gates | Action |
|---|---|---|---|
| `activeGoalTags?: string[]` | `[]` at `capabilitySessionDataService.ts:299` | `not_useful_for_current_path` (`pedagogyPlanner.ts:251`) — gate uses default-allow on empty so always passes | Remove parameter, remove the rule + reason. ~15 LOC. |
| `maxNewDifficultyLevel?: number` | `5` at `capabilitySessionDataService.ts:300` | `difficulty_jump` (`pedagogyPlanner.ts:230-236`) — fires for capabilities with `difficultyLevel > 5`, which is rare | Remove parameter, remove the rule + reason. ~10 LOC. |

Both can be re-added cleanly if the underlying product feature ever materialises (a goals system, a difficulty-cap setting). For now they are noise.

---

## 3. Three targeted local cleanups

These are mechanical, in-scope refactors of files that survive the fold. Each preserves behaviour.

### 3.1 Extract the triple resolver-loop in `builder.ts`

`capabilitySessionLoader.ts` repeats the same pattern three times across the due / new / practice-review passes — ~80 LOC of near-duplication. Extract into one helper:

```typescript
function resolveCandidate(
  meta: CandidateMeta,
  ctx: { capabilitiesByKey, readinessByKey, artifactIndex }
): ResolvedCandidate | FailedCandidate
```

Each pass calls it with its own meta-builder. Net: ~80 LOC down to ~30 LOC + one shared helper.

### 3.2 Drop the dead planner inputs

Per §2.3. Touches `pedagogy.ts`, `adapter.ts`, and the planner's `PedagogyInput` type in `model.ts`.

### 3.3 Enrich `labels.ts` into per-capability descriptions

New shape:

```typescript
interface CapabilityDisplay {
  label:       string   // short, e.g. "Tekst herkennen"
  description: string   // 1 sentence, action-oriented, second person
  example?:    string   // e.g. "makan → eten"
}

export const CAPABILITY_DISPLAY: Record<CapabilityType, CapabilityDisplay> = {
  // 12 entries — one per capability_type. Dutch copy authored as TODO below.
}

export function capabilityDisplay(type: CapabilityType): CapabilityDisplay
```

Keep `exerciseLabel(type: ExerciseType)` and `skillLabel(type: SkillType)` for their existing usage — small, focused, no taxonomy commitment.

Add the missing `l1_to_id_choice` entry to `CAPABILITY_DISPLAY`. Use a defensive `as const satisfies Record<CapabilityType, CapabilityDisplay>` assertion to keep the table exhaustive — TS flags a missing entry the next time a new `CapabilityType` is added.

`RecapScreen.tsx` switches from `exerciseLabel(b.renderPlan.exerciseType)` (line 95) to `capabilityDisplay(b.renderPlan.capabilityType).label` for the primary line, with the description rendered as subtitle.

**Note: this is a deliberate UX change.** The recap primary label flips from exercise-type wording to capability-type wording — e.g. "Recognition MCQ" / "Cued Recall" become "Tekst herkennen" / "Indonesisch kiezen". Exercise-type detail can still surface as a small caption (`exerciseLabel(...)`) if desired, but the headline now answers *what skill* not *what UI shape*. Agreed during scoping when the 7-family taxonomy was rejected in favour of per-capability copy.

**TODO (content task, separate from the fold itself):** author Dutch `description` + optional `example` for all 12 capability types. Draft offered during scoping; not yet committed. The fold lands with terse `label`-only entries (matching today's `capabilityLabel`) so nothing regresses; descriptions are filled in as a follow-up content PR (PR-C, see §5).

---

## 4. Three product additions

Each is small, additive, and **lives in its own PR** — not bundled with the fold. The fold PR (PR-A) is pure refactor: relocation + deletion + local cleanups + label structure. The product additions ride in PR-B/C/D so any rollback affects one user-visible change at a time.

This split is a change from an earlier draft of this plan that bundled queue-drying into PR-A. The architect review flagged it correctly: queue-drying surfaces a new diagnostic to the player UI, the `drying.ts` suppression rule needs to be rewritten (because its current dependency on `decideBacklogPressure` is being deleted in the same fold), and that combination of "rewrite + new UI surface" doesn't match a refactor PR. Honouring the no-smuggled-design-changes rule (see CLAUDE.md), it gets its own PR.

### 4.1 Wire queue-drying (PR-B)

The detector (`queueDrying.ts` → `drying.ts` after the fold) currently has no caller. Wire it as a standalone PR that depends on PR-A having landed.

**`drying.ts` is partially rewritten** to drop its `SessionPosture` / `BacklogPressure` inputs (both deleted by PR-A) and replace the suppression check with a simpler rule based on the inputs that still exist:

```typescript
// New shape (post-rewrite):
interface QueueDryingInput {
  dueCount: number
  preferredSessionSize: number
  goodCandidateCount: number
  currentLessonHasEligibleIntroductions: boolean
  nextLessonNeedsExposure: boolean
  mode: SessionMode
}

function shouldSuppressDryingWarning(input: QueueDryingInput): boolean {
  // Backlog explains the short session — don't blame drying.
  if (input.dueCount > input.preferredSessionSize) return true
  // Lesson modes are intentionally narrow.
  if (input.mode !== 'standard') return true
  return false
}

function shouldFireDryingWarning(input: QueueDryingInput): boolean {
  if (shouldSuppressDryingWarning(input)) return false
  if (input.currentLessonHasEligibleIntroductions) return false
  if (!input.nextLessonNeedsExposure) return false
  if (input.goodCandidateCount >= input.preferredSessionSize * 0.7) return false
  return true
}

export function buildQueueDryingDiagnostic(input: QueueDryingInput): SessionDiagnostic | null {
  if (!shouldFireDryingWarning(input)) return null
  return {
    severity: 'warn',
    reason: 'learning_pipeline_drying_up',
    details: 'session.pipelineDryingUp',
  }
}
```

**Wiring** (in PR-B, after PR-A's relocations have landed):

- **In `builder.ts`**, after the planner runs but before `compose`, call `buildQueueDryingDiagnostic(...)`. If non-null, append it to the diagnostics array.
- **Adapter extension** — derive `currentLessonHasEligibleIntroductions` and `nextLessonNeedsExposure` from `learner_lesson_activation` + the planner's suppressed list. ~30 LOC of new adapter code.
- **Render in `Session.tsx`:** read `plan.diagnostics.find(d => d.reason === 'learning_pipeline_drying_up')` after `buildSession` returns; if present, render a Mantine `<Alert color="blue">` above the player with the Dutch copy from `src/lib/i18n.ts:223` (`session.pipelineDryingUp`).

**Why a separate PR:** the rewrite of `drying.ts` + the new adapter fields + the new UI surface + the new failure mode (warning misfires) together exceed the "additive only, behaviour-preserving" bar a fold PR should clear. Splitting also means PR-B can roll back independently if the trigger threshold turns out to be wrong.

### 4.2 Recency badge on Today (PR-C)

Show "Je laatste sessie was N dagen geleden. Welkom terug." on the Today / Dashboard surface when the learner's most recent `learning_sessions.started_at` is >2 days ago.

- **New service helper** (lives in `services/learnerProgressService.ts` — *not* in session-builder): `getLastPracticeAgeDays(userId): Promise<number | null>`. Returns null if no sessions ever.
- **UI:** small `<RecencyBadge>` component on Dashboard. Hidden if age is null or ≤2 days.
- **Threshold note:** uses *any* session (no `isMeaningfulPractice` gate) to avoid the glance-reviewer failure mode discussed in scoping.

Independent of PR-A; can land before or after.

### 4.3 Per-capability descriptions (PR-D)

Per §3.3. Authors Dutch `description` + optional `example` for all 12 entries in `CAPABILITY_DISPLAY`. UI already consumes them after PR-A. Content-only PR.

---

## 5. Sequencing

Four PRs:

| PR | Contents | Depends on |
|---|---|---|
| **PR-A** | The fold itself: §1 relocations + §1.2 caller updates + §2 deletions (incl. §2.2.1 posture-ripple sites) + §3 local cleanups + §3.3 label structure (with empty `description` fields). **Pure refactor.** | None |
| **PR-B** | §4.1 queue-drying wiring: `drying.ts` rewrite + adapter extension + Session.tsx alert. New user-visible behaviour. | PR-A |
| **PR-C** | §4.2 recency badge on Dashboard. Independent surface. | None (can land before or after PR-A) |
| **PR-D** | §4.3 author Dutch description + example for the 12 capability types. Content-only. | PR-A |

Each PR runs `make pre-deploy` independently. PR-A is the only one that touches the session-builder module's internals.

---

## 6. Acceptance criteria

### 6.1 PR-A (the fold) — acceptance

- [ ] `src/lib/session/` and `src/lib/pedagogy/` directories do not exist.
- [ ] `src/services/capabilitySessionDataService.ts` does not exist.
- [ ] `src/lib/session-builder/` contains 10 files (`index.ts`, `model.ts`, `builder.ts`, `compose.ts`, `pedagogy.ts`, `loadBudget.ts`, `adapter.ts`, `labels.ts`, `audibleTexts.ts`, `drying.ts`) plus tests. `drying.ts` exists as a relocated file but is not yet called from `builder.ts` — wiring lands in PR-B.
- [ ] The six orphaned modules from before-spec §1 plus the posture system are deleted (including the five posture-ripple sites in §2.2.1).
- [ ] `pedagogy.ts` does not reference `activeGoalTags` or `maxNewDifficultyLevel`. The two corresponding suppression rules and their `PlannerReason` values are removed.
- [ ] `pedagogy.ts` no longer contains `orderedReadyCapabilities` or `balancedIntroductionPriority`. Candidates walk in input order.
- [ ] `loadBudget.ts` is ≤60 LOC and contains exactly three branches (`lesson_review`, `lesson_practice`, default standard).
- [ ] `builder.ts` orchestrator shrinks measurably (target ≤220 LOC, down from 366) and contains one shared `resolveCandidate` helper called by three passes. The behavioural acceptance is the dedup; the LOC number is informational.
- [ ] `labels.ts` exports `capabilityDisplay(type) → { label, description?, example? }` with entries for all 12 capability types (including `l1_to_id_choice`, previously missing). The map asserts exhaustiveness via `satisfies Record<CapabilityType, CapabilityDisplay>`.
- [ ] `RecapScreen.tsx` consumes `capabilityDisplay(...).label` for the primary line. `exerciseLabel(...)` remains available but is no longer the recap headline.
- [ ] i18n strings for `posture.*` (NL `:217-222`, EN `:503-508`) and `skillLabels.*` (NL `:224-232`, EN `:510-518`) are removed.
- [ ] `grep -rln 'loadCapabilitySessionPlanForUser\|capabilitySessionDataService\|@/lib/session/\|@/lib/pedagogy/' src/` returns zero hits.
- [ ] `grep -rln 'decideBacklogPressure\|SessionPosture\|isMeaningfulPractice\|balancedIntroductionPriority' src/` returns zero hits.
- [ ] All existing tests (minus the deleted ones) pass. One new test exercises the shared `resolveCandidate` helper.
- [ ] `make pre-deploy` is green (lint + test + build + check-supabase + check-supabase-deep).
- [ ] Frontmatter in `docs/current-system/modules/session-builder.md` updates to `status: stable`, `last_verified_against_code: <merge date>`, and the body is rewritten as the after-spec (replacing the partial scattered-state spec).

### 6.2 PR-B (queue-drying wiring) — acceptance

- [ ] `drying.ts` `QueueDryingInput` no longer references `SessionPosture` or `BacklogPressure` (both deleted by PR-A).
- [ ] Suppression rule fires when `dueCount > preferredSessionSize` OR `mode !== 'standard'` (backlog or mode explains the short session).
- [ ] Builder calls `buildQueueDryingDiagnostic(...)` and appends the result to `plan.diagnostics[]` if non-null.
- [ ] Adapter exposes `currentLessonHasEligibleIntroductions` and `nextLessonNeedsExposure` derivations.
- [ ] `Session.tsx` renders a Mantine `<Alert color="blue">` above the player when the drying diagnostic is present, sourced from `src/lib/i18n.ts:223`.
- [ ] Tests cover three cases: fires correctly, suppressed by backlog, suppressed by mode.

### 6.3 PR-C (recency badge) — acceptance

- [ ] `getLastPracticeAgeDays(userId)` returns days since the most recent `learning_sessions.started_at` or `null` if no sessions.
- [ ] `<RecencyBadge>` renders on Dashboard when age >2 days, hidden otherwise.

### 6.4 PR-D (capability description content) — acceptance

- [ ] All 12 entries in `CAPABILITY_DISPLAY` carry a non-empty `description` field and an optional `example` field.
- [ ] No string is a placeholder ("TODO", "lorem", etc.).

---

## 7. Supabase requirements

### Schema changes
**N/A.** No new tables, columns, RLS policies, or grants. The fold is pure code reorganisation. Queue-drying wiring reads from existing tables (`learner_lesson_activation`, `learner_capability_state`) the adapter already queries.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A**, `indonesian` schema already exposed.
- [ ] Kong CORS — **N/A**, no new origins or headers.
- [ ] GoTrue — **N/A**, no auth changes.
- [ ] Storage — **N/A**, no new buckets.

### Health check additions
**N/A.** No new server-side concerns.

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Renaming `loadCapabilitySessionPlanForUser` → `buildSession` and `capabilitySessionDataService` → `sessionBuilderAdapter` ripples through tests and is easy to miss | Medium | Compile errors caught immediately; no runtime risk | Run `grep -rln "loadCapabilitySessionPlanForUser\|capabilitySessionDataService" src/` after rename. Verify zero hits before commit. |
| Extracting the triple resolver-loop accidentally reorders cases or drops a branch | Low | Subtle session-composition regression | Snapshot test: build a session with mocked data exercising all three passes; assert block order + ids match pre-fold output exactly. |
| Removing `activeGoalTags` / `maxNewDifficultyLevel` quietly removes a suppression rule a test depends on | Low | Test failure, easy to spot | All existing pedagogyPlanner tests pass after the change is the gate. |
| `PlannerSessionMode` and `SessionMode` collapse into the same type | Low | Two names for one type after §2.2.1 narrowing; importers may break | After the narrowing, `PlannerSessionMode` ≡ `SessionMode` (both are `'standard' \| 'lesson_practice' \| 'lesson_review'`). Delete `PlannerSessionMode` and migrate its (few) importers to `SessionMode`. Grep `PlannerSessionMode` before and after — should go from N hits to 0. |
| `decideBacklogPressure` deletion cascade — other callers exist beyond the known `loadBudgets.ts` posture branches + `queueDrying.ts` | Low | Compile error or silent type drop | `grep -rln 'decideBacklogPressure' src/` before deletion — confirm only the deleted files reference it. PR-B reintroduces the concept inline inside `drying.ts` if needed; no shared helper survives. |
| Deleting `sessionPosture.ts` removes `isMeaningfulPractice` which the streak system might rely on transitively | Low | Streak shows wrong count | Verified during scoping: `learnerProgressService.getCurrentStreakDays` uses the `get_current_streak_days` Postgres RPC (any review on a day counts), not `isMeaningfulPractice`. The streak rule is server-side and unrelated. |
| i18n key removal breaks a translation lookup elsewhere | Low | Missing-key warning at render time | grep for any remaining usages of `posture.*` / `skillLabels.*` before deletion. |
| Caller paths in 12 exercise builders all need updating; missing one breaks audio resolution silently | Medium | Specific exercise types lose their audio | Grep for `@/lib/session/collectAudibleTexts` before commit; assert zero hits. |
| RecapScreen primary-label switch from exercise-type to capability-type lands without obvious learner notice | Low | User confusion if the wording change isn't anticipated | Deliberate UX change per §3.3. Smoke test #5 in §9 verifies the new wording renders. Worth a short release note. |
| The `chunkedIn` helper inside the adapter has tricky semantics under empty input | Low | Empty session with new user | Existing test coverage in adapter test suite; preserved verbatim in the move. |

---

## 9. Verification before merge

Standard gates plus fold-specific:

```bash
bun run lint
bun run test           # all unit/integration tests
bun run build          # production build
make check-supabase    # tier 1 health (no schema change, but defensive)
make check-supabase-deep  # tier 2 health
make pre-deploy        # full gauntlet
```

Manual smoke against a real user (admin account) after PR-A deploy:
- [ ] Open `/session?mode=standard` — session loads, displays normal mix.
- [ ] Open a lesson, click "Oefenen" — `/session?lesson=...&mode=lesson_practice` loads with scoped capabilities.
- [ ] Click "Herhalen" on the same lesson — `lesson_review` mode, no new introductions.
- [ ] RecapScreen at session end shows capability labels (not exercise labels) for each completed block.

After PR-B deploy, additionally:
- [ ] Trigger queue-drying scenario (admin: activate a lesson, complete enough reviews to drain it without activating the next) — drying alert appears above the player.

---

## 10. What this fold does NOT cover

These are deliberate deferrals. Each has a named owner in the migration order.

- **Slimming the public API to `buildSession({userId, mode, lessonId?, now})`.** Owned by the **exercise-content fold** — the slimmer API requires the `adapter` / `sessionId` concerns to migrate elsewhere first. Current API is preserved with the rename.
- **Abstract SessionBlock (`{capabilityId, exerciseType}` only, no `renderPlan`).** Owned by the **exercise-content fold**. The eager-resolve design stays for now.
- **Bundling `audibleTexts` / `labels` / `planningSignals` into `SessionPlan`.** Owned by the **exercise-content fold**. The current decoupled exposure (separate aggregator + separate label module) stays.
- **`knownWordCoverage` wiring.** Survives the fold as a present-but-unwired module under `lib/session-builder/`. Wiring requires (a) a pipeline change to emit per-content key-word artifacts, (b) a planner suppression rule, (c) a UX surface for the suppressed-because-of-coverage state. Own multi-PR effort.
- **Composer fill ordering** (the §3 "due fragile → due normal → prerequisite repair → recent lesson continuation → small new intro → stretch task" sequence from the 2026-04-28 rules). Not built today, not built by this fold. Open-ended pedagogic work; revisit if/when real-user data shows the flat three-pass ordering causes problems.
- **Test colocation.** `src/__tests__/` continues to host tests. Step 8 of the migration order (`docs/target-architecture.md:1492`) covers colocation across the whole codebase; out of scope here.
- **Returning-session length cap.** The optional "one-line cap target to 8 if last meaningful >7 days ago" idea from scoping. Skipped — adds back a flavour of the rejected posture system without a clear win. Revisit if recency-badge data shows returning sessions feel brutal.

### Divergences from the target-architecture file roster

`docs/target-architecture.md:391-417` (LOCKED) lists 12 files for `lib/session-builder/`. This fold lands 10. The diffs:

- **`itemIdentity.ts`** in the target spec corresponds to today's `sessionItemIdentity.ts`. **Not created.** That helper is deleted in §2.1 (superseded by canonical-key block ids built in `compose.ts` and inline idempotency in `Session.tsx`). The target-spec entry is obsolete; the source-of-truth fact is in the before-spec §2 + this plan's §2.1.
- **`signals.ts`** in the target spec corresponds to today's `sessionPlanningSignals.ts`. **Not created.** Deleted with the rest of the posture system in §2.2. The target-spec entry is obsolete.
- **`eligibility.ts`** in the target spec is described as folding "lesson activation gate + capability filtering (folds `isLessonActivated` check)." **Not created.** That check lives inline in `pedagogy.ts:258` after the rename (`capability.lessonId != null && !input.activatedLessons.has(capability.lessonId)`). Deferred — extracting it would not change behaviour and adds a file for clarity-only reasons. Worth doing in a follow-up if the planner grows more eligibility rules.
- **`drying.ts`** in this plan does not appear in the target-spec roster — the target absorbs queue-drying into `compose.ts`. This plan keeps `drying.ts` standalone because (a) the rewrite in PR-B is large enough to warrant its own file, (b) `compose.ts` should stay focused on block packing, (c) the function is independently testable.

These are deliberate, documented divergences. The target spec's roster predates the orphaned-module audit and contains entries (`itemIdentity.ts`, `signals.ts`) for files that survived an earlier review but are now confirmed deletions. A future revision of the target architecture should fold these corrections back in.

---

## 11. Frontmatter lifecycle

- Today, on this plan being written: `status: draft`.
- When architect signs off: `status: approved`.
- When PR-A opens: `status: implementing`, with `implementation: PR #<N>`.
- When PR-A merges: `status: shipped`, `merged_at: <date>`, `implementation_paths: ['src/lib/session-builder/']`.

When `status: shipped` is set, the before-spec at `docs/current-system/modules/session-builder.md` is also rewritten as the after-spec (covering the consolidated module) and its frontmatter flips to `status: stable`.
