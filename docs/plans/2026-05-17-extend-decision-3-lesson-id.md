---
status: draft
supersedes: []
---

# Extend Decision 3 — every capability has an introducing lesson

**Date:** 2026-05-17
**Status:** draft (architect review pending)

## Goal

Make `learning_capabilities.lesson_id` non-nullable by extending the existing Decision 3 rule (currently morphology-only) to every capability source kind. Each capability gets stamped with the lesson that introduces it. The pipeline emits the field; the schema enforces it; the planner relies on it for activation gating instead of falling back on a sparse signal.

## Why

### Today's state — five DQ issues, all rooted in the same gap

A SQL sweep on 2026-05-17 turned up:

| # | Issue | Count |
|---|---|---|
| 1 | NULL `lesson_id` on `learning_capabilities` | 1,613 / 2,649 (61%) |
| 2 | Stuck `readiness_status='unknown'` + `publication_status='draft'` | 609 |
| 3 | Mixed `projection_version` (`v1` rows alongside `v2`) | 1,708 v1 / 941 v2 |
| 4 | Item caps whose `source_ref` slug has no matching `learning_items.normalized_text` | 804 (512 still `ready`/`published`) |
| 5 | `learning_items` rows with no capability projection | 287 / 732 |

Issues 1, 3, 4, 5 all get fixed by re-running the projector for each lesson with a corrected projection. Issue 2 is independent (artifact-readiness gap; out of scope here).

### Why Decision 3 left vocab/grammar alone

Per `docs/plans/2026-05-10-capability-stage-spec-rewrite.md:243-251`, Decision 3 addressed only morphology capabilities — it resolved a real tie-break ambiguity (an affixed form could be claimed by the lesson where the form appears, the lesson where the root was first taught, or the lesson where the morphology rule was introduced — Decision 3 picks the rule-introducing lesson). It did **not** state that other source kinds should be lesson-independent. The current implementation (`scripts/lib/pipeline/capability-stage/runner.ts:378-381`) conditionally stamps `lessonId` only for `affixed_form_pair`, leaving every other source_kind at `null`. That null state is an **unfilled spec gap**, not a deliberate architectural choice.

The inline comment at `scripts/lib/pipeline/capability-stage/adapter.ts:103` (*"Decision 3: morphology rows set this; vocab/grammar leave it null"*) describes current behavior but is misleading about Decision 3's intent.

### What breaks today as a result

- **Planner activation gate** (`src/lib/session-builder/pedagogy.ts:209`) suppresses capabilities only when `capability.lessonId != null && !activatedLessons.has(...)`. NULL-lesson caps bypass the gate entirely — they surface in `standard` sessions regardless of which lessons the learner has activated. Lesson activation is functionally advisory for vocab.
- **Drying detector** (`src/lib/session-builder/builder.ts`, post-PR-B) computes `currentLessonHasEligibleIntroductions = learningPlan.eligibleNewCapabilities.some(e => e.capability.lessonId === currentLessonId)`. NULL-lesson caps never match, but they also inflate `goodCandidateCount` past the 70% suppression threshold — net effect: drying never fires in production.
- **Lesson-practice mode** filters by `selectedSourceRefs[]` (from `lesson_page_blocks`) instead of `lesson_id`, so it works by accident — the M:N bridge does the job the 1-to-1 `lesson_id` couldn't.
- **Lesson reader's "exercises ready" count** (`src/services/lessonService.ts:240-273`) queries by `source_ref IN page_block.source_refs` — also bypasses `lesson_id`. So lessons 1-3 + 6 show non-zero exercise counts via the cross-lesson caps, even though `lesson_id IS NULL` for those caps.

The end result is a runtime that mostly works by accident, with subtle UX gaps (drying never fires) and architectural drift (lesson_id means "morphology home" instead of "introducing lesson", contrary to its name and its companion column on `grammar_patterns`).

## Architecture

### The extension: per-source-kind introducing-lesson rule

Decision 3b (this plan): every **lesson-derived** capability has a non-null `introduced_by_lesson_id` (renamed from `lesson_id`). Podcast capabilities are a separate domain and are explicitly carved out — see §Podcasts below. The introducing lesson is determined per source kind:

