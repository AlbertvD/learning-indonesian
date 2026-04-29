# Capability Learning System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the approved capability-based Indonesian learning architecture end-to-end, from runtime safety and capability projection through review commits, session composition, content pipeline, mastery, UI, and later podcast/morphology extension seams.

**Architecture:** Implement the approved deep Modules in dependency order. Each Module gets a small Interface, tests at that Interface, disabled-by-default rollout flags, and fail-closed behavior. Existing session/review paths remain available only as explicit flag-off rollback adapters, never as automatic fail-open bypasses while capability paths are enabled.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Supabase/PostgREST in the `indonesian` schema, PL/pgSQL RPC commit seams, `ts-fsrs`, Playwright for responsive UI checks.

---

## Source Specs

Implement against the approved slice specs in `docs/plans/capability-implementation-slices/`:

1. `00-index.md`
2. `01-context-and-adrs.md`
3. `01a-runtime-migration-safety.md`
4. `02-capability-identity-projection.md`
5. `03-contract-validation-health.md`
6. `04-session-diagnostics.md`
7. `05-capability-tables-materialization.md`
8. `06-capability-review-processor.md`
9. `07a-pedagogy-planner-eligibility.md`
10. `07-capability-scheduler-adapter.md`
11. `08-exercise-resolver.md`
12. `09-session-composer-mvp.md`
13. `10-content-pipeline-output.md`
14. `11-mastery-model-mvp.md`
15. `12-experience-player.md`
16. `13-lesson-reader-redesign.md`
17. `14-podcast-morphology-expansion.md`

Architecture docs:

- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md`

## Global Execution Rules

- Use TDD for production behavior: write failing tests first, run them, implement minimal code, rerun tests.
- Keep new capability behavior disabled by default until the slice explicitly enables a test path.
- Preserve existing learner-visible behavior when flags are off.
- Do not automatically fall back to legacy scheduling while a capability flag is on; fail closed and require flag-off rollback.
- Do not write learner capability state or capability review events outside the Review Processor RPC/write seam, except for the reviewed Slice 05 admin migration/backfill adapter with `activation_source = 'admin_backfill'`.
- Content readiness, learner eligibility, scheduling, exercise rendering, review commit, and mastery remain separate Modules.
- If `bun` is unavailable locally, use `npm install` for package install and `npm run test -- ...` where compatible, but any direct `bun scripts/*.ts` verification remains blocked until Bun is installed or the command is adapted.

## Review Gates

Run fresh-context reviews before implementation and at each milestone:

- Architecture reviewer: checks deep Modules, fail-closed seams, ownership, and architecture-doc alignment.
- Implementation reviewer: checks executable commands, migration safety, tests, flags, and current-repo compatibility.

Required review gates:

1. Before first code change: review this execution plan.
2. After Milestone 1: runtime safety, projection, contract health, diagnostics.
3. After Milestone 2: persistence/materialization and review processor.
4. After Milestone 3: planner, scheduler, resolver, session composer.
5. After Milestone 4: content pipeline, mastery, experience player, lesson reader.
6. After Milestone 5: podcast/morphology extension.

## Milestone 0: Toolchain And Safety Check

### Task 0.1: Verify Toolchain

**Files:**
- Read: `package.json`
- Read: `bun.lock`

**Steps:**

1. Run `bun --version`.
2. If Bun is unavailable, run `node --version` and `npm --version`.
3. Install dependencies with `bun install` if Bun exists; otherwise run `npm install` and record that direct Bun script checks are blocked.
4. Run `npm run build` or `bun run build` depending on available toolchain.
5. Check `playwright.config.ts`. If Bun is unavailable and the config uses `bun run dev`, mark Playwright checks blocked until either Bun is installed or the config/server command is updated in the relevant UI slice.
6. Do not change application code in this task.

**Verification:**

```bash
bun --version
bun install
bun run build
```

Fallback:

```bash
node --version
npm --version
npm install
npm run build
```

### Task 0.2: Confirm Branch/Worktree And Baseline

**Files:**
- Read: `git status --short`

**Steps:**

1. Record current branch and status.
2. Do not revert untracked docs.
3. If current branch is `main` or `master`, create a working branch before code edits, for example `git switch -c capability-learning-system-implementation`.
4. If branch creation is blocked by local state, stop and ask before changing runtime code.
5. Capture baseline test/build failures before code edits.

## Milestone 1: Context, Runtime Safety, Projection, Contracts, Diagnostics

### Task 1.0: Context And ADR Baseline

**Spec:** `docs/plans/capability-implementation-slices/01-context-and-adrs.md`

**Files:**
- Create: `CONTEXT.md`
- Create directory if missing: `docs/adr/`
- Create: `docs/adr/0001-capability-based-learning-core.md`
- Create: `docs/adr/0002-stages-are-derived-not-scheduling-authority.md`
- Create: `docs/adr/0003-fsrs-schedules-capabilities-not-content-sources.md`
- Create: `docs/adr/0004-capability-review-commits-are-atomic-and-idempotent.md`
- Create: `docs/adr/0005-lesson-reader-emits-source-progress-not-fsrs-activation.md`

**Steps:**

1. Write `CONTEXT.md` with the required domain terms from Slice 01.
2. Create `docs/adr/` if missing.
3. Write ADR 0001: schedule learning capabilities, not raw content rows.
4. Write ADR 0002: stages are derived labels, not scheduling authority.
5. Write ADR 0003: FSRS schedules only active memory traces.
6. Write ADR 0004: capability review commits are atomic and idempotent.
7. Write ADR 0005: Lesson Reader records source progress but never directly activates FSRS review.
8. Run build if the toolchain is available.

**Verification:**

```bash
bun run build
```

Fallback:

```bash
npm run build
```

### Task 1.1: Runtime Migration Safety

**Spec:** `docs/plans/capability-implementation-slices/01a-runtime-migration-safety.md`

**Files:**
- Modify: `src/lib/featureFlags.ts`
- Create: `src/__tests__/featureFlags.test.ts`
- Create: `src/lib/session/sessionItemIdentity.ts`
- Create: `src/__tests__/sessionItemIdentity.test.ts`
- Modify: `src/types/learning.ts` only if optional identity fields are needed.
- Modify: `src/lib/sessionQueue.ts` only to attach stable identity metadata without changing queue behavior.

**TDD Steps:**

1. Add failing tests proving `VITE_CAPABILITY_*`, `VITE_EXPERIENCE_PLAYER_V1`, and `VITE_LESSON_READER_V2` default false when undefined or empty.
2. Add failing tests proving existing broad exercise flags keep current behavior.
3. Add failing tests proving vocab and grammar `SessionQueueItem`s produce stable `sessionItemId`s independent of array index.
4. Add failing tests proving idempotency keys include `sessionId`, `sessionItemId`, and explicit `attemptNumber`.
5. Implement `parseDisabledByDefaultFlag`, `capabilityMigrationFlags`, `getStableSessionItemIdentity`, and `buildReviewIdempotencyKey`.
6. Rerun tests and build.

**Verification:**

```bash
bun run test -- src/__tests__/featureFlags.test.ts src/__tests__/sessionItemIdentity.test.ts src/__tests__/sessionQueue.test.ts
bun run build
```

### Task 1.2: Capability Identity Projection

**Spec:** `docs/plans/capability-implementation-slices/02-capability-identity-projection.md`

**Files:**
- Create: `src/lib/capabilities/capabilityTypes.ts`
- Create: `src/lib/capabilities/canonicalKey.ts`
- Create: `src/lib/capabilities/capabilityCatalog.ts`
- Create: `src/__tests__/canonicalKey.test.ts`
- Create: `src/__tests__/capabilityCatalog.test.ts`

**TDD Steps:**

1. Test canonical key encoding for `:` and `%`.
2. Test lesson normalization: `lesson-01`, `Lesson 1`, `lesson_1`, `lesson-1` all become `lesson-1`.
3. Test source kinds: `item`, `pattern`, `dialogue_line`, `podcast_segment`, `podcast_phrase`, `affixed_form_pair`.
4. Test vocabulary projection emits recognition/meaning/form capability candidates.
5. Test audio-bearing content emits audio candidates without checking artifact approval.
6. Test non-lesson capabilities can omit source progress or use `{ kind: 'none' }`.
7. Implement catalog and key functions.

**Verification:**

```bash
bun run test -- src/__tests__/canonicalKey.test.ts src/__tests__/capabilityCatalog.test.ts
bun run build
```

### Task 1.3: Capability Contract And Health Report

**Spec:** `docs/plans/capability-implementation-slices/03-contract-validation-health.md`

**Files:**
- Create: `src/lib/capabilities/artifactRegistry.ts`
- Create: `src/lib/capabilities/capabilityContracts.ts`
- Create: `src/__tests__/capabilityContracts.test.ts`
- Create: `scripts/check-capability-health.ts`
- Create: `scripts/__tests__/check-capability-health.test.ts`
- Modify: `package.json` only if adding a script alias.

**TDD Steps:**

1. Test only approved artifacts satisfy learner-facing readiness.
2. Test blocked, deprecated, draft, missing, and unknown artifacts fail closed.
3. Test contextual cloze requires `cloze_context`, `cloze_answer`, and `translation:l1`.
4. Test pattern recognition requires `pattern_explanation:l1` and `pattern_example`.
5. Test `exerciseAvailability` can only tighten allowed exercises.
6. Test health script exit-code planning: report exits 0; strict exits nonzero for CRITICAL.
7. Implement registry, validator, and script.

**Verification:**

```bash
bun run test -- src/__tests__/capabilityContracts.test.ts scripts/__tests__/check-capability-health.test.ts
bun scripts/check-capability-health.ts --help
bun scripts/check-capability-health.ts --staging scripts/data/staging/lesson-1
bun scripts/check-capability-health.ts --staging scripts/data/staging/lesson-1 --strict
bun run build
```

### Task 1.4: Capability-Aware Session Diagnostics

**Spec:** `docs/plans/capability-implementation-slices/04-session-diagnostics.md`

**Files:**
- Create: `src/lib/capabilities/sessionCapabilityDiagnostics.ts`
- Create: `src/__tests__/sessionCapabilityDiagnostics.test.ts`
- Modify: `src/lib/sessionQueue.ts` only behind `VITE_CAPABILITY_SESSION_DIAGNOSTICS`.

**TDD Steps:**

1. Test diagnostics do not mutate/filter/reorder queue items.
2. Test stable session item identity is used.
3. Test blocked capability selected by legacy queue is critical.
4. Test unmapped legacy-only items are warnings.
5. Implement diagnostics adapter and flag-gated hook.

**Verification:**

```bash
bun run test -- src/__tests__/sessionCapabilityDiagnostics.test.ts src/__tests__/sessionQueue.test.ts
bun run build
```

## Milestone 2: Persistence And Review Processor

### Task 2.1: Capability Persistence Schema And Services

**Spec:** `docs/plans/capability-implementation-slices/05-capability-tables-materialization.md`

**Files:**
- Create: `scripts/migrations/2026-04-25-capability-core.sql`
- Create: `scripts/migrations/2026-04-25-capability-core.rollback.sql`
- Use for execution only: `scripts/migration.sql`
- Modify or confirm: `scripts/migrate.ts`
- Create: `src/services/capabilityService.ts`
- Create: `src/services/sourceProgressService.ts`
- Create: `src/__tests__/capabilityService.test.ts`
- Create: `src/__tests__/sourceProgressService.test.ts`
- Create: `scripts/materialize-capabilities.ts`
- Create: `scripts/__tests__/materialize-capabilities.test.ts`

**TDD Steps:**

1. Test service SQL/query adapters use `supabase.schema('indonesian')`.
2. Test materialization dry-run plans capability/artifact/alias inserts without DB writes.
3. Test aliases support split mappings, `inferred`, and no automatic migration for inferred/low/manual mappings.
4. Test source progress event/state update is idempotent and section-aware.
5. Write migration SQL wrapped in `begin; ... commit;` with rollback block.
6. Add RLS policies: source progress direct writes with `WITH CHECK`; learner capability state and review events RPC-only writes.
7. Create `scripts/migrations/` if missing.
8. Implement an explicit migration/backfill adapter inside `scripts/materialize-capabilities.ts`: dry-run by default, `--apply-backfill` only for reviewed admin execution, writes `learner_capability_state` with `activation_source = 'admin_backfill'`, and refuses blocked/unpublished/non-ready capabilities.
9. Keep runtime app code unable to write `learner_capability_state` directly; only the admin backfill adapter and Review Processor RPC can write it.
10. Implement services and script.

**Verification:**

```bash
bun run test -- src/__tests__/capabilityService.test.ts src/__tests__/sourceProgressService.test.ts scripts/__tests__/materialize-capabilities.test.ts
bun scripts/materialize-capabilities.ts --dry-run
bun run build
```

Manual DB verification when credentials are available:

```bash
Copy-Item scripts/migrations/2026-04-25-capability-core.sql scripts/migration.sql
bun scripts/migrate.ts
bun scripts/materialize-capabilities.ts --dry-run
```

```sql
select to_regclass('indonesian.learning_capabilities');
select to_regclass('indonesian.learner_source_progress_events');
```

Rollback verification when credentials are available:

```bash
Copy-Item scripts/migrations/2026-04-25-capability-core.rollback.sql scripts/migration.sql
bun scripts/migrate.ts
```

### Task 2.2: Capability Review Processor

**Spec:** `docs/plans/capability-implementation-slices/06-capability-review-processor.md`

**Files:**
- Create: `src/lib/reviews/capabilityReviewProcessor.ts`
- Create: `src/__tests__/capabilityReviewProcessor.test.ts`
- Modify: `src/lib/reviewHandler.ts` only behind `VITE_CAPABILITY_REVIEW_SHADOW` / `VITE_CAPABILITY_REVIEW_COMPAT`.
- Create or modify: `src/services/capabilityReviewService.ts`
- Create: `scripts/migrations/2026-04-25-capability-review-rpc.sql`
- Create: `scripts/migrations/2026-04-25-capability-review-rpc.rollback.sql`

**TDD Steps:**

1. Test duplicate idempotency key returns original result and does not double-apply FSRS.
2. Test stale scheduler snapshot rejects without state change.
3. Test unpublished/non-ready capability cannot activate or review.
4. Test TypeScript processor computes `stateAfter` using existing `ts-fsrs` and RPC validates state-before/state-after structure.
5. Test first eligible dormant capability activates idempotently with provenance.
6. Implement Review Processor and RPC migration.
7. Add shadow/compat hook without changing flag-off behavior.

**Verification:**

```bash
bun run test -- src/__tests__/capabilityReviewProcessor.test.ts src/__tests__/reviewHandler.test.ts src/__tests__/sessionItemIdentity.test.ts
bun run build
```

Manual DB verification when credentials are available:

```sql
select to_regprocedure('indonesian.commit_capability_answer_report(jsonb)');
```

## Milestone 3: Eligibility, Scheduling, Resolution, Session Composition

### Task 3.1: Pedagogy Planner Eligibility

**Spec:** `docs/plans/capability-implementation-slices/07a-pedagogy-planner-eligibility.md`

**Files:**
- Create: `src/lib/pedagogy/pedagogyPlanner.ts`
- Create: `src/lib/pedagogy/sourceProgressGates.ts`
- Create: `src/lib/pedagogy/loadBudgets.ts`
- Create: `src/__tests__/pedagogyPlanner.test.ts`
- Create: `src/__tests__/sourceProgressGates.test.ts`
- Create: `src/__tests__/loadBudgets.test.ts`
- Modify: `src/services/sourceProgressService.ts` only if read helpers are needed.

**TDD Steps:**

1. Test source progress gates.
2. Test backlog suppresses new capabilities.
3. Test standard/daily budget limits introductions.
4. Test planner never writes learner state, source progress, review events, activation state, or FSRS.
5. Implement planner.

**Verification:**

```bash
bun run test -- src/__tests__/pedagogyPlanner.test.ts src/__tests__/sourceProgressGates.test.ts src/__tests__/loadBudgets.test.ts
bun run build
```

### Task 3.2: Capability Scheduler Adapter

**Spec:** `docs/plans/capability-implementation-slices/07-capability-scheduler-adapter.md`

**Files:**
- Create: `src/lib/capabilities/capabilityScheduler.ts`
- Create: `src/__tests__/capabilityScheduler.test.ts`
- Modify: `src/lib/fsrs.ts` only if shared helpers are needed.
- Modify: `src/services/learnerStateService.ts` only to add read adapter functions, not write behavior changes.

**TDD Steps:**

1. Test only active ready/published learner capability states are returned due.
2. Test schedule previews do not write state.
3. Test blocked/exposure-only/deprecated/unknown capabilities are omitted.
4. Test dormant activation states are excluded.
5. Implement adapter.

**Verification:**

```bash
bun run test -- src/__tests__/capabilityScheduler.test.ts src/__tests__/fsrs.test.ts
bun run build
```

### Task 3.3: Exercise Resolver

**Spec:** `docs/plans/capability-implementation-slices/08-exercise-resolver.md`

**Files:**
- Create: `src/lib/exercises/exerciseResolver.ts`
- Create: `src/lib/exercises/exerciseRenderPlan.ts`
- Create: `src/__tests__/exerciseResolver.test.ts`
- Modify: `src/components/exercises/registry.ts` only if needed to accept `ExerciseRenderPlan`.

**TDD Steps:**

1. Test blocked readiness returns typed failure.
2. Test missing artifacts return typed failure.
3. Test supported current exercises resolve to render plans.
4. Test no family/fallback blocked cases.
5. Implement resolver.

**Verification:**

```bash
bun run test -- src/__tests__/exerciseResolver.test.ts src/__tests__/exerciseShellRegistryPath.test.tsx
bun run build
```

### Task 3.4: Capability Session Composer MVP

**Spec:** `docs/plans/capability-implementation-slices/09-session-composer-mvp.md`

**Files:**
- Create: `src/lib/session/sessionComposer.ts`
- Create: `src/lib/session/capabilitySessionLoader.ts`
- Create: `src/lib/session/sessionPlan.ts`
- Create: `src/__tests__/sessionComposer.test.ts`
- Create: `src/__tests__/capabilitySessionLoader.test.ts`
- Modify: `src/pages/Session.tsx` behind `VITE_CAPABILITY_STANDARD_SESSION`.

**TDD Steps:**

1. Test flag off preserves synchronous legacy session path.
2. Test flag on uses async loader and never returns blocked capabilities.
3. Test loader errors fail closed and do not schedule legacy content.
4. Test pending activation item carries Review Processor activation request.
5. Implement composer and loader integration.

**Verification:**

```bash
bun run test -- src/__tests__/sessionComposer.test.ts src/__tests__/capabilitySessionLoader.test.ts src/__tests__/sessionQueue.test.ts src/__tests__/sessionFlow.test.tsx src/__tests__/featureFlags.test.ts
bun run build
```

## Milestone 4: Content Pipeline, Mastery, Experience UI, Lesson Reader

### Task 4.1: Content Pipeline Capability Output

**Spec:** `docs/plans/capability-implementation-slices/10-content-pipeline-output.md`

**Files:**
- Create: `scripts/migrations/2026-04-25-content-units-lesson-blocks.sql`
- Create: `scripts/migrations/2026-04-25-content-units-lesson-blocks.rollback.sql`
- Modify: `scripts/generate-staging-files.ts` to support `1 --dry-run`.
- Modify: `scripts/lint-staging.ts`.
- Modify: `scripts/publish-approved-content.ts`.
- Create staging tests.

**TDD Steps:**

1. Test `content-units.ts`, `lesson-page-blocks.ts`, `capabilities.ts`, and `exercise-assets.ts` shapes.
2. Test blocks have independent `block_key` and zero/many `content_unit_slugs`.
3. Test `capability_content_units` relationship planning.
4. Test current overwrite behavior is made safe: `generate-staging-files.ts 1 --dry-run` validates and prints planned files without writing.
5. Implement pipeline changes.

**Verification:**

```bash
bun run test -- scripts/__tests__/content-units-staging.test.ts scripts/__tests__/capability-staging.test.ts scripts/__tests__/lesson-page-blocks.test.ts
bun scripts/generate-staging-files.ts 1 --dry-run
bun scripts/lint-staging.ts --lesson 1
bun scripts/publish-approved-content.ts 1 --dry-run
bun scripts/check-capability-health.ts
bun run build
```

### Task 4.2: Mastery Model MVP

**Spec:** `docs/plans/capability-implementation-slices/11-mastery-model-mvp.md`

**Files:**
- Create: `src/lib/mastery/masteryModel.ts`
- Create: `src/__tests__/masteryModel.test.ts`
- Modify: `src/services/progressService.ts` additively.
- Optional UI panel/tests.

**TDD Steps:**

1. Test absent evidence returns `not_assessed`.
2. Test content-unit mastery joins via `capability_content_units`.
3. Test recognition does not imply production.
4. Test weakest-link pattern mastery.
5. Implement mastery model.

### Task 4.3: Learning Experience Player

**Spec:** `docs/plans/capability-implementation-slices/12-experience-player.md`

**Files:**
- Create Experience Player components/tests.
- Modify: `src/pages/Session.tsx` behind `VITE_EXPERIENCE_PLAYER_V1`.

**TDD Steps:**

1. Test flag off leaves existing UI unchanged.
2. Test `VITE_EXPERIENCE_PLAYER_V1=false` leaves the existing UI unchanged even when `VITE_CAPABILITY_STANDARD_SESSION=true`.
3. Test player renders warm input, due review, new introduction, recap.
4. Test answer events are reports, not direct writes.
5. Test keyboard accessibility basics.
6. Implement player.

### Task 4.4: Responsive Lesson Reader Redesign

**Spec:** `docs/plans/capability-implementation-slices/13-lesson-reader-redesign.md`

**Files:**
- Create: `src/lib/lessons/lessonExperience.ts`
- Create Lesson Reader components/tests.
- Create: `e2e/lesson-reader.spec.ts`
- Modify: `src/pages/Lesson.tsx` behind `VITE_LESSON_READER_V2`.
- Modify: `src/services/lessonService.ts` additively.

**TDD Steps:**

1. Test lesson page block loading.
2. Test source progress events use Slice 05 service.
3. Test practice bridges reference capability keys but do not activate them.
4. Test responsive layout with React tests and Playwright when available.
5. Implement reader.

## Milestone 5: Podcast And Morphology Extension

### Task 5.1: Podcast Capability Pilot

**Spec:** `docs/plans/capability-implementation-slices/14-podcast-morphology-expansion.md`

**Files:**
- Modify: `scripts/data/podcasts.ts` if needed.
- Create staged pilot directory: `scripts/data/staging/podcast-<slug>/`
- Create: `scripts/data/staging/podcast-<slug>/content-units.ts`
- Create: `scripts/data/staging/podcast-<slug>/capabilities.ts`
- Create: `scripts/data/staging/podcast-<slug>/exercise-assets.ts`
- Create: `src/__tests__/podcastCapabilityProjection.test.ts`
- Add resolver coverage in: `src/__tests__/exerciseResolver.test.ts`

**TDD Steps:**

1. Test transcript/audio/gist/timecoded phrase artifacts.
2. Test exposure-only podcast segment remains unscheduled.
3. Test planner budget limits mined phrases.
4. Implement pilot data and projection support.

**Verification:**

```bash
bun run test -- src/__tests__/podcastCapabilityProjection.test.ts src/__tests__/exerciseResolver.test.ts
bun scripts/check-capability-health.ts
bun run build
```

### Task 5.2: Morphology Capability Pilot

**Spec:** `docs/plans/capability-implementation-slices/14-podcast-morphology-expansion.md`

**Files:**
- Create/modify morphology staging data for the pilot lesson, starting with `scripts/data/staging/lesson-1/` unless implementation chooses another reviewed lesson.
- Modify or create: `scripts/data/staging/lesson-1/grammar-patterns.ts`
- Modify or create: `scripts/data/staging/lesson-1/morphology-patterns.ts`
- Create: `src/__tests__/morphologyCapabilityProjection.test.ts`
- Add resolver coverage in: `src/__tests__/exerciseResolver.test.ts`

**TDD Steps:**

1. Test `meN-` recognition and root-derived capability projection.
2. Test root-to-derived requires recognition evidence.
3. Test allomorph artifacts and no broad production claim.
4. Implement pilot.

**Verification:**

```bash
bun run test -- src/__tests__/morphologyCapabilityProjection.test.ts src/__tests__/exerciseResolver.test.ts
bun scripts/check-capability-health.ts
bun run build
```

## Final Verification

Run what the environment supports:

```bash
bun run test
bun run build
npx playwright test e2e/lesson-reader.spec.ts
```

Fallback when Bun is unavailable:

```bash
npm run test
npm run build
npx playwright test e2e/lesson-reader.spec.ts
```

If `playwright.config.ts` still requires `bun run dev` and Bun is unavailable, do not claim Playwright verification passed. Either install Bun, update the config/server command in the UI slice, or document Playwright as blocked.

Document any blocked checks, especially DB migrations requiring Supabase credentials and direct Bun script execution requiring Bun.

## Completion Criteria

- All slice specs have corresponding code or explicit migration/script artifacts.
- All capability flags default disabled.
- Flag-off behavior remains compatible with the current app.
- Capability path fails closed when enabled.
- Review Processor is the only runtime writer for learner capability state and review events; the reviewed Slice 05 admin backfill adapter is the only migration-time exception.
- Source progress is persisted through owner-checked policies.
- Lesson Reader and Experience Player are separately gated.
- Tests pass where the local toolchain allows execution.
