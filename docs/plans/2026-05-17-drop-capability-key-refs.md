---
status: shipped
implementation: PR #63
merged_at: 2026-05-17
implementation_paths:
  - scripts/migration.sql
  - scripts/lib/pipeline/lesson-stage/
  - scripts/lib/content-pipeline-output.ts
  - scripts/promote-capabilities.ts
  - scripts/check-capability-release-readiness.ts
  - scripts/check-capability-health.ts
  - src/lib/lessons/lessonExperience.ts
  - src/services/lessonService.ts
  - src/components/lessons/blocks/LessonBlockRenderer.tsx
  - src/components/lessons/LessonReader.module.css
  - src/lib/preview/localPreviewContent.ts
  - docs/current-system/modules/lesson-renderer.md
  - docs/current-system/data-model.md
supersedes: []
---

# Drop `lesson_page_blocks.capability_key_refs` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to drive this task-by-task.

**Goal:** Remove the denormalized `lesson_page_blocks.capability_key_refs` column entirely — schema, all readers, all writers, all test fixtures, and the small frontend transparency widget that depends on it. Migrate every consumer to either `learning_capabilities.lesson_id` (preferred) or the existing `content_unit_slugs` → `capability_content_units` junction path.

**Architecture:** The column is a denormalized cache of "which capabilities does this page block reference," populated by Stage A of the publish pipeline from a stale on-disk staging file. The freshness problem this caused (issue #61) is structurally unresolvable without breaking the Stage A → Stage B handoff seam. Removing the column eliminates the failure mode entirely. The single consumer that genuinely needs scoping by lesson (`scripts/promote-capabilities.ts`) switches to `learning_capabilities.lesson_id` (mandatory per **ADR 0006 — `docs/adr/0006-extend-lesson-id-to-all-capabilities.md`**, enforced by the `learning_capabilities_lesson_id_required_for_lessons` CHECK constraint and the `validateLessonIdPresence` pre-publish validator). The frontend display widget that renders the column's contents is removed — it was a development-time transparency surface that doesn't belong in the learner-facing lesson reader.

### Promoter semantic equivalence

The cleanup hinges on the claim that `WHERE lesson_id = <UUID>` is a complete substitute for `collectLessonCapabilityKeys`'s historical UNION of (`lesson_page_blocks.capability_key_refs` ∪ `capability_content_units` joined via this lesson's content_units). Verified:

- `scripts/lib/content-pipeline-output.ts:766-773` builds `capabilitiesByUnitSlug` from `input.capabilities` only — i.e. *this lesson's staging-stage capabilities*. The column never carried foreign-lesson keys; it was always a same-lesson denormalization.
- ADR 0006 + `scripts/lib/pipeline/capability-stage/validators/lessonId.ts` guarantee every non-podcast cap emitted by `runCapabilityStage` for lesson N gets `lesson_id = N`, with the validator throwing on any violation pre-write.
- Therefore the new `WHERE lesson_id = <UUID>` query produces a strict equivalent of (or superset of, in the degenerate case of caps not in any page block) the old UNION. No foreign-lesson leakage, no cross-lesson reuse regression.

**Tech Stack:** TypeScript, PostgreSQL, Bun, Vitest. Schema change goes in `scripts/migration.sql` per the migration source-of-truth rule.

---

## Issue resolved

GitHub issue #61 — *Phrase-type learning_items not promoted to readiness=ready/publication=published*. The root cause was that `lesson_page_blocks.capability_key_refs` in the DB held labels written by Stage A from a pre-#59 on-disk staging file, while `learning_capabilities.canonical_key` held labels written by Stage B from the post-#59 slug rule. Dropping the column makes the dual-write divergence impossible.

## Required reading (executor must read before starting)

