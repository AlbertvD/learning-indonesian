# Learning Experience Rules Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the refined Today/session/lesson capability rules from `2026-04-28-learning-experience-rules.md`.

**Architecture:** Add small, tested planning primitives first, then wire them into capability projection, planner/composer selection, lesson progression, and UI copy. Keep the legacy session path stable while capability-session behavior grows behind flags and pure functions.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase service adapters, existing capability/session modules.

---

## Task 1: Add Dutch-to-Indonesian Choice Capability

**Files:**
- Modify: `src/lib/capabilities/capabilityTypes.ts`
- Modify: `src/lib/capabilities/capabilityCatalog.ts`
- Modify: `src/lib/capabilities/capabilityContracts.ts`
- Modify: `src/lib/exercises/exerciseResolver.ts`
- Modify: `src/services/capabilitySessionDataService.ts`
- Modify: `src/lib/mastery/masteryModel.ts`
- Modify: `scripts/lib/content-pipeline-output.ts`
- Test: `src/__tests__/capabilityCatalog.test.ts`
- Test: `src/__tests__/capabilityContracts.test.ts`
- Test: `src/__tests__/exerciseResolver.test.ts`
- Test: `src/__tests__/capabilitySessionDataService.test.ts`
- Test: `src/__tests__/masteryModel.test.ts`
- Test: `scripts/__tests__/capability-staging.test.ts`

**Step 1: Write failing projection test**

Add a test that projects a learning item and expects a `l1_to_id_choice` capability with:

- `direction: 'l1_to_id'`
- `modality: 'text'`
- `skillType: 'meaning_recall'` as a compatibility field, while capability identity remains the separate FSRS boundary
- prerequisite on `text_recognition`
- required artifacts `meaning:l1`, `base_text`

Run:

```bash
npm run test -- src/__tests__/capabilityCatalog.test.ts
```

Expected: FAIL because capability type is missing.

**Step 2: Implement capability type and projection**

Add `l1_to_id_choice` to `CapabilityType`, project it after text recognition, and make `form_recall` depend on `l1_to_id_choice`.

**Step 3: Write failing contract and resolver tests**

Assert:

- `validateCapability` marks `l1_to_id_choice` ready with `allowedExercises: ['cued_recall']` when its artifacts are approved;
- `resolveExercise` resolves `l1_to_id_choice` to `cued_recall`;
- `capabilitySessionDataService` accepts `l1_to_id_choice` as lesson-sequenced metadata;
- `masteryModel` maps `l1_to_id_choice` to a distinct `l1_to_id_choice` or `choice` mastery dimension.

Run:

```bash
npm run test -- src/__tests__/capabilityContracts.test.ts src/__tests__/exerciseResolver.test.ts src/__tests__/capabilitySessionDataService.test.ts src/__tests__/masteryModel.test.ts
```

Expected: FAIL because the new capability is not mapped through readiness, data loading, resolver, and mastery.

**Step 4: Implement readiness/data/resolver/mastery mapping**

Map `l1_to_id_choice` through all four layers. Do not add a new legacy `SkillType` in this task; document that `capabilityType` and canonical key are authoritative for separate scheduling.

Also update staging relationship classification so `l1_to_id_choice` is `introduced_by`, not `practiced_by`. Cover this in `scripts/__tests__/capability-staging.test.ts`.

**Step 5: Verify**

Run:

```bash
npm run test -- src/__tests__/capabilityCatalog.test.ts src/__tests__/capabilityContracts.test.ts src/__tests__/exerciseResolver.test.ts src/__tests__/capabilitySessionDataService.test.ts src/__tests__/masteryModel.test.ts
```

Expected: PASS.

## Task 2: Add Session Posture Decision Function

**Files:**
- Create: `src/lib/pedagogy/sessionPosture.ts`
- Test: `src/__tests__/sessionPosture.test.ts`

**Step 1: Write failing tests**

Cover:

- same day/yesterday -> `balanced`
- 2-3 days -> `light_recovery`
- 4-7 days -> `review_first`
- 8+ days -> `comeback`
- huge backlog forces `review_first` or `comeback`
- meaningful practice requires both 8 exercises and 5 minutes

Run:

```bash
npm run test -- src/__tests__/sessionPosture.test.ts
```

Expected: FAIL because module does not exist.

**Step 2: Implement minimal pure function**

Export:

```ts
export type SessionPosture = 'balanced' | 'light_recovery' | 'review_first' | 'comeback'
export type BacklogPressure = 'light' | 'medium' | 'heavy' | 'huge'
export function isMeaningfulPractice(input: { completedExercises: number; durationMinutes: number }): boolean
export function decideBacklogPressure(input: { dueCount: number; preferredSessionSize: number }): BacklogPressure
export function decideSessionPosture(input: {
  now: Date
  mode: 'standard' | 'quick' | 'backlog_clear' | 'listening_focus' | 'pattern_workshop' | 'podcast'
  lastMeaningfulPracticeAt?: string | null
  lastMeaningfulExposureAt?: string | null
  dueCount: number
  preferredSessionSize: number
  eligibleNewMaterialCount: number
}): SessionPosture
```

