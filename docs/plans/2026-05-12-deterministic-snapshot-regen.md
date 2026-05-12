---
status: implementing
implementation: branch fold/capability-stage (commits 97ceec8, 2140668, 957ba0c, b3b1ef1, 2d7f646, efd2fb6, 077f8bd, d078661, 5ce328e)
implementation_paths:
  - scripts/lib/content-pipeline-output.ts
  - scripts/lib/pipeline/capability-stage/loader.ts
  - scripts/lib/pipeline/capability-stage/runner.ts
  - scripts/lib/pipeline/lesson-stage/enrichGrammarTopics.ts
  - scripts/lib/pipeline/lesson-stage/runner.ts
  - scripts/data/staging/lesson-*/grammar-patterns.ts
  - .claude/agents/linguist-structurer.md
follow_ups:
  - CS7 count-parity query at scripts/lib/pipeline/capability-stage/verify/countParity.ts:43-49 filters source_ref='lesson-N' but only lesson_section content units have that key; widen the query.
  - projectors/vocab.ts:109-113 review_status filter excludes 'published' items, so re-publishes never refresh learning_items rows in the DB.
---

# Deterministic snapshot regeneration — remove approval state from pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the slice-10 staging drift bug. Snapshot files (`content-units.ts`, `lesson-page-blocks.ts`, `exercise-assets.ts`) are generated up-front by `generate-staging-files.ts` and then go stale when the capability-stage runner enriches `learning-items.ts` (POS, EN translations, dialogue translation propagation). Today the runner uploads the stale snapshots to the DB.

**Architecture:** Move snapshot generation into the capability-stage runner, after enrichment, so they're built from final data. Remove all approval-state plumbing — the pipeline emits `quality_status: 'approved'` for everything it generates, no manual review gates. Replace the placeholder `draftArtifactAssets` builder with a real per-artifact-kind builder that materializes payloads from staging fields. Delete the two legacy auto-fill/approval scripts.

**Tech stack:** TypeScript + Bun. Tests via Vitest. The affected code lives under `scripts/lib/pipeline/capability-stage/`, `scripts/lib/content-pipeline-output.ts`, and `scripts/generate-staging-files.ts`.

---

## Pre-flight context (read before starting)

The current drift (verified on disk during planning):

- `loader.ts:147-152` reads 4 snapshot files from disk verbatim.
- `runner.ts:144-208` enriches `learning-items.ts` in memory + on disk (POS, level, EN translations, dialogue NL propagation).
- `runner.ts:264-371` upserts the snapshots as-is — they don't see the enriched translations.
- `content-pipeline-output.ts:241-244` (content-units payload), `:366-371` (capability-staging snapshot.learningItems.meanings), `:762` (lesson-page-blocks vocab strip) all embed `translation_nl`/`translation_en` directly.

