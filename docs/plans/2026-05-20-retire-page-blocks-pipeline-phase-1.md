---
status: shipped
implementation: PR #85
merged_at: 2026-05-20
implementation_paths:
  - scripts/lib/pipeline/lesson-stage/
  - scripts/lib/pipeline/capability-stage/
  - scripts/lib/content-pipeline-output.ts
  - scripts/lint-staging.ts
  - scripts/migration.sql
  - scripts/migrations/2026-05-20-lessons-overview-by-lesson-id.sql
  - scripts/generate-staging-files.ts
  - scripts/check-capability-release-readiness.ts
  - scripts/check-capability-health.ts
  - scripts/data/staging/lesson-{1..9}/lesson-page-blocks.ts
  - src/components/lessons/PracticeActions.tsx
  - src/lib/lessons/adapter.ts
  - src/lib/lessons/index.ts
supersedes: []
---

# Retire lesson_page_blocks from the pipeline — Phase 1 of 3

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop the publishing pipeline from producing `lesson_page_blocks` rows. Re-anchor the consumers that fire unconditionally — the `get_lessons_overview` RPC, `PracticeActions.tsx`, `check-capability-release-readiness.ts`, and `check-capability-health.ts` — on `learning_capabilities.lesson_id`. The legacy `/lesson/:lessonId` renderer (`Lesson.tsx`) and the `lesson_practice`/`lesson_review` Session loader (`Session.tsx:44`) are NOT touched in Phase 1 — they keep reading `lesson_page_blocks` for lessons 1–9 (whose rows remain in the DB) and stay broken for lessons 10+ (gated out of the UI by `has_page_blocks=false`, which still routes correctly to "coming later"). Phase 2 replaces the legacy renderer + lesson-practice discovery with bespoke per-lesson pages; Phase 3 drops the table.

**Architecture:** Two cuts. **Producer cut:** Stage A stops reading `lesson-page-blocks.ts` and stops the `upsertLessonPageBlocks` write; Stage B stops regenerating the staging file; the builder/validator/adapter/classifier for page blocks become dead and are deleted; the capability-stage loader stops reading both the staging file *and* the DB table (the latter was always dead — Stage B never used `loaded.pageBlocks`); the dangling `index.ts` re-export in `generate-staging-files.ts` is removed; stale `lesson-page-blocks.ts` fixtures under `scripts/data/staging/lesson-{1..9}/` are deleted (Stage B no longer regenerates them; the DB rows are the canonical store). **Consumer cut (unconditional readers only):** the RPC's `lesson_blocks` + `lesson_capabilities` CTEs are replaced with a direct `learning_capabilities.lesson_id = l.id` join (ADR 0006 already stamps and indexes this); `PracticeActions.tsx` swaps its page-block-flattening source_refs fetch for a lesson-id-scoped capability summary; `check-capability-release-readiness.ts` and `check-capability-health.ts` swap their page-block reads for `learning_capabilities.lesson_id` joins. `has_page_blocks` and the `lesson_page_blocks` DB table itself stay live — Phase 1 explicitly preserves the "openable lesson tile" UI gate.

**Tech stack:** TypeScript + Bun (Vitest tests). SQL via the canonical `scripts/migration.sql` (paper-trail snapshot under `scripts/migrations/`). The Supabase JS client for the frontend. No new dependencies.

**Deploy ordering:** Migration first, then code. The new code's RPC consumers don't depend on the migration (the RPC return shape stays identical — `has_page_blocks` is preserved). But migration-first avoids a window where stale partial-publish page-block rows for lesson 10+ could mislead the old RPC. Concretely: merge PR → CI builds image → `make migrate` on homelab → Portainer container recreate.

---

## Pre-flight context (read before starting)

`lesson_page_blocks` is produced by **two** sites in the pipeline today:

1. `scripts/lib/pipeline/lesson-stage/runner.ts:230` — the DB write via `upsertLessonPageBlocks`.
2. `scripts/lib/pipeline/capability-stage/runner.ts:282-284` — the disk write of `lesson-page-blocks.ts` regenerated post-enrichment (never propagates to DB).

`scripts/generate-staging-files.ts` does NOT write `lesson-page-blocks.ts` content anymore (cleanup landed in commit `31986ae` `chore(pipeline): stop pre-projecting capability snapshots in generate-staging-files + relax lint-staging gates`, on main ahead of this plan), but the `workflowIndexExports` array (line 334) **still contains** `"export { lessonPageBlocks } from './lesson-page-blocks'"` at line 339. A separate commit `c0c90b6` `fix(staging-generator): emit only existing workflow exports in index.ts` added an existence filter at line 364 — `generateIndexTs(existingContent, stagingDir)` now drops the line for newly-generated lessons whose `lesson-page-blocks.ts` doesn't exist. That filter is the safety net; for a permanently retired file, removing the entry from `workflowIndexExports` (single source of truth) is still cleaner and is what Task 4 does.

The `lesson_page_blocks` DB table has **five active consumers** today:

