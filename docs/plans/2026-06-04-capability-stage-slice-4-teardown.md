---
status: approved
approved_at: 2026-07-01
doc_type: capability-stage-slice-plan
issue: "#102"
parent_epic: "#98"
last_verified_against_code: 2026-07-01
reviewed_by:
  - "architect: APPROVED-WITH-CHANGES 2026-07-01 — 3PR→1PR collapse sound; 5 required changes folded (contentNonEmpty publish-path verifier added, orphan plumbing retired, publish-path acceptance gate added, artifact_fingerprint CREATE-block strip, census-cite fixed)"
  - "data-architect: PASS-WITH-CHANGES 2026-07-01 — drop-safe; 2 MINOR folded (artifact_fingerprint CREATE :1387 strip, :2859 comment update); CS9 invariant-narrowing acknowledged; 4-comment typed-table resolution added to acceptance"
depends_on:
  - 2026-05-21-data-model-target.md   # approved; Decisions A/B/K
supersedes: []
grounded_against:
  - "docs/audits/2026-06-04-slice4-census-refresh.md (on branch docs/slice4-census-refresh / PR #149 — not on main)"
  - docs/target-architecture.md
  - live DB census 2026-07-01 (this document, § Census refresh)
---

# Capability Stage Redesign — Slice 4: teardown + drop legacy tables (HITL)

> **2026-07-01 re-scope.** This plan was approved 2026-06-04 as three gated PRs
> (4a safe-set → 4b `capability_artifacts` → 4c `exercise_variants`). A live-DB
> census on 2026-07-01 finds **4a and 4b already shipped and applied to the live
> DB**, and #147 (the 4c gate) already merged to main. **The only remaining work
> is a single small PR: drop `exercise_variants` + the one dead column 4b left
> behind (`learning_capabilities.artifact_fingerprint`) + retire the residual
> build/admin/HC readers.** The 4a/4b sections below are retained as the shipped
> record; § "Slice 4c (the only remaining work)" is the forward-looking spec.

## Census refresh — live DB + main, 2026-07-01

Verified by read-only `psql` against the live homelab DB and by reading current
`main` (`migration.sql`, code, `git`).

