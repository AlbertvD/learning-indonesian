# Capability Release Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining path from staged capability-era content to a DB-backed learner experience where the new lesson reader, source progress, capability sessions, and FSRS review commits work end-to-end.

**Architecture:** Keep the system fail-closed: publishing may create draft catalog rows, but only a reviewed promotion gate can make capabilities `ready` and `published`. Use the existing `publish-approved-content.ts` as the content executor, add a separate promotion/readiness step, and prove runtime behavior with Supabase smoke checks before enabling learner-facing flags.

**Tech Stack:** TypeScript scripts, Supabase/PostgREST, Supabase Edge Functions, SQL migrations, Vitest, React/Vite.

---

## Current Branch Reality

The branch already has these pieces:

- Schema migrations for capability, source progress, review events, content units, lesson page blocks, and capability-content-unit relationships.
- `scripts/publish-approved-content.ts` loads `content-units.ts`, `capabilities.ts`, `lesson-page-blocks.ts`, and `exercise-assets.ts` for Lesson 1 and upserts them into the new tables.
- `scripts/materialize-capabilities.ts` is a dry-run/backfill planner only. It does not execute database writes.
- The new reader and capability session services read from the new tables.
- Capability sessions only consume capabilities where `readiness_status = 'ready'` and `publication_status = 'published'`.
- The publisher currently writes staged capabilities as `readiness_status = 'unknown'` and `publication_status = 'draft'`, so publishing alone does not make capabilities schedulable.
- Lesson 1 capability rows do not use `source_ref = 'lesson-1'`. They use item refs such as `learning_items/akhir` and pattern refs such as `lesson-1/pattern-*`. Lesson-scoped scripts must therefore derive the Lesson 1 capability set from `lesson_page_blocks.capability_key_refs` and/or `capability_content_units`, not from exact capability `source_ref`.
- Lesson 1 `exercise-assets.ts` currently contains generated draft placeholders. Promotion must remain blocked until a reviewed artifact approval step replaces or approves concrete non-placeholder payloads.
- The Review Processor commit path exists behind a trusted Supabase Edge Function and writes FSRS state only for ready/published capabilities.
- `scripts/publish-approved-content.ts` currently runs its CLI entrypoint directly and shells out to `bun` for staging linting. Before adding tests or relying on `npx tsx` publish commands, this plan must make that script import-safe and runtime-agnostic.

This plan completes the missing release path without weakening those boundaries.

## Release Invariants

- Draft content can be visible in local preview, but not scheduled by FSRS.
- Lesson reader source progress never directly activates FSRS state.
- Pedagogy planner remains read-only.
- Review Processor remains the only owner of learner capability state and review event writes.
- Browser code never holds service-role credentials.
- Capabilities become schedulable only after contract validation proves they are renderable and reviewed.
- Placeholder artifacts cannot be promoted. Any artifact with `payload_json.placeholder = true` must remain `draft` or become `blocked`.
- Feature flags stay disabled until migrations, publish, promotion, health checks, and browser smoke tests pass.

## Required Environment

- Use branch `capability-learning-system-implementation`.
- Do not commit `.env.local` or `test-results/`.
- `bun` may be unavailable on this machine. If so, use `npx tsx` or `npm test -- --run ...` consistently and update docs/commands in the commit.
- Release scripts must not shell out to `bun` unless the command first verifies `bun` exists. Prefer `process.execPath` plus `tsx`, or an npm script, so the release path works on this Windows/npm environment.
- Required secrets for DB-writing scripts:
  - `VITE_SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - Supabase Edge Function env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Task 1: Make the Publisher Import-Safe and Runtime-Agnostic

**Files:**

- Modify: `scripts/publish-approved-content.ts`
- Create: `scripts/__tests__/publish-approved-content-entrypoint.test.ts`

**Step 1: Write the failing test**

Create a test that imports the module and verifies it does not execute the CLI or call `process.exit`.

```ts
import { describe, expect, it, vi } from 'vitest'

describe('publish-approved-content module entrypoint', () => {
  it('can be imported by tests without running the CLI', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called during import')
    }) as never)

    const module = await import('../publish-approved-content')

    expect(module.publishCapabilityPipelineOutput).toEqual(expect.any(Function))
    expect(exitSpy).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run scripts/__tests__/publish-approved-content-entrypoint.test.ts