The 8 artifact_kinds and their canonical sources (verified by grepping all lessons' `exercise-assets.ts`):

| artifact_kind | Source field |
|---|---|
| `base_text` | `learning_items.base_text` |
| `accepted_answers:id` | `[learning_items.base_text]` |
| `accepted_answers:l1` | `[learning_items.translation_nl]` |
| `meaning:l1` | `learning_items.translation_nl` |
| `root_derived_pair` | `morphology-patterns.ts` root + derived |
| `allomorph_rule` | `morphology-patterns.ts` allomorphRule |
| `pattern_explanation:l1` | `grammar-patterns.ts` description |
| `pattern_example` | **NEW** structured field in `grammar-patterns.ts` (today embedded in description prose) |

Today's `draftArtifactAssets` (content-pipeline-output.ts:325-339) emits placeholders only. Real payloads are filled by `scripts/auto-fill-capability-artifacts-from-legacy.ts` (one-time legacy backfill) and `scripts/approve-staged-capability-artifacts.ts` (manual approval flips). Both become obsolete with this change.

The runtime filter `.eq('quality_status', 'approved')` at `src/services/capabilityContentService.ts:160` stays — it becomes a no-op safety net since the pipeline always emits `'approved'`.

---

## Task 1: Add `example` field to grammar-patterns staging schema

**Files:**
- Modify: `scripts/data/staging/lesson-N/grammar-patterns.ts` (all lessons that have grammar patterns)
- Modify: `.claude/agents/linguist-structurer.md` (update prompt to extract `example` field)
- Modify: `scripts/lib/content-pipeline-output.ts` (extend type signature)

**Step 1.1: Extend `CurrentGrammarPattern` type to include optional `example`**

Find the type in `scripts/lib/content-pipeline-output.ts` (or wherever `grammarPatterns` array type is defined — grep for `pattern_name: string`).

Add field:
```ts
example?: string  // e.g. "Sepedanya hitam — Zijn/haar fiets is zwart"
```

**Step 1.2: Backfill the field in existing grammar-patterns.ts files**

For each lesson that has a `pattern_example` artifact today in `exercise-assets.ts`, copy the existing approved payload value into the matching pattern's new `example` field.

Verification: `grep -A2 'pattern_example' scripts/data/staging/lesson-*/exercise-assets.ts` shows current values to migrate.

**Step 1.3: Update linguist-structurer prompt**

In `.claude/agents/linguist-structurer.md`, add to the grammar-patterns output spec: "Extract one short example sentence per pattern. Format: `'Indonesian — Dutch'`. Place in the `example` field."

**Step 1.4: Commit**

```bash
git add scripts/lib/content-pipeline-output.ts scripts/data/staging/lesson-*/grammar-patterns.ts .claude/agents/linguist-structurer.md
git commit -m "feat(pipeline): add structured example field to grammar-patterns staging"
```

---

## Task 2: Replace `draftArtifactAssets` with a real per-kind artifact builder

**Files:**
- Modify: `scripts/lib/content-pipeline-output.ts` (replace lines 325-339)
- Create: `scripts/lib/content-pipeline-output.test.ts` (or add to existing test file)

**Step 2.1: Write failing tests**

Create test cases for each of the 8 artifact_kinds. Each test:
- Builds a minimal `ProjectedCapability` for that kind.
- Calls the new builder.
- Asserts `payload_json` has the expected shape and embedded source value.
- Asserts `quality_status: 'approved'`.

Example for `meaning:l1`:
```ts
it('emits meaning:l1 with translation_nl as the value', () => {
  const result = buildArtifactsForCapability(
    { canonicalKey: 'cap:v1:item:...', sourceRef: 'learning_items/akan', requiredArtifacts: ['meaning:l1'], ... },
    { learningItemsBySourceRef: new Map([['learning_items/akan', { base_text: 'akan', translation_nl: 'zullen' }]]), ... }
  )
  expect(result).toEqual([{
    asset_key: 'cap:v1:item:...:meaning:l1',
    capability_key: 'cap:v1:item:...',
    artifact_kind: 'meaning:l1',
    quality_status: 'approved',
    payload_json: { value: 'zullen' },
  }])
})
```

Run: `bun run test -- content-pipeline-output` → expected FAIL.

**Step 2.2: Implement the new builder**

Replace `draftArtifactAssets` with:

```ts
interface ArtifactBuildContext {
  learningItemsBySourceRef: Map<string, { base_text: string; translation_nl?: string }>
  grammarPatternsBySourceRef: Map<string, { pattern_name: string; description: string; example?: string }>
  affixedFormPairsBySourceRef: Map<string, { root: string; derived: string; allomorphRule: string }>
}

function buildArtifactsForCapability(
  capability: ProjectedCapability,
  ctx: ArtifactBuildContext,
): StagingExerciseAsset[] {
  return capability.requiredArtifacts.map(kind => ({
    asset_key: `${capability.canonicalKey}:${kind}`,
    capability_key: capability.canonicalKey,
    artifact_kind: kind,
    quality_status: 'approved',
    payload_json: buildPayloadForKind(kind, capability, ctx),
  }))
}

function buildPayloadForKind(kind: string, capability: ProjectedCapability, ctx: ArtifactBuildContext): Record<string, unknown> {
  switch (kind) {
    case 'base_text': {
      const item = ctx.learningItemsBySourceRef.get(capability.sourceRef)
      if (!item) throw new Error(`No learning_item for sourceRef ${capability.sourceRef}`)
      return { value: item.base_text }
    }
    case 'accepted_answers:id': {
      const item = ctx.learningItemsBySourceRef.get(capability.sourceRef)
      if (!item) throw new Error(...)
      return { values: [item.base_text] }
    }
    case 'accepted_answers:l1': {
      const item = ctx.learningItemsBySourceRef.get(capability.sourceRef)
      if (!item?.translation_nl) throw new Error(...)
      return { values: [item.translation_nl] }
    }
    case 'meaning:l1': {
      const item = ctx.learningItemsBySourceRef.get(capability.sourceRef)
      if (!item?.translation_nl) throw new Error(...)
      return { value: item.translation_nl }
    }
    case 'root_derived_pair': {
      const pair = ctx.affixedFormPairsBySourceRef.get(capability.sourceRef)
      if (!pair) throw new Error(...)
      return { root: pair.root, derived: pair.derived }
    }
    case 'allomorph_rule': {
      const pair = ctx.affixedFormPairsBySourceRef.get(capability.sourceRef)
      if (!pair) throw new Error(...)
      return { rule: pair.allomorphRule }
    }
    case 'pattern_explanation:l1': {
      const pattern = ctx.grammarPatternsBySourceRef.get(capability.sourceRef)
      if (!pattern) throw new Error(...)
      return { value: pattern.description }
    }
    case 'pattern_example': {
      const pattern = ctx.grammarPatternsBySourceRef.get(capability.sourceRef)
      if (!pattern?.example) throw new Error(`grammar pattern ${capability.sourceRef} missing example field`)
      return { value: pattern.example }
    }
    default:
      throw new Error(`Unknown artifact_kind: ${kind}`)
  }
}
```

Wire the new builder into `buildCapabilityStagingFromContent`: replace `capabilities.flatMap(draftArtifactAssets)` (line 417) with `capabilities.flatMap(cap => buildArtifactsForCapability(cap, ctx))`. Build the ctx maps from `input.learningItems`, `input.grammarPatterns`, and `input.affixedFormPairs`.

**Step 2.3: Run tests**

Run: `bun run test -- content-pipeline-output` → expected PASS for all 8 kinds.

**Step 2.4: Commit**

```bash
git add scripts/lib/content-pipeline-output.ts scripts/lib/__tests__/
git commit -m "feat(pipeline): deterministic per-kind artifact builder; always emit approved"
```

---

## Task 3: Extend capability-stage loader to read morphology-patterns.ts

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/loader.ts` (lines 47-65 and 132-165)

**Step 3.1: Add `affixedFormPairs` to `LoadedStaging` interface**

In `loader.ts:47-57`:
```ts
export interface LoadedStaging {
  learningItems: Array<Record<string, unknown>>
  grammarPatterns: Array<Record<string, unknown>>
  candidates: Array<Record<string, unknown>>
  clozeContexts: Array<Record<string, unknown>>
  contentUnits: Array<Record<string, unknown>>
  capabilities: Array<Record<string, unknown>>
  lessonPageBlocks: Array<Record<string, unknown>>
  exerciseAssets: Array<Record<string, unknown>>
  affixedFormPairs: Array<Record<string, unknown>>  // NEW
  stagingDir: string
}
```

**Step 3.2: Load `morphology-patterns.ts` in `loadStagingFiles`**

Extend the `Promise.all` at line 147-152 to add a 5th read, then return it:

```ts
const [contentUnits, capabilities, lessonPageBlocks, exerciseAssets, affixedFormPairs] = await Promise.all([
  readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'content-units.ts')),
  readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'capabilities.ts')),
  readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'lesson-page-blocks.ts')),
  readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'exercise-assets.ts')),
  readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'morphology-patterns.ts')),
])
```

Update the return at line 154-165 to include `affixedFormPairs: affixedFormPairs ?? []`.

**Step 3.3: Verify**

Run: `bun run test -- capability-stage` → expected PASS.
Run for lesson-9: trace that the affixedFormPairs array now contains 2 entries.

**Step 3.4: Commit**

```bash
git add scripts/lib/pipeline/capability-stage/loader.ts
git commit -m "feat(pipeline): capability-stage loader reads morphology-patterns.ts"
```

---

## Task 4: Add snapshot regeneration step inside the runner

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/runner.ts` (insert new step between current line 208 and line 211)