1. `gh issue view 61 -R AlbertvD/learning-indonesian` — the symptom.
2. **`docs/adr/0006-extend-lesson-id-to-all-capabilities.md`** — the architectural justification for scoping by `lesson_id`. Defines the CHECK constraint and the validator that together guarantee the new promoter scope is complete for non-podcast caps.
3. `scripts/promote-capabilities.ts:235-307` — the load-bearing reader. The promoter currently scopes "this lesson's caps" via `collectLessonCapabilityKeys`. Post-drop it reads `learning_capabilities.lesson_id` directly.
4. `scripts/check-capability-release-readiness.ts:67-95` — defines `collectLessonCapabilityKeys`. This function is exported and used by three callers (promote, health-check, the script's own main). All three need updating.
5. `scripts/lib/content-pipeline-output.ts:759-1010` — the builder that populates `capability_key_refs` for each block kind. Builds the field in ~7 distinct branches (hero, lesson sections, vocab strips, pattern callouts, practice bridges, recaps, affixed-form-pair units). Each branch has a `capability_key_refs:` line that goes away. **Note the same-lesson denormalization at lines 766-773** — this is the cite that makes the promoter rewrite safe (see "Promoter semantic equivalence" above).
6. `scripts/lib/pipeline/lesson-stage/adapter.ts:131-145` — the DB upsert that writes the column. Drop the field from the upsert payload and the input type.
7. `src/components/lessons/blocks/LessonBlockRenderer.tsx:140-164` — the `<details>` widget that displays the column's contents inside `practice_bridge` blocks. Remove the entire `<details>` element; keep the rest of the block as-is.
8. `scripts/migration.sql:1633-1654` — the ADR-0006 historical backfill that READS the column to populate `learning_capabilities.lesson_id`. The backfill ran successfully on the live DB; its presence in `migration.sql` is to make the file idempotent for fresh DBs. Once the column is dropped on the live DB, the unnest reference fails at parse time. Wrap the whole UPDATE in a `do $$ if column exists then ... end if; end $$;` block so post-drop runs are clean no-ops.
9. `docs/current-system/modules/lesson-renderer.md:84,122` and `docs/current-system/data-model.md:78` — both document the column. Per CLAUDE.md "When you change a module's public interface, internal flow, or invariants — same commit as the code change" — these update in the same PR.
10. `CLAUDE.md` — migration source-of-truth rule (schema change goes in `scripts/migration.sql`, NOT in `scripts/migrations/*.sql`); plan-status awareness; Supabase Requirements section is required below; module-spec freshness rule.

## Pre-flight verification (run before starting)

```bash
# 1. Latest main, #62 merged
git log --oneline -5 origin/main
# Should show: a7daf74 docs(plans): mark decision-3b cleanup plan shipped (PR #62)

# 2. HC8 must be green (the lesson_id invariant we're depending on)
make check-supabase-deep 2>&1 | grep "HC8"
# Expected: ✓ HC8 learning_capabilities.lesson_id non-null for non-podcast caps (ADR 0006)

# 3. Verify the column is still present (sanity check)
echo "select count(*) from information_schema.columns where table_schema='indonesian' and table_name='lesson_page_blocks' and column_name='capability_key_refs';" | psql ...
# Should return 1.
```

If HC8 is red, the lesson_id-based scoping is unsafe — stop and investigate before proceeding.

## Scope

**File-count summary:** 36 files mention the column or its camelCase. 12 are real code changes, 9 are test fixtures (mostly trivial), 9 are derived staging files (auto-regenerated), 2 are maintenance scripts to delete, 2 are docs to update, 2 are intentionally left alone (paper-trail migrations, see Out-of-Scope).

### In scope

1. **Schema drop** of `indonesian.lesson_page_blocks.capability_key_refs` with the historical backfill UPDATE guarded against missing column.
2. **All pipeline writers** stop populating the field:
   - `scripts/lib/pipeline/lesson-stage/adapter.ts` (drop from `PageBlockInput` type + upsert payload)
   - `scripts/lib/pipeline/lesson-stage/runner.ts` (drop from `PageBlockStaging` type + `classifiedBlocks` map)
   - `scripts/lib/content-pipeline-output.ts` (drop from `StagingLessonPageBlock` interface + ~7 builder branches, plus the local `capabilitiesByUnitSlug` helper at lines 766-773, plus the now-unused `capabilities` parameter of `buildLessonPageBlocksFromStaging`)
3. **All pipeline readers** rewritten:
   - `scripts/promote-capabilities.ts` — replace `collectLessonCapabilityKeys` call with a direct query of `learning_capabilities.canonical_key WHERE lesson_id = <lesson UUID>`. The promoter has the lesson UUID already (it computes it from `lessonNumber` via the `lessons` table). The replacement is ~10 lines that supplant the entire `loadPromotionPlan` block from `lesson_page_blocks` read at line 246 through `scopedCapabilityKeys` at line 265.
   - `scripts/check-capability-release-readiness.ts` — remove the `collectLessonCapabilityKeys` export OR rewrite it to derive from `lesson_id`. Cleaner: remove and have callers query directly. Also update the script's own main() if it has a similar block.
   - `scripts/check-capability-health.ts` — uses the function. Update to lesson_id-based query.
4. **Frontend production code:**
   - `src/services/lessonService.ts` — drop `capability_key_refs` from the `LessonPageBlock` type.
   - `src/lib/lessons/lessonExperience.ts` — drop `capabilityKeyRefs` from `LessonExperienceBlock` type + the mapping at line 85.
   - `src/lib/preview/localPreviewContent.ts` — drop the field from the preview's mock data builder.
   - `src/components/lessons/blocks/LessonBlockRenderer.tsx` — remove the entire `<details>` widget at lines 155-161, including its inner `<summary>` and `<ul>`. Practice bridge block becomes kicker + title + body only.
   - `src/components/lessons/LessonReader.module.css` — remove the `.meta`, `.meta summary`, `.meta ul` CSS blocks (no other consumers per the architect-verified grep).
5. **Documentation updates** (CLAUDE.md "When to update a module spec" — same commit as the code change):
   - `docs/current-system/modules/lesson-renderer.md` — drop `capabilityKeyRefs` from the `LessonExperienceBlock` shape at line 84; rewrite the `practice_bridge` row at line 122 to drop the `<details>` widget mention; bump `last_verified_against_code` in the frontmatter.
   - `docs/current-system/data-model.md:78` — drop the `capability_key_refs[]` mention from the `lesson_page_blocks` description.
6. **Test fixtures**: every test file that builds a fixture object with the field. List below.
7. **Maintenance scripts deleted**:
   - `scripts/regenerate-all-lesson-page-blocks.ts` — purpose-built to force-rewrite the file when it diverged from the DB. Obsolete post-drop.
   - `scripts/sync-lesson-page-blocks-only.ts` — same purpose. Obsolete post-drop.
8. **Comment cleanup**: `scripts/materialize-capabilities.ts:48` mentions the column in a comment. Update or remove.
9. **Re-run promotion** against the live DB for all 9 lessons after the migration applies, so the stuck multi-word phrase items get promoted via the new lesson_id path.

### Out of scope

- **Paper-trail migrations are intentionally left alone.** `scripts/migrations/2026-04-25-content-units-lesson-blocks.sql:36` (the column origin) and `scripts/migrations/2026-05-07-retire-source-progress.forward.sql:91,95` (the historical backfill paper trail) both reference the column. Per CLAUDE.md migration source-of-truth rule, these files are NOT applied by `make migrate` (only `scripts/migration.sql` is); their job is historical accuracy of what was applied when. A future agent must NOT "helpfully" add a guard there.
- The 14 unpromoted `source_kind='pattern'` capabilities — separate parallel issue, follow-up issue to file. Pattern caps DO get `lesson_id` stamped per ADR 0006, so they WILL be in scope of the new `WHERE lesson_id = <UUID>` query post-cleanup — but they may still fail individual readiness validators for content-quality reasons. Task 9 Step 2's verification SQL makes this expectation explicit.
- Legacy projection for lessons 1-3 (`legacy_projection` in `capabilityTypes.ts:96`) — separate cleanup, needs its own audit.
- The dialogue-cloze-missing CRITICAL findings in lessons 5/7/8/9 — authoring quality, separate.
- The `source_refs` array column — load-bearing for cross-lesson exposure views (verified at `scripts/migration.sql:1714, 2075-2076`), keep.
- The `content_unit_slugs` array — used as the alternative path; keep.
- No homelab redeploy required for the schema change; `make migrate` handles it.

### Deploy ordering

Compatible-wire-format change. Schema can be applied before or after the code lands:

- The frontend's `lessonService.ts` uses `select('*')`, so a dropped column simply produces an object without the field. The mapper at `lessonExperience.ts:85` already has `block.capability_key_refs ?? []`, which gracefully resolves to `[]`. The `<details>` widget then renders `0 vaardigheidsverwijzing(en)` until the container redeploy lands — cosmetic, not functional.
- Promote/health-check rewrites depend on the schema change happening before they run. They're operator-invoked locally (not on a hot path), so we coordinate explicitly.

Migration-first is fine; no redeploy gate. The `src/` changes ship via the next GitHub Actions build after merge.

## Supabase Requirements

### Schema changes

- **Drop column** `indonesian.lesson_page_blocks.capability_key_refs` (currently `text[] not null default '{}'`).
- Pattern: mirror `scripts/migration.sql:1794-1803` (the `source_progress_event` drop precedent) — wrap in `do $$ if column exists ... end if; end $$` so re-runs are no-ops.
- **Guard the historical backfill** at `scripts/migration.sql:1633-1654` with a column-existence check so it doesn't fail-parse post-drop.
- No RLS policy changes — RLS is at the row level, the column drop doesn't affect access.
- No grant changes — grants are at the table level, the column drop doesn't affect them.

### homelab-configs changes

- [ ] PostgREST: N/A — no schema exposure changes (still `indonesian`).
- [ ] Kong: N/A — no CORS or origin changes.
- [ ] GoTrue: N/A — auth unchanged.
- [ ] Storage: N/A — no bucket changes.

### Health check additions

- `scripts/check-supabase-deep.ts` — no new check needed. HC8 (lesson_id non-null) already guards the invariant the new promoter relies on. An optional HC10 could assert that `lesson_page_blocks` does NOT have the column — but that's belt-and-braces for an irreversible schema change. Skip.

---

## Task 1 — Setup verification

**Step 1: Run pre-flight checks** (per pre-flight verification block above). Confirm HC8 green and the column still present.

**Step 2: Snapshot the column** before destruction. Save the cap key refs from every block to `/tmp/capability_key_refs-snapshot-2026-05-17.json` as 7-day rollback insurance, in case we need to reconstruct.

```sql
SELECT block_key, source_ref, capability_key_refs
FROM indonesian.lesson_page_blocks
WHERE array_length(capability_key_refs, 1) > 0
ORDER BY source_ref, display_order;
```

Save the result to `content/decision-3b-cleanup-backup-capability_key_refs-2026-05-17.json` (gitignored, persists across reboots) rather than `/tmp/`. Snapshot is informational — the data is reconstructable from `learning_capabilities.lesson_id` plus the canonical_key string. We don't expect to need it; we save it anyway.

---

## Task 2 — Schema migration

**Files:**
- Modify: `scripts/migration.sql` (add DROP COLUMN block + guard the historical UPDATE)

**Step 1: Locate the existing `source_progress_event` drop precedent.**

It's at `scripts/migration.sql:1794-1803`. Copy its shape exactly.

**Step 2: Guard the historical UPDATE at lines 1633-1654.**

Wrap the existing UPDATE statement in a `do $$ ... end $$` block with a column-existence check:

```sql
-- Backfill is preserved for idempotency on fresh DBs but skips the read once
-- the column is dropped. See drop-block below for the actual drop.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'indonesian'
      and table_name = 'lesson_page_blocks'
      and column_name = 'capability_key_refs'
  ) then
    -- (the existing UPDATE statement from lines 1642-1654 goes here, unchanged)
    update indonesian.learning_capabilities c
    set lesson_id = sub.lesson_id
    from (
      select distinct on (cap_key)
        unnest(pb.capability_key_refs) as cap_key,
        l.id as lesson_id
      from indonesian.lesson_page_blocks pb
      join indonesian.lessons l on pb.source_ref = 'lesson-' || l.order_index
      where array_length(pb.capability_key_refs, 1) > 0
      order by cap_key, l.order_index
    ) sub
    where c.canonical_key = sub.cap_key
      and c.lesson_id is null;
  end if;
end $$;
```

**Step 3: Add the drop block** after the existing `source_progress_event` drop (around line 1803, in the cleanup section).

```sql
-- D-R-O-P column lesson_page_blocks.capability_key_refs (issue #61 closeout)
-- Eliminates the dual-write divergence between Stage A (copies from stale
-- on-disk staging) and learning_capabilities.canonical_key (Stage B's
-- authoritative output). Promotion now scopes by learning_capabilities.lesson_id.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'indonesian'
      and table_name = 'lesson_page_blocks'
      and column_name = 'capability_key_refs'
  ) then
    alter table indonesian.lesson_page_blocks drop column capability_key_refs;
  end if;
exception when others then null;
end $$;
```

**Step 4: Run idempotency check** locally before committing.

```bash
make migrate-idempotent-check
```

Expected: applies cleanly twice, deep check passes both times. The second application is a no-op because the `if exists` guards both the backfill and the drop.

**Why this is idempotent on fresh DBs too:** the `lesson_page_blocks` table is born in the paper-trail file `scripts/migrations/2026-04-25-content-units-lesson-blocks.sql:23-40` (which includes `capability_key_refs text[] not null default '{}'` at line 36). `scripts/migration.sql` never re-creates the table. So on a fresh DB the flow is: paper-trail SQL creates table with column → `migration.sql` backfill sees the column and runs the UPDATE → `migration.sql` drop block fires and removes the column. Second pass: column absent → backfill skips → drop skips. Both runs converge to the same end state.

**Step 5: Commit (do NOT apply to live DB yet).**

```bash
git add scripts/migration.sql
git commit -m "feat(schema): drop lesson_page_blocks.capability_key_refs (#61)"
```

---

## Task 3 — Pipeline writers (Stage A, builder)

**Files:**
- Modify: `scripts/lib/pipeline/lesson-stage/adapter.ts:27-33, 131-145`
- Modify: `scripts/lib/pipeline/lesson-stage/runner.ts:56, 191`
- Modify: `scripts/lib/content-pipeline-output.ts:97, 794, 825, 851, 868, 901, 942, 960, 972, 1002`

**Step 1: adapter.ts** — drop the field from `PageBlockInput` and the upsert payload.

**Step 2: runner.ts** — drop `capability_key_refs?: string[]` from `PageBlockStaging` and the field from `classifiedBlocks`. Also drop any `classifyBlockKind` call argument that depended on it (check line 184-188 — currently doesn't reference cap keys, but verify).

**Step 3: content-pipeline-output.ts** — `buildLessonPageBlocksFromStaging` currently emits `capability_key_refs: [...]` in seven block-emission branches. Drop the field from each, drop the local helpers that compute it (`capabilitiesByUnitSlug` map can be deleted entirely — it's only used to populate this field). Drop the type field from `StagingLessonPageBlock` at line 97.

The local helper `capabilitiesByUnitSlug` (line 767-773) was the only reason the builder needed the `capabilities` argument. After the helper is gone, the builder no longer needs the `capabilities` parameter at all. Verify by reading the file end-to-end. If the parameter becomes unused, drop it from the signature; update both callers (`scripts/generate-staging-files.ts:429-432` and `scripts/lib/pipeline/capability-stage/runner.ts:251-255`) to stop passing it.

**Step 4: Run unit tests** (just the lesson-stage ones).

```bash
bun run test scripts/lib/pipeline/lesson-stage/__tests__/
```

Fixture updates expected. Apply minimal changes to make them pass.

**Step 5: Commit.**

```bash
git add scripts/lib/pipeline/lesson-stage/ scripts/lib/content-pipeline-output.ts
git commit -m "feat(pipeline): drop capability_key_refs from Stage A writers (#61)"
```

---

## Task 4 — Pipeline readers (promoter, release-readiness, health check)

**Files:**
- Modify: `scripts/promote-capabilities.ts:246-265`
- Modify: `scripts/check-capability-release-readiness.ts:11, 67-95, 146` (remove `collectLessonCapabilityKeys` entirely, OR rewrite its body)
- Modify: `scripts/check-capability-health.ts:540-547, 591`
- Possibly: `scripts/materialize-capabilities.ts:48` (comment cleanup)

**Step 1: promote-capabilities.ts** — replace `collectLessonCapabilityKeys` call with a direct query.

The current shape at line 246-265:

```ts
const { data: blocks, error: blocksError } = await db()
  .from('lesson_page_blocks')
  .select('capability_key_refs')
  .eq('source_ref', args.sourceRef)
// ...build relationshipCapabilities from content_units...
const scopedCapabilityKeys = collectLessonCapabilityKeys({ ... })
```

Replace with:

```ts
const { data: lessonRow, error: lessonErr } = await db()
  .from('lessons')
  .select('id')
  .eq('order_index', args.lesson)
  .single()
if (lessonErr) throw lessonErr
const { data: capRows, error: capsErr } = await db()
  .from('learning_capabilities')
  .select('canonical_key')
  .eq('lesson_id', lessonRow.id)
if (capsErr) throw capsErr
const scopedCapabilityKeys = (capRows ?? []).map(r => r.canonical_key)
```

This is the single load-bearing semantic change. Architect should review this specifically.

**Step 2: check-capability-release-readiness.ts** — `collectLessonCapabilityKeys` becomes dead code if no caller still uses it. Decision tree:
- If only the promoter and the script's own main() used it: delete the export and rewrite the main() with the same lesson_id path.
- If other callers exist outside our scope: keep the function but rewrite its body to query `learning_capabilities` by `lesson_id`. The signature becomes `({ lessonId: string })` instead of taking `lessonPageBlocks + relationshipCapabilities`.

Grep one more time to be sure:

```bash
grep -rn "collectLessonCapabilityKeys" src/ scripts/
```

Verified previously: callers are `promote-capabilities.ts:262`, `check-capability-release-readiness.ts:161` (own main), `check-capability-health.ts:591`, plus its test at `__tests__/check-capability-release-readiness.test.ts`. All three production callers need the rewrite either way.

**Step 3: check-capability-health.ts** — same pattern as promote-capabilities. Update line 540 to drop the `capability_key_refs` select, update line 591 to query `learning_capabilities` by `lesson_id`.

**Step 4: materialize-capabilities.ts:48** — just a comment. Drop or update.

**Step 5: Run readiness + promotion tests.**

```bash
bun run test scripts/__tests__/check-capability-release-readiness.test.ts scripts/__tests__/promote-capabilities.test.ts
```

Fixtures need updating — the readiness test currently provides `capability_key_refs: [...]` in its inputs.

**Step 6: Commit.**

```bash
git add scripts/promote-capabilities.ts scripts/check-capability-release-readiness.ts scripts/check-capability-health.ts scripts/materialize-capabilities.ts scripts/__tests__/check-capability-release-readiness.test.ts
git commit -m "feat(promotion): scope by learning_capabilities.lesson_id (#61)"
```

---

## Task 5 — Frontend (production)

**Files:**
- Modify: `src/services/lessonService.ts:55` (drop type field)
- Modify: `src/lib/lessons/lessonExperience.ts:21, 85` (drop type field + mapper)
- Modify: `src/components/lessons/blocks/LessonBlockRenderer.tsx:155-161` (remove `<details>` widget)
- Modify: `src/lib/preview/localPreviewContent.ts:56` (drop field from preview mock)

**Step 1: lessonService.ts** — drop `capability_key_refs: string[]` from the `LessonPageBlock` type.

**Step 2: lessonExperience.ts** — drop `capabilityKeyRefs: string[]` from `LessonExperienceBlock` interface (line 21) and the corresponding mapping at line 85.

**Step 3: LessonBlockRenderer.tsx** — remove the entire `<details>` element at lines 155-161. Practice bridge block becomes:

```tsx
if (block.kind === 'practice_bridge') {
  return (
    <section
      className={`${classes.block} ${classes.practiceBlock}`}
      aria-labelledby={`${block.id}-title`}
    >
      <div className={classes.blockTopline}>
        <p className={classes.kicker}>
          <IconArrowRight size={12} /> Oefenbrug
        </p>
      </div>
      <h2 id={`${block.id}-title`} className={classes.blockTitle}>{block.title}</h2>
      <p className={classes.blockBody}>
        {body || 'Oefenen komt beschikbaar wanneer de planner en reviewverwerker aangeven dat de vaardigheid klaar is.'}
      </p>
    </section>
  )
}
```

Verify the `.meta` CSS class in `LessonReader.module.css` is no longer referenced elsewhere; if not, the CSS block at `.meta` and `.meta summary`/`.meta ul` can also be removed (separate small cleanup commit).

**Step 4: localPreviewContent.ts** — drop the `capability_key_refs:` line from the preview content builder.

**Step 5: Update module + data-model specs** (same commit per CLAUDE.md):
- `docs/current-system/modules/lesson-renderer.md:84` — drop `capabilityKeyRefs: string[]` from the documented `LessonExperienceBlock` shape.
- `docs/current-system/modules/lesson-renderer.md:122` — in the renderer-output table row for `practice_bridge`, drop the mention of the `<details>` widget / capability-references panel.
- `docs/current-system/modules/lesson-renderer.md` frontmatter — bump `last_verified_against_code: 2026-05-17`. Keep `status: stable` — code + spec update land in the same commit, so there's no in-flight window.
- `docs/current-system/data-model.md:78` — drop the `capability_key_refs[]` mention from the `lesson_page_blocks` schema description.

**Step 6: Run frontend tests.**

```bash
bun run test src/__tests__/Lesson.test.tsx src/__tests__/LessonReader.test.tsx src/__tests__/lessonExperience.test.ts src/lib/lessons/__tests__/lessonExperience.test.ts
```

Test fixtures need updates — all four files set up the field in their mock data.

**Step 7: Commit.**

```bash
git add src/services/lessonService.ts src/lib/lessons/lessonExperience.ts src/components/lessons/blocks/LessonBlockRenderer.tsx src/lib/preview/localPreviewContent.ts src/components/lessons/LessonReader.module.css src/__tests__/Lesson.test.tsx src/__tests__/LessonReader.test.tsx src/__tests__/lessonExperience.test.ts src/lib/lessons/__tests__/lessonExperience.test.ts docs/current-system/modules/lesson-renderer.md docs/current-system/data-model.md
git commit -m "feat(frontend): drop capabilityKeyRefs from lesson types + remove transparency widget (#61)"
```

---

## Task 6 — Delete obsolete maintenance scripts

**Files:**
- Delete: `scripts/regenerate-all-lesson-page-blocks.ts`
- Delete: `scripts/sync-lesson-page-blocks-only.ts`

Both scripts exist solely to force-rewrite `lesson-page-blocks.ts` on disk when it diverged from desired state. Post-drop, the only thing they were syncing is gone, so they have no purpose.

**Step 1: Verify nothing imports them.**

```bash
grep -rn "regenerate-all-lesson-page-blocks\|sync-lesson-page-blocks-only" scripts/ src/ Makefile
```

Expected: zero hits outside their own filenames.

**Step 2: Delete and commit.**

```bash
git rm scripts/regenerate-all-lesson-page-blocks.ts scripts/sync-lesson-page-blocks-only.ts
git commit -m "chore: delete obsolete maintenance scripts (#61)"
```

---

## Task 7 — Test fixtures and full test pass

**Files:**
- The remaining test fixture files that haven't already been updated by Tasks 3-5:
  - `scripts/__tests__/lesson-page-blocks.test.ts:45, 62` — check whether it's `lesson-page-blocks` testing the BUILDER or the runner. Either way, drop the field from fixtures and update assertions that mention the field.
  - `scripts/__tests__/retire-source-progress-migration.test.ts:43` — this test asserts the migration SQL contains the literal `unnest(pb.capability_key_refs) as cap_key`. Post-cleanup the line still exists (it's now inside the guarded DO block from Task 2). Rewrite the assertion to verify **both** that the historical UPDATE is still present (preserves the original retirement #6 regression guard) AND that the new column-existence guard is in place. Recommended shape:

    ```ts
    it('guards the historical backfill against missing column post-drop', () => {
      expect(masterSql).toContain('unnest(pb.capability_key_refs) as cap_key')
      expect(masterSql).toMatch(
        /if exists \([\s\S]*?column_name = 'capability_key_refs'[\s\S]*?\) then[\s\S]*?unnest\(pb\.capability_key_refs\) as cap_key/i,
      )
    })
    ```

    This keeps the original regression guard alive AND adds a new regression guard ensuring the column-existence check isn't accidentally removed by a future cleanup.

**Step 1: Run full test suite.**

```bash
bun run test
```

Expected: green or near-green. Fix any straggler fixtures.

**Step 2: Commit.**

```bash
git add scripts/__tests__/
git commit -m "test: remove capability_key_refs from remaining fixtures (#61)"
```

---

## Task 8 — Apply migration to live DB

**Step 1: Run pre-deploy locally** (CLAUDE.md gate).

```bash
make pre-deploy
```

Expected: lint + test + build + tier 1 + tier 2 all green except known pre-existing failures (the lesson `audio_path` cluster + HC4 audio coverage parity).

**Step 2: Apply migration.**

```bash
make migrate
```

This SSHes to homelab, runs the SQL, reloads PostgREST, runs deep check. Expected: all green except known pre-existing failures.

**Step 3: Verify the column is gone.**

Via openbrain MCP `execute_sql`:

```sql
SELECT count(*) FROM information_schema.columns
WHERE table_schema='indonesian'
  AND table_name='lesson_page_blocks'
  AND column_name='capability_key_refs';
-- Should return 0
```

**Step 4: Verify HC8 still green.**

```bash
make check-supabase-deep 2>&1 | grep "HC8"
```

HC9 should also remain green (it queries `learning_capabilities` ↔ `learning_items`, unrelated to the dropped column).

---

## Task 9 — Re-run promotion across all 9 lessons

After the migration applies, the existing multi-word phrase capabilities that were stuck at `readiness=unknown, publication=draft` (per issue #61) need to be re-evaluated by the new lesson_id-based promotion path.

**Step 1: Run promotion for each lesson.**

```bash
for n in 1 2 3 4 5 6 7 8 9; do
  bun scripts/promote-capabilities.ts --lesson "$n" --apply
done
```

Each run emits a JSON report with `counts.promotions` and `counts.blocked`. Sum the promotions; expect ~50-100 newly-promoted caps across all 9 lessons (mostly the stuck phrase items).

**Step 2: Verify phrase items promoted.**

```sql
-- Item-source-kind caps grouped by learning_items.item_type
SELECT li.item_type, count(*) FILTER (WHERE lc.readiness_status != 'ready') AS not_ready,
       count(*) FILTER (WHERE lc.readiness_status = 'ready') AS ready
FROM indonesian.learning_items li
JOIN indonesian.learning_capabilities lc ON lc.source_ref = 'learning_items/' || li.normalized_text
WHERE li.is_active = true
GROUP BY li.item_type;
```

Expected: `not_ready` near zero for `item_type = 'phrase'` AND `item_type = 'word'`. Pre-cleanup, `phrase` was the failing population (per issue #61); post-cleanup, both should be uniformly `ready`.

```sql
-- Pattern source_kind caps — separate population, separate verification
SELECT count(*) FILTER (WHERE readiness_status != 'ready') AS pattern_not_ready,
       count(*) FILTER (WHERE readiness_status = 'ready') AS pattern_ready
FROM indonesian.learning_capabilities
WHERE source_kind = 'pattern'
  AND lesson_id IS NOT NULL;
```

Expected for `source_kind = 'pattern'`: these caps **will be in scope** of the new `WHERE lesson_id = <UUID>` promotion query (per ADR 0006, pattern caps get `lesson_id` stamped), so the promoter considers them. However, some may still fail individual readiness validators for content-quality reasons (artifact-validation gap that pre-exists this cleanup). A non-zero `pattern_not_ready` is **expected** and **out of scope for this PR** — it's the parallel structural issue documented for follow-up. Record the count in the PR description.

---

## Task 10 — Smoke test as testuser

**Step 1: Log in as testuser (testuser@duin.home / TestUser123!).**

**Step 2: Walk through lesson 1 → standard session.**

Expected: previously-broken multi-word items like `terima kasih`, `selamat datang`, `apa kabar`, `bandar udara` (lesson 3) appear as exercises in the session.

**Step 3: Inspect a `practice_bridge` block in the lesson reader.**

Expected: no `<details>` widget at the bottom. Block ends with the body paragraph.

**Step 4: Screenshot a session showing a multi-word item.**

Save for the PR description.

---

## Task 11 — Open PR + close #61

**Step 1: Push and PR.**

```bash
git push -u origin chore/drop-capability-key-refs
gh pr create --title "chore: drop lesson_page_blocks.capability_key_refs (#61)" --body "<see template below>"
```

PR body should cover:
- Closes #61.
- Schema change (one column drop, idempotency-guarded).
- Promotion path now scopes by `learning_capabilities.lesson_id` (mandatory per ADR 0006 — every lesson-derived capability has an introducing lesson, enforced by the `learning_capabilities_lesson_id_required_for_lessons` CHECK + the `validateLessonIdPresence` pre-publish validator).
- Frontend `<details>` transparency widget removed (lesson reader unaffected for learners).
- Two maintenance scripts deleted.
- Module + data-model docs updated to drop the field from their schemas.
- Before/after SQL counts confirming all phrase items now ready/published.

**Step 2: After merge, archive this plan + file follow-up issues.**

Two follow-ups to file:
- Investigate unpromoted `source_kind='pattern'` capabilities (parallel structural issue).
- Audit legacy projection for lessons 1-3 (`requiredSourceProgress.kind: 'none', reason: 'legacy_projection'` in `src/lib/capabilities/capabilityTypes.ts:96`).

---

## Rollback strategy

**Pre-migration (Tasks 1-7):** all changes are in source control. Discard the branch.

**Post-Task 8 (migration applied, column gone):** the column is irrecoverable from the live DB once dropped. The cap-key-refs data is reconstructable from `learning_capabilities.lesson_id` + `canonical_key`, so no learner data is lost. The migration is one-way; rolling back would require re-adding the column + re-running the builder on every lesson. Cost: a publish loop. The `/tmp/capability_key_refs-snapshot-2026-05-17.json` from Task 1 Step 2 captures the pre-drop state for forensic reference.

**Post-Task 9 (promotion ran):** promotion only flipped statuses to `ready/published`. To roll back, revert each affected cap to `unknown/draft` via SQL. Worst case: a full publish loop reconstructs the state.

**Worst case (DB regression):** homelab's daily Supabase backup (~24h RPO). Bounded blast radius — schema is one column, code paths are bounded to the seven files in Tasks 3-5.

---

## Estimated diff size

- This plan: ~400 LOC (committed)
- Schema migration: ~30 LOC (committed)
- Pipeline writer code: ~50 LOC removed (committed)
- Pipeline reader rewrites: ~40 LOC modified (committed)
- Frontend production code: ~30 LOC removed + ~20 LOC CSS (committed)
- Module + data-model docs: ~10 LOC modified (committed)
- Test fixtures: ~50 LOC removed across 9 files (committed)
- Maintenance scripts deleted: ~150 LOC removed (committed)
- Comment cleanup: ~5 LOC (committed)
- Staging file regen (next publish, separate concern): ~7000 lines of `capability_key_refs:` lines disappear, captured by Stage B's regen on next publish (out of this PR's scope unless we want to commit the regenerated staging files alongside)

**Total committed diff: ~650 LOC code + ~7000 lines if we include the regenerated staging files. The regen is optional — the next publish will produce the diff on its own.**

**Touched-file inventory:** 36 files match the column or its camelCase. Of those, 12 are real code, 9 are test fixtures, 9 are derived staging files (auto-regen), 2 are maintenance scripts (deleted), 2 are docs (updated), and 2 are paper-trail migrations intentionally left untouched (see Scope §Out-of-scope).

Operational steps: 1 migration + 9 promotions + 1 smoke test.