```

Expected: fail because `publishCapabilityPipelineOutput` is not exported and/or importing the script runs `main()`.

**Step 3: Guard the CLI entrypoint**

Add an import-main helper at the bottom of `scripts/publish-approved-content.ts`:

```ts
import { pathToFileURL } from 'node:url'

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
```

Remove any unconditional `main()` call.

**Step 4: Export the publish seam**

Change:

```ts
async function publishCapabilityPipelineOutput(...)
```

to:

```ts
export async function publishCapabilityPipelineOutput(...)
```

Export any small types/helpers needed by tests, but do not export the whole CLI.

**Step 5: Replace internal `bun` lint subprocess**

Find the staging lint subprocess in `scripts/publish-approved-content.ts`. Replace hard-coded `spawnSync('bun', ...)` with a runtime-agnostic command, for example:

```ts
const lintResult = spawnSync(process.execPath, [
  './node_modules/tsx/dist/cli.mjs',
  'scripts/lint-staging.ts',
  '--lesson',
  String(lessonNumber),
], {
  stdio: 'inherit',
  env: process.env,
})
```

If the repo's installed `tsx` entrypoint differs, create a small helper that resolves it from `node_modules/.bin/tsx.cmd` on Windows and `node_modules/.bin/tsx` elsewhere. Add a test for the helper so release publishing does not depend on Bun being installed.

Do not use `--skip-lint` as the normal release path. Skipping lint is allowed only as a documented emergency diagnostic with a separate lint command already run.

**Step 6: Run tests**

Run:

```bash
npm test -- --run scripts/__tests__/publish-approved-content-entrypoint.test.ts
```

Expected: pass.

**Step 7: Commit**

```bash
git add scripts/publish-approved-content.ts scripts/__tests__/publish-approved-content-entrypoint.test.ts
git commit --no-verify -m "refactor: make content publisher testable"
```

## Task 2: Add a Lesson-Scoped Release Readiness Audit Script

**Files:**

- Create: `scripts/check-capability-release-readiness.ts`
- Create: `scripts/__tests__/check-capability-release-readiness.test.ts`
- Read: `scripts/check-capability-health.ts`
- Read: `src/services/capabilitySessionDataService.ts`

**Step 1: Write the failing tests**

Test the pure report logic before any Supabase access.

```ts
import { describe, expect, it } from 'vitest'
import { summarizeCapabilityReleaseReadiness } from '../check-capability-release-readiness'

describe('summarizeCapabilityReleaseReadiness', () => {
  it('blocks release when published reader rows exist but no ready capabilities exist', () => {
    const report = summarizeCapabilityReleaseReadiness({
      contentUnits: 12,
      lessonPageBlocks: 8,
      capabilities: [
        { readiness_status: 'unknown', publication_status: 'draft' },
      ],
      capabilityArtifacts: 20,
      sourceProgressRows: 0,
    })

    expect(report.releaseReady).toBe(false)
    expect(report.blockers).toContain('No ready/published capabilities are available for capability sessions.')
  })

  it('passes the core runtime gate when reader rows and ready capabilities exist', () => {
    const report = summarizeCapabilityReleaseReadiness({
      contentUnits: 12,
      lessonPageBlocks: 8,
      capabilities: [
        { readiness_status: 'ready', publication_status: 'published' },
      ],
      capabilityArtifacts: 20,
      sourceProgressRows: 1,
    })

    expect(report.releaseReady).toBe(true)
    expect(report.blockers).toEqual([])
  })
})
```

Also test CLI parsing and fail-closed unknown arguments:

```ts
import { parseCapabilityReleaseReadinessArgs } from '../check-capability-release-readiness'

it('requires a lesson scope', () => {
  expect(parseCapabilityReleaseReadinessArgs(['--lesson', '1'])).toEqual({ lesson: 1 })
  expect(() => parseCapabilityReleaseReadinessArgs([])).toThrow('--lesson is required')
  expect(() => parseCapabilityReleaseReadinessArgs(['--bogus'])).toThrow('Unknown argument: --bogus')
})
```

**Step 2: Verify the tests fail**

Run:

```bash
npm test -- --run scripts/__tests__/check-capability-release-readiness.test.ts
```

Expected: fail because `scripts/check-capability-release-readiness.ts` does not exist.

**Step 3: Implement the script**

Export pure functions and keep the CLI thin.

```ts
export interface CapabilityReleaseReadinessInput {
  sourceRef: string
  contentUnits: number
  lessonPageBlocks: number
  capabilities: Array<{
    readiness_status: string
    publication_status: string
  }>
  capabilityArtifacts: number
  sourceProgressRows: number
}

export interface CapabilityReleaseReadinessReport {
  releaseReady: boolean
  blockers: string[]
  warnings: string[]
  counts: {
    contentUnits: number
    lessonPageBlocks: number
    readyPublishedCapabilities: number
    draftOrUnknownCapabilities: number
    capabilityArtifacts: number
    sourceProgressRows: number
  }
}

