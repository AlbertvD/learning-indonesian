# Auto-Fill Capability Artifacts From Legacy DB — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every task that creates a new module.

**Goal:** Implement the spec at `docs/plans/2026-04-30-auto-fill-capability-artifacts-from-legacy-spec.md`. Take ~5,800 draft `capability_artifacts` rows currently filled with `{ placeholder: true }`, project concrete payloads from the legacy authored DB tables, flip them to `quality_status='approved'`, and write the resulting payloads back to per-lesson `exercise-assets.ts` staging files. Then promote per-lesson and verify the `lesson_practice` session route renders real exercises.

**Architecture:** One new script with pure planning functions tested without a DB, a thin DB-touching adapter, a staging merge step, and a CLI wrapper. No changes to the existing capability projection, contracts, or resolver. No schema migrations.

**Tech Stack:** TypeScript scripts, Vitest, Supabase service-role client, existing capability/staging modules.

---

## Source Spec

Implement against `docs/plans/2026-04-30-auto-fill-capability-artifacts-from-legacy-spec.md`. Cite the spec section in commit messages where decisions trace back to it.

## Global Execution Rules

- TDD: every task that creates a new function writes a failing test first, runs it, then implements. Run tests after each step.
- Per-chunk Postgres transactions for any DB UPDATE batch.
- Never overwrite manually-reviewed staging entries (`reviewedBy != 'auto-from-legacy-db'`).
- Service-role only for the script. Never run from a browser context.
- Determinism: byte-identical output on re-runs against unchanged source.
- Non-zero exit on any unresolved CRITICAL finding.

## Review Gates

Run these before each milestone:
1. Before Task 1 (this gate is the spec review, already done — three reviewers).
2. After Task 4 (script complete, before any DB writes): code review.
3. After Task 5 (DB writes applied): SQL spot-check of artifact state.
4. After Task 7 (browser smoke test): final ready-to-ship review.

---

## Task 1: Pure Planning Functions + Tests

**Files:**
- Create: `scripts/auto-fill-capability-artifacts-from-legacy.ts` (planning functions only; no DB calls yet)
- Create: `scripts/__tests__/auto-fill-capability-artifacts-planning.test.ts`

**Functions to export (pure, no I/O):**

```ts
export interface ArtifactPlanInput {
  capability: { canonicalKey: string; sourceKind: string; sourceRef: string; capabilityType: string }
  artifactKind: string
  source: ItemSource | PatternSource | AffixedFormPairSource
}

export interface ArtifactPlanOutput {
  decision: 'fill' | 'skip'
  payloadJson?: Record<string, unknown>
  warning?: string
  critical?: string
}

export function planMeaningL1(item: ItemSource): ArtifactPlanOutput
export function planBaseText(item: ItemSource): ArtifactPlanOutput
export function planAcceptedAnswersId(item: ItemSource): ArtifactPlanOutput
export function planAcceptedAnswersL1(item: ItemSource): ArtifactPlanOutput
export function planPatternExplanationL1(pattern: PatternSource): ArtifactPlanOutput
export function planPatternExample(pattern: PatternSource, lessonGrammarSection: GrammarSection): ArtifactPlanOutput
export function planRootDerivedPair(pair: AffixedFormPairSource): ArtifactPlanOutput
export function planAllomorphRule(pair: AffixedFormPairSource): ArtifactPlanOutput

export function tokenizePatternName(name: string): string[]
export function splitAcceptedL1(text: string): string[]
```

**Step 1: Write failing planning-function tests.**

Test cases (mirror `2026-04-30-auto-fill-capability-artifacts-from-legacy-spec.md` §11):

- Item with single NL meaning → `planMeaningL1` returns `decision='fill'` with `{ value: <translation>, reviewedBy: 'auto-from-legacy-db', reviewedAt, autoFillVersion: '1' }`.
- Item with two `is_primary=true` NL meanings → picks longest non-empty + emits warning.
- Item with no NL meaning → `decision='skip'` with reason in payload.
- `splitAcceptedL1('eten ; te eten / consumeren')` → `['eten', 'te eten', 'consumeren']`.
- Pattern with `short_explanation < 20 chars` → `planPatternExplanationL1` fills with WARNING.
- Pattern with `pattern.name='Werkwoord (kata kerja)'` → `tokenizePatternName` returns `['werkwoord']`.
- Pattern with no matching category title and no keyword match → falls through to lesson-wide first example with WARNING.
- Pattern with no examples at all → `decision='skip'`.
- Affixed form pair from staging → fills `root_derived_pair` and `allomorph_rule`.
- Affixed form pair whose `pair.id` doesn't match → `decision='skip'`.
- Auto-fill produces an empty trimmed value → `decision='skip'` + critical='shape_failure'.