Use `lastMeaningfulExposureAt` for future explanation/recommendation behavior even if the first posture rules are still primarily practice-recency driven.

**Step 2a: Specify planning-signal adapter contract**

Add or plan a small adapter shape, used by Task 9:

```ts
export interface SessionPlanningSignals {
  lastMeaningfulPracticeAt: string | null
  lastMeaningfulExposureAt: string | null
  dueCount: number
  eligibleNewMaterialCount: number
}
```

Concrete data rules:

- practice recency: latest `learning_sessions` row with `ended_at`, duration >= 5 minutes, and at least 8 total completed attempts from the union of legacy `review_events` and capability `capability_review_events` sharing the session id;
- exposure recency: latest `learner_source_progress_state.last_event_at` where current/completed state is more meaningful than `opened`;
- due count: count active due capability states before scheduler limit;
- eligible new material count: count planner-eligible new candidates before posture budget caps.

Add a loader/service test for a capability-only session with 8 `capability_review_events` and no legacy `review_events`; it must count as meaningful practice.

**Step 3: Verify**

Run the posture test.

## Task 3: Expand Load Budgets By Posture

**Files:**
- Modify: `src/lib/pedagogy/loadBudgets.ts`
- Modify: `src/lib/pedagogy/pedagogyPlanner.ts`
- Test: `src/__tests__/loadBudgets.test.ts`
- Test: `src/__tests__/pedagogyPlanner.test.ts`

**Step 1: Write failing tests**

Cover hard maximums for:

- balanced;
- light recovery;
- review first;
- comeback;
- quick/backlog clear compatibility.

**Step 2: Extend budget shape**

Add optional fields:

```ts
posture?: SessionPosture
maxNewConcepts: number
maxNewProductionTasks: number
maxHiddenAudioTasks: number
maxSourceSwitches: number
targetSessionSize: number
allowQueuePadding: boolean
```

Keep existing fields backwards compatible while callers migrate.

Planner ownership:

- `loadBudgets.ts` computes numeric limits;
- `pedagogyPlanner.ts` enforces new-capability, new-concept, new-production, hidden-audio, and source-switch limits for eligible introductions;
- `sessionComposer.ts` does not own these new-material limits.

For comeback, do not add a `minTargetSessionSize` field. The target is 5-8 when available, but clean underfill is allowed.

**Step 3: Verify**

Run:

```bash
npm run test -- src/__tests__/loadBudgets.test.ts
```

## Task 4: Add Learner-Facing Skill Labels

**Files:**
- Create: `src/lib/session/learnerSkillLabels.ts`
- Test: `src/__tests__/learnerSkillLabels.test.ts`

**Step 1: Write failing tests**

Map capability types to Dutch labels:

- `text_recognition` -> `Herkennen`
- `l1_to_id_choice` -> `Kiezen`
- `form_recall` -> `Onthouden`
- `contextual_cloze` -> `Gebruiken`
- `audio_recognition` -> `Verstaan`
- `dictation` -> `Opschrijven`
- pattern/morphology types -> `Patronen`

**Step 2: Implement pure mapper**

Export a mapping function that returns stable label keys and Dutch display labels.

**Step 3: Verify**

Run:

```bash
npm run test -- src/__tests__/learnerSkillLabels.test.ts
```

## Task 5: Add Queue-Drying Diagnostic Primitive

**Files:**
- Create: `src/lib/session/queueDrying.ts`
- Test: `src/__tests__/queueDrying.test.ts`

**Step 1: Write failing tests**

Warn only when:

- good item count < 70% preferred size;
- backlog pressure is light;
- no current lesson intro material remains;
- next lesson needs exposure;
- mode/posture is not intentionally short.
- light recovery is allowed to warn when the due backlog is light and the pipeline is genuinely dry.

**Step 2: Implement pure diagnostic**

Return the current `SessionDiagnostic` shape:

```ts
{
  severity: 'warn',
  reason: 'learning_pipeline_drying_up',
  details: 'session.pipelineDryingUp'
}
```

**Step 3: Verify**

Run the focused test.

## Task 6: Add Lesson Introduction Gate Helpers

**Files:**
- Create: `src/lib/pedagogy/lessonIntroduction.ts`
- Modify: `src/lib/pedagogy/sourceProgressGates.ts`
- Modify: `src/lib/pedagogy/pedagogyPlanner.ts`
- Test: `src/__tests__/lessonIntroduction.test.ts`
- Test: `src/__tests__/sourceProgressGates.test.ts`
- Test: `src/__tests__/pedagogyPlanner.test.ts`

**Step 1: Write failing tests**

Cover:

- vocabulary introduced by successful recognition or `l1_to_id_choice`;
- grammar/morphology introduced by Dutch explanation exposure plus recognition/noticing success;
- sentence/dialogue introduced by exposure;
- audio introduced by heard once;
- 2 minutes in lesson makes lesson current.

**Step 2: Implement pure helpers**

Keep this module independent of Supabase. Services can adapt DB rows later.