export function summarizeCapabilityReleaseReadiness(
  input: CapabilityReleaseReadinessInput,
): CapabilityReleaseReadinessReport {
  const readyPublishedCapabilities = input.capabilities.filter(capability => (
    capability.readiness_status === 'ready'
    && capability.publication_status === 'published'
  )).length
  const draftOrUnknownCapabilities = input.capabilities.length - readyPublishedCapabilities
  const blockers: string[] = []
  const warnings: string[] = []

  if (input.contentUnits === 0) blockers.push('No content units are published.')
  if (input.lessonPageBlocks === 0) blockers.push('No lesson page blocks are published.')
  if (readyPublishedCapabilities === 0) blockers.push('No ready/published capabilities are available for capability sessions.')
  if (input.capabilityArtifacts === 0) blockers.push('No capability artifacts are published.')
  if (input.sourceProgressRows === 0) warnings.push('No learner source progress rows exist yet; run a browser lesson-reader smoke test.')

  return {
    releaseReady: blockers.length === 0,
    blockers,
    warnings,
    counts: {
      contentUnits: input.contentUnits,
      lessonPageBlocks: input.lessonPageBlocks,
      readyPublishedCapabilities,
      draftOrUnknownCapabilities,
      capabilityArtifacts: input.capabilityArtifacts,
      sourceProgressRows: input.sourceProgressRows,
    },
  }
}
```

The CLI should:

- Create a service-role Supabase client.
- Require `--lesson <N>` and derive `sourceRef = lesson-N`.
- Reject unknown arguments instead of silently ignoring them.
- Query only rows for that lesson/source:
  - `content_units.source_ref = sourceRef`
  - `lesson_page_blocks.source_ref = sourceRef`
  - lesson-scoped capability keys from `lesson_page_blocks.capability_key_refs` where `lesson_page_blocks.source_ref = sourceRef`
  - plus capability keys discovered through `content_units.source_ref = sourceRef` -> `capability_content_units` -> `learning_capabilities`
  - `learning_capabilities.canonical_key in (<lesson-scoped capability keys>)`
  - `capability_artifacts` only for those lesson-scoped capability IDs
  - `capability_content_units` only for relationships between lesson-scoped capabilities and lesson-scoped content units
  - `learner_source_progress_state.source_ref = sourceRef`, counted as a warning-only smoke signal
- Print JSON.
- Exit `1` when blockers exist.
- Exit `0` when only warnings exist.

**Step 4: Run tests**

Run:

```bash
npm test -- --run scripts/__tests__/check-capability-release-readiness.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add scripts/check-capability-release-readiness.ts scripts/__tests__/check-capability-release-readiness.test.ts
git commit --no-verify -m "test: add capability release readiness audit"
```

## Task 3: Add a Capability Promotion Planner

**Files:**

- Create: `scripts/promote-capabilities.ts`
- Create: `scripts/__tests__/promote-capabilities.test.ts`
- Read: `src/lib/capabilities/capabilityContracts.ts`
- Read: `scripts/check-capability-health.ts`
- Read: `scripts/lib/content-pipeline-output.ts`

**Step 1: Write failing tests for the pure planner**

```ts
import { describe, expect, it } from 'vitest'
import { planCapabilityPromotion } from '../promote-capabilities'

describe('planCapabilityPromotion', () => {
  it('promotes only capabilities with ready contracts and approved artifacts', () => {
    const plan = planCapabilityPromotion({
      capabilities: [
        { id: 'cap-ready', canonical_key: 'item:makan:meaning_recall:id_to_l1', readiness_status: 'unknown', publication_status: 'draft' },
        { id: 'cap-blocked', canonical_key: 'item:x:dictation:id_audio_to_text', readiness_status: 'unknown', publication_status: 'draft' },
      ],
      healthResults: [
        { canonicalKey: 'item:makan:meaning_recall:id_to_l1', readiness: { status: 'ready', allowedExercises: ['meaning_recall'] } },
        { canonicalKey: 'item:x:dictation:id_audio_to_text', readiness: { status: 'blocked', reason: 'missing audio_clip' } },
      ],
    })

    expect(plan.promotions).toEqual([
      {
        capabilityId: 'cap-ready',
        canonicalKey: 'item:makan:meaning_recall:id_to_l1',
        readinessStatus: 'ready',
        publicationStatus: 'published',
      },
    ])
    expect(plan.blocked).toEqual([
      {
        capabilityId: 'cap-blocked',
        canonicalKey: 'item:x:dictation:id_audio_to_text',
        readinessStatus: 'blocked',
        reason: 'missing audio_clip',
      },
    ])
  })
})
```

**Step 2: Verify the tests fail**

Run:

```bash
npm test -- --run scripts/__tests__/promote-capabilities.test.ts
```

Expected: fail because `scripts/promote-capabilities.ts` does not exist.

**Step 3: Implement dry-run planner**

The script must support:

```bash
npx tsx scripts/promote-capabilities.ts --lesson 1 --dry-run
npx tsx scripts/promote-capabilities.ts --lesson 1 --apply
```

Rules:

- Default is dry-run.
- `--apply` requires `SUPABASE_SERVICE_KEY`.
- `--apply` must reload current database rows and recompute readiness in the same process immediately before updating statuses. It must not trust a stale JSON dry-run report or precomputed client input.
- `--lesson <N>` derives scoped capabilities from `lesson_page_blocks.capability_key_refs` and `capability_content_units`, then filters `learning_capabilities` by canonical key. Do not use `learning_capabilities.source_ref = 'lesson-N'` as the primary lesson filter.
- The planner must never promote a capability with readiness `blocked`, `exposure_only`, `deprecated`, or `unknown`.
- The planner must never promote a capability whose required artifact is not present as `quality_status = 'approved'`.
- The planner must never promote a capability whose required artifact payload has `placeholder: true`.
- A ready health result must include at least one `allowedExercises` entry, proving the capability has a renderable exercise path.
- The planner must output a JSON report with `promotions`, `blocked`, `warnings`, and `counts`.
- The write path only updates `indonesian.learning_capabilities`:

```ts
await supabase
  .schema('indonesian')
  .from('learning_capabilities')
  .update({
    readiness_status: promotion.readinessStatus,
    publication_status: promotion.publicationStatus,
    updated_at: new Date().toISOString(),
  })
  .eq('id', promotion.capabilityId)