| # | Consumer | What it does | Phase 1 plan |
|---|---|---|---|
| 1 | `scripts/migration.sql:1696-1803` — `get_lessons_overview` RPC | Joins `pb.source_refs[]` to `learning_capabilities.source_ref` for ready/practiced counts per lesson. | **Re-anchor on `learning_capabilities.lesson_id`** (Task 6). |
| 2 | `src/components/lessons/PracticeActions.tsx:33-37` | Fetches page blocks (`getLessonPageBlocks(canonicalSourceRef)` at line 33), flattens `source_refs[]` (line 34), queries capability practice summary (line 37). Imports are bare-function from `@/lib/lessons` (post-PR-#79 fold; the methods moved out of `src/services/lessonService.ts` into `src/lib/lessons/adapter.ts`). | **Re-anchor on `learning_capabilities.lesson_id`** (Task 7). |
| 3 | `scripts/check-capability-release-readiness.ts:91, 145, 194` | Queries `lesson_page_blocks` count in `loadReadinessInput`; raises blocker `"No lesson page blocks are published for ${sourceRef}."` when count is 0. Invoked by `scripts/run-capability-release-gate.ts:32`. | **Re-anchor on `learning_capabilities.lesson_id`** (Task 8). Without this, the documented release gate becomes impossible to pass for lesson 10+. |
| 4 | `scripts/check-capability-health.ts:537-540` | Derives `contentUnitSlugs` from `lesson_page_blocks.content_unit_slugs[]`; downstream health probes filter against it. | **Re-anchor on `learning_capabilities.lesson_id` or `content_units.lesson_id`** (Task 9). Without this, the health probe returns false-negative empty content for lesson 10+. |
| 5 | `src/pages/Session.tsx:44` — `loadSelectedLessonScope` | Fetches page blocks to derive `selectedSourceRefs` for `lesson_practice`/`lesson_review` modes; short-circuits to `null` (no practice mode) when count is 0. ADR 0006 line 17 calls this out as working "by accident". | **DEFERRED to Phase 2.** User-visible breakage is gated by `has_page_blocks=false` keeping lessons 10+ in `coming_later` on the Lessons tile — the user cannot reach this code path for lesson 10+. Phase 2 rewires it together with the bespoke page work, since lesson_practice discovery needs to align with the bespoke page's own scoping. |

**Known structural reader that survives Phase 1 unchanged:** `scripts/check-supabase-deep.ts:465-486` (HC2) reads `lesson_page_blocks.block_kind` as a structural health probe. Phase 1 preserves the table + rows + `block_kind` check constraint, so the probe continues to pass for lessons 1–9. The probe is intentionally not in scope; Phase 3 retires it together with the table drop.

The `lesson_page_blocks` DB table itself is **NOT dropped** in Phase 1; existing rows for lessons 1–9 stay, so the legacy renderer (`Lesson.tsx` → `LessonBlockRenderer`) keeps rendering them where it's still in the route. The `has_page_blocks` boolean returned by `get_lessons_overview` keeps its current semantics — "this lesson has page-block rows in the DB". Lessons 1–9 = `true`; lesson 10+ = `false`. Frontend `Lessons.tsx:207` continues to use it unchanged.

**Note on lessons 1–3 already on bespoke pages:** As of origin's PRs #73 and #83, lessons 1, 2, and 3 already route through bespoke per-lesson `Page.tsx` files on the canonical `/lesson/:id` route — the legacy `LessonBlockRenderer` is no longer their renderer. Lessons 4–9 still use the legacy renderer. Phase 1's "preserve legacy renderer for lessons 1–9" wording is therefore technically wider than necessary: the lessons currently *served by* the legacy renderer are 4–9. The producer-side cleanup is unaffected — page-block rows for lessons 1–9 stay in the DB either way; the `has_page_blocks=true` signal still drives the "openable" tile state for all of them.

`learning_capabilities.lesson_id` (ADR 0006) is already populated on every lesson-derived capability (NOT NULL via the `learning_capabilities_lesson_id_required_for_lessons` constraint, `scripts/migration.sql:2052`) and indexed (`scripts/migration.sql:1630-1631`). Podcast capabilities have NULL `lesson_id` and are exempt — they don't appear in any of the Phase 1 RPC queries (the new CTE adds `where c.lesson_id is not null`).

The bespoke route `/lesson-preview/1` reads `lesson_sections.content` via `content.json` and does not depend on page blocks. **Unchanged.**

The five `lesson-page-blocks.ts` files under `scripts/data/staging/lesson-{1..5}/` and the four under `scripts/data/staging/lesson-{6..9}/` are stale derived snapshots — Stage B will no longer regenerate them after Task 2; the DB rows for those lessons are the canonical store. They are deleted as part of Task 5.

---

## Out-of-scope (explicit non-goals for Phase 1)

- **No DB table drop.** `lesson_page_blocks` stays. Phase 3 drops it.
- **No `has_page_blocks` rename or removal.** Keeps current semantic ("this lesson has page-block rows in the DB"). Phase 2 replaces it with a "has bespoke page" signal once every lesson has one.
- **No legacy renderer changes.** `Lesson.tsx`, `LessonBlockRenderer`, `lessonExperience.ts`, and `getLessonPageBlocks` in `src/lib/lessons/adapter.ts` (re-exported via `@/lib/lessons`) all stay. They serve lessons 4–9 unchanged (lessons 1–3 are already on bespoke pages per origin PRs #73 and #83).
- **No `Session.tsx` lesson_practice mode rewire.** Gated by `has_page_blocks=false` for lesson 10+; Phase 2 fixes alongside bespoke pages.
- **No deletion of existing page-block rows in the DB.** The pipeline simply stops adding new ones.
- **No change to `getLessonCapabilityPracticeSummary(userId, sourceRefs[])` method in `src/lib/lessons/adapter.ts`.** Kept alongside the new `getLessonCapabilityPracticeSummaryByLessonId` — `Lesson.tsx:93` (legacy renderer code path, still used by lessons 4–9) still calls the old method.

---

## Supabase Requirements

### Schema changes
None. The plan adds zero columns and drops zero columns. The only DB-side change is rewriting `get_lessons_overview` function body.

### RLS / grants
None. The new RPC body joins `learning_capabilities`, `learner_capability_state`, `lesson_sections`, `lessons` — all already have RLS-enabled with policies, grants for `authenticated`, and `SECURITY INVOKER` semantics on the function itself. Verified against `scripts/migration.sql` and prior migration paper-trail files; no new authenticated-role probe is required.

### homelab-configs changes
None. No new schema exposure (`indonesian` already exposed). No new Kong CORS origin. No new bucket.

### Health check additions
None. The existing `make check-supabase-deep` covers the RPC's grant + RLS. `make migrate-idempotent-check` covers the schema-application idempotency.

---

## Task 1: Stop Stage A from reading lesson-page-blocks.ts (and the dead grammar-patterns.ts read)

**Files:**
- Modify: `scripts/lib/pipeline/lesson-stage/runner.ts` (lines 18-22 imports, 67 `StagingBundle`, 161 `validatePayloadAudio` call, 178-191 classifier+validator block, 230 upsert call, 317-324 `loadStaging`)
- Modify: `scripts/lib/pipeline/lesson-stage/model.ts` (line 27 — `counts.pageBlocks` field; remove)
- Test: `scripts/lib/pipeline/lesson-stage/__tests__/runner.test.ts` (lines 187, 283 — existing `counts.pageBlocks` assertions)

**Step 1.1: Write the failing test**

Add a test that verifies Stage A runs to completion when no `lesson-page-blocks.ts` and no `grammar-patterns.ts` exist on disk, and that no `upsertLessonPageBlocks` call is ever issued to the fake supabase.

```ts
it('runs Stage A cleanly with no page-block or grammar-pattern reads (Phase 1: pipeline does not produce page blocks)', async () => {
  const result = await runLessonStage(
    { lessonNumber: 99, dryRun: false },
    {
      loadStaging: async () => ({
        lesson: fixtureLessonNoGrammar,
        // grammarPatterns + pageBlocks fields removed in this task
      }),
      createSupabaseClient: () => fakeSupabase,
      synthesizer: async () => Buffer.alloc(0),
    },
  )
  expect(result.status).toBe('ok')
  expect((result.counts as { pageBlocks?: number }).pageBlocks).toBeUndefined()
  expect(fakeSupabase.calls.filter(c => c.table === 'lesson_page_blocks')).toEqual([])
})
```

**Step 1.2: Run test to verify it fails**

Run: `bun run test -- lesson-stage/runner`
Expected: FAIL (the runner still calls `upsertLessonPageBlocks` or still reads page blocks from the staging fixture).

**Step 1.3: Implement minimal change**

In `scripts/lib/pipeline/lesson-stage/runner.ts`:

(a) Drop the dead `grammar-patterns.ts` read at lines 317-318 and the `grammarPatterns` field of `StagingBundle` (line 67) + returned key (line 324).

(b) Drop the `pageBlocks` read at lines 319-322, the `pageBlocks` field of `StagingBundle`, and the returned key.

(c) Drop the entire `classifiedBlocks` const declaration at lines 178-190.

(d) Drop the `validateBlockKind(classifiedBlocks)` call at line 191.

(e) Drop the `validatePayloadAudio(staging.pageBlocks)` call at line 161. (Dialogue payload audio is still validated section-by-section via `validatePerItem` at line 175.)

(f) Drop the `upsertLessonPageBlocks(supabase, classifiedBlocks)` call at line 230 and the `const pageBlockCount = await ...` it was assigned to.

(g) Drop the imports at lines 18-22: `upsertLessonPageBlocks`, `PageBlockInput`, `LegacyBlockKind`, `classifyBlockKind`, `validateBlockKind`, `validatePayloadAudio` — and any other now-unused imports.

In `scripts/lib/pipeline/lesson-stage/model.ts`:

(h) Drop the `pageBlocks` field from `LessonStageOutput.counts` (line 27).

**Step 1.4: Run the new test to verify it passes**

Run: `bun run test -- lesson-stage/runner`
Expected: PASS for the new test. Existing tests likely fail at lines 187 + 283 (assertions on `counts.pageBlocks`). Update those next.

**Step 1.5: Update existing Stage A tests**

In `scripts/lib/pipeline/lesson-stage/__tests__/runner.test.ts`:
- Drop `pageBlocks` from any fixture object literal passed via `loadStaging`.
- Drop `expect(result.counts.pageBlocks).toBe(...)` assertions.
- Drop the entire `grammarPatterns` field from fixtures.
- Tests that exercise `validateBlockKind` / `validatePayloadAudio` / `classifyBlockKind` directly stay until Task 3 deletes the source files, where they get deleted too.

Run: `bun run test -- lesson-stage`
Expected: PASS.

**Step 1.6: Commit**

```bash
git add scripts/lib/pipeline/lesson-stage/runner.ts \
        scripts/lib/pipeline/lesson-stage/model.ts \
        scripts/lib/pipeline/lesson-stage/__tests__/runner.test.ts
git commit -m "$(cat <<'EOF'
feat(lesson-stage): stop reading lesson-page-blocks.ts + remove dead grammar-patterns.ts read

Phase 1 of retiring lesson_page_blocks (PR-1 of N). Stage A no longer
loads or writes page blocks; the grammar-patterns.ts read was dead (never
used in Stage A's logic). Drops counts.pageBlocks from LessonStageOutput.
Existing rows in the lesson_page_blocks DB table for lessons 1-9 are
untouched so the legacy renderer keeps working.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Stop Stage B from regenerating lesson-page-blocks.ts

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/runner.ts` (lines 252-255 build call, 263 staging assignment, 281-284 disk write)
- Test: `scripts/lib/pipeline/capability-stage/__tests__/runner.test.ts`

**Step 2.1: Write the failing test**

```ts
it('does not regenerate lesson-page-blocks.ts (Phase 1: pipeline does not produce page blocks)', async () => {
  const writes: string[] = []
  vi.spyOn(fs, 'writeFileSync').mockImplementation((p: fs.PathOrFileDescriptor) => {
    writes.push(String(p))
  })
  await runCapabilityStage({ lessonNumber: 99, lessonId: 'uuid-99', dryRun: false })
  expect(writes.find(w => w.endsWith('lesson-page-blocks.ts'))).toBeUndefined()
})
```

**Step 2.2: Run test to verify it fails**

Run: `bun run test -- capability-stage/runner`
Expected: FAIL.

**Step 2.3: Implement minimal change**

In `scripts/lib/pipeline/capability-stage/runner.ts`:

(a) Drop the `buildLessonPageBlocksFromStaging(...)` call at lines 252-255 along with `const regeneratedPageBlocks = ...`.

(b) Drop the `staging.lessonPageBlocks = regeneratedPageBlocks as ...` assignment at line 263.

(c) Drop the `lesson-page-blocks.ts` disk write at lines 281-284.

(d) Drop the `buildLessonPageBlocksFromStaging` import.

**Step 2.4: Run the new test to verify it passes**

Run: `bun run test -- capability-stage/runner`
Expected: PASS.

**Step 2.5: Update existing Stage B tests**

Tests asserting the regenerated page-blocks file content or its presence: drop. Tests that mock `buildLessonPageBlocksFromStaging`: remove the mock.

Run: `bun run test -- capability-stage`
Expected: PASS.

**Step 2.6: Commit**

```bash
git add scripts/lib/pipeline/capability-stage/runner.ts \
        scripts/lib/pipeline/capability-stage/__tests__/runner.test.ts
git commit -m "$(cat <<'EOF'
feat(capability-stage): stop regenerating lesson-page-blocks.ts

Phase 1 of retiring lesson_page_blocks. Stage B no longer regenerates the
staging file post-enrichment. The lesson_page_blocks DB table is unchanged;
existing rows for lessons 1-9 stay so the legacy renderer keeps working.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Delete the dead builder, validators, classifier, adapter, and loader reads

This task consolidates all the now-dead code into one commit because the symbols form a tightly coupled set (each is referenced only by the others). Step 3.1's grep confirms there are no other call sites before deletion.

**Files (delete):**
- `scripts/lib/pipeline/lesson-stage/validators/blockKind.ts`
- `scripts/lib/pipeline/lesson-stage/validators/payloadAudio.ts`
- `scripts/lib/pipeline/lesson-stage/classifier.ts`
- Corresponding `__tests__/` files for each of the above

**Files (modify):**
- `scripts/lib/content-pipeline-output.ts` — drop `buildLessonPageBlocksFromStaging` (lines 800-993, approx 193 lines including helpers), drop `validateLessonPageBlocks`, drop `StagingLessonPageBlock` type if no other call site uses it
- `scripts/lib/pipeline/lesson-stage/adapter.ts` — drop `upsertLessonPageBlocks` (lines 122-148) and `PageBlockInput` interface (lines 24-33)
- `scripts/lib/pipeline/lesson-stage/index.ts` — drop re-exports of any deleted symbols
- `scripts/lib/pipeline/capability-stage/loader.ts` — drop the staging-file read at line 169 AND the DB read at lines 108-114 (the latter is dead — `loaded.pageBlocks` is never consumed by the runner; verify by grep)
- `scripts/lib/pipeline/capability-stage/loader.ts` — drop `lessonPageBlocks` field from `LoadedStaging` type and `pageBlocks` field from `LoadedDb` type (lines 26-50, 68, 126-134)
- `scripts/lint-staging.ts` — drop the `lessonPageBlocks` field load from `loadLesson` (line 198), drop the `lessonPageBlocks` field from `LessonCtx`, drop the `if (lessonPageBlocks.length > 0)` validator-invocation block in `checkCapabilityPipelineOutput`, drop the `validateLessonPageBlocks` import
- `scripts/__tests__/lesson-page-blocks.test.ts` — delete (covered the deleted builder)
- `scripts/__tests__/content-units-staging.test.ts` — update or drop tests that import `buildLessonPageBlocksFromStaging`

**Step 3.1: Verify all symbols are unreferenced before deletion**

```bash
grep -rn "buildLessonPageBlocksFromStaging" scripts src 2>/dev/null
grep -rn "validateLessonPageBlocks" scripts src 2>/dev/null
grep -rn "validateBlockKind\|validatePayloadAudio" scripts src 2>/dev/null
grep -rn "classifyBlockKind\|LegacyBlockKind" scripts src 2>/dev/null
grep -rn "PageBlockInput\|PageBlockStaging\|StagingLessonPageBlock" scripts src 2>/dev/null
grep -rn "upsertLessonPageBlocks" scripts src 2>/dev/null
grep -rn "loaded\.pageBlocks\|staging\.lessonPageBlocks" scripts src 2>/dev/null
```

Expected: every symbol shows up ONLY in the files being deleted/modified by this task. If anything outside the deletion set shows up, that's a missed call site — fix that first.

**Step 3.2: Delete the obsolete files + remove the exports + drop the loader reads**

Apply all "Files (delete)" and "Files (modify)" changes above.

**Step 3.3: Run all tests + smoke-test lint-staging**

```bash
bun run test
bun scripts/lint-staging.ts 10
```
Expected: tests PASS; lint-staging completes (may still print CRITICAL findings on rules outside this plan's scope, e.g. `grammar-section-unstructured` and `dialogue-translation-missing` — those are authoring-flow concerns, not pipeline-producer concerns).

**Step 3.4: Commit**

```bash
git add -u
git add scripts/lib/pipeline/lesson-stage/validators/ \
        scripts/lib/pipeline/lesson-stage/classifier.ts \
        scripts/__tests__/ 2>/dev/null || true
git commit -m "$(cat <<'EOF'
chore(pipeline): delete dead page-block builders, validators, classifier, and loader reads

Phase 1 of retiring lesson_page_blocks. Removes:
- buildLessonPageBlocksFromStaging + validateLessonPageBlocks + StagingLessonPageBlock (content-pipeline-output)
- validateBlockKind + validatePayloadAudio + classifyBlockKind + LegacyBlockKind (lesson-stage validators/classifier)
- upsertLessonPageBlocks + PageBlockInput (lesson-stage adapter)
- The lesson-page-blocks.ts file read and the dead lesson_page_blocks DB read in capability-stage loader
- The lesson-page-blocks.ts read + validator invocation in lint-staging

All call sites were removed in Tasks 1-2. The lesson_page_blocks DB table
is unchanged. Phase 3 will drop the table once the legacy renderer + Session
loader are retired (Phase 2).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Delete the dangling lessonPageBlocks index re-export + stale staging fixtures

**Files:**
- Modify: `scripts/generate-staging-files.ts` (line 339 — the `workflowIndexExports` entry for `lessonPageBlocks`)
- Delete: `scripts/data/staging/lesson-1/lesson-page-blocks.ts` through `scripts/data/staging/lesson-9/lesson-page-blocks.ts` (9 files — verified via `ls`: only lessons 1–9 have this fixture; lesson-10 already does not)
- Modify: `scripts/data/staging/lesson-1/index.ts` through `scripts/data/staging/lesson-10/index.ts` — drop the `export { lessonPageBlocks } from './lesson-page-blocks'` line. **Note: includes lesson-10/index.ts** which currently has a dangling re-export (verified: lesson-10/index.ts:8). Lesson-10's index.ts also has dangling re-exports for `content-units`, `capabilities`, `exercise-assets` — those become valid the first time Stage B runs for lesson 10, so leave them; only the `lesson-page-blocks` line is removed.

**Step 4.1: Verify which staging dirs have a `lesson-page-blocks.ts` and which `index.ts` re-export it**

```bash
ls scripts/data/staging/lesson-*/lesson-page-blocks.ts
grep -l "from './lesson-page-blocks'" scripts/data/staging/lesson-*/index.ts
```

**Step 4.2: Drop the re-export line from `generate-staging-files.ts`**

Locate the `workflowIndexExports` array (around line 339) and remove the `"export { lessonPageBlocks } from './lesson-page-blocks'"` entry.

**Step 4.3: Delete the stale fixture files + update their `index.ts`**

```bash
rm scripts/data/staging/lesson-{1..9}/lesson-page-blocks.ts
sed -i '' "/from '.\/lesson-page-blocks'/d" scripts/data/staging/lesson-{1..10}/index.ts
```

(Note the {1..10} range for `sed` — lesson-10 also needs the dangling re-export line removed even though it has no `lesson-page-blocks.ts` to delete.)

Verify:
```bash
grep -rln "lesson-page-blocks" scripts/data/staging/
```
Expected: empty output (no remaining references in any staging dir).

**Step 4.4: Verify nothing breaks**

```bash
bun run test
bun run lint
bun run build
```

The build must succeed — the staging `index.ts` files are imported (or not) only by tests + scripts; the production app doesn't bundle them. If `bun run build` complains about a missing import, that import is incorrect and the build was fragile against this exact change — track it down.

**Step 4.5: Smoke-test the generator on a sample lesson**

```bash
bun scripts/generate-staging-files.ts 10
```
Expected: completes successfully; `scripts/data/staging/lesson-10/index.ts` does NOT contain a `lesson-page-blocks` re-export.

**Step 4.6: Commit**

```bash
git add scripts/generate-staging-files.ts \
        scripts/data/staging/lesson-{1..10}/index.ts
git rm scripts/data/staging/lesson-{1..9}/lesson-page-blocks.ts
git commit -m "$(cat <<'EOF'
chore(staging): drop stale lesson-page-blocks.ts fixtures + their index re-export

Phase 1 of retiring lesson_page_blocks. The pipeline no longer generates
these files (Tasks 1-3); the canonical store of lesson_page_blocks for
lessons 1-9 is the DB table. The generate-staging-files.ts re-export
of lessonPageBlocks in workflowIndexExports is also removed — newly
scaffolded lessons (including lesson-10's existing dangling re-export)
no longer reference the missing file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Smoke-test the producer-side cleanup end-to-end against lesson 10

**Files:** none (verification only)

**Step 5.1: Dry-run the full publish on lesson 10**

```bash
bun scripts/publish-approved-content.ts 10 --dry-run --skip-lint
```

Expected: Stage A reports `status: ok`, no `pageBlocks` field in counts. Stage B reports `status: ok`. Neither stage attempts to read or write `lesson-page-blocks.ts`.

**Step 5.2: Verify staging dir state**

```bash
ls scripts/data/staging/lesson-10/
```
Expected: NO `lesson-page-blocks.ts` file (neither generated up-front nor regenerated by Stage B).

**Step 5.3: Verify staging index.ts is clean**

```bash
grep "lesson-page-blocks" scripts/data/staging/lesson-10/index.ts
```
Expected: empty (no match).

**Step 5.4: Run pre-deploy gauntlet**

```bash
bun run test
bun run lint
bun run build
```
Expected: PASS. (Defer `make pre-deploy` until after the RPC migration in Task 6 — the full gauntlet includes health checks that exercise the new RPC.)

No commit needed.

---

## Task 6: Rewrite get_lessons_overview RPC to use learning_capabilities.lesson_id

**Files:**
- Modify: `scripts/migration.sql` (lines 1696-1803 — the `get_lessons_overview` function)
- Create: `scripts/migrations/2026-05-20-lessons-overview-by-lesson-id.sql` (paper-trail snapshot)

**Step 6.1: Read the current shape**

The current RPC (`scripts/migration.sql:1722-1745`):

```sql
with lesson_blocks as (
  select l.id as lesson_id, pb.block_key, pb.payload_json,
         coalesce(nullif(pb.source_refs, array[]::text[]), array[pb.source_ref]) as expanded_refs
  from indonesian.lessons l
  join indonesian.lesson_page_blocks pb on pb.source_ref = 'lesson-' || l.order_index
),
lesson_capabilities as (
  select distinct on (lb.lesson_id, c.id) lb.lesson_id, c.id as capability_id,
         c.readiness_status, c.publication_status, s.activation_state, s.review_count
  from lesson_blocks lb
  cross join lateral unnest(lb.expanded_refs) as expanded_ref
  join indonesian.learning_capabilities c on c.source_ref = expanded_ref
  left join indonesian.learner_capability_state s on s.capability_id = c.id and s.user_id = p_user_id
),
capability_counts as (
  select lesson_id,
         count(*) filter (where readiness_status = 'ready' and publication_status = 'published')::int as ready_count,
         count(*) filter (where readiness_status = 'ready' and publication_status = 'published'
                           and activation_state = 'active' and coalesce(review_count, 0) > 0)::int as practiced_count
  from lesson_capabilities group by lesson_id
),
...
lesson_block_presence as (
  select lesson_id, true as has_blocks from lesson_blocks group by lesson_id
)
```

**Step 6.2: Rewrite the CTEs**

The new shape keeps the return signature byte-identical. Only the capability-counts source changes — from `pb.source_refs[]` to `c.lesson_id`. The `has_page_blocks` probe stays but lifts to its own narrow `EXISTS` query (independent of capability scoping).

In `scripts/migration.sql`, replace lines 1703-1803 with:

```sql
drop function if exists indonesian.get_lessons_overview(uuid);
create or replace function indonesian.get_lessons_overview(p_user_id uuid)
returns table (
  lesson_id uuid,
  order_index int,
  title text,
  description text,
  audio_path text,
  duration_seconds int,
  primary_voice text,
  publication_status text,
  is_published boolean,
  lesson_sections jsonb,
  has_started_lesson boolean,
  has_page_blocks boolean,
  ready_capability_count int,
  practiced_eligible_capability_count int
)
language sql stable security invoker as $$
  with lesson_capabilities as (
    -- Re-anchored 2026-05-20 (Phase 1 of retiring lesson_page_blocks):
    -- joins learning_capabilities directly on lesson_id (ADR 0006) instead
    -- of unnesting lesson_page_blocks.source_refs[]. Excludes podcast caps
    -- (lesson_id is null) which were never in scope of this RPC.
    select c.lesson_id, c.id as capability_id,
           c.readiness_status, c.publication_status,
           s.activation_state, s.review_count
    from indonesian.learning_capabilities c
    left join indonesian.learner_capability_state s
      on s.capability_id = c.id and s.user_id = p_user_id
    where c.lesson_id is not null
  ),
  capability_counts as (
    select lesson_id,
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
           )::int as ready_count,
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
               and activation_state = 'active' and coalesce(review_count, 0) > 0
           )::int as practiced_count
    from lesson_capabilities group by lesson_id
  ),
  lesson_sections_json as (
    select ls.lesson_id, jsonb_agg(to_jsonb(ls) order by ls.order_index) as sections
    from indonesian.lesson_sections ls group by ls.lesson_id
  ),
  lesson_block_presence as (
    -- Phase 1: kept as a narrow probe against lesson_page_blocks to drive the
    -- "openable lesson tile" signal in Lessons.tsx:207. Phase 2 will replace
    -- this with a "has bespoke page" signal once every lesson has one.
    select l.id as lesson_id, true as has_blocks
    from indonesian.lessons l
    where exists (
      select 1 from indonesian.lesson_page_blocks pb
      where pb.source_ref = 'lesson-' || l.order_index
    )
  )
  select
    l.id,
    l.order_index,
    l.title,
    l.description,
    l.audio_path,
    l.duration_seconds,
    l.primary_voice,
    'published'::text as publication_status,
    true as is_published,
    coalesce(lsj.sections, '[]'::jsonb) as lesson_sections,
    (
      exists (
        select 1 from indonesian.learner_lesson_activation lla
        where lla.user_id = p_user_id and lla.lesson_id = l.id
      )
      or exists (
        select 1 from indonesian.lesson_progress lp
        where lp.user_id = p_user_id and lp.lesson_id = l.id
      )
    ) as has_started_lesson,
    coalesce(lbp.has_blocks, false) as has_page_blocks,
    coalesce(cc.ready_count, 0) as ready_capability_count,
    coalesce(cc.practiced_count, 0) as practiced_eligible_capability_count
  from indonesian.lessons l
  left join capability_counts cc on cc.lesson_id = l.id
  left join lesson_sections_json lsj on lsj.lesson_id = l.id
  left join lesson_block_presence lbp on lbp.lesson_id = l.id
  order by l.order_index;