| June-4 unit | State on `main` + live DB (2026-07-01) | Evidence |
|---|---|---|
| **4a** — `item_meanings`, `item_context_grammar_patterns`, `generated_exercise_candidates`, `textbook_pages`, `textbook_sources`, `lesson_blocks`, `lesson_block_reading_section` | **SHIPPED + LIVE.** All 7 absent from the live DB (`pg_class`, `indonesian` schema). Drops authored at `migration.sql:2699-2706`. Readers retired (`coverageService.ts` → `translation_nl` + typed grammar tables). | live census; `migration.sql:2699-2706` |
| **4b** — `capability_artifacts` table + `learning_capabilities.required_artifacts` col | **SHIPPED + LIVE.** Table absent; `required_artifacts` column absent. Drop at `migration.sql:2725`; `HC25` present. All readers retired (session-builder, mastery, `fetchArtifacts`). | live census; `migration.sql:2708-2732`; `check-supabase-deep.ts:1605+` |
| **4b residual** — `learning_capabilities.artifact_fingerprint` col | **NOT DROPPED (dead).** Column still present live; **0 readers** in `src`+`scripts` (excl. tests). 4b.1 flagged "retire if present"; it was missed. | live census; `rg artifact_fingerprint` clean |
| **4c** — `exercise_variants` | **REMAINING.** Present: **716 rows, 808 kB.** Gate (#147, legacy grammar writer) **cleared** — commit `aeb620e4` "retire … the step-10 exercise_variants writer (#147 5b.2)" is on `main`; **0 writers** remain (all 6 non-test `from('exercise_variants')` accesses are reads). | live census; `git branch --contains aeb620e4` = main; `rg` writer scan |

### 4c drop-safety (live-verified)
- **0 views**, **0 functions/RPCs** reference `exercise_variants` (`pg_depend`, `pg_proc` scans).
- **0 runtime `src/` reads** — the deployed app has no dependency; `exerciseReviewService` uses only the *column* `exercise_variant_id` (which survives), not the table.
- **1 live FK** references it: `content_flags_exercise_variant_id_fkey` (ON DELETE SET NULL). `content_flags` has 25 rows, **all with `exercise_variant_id = NULL`** → dropping the table is a data no-op for `content_flags`.
- `exercise_review_comments` (4 rows) has **no FK** to `exercise_variants` (Slice 2 dropped it — D6 confirmed live). No CASCADE row loss.

---

## Slice 4c (the only remaining work)

**Single PR.** Drop `exercise_variants` (716 rows) + drop the dead
`learning_capabilities.artifact_fingerprint` column + retire residual consumers.
The June-4 three-PR structure collapses to one because 4a/4b are shipped and 4c's
gate is cleared — per Minimum Mechanism, the extra PR boundaries no longer buy
independent reversibility for anything not already reversed.

### 4c.1 — Retire residual consumers (code-first; all are build/admin/HC, none deployed to the app)
Verified inert or read-only first; retire each in this PR:

| Consumer | File:line | Action |
|---|---|---|
| **Publish-path verifier (Slice-4a failure class — architect)** | `capability-stage/verify/contentNonEmpty.ts:53 ExerciseVariantRow` + `:128-137` arm + `:28 exerciseVariantIds` input field | **delete the `exercise_variants` presence arm + the `ExerciseVariantRow` type + the `exerciseVariantIds` input field.** This is a publish-only post-write verifier — it never runs under `make pre-deploy`, only under a real publish; a reference to a dropped table here is latent 404-bait (the exact class that broke Slice 4a, OpenBrain lesson `0169613c`). |
| Stage count reader + plumbing | `capability-stage/adapter.ts:841 countExerciseVariantsForLesson`; caller `verify/countParity.ts:83-85` + the `declared.exerciseVariants` counter `:42` | delete the reader; drop the `exercise_variants` parity arm AND the now-dead `declared.exerciseVariants` field (writer gone → declared always 0; reader would 404 post-drop). |
| Stage context reader + CS9 narrowing | `capability-stage/adapter.ts:1375 readActiveVariantContextIds`; caller `verify/seedIntegrity.ts:98` | delete the reader; remove the active-variant context arm. **CS9 invariant narrows** (data-architect advisory): non-dialogue reviewability goes from "NL-covered OR has an active `exercise_variant` on a context" → "NL-covered only." This is *forced and correct* — the 4 typed grammar tables key on `grammar_pattern_id`+`lesson_id`, not `item_contexts`, so the arm cannot be repointed; grammar renderability is enforced at HC15 / `RENDER_CONTRACTS`. Retire it explicitly, not accidentally. |
| Dead `exerciseVariantIds` thread | `runner.ts:659` (`= []`), `:682`, `:688` | remove the field from the verify-input assembly (it feeds the two arms above; leaving it dangles a field referencing a dropped table). |
| Admin coverage build script | `check-vocab-coverage.ts:149` | drop the `exercise_variants` read. |
| Admin coverage build script | `check-lesson-coverage.ts:70-71` | drop the `exercise_variants` count line. |
| Exercise-audio build script | `generate-exercise-audio.ts:287` | drop / repoint to typed grammar tables (grammar-exercise audio, if still generated, resolves from typed rows). |
| Health check | `check-supabase-deep.ts` HC23 resolution list `:1400`; pr4-bridge hint `:1290` | remove `exercise_variants` from the orphan-comment resolution set (the 4 comments must resolve across the 4 typed tables); drop the bridge hint. |
| Already-run bridge | `migrate-typed-tables-pr4-grammar.ts` | note "keep as audit trail (reads 404 post-drop)" header, or delete. |
| Admin page label | `ExerciseCoverage.tsx:55` "exercise_variants in DB" | cosmetic relabel — `coverageService` already sources the count from the 4 typed tables (`exerciseVariants` field name is legacy-kept, `coverageService.ts:181`). |
| Dead types | `src/types/learning.ts` (`exercise_variants` types marked "RETIRE IN PR 7", `:293/:316/:391/:394`) | remove the dead type declarations + comments. |

**No runtime deploy-ordering hazard** (unlike 4a/4b): no deployed-app code path
reads `exercise_variants`, and no view/RPC does. Container recreate-then-migrate
is still done for hygiene, but the blast radius on the live app is zero.

### 4c.2 — De-FK the two CREATE blocks so a fresh rebuild survives the drop
On a fresh `migration.sql` apply, `exercise_review_comments` and `content_flags`
CREATE blocks inline-reference `exercise_variants(id)`. With the table's CREATE
removed, those references fail. So:
- `migration.sql:968` (`exercise_review_comments.exercise_variant_id`): replace `uuid NOT NULL REFERENCES indonesian.exercise_variants(id) ON DELETE CASCADE` → `uuid NOT NULL` + a comment (FK intentionally dropped, Slice 2; column holds typed-row ids resolved across the 4 typed tables). Live FK already absent — this only fixes fresh-rebuild.
- `migration.sql:878` (`content_flags.exercise_variant_id`): replace `uuid REFERENCES indonesian.exercise_variants(id) ON DELETE SET NULL` → `uuid` + comment. Add an explicit idempotent `alter table indonesian.content_flags drop constraint if exists content_flags_exercise_variant_id_fkey;` in the drop section so the **live** constraint is removed deterministically (not only via DROP … CASCADE side-effect).

### 4c.3 — Author the drops into `migration.sql`
- Remove the `exercise_variants` CREATE block (`:743-756`), its RLS `ENABLE` (`:808`), **all four policy lines** (`:850-853` — both `DROP POLICY IF EXISTS` + `CREATE POLICY` pairs; `DROP POLICY IF EXISTS` still errors if the *table* is gone on a fresh apply, so all four must go), its GRANT (`:862`), the nullable/anchor/`lesson_id` DO-blocks + `exercise_variants_anchor_check` + the two indexes (`idx_exercise_variants_lesson`, `idx_exercise_variants_grammar`).
- **Strip `artifact_fingerprint text,` from the `learning_capabilities` CREATE block (`:1387`)** — not only the drop-section ALTER. Leaving it creates-then-drops the column on a fresh rebuild (violates "CREATE block = target state"; `migrate-idempotent-check` won't catch it since `CREATE TABLE IF NOT EXISTS` no-ops on a live DB). (data-architect CHANGE 1)
- **Update the comment at `:2859`** so `artifact_fingerprint` is described as handled *here* (Slice 4c), not in a future "Step 6." **Leave `metadata_json` + `source_fingerprint` in that Step-6 reference** — both still have live readers (`triage-residual-capabilities.ts` writes `metadata_json`; `check-capability-health.ts` reads `source_fingerprint`). (data-architect CHANGE 2)
- Note (intentional, not incidental): removing the `exercise_variants` CREATE also clears its `source_candidate_id` FK (`:752`) to `generated_exercise_candidates`, whose CREATE was already removed in 4a — a latent fresh-rebuild hazard this drop fixes.
- Add to the drop section (after the 4b block):
  ```sql
  -- Slice 4c (#102, 2026-07-01) — drop exercise_variants (Decision B).
  -- Legacy grammar-exercise blob; the 4 typed grammar-exercise tables replaced it.
  -- #147 5b.2 (commit aeb620e4) retired the last writer → 716 frozen rows, 0 writers.
  -- 0 views / 0 functions / 0 runtime readers depend on it (verified 2026-07-01).
  alter table indonesian.content_flags drop constraint if exists content_flags_exercise_variant_id_fkey;
  drop table if exists indonesian.exercise_variants cascade;
  -- 4b residual: dead readiness column, 0 readers (Decision A tail).
  alter table indonesian.learning_capabilities drop column if exists artifact_fingerprint;
  ```

### 4c.4 — Health check
- Add `HC` (mirror `HC25`) asserting `exercise_variants` no longer exists (probe → expect PGRST205 / relation-absent) and readiness/coverage still intact.
- Remove `exercise_variants` from the `check-supabase-deep.ts` monitored-table/grant set and from HC23's resolution list (4c.1).

### 4c.5 — Docs
- Strike `exercise_variants` from `docs/target-architecture.md:1462` ("Things that explicitly stay") and the standalone-fold backlog enumeration `:1502` (M1 doc-drift, 4c half — the 4b half for `capability_artifacts` was struck when 4b shipped; verify and complete).
- Update this plan's frontmatter to `status: shipped` + `implementation_paths` in the merge commit (PR template rule).

## Supabase Requirements

### Schema changes
- **Drop:** `indonesian.exercise_variants` (716 rows). **Drop column:** `learning_capabilities.artifact_fingerprint`. **Drop constraint:** `content_flags_exercise_variant_id_fkey`. De-FK the `exercise_review_comments` + `content_flags` CREATE blocks (fresh-rebuild only). All authored into `scripts/migration.sql` (canonical).
- RLS — N/A (only drops; `exercise_variants` policies removed with the table). Grants — the `exercise_variants` GRANT removed with it.

### homelab-configs changes
- [ ] PostgREST: none. N/A. — [ ] Kong: none. N/A. — [ ] GoTrue: none. N/A. — [ ] Storage: none. N/A.

### Health check additions
- `check-supabase.ts`: N/A. — `check-supabase-deep.ts`: add the `exercise_variants`-dropped HC; remove `exercise_variants` from the monitored set + HC23 resolution list.

## Gates & acceptance
- `pg_dump` the 716 `exercise_variants` rows before dropping (non-empty archive).
- `make migrate-idempotent-check` green (drop-if-exists no-ops on run 2 / fresh rebuild — catches the 2026-05-02/05-08 bulk-drop class).
- `make pre-deploy` green (lint + tests + build + tier-1 + tier-2).
- **Exercise the publish path (architect A3 — `make pre-deploy` never reaches `verify/*.ts`).** Run a capability-stage dry-run / re-publish of one grammar lesson so `contentNonEmpty.ts` + `countParity.ts` + `seedIntegrity.ts` actually execute against the post-drop DB — the R1 mitigation is only real if the publish-path verifiers run. Green = no verifier references `exercise_variants`.
- **Confirm the 4 `exercise_review_comments` ids all resolve in a typed table** (data-architect Q2) — query before/after so HC23 can't silently false-orphan a comment whose `exercise_variant_id` holds a typed-row id.
- `make migrate` (HITL, operator-run) applies live; `check-supabase-deep` green post-migrate; new HC confirms the drop; app still renders + sessions build + reviews commit.
- Finish gate: `Dev-Workflow-DB-Verified` trailer (plan-vs-actual + live-DB query) + `Dev-Workflow-Lesson` trailer.

## Risks
- **R1 — a `verify/*` gate 404s post-drop because a reader wasn't retired.** Mitigated by 4c.1 enumerating both `countParity.ts:83` and `seedIntegrity.ts:98` + `make pre-deploy` running the stage tests.
- **R2 — fresh rebuild fails on the inline FK to a dropped table.** Mitigated by 4c.2 de-FK + `make migrate-idempotent-check` (which does a fresh double-apply).
- **R3 — `content_flags` data loss on drop.** None: all 25 rows have NULL `exercise_variant_id`; FK is SET NULL and dropped explicitly.

---

## Historical: PR 4a / PR 4b (SHIPPED — retained record)

The original three-PR spec (4a safe-set; 4b `capability_artifacts` + `required_artifacts`;
4c `exercise_variants`) is preserved in git history (branch `docs/slice4-census-refresh`,
PR #149) and in the 2026-06-04 census (`docs/audits/2026-06-04-slice4-census-refresh.md`
— which lives on that same branch, **not on `main`**; this document's inline § "Census
refresh" carries the load).
4a and 4b shipped and were applied to the live DB (verified 2026-07-01 above); their
drops live at `migration.sql:2699-2732`. The `capability_artifacts` W1 wrinkle
(canonical-schema drift) and the three-layer readiness parity guard (4b.4) were resolved
when 4b shipped (`HC25`). This document now tracks only the 4c remainder.