```

**Step 4: Run tests**

Run:

```bash
npm test -- --run scripts/__tests__/promote-capabilities.test.ts
```

Expected: pass.

**Step 5: Run dry-run locally**

Run:

```bash
npx tsx scripts/promote-capabilities.ts --lesson 1 --dry-run
```

Expected:

- JSON report printed.
- No database writes attempted.
- Any blocked capabilities explain why.

**Step 6: Commit**

```bash
git add scripts/promote-capabilities.ts scripts/__tests__/promote-capabilities.test.ts
git commit --no-verify -m "feat: plan capability promotion gate"
```

## Task 4: Add a Reviewed Artifact Approval Gate for Lesson 1

**Files:**

- Create: `scripts/approve-staged-capability-artifacts.ts`
- Create: `scripts/__tests__/approve-staged-capability-artifacts.test.ts`
- Modify: `scripts/data/staging/lesson-1/exercise-assets.ts` only after tests prove the approval tool works.
- Read: `scripts/data/staging/lesson-1/learning-items.ts`
- Read: `scripts/data/staging/lesson-1/capabilities.ts`
- Read: `src/lib/capabilities/artifactRegistry.ts`
- Read: `src/lib/capabilities/capabilityContracts.ts`

**Step 1: Write failing tests for artifact approval safety**

Test that placeholders cannot be approved and concrete reviewed payloads can be approved.

```ts
import { describe, expect, it } from 'vitest'
import { planArtifactApproval } from '../approve-staged-capability-artifacts'