$$;
grant execute on function indonesian.get_lessons_overview(uuid) to authenticated;
```

Update the surrounding comment block (lines 1690-1702) to reflect the new approach:

```sql
-- ============================================================================
-- get_lessons_overview — 2026-05-20 (Phase 1 of retiring lesson_page_blocks)
-- ============================================================================
--
-- Reads capability counts from learning_capabilities.lesson_id (ADR 0006)
-- instead of unnesting lesson_page_blocks.source_refs[]. Return shape is
-- byte-identical to the previous version — has_page_blocks stays as a
-- narrow probe against lesson_page_blocks to drive the "openable" tile
-- signal in Lessons.tsx:207 (Phase 2 will replace it).
--
-- Idempotent. DROP FUNCTION first because CREATE OR REPLACE cannot change
-- a function's RETURNS TABLE shape (even when it doesn't, drop+create is
-- a strictly safer idiom).
```

**Step 6.3: Create the paper-trail migration (literal SQL inlined)**

Per CLAUDE.md (`docs/process/content-pipeline.md` and the comment at the top of `scripts/migration.sql`), the canonical migration.sql file is authoritative and applied by `make migrate`; the `scripts/migrations/<date>.sql` files are audit-trail snapshots that mirror the canonical change exactly.

Create `scripts/migrations/2026-05-20-lessons-overview-by-lesson-id.sql` with the literal body below (a byte-identical copy of what Step 6.2 placed in `scripts/migration.sql`):

```sql
-- 2026-05-20 — get_lessons_overview reads capability counts from
-- learning_capabilities.lesson_id (ADR 0006) instead of unnesting
-- lesson_page_blocks.source_refs[]. Phase 1 of retiring page blocks.
-- (Snapshot of the canonical change in scripts/migration.sql; safe to re-apply.)