| Source kind | Introducing-lesson rule |
|---|---|
| `affixed_form_pair` (morphology) | The lesson that introduces the morphology rule (Decision 3, unchanged) |
| `item` (vocab) | The lesson whose `learning-items.ts` staging file declares the item |
| `pattern` (grammar) | The lesson whose `grammar-patterns.ts` staging file declares the pattern. Aligns with `grammar_patterns.introduced_by_lesson_id` already set at `projectors/grammar.ts:68` |
| `dialogue_line` | The lesson that owns the dialogue (the staging file the line lives in) |
| `item` produced as `contextual_cloze` (dialogue-derived; per Decision 5b, appended in `runner.ts:393`) | Same as the underlying dialogue line's owning lesson. Since both are projected by the same `runCapabilityStage` call, the projecting lesson IS the dialogue's owning lesson by construction. |
| `podcast_segment` / `podcast_phrase` | **Null permitted via CHECK constraint** (see §Podcasts). |

The unifying rule for the pipeline is simple: **a capability emitted by the pipeline run for lesson N has `introduced_by_lesson_id = N`**. The per-source-kind rules above are just the framing — they map cleanly onto "which lesson's staging file declares this content."

### Podcasts

Podcasts are not lessons. `scripts/data/staging/podcast-warung-market/` is a separate staging directory; `runCapabilityStage` is keyed on `lessonNumber`/`lessonId` and is not invoked for the podcast at all. There is no existing podcast-to-lesson association table, and adding one (or a sentinel lesson row, or a separate `podcast_id` FK column) is out of scope for this plan.

**Resolution:** the schema constraint admits podcasts as the documented exception. Instead of `NOT NULL`, the constraint is a CHECK that allows null *only* for podcast source kinds:

```sql
alter table indonesian.learning_capabilities
  add constraint learning_capabilities_lesson_id_required_for_lessons
    check (
      source_kind in ('podcast_segment', 'podcast_phrase')
      or lesson_id is not null
    ),
  add constraint learning_capabilities_lesson_id_fkey
    foreign key (lesson_id) references indonesian.lessons(id) on delete restrict;
```

Runtime consumers (`pedagogy.ts:209`, `masteryModel.ts:389-390`) keep their existing null-handling but the semantics change from "any cap can be lesson-independent" to "only podcast caps can be lesson-independent." This is a narrowing of the null contract, not a removal — code paths that already gracefully bypass null lesson_id continue to work for podcasts. Podcast-specific lesson assignment (if a podcast becomes lesson-bound in the future) is a separate plan.

### Authoring rule: each item declared by its introducing lesson only

For this to work without races, each piece of content must be declared in exactly one lesson's staging directory. Today the staging files duplicate shared items across lessons (which is why `di` ended up as a NULL-lesson cap — the upsert race in pre-Decision-3b code probably wrote and re-wrote it from multiple lesson runs, but since no lesson stamped lessonId for vocab, the final value stayed null).