describe('planArtifactApproval', () => {
  it('blocks generated placeholder artifacts from approval', () => {
    const plan = planArtifactApproval({
      assets: [
        {
          asset_key: 'asset-1',
          capability_key: 'cap-1',
          artifact_kind: 'meaning:l1',
          quality_status: 'draft',
          payload_json: { placeholder: true, reason: 'Generated scaffold only' },
        },
      ],
    })

    expect(plan.approved).toEqual([])
    expect(plan.blocked).toEqual([
      expect.objectContaining({
        assetKey: 'asset-1',
        reason: 'placeholder_payload',
      }),
    ])
  })

  it('approves concrete reviewed payloads', () => {
    const plan = planArtifactApproval({
      assets: [
        {
          asset_key: 'asset-2',
          capability_key: 'cap-2',
          artifact_kind: 'base_text',
          quality_status: 'draft',
          payload_json: { value: 'akhir', reviewedBy: 'human' },
        },
      ],
    })

    expect(plan.approved).toEqual([
      expect.objectContaining({
        assetKey: 'asset-2',
        qualityStatus: 'approved',
      }),
    ])
    expect(plan.blocked).toEqual([])
  })
})
```

**Step 2: Verify the tests fail**

Run:

```bash
npm test -- --run scripts/__tests__/approve-staged-capability-artifacts.test.ts
```

Expected: fail because the approval tool does not exist.

**Step 3: Implement the approval planner**

Rules:

- Default is dry-run.
- It reads `scripts/data/staging/lesson-1/exercise-assets.ts`.
- It outputs `approved`, `blocked`, and `unchanged`.
- It refuses to approve any asset with:
  - `payload_json.placeholder === true`
  - missing `payload_json`
  - missing concrete value fields required by the artifact kind
- It allows approval only for reviewed concrete payloads. At minimum:
  - `base_text` requires `payload_json.value`
  - `meaning:l1` / `meaning:nl` / `meaning:en` require `payload_json.value`
  - `accepted_answers:id` / `accepted_answers:l1` require non-empty `payload_json.values`
  - `cloze_context` requires `payload_json.sentence` and `payload_json.answer`
  - `audio_clip` requires `payload_json.storagePath` or `payload_json.url`

**Step 4: Add a small Lesson 1 pilot artifact set**

Do not mass-approve the 441 generated placeholders. Replace a deliberately small subset for the browser smoke test, for example 3 to 5 capabilities covering:

- one `text_recognition`
- one `meaning_recall`
- one `form_recall`

For each selected capability, replace required artifact payloads with concrete reviewed values from `learning-items.ts`, for example:

```ts
{
  asset_key: '...',
  capability_key: '...',
  artifact_kind: 'base_text',
  quality_status: 'approved',
  payload_json: {
    value: 'akhir',
    reviewedBy: 'manual-release-smoke',
    reviewedAt: '2026-04-26',
  },
}
```

Every other placeholder remains `draft`.

**Step 5: Run approval dry-run**

Run:

```bash
npx tsx scripts/approve-staged-capability-artifacts.ts --lesson 1 --dry-run
```

Expected:

- Selected reviewed artifacts are approved or already approved.
- Placeholder artifacts are reported as blocked or unchanged.
- No generated placeholder is marked approved.

**Step 6: Run tests**

Run:

```bash
npm test -- --run scripts/__tests__/approve-staged-capability-artifacts.test.ts scripts/__tests__/capability-staging.test.ts
```

Expected: pass.

**Step 7: Commit**

```bash
git add scripts/approve-staged-capability-artifacts.ts scripts/__tests__/approve-staged-capability-artifacts.test.ts scripts/data/staging/lesson-1/exercise-assets.ts
git commit --no-verify -m "content: approve lesson 1 pilot capability artifacts"
```

## Task 5: Wire Promotion Into the Publish Procedure Without Auto-Promoting

**Files:**

- Modify: `scripts/publish-approved-content.ts`
- Modify: `docs/current-system/content-pipeline-and-quality-gates.md`
- Test: `scripts/__tests__/publish-approved-content.test.ts` if it exists; otherwise create `scripts/__tests__/publish-approved-content-capability-output.test.ts`

**Step 1: Write failing test**

The test should verify that `publishCapabilityPipelineOutput` keeps capability rows draft unless an explicit promotion command is run.

```ts
it('publishes capability rows as draft/unknown and does not auto-promote', async () => {
  const upserts: unknown[] = []
  const supabase = fakeSupabase({
    onUpsert(table, payload) {
      if (table === 'learning_capabilities') upserts.push(payload)
      return { data: { id: 'cap-1', canonical_key: payload.canonical_key }, error: null }
    },
  })

  await publishCapabilityPipelineOutput({
    supabase,
    dryRun: false,
    contentUnits: validContentUnits,
    capabilities: validCapabilities,
    lessonPageBlocks: validBlocks,
    exerciseAssets: validAssets,
  })

  expect(upserts[0]).toMatchObject({
    readiness_status: 'unknown',
    publication_status: 'draft',
  })
})
```

If `publishCapabilityPipelineOutput` is not exported, first export it.

This should already be possible after Task 1. Do not add this test until Task 1's import-safety test passes.

**Step 2: Verify the test fails or cannot compile**

Run:

```bash
npm test -- --run scripts/__tests__/publish-approved-content-capability-output.test.ts
```

Expected: fail until the export/test seam is clean.

**Step 3: Add explicit console handoff**

After capability publish, print:

```text
Capability rows were published as draft/unknown.
Run: npx tsx scripts/promote-capabilities.ts --lesson <N> --dry-run
Then: npx tsx scripts/promote-capabilities.ts --lesson <N> --apply
```

Do not auto-promote inside `publish-approved-content.ts`.

**Step 4: Update docs**

In `docs/current-system/content-pipeline-and-quality-gates.md`, update the Publish Gate section to say:

- `publish-approved-content.ts` writes draft catalog rows.
- `promote-capabilities.ts` is the reviewed release gate.
- `ready/published` is required before capability sessions can schedule content.

**Step 5: Run tests**

Run:

```bash
npm test -- --run scripts/__tests__/publish-approved-content-capability-output.test.ts scripts/__tests__/promote-capabilities.test.ts
```

Expected: pass.

**Step 6: Commit**

```bash
git add scripts/publish-approved-content.ts scripts/__tests__/publish-approved-content-capability-output.test.ts docs/current-system/content-pipeline-and-quality-gates.md
git commit --no-verify -m "docs: document capability promotion gate"
```

## Task 6: Add DB-Backed Health Checks for Runtime Readiness

**Files:**

- Modify: `scripts/check-capability-health.ts`
- Modify or create: `scripts/__tests__/check-capability-health.test.ts`
- Read: `src/lib/exercises/exerciseResolver.ts`
- Read: `src/lib/session/capabilitySessionLoader.ts`

**Step 1: Write failing tests**

Add checks for:

- Ready/published capabilities must have at least one approved artifact satisfying required contracts.
- Ready/published capabilities must resolve to at least one exercise render plan.
- Ready/published capabilities with source progress requirements must reference known source refs.
- Draft/unknown capabilities are warnings, not blockers.
- `--lesson <N>` selects DB-backed runtime health for `source_ref = lesson-N`.
- `--staging <path>` keeps the existing staged-file health mode.
- Unknown arguments fail closed instead of silently falling back to Lesson 1 staging.

Example:

```ts
it('fails ready capabilities that have no approved artifact path', () => {
  const report = checkCapabilityHealthSnapshot({
    capabilities: [
      {
        canonicalKey: 'item:makan:meaning_recall:id_to_l1',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['meaning:l1'],
      },
    ],
    artifacts: [],
  })

  expect(report.critical).toContainEqual(expect.objectContaining({
    rule: 'ready_capability_missing_approved_artifact',
  }))
})
```

**Step 2: Run tests to verify failure**

Run:

```bash
npm test -- --run scripts/__tests__/check-capability-health.test.ts
```

Expected: fail until the DB-backed rules exist.

**Step 3: Implement the checks**

Keep checks pure where possible:

```ts
export function checkCapabilityHealthSnapshot(snapshot: CapabilityHealthSnapshot): CapabilityHealthReport
```

Then have the CLI load database rows and call the pure checker.

Update `parseCapabilityHealthArgs` so it returns a discriminated mode:

```ts
type CapabilityHealthArgs =
  | { mode: 'staging'; strict: boolean; stagingPath: string }
  | { mode: 'database'; strict: boolean; lesson: number; sourceRef: string }