drop function if exists indonesian.get_lessons_overview(uuid);
create or replace function indonesian.get_lessons_overview(p_user_id uuid)
returns table (
  lesson_id uuid,
  order_index int,
  title text,
  description text,
  audio_path text,
  duration_seconds int,
  primary_voice text,
  publication_status text,
  is_published boolean,
  lesson_sections jsonb,
  has_started_lesson boolean,
  has_page_blocks boolean,
  ready_capability_count int,
  practiced_eligible_capability_count int
)
language sql stable security invoker as $$
  with lesson_capabilities as (
    select c.lesson_id, c.id as capability_id,
           c.readiness_status, c.publication_status,
           s.activation_state, s.review_count
    from indonesian.learning_capabilities c
    left join indonesian.learner_capability_state s
      on s.capability_id = c.id and s.user_id = p_user_id
    where c.lesson_id is not null
  ),
  capability_counts as (
    select lesson_id,
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
           )::int as ready_count,
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
               and activation_state = 'active' and coalesce(review_count, 0) > 0
           )::int as practiced_count
    from lesson_capabilities group by lesson_id
  ),
  lesson_sections_json as (
    select ls.lesson_id, jsonb_agg(to_jsonb(ls) order by ls.order_index) as sections
    from indonesian.lesson_sections ls group by ls.lesson_id
  ),
  lesson_block_presence as (
    select l.id as lesson_id, true as has_blocks
    from indonesian.lessons l
    where exists (
      select 1 from indonesian.lesson_page_blocks pb
      where pb.source_ref = 'lesson-' || l.order_index
    )
  )
  select
    l.id,
    l.order_index,
    l.title,
    l.description,
    l.audio_path,
    l.duration_seconds,
    l.primary_voice,
    'published'::text as publication_status,
    true as is_published,
    coalesce(lsj.sections, '[]'::jsonb) as lesson_sections,
    (
      exists (
        select 1 from indonesian.learner_lesson_activation lla
        where lla.user_id = p_user_id and lla.lesson_id = l.id
      )
      or exists (
        select 1 from indonesian.lesson_progress lp
        where lp.user_id = p_user_id and lp.lesson_id = l.id
      )
    ) as has_started_lesson,
    coalesce(lbp.has_blocks, false) as has_page_blocks,
    coalesce(cc.ready_count, 0) as ready_capability_count,
    coalesce(cc.practiced_count, 0) as practiced_eligible_capability_count
  from indonesian.lessons l
  left join capability_counts cc on cc.lesson_id = l.id
  left join lesson_sections_json lsj on lsj.lesson_id = l.id
  left join lesson_block_presence lbp on lbp.lesson_id = l.id
  order by l.order_index;