**Step 3: Add integration tests for source-gate behavior**

Extend `ReviewEvidence` to include `capabilityType` or `exerciseType`, and update the `capabilitySessionDataService` evidence adapter to load recent capability evidence from `capability_review_events` joined to `learning_capabilities`. Populate `sourceRef`, `capabilityType`, compatibility `skillType`, `exerciseType` when available in `answer_report_json`, and `successfulReviews`.

Success rule:

```text
answer_report_json.wasCorrect === true
or, when that field is absent, rating > 1
```

Prove that successful `text_recognition` or `l1_to_id_choice` evidence can satisfy the appropriate vocabulary progression gate without requiring manual vocabulary browsing, even when `l1_to_id_choice.skillType === 'meaning_recall'`. Also prove that ordinary `meaning_recall` evidence does not satisfy the vocabulary introduction gate.

**Step 4: Verify**

Run the focused test.

## Task 7: Known-Word Coverage Helper

**Files:**
- Create: `src/lib/pedagogy/knownWordCoverage.ts`
- Test: `src/__tests__/knownWordCoverage.test.ts`

**Step 1: Write failing tests**

Cover:

- reading/context recognition accepts 70-80% known key words;
- cloze requires target introduced and familiar surrounding context;
- production requires key vocabulary recallable;
- exposure bypasses threshold.

**Step 2: Implement pure helper**

Use explicit inputs rather than tokenizing real Indonesian text in this slice.

**Step 3: Verify**

Run focused test.

## Task 8: Documentation Alignment

**Files:**
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/session-engine.md`
- Modify: `docs/architecture/session-modes.md`
- Modify: `docs/architecture/session-policies.md`

**Step 1: Update stale references**

Align docs with:

- current `sessionQueue.ts` path;
- current supported legacy session modes;
- no old 55/20/10 slot ratios where no longer true;
- capability rules spec link.

**Step 2: Verify docs**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

## Task 8a: Capability Release/Migration Notes

**Files:**
- Modify: `docs/current-system/capability-release-runbook.md`
- Modify: `docs/current-system/content-pipeline-and-quality-gates.md`
- Modify: `scripts/lib/content-pipeline-output.ts`
- Test: `scripts/__tests__/check-capability-health.test.ts`
- Test: `scripts/__tests__/materialize-capabilities.test.ts`
- Test: `scripts/__tests__/promote-capabilities.test.ts`
- Test: `scripts/__tests__/publish-approved-content-capability-output.test.ts`
- Test: `scripts/__tests__/capability-staging.test.ts`

**Step 1: Document additive bridge rollout**

Record that `l1_to_id_choice` creates new capability rows, does not rewrite existing learner state, and must pass publish/promote health checks before learner-facing capability flags use it.

**Step 2: Test release tooling**

Add explicit checks for:

- publish/materialize carrying the bridge capability metadata;
- health/promote resolving the bridge through readiness and resolver;
- staging relationships classifying `l1_to_id_choice` as `introduced_by`.

## Task 9: Integration Into Capability Loader/Planner/Composer

**Files:**
- Modify: `src/lib/session/capabilitySessionLoader.ts`
- Modify: `src/lib/pedagogy/pedagogyPlanner.ts`
- Modify: `src/lib/session/sessionComposer.ts`
- Modify: `src/lib/session/sessionPlan.ts` only if diagnostic shape needs future expansion
- Test: `src/__tests__/capabilitySessionLoader.test.ts`
- Test: `src/__tests__/pedagogyPlanner.test.ts`
- Test: `src/__tests__/sessionComposer.test.ts`

**Step 1: Write failing tests**

Cover:

- posture budgets limit new concepts;
- no queue padding when good candidates run out;
- direction-balance candidate can be selected when similarly urgent;
- queue-drying diagnostic flows into `SessionPlan.diagnostics`.
- loader data contract can source or pass posture inputs when available.

**Step 2: Implement small integration**

Wire in budget fields and diagnostics without changing public UI yet. Use current `SessionDiagnostic` shape unless all consumers are migrated.

**Step 3: Verify focused tests**

Run:

```bash
npm run test -- src/__tests__/pedagogyPlanner.test.ts src/__tests__/sessionComposer.test.ts
```

## Task 10: UI Copy And Audio Autoplay Surface

**Files:**
- Modify: `src/lib/i18n.ts`
- Modify: `src/pages/Profile.tsx`
- Modify: relevant exercise/audio components after locating exact playback owner
- Test: existing component tests or new focused tests

**Step 1: Add Dutch copy keys**

Add keys for:

- posture labels;
- pipeline drying warning;
- learner-facing skill labels;
- audio autoplay setting.

**Step 2: Add profile preference**

Use existing audio preference patterns where possible.

**Step 3: Add tests**

Test rendering/copy and preference toggling.

**Step 4: Verify**

Run focused UI tests and `npm run build`.

## Final Verification

After all slices:

```bash
npm run test
npm run build
git diff --check
```

Expected:

- tests pass;
- build succeeds;
- no whitespace errors;
- docs reflect current implementation.