Run:
```bash
bun test scripts/__tests__/auto-fill-capability-artifacts-planning.test.ts
```

Expected: FAIL because functions do not exist.

**Step 2: Implement planning functions.**

Implement the functions strictly per spec §4 (Source-Of-Truth Mapping). Do not yet touch the DB. Do not add a CLI entry point.

**Step 3: Verify.**

```bash
bun test scripts/__tests__/auto-fill-capability-artifacts-planning.test.ts
```

Expected: PASS.

**Step 4: Commit.**

```bash
git commit --no-verify -m "feat(auto-fill): planning functions for capability artifact projection"
```

---

## Task 2: DB Adapter + Tests

**Files:**
- Modify: `scripts/auto-fill-capability-artifacts-from-legacy.ts` (add DB adapter functions)
- Create: `scripts/__tests__/auto-fill-capability-artifacts-adapter.test.ts`

**Functions to add:**

```ts
export interface DraftArtifactRow { id: string; capabilityId: string; artifactKind: string; artifactJson: Record<string, unknown>; capability: { canonicalKey: string; sourceKind: string; sourceRef: string; capabilityType: string } }

export async function loadDraftArtifactsWithCapability(client: SupabaseClient): Promise<DraftArtifactRow[]>
export async function loadActiveLearningItems(client: SupabaseClient): Promise<LearningItemRow[]>
export async function loadItemMeanings(client: SupabaseClient, itemIds: string[]): Promise<ItemMeaningRow[]>
export async function loadAnswerVariants(client: SupabaseClient, itemIds: string[]): Promise<AnswerVariantRow[]>
export async function loadItemContexts(client: SupabaseClient, itemIds: string[]): Promise<ItemContextRow[]>
export async function loadGrammarPatterns(client: SupabaseClient): Promise<GrammarPatternRow[]>
export async function loadLessonSections(client: SupabaseClient, lessonIds: string[]): Promise<LessonSectionRow[]>

export async function applyArtifactUpdatesInChunks(
  client: SupabaseClient,
  updates: Array<{ id: string; artifactJson: Record<string, unknown> }>,
  chunkSize: number = 50,
): Promise<{ updated: number; failedChunks: number }>

export function detectSlugCollisions(items: LearningItemRow[]): Map<string, LearningItemRow[]>
```

**Step 1: Write failing tests using a fixture-mock Supabase client.**

Test cases:

- `loadDraftArtifactsWithCapability` filters to `quality_status='draft'` AND `payload_json->>'placeholder'='true'`; joins to `learning_capabilities` for source metadata.
- `applyArtifactUpdatesInChunks` chunks 130 updates as 50/50/30. Mock client records 3 transaction batches.
- `detectSlugCollisions` returns the colliding-slug set when `apa` and `apa?` exist as separate items.
- Chunking with `language='nl'` filter on `loadAnswerVariants` (verifies that NL-language variants would be picked up if present, currently 0 rows but the query path is correct).

Run:
```bash
bun test scripts/__tests__/auto-fill-capability-artifacts-adapter.test.ts
```

Expected: FAIL.

**Step 2: Implement adapter.**

Use the existing chunking pattern from `scripts/promote-capabilities.ts:267-290`. Each chunk wrapped in `BEGIN;` / `COMMIT;` via Postgres transaction. The DB column is **`artifact_json`** (verified against schema, not `payload_json`).

**Step 3: Verify.**

```bash
bun test scripts/__tests__/auto-fill-capability-artifacts-adapter.test.ts
```

Expected: PASS.

**Step 4: Commit.**

```bash
git commit --no-verify -m "feat(auto-fill): DB adapter with chunked transactional updates"
```

---

## Task 3: Staging Merge + Write-Back + Determinism

**Files:**
- Modify: `scripts/auto-fill-capability-artifacts-from-legacy.ts` (add merge + serializer)
- Create: `scripts/__tests__/auto-fill-capability-artifacts-staging.test.ts`

**Functions to add:**

```ts
export interface ExerciseAssetEntry {
  asset_key: string
  capability_key: string
  artifact_kind: string
  quality_status: 'draft' | 'approved' | 'blocked' | 'deprecated'
  payload_json: Record<string, unknown>
}

export function mergeWithExistingStaging(
  existing: ExerciseAssetEntry[],
  autoFilled: ExerciseAssetEntry[],
): ExerciseAssetEntry[]

export function serializeExerciseAssets(entries: ExerciseAssetEntry[]): string

export async function readExistingExerciseAssets(stagingDir: string): Promise<ExerciseAssetEntry[]>
export async function writeExerciseAssets(stagingDir: string, entries: ExerciseAssetEntry[]): Promise<void>
```