**Step 4.1: Write failing test for the regeneration sequence**

Test that after running the capability-stage runner, the upserted snapshots reflect the enriched learning items, not the stale staging snapshots.

In `scripts/lib/pipeline/capability-stage/__tests__/runner.test.ts`:
- Set up a fake supabase that captures upsert payloads.
- Set up staging where `learning-items.ts` has a row with empty `translation_en`, and `content-units.ts` has the same item with empty `translationEn` in payload_json.
- Mock `enrichMissingEnTranslations` to fill in a value.
- Run the runner.
- Assert the captured `upsertContentUnits` call received a payload where `translationEn` is populated.

Run: `bun run test -- runner` → expected FAIL.

**Step 4.2: Implement the regeneration step**

After the existing enrichment block (`runner.ts:206-208`), before validation (line 211), regenerate the three snapshots using the now-enriched in-memory state:

```ts
if (!input.dryRun) {
  // ... existing enrichment block ...
}

// ---- 1b. Regenerate slice-10 snapshots from final enriched data. ----
// Snapshots are derived state; they go stale if produced before enrichment.
// Regenerate them here so the upsert at step 4 sees fresh translations,
// morphology, and grammar pattern data.
const pipelineInput: StagingLessonInput = {
  lessonNumber: input.lessonNumber,
  lesson: {
    title: loaded.lesson.title,
    description: '',
    level: loaded.lesson.level,
    module_id: loaded.lesson.module_id,
    order_index: loaded.lesson.order_index,
    sections: loaded.sections.map(s => ({
      title: s.title,
      order_index: s.order_index,
      content: s.content as { type: string; [key: string]: unknown },
    })),
  },
  learningItems: staging.learningItems as StagingLessonInput['learningItems'],
  grammarPatterns: staging.grammarPatterns as StagingLessonInput['grammarPatterns'],
  affixedFormPairs: staging.affixedFormPairs as StagingLessonInput['affixedFormPairs'],
}
const regeneratedContentUnits = buildContentUnitsFromStaging(pipelineInput)
const regeneratedCapabilityPlan = buildCapabilityStagingFromContent({
  ...pipelineInput,
  contentUnits: regeneratedContentUnits,
})
const regeneratedPageBlocks = buildLessonPageBlocksFromStaging({
  ...pipelineInput,
  contentUnits: regeneratedContentUnits,
  capabilities: regeneratedCapabilityPlan.capabilities,
})

// Replace the stale staging snapshots with fresh ones for the rest of the runner.
staging.contentUnits = regeneratedContentUnits as never
staging.capabilities = regeneratedCapabilityPlan.capabilities as never
staging.exerciseAssets = regeneratedCapabilityPlan.exerciseAssets as never
staging.lessonPageBlocks = regeneratedPageBlocks as never

// Write back to disk so subsequent runs see the same state and the linguist
// reviewer can inspect what was published.
if (!input.dryRun) {
  fs.writeFileSync(path.join(staging.stagingDir, 'content-units.ts'),
    `// Regenerated by capability-stage runner\nexport const contentUnits = ${JSON.stringify(regeneratedContentUnits, null, 2)}\n`)
  fs.writeFileSync(path.join(staging.stagingDir, 'capabilities.ts'),
    `// Regenerated by capability-stage runner\nexport const capabilities = ${JSON.stringify(regeneratedCapabilityPlan.capabilities, null, 2)}\n`)
  fs.writeFileSync(path.join(staging.stagingDir, 'exercise-assets.ts'),
    `// Regenerated by capability-stage runner\nexport const exerciseAssets = ${JSON.stringify(regeneratedCapabilityPlan.exerciseAssets, null, 2)}\n`)
  fs.writeFileSync(path.join(staging.stagingDir, 'lesson-page-blocks.ts'),
    `// Regenerated by capability-stage runner\nexport const lessonPageBlocks = ${JSON.stringify(regeneratedPageBlocks, null, 2)}\n`)
}
```

Add imports at the top of runner.ts:
```ts
import fs from 'node:fs'
import path from 'node:path'
import {
  buildContentUnitsFromStaging,
  buildCapabilityStagingFromContent,
  buildLessonPageBlocksFromStaging,
  type StagingLessonInput,
} from '../../content-pipeline-output'
```

**Step 4.3: Run tests**

Run: `bun run test -- runner` → expected PASS.
Run all pipeline tests: `bun run test -- pipeline` → expected PASS.

**Step 4.4: Commit**

```bash
git add scripts/lib/pipeline/capability-stage/runner.ts scripts/lib/pipeline/capability-stage/__tests__/runner.test.ts
git commit -m "feat(pipeline): regenerate slice-10 snapshots after enrichment"
```

---

## Task 5: Wire `affixedFormPairs` into `generate-staging-files.ts` initial generation

**Files:**
- Modify: `scripts/generate-staging-files.ts` (verify it already passes affixedFormPairs)

`scripts/generate-staging-files.ts:381` already reads `morphology-patterns.ts` via `inputFromExistingStaging`. Confirm it still flows through `buildPipeline` after task 2's changes — no edit expected, just verification.

**Step 5.1: Smoke test lesson-9 generation**

Run: `bun scripts/generate-staging-files.ts 9 --dry-run`

Expected output mentions 2 affixed form pairs in summary.

**Step 5.2: Commit (if any edits needed; otherwise skip)**

---

## Task 6: Delete the legacy auto-fill and approve scripts

**Files:**
- Delete: `scripts/auto-fill-capability-artifacts-from-legacy.ts`
- Delete: `scripts/approve-staged-capability-artifacts.ts`
- Search for references and remove

**Step 6.1: Grep for references**

```bash
grep -rn "auto-fill-capability-artifacts-from-legacy\|approve-staged-capability-artifacts" --include="*.ts" --include="*.md" --include="Makefile" .
```

Remove any references in docs, Makefile, or other scripts.

**Step 6.2: Delete the files**

```bash
git rm scripts/auto-fill-capability-artifacts-from-legacy.ts scripts/approve-staged-capability-artifacts.ts
```

Also remove any test files for these scripts.

**Step 6.3: Re-run full test suite**

Run: `bun run test` → expected PASS.

**Step 6.4: Commit**

```bash
git add -A
git commit -m "chore(pipeline): remove obsolete approval scripts"
```

---

## Task 7: Remove `review_status` field from staging files (deferred until verified safe)

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/stagingWriteback.ts`
- Modify: `scripts/lib/pipeline/capability-stage/runner.ts`
- Modify: staging files (regenerated on next run anyway)