```

Rules:

- `--lesson 1` means database-backed check for lesson page blocks where `source_ref = 'lesson-1'`, with the capability set derived from `capability_key_refs` and/or `capability_content_units`.
- `--staging scripts/data/staging/lesson-1` means existing staged-file check.
- `--lesson` and `--staging` are mutually exclusive.
- Unknown arguments throw.

**Step 4: Run tests**

Run:

```bash
npm test -- --run scripts/__tests__/check-capability-health.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add scripts/check-capability-health.ts scripts/__tests__/check-capability-health.test.ts
git commit --no-verify -m "test: enforce runtime capability health checks"
```

## Task 7: Verify and Document Migration Execution

**Files:**

- Create: `docs/current-system/capability-release-runbook.md`
- Modify: `docs/current-system/capability-system-handoff.md`
- Read: `scripts/migrations/2026-04-25-capability-core.sql`
- Read: `scripts/migrations/2026-04-25-content-units-lesson-blocks.sql`
- Read: `scripts/migrations/2026-04-25-capability-review-rpc.sql`
- Note: source progress tables and RPC live in `scripts/migrations/2026-04-25-capability-core.sql`. There is no separate `2026-04-25-source-progress-rpc.sql` file.

**Step 1: Write the runbook**

Include exact order:

```bash
# 1. Apply core capability migration
# 2. Apply content unit / lesson block migration
# 3. Apply capability review RPC migration
# 4. Deploy Edge Function commit-capability-answer-report
# 5. Run schema visibility checks
# 6. Verify/approve a small Lesson 1 pilot artifact set
# 7. Publish Lesson 1 in dry-run
# 8. Publish Lesson 1 for real
# 9. Promote Lesson 1 capabilities dry-run
# 10. Promote Lesson 1 capabilities for real
# 11. Run DB-backed health checks
# 12. Run browser smoke tests
```

For each command, document:

- Required environment variables.
- Expected success output.
- Rollback decision point.
- What not to do if a step fails.

**Step 2: Add schema visibility queries**

Document:

```sql
select to_regclass('indonesian.learning_capabilities');
select to_regclass('indonesian.content_units');
select to_regclass('indonesian.lesson_page_blocks');
select to_regclass('indonesian.capability_artifacts');
select to_regclass('indonesian.learner_source_progress_state');
select to_regclass('indonesian.capability_review_events');
```

**Step 3: Add table-count queries**

Document:

```sql
select count(*) from indonesian.content_units;
select count(*) from indonesian.lesson_page_blocks;
select readiness_status, publication_status, count(*)
from indonesian.learning_capabilities
group by readiness_status, publication_status;
select count(*) from indonesian.capability_artifacts;
```

**Step 4: Commit**

```bash
git add docs/current-system/capability-release-runbook.md docs/current-system/capability-system-handoff.md
git commit --no-verify -m "docs: add capability release runbook"
```

## Task 8: Run a Supabase Publish Smoke Test

**Files:**

- No production code changes unless the smoke test exposes defects.
- Update: `docs/current-system/capability-release-runbook.md` with actual command outputs and dates.

**Step 1: Dry-run publish**

Run:

```bash
npx tsx scripts/publish-approved-content.ts 1 --dry-run
```

Expected:

- Staging validation passes.
- It reports planned upserts for content units, lesson page blocks, capabilities, and exercise assets.
- No DB writes happen.

**Step 2: Real publish**

Run only after dry-run is clean:

```bash
npx tsx scripts/publish-approved-content.ts 1
```

Expected:

- `content_units` count increases or idempotently remains stable.
- `lesson_page_blocks` count increases or idempotently remains stable.
- `learning_capabilities` has Lesson 1 rows as `unknown/draft`.
- `capability_artifacts` has approved artifacts only for the reviewed pilot subset; generated placeholders remain draft.

**Step 3: Run readiness audit**

Run:

```bash
npx tsx scripts/check-capability-release-readiness.ts --lesson 1
```

Expected before promotion:

- Fails with blocker: no ready/published capabilities.
- This failure is correct.

**Step 4: Commit runbook update**

```bash
git add docs/current-system/capability-release-runbook.md
git commit --no-verify -m "docs: record capability publish smoke test"
```

## Task 9: Run Promotion Smoke Test

**Files:**

- Update: `docs/current-system/capability-release-runbook.md`

**Step 1: Dry-run promotion**

Run:

```bash
npx tsx scripts/promote-capabilities.ts --lesson 1 --dry-run
```

Expected:

- Lists exact capabilities that will become `ready/published`.
- Lists blocked/exposure-only capabilities with reasons.
- For the first smoke release, promotions may be limited to the small reviewed artifact subset.
- If zero promotions are listed, stop: either the artifact approval task did not create concrete approved payloads or the resolver/contract gate is blocking correctly.
- No DB writes.

**Step 2: Apply promotion**

Run only after reviewing the dry-run report:

```bash
npx tsx scripts/promote-capabilities.ts --lesson 1 --apply
```

Expected:

- Only eligible capabilities are updated.
- Blocked capabilities remain non-reviewable.

**Step 3: Run readiness audit**

Run:

```bash
npx tsx scripts/check-capability-release-readiness.ts --lesson 1
```

Expected:

- No blockers for catalog/session availability.
- Warnings about source progress are acceptable until browser smoke test.

**Step 4: Commit runbook update**

```bash
git add docs/current-system/capability-release-runbook.md
git commit --no-verify -m "docs: record capability promotion smoke test"
```

## Task 10: Browser Smoke Test the Lesson Reader and Source Progress

**Files:**

- Modify only if failures are found:
  - `src/components/lessons/LessonReader.tsx`
  - `src/services/sourceProgressService.ts`
  - `src/services/lessonService.ts`
- Update: `docs/current-system/capability-release-runbook.md`

**Step 1: Start dev server with flags**

Use local flags that enable the new reader without enabling capability sessions globally:

```bash
$env:VITE_LESSON_READER_V2='true'
npm run dev
```

**Step 2: Open DB-backed lesson**

In browser, open a normal lesson route, not `/preview`.

Expected:

- The lesson renders from `lesson_page_blocks`.
- It does not fall back silently to legacy when DB rows exist.
- It emits `opened` and section-level source progress events.

**Step 3: Verify source progress rows**

Run:

```sql
select source_ref, source_section_ref, current_state, completed_event_types
from indonesian.learner_source_progress_state
where user_id = '<test-user-id>'
order by updated_at desc;
```

Expected:

- At least one row for Lesson 1.
- Section events match lesson page block refs.

**Step 4: Update runbook**

Record:

- Browser route tested.
- User id or test account.
- Source progress rows observed.
- Any fallback behavior.

**Step 5: Commit**

```bash
git add docs/current-system/capability-release-runbook.md
git commit --no-verify -m "docs: record lesson reader source progress smoke test"
```

## Task 11: Browser Smoke Test Capability Sessions and FSRS Commits

**Files:**

- Modify only if failures are found:
  - `src/pages/Session.tsx`
  - `src/components/experience/ExperiencePlayer.tsx`
  - `src/services/capabilitySessionDataService.ts`
  - `src/services/capabilityReviewService.ts`
  - `supabase/functions/commit-capability-answer-report/index.ts`
- Update: `docs/current-system/capability-release-runbook.md`

**Step 1: Enable session flags locally**

Use the smallest flag set needed for the new path:

```bash
$env:VITE_CAPABILITY_STANDARD_SESSION='true'
$env:VITE_EXPERIENCE_PLAYER_V1='true'
npm run dev
```

**Step 2: Start a standard session**

Expected:

- Capability session data loads ready/published capabilities.
- The Experience Player renders Dutch learner-facing cards.
- No raw canonical keys are shown in the primary player.
- New introductions are only included when source progress and prerequisites allow them.

**Step 3: Answer one due card or introduction**

Expected:

- UI shows saved Dutch completion copy.
- On failure, UI shows the save error and keeps the card unanswered.

**Step 4: Verify review event and learner state**

Run:

```sql
select id, user_id, capability_id, rating, state_before_json, state_after_json, created_at
from indonesian.capability_review_events
where user_id = '<test-user-id>'
order by created_at desc
limit 5;

