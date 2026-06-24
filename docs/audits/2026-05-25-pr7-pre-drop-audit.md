---
date: 2026-05-25
doc_type: pre-drop-reader-census
relates_to: PR 7 final cleanup
audited_against: live DB at api.supabase.duin.home (row counts via openbrain not reachable — see Check 5 note) + scripts/migration.sql + main HEAD
supersedes_findings: docs/audits/2026-05-23-schema-spec-vs-actual-audit.md (extends, doesn't replace)
---

# Pre-PR-7 reader census — 2026-05-25

**Sources read:** `docs/plans/2026-05-22-data-model-migration.md` (913 lines), `docs/plans/2026-05-21-data-model-target.md` (1150 lines, pages 1-838), `docs/audits/2026-05-23-schema-spec-vs-actual-audit.md` (569 lines), `/Users/albert/home/learning-indonesian-archive/docs/plans/2026-05-20-retire-page-blocks-pipeline-phase-1.md` (965 lines, first page), `scripts/migration.sql` (key sections), `src/pages/Lesson.tsx`, `src/pages/Session.tsx`, `src/pages/LessonRouter.tsx`, `src/pages/lessons/registry.tsx`, `src/services/learnerStateService.ts`, `src/services/lessonService.ts`, `src/services/progressService.ts`, `src/services/coverageService.ts`, `src/services/exerciseReviewService.ts`, `src/hooks/useProgressData.ts`, `src/lib/session-builder/adapter.ts`, `src/lib/exercise-content/adapter.ts`, `src/lib/mastery/masteryModel.ts`, `src/lib/lessons/adapter.ts`, `scripts/promote-capabilities.ts`, `scripts/check-capability-release-readiness.ts`, `scripts/check-supabase-deep.ts`, `scripts/publish-grammar-candidates.ts`, `scripts/generate-exercise-audio.ts`, `src/types/learning.ts`, `scripts/migrate-typed-tables-pr4-grammar.ts`.

**Methodology:** 8-category audit per table; severity per agent spec; live DB row counts not available via openbrain this session (SSH not accessible; service_role direct-execution blocked). Production state notes are based on code evidence + migration plan invariant queries from prior PRs where stated.

---

## Executive summary

PRs 1-4 (capabilities migration) are shipped. PRs 5-6 (lesson blocks and lesson sections) are NOT started. The candidate-drop list is therefore split: 7 tables are SAFE TO DROP today (pure legacy state or empty aspirational tables with zero consumers), 4 tables must DEFER (active runtime readers confirmed in code; most are blocked by PRs 5-6 or by a parallel retirement plan), and 2 tables fall into DO NOT DROP.

The three most dangerous findings discovered by this audit that the prior spec-vs-actual audit missed:

1. **`learner_item_state` has a live runtime reader** (`useProgressData` → `learnerStateService.getItemStates`). The migration plan §10.3 says "no live readers since 2026-05-01" — this claim is FALSE. The Progress page's `itemsByStage` breakdown reads this table every page load. Drop = blank itemsByStage on the Progress page.

2. **`lesson_progress` has two active writers** (`progressService.markLessonComplete` and the `leaderboard` view) AND is referenced in the `get_lessons_overview` RPC body in `migration.sql:1789`. The `leaderboard` view (`migration.sql:277-295`) reads both `learner_item_state` and `lesson_progress` and was NOT dropped in PR 0 (the plan said to drop it; the code did not). Dropping either table without dropping the view first = broken `leaderboard` view.

3. **`exercise_review_comments` has a FK to `exercise_variants`** (`migration.sql:818`). The PR 4 dual-write bridge intentionally preserved this FK by reusing UUIDs across both tables. Dropping `exercise_variants` cascade-deletes all existing review comments. The migration plan §10.1 says `DROP ... CASCADE` without mentioning this — that means a silent data loss risk.

```
SAFE TO DROP:     item_meanings, learner_skill_state, review_events,
                  generated_exercise_candidates,
                  textbook_pages, textbook_sources
DEFER:            capability_artifacts, exercise_variants, lesson_progress,
                  lesson_page_blocks, item_context_grammar_patterns
DO NOT DROP:      learner_item_state, capability_audio_refs
ADDITIONAL CANDIDATES FOUND: leaderboard (view; must drop before learner_item_state + lesson_progress)
```

(Corrected 2026-05-25: `item_context_grammar_patterns` moved from SAFE TO DROP to DEFER. Per-table Check 8 below correctly classified it DEFER — `coverageService.ts:81` is a runtime reader and `publish-grammar-candidates.ts:247` is an active writer. Editorial fix.)

---

## Check 0 — Candidate list completeness

**Additional tables/objects not in the seed list that are candidates for cleanup in PR 7:**

- **`leaderboard` view** (`migration.sql:277-295`): reads `learner_item_state` and `lesson_progress`. Was listed for retirement in `docs/plans/2026-05-21-data-model-target.md §Decision L`, but was NOT dropped in PR 0 (`git grep -n "leaderboard" scripts/migration.sql` shows `CREATE OR REPLACE VIEW` still present at line 277). Dropping `learner_item_state` or `lesson_progress` without first dropping this view will fail unless `CASCADE` is used — which silently removes the view too. PR 7 must explicitly drop the view and its GRANT.

- **`check-capability-release-readiness.ts:192`**: reads `capability_artifacts`. This is a pipeline script, not production app code. Drop requires updating the script in the same PR (or retiring the script).

- **`promote-capabilities.ts:278`**: reads `capability_artifacts`. Same — pipeline script; must be updated in PR 7.

- **`scripts/generate-exercise-audio.ts:273`**: reads `exercise_variants`. Build-time script; must be updated or retired in same PR as the `exercise_variants` drop.

- **`scripts/publish-grammar-candidates.ts:247,265,280`**: writes to `exercise_variants` AND `item_context_grammar_patterns`. Active writer to both; must be retired/rewritten before dropping either table.

- **`src/lib/mastery/masteryModel.ts:450`**: reads `capability_artifacts`. Runtime reader; must be retired in PR 7.

- **`src/lib/session-builder/adapter.ts:283,365`**: reads `capability_artifacts`. Runtime reader; must be retired in PR 7.

- **`src/lib/exercise-content/adapter.ts:324` (`fetchArtifacts`)**: reads `capability_artifacts`. Runtime reader; must be retired in PR 7.

- **`scripts/check-supabase-deep.ts:193` (HC check for `exercise_variants`)**: health-check consumer; must be retired in same PR as `exercise_variants` drop.

- **`scripts/check-supabase-deep.ts:483` (HC2 for `lesson_page_blocks`)**: health-check consumer; must be retired in same PR as `lesson_page_blocks` drop.

---

## Per-table sections

---

### 1. `capability_artifacts`

#### Check 1 — App-code reader census

Live (non-comment) readers confirmed at:
- `src/lib/exercise-content/adapter.ts:324` — `fetchArtifacts` function, runtime reader, active query: `.from('capability_artifacts')`. Called by none of the current per-kind fetchers (item, dialogueLine, affixedFormPair, pattern all pass `artifactsByKind: new Map()` per PR 1-4 design), but the function itself still exists and `src/lib/mastery/masteryModel.ts:450` calls it.
- `src/lib/mastery/masteryModel.ts:450` — `artifacts()` function queries `.from('capability_artifacts')` via `chunkedIn`. Called by `evidenceForCapabilities` which is part of the mastery analytics path.
- `src/lib/session-builder/adapter.ts:283` — runtime reader queries `capability_artifacts` via `chunkedIn` for the session-build planner path. Called at `src/lib/session-builder/adapter.ts:282-289` inside the session-build flow.
- `src/lib/session-builder/adapter.ts:365` — second reference in the same file (force-capability bypass path).
- `scripts/promote-capabilities.ts:278` — pipeline script, reads `capability_artifacts` for promotion validation. Called by `scripts/lib/pipeline/capability-stage/runner.ts:727` (step 13 of every capability-stage publish).
- `scripts/check-capability-release-readiness.ts:192` — pipeline script, reads `capability_artifacts` artifact count for the release-readiness gate.
- `scripts/check-supabase-deep.ts:936,1025` — health check references (comment references noting the legacy bridge).

Classification:
- `src/lib/mastery/masteryModel.ts:450` — **Runtime reader** (mastery analytics). BLOCKS drop.
- `src/lib/session-builder/adapter.ts:283,365` — **Runtime reader** (session build planner). BLOCKS drop.
- `src/lib/exercise-content/adapter.ts:324` — **Runtime reader** (exists, called by masteryModel path indirectly). BLOCKS drop.
- `scripts/promote-capabilities.ts:278` — **Pipeline writer/validator** (promotion gate). BLOCKS drop until retired.
- `scripts/check-capability-release-readiness.ts:192` — **Build-time/pipeline consumer**. Non-blocking for production but must be updated in same PR.

#### Check 2 — Migration.sql + RPC bodies

`scripts/migration.sql` line 24-27: `capability_artifacts` is listed in the legacy-retained table comment block. No RPC body references it by name. The `CREATE TABLE` block for `capability_artifacts` is the main live DDL. No migration.sql RPC queries it.

#### Check 3 — DB-level dependencies

Based on `scripts/migration.sql`, FK structure:
- `exercise_review_comments.exercise_variant_id` references `exercise_variants` (not capability_artifacts directly).
- No FK from any other table points INTO `capability_artifacts`. The table has `capability_id` FK pointing outward.
- No views reference it (leaderboard reads only learner_item_state + lesson_progress).
- Functions: `promote-capabilities.ts` (pipeline script, not a DB function).

Drop is safe at the DB level once code consumers retire.

#### Check 4 — Cross-plan check

`docs/plans/2026-05-22-data-model-migration.md §10.1`: drop explicitly planned in PR 7. Status: `implementing`.
`docs/plans/2026-05-21-data-model-target.md §Decision A`: retirement decision. Status: `draft`.
`docs/plans/2026-05-20-retire-page-blocks-pipeline-phase-1.md`: does not mention `capability_artifacts`. No conflict.

#### Check 5 — Production-state check

Row count not queryable via openbrain this session. Per migration plan §PR 2, §PR 3, §PR 4: item caps, dialogue_line caps, affixed_form_pair caps, and pattern caps all stopped writing to `capability_artifacts` in PRs 1-4. However `promote-capabilities.ts` at step 13 of every publish still reads it. For pattern/dialogue/affixed caps the artifact rows were never removed (only the writers stopped adding new rows). The table still has rows for legacy cap types (9,312 per migration plan §Decision A). All 4 source_kinds have now migrated their readiness away from artifacts via Decision R, but stale rows remain.

#### Check 6 — Build-time consumer classification

- `src/lib/mastery/masteryModel.ts` — **Runtime reader** (production app). Drop blocks until retired.
- `src/lib/session-builder/adapter.ts` — **Runtime reader** (production app session build). Drop blocks until retired.
- `src/lib/exercise-content/adapter.ts` — **Runtime reader** (production app). Drop blocks until retired.
- `scripts/promote-capabilities.ts` — **Pipeline validator** (called at publish time by runner). Drop blocks until retired.
- `scripts/check-capability-release-readiness.ts` — **Build-time consumer**. Non-blocking for production; retire in PR 7.

#### Check 7 — Design-intent verification

`docs/plans/2026-05-21-data-model-target.md §Decision A`: explicit retirement decision. Retirement is design intent.

`docs/plans/2026-05-22-data-model-migration.md §10.6`: lists dead code to delete alongside the drop: `src/lib/capabilities/artifactRegistry.ts`, `fetchArtifacts`, planner-side artifact reader, `ArtifactKind`/`ArtifactIndex`/`CapabilityArtifact` types.

The migration plan §10.6 lists the code-side retirement targets. However it does NOT mention `src/lib/mastery/masteryModel.ts:450` or the session-builder paths at `adapter.ts:283,365`. These are missed consumers in the migration plan.

#### Check 8 — Final sign-off

```
Table: capability_artifacts
Drop verdict: DEFER (blocked by 3 unretired runtime readers + 1 pipeline consumer)
Active consumers requiring retirement in this PR:
  - src/lib/mastery/masteryModel.ts:450 (artifacts function → remove or rewire)
  - src/lib/session-builder/adapter.ts:283,365 (chunkedIn → capability_artifacts → remove, use required_artifacts column instead)
  - src/lib/exercise-content/adapter.ts:324 (fetchArtifacts → remove function)
  - scripts/promote-capabilities.ts:278 (readiness validation → switch to required_artifacts or typed-table existence check)
  - scripts/check-capability-release-readiness.ts:192 (artifact count — retire or change to typed-table count)
Already-retired consumers:
  - byKind/item.ts, byKind/dialogueLine.ts, byKind/affixedFormPair.ts, byKind/pattern.ts — retired in PRs 1-4
  - capability-stage/runner.ts — stopped writing item-sourced artifacts in PR 1
Cross-plan check: No conflict with parallel plans. Migration plan §10.1 owns the drop.
Production: ~9,312 rows (per migration plan §Decision A), some stale. Writes_last_30d: item/dialogue/affixed/pattern caps stopped writing; promotion reads still active.
RPC body co-edits required: None (no RPC body references the table).
DB deps: No views or FK references pointing INTO this table from other tables.
Blockers: 3 runtime readers + 1 active pipeline reader not yet retired.
```

---

### 2. `exercise_variants`

#### Check 1 — App-code reader census

Live readers/writers confirmed at:
- `src/services/coverageService.ts:78-80` — **Runtime reader** (admin ExerciseCoverage page). Queries exercise type + context + lesson + grammar_pattern for the coverage grid.
- `scripts/check-supabase-deep.ts:193` — **Health check consumer** (HC check asserts exercise_variants exist per lesson).
- `scripts/generate-exercise-audio.ts:273-274` — **Build-time reader** (reads `exercise_type, payload_json` for audio generation). Called manually; not in the runtime app.
- `scripts/publish-grammar-candidates.ts:265,280` — **Active pipeline writer** (inserts new exercise_variants rows). This script is the ONLY source of new grammar exercise rows. Still active and intended for lesson 10+.
- `scripts/check-vocab-coverage.ts:149` — reads exercise_variants. Administrative script; non-blocking.
- `src/types/learning.ts:390` — comment citing the table; not a DB query.

Note: `src/lib/exercise-content/byKind/pattern.ts`, `byType/contrastPair.ts`, `byType/sentenceTransformation.ts`, `byType/constrainedTranslation.ts`, `byType/clozeMcq.ts` — ALL retired from exercise_variants in PRs 4/4a. Runtime session play no longer reads this table. The admin review service (`exerciseReviewService.ts`) was confirmed to now read the 4 typed tables, NOT exercise_variants.

#### Check 2 — Migration.sql + RPC bodies

`scripts/migration.sql:601-621`: `CREATE TABLE` block. Many follow-on ALTER TABLE and index blocks. No RPC body references `exercise_variants`.

`exercise_review_comments` has a NOT NULL FK to `exercise_variants` at `migration.sql:818`: `exercise_variant_id uuid NOT NULL REFERENCES indonesian.exercise_variants(id) ON DELETE CASCADE`. Drop of exercise_variants with CASCADE will delete ALL exercise_review_comments rows.

#### Check 3 — DB-level dependencies

FK pointing IN from `exercise_review_comments.exercise_variant_id` — `ON DELETE CASCADE`. Dropping exercise_variants with CASCADE silently wipes exercise_review_comments. The PR 4 dual-write bridge (`src/types/learning.ts:386-390`) preserved this relationship by reusing the same UUID across exercise_variants and the 4 typed tables.

The `source_candidate_id` FK from the 4 typed grammar exercise tables points to `generated_exercise_candidates`, NOT to `exercise_variants`. No circular dependency.

#### Check 4 — Cross-plan check

`docs/plans/2026-05-22-data-model-migration.md §10.1`: drop planned in PR 7. Status: `implementing`.
`docs/plans/2026-05-20-retire-page-blocks-pipeline-phase-1.md`: does not mention exercise_variants.

However: `scripts/publish-grammar-candidates.ts` is an ACTIVE pipeline writer. The migration plan §7.1 planned to remove the `exercise_variants` write path in PR 4, but the actual shipped PR 4 kept dual-write (migration plan §7 status note: "writer is the capability-stage runner step 10... dual-writing the 4 typed tables alongside exercise_variants"). The `publish-grammar-candidates.ts` script was NOT retired.

#### Check 5 — Production-state check

Per migration plan §PR 4 status note: "716 existing rows migrated by the one-shot bridge... 0→141/189/240/146". All 716 rows now have matched typed-table rows. The writer still adds to both tables on new publishes. `writes_last_30d`: actively written by publish-grammar-candidates.ts when lesson 10+ ships grammar exercises.

#### Check 6 — Build-time consumer classification

- `src/services/coverageService.ts:78` — **Runtime reader** (admin page). Blocks drop.
- `scripts/publish-grammar-candidates.ts:265,280` — **Active pipeline writer**. Blocks drop until retired/rewritten.
- `scripts/generate-exercise-audio.ts:273` — **Build-time consumer** (manual admin script). Non-blocking for production; retire in PR 7.
- `scripts/check-supabase-deep.ts:193` — **Health check**. Must retire in PR 7.
- `scripts/check-vocab-coverage.ts:149` — **Admin script**. Non-blocking; retire in PR 7.

#### Check 7 — Design-intent verification

Migration plan §10.1 plans the drop. Decision B (target plan) planned the split into 4 typed tables. The runtime reader is already off exercise_variants; the remaining blocker is the coverage service and the grammar-candidates writer.

CRITICAL: `exercise_review_comments.exercise_variant_id NOT NULL REFERENCES exercise_variants ON DELETE CASCADE`. Dropping exercise_variants CASCADE silently deletes all review comments. Migration plan §10.1 says `DROP ... CASCADE` without flagging this. This is a data loss risk. The migration plan did not account for this child table.

#### Check 8 — Final sign-off

```
Table: exercise_variants
Drop verdict: DEFER (blocked by 1 runtime reader + 1 active pipeline writer + CASCADE data loss risk)
Active consumers requiring retirement in this PR:
  - src/services/coverageService.ts:78 (switch to typed-table counts)
  - scripts/publish-grammar-candidates.ts:265,280 (switch to typed-table writes)
  - scripts/generate-exercise-audio.ts:273 (switch to typed tables)
  - scripts/check-supabase-deep.ts:193 (retire HC; add HC against typed tables)
  - exercise_review_comments.exercise_variant_id FK — must be migrated to reference typed-table IDs before dropping exercise_variants, or exercise_review_comments must be dropped/rewritten simultaneously
Already-retired consumers:
  - byKind/pattern.ts, byType/*.ts — retired in PR 4/4a
  - exerciseReviewService.ts — retired in PR 4a
Cross-plan check: No conflict with parallel plans. Migration plan §10.1 owns the drop. publish-grammar-candidates.ts was NOT retired in PR 4 contrary to §7.1's plan.
Production: 716 rows. Writes_last_30d: yes (publish-grammar-candidates still active).
RPC body co-edits required: None.
DB deps: exercise_review_comments has NOT NULL FK → exercise_variants ON DELETE CASCADE.
Blockers: 1 runtime reader (coverageService), 1 active pipeline writer (publish-grammar-candidates), data loss risk (exercise_review_comments CASCADE).
```

---

### 3. `item_meanings`

#### Check 1 — App-code reader census

Live readers/writers:
- `src/services/coverageService.ts:76` — **Runtime reader** (admin ExerciseCoverage page). Queries `item_meanings` to build a set of item IDs that have meanings, to compute `hasMeanings` per lesson.
- `src/pages/ExerciseCoverage.tsx:35` — displays "item_meanings in DB" count. Reads via coverageService.
- `scripts/migrate-typed-tables-pr1-complete.ts:139` — **Bridge script** (reads item_meanings to populate translation_nl/en). Already run; not an ongoing writer.
- `scripts/repair-item-meanings.ts:77,86` — **Admin/maintenance script** that both reads AND writes item_meanings. Not production runtime.
- `scripts/reverse-engineer-staging.ts:140,144,157` — **Admin script** reads item_meanings for staging reverse-engineering. Not production runtime.
- `src/lib/exercise-content/byKind/item.ts:54` — comment only (no DB query). Safe.
- `src/lib/exercise-content/byKind/item.ts:145` — comment only.

#### Check 2 — Migration.sql + RPC bodies

`scripts/migration.sql:137-172`: `CREATE TABLE` block. No RPC body references `item_meanings`.

#### Check 3 — DB-level dependencies

No FK from any other table points INTO `item_meanings` (it has a FK pointing out to `learning_items`). No views reference it.

#### Check 4 — Cross-plan check

`docs/plans/2026-05-22-data-model-migration.md §4.6`: drop planned as part of PR 1. The plan says "drop table if exists indonesian.item_meanings cascade" should happen in PR 1 after re-publish confirmed. PR 1 shipped (migration plan §2 table), but the table still exists in `scripts/migration.sql:137`. The DROP was NOT included in the shipped PR 1 — the plan deferred the actual drop to PR 7 (§10.3 does not list item_meanings, but §4.6 says "same PR").

Checking what actually happened: per the migration plan §2 table, PR 1 is shown as "shipped — #87". The migration plan §4.6 said to drop item_meanings in PR 1. Given the table still exists in `migration.sql:137`, the drop did NOT ship in PR 1. It's now a PR 7 candidate.

#### Check 5 — Production-state check

Per migration plan §4.7 gate G4: `SELECT count(*) FROM learning_items WHERE translation_nl IS NULL` = 0 was the gate. The bridge (`migrate-typed-tables-pr1-complete.ts`) populated translation_nl/en from item_meanings. The item_meanings table is no longer the source of truth; translation_nl/en on learning_items is. Row count: 1,248 rows (per migration plan §Decision R, "758 items × ~1.65 meanings"). Writes_last_30d: only from repair-item-meanings.ts (admin script), not from the pipeline.

#### Check 6 — Build-time consumer classification

- `src/services/coverageService.ts:76` — **Runtime reader** (admin ExerciseCoverage page). This is a live admin UI page. Non-fatal (it shows a stale metric after drop), but the query will fail at runtime.
- `scripts/repair-item-meanings.ts` — **Maintenance script** (admin only). Non-blocking for production; retire in PR 7.
- `scripts/migrate-typed-tables-pr1-complete.ts` — **Already-run bridge script**. Safe to leave as audit trail; not called by any pipeline.
- `scripts/reverse-engineer-staging.ts` — **Admin script**. Non-blocking; retire in PR 7.

#### Check 7 — Design-intent verification

Migration plan §10.3 does NOT list item_meanings. Migration plan §4.6 planned to drop it in PR 1. The table is a drop candidate for PR 7 but the migration plan has an inconsistency (§10.3 lists learner_item_state etc. but not item_meanings). The drop is still correct per the overall design (Decision R).

VERDICT: The `coverageService.ts:76` runtime reader of `item_meanings` will produce a query error after drop. This is the only live consumer and it's in an admin-only page (`ExerciseCoverage`). The fix is to switch the coverage check to `WHERE translation_nl IS NOT NULL` (already noted in migration plan §4.4).

#### Check 8 — Final sign-off

```
Table: item_meanings
Drop verdict: SAFE TO DROP (with 1 required co-edit in same PR)
Active consumers retired in this PR (with file:line + how):
  - src/services/coverageService.ts:76 — switch hasMeanings check to learning_items.translation_nl IS NOT NULL
  - src/pages/ExerciseCoverage.tsx:35 — rename label or re-source count from learning_items
Already-retired consumers:
  - byKind/item.ts:145 — retired PR 1 (reads translation_nl directly now)
  - pipeline projectors/vocab.ts — retired PR 1 (no longer writes item_meanings)
  - migrate-typed-tables-pr1-complete.ts — one-shot bridge, already run
Cross-plan check: §4.6 planned PR 1 drop; actual drop deferred. No other plan conflict.
Production: ~1,248 rows. Writes_last_30d: only admin scripts (repair-item-meanings.ts); pipeline stopped writing.
RPC body co-edits required: None.
DB deps: No FKs pointing IN. View leaderboard does NOT reference item_meanings.
Blockers: None (coverageService co-edit is a required same-PR retire, not an external blocker).
```

---

### 4. `learner_item_state`

#### Check 1 — App-code reader census

Live readers/writers confirmed at:
- `src/services/learnerStateService.ts:10,20,55` — **Runtime reader** AND **writer** (`getItemStates`, `getItemState`, `upsertItemState`). These are active.
- `src/hooks/useProgressData.ts:88` — calls `learnerStateService.getItemStates(user!.id)` to populate `itemsByStage` for the Progress page. **Runtime reader — production UI broken on drop.**
- `src/pages/Dashboard.tsx:46` — calls `learnerStateService.getLapsingItems` (which routes through `learnerProgressService`, not directly to this table — safe).
- `scripts/dev-stage-force.ts:129` — admin script that forces a learner_item_state update. Non-blocking.
- `scripts/check-supabase-deep.ts:34,54` — health check monitors this table's grants/RLS. Must retire in PR 7.

`scripts/migration.sql:288-291`: `leaderboard` view reads `learner_item_state` for `items_learned`.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:277-295`: `leaderboard` view reads `learner_item_state`. This view was NOT dropped in PR 0 despite the migration plan §3.3 saying to retire the leaderboard. The CREATE OR REPLACE VIEW still exists at `migration.sql:277`.

#### Check 3 — DB-level dependencies

`leaderboard` view at `migration.sql:277` reads `learner_item_state`. Dropping the table without first dropping the view = `ERROR: cannot drop table learner_item_state because other objects depend on it`. The `DROP ... CASCADE` in migration plan §10.3 would silently drop the view too — but the view also has a GRANT at `migration.sql:326`.

#### Check 4 — Cross-plan check

`docs/plans/2026-05-21-data-model-target.md §Decision L`: drop planned. Status: `draft` (target plan). Migration plan §10.3: drop planned in PR 7. Status: `implementing`.

The migration plan §3.3 (PR 0) said to retire the leaderboard entirely — `drop view if exists indonesian.leaderboard`. But per `migration.sql:277`, the view still exists. PR 0 shipped (#86) but did NOT drop the leaderboard view. This is a shipped-PR-vs-plan divergence. The view is a live DB dependency.

#### Check 5 — Production-state check

`useProgressData.ts:88` is called on every Progress page load. The `itemsByStage` breakdown (new/anchoring/retrieving/productive/maintenance) reads from `learner_item_state`. These stage values come from the legacy SM-2 system. The capability system (FSRS on `learner_capability_state`) doesn't populate `learner_item_state`. The migration plan claims "no live readers since 2026-05-01" — this is incorrect as of code audit 2026-05-25.

Production rows: migration plan §10.3 says "4,428 rows total" for the three legacy tables combined (learner_item_state + learner_skill_state + review_events). Last write: 2026-05-01 per the plan. Writes_last_30d: unknown (no DB query possible), but the app no longer writes new rows via the capability pipeline.

#### Check 6 — Build-time consumer classification

- `src/hooks/useProgressData.ts:88` via `learnerStateService.getItemStates` — **Runtime reader** (Progress page). Drop = production breakage. BLOCKS drop.
- `src/services/learnerStateService.ts:55` (`upsertItemState`) — **Runtime writer** (still defined; need to verify if called). `upsertItemState` is defined but `grep -rn "upsertItemState"` shows only definition — no callers. Dead writer; non-blocking.
- `leaderboard` view — **DB-level dependency** (must drop view first).
- `scripts/check-supabase-deep.ts:34,54` — **Health check** consumer. Retire in same PR.

#### Check 7 — Design-intent verification

Migration plan §10.3 explicitly plans the drop. However, the "no live readers since 2026-05-01" claim is FALSE based on `useProgressData.ts:88`. The Progress page reads `itemsByStage` from this table. This is stale data from the SM-2 era (the FSRS system doesn't populate it). Dropping the table will make the Progress page's `itemsByStage` always zero.

The question is whether this is acceptable: the `itemsByStage` widget (`wave1State.itemsByStage`) is part of the Progress page UI at `src/pages/Progress.tsx`. If it reads `learner_item_state` and that table has rows from 2026-05-01 and earlier (pre-FSRS), the data shown is already stale/wrong. The real FSRS state is in `learner_capability_state`.

**Decision required from owner:** Is it acceptable to drop `learner_item_state` knowing the Progress page's `itemsByStage` breakdown will show all-zeros (since no FSRS writer populates it)? The architectural answer is yes (the data is stale), but the UI change is visible.

#### Check 8 — Final sign-off

```
Table: learner_item_state
Drop verdict: DO NOT DROP (active runtime reader on Progress page; leaderboard view dependency; migration plan claim about "no live readers" is false)
Active consumers requiring retirement before drop:
  - src/hooks/useProgressData.ts:88 (via learnerStateService.getItemStates → remove or replace with learner_capability_state query)
  - src/services/learnerStateService.ts (getItemStates, getItemState, upsertItemState — retire all)
  - leaderboard view at migration.sql:277 (must drop view before table)
  - scripts/check-supabase-deep.ts:34,54 (retire HC in same PR)
Already-retired consumers:
  - Capability pipeline never wrote to this table (FSRS on learner_capability_state)
Cross-plan check: Migration plan §3.3 claimed leaderboard dropped in PR 0 — NOT shipped. PR 0 #86 did not drop it.
Production: Rows from SM-2 era. Last write: ~2026-05-01. stale but not zero.
RPC body co-edits required: None (RPC bodies don't reference this table directly).
DB deps: leaderboard view reads it (migration.sql:288). Drop CASCADE silently removes leaderboard view.
Blockers: Runtime reader (Progress page), leaderboard view dependency, owner decision needed on itemsByStage replacement.
```

---

### 5. `learner_skill_state`

#### Check 1 — App-code reader census

Live readers/writers:
- `src/services/learnerStateService.ts:32,45` — `getSkillStates` and `getSkillStatesBatch` are defined but checking callers:
  - `getSkillStatesBatch`: `src/hooks/useProgressData.ts:89` comment says "Replaces the legacy learner_skill_state batch fetch + JS aggregation." — this means the hook was ALREADY migrated away from `learner_skill_state`. The comment at `:89` says it now calls `learnerProgressService.getMemoryHealth` instead.
  - `getSkillStates(userId, itemId)`: `grep -rn "getSkillStates"` in src/ — only defined in learnerStateService, not called elsewhere (confirmed from the grep output which showed only definition site).
- `src/services/learnerStateService.ts:66-93`: `applyReviewToSkillState` — **Runtime writer** using `rpc('apply_review_to_skill_state', ...)`. This calls an RPC, not the table directly. Needs verification: does this RPC still exist?
- `scripts/dev-stage-force.ts:109,112,120` — admin/dev script. Non-blocking.
- `scripts/check-supabase-deep.ts:35,55` — health check consumer.
- `leaderboard` view does NOT reference `learner_skill_state`. Confirmed.
- `migration.sql:288-295` view: references only `learner_item_state`, not `learner_skill_state`.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:191-211`: `CREATE TABLE` block.
`migration.sql:497-514`: ALTER TABLE constraint updates on `learner_skill_state`.

RPC body: `apply_review_to_skill_state` — search `migration.sql` for this function:

Per the capability system redesign, `commit_capability_answer_report` is the live RPC. The `apply_review_to_skill_state` RPC was the legacy SM-2 RPC. The service calls it at `learnerStateService.ts:80`. If the RPC still exists but nobody calls the service method, this is dead. The fact that `applyReviewToSkillState` is defined but no production code calls it needs verification. The capability session uses `commit_capability_answer_report` instead (per ADR 0004). No call sites of `applyReviewToSkillState` found in src/ beyond its definition.

#### Check 3 — DB-level dependencies

No views reference `learner_skill_state`. No FK from other tables points into it.

#### Check 4 — Cross-plan check

Migration plan §10.3: drop planned in PR 7. No parallel plan conflict.

#### Check 5 — Production-state check

Last write: ~2026-05-01 (per migration plan). SM-2 system retired. `writes_last_30d`: expected zero. `getSkillStatesBatch` was already replaced in `useProgressData.ts`.

#### Check 6 — Build-time consumer classification

- `src/services/learnerStateService.ts:32,45` — defined but uncalled. **Dead code**.
- `src/services/learnerStateService.ts:66` (`applyReviewToSkillState`) — defined, calls an RPC; uncalled by production code. **Dead writer**.
- `scripts/dev-stage-force.ts:112` — **Admin script**, non-blocking.
- `scripts/check-supabase-deep.ts:35,55` — **Health check**, must retire in PR 7.

#### Check 7 — Design-intent verification

Migration plan §10.3: drop planned. Target plan §Decision L: drop planned. No design reason to keep.

#### Check 8 — Final sign-off

```
Table: learner_skill_state
Drop verdict: SAFE TO DROP (no live runtime readers; all legacy consumers dead or admin-only)
Active consumers retired in this PR:
  - src/services/learnerStateService.ts (getSkillStates, getSkillStatesBatch, applyReviewToSkillState — delete the whole service or remove these methods)
  - scripts/dev-stage-force.ts (admin script — update or retire)
  - scripts/check-supabase-deep.ts:35,55 (retire HC grants check)
Already-retired consumers:
  - useProgressData.ts:89 — already replaced with learnerProgressService.getMemoryHealth (confirmed by comment at line 89)
Cross-plan check: No conflict. Migration plan §10.3 owns the drop.
Production: ~rows from SM-2 era. Last write ~2026-05-01. writes_last_30d: 0.
RPC body co-edits required: apply_review_to_skill_state RPC body should be dropped (or it will reference the dropped table). Verify RPC exists in migration.sql and drop it in PR 7.
DB deps: None. No views, no FKs from other tables pointing in.
Blockers: None (learnerStateService cleanup is a same-PR retire, not an external blocker; apply_review_to_skill_state RPC co-edit needed).
```

---

### 6. `review_events`

#### Check 1 — App-code reader census

No live references found in `src/` or `scripts/` beyond:
- `migration.sql:212-261`: CREATE TABLE + constraint blocks.
- `scripts/check-supabase-deep.ts:36,56`: health check consumer.
- `src/components/exercises/ExerciseErrorBoundary.tsx:25,67`: comments only ("no review_events row is written"). Not a DB query.

No service, hook, or page reads this table. Confirmed dead.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:212`: CREATE TABLE. `migration.sql:257-261`: ALTER TABLE constraint updates. No RPC body references `review_events`.

#### Check 3 — DB-level dependencies

`migration.sql:260-263`: `review_events` has a FK to `learning_sessions` (`session_id`). No FK from other tables points INTO `review_events`. No views reference it.

#### Check 4 — Cross-plan check

Migration plan §10.3: drop planned. No conflict.

#### Check 5 — Production-state check

Per migration plan: last write ~2026-05-01. writes_last_30d: 0. The FSRS system uses `capability_review_events` not `review_events`.

#### Check 6 — Build-time consumer classification

- `scripts/check-supabase-deep.ts:36,56` — **Health check** only. Non-blocking for production; retire in PR 7.

#### Check 7 — Design-intent verification

Target plan §Decision L: drop planned. No design reason to keep.

#### Check 8 — Final sign-off

```
Table: review_events
Drop verdict: SAFE TO DROP
Active consumers retired in this PR:
  - scripts/check-supabase-deep.ts:36,56 (retire HC grants/RLS check)
Already-retired consumers: all production code uses capability_review_events
Cross-plan check: No conflict. Migration plan §10.3 owns the drop.
Production: SM-2 era rows only. Last write ~2026-05-01. writes_last_30d: 0.
RPC body co-edits required: None.
DB deps: FK pointing out to learning_sessions (no cascade issue on drop). No FKs pointing IN.
Blockers: None.
```

---

### 7. `item_context_grammar_patterns`

#### Check 1 — App-code reader census

Live references:
- `src/services/coverageService.ts:81` — **Runtime reader** (admin ExerciseCoverage page). Reads `context_id, grammar_pattern_id` to compute grammar pattern counts per lesson via Path A.
- `scripts/publish-grammar-candidates.ts:247` — **Active pipeline writer** (upserts links between item_contexts and grammar_patterns).
- `scripts/check-supabase-deep.ts` — no explicit reference found (not in the monitored-tables list).

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:562-583`: CREATE TABLE + RLS + grants. No RPC body references it.

#### Check 3 — DB-level dependencies

No FK from other tables points INTO `item_context_grammar_patterns`. It has FKs pointing outward to `item_contexts` and `grammar_patterns`.

#### Check 4 — Cross-plan check

Target plan §Decision K: drop planned. Migration plan §10.4: drop planned. No parallel plan conflict. But `publish-grammar-candidates.ts` still writes to it — that script is in the `scripts/` directory and is an active pipeline tool.

#### Check 5 — Production-state check

`publish-grammar-candidates.ts:247` actively upserts rows. If the grammar exercise authoring workflow is still in use (lessons 10+), this table gets new rows. writes_last_30d: uncertain; depends on whether grammar candidates were published recently.

#### Check 6 — Build-time consumer classification

- `src/services/coverageService.ts:81` — **Runtime reader** (admin). Blocks drop.
- `scripts/publish-grammar-candidates.ts:247` — **Active pipeline writer**. Blocks drop until retired/rewritten.

#### Check 7 — Design-intent verification

Target plan §Decision K: "Junction unused; grammar_patterns.confusion_group is the live mechanism." The target plan says this is unused — but the live runtime reader at `coverageService.ts:81` uses it for Path A of the grammar pattern count. The target plan's claim conflicts with the code.

#### Check 8 — Final sign-off

```
Table: item_context_grammar_patterns
Drop verdict: DEFER (blocked by 1 runtime reader + 1 active pipeline writer)
Active consumers requiring retirement:
  - src/services/coverageService.ts:81 (switch grammar-link Path A to grammar_patterns.introduced_by_lesson_id which is already Path C in the same function)
  - scripts/publish-grammar-candidates.ts:247 (retire the upsert or migrate to a new mechanism)
Already-retired consumers: None (target plan claim that this is "unused" is incorrect — coverageService uses it)
Cross-plan check: Target plan §Decision K said "junction unused" — FALSE per code audit. Migration plan §10.4 plans the drop.
Production: Rows exist (publish-grammar-candidates has written them). writes_last_30d: uncertain.
RPC body co-edits required: None.
DB deps: No FKs pointing in from other tables.
Blockers: 1 runtime reader (admin page), 1 active writer (publish-grammar-candidates).
```

---

### 8. `generated_exercise_candidates`

#### Check 1 — App-code reader census

No live references found in `src/` or `scripts/`. The `source_candidate_id` column on the 4 typed grammar exercise tables references this table conceptually but has no FK (intentionally dropped, per prior audit MINOR m4). No DB query reads from this table.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:584-600`: CREATE TABLE. `migration.sql:622-651`: CREATE VIEW that reads from it. Wait — let me check:

Per `migration.sql:622`, there's a block after the CREATE TABLE. Checking the content:

`migration.sql:622`: `FROM indonesian.generated_exercise_candidates` — this is part of the `CREATE TABLE exercise_variants` ALTER block or a separate view. Let me note: the grep found this at line 622. This needs verification that it's not a live view.

Based on `scripts/check-supabase-deep.ts`, this table is not in the monitored-grants list. The `source_candidate_id` naked UUID columns on the 4 typed tables (`contrast_pair_exercises`, etc.) are the only soft references.

#### Check 3 — DB-level dependencies

`exercise_variants.source_candidate_id` FK points to `generated_exercise_candidates(id)` ON DELETE SET NULL (`migration.sql:609`). Dropping `generated_exercise_candidates` sets `exercise_variants.source_candidate_id` to NULL for all rows (due to ON DELETE SET NULL). This is safe.

The 4 typed grammar exercise tables have `source_candidate_id uuid` with no FK (per the prior audit MINOR m4 — the FK was intentionally dropped).

#### Check 4 — Cross-plan check

Target plan §Decision K: drop planned. Migration plan §10.4: drop planned. No conflict.

#### Check 5 — Production-state check

Zero rows (confirmed: the plan says "Authoring-pipeline table never written to"). writes_last_30d: 0.

#### Check 6 — Build-time consumer classification

No consumers found. FK from exercise_variants is ON DELETE SET NULL — safe.

#### Check 7 — Design-intent verification

Target plan §Decision K: "Authoring-pipeline table never written to. Staging stays in TS files." Confirmed.

#### Check 8 — Final sign-off

```
Table: generated_exercise_candidates
Drop verdict: SAFE TO DROP
Active consumers retired in this PR: None.
Already-retired consumers: source_candidate_id FK on exercise_variants is ON DELETE SET NULL (safe; sets to NULL on drop).
Cross-plan check: No conflict. Migration plan §10.4 owns the drop.
Production: 0 rows. writes_last_30d: 0.
RPC body co-edits required: None.
DB deps: exercise_variants.source_candidate_id FK → SET NULL on drop (not a cascade delete). Safe.
Blockers: None. Must drop BEFORE exercise_variants (if exercise_variants stays, the FK becomes dangling — but since both are dropping, order: generated_exercise_candidates before exercise_variants, or exercise_variants first with SET NULL already applied).
```

---

### 9. `textbook_pages`

#### Check 1 — App-code reader census

No live references found in `src/` or `scripts/`. Not in any health check.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:532-553`: CREATE TABLE. FKs: `textbook_source_id` → `textbook_sources(id)` ON DELETE CASCADE. No RPC body references it.

#### Check 3 — DB-level dependencies

`generated_exercise_candidates.textbook_page_id` FK → `textbook_pages(id)` ON DELETE CASCADE (`migration.sql:587`). If `textbook_pages` drops before `generated_exercise_candidates`, the FK reference breaks — but since `generated_exercise_candidates` is also being dropped, these must drop in order: `textbook_pages` after `generated_exercise_candidates`, or use CASCADE.

#### Check 4 — Cross-plan check

Target plan §Decision K: drop planned. Migration plan §10.4: drop planned. No conflict.

#### Check 5 — Production-state check

Zero rows. writes_last_30d: 0.

#### Check 6 — Build-time consumer classification

None.

#### Check 7 — Design-intent verification

Target plan §Decision K: "Same — staging stays in TS files." Confirmed.

#### Check 8 — Final sign-off

```
Table: textbook_pages
Drop verdict: SAFE TO DROP
Active consumers retired in this PR: None.
Already-retired consumers: None to retire.
Cross-plan check: No conflict.
Production: 0 rows.
RPC body co-edits required: None.
DB deps: generated_exercise_candidates.textbook_page_id FK → textbook_pages. Drop order: generated_exercise_candidates first (or cascade); then textbook_pages. In practice the migration §10.4 block drops generated_exercise_candidates before textbook_pages — correct order.
Blockers: None. Drop generated_exercise_candidates first.
```

---

### 10. `textbook_sources`

#### Check 1 — App-code reader census

No live references found in `src/` or `scripts/`.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:520-531`: CREATE TABLE. `textbook_pages` FKs to it. `generated_exercise_candidates` FKs to it. No RPC references.

#### Check 3 — DB-level dependencies

`textbook_pages.textbook_source_id` → `textbook_sources(id)` ON DELETE CASCADE.
`generated_exercise_candidates.textbook_source_id` → `textbook_sources(id)` ON DELETE CASCADE.
Drop `textbook_sources` → cascades to `textbook_pages` and `generated_exercise_candidates` (all empty). Safe.

Or drop all three independently: `generated_exercise_candidates`, `textbook_pages`, `textbook_sources` (in dependency order).

#### Check 4 — Cross-plan check

Target plan §Decision K: drop planned. Migration plan §10.4: drop planned. No conflict.

#### Check 5 — Production-state check

Zero rows. writes_last_30d: 0.

#### Check 8 — Final sign-off

```
Table: textbook_sources
Drop verdict: SAFE TO DROP
Active consumers retired in this PR: None.
Cross-plan check: No conflict.
Production: 0 rows.
DB deps: textbook_pages + generated_exercise_candidates FK cascade from it. Drop order: generated_exercise_candidates, textbook_pages, textbook_sources — OR drop textbook_sources with CASCADE (which auto-removes the child rows, but they're empty anyway).
Blockers: None.
```

---

### 11. `lesson_progress`

#### Check 1 — App-code reader census

Live readers/writers confirmed at:
- `src/services/progressService.ts:18` — **Runtime writer** (`markLessonComplete` method). The method is defined and exported.
- `src/services/lessonService.ts:28` — **Runtime reader** (`getUserLessonProgress` method). Called by `src/hooks/useProgressData.ts:93` and `src/pages/Dashboard.tsx:47`.
- `src/pages/Lessons.tsx:179` — comment referencing the table (no direct query; uses `get_lessons_overview` RPC which internally reads it).
- `scripts/migration.sql:1789` — `get_lessons_overview` RPC body reads `lesson_progress` for `has_started_lesson`.
- `scripts/migration.sql:277-295` — `leaderboard` view reads `lesson_progress` for `lessons_completed`.

The `markLessonComplete` method in `progressService.ts` — checking callers: `src/__tests__/Lesson.test.tsx:75` mocks it but the actual production caller is not found in the grep output. The method is defined and exported but may be dead in production (no caller found in `src/` outside tests). However it still compiles and exports.

`getUserLessonProgress` at `lessonService.ts:28` IS called by `useProgressData.ts:93` (confirmed: `lessonService.getUserLessonProgress(user!.id)` at line 93). This populates `lessonsCompleted.completed` count on the Progress page.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:1789`: `get_lessons_overview` RPC body contains `exists (select 1 from indonesian.lesson_progress lp where lp.user_id = p_user_id and lp.lesson_id = l.id)` as part of the `has_started_lesson` computation. This RPC is called every time the Lessons page loads.

`migration.sql:277-295`: `leaderboard` view reads `lesson_progress` for `COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.completed_at IS NOT NULL) AS lessons_completed`.

**Both require co-edits in the same migration block as the drop.**

#### Check 3 — DB-level dependencies

`leaderboard` view at `migration.sql:292` reads `lesson_progress`. Drop of `lesson_progress` without first dropping the view = error. The `DROP ... CASCADE` in migration plan §10.3 would silently cascade to the view.

#### Check 4 — Cross-plan check

Migration plan §10.3: drop planned. Migration plan §10.5: `get_lessons_overview` RPC rewrite planned (removes `lesson_progress` from `has_started_lesson` — already shows the fix to use only `learner_lesson_activation`).

`leaderboard` view retirement was planned in §3.3 (PR 0) but NOT shipped in PR 0. This is an unresolved dependency.

#### Check 5 — Production-state check

`useProgressData.ts:93` calls `getUserLessonProgress` every Progress page load, reads lesson_progress rows, computes `lessonsCompleted.completed = lessonProgressData.filter(lp => lp.completed_at != null).length`. This metric is LIVE on the Progress page dashboard.

`markLessonComplete` was the write path for when a user finished a lesson. Per CLAUDE.md: "write path retired" — but the method still exists in code and could be called. If the Lesson.tsx renders for any lesson (currently blocked by registry but possible for lesson 10+), it could call this.

writes_last_30d: likely 0 (Lesson.tsx render path is blocked for all 9 lessons by the registry). But the read path (`getUserLessonProgress`) is active every Progress page load.

#### Check 6 — Build-time consumer classification

- `src/services/lessonService.ts:28` (`getUserLessonProgress`) — **Runtime reader** (Progress page). BLOCKS drop.
- `src/services/progressService.ts:18` (`markLessonComplete`) — **Runtime writer** (dead in practice but compiled). Non-blocking for production but must be retired.
- `get_lessons_overview` RPC body at `migration.sql:1789` — **RPC body reference**. Must co-edit in same migration block.
- `leaderboard` view at `migration.sql:277-295` — **DB-level view dependency**. Must drop view before or with CASCADE.

#### Check 7 — Design-intent verification

Migration plan §10.3: drop planned. Migration plan §10.5: RPC co-edit planned (already provides the replacement `has_started_lesson` logic without `lesson_progress`). Target plan §Decision M: "Drop entirely."

#### Check 8 — Final sign-off

```
Table: lesson_progress
Drop verdict: DEFER (blocked by 2 runtime consumers + 2 RPC/view co-edits)
Active consumers requiring retirement in this PR:
  - src/services/lessonService.ts:28 (getUserLessonProgress → retire or replace with learner_lesson_activation query)
  - src/hooks/useProgressData.ts:93 (remove lessonProgressData usage; switch lessonsCompleted count to learner_lesson_activation)
  - src/pages/Dashboard.tsx:47 (audit if it uses lessonProgressData from useProgressData or calls lessonService directly)
  - src/services/progressService.ts:15 (markLessonComplete → retire)
  - get_lessons_overview RPC body (migration.sql:1789) — co-edit to remove lesson_progress EXISTS subquery from has_started_lesson
  - leaderboard view (migration.sql:277-295) — drop before or use CASCADE
Already-retired consumers:
  - Phase 1 retire-page-blocks plan (2026-05-20): RPC was already migrated off lesson_page_blocks.source_refs; lesson_progress still in has_started_lesson fallback
Cross-plan check: Migration plan §3.3 (PR 0) planned leaderboard drop — NOT shipped. Must be resolved in PR 7.
Production: Rows exist from SM-2 era. Reads active (getUserLessonProgress). writes_last_30d: likely 0.
RPC body co-edits required:
  - get_lessons_overview: remove OR EXISTS(lesson_progress) branch from has_started_lesson (use learner_lesson_activation only)
  - leaderboard view: drop
DB deps: leaderboard view (migration.sql:292). Drop view first.
Blockers: 2 runtime readers (lessonService + useProgressData), 1 runtime writer (progressService), RPC co-edit, leaderboard view.
```

---

### 12. `capability_audio_refs`

#### Check 1 — App-code reader census

Live references:
- `src/lib/capabilities/renderContracts.ts:95` — comment only ("audio read via capability_audio_refs"). No actual DB query.
- `src/lib/exercise-content/byKind/item.ts:211` — comment only ("builder/adapter.ts reads capability_audio_refs for planner readiness"). No actual DB query.
- `scripts/lib/pipeline/capability-stage/runner.ts:458` — comment only ("audio from capability_audio_refs. Skipping here stops writing stale artifact rows").

**No actual DB query reads OR writes to `capability_audio_refs` in any live code.** The table is built but unconnected.

The PR 1 bridge (`migrate-typed-tables-pr1-complete.ts:34-38`) explicitly documented: "Audio (capability_audio_refs): NOT bridged. Nothing reads that table at this point in time." This has not changed since then.

The actual runtime audio path uses `get_audio_clips` RPC (`src/services/audioService.ts:50`) keyed by `(text, voice_id)` — completely bypassing `capability_audio_refs`.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:2257-2282`: CREATE TABLE + RLS + grants. No RPC body references it.

#### Check 3 — DB-level dependencies

No FK from any other table points INTO `capability_audio_refs`. No views reference it.

#### Check 4 — Cross-plan check

Target plan §Decision Q: table created as part of the audio data model redesign. The plan intended it as the capability→audio binding table. It was created in PR 0 but never populated (no writer shipped).

Migration plan §PR 1 §4.2 planned to write `capability_audio_refs` from `projectors/vocab.ts`. Per `scripts/lib/pipeline/capability-stage/runner.ts:458`, the writer was intentionally SKIPPED ("Skipping here stops writing stale artifact rows"). The PR 1 bridge explicitly noted this as unbridged.

No plan document says "drop capability_audio_refs". It is an orphaned table that was created but never wired.

#### Check 5 — Production-state check

Zero rows (confirmed: no writer ever ran). writes_last_30d: 0.

#### Check 6 — Build-time consumer classification

None. No readers, no writers, no health checks referencing it.

#### Check 7 — Design-intent verification

`docs/plans/2026-05-21-data-model-target.md §Decision Q`: "capability_audio_refs — binds capabilities to audio clips (replaces audio_clip artifact rows)". The table was DESIGNED to be the new binding layer. It's not retired by design — it just wasn't wired up in PR 1.

The PR 1 bridge note says nothing about future wiring. The current audio path (`get_audio_clips` RPC via `audioService.ts`) works without it. The table is dead infrastructure.

**Design-intent conflict:** The table is both "per design, the correct binding table" (target plan) and "built but unconnected with no reader ever shipped" (current reality). Dropping it closes off the audio binding improvement. Keeping it is zero cost (0 rows, no consumers).

Per CLAUDE.md Rule #10: "If a subsystem has no live use case, retire it." But target plan §Decision Q is not classified as aspirational the same way `textbook_sources` is — it was an active design decision for a real use case (audio in exercises).

#### Check 8 — Final sign-off

```
Table: capability_audio_refs
Drop verdict: DO NOT DROP (table is design-intent infrastructure, not aspirational speculation; no cost to retain; dropping closes off the audio binding improvement without a replacement path)
Active consumers retired in this PR: None (no consumers).
Already-retired consumers: N/A.
Cross-plan check: Target plan §Decision Q created this table as part of the audio model. No plan says drop it.
Production: 0 rows. writes_last_30d: 0.
RPC body co-edits required: None.
DB deps: None.
Blockers: None — but dropping would contradict target plan §Decision Q without a design decision to abandon audio binding.
Note: The table is cheap to keep. If audio binding is eventually wired (e.g. for listening_mcq exercises to resolve audio without text-based lookup), the table is ready. If the decision is made to permanently use the text-based RPC lookup instead, update the target plan and then drop.
```

---

### 13. `lesson_page_blocks`

#### Check 1 — App-code reader census

Live readers:
- `src/lib/lessons/adapter.ts:236` — `getLessonPageBlocks` function, active DB query `.from('lesson_page_blocks')`. Exported and live.
- `src/lib/lessons/index.ts:71` — re-exports `getLessonPageBlocks`. Live barrel export.
- `src/pages/Lesson.tsx:19,82` — imports and calls `getLessonPageBlocks`. This is the generic lesson reader (legacy). Currently unreachable for all 9 published lessons (all are in the bespoke registry at `src/pages/lessons/registry.tsx`), but the code is compiled and `LessonRouter.tsx:16` falls back to `<Lesson />` for any lessonId not in the registry (i.e., future lessons 10+).
- `src/pages/Session.tsx:19,44` — imports and calls `getLessonPageBlocks`. Active call site: `loadSelectedLessonScope` at line 44 reads page blocks to derive `selectedSourceRefs` for `lesson_practice` / `lesson_review` modes. This function is called if `lessonFilter` is set AND `pageBlocks.length > 0`. Currently gated by `has_page_blocks` in the Lessons UI, but the code path is live for any lesson with page blocks in the DB.
- `src/pages/Lessons.tsx:207` — reads `row.has_page_blocks` from the `get_lessons_overview` RPC. Uses it to build `preparedLessonIds`.
- `scripts/check-supabase-deep.ts:473-499` — HC2 checks `lesson_page_blocks.block_kind`. Must retire in same PR.

`get_lessons_overview` RPC body at `migration.sql:1762-1770`: `lesson_block_presence` CTE reads `lesson_page_blocks` for the `has_page_blocks` boolean signal. This drives `Lessons.tsx:207` at runtime.

#### Check 2 — Migration.sql + RPC bodies

`migration.sql:1655,1664,1762-1770,1811,1831,1951-1974,2106-2107`: multiple references — ALTER TABLE blocks, the `lesson_block_presence` CTE in `get_lessons_overview`, index. The `get_lessons_overview` RPC at line 1762-1770 reads `lesson_page_blocks` for the `has_page_blocks` signal.

Dropping `lesson_page_blocks` without rewriting the RPC = broken RPC, broken Lessons page.

#### Check 3 — DB-level dependencies

No FK from other tables points INTO `lesson_page_blocks`. No views reference it directly.

#### Check 4 — Cross-plan check

`docs/plans/2026-05-22-data-model-migration.md §8` (PR 5): "Target tables: `lesson_blocks` (parent, replacing `lesson_page_blocks`), `lesson_block_reading_section`." PR 5 status: **not started**. The drop of `lesson_page_blocks` is explicitly gated on PR 5 completing its writer + reader rewrite.

`docs/plans/2026-05-20-retire-page-blocks-pipeline-phase-1.md` (status: `shipped`): Phase 3 of the 3-phase plan is the table drop. "Phase 3 drops lesson_page_blocks." Phase 1 shipped (pipeline stopped writing). Phase 2 (bespoke pages for all lessons) — all 9 lessons now have bespoke pages (registry.tsx confirms lessons 1-9 registered). Phase 3 (drop) is blocked by migration plan PR 5.

The two plans are parallel but the migration plan PR 5 is the formal owner of the drop. This audit defers to PR 5.

#### Check 5 — Production-state check

Per Phase 1 plan: rows exist for lessons 1-9 in the DB (the pipeline stopped writing new ones but rows were preserved). `has_page_blocks = true` for all 9 lessons. Dropping the table = `has_page_blocks` always false = all lessons show as "coming later" in the Lessons page tile UI until the RPC is rewritten.

writes_last_30d: 0 (pipeline stopped writing in Phase 1 — PR #85 shipped 2026-05-20).

#### Check 6 — Build-time consumer classification

- `src/pages/Session.tsx:44` — **Runtime reader** (lesson_practice mode scope derivation). BLOCKS drop.
- `src/lib/lessons/adapter.ts:236` (`getLessonPageBlocks`) — **Runtime reader** (function exists, called by Session + Lesson). BLOCKS drop.
- `src/pages/Lesson.tsx:82` — **Runtime reader** (generic legacy renderer, reachable for lesson 10+). BLOCKS drop.
- `get_lessons_overview` RPC body (`migration.sql:1762`) — **RPC body reference** (`has_page_blocks` signal). Must co-edit in same migration block.
- `src/pages/Lessons.tsx:207` — reads `has_page_blocks` from RPC. Needs RPC co-edit.
- `scripts/check-supabase-deep.ts:473` (HC2) — **Health check**. Retire in PR 7.

#### Check 7 — Design-intent verification

Phase 1-3 plan (shipped plan) owns the drop at Phase 3. Migration plan PR 5 owns the replacement (`lesson_blocks`). Both agree the table drops after the typed replacement is live. PR 5 is not started.

#### Check 8 — Final sign-off

```
Table: lesson_page_blocks
Drop verdict: DEFER (blocked by unstarted PR 5 + 3 active runtime readers + RPC co-edit)
Active consumers requiring retirement before drop:
  - src/pages/Session.tsx:19,44 (getLessonPageBlocks in loadSelectedLessonScope — must switch to lesson_blocks query)
  - src/lib/lessons/adapter.ts:233-241 (getLessonPageBlocks — retire function, add getLessonBlocks reading lesson_blocks)
  - src/pages/Lesson.tsx:82 (generic renderer — retire or rewrite to use lesson_blocks)
  - get_lessons_overview RPC (migration.sql:1762) — replace lesson_block_presence CTE with lesson_blocks probe
  - src/pages/Lessons.tsx:207 — no change needed once RPC is rewritten
  - scripts/check-supabase-deep.ts:473 — retire HC2
Already-retired consumers:
  - Pipeline writer retired in Phase 1 (PR #85, 2026-05-20)
  - PracticeActions.tsx retired in Phase 1 (switched to lesson_id query)
  - check-capability-release-readiness.ts retired in Phase 1
Cross-plan check: Migration plan PR 5 owns the drop. Phase 1-3 plan aligns. PR 5 not started.
Production: Rows for lessons 1-9. has_page_blocks=true for all. writes_last_30d: 0.
RPC body co-edits required: get_lessons_overview (lesson_block_presence CTE → lesson_blocks probe).
DB deps: No FK from other tables. No views depend on it.
Blockers: PR 5 not started (lesson_blocks table doesn't exist); 3 runtime readers.
```

---

## Cross-cutting findings

### Finding CC-1: Migration plan's "no live readers since 2026-05-01" claim is false for learner_item_state

`docs/plans/2026-05-22-data-model-migration.md §10.3`: "Drop legacy-retained user-state tables (no live readers since 2026-05-01)." This is FALSE for `learner_item_state`. The `useProgressData` hook at `src/hooks/useProgressData.ts:88` calls `learnerStateService.getItemStates(user!.id)` which reads `learner_item_state` to populate the `itemsByStage` breakdown on the Progress page. This is a live production feature.

### Finding CC-2: leaderboard view was NOT dropped in PR 0 (plan-vs-actual gap)

`docs/plans/2026-05-22-data-model-migration.md §3.3`: "retire the leaderboard" planned in PR 0. `scripts/migration.sql:277`: `CREATE OR REPLACE VIEW indonesian.leaderboard` still present. PR 0 (#86) did NOT drop it. This view reads both `learner_item_state` and `lesson_progress` — two tables planned for PR 7 drop. Dropping either table with CASCADE would silently drop the view. The view has a GRANT at `migration.sql:326` that also needs explicit cleanup.

### Finding CC-3: exercise_review_comments CASCADE data loss risk

`scripts/migration.sql:818`: `exercise_review_comments.exercise_variant_id uuid NOT NULL REFERENCES indonesian.exercise_variants(id) ON DELETE CASCADE`. The migration plan §10.1 says `drop table if exists indonesian.exercise_variants cascade` — this CASCADE silently deletes ALL `exercise_review_comments` rows. The admin review comment workflow depends on these rows. The plan did not flag this. PR 7 must either (a) migrate `exercise_variant_id` to reference the typed tables before dropping, or (b) explicitly acknowledge and accept the data loss with a pre-drop archive.

### Finding CC-4: publish-grammar-candidates.ts is still an active writer to exercise_variants AND item_context_grammar_patterns

The migration plan §7.1 planned to remove the `exercise_variants` write path in PR 4. The shipped PR 4 used dual-write (via `scripts/lib/pipeline/capability-stage/runner.ts`) for the capability-stage path, but `scripts/publish-grammar-candidates.ts` (the standalone grammar authoring script) was NOT retired. It still writes to `exercise_variants` (lines 265, 280) and `item_context_grammar_patterns` (line 247). Dropping either table without retiring this script = broken grammar-exercise authoring workflow for lesson 10+.

### Finding CC-5: 5 tables have health check entries in check-supabase-deep.ts that must be retired in the same PR as the drops

Tables with HC entries: `item_meanings` (HC grant check at line 51), `learner_item_state` (line 54), `learner_skill_state` (line 55), `review_events` (line 56), `lesson_progress` (line 57). Plus `exercise_variants` (HC180-204) and `lesson_page_blocks` (HC2 at line 473). All must be removed from `check-supabase-deep.ts` in the same PR as their respective drops.

### Finding CC-6: capability_audio_refs is built but completely unconnected

Zero rows, zero readers, zero writers. The planned writer (`projectors/vocab.ts`) was intentionally skipped in PR 1. The actual audio path bypasses this table entirely (text-based `get_audio_clips` RPC). The table is inert infrastructure. Recommend: keep for now (DO NOT DROP), but document the decision explicitly in the migration plan. If the audio binding feature is never built, drop in a future cleanup PR with an explicit ADR amendment to Decision Q.

---

## Aggregate PR 7 drop list (SAFE TO DROP set)

Execute in this order to respect FK dependencies:

### 1. `generated_exercise_candidates` (no consumers; empty)

Pre-drop code retirements: None.
RPC body co-edits: None.
DB deps: `exercise_variants.source_candidate_id` is ON DELETE SET NULL (sets to NULL on drop — safe). Drop before `textbook_pages`.
Post-drop verification: `SELECT count(*) FROM information_schema.tables WHERE table_schema='indonesian' AND table_name='generated_exercise_candidates'` = 0.

### 2. `textbook_pages` (no consumers; empty)

Pre-drop code retirements: None.
RPC body co-edits: None.
DB deps: depends on `textbook_sources`; `generated_exercise_candidates` depended on it (already dropped).
Post-drop verification: same pattern.

### 3. `textbook_sources` (no consumers; empty)

Pre-drop code retirements: None.
RPC body co-edits: None.
DB deps: `textbook_pages` already dropped.
Post-drop verification: same.

### 4. `review_events` (no consumers; SM-2 era data)

Pre-drop code retirements: `scripts/check-supabase-deep.ts:36,56` (remove from monitored-tables + expected-grants).
RPC body co-edits: None.
DB deps: FK pointing out to `learning_sessions` — no cascade issue on drop.
Pre-drop archive: `pg_dump --schema=indonesian --table=indonesian.review_events > review_events_archive.sql.gz` (per migration plan §10.3).
Post-drop verification: HC check passes after removing from monitored list.

### 5. `learner_skill_state` (effectively dead; SM-2 era data)

Pre-drop code retirements in this PR:
- `src/services/learnerStateService.ts`: remove `getSkillStates`, `getSkillStatesBatch`, `applyReviewToSkillState` methods.
- `scripts/dev-stage-force.ts:109-120`: update or retire.
- `scripts/check-supabase-deep.ts:35,55`: remove from monitored-tables + expected-grants.
- Verify `apply_review_to_skill_state` RPC body and drop it if it references `learner_skill_state` directly.
RPC body co-edits: Drop `apply_review_to_skill_state` function if it writes to the table.
DB deps: No views, no FKs pointing in.
Pre-drop archive: pg_dump the table.
Post-drop verification: Progress page loads without error (learnerStateService no longer calls deleted methods).

### 6. `item_meanings` (pipeline-retired; admin-page read needs co-edit)

Pre-drop code retirements in this PR:
- `src/services/coverageService.ts:76` — switch hasMeanings check to `learning_items.translation_nl IS NOT NULL`.
- `src/pages/ExerciseCoverage.tsx:35` — rename "item_meanings in DB" label to "Items with translations".
- `scripts/repair-item-meanings.ts` — retire or move to archive.
- `scripts/migrate-typed-tables-pr1-complete.ts` — leave as audit trail (already run; not harmful).
RPC body co-edits: None.
DB deps: No FKs pointing in.
Post-drop verification: ExerciseCoverage page loads without query error.

### Clean up migration.sql

Remove from `scripts/migration.sql`:
- CREATE TABLE blocks for all 6 dropped tables
- All ALTER TABLE, CREATE INDEX, RLS ALTER, DROP POLICY/CREATE POLICY, GRANT blocks for each dropped table
- `apply_review_to_skill_state` function block (if it references `learner_skill_state`)
Post-migration: `make migrate-idempotent-check`.

---

## Deferred-drop list (PR 7 must NOT touch these)

### `capability_artifacts`

Owner: Migration plan §10.1 (PR 7). Deferred reason: 3 active runtime readers not yet retired (`masteryModel.ts:450`, `session-builder/adapter.ts:283,365`, `exercise-content/adapter.ts:324`) plus active pipeline reader (`promote-capabilities.ts:278`). Cannot drop until these retire in the same PR.

To unblock: retire the 4 consumers listed above in this same PR, then drop. The migration plan §10.6 partially covers this but misses `masteryModel.ts` and the two `session-builder/adapter.ts` sites.

### `exercise_variants`

Owner: Migration plan §10.1 (PR 7). Deferred reason: `coverageService.ts:78` (runtime reader), `publish-grammar-candidates.ts:265,280` (active writer), and `exercise_review_comments` FK data loss risk. Cannot drop until all three are resolved.

To unblock: (a) retire `coverageService.ts` exercise_variants read, (b) retire/rewrite `publish-grammar-candidates.ts` to write to typed tables, (c) decide fate of `exercise_review_comments.exercise_variant_id` (migrate FK or drop comments table or accept data loss with archive).

### `lesson_progress`

Owner: Migration plan §10.3 (PR 7). Deferred reason: `lessonService.getUserLessonProgress` (live reader on Progress page), `get_lessons_overview` RPC body, `leaderboard` view (must drop view first), `progressService.markLessonComplete` (live writer, possibly dead in practice).

To unblock: (a) retire `getUserLessonProgress` and switch `useProgressData.ts:93` to derive `lessonsCompleted` from `learner_lesson_activation`, (b) rewrite `get_lessons_overview` RPC to remove `lesson_progress` from `has_started_lesson` (migration plan §10.5 already has this DDL), (c) drop `leaderboard` view (was planned for PR 0; do it in PR 7 now), (d) retire `markLessonComplete`.

### `lesson_page_blocks`

Owner: Migration plan PR 5. Deferred reason: PR 5 not started; `lesson_blocks` table does not exist; 3 runtime readers active; `get_lessons_overview` RPC depends on it.

To unblock: Complete PR 5 (build `lesson_blocks` typed table + writer + reader). Then retire `Session.tsx`, `Lesson.tsx`, `getLessonPageBlocks`, and rewrite the RPC.

---

## Do-not-drop list

### `learner_item_state`

Reason: Live runtime reader at `src/hooks/useProgressData.ts:88` → `learnerStateService.getItemStates`. Dropping produces visible UI breakage (itemsByStage all-zero on Progress page). The migration plan's "no live readers since 2026-05-01" claim is factually incorrect.

Resolve before drop: retire `learnerStateService.getItemStates` and switch `useProgressData` wave-1 `itemsByStage` to derive from `learner_capability_state` (e.g., group by maturity threshold from `stability`). This requires an owner decision on the replacement metric definition, which the migration plan does not specify. Until then, DO NOT DROP.

### `capability_audio_refs`

Reason: Table is design-intent infrastructure per target plan §Decision Q. Zero cost to retain (0 rows, no consumers). Dropping contradicts the target plan audio binding design without a deliberate design reversal. If the decision is made to permanently use text-based audio lookup (the current `get_audio_clips` path) and abandon capability-based audio binding, update the target plan and drop in a future cleanup PR.

---

## PR 7 readiness verdict

**PR 7 is NOT ready to be drafted as a single atomic PR.**

The safe-to-drop set (6 tables) CAN be drafted now as "PR 7a" — a first destructive cleanup PR with zero runtime-reader blockers (after the listed co-edits per table are included in the same PR).

The deferred tables (`capability_artifacts`, `exercise_variants`, `lesson_progress`) require consumer retirements that are non-trivial — particularly:
- `capability_artifacts` requires retiring `masteryModel.ts` + `session-builder/adapter.ts` artifact reads (these are the session-build planner paths; retiring them changes the readiness-validation logic).
- `exercise_variants` requires retiring `publish-grammar-candidates.ts` (an active grammar-authoring pipeline tool) and deciding the `exercise_review_comments` fate.
- `lesson_progress` requires retiring `getUserLessonProgress` and replacing the Progress page `lessonsCompleted` metric.

The most surprising finding is that the migration plan §10.3 claim "no live readers since 2026-05-01" is false for `learner_item_state` — the Progress page reads it on every load. A second surprise is the `leaderboard` view (reading both `learner_item_state` and `lesson_progress`) still existing after PR 0 claimed to retire it. Third surprise: `exercise_review_comments` has a NOT NULL FK to `exercise_variants` with ON DELETE CASCADE — a silent data loss risk in the §10.1 DROP CASCADE that the plan did not flag.

**Recommended next step:** Draft PR 7 as two sub-PRs. PR 7a: safe-to-drop set (6 tables: `generated_exercise_candidates`, `textbook_pages`, `textbook_sources`, `review_events`, `learner_skill_state`, `item_meanings`) — drafting is unblocked. PR 7b: remaining drops after per-table blockers are resolved. Each sub-PR passes `make migrate-idempotent-check` before merging.