$$;
grant execute on function indonesian.get_lessons_overview(uuid) to authenticated;
```

**Step 6.4: Run the idempotent check**

```bash
make migrate-idempotent-check
```
Expected: PASS — applying twice in a row leaves the DB clean.

**Step 6.5: Apply to homelab + verify against real data**

```bash
make migrate
```

Then verify against the test user (`reference_test_user.md`):

```bash
# From inside scripts/, or with .env.local loaded:
psql "<homelab-connection-string>" <<EOF
SELECT lesson_id, order_index, title,
       ready_capability_count, practiced_eligible_capability_count,
       has_page_blocks
FROM indonesian.get_lessons_overview('<test-user-uuid>')
ORDER BY order_index;
EOF
```

Expected (assuming Tasks 1-5 have NOT touched the DB yet — they haven't, the pipeline cleanup is producer-side only):
- Lessons 1-9: `has_page_blocks = true`, `ready_capability_count > 0` (matching the pre-migration values to within the new join's tolerance — see Step 6.6).
- Lesson 10 (if Stage A has run): `has_page_blocks = false`, `ready_capability_count` reflects Stage B's projection (likely 0 if Stage B hasn't run yet for lesson 10).

**Step 6.6: Cross-check capability counts against pre-migration values**

Before merging, run a parity probe to confirm the new join produces the same counts as the old for lessons 1-9. The old RPC used `c.source_ref` joined via unnested `source_refs[]` on lesson_page_blocks; the new RPC uses `c.lesson_id` directly. For a lesson-derived capability with `lesson_id = L` and `source_ref = X`, both joins should pick it up — but only if every capability's `source_ref` was previously listed in at least one `lesson_page_blocks.source_refs[]` entry. If any capability was missed by the old `source_refs[]` enumeration, the new count will be HIGHER. That's the correct value; the old value was the bug.

Run this probe against the live homelab DB **before applying the migration in Step 6.5** (the old CTE shape only works while the live RPC has not yet been replaced):

```sql
with old_counts as (
  with lesson_blocks as (
    select l.id as lesson_id,
           coalesce(nullif(pb.source_refs, array[]::text[]), array[pb.source_ref]) as expanded_refs
    from indonesian.lessons l
    join indonesian.lesson_page_blocks pb on pb.source_ref = 'lesson-' || l.order_index
  )
  select lb.lesson_id,
         count(distinct c.id) filter (
           where c.readiness_status = 'ready' and c.publication_status = 'published'
         )::int as ready_count
  from lesson_blocks lb
  cross join lateral unnest(lb.expanded_refs) as expanded_ref
  join indonesian.learning_capabilities c on c.source_ref = expanded_ref
  group by lb.lesson_id
),
new_counts as (
  select c.lesson_id,
         count(*) filter (
           where c.readiness_status = 'ready' and c.publication_status = 'published'
         )::int as ready_count
  from indonesian.learning_capabilities c
  where c.lesson_id is not null
  group by c.lesson_id
)
select l.order_index,
       coalesce(oc.ready_count, 0) as old_count,
       coalesce(nc.ready_count, 0) as new_count,
       coalesce(nc.ready_count, 0) - coalesce(oc.ready_count, 0) as delta
from indonesian.lessons l
left join old_counts oc on oc.lesson_id = l.id
left join new_counts nc on nc.lesson_id = l.id
order by l.order_index;
```

Expected: `delta = 0` for lessons 1-9 (or strictly positive, which means the old join missed capabilities — log the delta to the PR description). If `delta < 0` for any lesson, that's a bug — the new join is missing capabilities that the old one had. Stop and investigate before merging.

Save the probe result (paste into the PR body per Step 10.9).

**Step 6.7: Run all tests + health checks**

```bash
bun run test
make check-supabase-deep
```
Expected: PASS.

**Step 6.8: Commit**

```bash
git add scripts/migration.sql scripts/migrations/2026-05-20-lessons-overview-by-lesson-id.sql
git commit -m "$(cat <<'EOF'
feat(rpc): rewrite get_lessons_overview to read capability counts from learning_capabilities.lesson_id

Phase 1 of retiring lesson_page_blocks. The RPC now joins
learning_capabilities directly on lesson_id (ADR 0006) instead of
unnesting lesson_page_blocks.source_refs[]. Return signature is
byte-identical — has_page_blocks stays as a narrow EXISTS probe against
lesson_page_blocks to drive the "openable" lesson tile signal in
Lessons.tsx:207. Phase 2 will replace that signal.

Idempotent. Paper-trail snapshot at scripts/migrations/2026-05-20-lessons-overview-by-lesson-id.sql.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Rewire PracticeActions.tsx to query by lesson_id

Post-PR-#79 fold, the lesson-domain methods (`getLessonPageBlocks`, `getLessonCapabilityPracticeSummary`, etc.) live in `src/lib/lessons/adapter.ts` and are re-exported via the `@/lib/lessons` barrel. Callers import them as bare functions. The new method goes in the same adapter file alongside the existing one.

**Files:**
- Modify: `src/lib/lessons/adapter.ts` (add new method `getLessonCapabilityPracticeSummaryByLessonId` near the existing `getLessonCapabilityPracticeSummary` at line 244)
- Modify: `src/lib/lessons/index.ts` (add the new method to the adapter re-export block at lines 65-77)
- Modify: `src/components/lessons/PracticeActions.tsx` (lines 33-37 — replace the page-block fetch+flatten+summary chain; the bare-function import set at lines 6-13 gets the new name added and `getLessonPageBlocks` removed)
- Test: `src/lib/lessons/__tests__/adapter.test.ts` (or co-located equivalent — confirm existing test location with `ls src/lib/lessons/__tests__/`)
- Test: `src/components/lessons/__tests__/PracticeActions.test.tsx` (no test exists today; create)

**Step 7.1: Add `getLessonCapabilityPracticeSummaryByLessonId` to the adapter**

In `src/lib/lessons/adapter.ts`, append a new exported function alongside the existing `getLessonCapabilityPracticeSummary` (line 244 onwards). Do NOT remove the old one — `Lesson.tsx:93` still calls it.

```ts
// In src/lib/lessons/adapter.ts, alongside getLessonCapabilityPracticeSummary
export async function getLessonCapabilityPracticeSummaryByLessonId(
  userId: string,
  lessonId: string,
): Promise<LessonCapabilityPracticeSummary> {
  const { data: capabilityRows, error: capabilityError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('readiness_status', 'ready')
    .eq('publication_status', 'published')
  if (capabilityError) throw capabilityError

  const capabilityIds = ((capabilityRows ?? []) as Array<{ id: string }>).map(r => r.id)
  if (capabilityIds.length === 0) {
    return { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 }
  }

  const stateRows = await chunkedIn<{
    activation_state: string | null
    review_count: number | null
  }>(
    'learner_capability_state',
    'capability_id',
    capabilityIds,
    (b) => b.select('capability_id, activation_state, review_count').eq('user_id', userId),
  )
  const activePracticedCapabilityCount = stateRows
    .filter(row => row.activation_state === 'active' && (row.review_count ?? 0) > 0).length
  return { readyCapabilityCount: capabilityIds.length, activePracticedCapabilityCount }
}
```