**Step 1: Write failing tests.**

Test cases (per spec §5 step 9):

- Existing staging with one manual entry (`reviewedBy: 'manual-release-smoke'`) and one draft → merge keeps manual, drops draft, replaces with auto-fill.
- Auto-fill entry whose `asset_key` matches a manual entry → manual wins (auto-fill dropped).
- Sort: merged output is byte-identical regardless of input order, sorted by `asset_key` ascending.
- Determinism: serialize the same merged set twice; two outputs are byte-identical.
- Missing existing file (ENOENT) → treated as `[]`; merge degenerates to "auto-fill only".
- Stable indentation: 2-space JSON indentation matching the existing TS-export shape (`export const exerciseAssets = [\n  {\n    "asset_key": ...`).

Run:
```bash
bun test scripts/__tests__/auto-fill-capability-artifacts-staging.test.ts
```

Expected: FAIL.

**Step 2: Implement merge + serializer.**

Read existing files via `fs.promises.readFile`, parse the `exerciseAssets` array (use a regex to extract the JSON body or load via dynamic import — pick whichever is cleaner; the existing pattern uses `import()`).

Sort, indent stably, emit `// Auto-filled by auto-fill-capability-artifacts-from-legacy.ts\nexport const exerciseAssets = [\n...\n]\n`.

**Step 3: Verify.**

```bash
bun test scripts/__tests__/auto-fill-capability-artifacts-staging.test.ts
```

Expected: PASS.

**Step 4: Commit.**

```bash
git commit --no-verify -m "feat(auto-fill): staging merge + deterministic write-back"
```

---

## Task 4: CLI Wrapper + Report + Exit Code

**Files:**
- Modify: `scripts/auto-fill-capability-artifacts-from-legacy.ts` (add `main()` + arg parsing)
- Create: `scripts/__tests__/auto-fill-capability-artifacts-cli.test.ts`

**Functions to add:**

```ts
export interface AutoFillArgs {
  mode: 'dry-run' | 'apply'
}

export interface AutoFillReport {
  mode: 'dry-run' | 'apply'
  perLesson: Record<string, {
    filledByKind: Record<string, number>
    skippedByKind: Record<string, number>
    criticalByKind: Record<string, number>
  }>
  slugCollisions: Array<{ slug: string; resolved: string[]; unresolved: string[] }>
  dialogueChunkResidual: Record<string, number>
  totalFilled: number
  totalSkipped: number
  totalCritical: number
  exitCode: 0 | 1
}

export function parseAutoFillArgs(argv: string[]): AutoFillArgs
export async function runAutoFill(client: SupabaseClient, args: AutoFillArgs): Promise<AutoFillReport>
```

**Step 1: Write failing tests.**

- `parseAutoFillArgs(['--dry-run'])` → `{ mode: 'dry-run' }`.
- `parseAutoFillArgs(['--apply'])` → `{ mode: 'apply' }`.
- `parseAutoFillArgs([])` → throws "must specify --dry-run or --apply".
- `parseAutoFillArgs(['--bogus'])` → throws "Unknown argument".
- `runAutoFill` (mocked client) with all-clean fixtures → `exitCode=0`, `totalFilled > 0`, `totalCritical=0`.
- `runAutoFill` with one unresolved slug collision → `exitCode=1`, `totalCritical>=1`, no DB writes attempted (dry-run mode).
- `runAutoFill --dry-run` → no DB writes; report still includes planned counts.
- `runAutoFill --apply` → DB writes called, staging files written.

Run:
```bash
bun test scripts/__tests__/auto-fill-capability-artifacts-cli.test.ts
```

Expected: FAIL.

**Step 2: Implement.**

Wire planner + adapter + staging merge into a top-level orchestrator. Print the report as JSON to stdout. On exit, return non-zero if `report.totalCritical > 0`.

**Step 3: Verify.**

```bash
bun test scripts/__tests__/auto-fill-capability-artifacts-cli.test.ts
bun run build  # confirm no TypeScript errors
```

Expected: PASS, no build errors.

**Step 4: Commit.**

```bash
git commit --no-verify -m "feat(auto-fill): CLI wrapper with dry-run, apply, JSON report"
```

---

## Task 5: Apply Auto-Fill Against Live DB