select capability_id, activation_state, review_count, state_version, next_due_at, last_reviewed_at
from indonesian.learner_capability_state
where user_id = '<test-user-id>'
order by updated_at desc
limit 5;
```

Expected:

- One review event is created.
- Learner capability state advances by one version.
- First-review introduction activates dormant state through the Review Processor.
- `last_reviewed_at` uses server time, not client-supplied time.

**Step 5: Verify idempotency**

If feasible, repeat the same Edge Function payload with the same idempotency key.

Expected:

- It returns `duplicate_returned`.
- It does not create a second review event.

**Step 6: Commit fixes or runbook update**

```bash
git add docs/current-system/capability-release-runbook.md
git commit --no-verify -m "docs: record capability session smoke test"
```

## Task 12: Add Final Release Gate Command

**Files:**

- Modify: `package.json`
- Create or modify: `scripts/run-capability-release-gate.ts`
- Create: `scripts/__tests__/run-capability-release-gate.test.ts`

**Step 1: Write failing test**

Test command composition without actually touching Supabase.

```ts
it('runs release gate checks in the required order', () => {
  expect(buildCapabilityReleaseGateCommands({ lesson: 1 })).toEqual([
    'npm test -- --run scripts/__tests__/promote-capabilities.test.ts scripts/__tests__/check-capability-release-readiness.test.ts',
    'npm test -- --run scripts/__tests__/approve-staged-capability-artifacts.test.ts',
    'npx tsx scripts/publish-approved-content.ts 1 --dry-run',
    'npx tsx scripts/approve-staged-capability-artifacts.ts --lesson 1 --dry-run',
    'npx tsx scripts/promote-capabilities.ts --lesson 1 --dry-run',
    'npx tsx scripts/check-capability-health.ts --lesson 1 --strict',
    'npx tsx scripts/check-capability-release-readiness.ts --lesson 1',
    'npm run build',
  ])
})
```

**Step 2: Implement command**

Add script:

```json
{
  "scripts": {
    "capability:release-gate": "tsx scripts/run-capability-release-gate.ts"
  }
}
```

CLI:

```bash
npm run capability:release-gate -- --lesson 1
```

**Step 3: Run tests**

Run:

```bash
npm test -- --run scripts/__tests__/run-capability-release-gate.test.ts
```

Expected: pass.

**Step 4: Run release gate**

Run:

```bash
npm run capability:release-gate -- --lesson 1
```

Expected:

- Stops on first failed command.
- Prints the exact failed command.

**Step 5: Commit**

```bash
git add package.json scripts/run-capability-release-gate.ts scripts/__tests__/run-capability-release-gate.test.ts
git commit --no-verify -m "chore: add capability release gate command"
```

## Task 13: Final Verification Before Enabling Flags

**Files:**

- Modify: `.env.example` if feature flags are documented there.
- Modify: `docs/current-system/capability-release-runbook.md`
- Do not modify `.env.local`.

**Step 1: Run targeted tests**

Run:

```bash
npm test -- --run src/__tests__/ExperiencePlayer.test.tsx src/__tests__/capabilitySessionDataService.test.ts src/__tests__/capabilityReviewProcessor.test.ts scripts/__tests__/approve-staged-capability-artifacts.test.ts scripts/__tests__/promote-capabilities.test.ts scripts/__tests__/check-capability-release-readiness.test.ts
```

Expected: pass.

**Step 2: Run TypeScript**

Run:

```bash
npx tsc -p tsconfig.app.json --noEmit --pretty false
```

Expected: pass.

**Step 3: Run build**

Run:

```bash
npm run build
```

Expected: pass. Bundle-size warnings are acceptable but must be recorded.

**Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected current branch reality:

- If pre-existing hook errors still exist in older admin/coverage pages, document them as unrelated residuals.
- Do not call release clean until either lint passes or those errors are fixed.

**Step 5: Commit final docs**

```bash
git add docs/current-system/capability-release-runbook.md
git commit --no-verify -m "docs: record final capability release verification"
```

## Task 14: Merge Readiness Review

**Files:**

- No code changes unless review finds bugs.

**Step 1: Request fresh review**

Ask a fresh reviewer to inspect:

- Promotion gate security and correctness.
- Artifact approval gate and proof that placeholders cannot become approved.
- Draft vs ready/published boundary.
- DB-backed health checks.
- Source progress smoke path.
- Capability session FSRS commit path.
- Whether direct Edge calls can still create inappropriate learner state.

**Step 2: Address findings**

For every P1/P2 finding:

1. Write or update a failing test.
2. Fix the issue.
3. Run targeted tests.
4. Run build/typecheck if relevant.
5. Commit.
6. Re-review.

**Step 3: Final push**

```bash
git push
```

## Done Criteria

This completion work is done only when:

- Migrations are applied or the runbook identifies the exact unapplied migration blocker.
- `publish-approved-content.ts 1 --dry-run` passes.
- Lesson 1 publishes content units, lesson page blocks, capabilities, relationships, and artifacts.
- Promotion dry-run lists which capabilities become `ready/published`.
- Approved artifacts exist only for concrete reviewed payloads, not placeholders.
- Promotion apply updates only validated capabilities.
- DB-backed health checks have no critical findings for ready/published capabilities.
- DB-backed lesson reader renders Lesson 1 from `lesson_page_blocks`.
- Source progress rows are created from the lesson reader.
- Capability session loads real ready/published capabilities.
- A capability answer creates a review event and advances learner capability state through the Edge Function.
- Repeated idempotency key returns `duplicate_returned`.
- Fresh review finds no P1/P2 blockers.

## Explicit Non-Goals

- Building the full Content Workshop UI.
- Automating multi-agent orchestration.
- Migrating all lessons.
- Enabling podcast or morphology production content beyond existing pilot scaffolding.
- Replacing legacy session paths globally before Lesson 1 proves stable.