**Rule going forward:**
- An item appears in **one** `learning-items.ts` (the introducing lesson's).
- Re-use is expressed by referencing the item via `source_ref` in other lessons' `lesson-page-blocks.ts` (the M:N exposure bridge).
- The pipeline's pre-publish lint gate (`buildLintStagingCommand`) refuses to publish if a staging file declares an item already declared by an earlier-order lesson.

This authoring rule is the *upstream* fix. The schema constraint is the *downstream* safety net.

### Two semantic columns, kept distinct

- **`learning_capabilities.introduced_by_lesson_id`** (1-to-1): canonical introducing lesson. Drives activation gating, drying detection, "first taught in lesson N" learner-facing language.
- **`lesson_page_blocks.source_refs[]`** (M:N): every lesson that exposes this capability via its reader content. Drives `lesson_practice` scope, the exercise-coverage count per lesson, "this lesson revisits these items" UI.

The two roles complement; they don't compete. Today's runtime *only* uses the M:N bridge because the 1-to-1 column is unreliable. Post-Decision-3b, the 1-to-1 column becomes the primary signal for activation/gating, and the M:N bridge stays the primary signal for exposure/revisit.

## Scope

This plan does:
1. Extend the runner's `lessonId` stamping to all source kinds (~5 LOC change in `runner.ts:378-381`).
2. Add a pipeline-level validator that throws on missing `lessonId` before write.
3. Bump `CAPABILITY_PROJECTION_VERSION` to `'capability-v3'`.
4. Add an authoring-lint check that refuses duplicate item declarations across lessons.
5. Regenerate all `scripts/data/staging/lesson-*/capabilities.ts` derived files.
6. Audit + clean up duplicate item declarations across staging.
7. Backfill existing DB rows via SQL (mapping rule from `lesson_sections.content` Woordenlijst entries — already validated to cover 1,168 of 1,613 rows with zero canonical_key conflicts).
8. Triage the residue (~445 rows) — delete orphan source_refs, default-assign function-word residue.
9. Add `NOT NULL` + `REFERENCES lessons(id)` constraint on `learning_capabilities.lesson_id`.
10. Add GIN index on `lesson_page_blocks.source_refs[]`.
11. Update runtime consumers to drop the "null bypass" code paths (`src/lib/mastery/masteryModel.ts:389-390` and `src/lib/session-builder/pedagogy.ts:209`).
12. Rename column `lesson_id` → `introduced_by_lesson_id` for accuracy (optional cosmetic step; can defer).
13. Document Decision 3b as an ADR.

This plan does NOT:
- Fix issue 2 (stuck `unknown/draft` readiness). That's an artifact-validation problem; separate plan.
- Touch `exercise_variants.lesson_id`. Grammar variants already have it stamped at `projectors/grammar.ts:84`; vocab variants resolve their lesson via `context_id → item_contexts.source_lesson_id` per `src/services/exerciseReviewService.ts:51-52`. The mixed nullness pattern is intentional in that table and works for the runtime consumer (`exerciseReviewService`). Generalizing the schema there is a separate plan and would require its own per-source-kind rule analysis. **Explicit deferral:** this plan does not improve `exercise_variants` and does not regress it — both stay as-is.
- Change FSRS scheduling semantics. Capabilities remain the schedulable unit (ADR 0003 stands).
- Introduce a sentinel lesson row. Podcasts are admitted via the CHECK constraint instead (see §Podcasts).
- Introduce a `podcast_id` FK column on `learning_capabilities`. Out of scope; the CHECK constraint suffices for now.

## Sequencing

Five PRs. Each is independently shippable, independently rollbackable, independently testable.

| PR | Title | Depends on | Touches |
|---|---|---|---|
| **PR-1** | ADR + projector emits `lessonId` for all source kinds | — | `docs/adr/0006-extend-lesson-id-to-all-capabilities.md` (new), `scripts/lib/pipeline/capability-stage/runner.ts:367-389`, new validator at `validators/lessonId.ts`, `src/lib/capabilities/capabilityTypes.ts:3` (`CAPABILITY_PROJECTION_VERSION` → `'capability-v3'`), projector tests |
| **PR-2** | Staging reconciliation + authoring lint + regenerated `capabilities.ts` | PR-1 | `scripts/data/staging/lesson-*/learning-items.ts` (dedup), `scripts/data/staging/lesson-*/lesson-page-blocks.ts` (cross-refs preserved), `scripts/data/staging/lesson-*/capabilities.ts` (regenerated), new lint rule under `scripts/lib/pipeline/capability-stage/lint/` |
| **PR-3** | Re-publish pipeline for all lessons + residue triage | PR-2 | One-shot operator runbook (re-runs `runCapabilityStage` for all 9 lessons), new `scripts/triage-residual-capabilities.ts` for orphan/function-word cleanup |
| **PR-4** | Schema constraint + GIN index | PR-3 | `scripts/migration.sql` (CHECK constraint per §Podcasts + FK + GIN index), `scripts/check-supabase-deep.ts` (new assertion) |
| **PR-5** | Drop null-bypass code paths in runtime | PR-4 | `src/lib/session-builder/pedagogy.ts:209`, `src/lib/mastery/masteryModel.ts:389-390`, tests in `src/__tests__/capabilitySessionLoader.test.ts` |

Each PR runs `make pre-deploy` as its gate. PR-4 also requires `make migrate-idempotent-check`.

### Sequencing rationale

- **Why PR-1 merges ADR + projector code:** the ADR is short (sub-50 lines), the projector change is ~5 LOC + 1 validator + tests. Two-step process-correct splitting adds ceremony without value.
- **Why PR-2 merges lint + reconciliation:** shipping the CRITICAL lint before staging is reconciled would block every subsequent publish for unrelated work. Either land together or downgrade the lint to WARNING first. Together is simpler.
- **Why no separate backfill PR:** PR-3 re-publishes every lesson via the pipeline. Once PR-1's projector ships, re-running `runCapabilityStage` for lesson N upserts every capability for that lesson with the correct `lessonId` via the `canonical_key` conflict resolution at `adapter.ts:147` — the same UPDATE a standalone SQL backfill would have done. A separate SQL backfill would be operating only on the residue, which the triage script already covers.
- **Why PR-3 is a runbook-driven PR:** the actual code change in PR-3 is just the triage script. The bulk of the work is operational (re-publish 9 lessons one at a time, verify each). The PR's committed artifact is the script + the operator's runbook in `docs/process/decision-3b-rollout.md`.
- **Why PR-4 must follow PR-3:** the CHECK constraint refuses to apply if any non-podcast row has `lesson_id IS NULL`. PR-3's triage script asserts zero residual NULLs before declaring success; PR-4's `make migrate` is then guaranteed to apply cleanly.

The column rename (`lesson_id` → `introduced_by_lesson_id`) is intentionally deferred to a follow-up cosmetic PR after PR-5 lands, to keep the diff per PR small.

## Per-PR acceptance criteria

### PR-1 — ADR + projector stamps `lessonId` on all source kinds

- [ ] `docs/adr/0006-extend-lesson-id-to-all-capabilities.md` exists with sections: Status (`accepted`), Context (links to Decision 3 + the spec gap + the DQ baseline), Decision (per-source-kind rule table from §Architecture, including the podcast carve-out), Consequences (planner gate becomes correct for non-podcasts, drying fires correctly, schema enforces non-null for lesson-derived caps, podcasts remain null-tolerated, M:N bridge keeps its separate role).
- [ ] `CLAUDE.md` `## Docs` table updated to reference ADR 0006.
- [ ] `scripts/lib/pipeline/capability-stage/runner.ts:378-381` replaces the morphology-only condition with `lessonId: input.lessonId` for every emitted capability.
- [ ] `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:177` (contextual_cloze emission per Decision 5b) also sets `lessonId: input.lessonId` so cloze caps inherit the projecting lesson. Without this, PR-3's "0 non-podcast NULL rows" assertion would fail because the cloze projector emits caps directly without going through `runner.ts`'s stamping path.
- [ ] New defensive validator at `scripts/lib/pipeline/capability-stage/validators/lessonId.ts` throws if any `CapabilityInput.lessonId` is null AND `sourceKind` is not in `{'podcast_segment', 'podcast_phrase'}`.
- [ ] `CAPABILITY_PROJECTION_VERSION` bumped to `'capability-v3'` in `src/lib/capabilities/capabilityTypes.ts:3`.
- [ ] New test `scripts/lib/pipeline/capability-stage/__tests__/projectors/lessonId.test.ts` covers: every lesson-derived source_kind emits non-null `lessonId`; validator throws on null for lesson-derived; validator passes on null for podcasts; morphology stamping still works (Decision 3 preserved).
- [ ] `bun run test` green.
- [ ] Update inline comment at `adapter.ts:103` to reflect new reality.

### PR-2 — Staging reconciliation + lint + regenerate `capabilities.ts`

**Pre-audit (2026-05-17):** 690 total item declarations across 9 lessons → 648 distinct items. 41 duplicate declarations need reconciliation, split into:

- **20 cross-lesson duplicates** — same item declared in different lessons. Resolve by moving the declaration to the lowest-order lesson and leaving the higher-order lesson with a `source_refs[]` reference in its `lesson-page-blocks.ts`. Examples: `ada` (lesson 2 + 3), `tetapi` (1 + 4), `tangan` (6 + 9), `sepuluh` (1 + 3).
- **21 within-lesson duplicates** — same item listed twice in the SAME `learning-items.ts`. Pure authoring bug — silently deduped by `canonical_key` upsert today, but should not exist. 15 of 21 are in `lesson-4/learning-items.ts` (which has 135 items total, by far the biggest staging file), 1 in lesson 7, 5 in lesson 9. `kaki` appears 3× in lesson 9 alone. Resolve by deleting the redundant entries.

**Acceptance:**

- [ ] New lint rule under `scripts/lib/pipeline/capability-stage/lint/` walks all `scripts/data/staging/lesson-*/learning-items.ts` and emits a CRITICAL finding for any duplicate item declaration — both *within-lesson* (same `base_text` twice in one file) and *cross-lesson* (same `base_text` declared in two lessons' files).
- [ ] One sub-commit per lesson that reconciles `learning-items.ts`:
  - Within-lesson duplicates: delete the redundant entries.
  - Cross-lesson duplicates: keep the entry in the lowest-order lesson; remove from higher-order lessons.
  - Quick check on `lesson-4/learning-items.ts` to understand why 15 within-lesson dupes exist (likely an auto-generation regression). Document the cause in the commit message so future regenerations don't reintroduce them.
- [ ] Higher-order lessons that need a moved item retain a reference in their `lesson-page-blocks.ts` `source_refs[]` (no removal of cross-references — only declaration moves).
- [ ] All 9 lessons' `capabilities.ts` regenerated via `bun scripts/generate-staging-files.ts --all` (or per-lesson if the orchestrator doesn't support `--all`).
- [ ] Lint check passes on the reconciled staging (zero duplicate declarations).
- [ ] `bun run test` green.
- [ ] Lint check added to `buildLintStagingCommand`'s CRITICAL set.

### PR-3 — Re-publish all lessons + residue triage

- [ ] **Operator runbook** in `docs/process/decision-3b-rollout.md` captures the sequence: `bun scripts/publish-approved-content.ts <N>` for each of lessons 1..9, with verification SQL between each.
- [ ] After each lesson re-publish: `select count(*) from indonesian.learning_capabilities where lesson_id = '<lesson-N-id>'` returns ≥ the expected count from staging.
- [ ] New `scripts/triage-residual-capabilities.ts` handles the post-republish residue:
  - **Orphan-item caps** (`source_ref` slug has no matching `learning_items.normalized_text`): delete the capability row. **Skip caps with any `capability_review_events` row** — those preserve learner history; instead, default-assign them to lesson 1 with `metadata_json.note = 'orphan source_ref preserved for history'`.
  - **Explicit child-table delete order** (because the FKs from `capability_artifacts:45`, `learner_capability_state:59`, `capability_review_events:86`, and `capability_aliases:33` to `learning_capabilities(id)` in `scripts/migrations/2026-04-25-capability-core.sql` lack `ON DELETE CASCADE`):
    ```sql
    -- For each orphan capability id selected for deletion:
    delete from indonesian.capability_aliases       where capability_id = $1;
    delete from indonesian.capability_artifacts     where capability_id = $1;
    delete from indonesian.learner_capability_state where capability_id = $1;
    -- capability_review_events were already verified empty in the gate above
    -- (orphan caps with review events get default-assigned, not deleted)
    delete from indonesian.learning_capabilities    where id = $1;
    ```
    `capability_content_units` and `capability_resolution_failure_events` already have CASCADE FKs, so they're handled implicitly. The `capability_artifacts` rows for orphan caps are *not* preserved (they are admin-written content with no learner state — their loss represents pipeline artifacts that no longer have a valid source).
  - **Function-word residue** (no Woordenlijst match anywhere): default-assign to lesson 1 with `metadata_json.note = 'cross-corpus, defaulted to lesson 1'`.
  - **Script asserts** zero non-podcast NULL rows on exit. Throws if non-zero.
  - **Future-proofing:** PR-4 will alter the four RESTRICT FKs (`capability_artifacts`, `learner_capability_state`, `capability_review_events`, `capability_aliases` → `learning_capabilities`) to `ON DELETE CASCADE` so subsequent orphan cleanup can be a single `delete from learning_capabilities`. This plan defers that migration to PR-4 to keep PR-3's diff small; PR-3's script lives with the explicit enumeration.
- [ ] `make check-supabase-deep` green.
- [ ] Final state: `select count(*) from indonesian.learning_capabilities where lesson_id is null and source_kind not in ('podcast_segment', 'podcast_phrase')` returns 0.

### PR-4 — Schema constraint + GIN index

- [ ] `scripts/migration.sql` gains the CHECK constraint, FK, GIN index, and the child-FK CASCADE conversions:
  ```sql
  alter table indonesian.learning_capabilities
    add constraint learning_capabilities_lesson_id_required_for_lessons
      check (
        source_kind in ('podcast_segment', 'podcast_phrase')
        or lesson_id is not null
      ),
    add constraint learning_capabilities_lesson_id_fkey
      foreign key (lesson_id) references indonesian.lessons(id) on delete restrict;

  create index if not exists lesson_page_blocks_source_refs_gin
    on indonesian.lesson_page_blocks using gin (source_refs);

  -- Convert four RESTRICT FKs to CASCADE so orphan-cap cleanup is one statement.
  -- See scripts/migrations/2026-04-25-capability-core.sql lines 33, 45, 59, 86.
  alter table indonesian.capability_aliases
    drop constraint capability_aliases_capability_id_fkey,
    add  constraint capability_aliases_capability_id_fkey
      foreign key (capability_id) references indonesian.learning_capabilities(id) on delete cascade;
  alter table indonesian.capability_artifacts
    drop constraint capability_artifacts_capability_id_fkey,
    add  constraint capability_artifacts_capability_id_fkey
      foreign key (capability_id) references indonesian.learning_capabilities(id) on delete cascade;
  alter table indonesian.learner_capability_state
    drop constraint learner_capability_state_capability_id_fkey,
    add  constraint learner_capability_state_capability_id_fkey
      foreign key (capability_id) references indonesian.learning_capabilities(id) on delete cascade;
  alter table indonesian.capability_review_events
    drop constraint capability_review_events_capability_id_fkey,
    add  constraint capability_review_events_capability_id_fkey
      foreign key (capability_id) references indonesian.learning_capabilities(id) on delete cascade;
  ```
  (Constraint names may differ from the placeholders above — the migration script should grep `pg_constraint` to discover the actual names per `scripts/migration.sql`'s `drop constraint if exists` idiom documented in CLAUDE.md.)
- [ ] **Race protection:** the migration runs in a single transaction. Postgres holds the lock through `ALTER TABLE ... ADD CONSTRAINT`, which already prevents concurrent inserts that would violate the constraint. Idempotent — `make migrate-idempotent-check` green.
- [ ] `scripts/check-supabase-deep.ts` gains:
  ```ts
  // Assert zero violations of the lesson_id non-null rule
  await assert(`select count(*) from indonesian.learning_capabilities
                where lesson_id is null
                and source_kind not in ('podcast_segment', 'podcast_phrase')`)
    === 0
  ```
- [ ] `make migrate` applied to the homelab DB.
- [ ] `make check-supabase-deep` green post-apply.

### PR-5 — Drop null-bypass code paths in runtime

- [ ] `src/lib/session-builder/pedagogy.ts:209` simplifies from `capability.lessonId != null && !input.activatedLessons.has(capability.lessonId)` to a podcast-aware check: `capability.lessonId != null && !input.activatedLessons.has(capability.lessonId)` (unchanged — podcasts still get null bypass, just narrowed semantically).
- [ ] `src/lib/mastery/masteryModel.ts:389-390` similarly unchanged in form but documented in a comment to reflect that the null bypass now only fires for podcast caps.
- [ ] **Tests:** new test in `src/__tests__/capabilitySessionLoader.test.ts` verifies that a learner who has NOT activated lesson N does not see lesson N's caps as eligible introductions (the behaviour change PR-5 unblocks).
- [ ] `bun run test` green.
- [ ] Smoke test on live app: a learner with only lesson 1 activated sees only lesson-1 vocab introductions in a standard session (not lesson-2/3/+ vocab as today).
- [ ] Drying detector smoke test (re-run the seed scenario from `scripts/seed-drying-scenario.ts`) — alert now fires reliably when conditions are met.

> Note on PR-5: the runtime code change is essentially a no-op in form (the null-bypass survives), but the *semantic meaning* changes once PR-4 ships: pre-PR-4, any cap could be null; post-PR-4, only podcasts. PR-5's value is therefore the smoke test + the new assertion test, not the code simplification — the code already handles the post-PR-4 reality correctly. A more substantial simplification (e.g., dropping the null check entirely for non-podcast paths) is deferred to a follow-up to keep PR-5 small.

## Behaviour changes the user will notice

After PR-5 ships:

1. **Standard sessions become activation-respecting.** A learner who has only activated lesson 1 will see only lesson-1 vocab in standard mode, not the full cross-lesson pool. This is the intended product semantics from the original architecture; it has been latently broken since the pipeline launched.
2. **Drying alert starts firing.** Previously suppressed by the inflated cross-lesson candidate pool; now fires correctly when a learner is dry on their activated lessons and the next lesson is inactive.
3. **Lesson-practice mode is unchanged.** It already filtered by `source_refs[]`, which is the M:N bridge and survives Decision 3b intact.
4. **Lesson reader's "ready to practice" counts are unchanged.** Same M:N bridge.
5. **No regressions to existing learner state.** All upserts go on `canonical_key`; `learner_capability_state` + `capability_review_events` reference by `capability_id`; FSRS state survives intact. PR-3's orphan-cap deletions only touch caps with no review history.

## Audience + product evidence (queried 2026-05-17)

The plan ships a behaviour change in PR-5 without a feature flag because the audience is small and one learner is the developer.

- **9 users total.** None have activated all 9 lessons (max = 8). 7 users sit at exactly 3 (the starter activation default from `authStore.activateStarterLessons`); 1 at 1; 1 at 8.
- **2 active reviewers in the last 30 days.** `albert@duin.home` (the developer, 8 lessons activated, 112 events/30d) and `testuser@duin.home` (E2E test account, 1 lesson activated, 5 events/30d).
- **95.5% of recent reviews are on NULL-lesson caps.** This is *not* signal of user demand for cross-lesson recycling; it's signal of the lesson_id gap — the caps surface because the planner has no activation gate to apply.
- **Post-PR-3 simulation:** for albert (8 lessons activated), nearly all the 107 cross-lesson events would have mapped to one of his activated lessons after backfill — minimal practical change. For testuser (1 lesson activated, 5 events), the change is real but the user is a test account with negligible volume.
- **No real users besides the developer** are affected by the behaviour change. A feature flag or staged rollout would be over-engineering for this scale.

When the user base grows beyond the developer + test accounts, re-evaluate. The CHECK constraint (podcast carve-out) makes adding a per-source-kind escape hatch easy if needed.

**Rollout-window discipline:** if a non-test signup arrives between PR-4 merge and PR-5 merge, defer PR-5 and re-evaluate. The behaviour change should not land silently on a freshly-signed-up real user.

## Supabase Requirements

### Schema changes

- `learning_capabilities`: ADD CHECK constraint (allows null lesson_id only for podcast source kinds) + ADD FOREIGN KEY (`lesson_id` → `lessons.id` ON DELETE RESTRICT). Both in PR-4. Column does NOT become NOT NULL; the CHECK is the enforcement mechanism so podcasts can stay null-tolerated.
- `lesson_page_blocks`: new GIN index on `source_refs` (PR-4).
- No new tables, no RLS changes, no new grants. Existing RLS on `learning_capabilities` and `lesson_page_blocks` covers the schema as modified.

### homelab-configs changes

- [ ] PostgREST: **N/A**, no new schema exposure.
- [ ] Kong: **N/A**, no new origins or headers.
- [ ] GoTrue: **N/A**, no auth changes.
- [ ] Storage: **N/A**, no new buckets.

### Health check additions

- [ ] `scripts/check-supabase-deep.ts` gains an assertion: `select count(*) from indonesian.learning_capabilities where lesson_id is null and source_kind not in ('podcast_segment', 'podcast_phrase')` returns 0. (PR-4.)
- [ ] Optional: assert `projection_version IN ('capability-v2', 'capability-v3')` after PR-3 lands (no v1 rows should survive a clean re-publish).

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PR-2 staging reconciliation produces a content-quality regression (an item is re-assigned to a lesson that didn't introduce it) | Medium | Learner UX confusion if a word's "first taught in lesson X" attribution feels wrong | The reconciliation rule (lowest-order vocab list match) maps to the same lesson as a human reader's intuition. Spot-check 10 representative items per lesson before committing PR-2. |
| PR-3 re-publish resets `readiness_status` to `unknown` per `adapter.ts:133` | High | Every re-published cap drops out of `ready` state until the readiness phase re-promotes them. Sessions go empty mid-rollout if the readiness step doesn't fire. | `runCapabilityStage` runs the readiness promotion as part of the same call (verified in `runner.ts` — readiness validators run after the upsert). The risk window is therefore measured in milliseconds per lesson, not minutes. PR-3 runbook explicitly verifies `readiness_status='ready'` count after each lesson re-publish. |
| PR-3 triage deletes a `capability_artifacts` row that some content surface still references | Low | Missing artifact for one source_ref | Orphan caps targeted for deletion already have invalid `source_ref` (the item row is gone). Their `capability_artifacts` rows are admin-written content with no learner state attached. Loss is acceptable. |
| Re-projection (PR-3) overwrites `artifact_fingerprint` on existing caps and invalidates downstream caches | Low | Spurious cache misses in `capability_artifacts` joins | Artifact_fingerprint is a content hash; same content = same fingerprint. PR-3's republish with no content change produces no fingerprint change. |
| PR-2 staging regeneration produces a 10K+ line diff per lesson that's hard to review | Medium | Reviewer fatigue | Generate the diff per lesson, one sub-commit per lesson. Reviewer can spot-check one lesson and trust the generator for the rest. |
| `make migrate` (PR-4) fails because residual non-podcast NULL rows exist after PR-3's triage | Medium | Migration aborts (correct behaviour — refuses CHECK violation) | PR-3's triage script asserts 0 non-podcast NULL rows before emitting success. The CHECK constraint is the second gate. |
| The CHECK constraint admits podcast capabilities with null lesson_id, weakening the constraint's "no nulls ever" intent | Low | Future authoring mistake on a non-podcast cap could go undetected if `source_kind` is misclassified | The runtime validator (PR-1's `validators/lessonId.ts`) catches non-podcast nulls before write. The constraint is a defense-in-depth, not the sole gate. |
| A new podcast cap is authored that should belong to a specific lesson | Low | Capability surfaces without lesson-aware gating | Separate plan; not regressed by this one. Today's podcast caps are exposure-only (per `capabilityContracts.ts:isExposureOnly`) and never enter spaced practice, so the gate-absence doesn't degrade UX. |
| Tests assume `capability.lesson_id` can be null after PR-4 | Low | Test failures caught immediately | Grep `lesson_id\|lessonId.*null` in tests after PR-3 lands. Update fixtures to set `lessonId` to a non-null UUID for non-podcast cases. |

## Frontmatter lifecycle

- Today, on this plan being written: `status: draft`.
- When architect signs off: `status: approved`.
- When PR-1 opens: `status: implementing`, `implementation: PR #<N>`.
- When PR-5 merges: `status: shipped`, `merged_at: <date>`, `implementation_paths: [...]`.
- Each PR-1..PR-5 records its own merged_at + PR ref under `implementation_prs:` (per the PR-A/PR-B precedent in `2026-05-16-fold-session-builder-design.md`).