Then re-export it from the barrel in `src/lib/lessons/index.ts`. The existing adapter re-export block is around lines 65-77; add `getLessonCapabilityPracticeSummaryByLessonId` to that list.

**Step 7.2: Write a failing test for the new method**

Find the existing adapter test (likely `src/lib/lessons/__tests__/adapter.test.ts`); follow the established mock pattern there.

```ts
it('queries capability practice summary by lesson_id', async () => {
  // Mock the supabase chain via vi.mock('@/lib/supabase') to return 3 ready
  // capabilities for lessonId='lesson-uuid-1'; learner_capability_state has 2 rows
  // (one active+reviewed, one active+not-reviewed).
  const summary = await getLessonCapabilityPracticeSummaryByLessonId('user-uuid', 'lesson-uuid-1')
  expect(summary).toEqual({
    readyCapabilityCount: 3,
    activePracticedCapabilityCount: 1,
  })
})
```

Run: `bun run test -- lib/lessons` → expected FAIL.
Implement Step 7.1 → re-run → expected PASS.

**Step 7.3: Update PracticeActions.tsx**

Replace the page-block-flattening chain at lines 33-37 with the direct lesson_id call. The component already has `lessonId` in scope (passed as a prop on line 17). Drop the `canonicalSourceRef` derivation at line 29 — no longer needed.

Concrete diff (line numbers from the current file):

```diff
@@ src/components/lessons/PracticeActions.tsx @@
 import {
   isLessonActivated,
   buildLessonPracticeActions,
   getLesson,
-  getLessonPageBlocks,
-  getLessonCapabilityPracticeSummary,
+  getLessonCapabilityPracticeSummaryByLessonId,
 } from '@/lib/lessons'
   ...
-        const canonicalSourceRef = `lesson-${lesson.order_index}`
        ...
-        const pageBlocks = await getLessonPageBlocks(canonicalSourceRef).catch(() => [])
-        const refs = pageBlocks.flatMap(b => b.source_refs?.length ? b.source_refs : [b.source_ref]).filter(Boolean)
-        const sourceRefs = refs.length > 0 ? [...new Set(refs)] : [canonicalSourceRef]
-        const [summary, activated] = await Promise.all([
-          getLessonCapabilityPracticeSummary(userId!, sourceRefs).catch(() => ({
+        const [summary, activated] = await Promise.all([
+          getLessonCapabilityPracticeSummaryByLessonId(userId!, lessonId).catch(() => ({
            readyCapabilityCount: 0,
            activePracticedCapabilityCount: 0,
          })),
```

If the component currently fetches the `lesson` row only to derive `canonicalSourceRef`, that fetch may now be dead — verify before deleting. The `lesson` row may still be needed for other state (e.g. activation check); read the file once before pruning.

**Step 7.4: Write tests for PracticeActions**

No `src/components/lessons/__tests__/PracticeActions.test.tsx` exists today. Create one. Mock the bare-function imports via `vi.mock('@/lib/lessons')`, per the project's service-layer mock pattern (CLAUDE.md "Testing layers" section).

```ts
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { PracticeActions } from '../PracticeActions'

vi.mock('@/lib/lessons')
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: any) => selector({ user: { id: 'user-uuid' } }),
}))

import {
  getLessonCapabilityPracticeSummaryByLessonId,
  getLessonPageBlocks,
  isLessonActivated,
  buildLessonPracticeActions,
  getLesson,
} from '@/lib/lessons'

beforeEach(() => {
  vi.mocked(isLessonActivated).mockResolvedValue(true)
  vi.mocked(getLesson).mockResolvedValue({ id: 'lesson-abc', order_index: 4 } as any)
  vi.mocked(buildLessonPracticeActions).mockReturnValue([])
})

it('fetches practice summary by lesson_id instead of page-block source_refs', async () => {
  vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValue({
    readyCapabilityCount: 5,
    activePracticedCapabilityCount: 2,
  })
  render(<MantineProvider><MemoryRouter><PracticeActions lessonId="lesson-abc" /></MemoryRouter></MantineProvider>)
  await waitFor(() =>
    expect(getLessonCapabilityPracticeSummaryByLessonId).toHaveBeenCalledWith('user-uuid', 'lesson-abc'),
  )
  expect(getLessonPageBlocks).not.toHaveBeenCalled()
})
```

**Step 7.5: Run all tests + lint + build**

```bash
bun run test
bun run lint
bun run build
```
Expected: PASS.

**Step 7.6: Commit**