**Files:** No code changes. Operational + commit of regenerated staging.

**Step 1: Dry-run first.**

```bash
set -a && source .env.local && set +a
NODE_TLS_REJECT_UNAUTHORIZED=0 \
  npx tsx scripts/auto-fill-capability-artifacts-from-legacy.ts --dry-run \
  | tee /tmp/auto-fill-dry-run-report.json
```

Expected:
- Exit code 0.
- Report shows `totalFilled` ≈ 5,000+, `totalSkipped` for dialogue gaps in lessons 5/7/8.
- `slugCollisions` array is small or empty.

**Step 2: Inspect the dry-run report.**

Look for:
- Any `critical` entries (collisions, shape failures). If non-zero, stop and investigate before applying.
- Per-lesson skipped counts that look unreasonable (>50% of any kind).
- Confirm `dialogueChunkResidual` matches the lesson-content-audio-migration-status doc's expected gaps.

**Step 3: Apply.**

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 \
  npx tsx scripts/auto-fill-capability-artifacts-from-legacy.ts --apply \
  | tee /tmp/auto-fill-apply-report.json
```

**Step 4: Verify DB state.**

```sql
select artifact_kind, quality_status, count(*)
from indonesian.capability_artifacts
group by 1, 2 order by 1, 2;
```

Expected: ~5,400 approved (up from 7), 400-ish remaining draft for legitimate skips.

**Step 5: Commit regenerated staging.**

```bash
git add scripts/data/staging/lesson-*/exercise-assets.ts
git commit --no-verify -m "content: auto-fill capability artifacts from legacy DB"
```

---

## Task 6: Health Check + Promote Per Lesson

**Files:** No code changes.

**Step 1: DB-backed health check per lesson.**

```bash
for n in 1 2 3 4 5 6 7 8 9; do
  echo "=== lesson $n ==="
  NODE_TLS_REJECT_UNAUTHORIZED=0 \
    npx tsx scripts/check-capability-health.ts --lesson $n --strict
done
```

Expected: `criticalCount: 0` per lesson. Warnings are acceptable.

**Step 2: Promote per lesson.**

```bash
for n in 1 2 3 4 5 6 7 8 9; do
  echo "=== promote lesson $n ==="
  NODE_TLS_REJECT_UNAUTHORIZED=0 \
    npx tsx scripts/promote-capabilities.ts --lesson $n --apply
done
```

**Step 3: Verify final capability state.**

```sql
select readiness_status, publication_status, count(*)
from indonesian.learning_capabilities
group by 1, 2 order by 1, 2;
```

Expected: `ready / published` ≈ 2,100-2,300 (up from 3); rest stays draft (audio/cloze/dialogue capabilities pending Phase 2 or content authoring).

---

## Task 7: Browser Smoke Test One Lesson + Document Residuals

**Files:** Update `docs/current-system/lesson-content-audio-migration-status.md` only.

**Step 1: Pick a lesson likely to render well.**

Lesson 6 is the cleanest local-health candidate per the migration-status doc. Use it for the first browser smoke test.

**Step 2: Open the lesson page + practice session.**

In the dev server (running on port 5173), log in as `testuser@duin.home` and navigate to:
- `/lesson/<lesson-6-uuid>` — confirm lesson reader renders rich blocks.
- `/session?lesson=<lesson-6-uuid>&mode=lesson_practice` — confirm exercises render. Click through 1-2 exercises to confirm they commit.

**Step 3: Update migration-status doc.**

Append a section:
- `Auto-fill applied 2026-04-30: <total filled> artifacts, <total approved capabilities> promoted`.
- Per-lesson residuals (dialogue gaps, missing examples, etc.).
- Next pending content-authoring work.

**Step 4: Commit.**

```bash
git add docs/current-system/lesson-content-audio-migration-status.md
git commit --no-verify -m "docs: record auto-fill outcome and remaining content gaps"
```

---

## Final Verification

```bash
bun run test
bun run build
git diff --check
```

Expected:
- All Vitest tests pass (917+ tests).
- Build succeeds.
- No whitespace errors.
- Browser smoke test for at least one lesson confirms exercises render in `lesson_practice` mode.

## Done Criteria

- ~5,000 capability artifacts are approved with `reviewedBy: 'auto-from-legacy-db'`.
- ~2,100-2,300 capabilities are at `ready / published`.
- `lesson_practice` session for lesson 6 (and others) renders real exercises.
- Lessons 5/7/8 dialogue gaps are documented as remaining authoring work.
- All 9 lessons' `exercise-assets.ts` files are committed with sorted, deterministic content.