This step is **optional** for the first PR. The runtime publish-as-is policy already treats `pending_review` and `approved` identically (per CLAUDE.md). The `review_status` field exists for diagnostics; removing it is cleanup, not correctness.

**Defer this task to a follow-up PR** unless time allows. Flagged here so it's not forgotten.

---

## Task 8: Update CLAUDE.md to reflect the new pipeline contract

**Files:**
- Modify: `CLAUDE.md` (the Content Management section)

**Step 8.1: Document the new behavior**

In the "Adding a new lesson (lessons 4+) — full pipeline" section, add a note under step 7 (Publish):

> The publish script regenerates `content-units.ts`, `capabilities.ts`, `exercise-assets.ts`, and `lesson-page-blocks.ts` inside the capability-stage runner, after enrichment runs. Treat these four files as derived state — your edits will be overwritten on the next publish. Authoritative inputs are `learning-items.ts`, `grammar-patterns.ts`, and `morphology-patterns.ts`.

Remove any mention of `auto-fill-capability-artifacts-from-legacy.ts` or `approve-staged-capability-artifacts.ts`.

**Step 8.2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update content pipeline contract for deterministic snapshots"
```

---

## Task 9: Smoke-publish lesson-9 end-to-end (verification)

**Step 9.1: Dry-run publish**

```bash
bun scripts/publish-approved-content.ts 9 --dry-run
```

Expected: validation passes, summary shows non-zero counts for content units, capabilities, exercise assets.

**Step 9.2: Inspect the regenerated files**

```bash
grep "translationEn\|placeholder" scripts/data/staging/lesson-9/content-units.ts | head -5
grep "placeholder" scripts/data/staging/lesson-9/exercise-assets.ts | head -5
```

Expected: `translationEn` values are populated (post-enrichment), no `"placeholder": true` payloads remain.

**Step 9.3: Real publish (only if dry-run looks good)**

```bash
bun scripts/publish-approved-content.ts 9
```

**Step 9.4: Spot-check the DB**

In Supabase Studio, query `indonesian.capability_artifacts` for lesson-9 morphology rows. Confirm `quality_status = 'approved'` and `artifact_json` carries real payloads (not `placeholder: true`).

---

## Out of scope

- Removing the runtime `quality_status === 'approved'` filter. Stays as defense-in-depth.
- Renaming `capability_artifacts` table or schema changes. Pure code change.
- Touching legacy lessons 1–3, which already have populated artifact data from the auto-fill. Their data stays — only the *script* that wrote it goes away.