```bash
git add src/lib/lessons/adapter.ts \
        src/lib/lessons/index.ts \
        src/components/lessons/PracticeActions.tsx \
        src/lib/lessons/__tests__/ \
        src/components/lessons/__tests__/PracticeActions.test.tsx
git commit -m "$(cat <<'EOF'
feat(lessons): query lesson capability practice summary by lesson_id

Adds getLessonCapabilityPracticeSummaryByLessonId to lib/lessons/adapter.ts
and re-exports from the @/lib/lessons barrel. PracticeActions no longer
fetches lesson_page_blocks to flatten source_refs — queries
learning_capabilities directly by lesson_id (ADR 0006). The old
getLessonCapabilityPracticeSummary(sourceRefs[]) method is kept (still used
by Lesson.tsx:93 in the legacy renderer code path for lessons 4-9).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Rewire check-capability-release-readiness.ts to query by lesson_id (shape edit)

This task is a single coherent type/shape edit. The current `CapabilityReleaseReadinessInput` and `CapabilityReleaseReadinessReport` types carry a `lessonPageBlocks: number` field (count of page-block rows). The new shape carries `readyPublishedCapabilityCount: number` (count of capabilities with `lesson_id = X AND readiness_status='ready' AND publication_status='published'`). All five live call sites in the production code AND four call sites in the test file must move from the old field to the new field in the same commit so the type checker stays happy.

**Files:**
- Modify: `scripts/check-capability-release-readiness.ts`:
  - Line 18 — `CapabilityReleaseReadinessInput.lessonPageBlocks: number` → `readyPublishedCapabilityCount: number`
  - Line 31 — `CapabilityReleaseReadinessReport.lessonPageBlocks: number` → `readyPublishedCapabilityCount: number`
  - Line 91 — blocker condition + message:
    - Before: `if (input.lessonPageBlocks === 0) blockers.push(\`No lesson page blocks are published for ${input.sourceRef}.\`)`
    - After: `if (input.readyPublishedCapabilityCount === 0) blockers.push(\`No published, ready capabilities for ${input.sourceRef}.\`)`
  - Line 104 — pass-through field rename: `lessonPageBlocks: input.lessonPageBlocks` → `readyPublishedCapabilityCount: input.readyPublishedCapabilityCount`
  - Line 145 — `loadReadinessInput` query swap. Replace:
    ```ts
    const { data: lessonPageBlocks, error: blocksError } = await db()
      .from('lesson_page_blocks')
      .select('block_key')
      .eq('source_ref', sourceRef)
    ```
    with a `learning_capabilities` query that takes a `lessonId` (looked up from `lessons` by `order_index`, derivable from `sourceRef` via the `'lesson-' || order_index` convention):
    ```ts
    // Look up lesson_id from sourceRef (sourceRef shape: 'lesson-N')
    const orderIndex = Number(sourceRef.replace(/^lesson-/, ''))
    const { data: lessonRow, error: lessonErr } = await db()
      .from('lessons').select('id').eq('order_index', orderIndex).maybeSingle()
    if (lessonErr) throw lessonErr
    if (!lessonRow) throw new Error(`Unknown lesson sourceRef: ${sourceRef}`)
    const { count: readyPublishedCapabilityCount, error: capsError } = await db()
      .from('learning_capabilities')
      .select('id', { count: 'exact', head: true })
      .eq('lesson_id', lessonRow.id)
      .eq('readiness_status', 'ready')
      .eq('publication_status', 'published')
    if (capsError) throw capsError
    ```
  - Line 194 — assignment in the returned `CapabilityReleaseReadinessInput`: `lessonPageBlocks: (lessonPageBlocks ?? []).length` → `readyPublishedCapabilityCount: readyPublishedCapabilityCount ?? 0`

- Modify: `scripts/__tests__/check-capability-release-readiness.test.ts`:
  - Lines 41, 63, 88, 110 — replace `lessonPageBlocks: <N>` with `readyPublishedCapabilityCount: <N>` in each test fixture
  - Existing test at line 110 (`lessonPageBlocks: 1`) tests the "non-zero passes" path — relabel/rephrase the test description to reflect the new field semantics
  - Add a new test: when `readyPublishedCapabilityCount === 0` AND other input is otherwise valid, the blocker fires with the new message
  - Add a new test for `loadReadinessInput` if not already covered: confirms it correctly looks up `lesson_id` from `sourceRef`, queries `learning_capabilities`, and returns the count

**Step 8.1: Read the current shape**

```bash
sed -n '12,40p' scripts/check-capability-release-readiness.ts   # type defs
sed -n '85,110p' scripts/check-capability-release-readiness.ts  # blocker check + pass-through
sed -n '140,200p' scripts/check-capability-release-readiness.ts # loadReadinessInput
sed -n '35,115p' scripts/__tests__/check-capability-release-readiness.test.ts # 4 call sites
```

**Step 8.2: Apply the shape edit + test updates in one pass**

Apply all the type/code changes above. This is a single coherent edit — the type rename ripples through every site simultaneously. Use `Edit` with `replace_all: true` for the literal field name `lessonPageBlocks:` where unambiguous; verify by grep no stragglers remain.

**Step 8.3: Run tests**

```bash
bun run test -- release-readiness
```
Expected: PASS. If the type checker fires, the most likely culprit is a missed call site — `grep -n "lessonPageBlocks" scripts/check-capability-release-readiness.ts scripts/__tests__/check-capability-release-readiness.test.ts` should be empty.

**Step 8.4: Manual smoke test against homelab**

```bash
# For a lesson WITH ready caps:
bun scripts/run-capability-release-gate.ts --lesson 4

# For lesson 10 (no caps yet — Stage B hasn't run for lesson 10 yet):
bun scripts/run-capability-release-gate.ts --lesson 10
```

Expected: lesson 4 passes (or fires on a different blocker if lesson 4 has other issues); lesson 10 fires `"No published, ready capabilities for lesson lesson-10."`.

**Step 8.5: Commit**

```bash
git add scripts/check-capability-release-readiness.ts \
        scripts/__tests__/check-capability-release-readiness.test.ts
git commit -m "$(cat <<'EOF'
feat(release-gate): check release readiness against learning_capabilities.lesson_id

Phase 1 of retiring lesson_page_blocks. CapabilityReleaseReadinessInput
and CapabilityReleaseReadinessReport renamed lessonPageBlocks -> readyPublishedCapabilityCount.
The release gate no longer asserts "page blocks exist" as a proxy for
"this lesson is shippable". It now checks that learning_capabilities has
at least one ready+published row for the lesson (ADR 0006) — strictly more
correct since a lesson with page blocks but no ready caps was never actually
shippable. All 5 production call sites + 4 test call sites move in the same
commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Rewire check-capability-health.ts — three page-block uses + retire the unreachable-source-ref warning

`check-capability-health.ts` consumes `lesson_page_blocks` in three coupled ways inside `loadDbCapabilityHealthSnapshot`. This task replaces all three coherently.

**The three uses (per the architect review):**

1. **`contentUnitSlugs` derivation (line 548):** `lessonBlocks.flatMap(block.content_unit_slugs ?? [])` — produces the slug allowlist used to filter `content_units`.
2. **`filterScopedContentUnits` call (lines 561-570, function body at 467-480):** narrows the per-lesson `content_units` set to those whose `unit_slug` appears in some block's `content_unit_slugs[]`.
3. **`knownSourceRefs` set (lines 610-614):** unions every block's `source_ref` + `source_refs[]` to form the "this lesson is allowed to teach these refs" allowlist. Used at line 218 to fire the `ready_capability_unreachable_source_ref` warning when a capability's `source_ref` is not in the set.

**The replacement semantics:**

- (1) + (2): the lesson's content-unit set is now derived directly from `capability_content_units` joined through `learning_capabilities` where `lesson_id = ?`. The intermediate `filterScopedContentUnits` step becomes unnecessary — the join already produces the filtered set.
- (3): the `ready_capability_unreachable_source_ref` warning becomes tautological post-Phase-1. Old semantics: "this capability claims to belong to this lesson, but no page-block enumerates its source_ref." Without page blocks as a separate enumeration layer, there's no orthogonal source to be inconsistent with — the warning has no semantic ground. **Retire the warning entirely.**

**Files:**
- Modify: `scripts/check-capability-health.ts`:
  - Replace lines 537-548 (DB read of `lesson_page_blocks` + `contentUnitSlugs` derivation) with a direct query that joins `learning_capabilities → capability_content_units → content_units` keyed on `lesson_id`. Reuses the lesson_id lookup pattern from Task 8 (look up via `sourceRef` → `'lesson-N'` → `lessons.order_index`).
  - Replace lines 561-570 — `filterScopedContentUnits({ ..., blocks: lessonBlocks, ... })` — with the directly-scoped content-unit set from the new query.
  - Delete the `filterScopedContentUnits` function itself (lines 467-480) — it has no other callers; verify via `grep -n "filterScopedContentUnits" scripts/`.
  - Delete lines 610-614 (`knownSourceRefs` construction from `lessonBlocks`).
  - Delete line 218 (`if (!knownSourceRefs.has(capability.sourceRef)) ...` warning emission) AND its explanatory comment block at lines 215-217.
  - Delete the `knownSourceRefs: string[]` field from the snapshot type at line 84 if no other code reads it (`grep -n "knownSourceRefs" scripts/`).
  - Drop any now-unused imports.
- Create: `scripts/__tests__/check-capability-health.test.ts` (no test file exists today — confirmed via grep)

**Step 9.1: Read the current shape**

```bash
sed -n '80,90p' scripts/check-capability-health.ts          # snapshot type field
sed -n '210,225p' scripts/check-capability-health.ts        # the warning emit site
sed -n '450,485p' scripts/check-capability-health.ts        # filterScopedContentUnits + content_unit_slugs accessor
sed -n '530,625p' scripts/check-capability-health.ts        # the three usage sites
grep -n "filterScopedContentUnits\|knownSourceRefs" scripts/  # confirm no other callers
```

**Step 9.2: Plan the new query shape**

The replacement for the `lesson_page_blocks` read returns the per-lesson content-unit slugs directly:

```ts
// After Task 8's lesson_id lookup pattern produces lessonId:
const { data: scopedUnits, error: unitsError } = await db()
  .from('content_units')
  .select(`
    unit_slug,
    source_ref,
    source_section_ref,
    unit_kind,
    capability_content_units!inner (
      learning_capabilities!inner ( lesson_id )
    )
  `)
  .eq('capability_content_units.learning_capabilities.lesson_id', lessonId)
if (unitsError) throw unitsError

// `scopedUnits` is now the per-lesson content_units (already filtered).
// Downstream code that used `contentUnitSlugs` for filtering can read the
// slug field directly off `scopedUnits`.
```

(Confirm the Supabase JS nested-filter syntax during implementation — if the join-then-filter doesn't work, fall back to two queries: first get the capability IDs for `lesson_id = ?`, then `capability_content_units` IN those, then `content_units` IN those.)

**Step 9.3: Write the test file**

Create `scripts/__tests__/check-capability-health.test.ts` with at minimum these scenarios:

1. **Lesson with N>0 ready capabilities** — `loadDbCapabilityHealthSnapshot` returns a snapshot whose `contentUnits` matches the lesson's actual content_units (via the new join) and whose `capabilities` field includes all expected caps. No `ready_capability_unreachable_source_ref` finding fires (the check is retired).
2. **Lesson 10 (no Stage-B publish yet)** — returns an empty `contentUnits` array and no spurious findings. Pre-Phase-1, this would have produced a false negative (empty contentUnitSlugs because no page blocks); the new derivation correctly reflects "no caps published yet."
3. **A capability with a stale source_ref that doesn't match its lesson_id** — confirm no `ready_capability_unreachable_source_ref` finding is emitted (the check is gone).

Use Vitest's `vi.mock` to mock the supabase client at the service level per CLAUDE.md's testing guidance (mock at the service boundary, not the supabase chain).

**Step 9.4: Apply the changes**

Apply all four substantive changes:
- Replace the lesson_page_blocks DB read with the content_units join.
- Delete `filterScopedContentUnits` + its callsite usage.
- Delete the `knownSourceRefs` set + its warning emission.
- Drop the `knownSourceRefs` snapshot field if unused elsewhere.

**Step 9.5: Verify all retired symbols are unreferenced**

```bash
grep -rn "filterScopedContentUnits\|knownSourceRefs\|ready_capability_unreachable_source_ref" scripts src 2>/dev/null
```
Expected: empty.

**Step 9.6: Run tests**

```bash
bun run test -- capability-health
bun run test
```
Expected: PASS, including the new test scenarios from Step 9.3.

**Step 9.7: Smoke test against homelab**

```bash
bun scripts/check-capability-health.ts
```
Expected: completes; content-unit counts match expectations for lessons 1-9; lesson 10 reports the actual Stage B-projected content units (not empty as it would have been pre-fix, and not noisy with the retired warning).

**Step 9.8: Commit**

```bash
git add scripts/check-capability-health.ts scripts/__tests__/check-capability-health.test.ts
git commit -m "$(cat <<'EOF'
feat(capability-health): derive content units via lesson_id; retire unreachable-source-ref warning

Phase 1 of retiring lesson_page_blocks. The health probe now joins
content_units to the lesson via capability_content_units +
learning_capabilities.lesson_id (ADR 0006) instead of the page-block
reverse-lookup of content_unit_slugs[]. The ready_capability_unreachable_source_ref
warning is retired — without page blocks as an orthogonal enumeration layer,
the check has no semantic ground (the knownSourceRefs set was derived from
the same caps it was supposed to validate). filterScopedContentUnits is
deleted alongside (no other callers).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Full-system verification gauntlet

**Files:** none (verification only)

**Step 10.1: Full test suite**

```bash
bun run test
```
Expected: PASS. Record the new total count and compare to the pre-Phase-1 total. Net delta should be slightly negative (tests on retired surfaces deleted).

**Step 10.2: Static checks**

```bash
bun run lint
bun run build
```
Expected: 0 errors. Pre-existing warnings tolerated.

**Step 10.3: Migration idempotency**

```bash
make migrate-idempotent-check
```
Expected: PASS.

**Step 10.4: Pre-deploy gauntlet**

```bash
make pre-deploy
```
Expected: PASS. Tier 1 + tier 2 health checks confirm the live homelab Supabase still has clean RLS/grants/policies on the touched RPC. The retained `lesson_page_blocks` table is untouched.

**Step 10.5: Publish dry-run on lesson 10**

```bash
bun scripts/publish-approved-content.ts 10 --dry-run --skip-lint
```
Expected: Stage A completes (no page-block fields); Stage B completes (no regenerated file); both stages return `status: ok`.

**Step 10.6: Symbol sweep**

```bash
grep -rn "buildLessonPageBlocksFromStaging\|upsertLessonPageBlocks\|validateBlockKind\|validatePayloadAudio\|classifyBlockKind\|PageBlockInput\|validateLessonPageBlocks" scripts src 2>/dev/null
```
Expected: empty output (all symbols deleted).

```bash
grep -rn "lesson_page_blocks" scripts src 2>/dev/null
```
Expected: matches only in the contexts that intentionally retain the table (the `has_page_blocks` probe in the RPC, the `lesson_page_blocks` table reference in Lesson.tsx, the table reference in Session.tsx — those are the Phase-1 non-goals).

**Step 10.7: Manual RPC query**

```bash
psql "<homelab-connection-string>" <<EOF
SELECT order_index, ready_capability_count, practiced_eligible_capability_count, has_page_blocks
FROM indonesian.get_lessons_overview('<test-user-uuid>')
ORDER BY order_index;
EOF
```

Expected: lessons 1-9 show `has_page_blocks=true`; lesson 10 shows `has_page_blocks=false`. Capability counts match the parity probe from Step 6.6.

**Step 10.8: UI smoke test (`/lessons`)**

Open `https://indonesian.duin.home/lessons` (or `localhost:5173/lessons` if running dev server). Verify:
- Lessons 1-9 render as before (same prepared state, same capability count badges).
- Lesson 10 renders as "coming later" (matches `has_page_blocks=false`).
- Click into lesson 1 (bespoke route): renders unchanged.
- Click into lesson 4 (legacy renderer): renders unchanged.

**Step 10.9: PR open + frontmatter update**

Update plan frontmatter to `status: implementing` + `implementation: PR #<N>`. Open PR via:

```bash
gh pr create --title "feat(pipeline): retire lesson_page_blocks production (Phase 1)" --body "$(cat <<'EOF'
## Summary
- Pipeline (Stage A + Stage B) no longer produces lesson_page_blocks rows or the staging file.
- get_lessons_overview RPC reads capability counts from learning_capabilities.lesson_id (ADR 0006).
- PracticeActions.tsx, check-capability-release-readiness.ts, and check-capability-health.ts re-anchored on lesson_id.
- has_page_blocks return field preserved; lesson_page_blocks table preserved; existing rows for lessons 1-9 untouched.
- Session.tsx page-block read DEFERRED to Phase 2 (gated by has_page_blocks=false; no user-reachable code path for lesson 10+).

## Out of scope (Phase 2/3)
- Bespoke per-lesson pages + Session.tsx lesson_practice rewire (Phase 2).
- Dropping the lesson_page_blocks table (Phase 3).

## Plan
docs/plans/2026-05-20-retire-page-blocks-pipeline-phase-1.md

## Capability count parity (vs old RPC)
[Paste delta query result from Step 6.6 here — expected delta = 0 for lessons 1-9]

## Test plan
- [x] bun run test
- [x] bun run lint / build
- [x] make migrate-idempotent-check
- [x] make pre-deploy
- [x] Symbol sweep clean
- [x] Manual RPC query matches expectations
- [x] UI smoke /lessons + bespoke + legacy renderer all render

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After PR merges, update frontmatter to `status: shipped` + `merged_at: 2026-05-<DD>` in a follow-up commit.

---

## Risk matrix

| Risk | Likelihood | Mitigation |
|---|---|---|
| Capability counts diverge between old (source_ref-unnest) and new (lesson_id) join | Low | ADR 0006 enforces the constraint `source_kind in ('podcast_segment','podcast_phrase') OR lesson_id is not null` on `learning_capabilities` (`scripts/migration.sql:2052` — a CHECK constraint, not NOT NULL; functionally equivalent for our filter since podcast caps are excluded by `where c.lesson_id is not null` in the new RPC CTE). The parity probe in Step 6.6 catches any divergence empirically before merge. |
| `has_page_blocks` semantic drift | None | Phase 1 preserves the exact same EXISTS probe against the unchanged `lesson_page_blocks` table. Lessons 1-9 still report `true`; lesson 10 reports `false`. |
| Frontend deploys before RPC migration applies | Low | RPC return shape is byte-identical — old clients keep working. New `getLessonCapabilityPracticeSummaryByLessonId` method only runs from updated frontend code; old method `getLessonCapabilityPracticeSummary(sourceRefs)` is preserved for `Lesson.tsx:93` (legacy renderer code path used by lessons 4–9). |
| RPC migration applies before frontend deploys | None | Identical reasoning — return shape is byte-identical. |
| `Session.tsx:44` page-block read causes a regression for lesson 10+ | None — gated | Phase 1 keeps `has_page_blocks=false` for lesson 10+; the Lesson tile shows "coming later"; the user cannot click into the lesson; Session.tsx's `lesson_practice` mode is unreachable. Phase 2 rewires Session.tsx alongside the bespoke page work. |
| `check-capability-release-readiness.ts` regresses | Low | Task 8 rewires it; tests in Step 8.3 cover both 0-caps and N-caps cases. |
| `check-capability-health.ts` regresses | Low | Task 9 rewires it; smoke test in Step 9.4 verifies parity for lessons 1-9. |
| Pre-existing tests assume page blocks exist in fixtures | Medium | Tasks 1.5, 2.5, 3.3 explicitly update the test suite. Symbol sweep in 10.6 catches stragglers. |
| Lesson 10 publish blocks because lint-staging gates on something we missed | Low | Smoke test `bun scripts/lint-staging.ts 10` after Task 3 confirms — if anything related to derived files fires, fix in the same task. |
| `learner_capability_state` rows reference capabilities with `lesson_id = null` | None | ADR 0006 constraint enforces NOT NULL on lesson-derived caps. Podcast caps (NULL `lesson_id`) are filtered by `where c.lesson_id is not null` in the new RPC CTE. |
| Tests that mock retired symbols somewhere unexpected | Low | Step 3.1 + 10.6 grep sweeps catch them. |
| Dangling `index.ts` lesson-page-blocks re-export breaks future lesson generation | None after Task 4 | Task 4 removes the entry from `workflowIndexExports` and from every `lesson-{1..9}/index.ts`. |

---

## Notes for the executor

- Per CLAUDE.md "Implementation Autonomy": execute tasks 1-10 in sequence without asking for approval between each. Commit after each task. Stop only on test failure or unexpected DB state.
- Use `Edit` for line-level changes; `Write` only for the new paper-trail migration file (Task 6.3) and any whole-file deletions.
- Do NOT amend commits — each task gets its own commit. If a pre-commit hook fails, fix and create a new commit.
- The pre-existing `dialogue-translation-missing` CRITICAL findings from lint-staging for lesson 10 are NOT in scope for this plan; they get resolved by Stage B's `propagateDialogueTranslationsToLearningItems` at publish time, but lint-staging gates on them pre-publish. Separate fix in a separate plan.
- The bespoke lesson 1 page at `/lesson-preview/1` is unaffected.
- After Task 6 (the migration), Task 7's frontend change becomes meaningful — they share the lesson_id-based scoping. The deploy order is "migration first, then code" but within the merge sequence Tasks 6+7 are independent and can ship in either order in the same PR.
- The architect review caught that the original plan undercounted consumers. The fix landed in this revision — see the "five active consumers" table in Pre-flight.
