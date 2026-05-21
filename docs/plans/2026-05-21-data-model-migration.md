---
status: draft
doc_type: data-model-migration-plan
last_verified_against_code: 2026-05-21
depends_on:
  - 2026-05-21-data-model-investigation.md
  - 2026-05-21-data-model-target.md
---

# Data-model migration plan — current → target

**Role:** This plan sequences the schema migration described in `2026-05-21-data-model-target.md`. It splits the work into independently-shippable PRs, each with: schema diff, data backfill, code paths that change, what gets retired, tests + health checks, rollback.

**Hard constraints (from CLAUDE.md):**
- `scripts/migration.sql` is the canonical source applied by `make migrate`. New schema lands there.
- Every change must be idempotent — `make migrate-idempotent-check` applies it twice and asserts the second run is green.
- `make pre-deploy` (lint + test + build + `check-supabase` + `check-supabase-deep`) is the gate before merging migration changes — GitHub Actions cannot reach the homelab.
- Browser GRANTs must stay narrow (capability writes via RPC only; new typed tables: SELECT for `authenticated`).
- The `canonical_key` contract must NOT change; FSRS state is keyed by it.

**Soft constraints (from this project):**
- Single-user app; small data volumes (~9k artifact rows; ~700 exercise variants; ~170 page blocks; ~80 sections).
- No staged rollout / no feature flags — the runtime is unified (CLAUDE.md: "Runtime is unified — every lesson goes through the capability pipeline").
- Live admin (Albert) iterates content in production; "Publishing policy: Everything publishes immediately." (CLAUDE.md).

**Strategy (revised 2026-05-21 per user direction "no soak period; migrate ASAP" + "repoint the seed files to the new tables and simply repopulate"):** ship the migration as 5 dependency-ordered PRs that flow back-to-back. Within each PR, all schema changes + pipeline-writer rewrites + runtime-reader rewrites + retire-old land in the same atomic commit. **No SQL backfill** — the publish pipeline (which already exists) repopulates the new tables from the canonical staging files. See §1.1 below for the repopulate strategy. There are no compat windows, no feature flags, no dual-write phases, no soak periods. Single-user homelab app; low write volume; the schema can flip cleanly. Each PR still has its own pre-deploy gate (`make migrate-idempotent-check` + `make pre-deploy`) and visual smoke where applicable.

---

## §1. PR sequence overview

Per user direction (2026-05-21): **slice by source_kind**, not by layer. Each per-capability PR does ALL the work end-to-end for one source kind — schema, pipeline writer, runtime reader, re-publish, smoke. Mistakes surface immediately on the one capability shape being migrated.

Eight PRs total: one upfront cleanup, five per-source-kind, one final-cleanup, two lesson-content (orthogonal). Each ships immediately when its predecessor lands. **No soak periods.**

| PR | Title | Scope | Risk |
|---|---|---|---|
| 1 | **Schema cleanup + slim columns** | Drop empty/aspirational/legacy/orphan tables; rewrite `leaderboard` view; slim `learning_capabilities` (drop `metadata_json` + fingerprints; add `prerequisite_keys`); slim `lessons` (drop dead columns); junction-ify `dialogue_voices` → `lesson_speakers`; slim `learner_capability_state` (drop `fsrs_state_json`); slim `capability_review_events` (drop redundant JSON columns + rename); add `meaning_recall` + `cloze_mcq` to `exercise_type_availability`. **ALTER-only — no repopulate needed; existing rows survive.** | LOW |
| 2 | **`item` source kind end-to-end** | Add `capability_audio_refs` table. Rewrite `byKind/item.ts` to read upstream typed tables (`learning_items` + `item_meanings` + `item_answer_variants` + `capability_audio_refs`) instead of `capability_artifacts`. Rewrite `session-builder/adapter.ts:282-289` planner-side artifact reader. Rewrite pipeline `projectors/vocab.ts` + audio path to write `capability_audio_refs` rows and stop emitting the 9 item-only artifact kinds. Republish all 9 lessons. Verify item-source caps still render (the 6 capability types that have ever shipped — see investigation §1.4). Item-keyed `capability_artifacts` rows become stale (deleted in PR 7). | MEDIUM |
| 3 | **`dialogue_line` source kind end-to-end** | Add `dialogue_clozes` + `lesson_dialogue_lines` + `lesson_section_dialogue` (header). Rewrite `byKind/dialogueLine.ts` to read `dialogue_clozes` JOIN `lesson_dialogue_lines` instead of the 3 dialogue artifact kinds. Rewrite pipeline `projectors/dialogueArtifacts.ts` + lesson-stage dialogue propagation. Republish L9 (7 dialogue clozes — the only ones live today). Verify via real session against a `contextual_cloze` cap. Dialogue artifact rows become stale (deleted in PR 7). | LOW (small data) |
| 4 | **`affixed_form_pair` source kind end-to-end** | Add `affixed_form_pairs` table. Rewrite `byKind/affixedFormPair.ts` to read `affixed_form_pairs` instead of the 2 morphology artifact kinds. Rewrite pipeline `projectors/morphology.ts`. Republish L9 (the only lesson with affixed pairs — 2 pairs × 2 caps = 4 rows). Verify via real session against a `root_derived_*` cap (this is the runtime-gap "next pilot" per the gap doc). Morphology artifact rows become stale (deleted in PR 7). | LOW |
| 5 | **`pattern` source kind end-to-end (grammar routing fix)** | Add `grammar_pattern_examples` + 4 grammar exercise typed tables (`contrast_pair_exercises`, `sentence_transformation_exercises`, `constrained_translation_exercises`, `cloze_mcq_exercises`). Add new `byKind/pattern.ts` fetcher. Add `pattern` source-kind bucket to `adapter.ts:bucketByDecodedSourceKind`. Wire `renderContracts.ts` `capabilityTypes` arrays for the 4 grammar exercises. Rewrite pipeline `projectors/grammar.ts` + `publish-grammar-candidates.ts` + grammar-exercise-creator agent prompt. Republish all 9 lessons + grammar candidates. **First time pattern caps render for any learner** — mandatory live-session smoke (per `feedback_answer_log_check.md`). Drop `exercise_variants`. Pattern artifact rows (`pattern_explanation:l1`, `pattern_example`) become stale (deleted in PR 7). | HIGH (new live feature surface) |
| 6 | **(reserved for podcast source kinds)** | Empty today; PR 6 placeholder for `podcast_segment` + `podcast_phrase` when those features ship. Out of scope for this migration. | n/a |
| 7 | **Drop `capability_artifacts`** | Confirm via `grep capability_artifacts` that the only hits are deleted code, migration history, and this plan. `drop table indonesian.capability_artifacts cascade`. Final removal step once PRs 2-5 have moved every source kind off the bag. | LOW (after PRs 2-5) |
| 8 | **`lesson_blocks` typed satellites (orthogonal to capabilities)** | Replace `lesson_page_blocks` with `lesson_blocks` (header) + 6 typed satellites. Rewrite `LessonReader` + `LessonBlockRenderer` + pipeline `lesson-stage/runner.ts`. Republish all 9 lessons. Drop `lesson_page_blocks`. | HIGH (renderer rewrite) |
| 9 | **`lesson_section_*` typed satellites (orthogonal to capabilities)** | Replace `lesson_sections.content` with typed satellites. Rewrite consumers (`coverageService`, `lib/lessons/adapter.ts`, per-lesson `Page.tsx` files). Slim `lesson_sections` to header-only (drop `content` column). Republish. | HIGH (largest reader surface) |

**Per-PR gate (every PR — non-negotiable):**

1. `make migrate-idempotent-check` — idempotency of the schema change.
2. `make pre-deploy` — lint + unit tests + build + `check-supabase` + `check-supabase-deep`.
3. **Playwright E2E suite passes locally** — `bun playwright test` against `e2e/*.spec.ts`. The existing suite covers `lesson-reader.spec.ts`, `session.spec.ts`, `pr4a-smoke.spec.ts`, `design-lab-capture.spec.ts`. Each PR EXTENDS the relevant spec with assertions for its migrated surface (per the per-PR E2E rows in §13.5 below).
4. **Live-session answer-log check** — per `feedback_answer_log_check.md`. After the migration applies + the publish re-runs, drive a real session that exercises the migrated surface, then `select source_kind, capability_type, count(*) from learning_capabilities lc join capability_review_events cre on lc.id = cre.capability_id group by 1, 2 order by 3 desc;` and confirm the migrated `(source_kind, capability_type)` tuple has new event rows. The answer log is ground truth: data existence ≠ feature works.

PR 5 + PR 8 + PR 9 also require visual smoke (open `/admin/design-lab` + `/admin/page-lab` + every lesson reader on dev).

**Slicing rationale (why source_kind instead of layer):**

- Each per-capability PR has a tight end-to-end story: edit schema → edit pipeline → edit reader → republish → confirm THAT cap renders → done.
- Mistakes are confined to one source kind. A bug in `byKind/dialogueLine.ts` doesn't block PR 2 (item) from shipping; a bug in `projectors/grammar.ts` doesn't block PR 4 (affixed_form_pair).
- The orphan-routing problem for pattern caps (the `feedback_answer_log_check.md` failure mode) is contained to PR 5 — that PR is the one where the answer-log smoke test matters most.
- `capability_artifacts` survives across PRs 2-5 (as stale data for the kinds that have been migrated off it) — the bag is dropped atomically in PR 7 once all readers are gone.

**PR 7 alternative:** instead of keeping `capability_artifacts` rows around through PRs 2-5, each per-capability PR can `delete from capability_artifacts where artifact_kind in (...)` for its kinds. The end-state is identical; the early-deletion variant exercises the per-PR rollback path more aggressively (a rollback would lose the deleted rows and require re-publishing to recover). Recommendation: keep PR 7 as the centralised drop; per-PR PRs leave stale rows in place.

**Lesson-content PRs (8, 9) can ship before or after the capability PRs (2-5).** They touch `lesson_page_blocks` + `lesson_sections.content`, not `capability_artifacts`. Order them based on review-cycle preference.

### 1.1 Repopulate strategy — no SQL backfill

User direction (2026-05-21): "perhaps not migrate but repoint the seed files to the new tables and simply repopulate."

The staging files at `scripts/data/staging/lesson-N/` are the canonical source of truth for all content (CLAUDE.md §"Derived staging files"). The DB tables are projections, written by `bun scripts/publish-approved-content.ts <N>`. Each lesson can be re-published from staging at any time.

This means every per-PR "backfill" in the sections below is achievable by **re-running the publish pipeline against repointed writers**, not by hand-written one-shot SQL. The pipeline already exists; it already does the shape classification (paragraph vs categories vs sentences for reading sections, etc.); it already upserts capabilities on `canonical_key` (verified: `scripts/lib/pipeline/capability-stage/adapter.ts:152`). Capability `id` UUIDs are preserved across republishes, so FSRS state in `learner_capability_state` and the audit log in `capability_review_events` are NOT orphaned by re-publishing.

**Per-PR data step under the repopulate strategy:**

1. Edit the pipeline writer to emit the new typed-table rows instead of the old shape (for the source kind being migrated).
2. Edit the runtime reader to read the new tables.
3. CREATE the new tables in `scripts/migration.sql`.
4. Re-run `bun scripts/publish-approved-content.ts <N>` for every affected lesson — typically all 9, occasionally a subset (e.g. PR 4 only needs L9 republished because that's the only lesson with affixed_form_pair caps today).
5. Verify with `make check-supabase-deep` + visual smoke + a live session that exercises the migrated source kind.
6. The old artifact rows for the migrated kind(s) become stale but are not dropped until PR 7 (`drop table capability_artifacts cascade`) — keeping them lets each PR roll back independently by reverting the code and re-publishing.

**Trade-off vs. SQL backfill:** the repopulate strategy has the publish pipeline as the only writer of the new tables, which means (a) no parallel maintenance of a one-shot SQL parser; (b) the shape transformation lives in TypeScript with type safety; (c) any shape-classification bugs surface in the pipeline (where they're caught by validators) rather than in raw SQL; (d) re-running publishing is a normal app operation, not a privileged DB hack.

**Caveats:**

- `learner_capability_state` + `capability_review_events`: not repopulatable from staging — they are learner data. They survive because `learning_capabilities.id` is stable across republishes (upsert on `canonical_key`). The slim-column ALTERs in new PR 1 preserve `id` (ALTER doesn't recreate rows).
- `audio_clips`: TTS-rendered audio, expensive to regenerate. Survives unchanged (no shape change in §3 of target doc). The new `capability_audio_refs` rows get populated by republishing the capability stage.
- `learner_lesson_activation`, `profiles`, `user_roles`, `error_logs`: pure user state, not touched.
- `learning_sessions`: pure session data, not touched.
- Edge function `commit-capability-answer-report`: PR 1's column renames in `capability_review_events` require an edge-function deploy alongside the schema migration (no repopulate-equivalent path).

**The backfill SQL blocks in §§6-12 below are kept as illustrative reference** — they document the data shape correspondence between old and new tables. In practice you do not run them; you re-publish.

### 1.2 Mapping from the per-PR detail sections to the per-source-kind sequence

The detail sections that follow (§2-§12) were authored against an earlier layer-sliced 11-PR breakdown. They are retained for their schema diffs + code-paths-touched + per-source-kind data shapes, but they consolidate into the 9-PR sequence above as follows:

| New PR | Subsumes old §s |
|---|---|
| **PR 1 (schema cleanup + slim columns)** | §2 (drop empty/legacy) + §3 (slim review events + FSRS state) + §4 (slim `learning_capabilities` metadata) + §5 (slim lessons + lesson_speakers). The leaderboard rewrite from §2.2 lands here. The pre-PR-1 `pg_dump` of legacy-retained tables runs first. ALTER-only, no repopulate. |
| **PR 2 (`item` source kind end-to-end)** | §10.2 (`capability_audio_refs` introduction — was "PR 8.5"). Plus the item-side of the readiness refactor (§8) — for item caps, read upstream `learning_items` + `item_meanings` + `item_answer_variants` + `capability_audio_refs` instead of `capability_artifacts`. |
| **PR 3 (`dialogue_line` source kind end-to-end)** | §6 (typed dialogue satellites) — `dialogue_clozes`, `lesson_dialogue_lines`, `lesson_section_dialogue`. |
| **PR 4 (`affixed_form_pair` source kind end-to-end)** | §7 (typed `affixed_form_pairs` table). |
| **PR 5 (`pattern` source kind end-to-end)** | §8 (typed `grammar_pattern_examples` — pattern side of readiness refactor) + §9 (grammar exercise split + routing wire-up + `exercise_variants` drop). The two old PRs collapse into one because they share the pattern source kind. |
| **PR 6 (podcast source kinds — placeholder)** | n/a (not in original layer-sliced plan). Out of scope today. |
| **PR 7 (drop `capability_artifacts`)** | §10.1 (the artifact-table drop only). The audio-ref step from §10.2 already shipped in PR 2. |
| **PR 8 (`lesson_blocks` satellites)** | §11. Drop of `lesson_page_blocks` in same PR. |
| **PR 9 (`lesson_section_*` satellites)** | §12. `lesson_sections.content` column dropped in same PR. |

When reading §§2-12, treat each "old PR N" header as describing a chunk of one of the 9 new PRs. The SQL backfill snippets there are kept for shape-correspondence reference — under the §1.1 repopulate strategy you re-publish from staging instead of running the SQL.

---

## §2. Old PR 1 (now part of new PR 1) — Drop empty and legacy-retained tables

**Scope:** Cleanup-only. No code changes (besides removing references in `EXPECTED_TABLES` lists).

### 2.1 Tables dropped

PR 1 splits per architect review into a small initial drop and a deferred final drop:

**PR 1 — immediate drops (zero rows, no read path):**

```sql
-- Empty + aspirational (zero rows each, no read path):
drop table if exists indonesian.item_context_grammar_patterns cascade;
drop table if exists indonesian.generated_exercise_candidates cascade;
drop table if exists indonesian.textbook_pages cascade;
drop table if exists indonesian.textbook_sources cascade;
drop table if exists indonesian.podcasts cascade;

-- Orphan after retirement #6 — has 14 rows but no live write or read:
drop table if exists indonesian.lesson_progress cascade;
```

Note: `capability_aliases` is **NOT** dropped (Decision K revised — preserved per ADR 0001 as the canonical-key migration escape hatch).

**Legacy-retained drops (now in same new PR 1 — no soak, but archive first):**

```sql
-- Legacy-retained (last write 2026-05-01; no new writes). pg_dump these
-- to /Users/albert/home/learning-indonesian-archive/legacy-state-2026-05-21.sql.gz
-- BEFORE running the migration, then drop in the same PR.
drop table if exists indonesian.learner_item_state cascade;
drop table if exists indonesian.learner_skill_state cascade;
drop table if exists indonesian.review_events cascade;
```

Order: (1) take the pg_dump archive; (2) ship PR 1 (which includes these drops alongside everything else in the cleanup + slim chunk).

### 2.2 Rewrite the `leaderboard` view

Current view (`scripts/migration.sql:~277`) reads from `learner_item_state` (for `items_learned`) and `lesson_progress` (for `lessons_completed`). Rewrite to source from `learner_capability_state` and `learner_lesson_activation`.

**Note on `lessons_completed` semantic shift (W8 of architect review):** the original metric counted lessons the learner had clicked through completely (`lesson_progress.completed_at IS NOT NULL`). The proposed replacement (`learner_lesson_activation` row exists) counts lessons the learner has **activated** (clicked the activation checkbox). These are not the same metric. Three options:

| Option | Metric | Decision |
|---|---|---|
| (a) Rename column | `lessons_activated` instead of `lessons_completed` | Truthful; visible UX change |
| (b) Re-derive completion from review evidence | e.g. `COUNT(DISTINCT lesson_id) WHERE review_count > 0` aggregated over caps | Matches "user has engaged with this lesson's material" — closer to original intent |
| (c) Accept the silent semantic shift | Same column name, different definition | Lowest friction; highest confusion risk |

**Recommendation: (b)** — re-derive completion from capability-review evidence. Confirm with user before PR 1 ships.

```sql
create or replace view indonesian.leaderboard as
select
  p.id as user_id,
  p.display_name,
  (select count(*) from indonesian.learner_capability_state lcs
    where lcs.user_id = p.id and lcs.review_count > 0) as items_learned,
  (select count(*) from indonesian.learner_lesson_activation lla
    where lla.user_id = p.id) as lessons_completed,
  (select coalesce(sum(ls.duration_seconds), 0) from indonesian.learning_sessions ls
    where ls.user_id = p.id and ls.session_type = 'learning') as total_seconds_spent,
  (select count(distinct date_trunc('day', cre.created_at at time zone coalesce(p.timezone, 'UTC')))
    from indonesian.capability_review_events cre
    where cre.user_id = p.id) as days_active
from indonesian.profiles p;
```

The above is a sketch; the design review should confirm the `items_learned`/`lessons_completed`/`days_active` definitions match the current product expectations.

### 2.3 Code paths that change

- `scripts/check-supabase-deep.ts:24-42` — remove `learner_item_state`, `learner_skill_state`, `review_events`, `lesson_progress` from `EXPECTED_TABLES`. Remove their grant expectations from `EXPECTED_GRANTS`.
- `scripts/migration.sql` — drop CREATE TABLE blocks for the retired tables; drop their RLS policies; drop their grants.
- Grep result of `from('lesson_progress')` / `from('learner_item_state')` / `from('learner_skill_state')` / `from('review_events')` / `from('capability_aliases')` / `from('item_context_grammar_patterns')` / `from('generated_exercise_candidates')` / `from('podcasts')` / `from('textbook_sources')` / `from('textbook_pages')` — every hit is updated or deleted.

### 2.4 Tests + health checks

- `make migrate-idempotent-check` — proves the DROPs are safe to re-run.
- `make check-supabase-deep` — should pass with the new EXPECTED_TABLES list.
- New HC11 in `check-supabase-deep.ts`: assert no row in `learner_capability_state` references a missing capability (sanity after CASCADE).
- Smoke: open `/leaderboard` and confirm the rewritten view returns the same row count + structure as today (data may differ — items_learned may go up for capability-era users; document the change).

### 2.5 Rollback

Restore via the rollback files already in `scripts/migrations/*.rollback.sql` (notably `2026-05-07-retire-source-progress.rollback.sql`). No data restoration possible (legacy-retained tables hold historical data that can be re-exported pre-drop if needed — recommend a one-off `pg_dump` of those three tables before the migration runs).

---

## §3. Old PR 2 (now part of new PR 1) — Slim `learner_capability_state` + `capability_review_events`

**Scope:** Drop redundant JSON columns. Pure storage cleanup.

### 3.1 Schema diff

```sql
alter table indonesian.learner_capability_state
  drop column if exists fsrs_state_json;

alter table indonesian.capability_review_events
  drop column if exists scheduler_snapshot_json,
  drop column if exists artifact_version_snapshot_json;

alter table indonesian.capability_review_events
  rename column answer_report_json to answer_report;
alter table indonesian.capability_review_events
  rename column state_before_json to state_before;
alter table indonesian.capability_review_events
  rename column state_after_json to state_after;
```

**Idempotency:** `alter column ... rename to` is not idempotent. Wrap in a `do $$ if exists ... then ... end if; $$` guard:

```sql
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='indonesian' and table_name='capability_review_events'
      and column_name='answer_report_json'
  ) then
    alter table indonesian.capability_review_events rename column answer_report_json to answer_report;
  end if;
  -- (same shape for state_before_json, state_after_json)
end $$;
```

### 3.2 Code paths that change

- `supabase/functions/commit-capability-answer-report/index.ts` — drop `scheduler_snapshot_json` + `artifact_version_snapshot_json` from the INSERT payload; rename writes to use the new column names. **Edge function deploy** required alongside the migration.
- The RPC `indonesian.commit_capability_answer_report` (`migration.sql:1205`) — same change inside the SQL function body.
- `src/lib/analytics/memory/adapter.ts` — switch any `fsrs_state_json->>'retrievability'` reads to a computed expression over (`stability`, `last_reviewed_at`, now()).
- Grep `fsrs_state_json` / `answer_report_json` / `state_before_json` / `state_after_json` / `scheduler_snapshot_json` / `artifact_version_snapshot_json` and update every hit.

### 3.3 Order of operations (avoid edge-function downtime)

1. Land the migration adding NEW columns (`answer_report`, etc.) as ALIASES (CREATE OR REPLACE VIEW or computed columns).
2. Deploy the new edge function that writes to the NEW columns.
3. Run a backfill: `update capability_review_events set answer_report = answer_report_json` (if needed).
4. Drop the OLD columns.

Simpler alternative for a single-user app with low write traffic: deploy edge function + migration in one PR, briefly accept that the few seconds between migration and function deploy may write to the wrong column name. Given the load (2 users, ~10 reviews/day), this is acceptable.

### 3.4 Tests + health checks

- `make migrate-idempotent-check`.
- Add `make pre-deploy` step: insert a synthetic review via the edge function and verify the row lands with the new column shape.
- The existing `capability_review_events` lock-in test in `__tests__/` (if exists) gets updated for the new shape.

### 3.5 Rollback

Re-add the dropped columns; backfill from the new ones (data shape is identical). Idempotent rollback file documented at `scripts/migrations/<date>-pr2-rollback.sql`.

---

## §4. Old PR 3 (now part of new PR 1) — Slim `learning_capabilities.metadata_json`

**Scope:** Drop dead fields; promote `prerequisite_keys` to a typed column.

### 4.1 Schema diff

```sql
alter table indonesian.learning_capabilities
  add column if not exists prerequisite_keys text[] not null default '{}';

-- Backfill from metadata_json.prerequisiteKeys
update indonesian.learning_capabilities
   set prerequisite_keys = coalesce(
     array(select jsonb_array_elements_text(metadata_json->'prerequisiteKeys')),
     '{}'::text[]
   )
 where prerequisite_keys = '{}'
   and metadata_json ? 'prerequisiteKeys';

alter table indonesian.learning_capabilities
  drop column if exists metadata_json,
  drop column if exists source_fingerprint,
  drop column if exists artifact_fingerprint;
```

### 4.2 Code paths that change

- `src/lib/capabilities/capabilityTypes.ts` — drop `metadata_json` from `LearningCapabilityRow`; drop `goalTags`/`requiredSourceProgress`/`requiredArtifacts`/`difficultyLevel`/`skillType` from `ProjectedCapability`; `prerequisiteKeys` survives (already present); remove the metadata wrapping in `capabilityCatalog.ts`.
- `src/lib/capabilities/capabilityCatalog.ts:30-44` — drop `sourceFingerprint`, `artifactFingerprint`, the helpers that compute them.
- `src/lib/capabilities/capabilityCatalog.ts:191,205` — affixed_form_pair caps currently emit `goalTags: ['morphology', 'meN-active']`. Drop the field (goal subsystem retired #4; grep confirmed no reader).
- `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts:81,96` — podcast caps emit `goalTags: ['podcast', ...]`. Drop similarly.
- `src/lib/session-builder/adapter.ts:138,154,176` and `pedagogy.ts:26` — drop the `goalTags` projection through `PlannerCapability` entirely (the field has no consumer downstream).
- `scripts/lib/pipeline/capability-stage/runner.ts:379` AND `scripts/lib/pipeline/capability-stage/adapter.ts:147` — **still actively emit `requiredSourceProgress: null` into metadata_json**. These must be removed in the same PR or the next publish run will fail (column doesn't exist).
- `scripts/lib/pipeline/capability-stage/adapter.ts` — upsert path drops the JSON column write.
- `src/lib/session-builder/pedagogy.ts` (the staging gate per ADR 0007) — reads `prerequisiteKeys`. Switch from `cap.metadata_json.prerequisiteKeys` to `cap.prerequisite_keys` typed column.
- `src/lib/session-builder/adapter.ts:138,154,176` — reads `metadata_json.goalTags` into `PlannerCapability.goalTags`. Drop (or rewire to `goal_tags` if promoted).
- **Staging-file cleanup (must land in same PR):** every `scripts/data/staging/lesson-N/capabilities.ts` carries `metadata_json` blocks per cap. Either regenerate via the pipeline (if the regen is deterministic and won't drift other staging files) or manually strip the dead fields. Without this, the staging files contain references to dropped columns and a publish attempt would fail.
- Grep `metadata_json` / `source_fingerprint` / `artifact_fingerprint` / `goalTags` / `requiredSourceProgress` everywhere; ~20-30 hits expected (catalog + projection + validation + tests + staging files).

### 4.3 Tests + health checks

- `make migrate-idempotent-check`.
- Existing `scripts/check-supabase-deep.ts` HC8 (lesson_id present) still passes.
- New `check-supabase-deep.ts` HC: assert no `prerequisite_keys[]` element references a missing canonical_key.

### 4.4 Rollback

Re-add the dropped columns; backfill `source_fingerprint = JSON.stringify({sourceKind: source_kind, sourceRef: source_ref})`; backfill `artifact_fingerprint = derived-from-contract`. Restoring `metadata_json` is straightforward — it was structurally uniform.

---

## §5. Old PR 4 (now part of new PR 1) — Slim `lessons` + introduce `lesson_speakers`

**Scope:** Drop dead columns; junction-ify `dialogue_voices`.

### 5.1 Schema diff

```sql
create table if not exists indonesian.lesson_speakers (
  lesson_id uuid not null references indonesian.lessons(id) on delete cascade,
  speaker text not null,
  voice_id text not null,
  primary key (lesson_id, speaker)
);

-- Backfill from lessons.dialogue_voices
insert into indonesian.lesson_speakers (lesson_id, speaker, voice_id)
select l.id, kv.key, kv.value::text
from indonesian.lessons l, jsonb_each_text(coalesce(l.dialogue_voices, '{}'::jsonb)) kv
on conflict (lesson_id, speaker) do nothing;

alter table indonesian.lessons
  drop column if exists dialogue_voices,
  drop column if exists duration_seconds,
  drop column if exists transcript_dutch,
  drop column if exists transcript_indonesian,
  drop column if exists transcript_english;

-- RLS + grants
alter table indonesian.lesson_speakers enable row level security;
drop policy if exists "lesson speakers authenticated read" on indonesian.lesson_speakers;
create policy "lesson speakers authenticated read"
  on indonesian.lesson_speakers for select to authenticated using (true);
grant select on indonesian.lesson_speakers to authenticated;
revoke insert, update, delete on indonesian.lesson_speakers from authenticated;
grant all on indonesian.lesson_speakers to service_role;
```

### 5.2 Code paths that change

- `scripts/lib/pipeline/lesson-stage/audio.ts` (or wherever `dialogue_voices` is consumed for TTS generation) — read from `lesson_speakers` instead.
- `scripts/check-supabase-deep.ts:309-315` (HC4 audio coverage parity for dialogue + vocab) — reads `lessons.dialogue_voices`; switch to JOIN on `lesson_speakers`.
- Grep `dialogue_voices` / `transcript_dutch` / `transcript_indonesian` / `transcript_english` / `duration_seconds` and remove every reference.

### 5.3 Tests + health checks

- `make migrate-idempotent-check`.
- Smoke: run TTS generation script (`scripts/generate-section-audio.ts`) for a lesson with multiple speakers; confirm `lesson_speakers` produces the same voice routing.

### 5.4 Rollback

Re-add the columns; backfill `dialogue_voices = jsonb_object_agg(speaker, voice_id) FROM lesson_speakers GROUP BY lesson_id`.

---

## §6. Old PR 5 (now part of new PR 2) — Typed dialogue satellites

**Scope:** The biggest schema split. Introduces `lesson_dialogue_lines`, `dialogue_clozes`, plus the section-side typed satellite.

### 6.1 Schema diff

```sql
create table if not exists indonesian.lesson_dialogue_lines (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references indonesian.lessons(id) on delete cascade,
  source_section_ref text not null,                             -- 'lesson-N/section-M'
  line_index integer not null,                                  -- 0-based
  source_line_ref text not null unique,                         -- 'lesson-N/section-M/line-K'
  text text not null,
  speaker text,
  translation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_section_ref, line_index)
);

create index if not exists lesson_dialogue_lines_lesson_idx
  on indonesian.lesson_dialogue_lines(lesson_id);

create table if not exists indonesian.dialogue_clozes (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null unique references indonesian.learning_capabilities(id) on delete cascade,
  dialogue_line_id uuid not null references indonesian.lesson_dialogue_lines(id) on delete cascade,
  sentence_with_blank text not null,                            -- the original sentence with '___' replacing the answer
  answer_text text not null,                                    -- what the learner types
  -- translation_text is derivable from dialogue_line_id → lesson_dialogue_lines.translation;
  -- omit unless the cloze's translation differs from the parent line's translation.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dialogue_clozes_capability_idx
  on indonesian.dialogue_clozes(capability_id);

-- RLS / grants (same pattern as content tables — authenticated SELECT only)
-- … (omitted for brevity; mirrors lesson_speakers shape above)
```

### 6.2 Data backfill

Two steps. First populate `lesson_dialogue_lines` from `lesson_sections.content.lines[]`:

```sql
insert into indonesian.lesson_dialogue_lines
  (lesson_id, source_section_ref, line_index, source_line_ref, text, speaker, translation)
select
  ls.lesson_id,
  format('lesson-%s/section-%s', l.order_index, ls.order_index) as source_section_ref,
  (line.idx - 1) as line_index,
  format('lesson-%s/section-%s/line-%s', l.order_index, ls.order_index, line.idx) as source_line_ref,
  line.value->>'text',
  line.value->>'speaker',
  line.value->>'translation'
from indonesian.lesson_sections ls
join indonesian.lessons l on l.id = ls.lesson_id
cross join lateral jsonb_array_elements(ls.content->'lines') with ordinality as line(value, idx)
where ls.content->>'type' = 'dialogue'
on conflict (source_line_ref) do nothing;
```

Then populate `dialogue_clozes` from `capability_artifacts` rows of the 3 dialogue-cloze kinds:

```sql
insert into indonesian.dialogue_clozes
  (capability_id, dialogue_line_id, sentence_with_blank, answer_text)
select
  c.id,
  dl.id,
  (cc.artifact_json->>'source_text'),
  (ca.artifact_json->>'value')
from indonesian.learning_capabilities c
join indonesian.capability_artifacts cc
  on cc.capability_id = c.id and cc.artifact_kind = 'cloze_context'
join indonesian.capability_artifacts ca
  on ca.capability_id = c.id and ca.artifact_kind = 'cloze_answer'
join indonesian.lesson_dialogue_lines dl
  on dl.source_line_ref = c.source_ref
where c.source_kind = 'dialogue_line'
on conflict (capability_id) do nothing;
```

### 6.3 Code paths that change

- `src/lib/exercise-content/byKind/dialogueLine.ts` — replace the 3-artifact-fetch with a single JOIN: `select dc.sentence_with_blank, dc.answer_text, dl.text, dl.speaker, dl.translation from dialogue_clozes dc join lesson_dialogue_lines dl on dl.id = dc.dialogue_line_id where dc.capability_id in (...)`.
- `scripts/lib/pipeline/capability-stage/projectors/dialogueArtifacts.ts` — switch from writing 3 capability_artifacts rows to writing 1 `dialogue_clozes` row. Also writes the `lesson_dialogue_lines` rows (or relies on lesson-stage to write them).
- `scripts/lib/pipeline/lesson-stage/runner.ts` — adds the `lesson_dialogue_lines` write path as part of the lesson stage (Stage A writes lesson dialogue lines as typed rows, replacing the JSON inside `lesson_sections.content.lines[]`).
- `scripts/lib/pipeline/capability-stage/propagateDialogueTranslations.ts` — switches from reading `lesson_sections.content.lines[]` to reading `lesson_dialogue_lines`.
- Per-lesson `Page.tsx` files that render dialogues — keep them reading `lesson_sections.content.lines[]` for now (they get rewritten in PR 11).

### 6.4 Tests + health checks

- `make migrate-idempotent-check`.
- New HC: `select count(*) from indonesian.lesson_dialogue_lines` should equal the sum of `jsonb_array_length(content->'lines')` across `lesson_sections WHERE content->>'type'='dialogue'`. Catches missing backfill rows.
- New HC: `select count(*) from indonesian.dialogue_clozes` should equal the count of `learning_capabilities WHERE source_kind='dialogue_line'`. Catches orphaned dialogue caps.
- Smoke: run a real session with a `dialogue_line` cap; verify it renders.

### 6.5 Rollback

Drop the new tables; restore old read path in `byKind/dialogueLine.ts`. `capability_artifacts` rows aren't dropped in this PR (that's PR 9), so the runtime can fall back.

---

## §7. Old PR 6 (now part of new PR 2) — Typed `affixed_form_pairs` table

**Scope:** Replace 2 `capability_artifacts` rows per pair (root_derived_pair + allomorph_rule) with 1 typed row.

### 7.1 Schema diff

```sql
create table if not exists indonesian.affixed_form_pairs (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references indonesian.lessons(id) on delete cascade,
  source_ref text not null unique,                              -- 'lesson-N/morphology/<slug>'
  root_text text not null,
  derived_text text not null,
  allomorph_rule text not null,
  pattern_source_ref text references indonesian.grammar_patterns(slug),  -- nullable; current data has it set
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affixed_form_pairs_lesson_idx
  on indonesian.affixed_form_pairs(lesson_id);

-- RLS / grants — same pattern as lesson_speakers
```

### 7.2 Backfill

```sql
-- Pull from capability_artifacts of the two relevant kinds. Today there are
-- only 4 cap rows (2 pairs × 2 caps each); the backfill is ~2 rows.
insert into indonesian.affixed_form_pairs
  (lesson_id, source_ref, root_text, derived_text, allomorph_rule, pattern_source_ref)
select distinct on (c.source_ref)
  c.lesson_id,
  c.source_ref,
  (rdp.artifact_json->>'root'),
  (rdp.artifact_json->>'derived'),
  (ar.artifact_json->>'rule'),
  null  -- pattern_source_ref left null in backfill; pipeline will populate going forward
from indonesian.learning_capabilities c
join indonesian.capability_artifacts rdp
  on rdp.capability_id = c.id and rdp.artifact_kind = 'root_derived_pair'
join indonesian.capability_artifacts ar
  on ar.capability_id = c.id and ar.artifact_kind = 'allomorph_rule'
where c.source_kind = 'affixed_form_pair'
on conflict (source_ref) do nothing;
```

### 7.3 Code paths that change

- `src/lib/exercise-content/byKind/affixedFormPair.ts` — switch from fetching artifacts to a single SELECT on `affixed_form_pairs WHERE source_ref IN (...)`.
- `scripts/lib/pipeline/capability-stage/projectors/morphology.ts` — write 1 `affixed_form_pairs` row instead of 2 capability_artifacts rows per pair.
- `src/lib/capabilities/renderContracts.ts:69-77` — the `typed_recall` contract's `requiredArtifacts.affixed_form_pair` becomes a virtual check ("the affixed_form_pairs row exists") rather than `['root_derived_pair', 'allomorph_rule']`.

### 7.4 Tests + health checks

- Smoke: run a real session with an `affixed_form_pair` cap; verify it renders (this is the "next pilot" per the gap doc, so the renderer is the focus).
- HC: every `learning_capabilities.source_kind='affixed_form_pair'` row has a matching `affixed_form_pairs.source_ref`.

### 7.5 Rollback

Drop `affixed_form_pairs`; restore old reader. The 2 capability_artifacts rows aren't dropped until PR 9.

---

## §8. Old PR 7 (now part of new PR 2) — Typed `grammar_pattern_examples` + readiness refactor

**Scope:** The last remaining structured artifact replacement; refactor `validateCapability` to derive readiness from upstream tables instead of `capability_artifacts`.

### 8.1 Schema diff

```sql
create table if not exists indonesian.grammar_pattern_examples (
  id uuid primary key default gen_random_uuid(),
  grammar_pattern_id uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id uuid not null references indonesian.lessons(id) on delete restrict,
  display_order integer not null,
  example_text text not null,
  created_at timestamptz not null default now(),
  unique(grammar_pattern_id, display_order)
);
```

### 8.2 Backfill

```sql
-- Today each pattern has exactly one capability_artifacts(kind='pattern_example') row.
-- The example_text lives in artifact_json.value.
insert into indonesian.grammar_pattern_examples
  (grammar_pattern_id, lesson_id, display_order, example_text)
select distinct on (gp.id)
  gp.id,
  gp.introduced_by_lesson_id,
  0,
  (ca.artifact_json->>'value')
from indonesian.grammar_patterns gp
join indonesian.learning_capabilities c
  on c.source_kind = 'pattern' and c.source_ref = format('lesson-N/pattern-%s', gp.slug)
join indonesian.capability_artifacts ca
  on ca.capability_id = c.id and ca.artifact_kind = 'pattern_example'
on conflict (grammar_pattern_id, display_order) do nothing;
```

### 8.3 Readiness refactor

`src/lib/capabilities/capabilityContracts.ts:52-141` (`validateCapability`) gets restructured:

- **Today:** consults `ArtifactIndex` (built from `capability_artifacts`) + `RENDER_CONTRACTS.requiredArtifacts` to decide readiness.
- **Target:** consults per-source-kind readiness adapters (typed-table existence checks):
  - For `item`: required upstream rows in `learning_items` + `item_meanings` + (for productive) `item_answer_variants` + (for audio caps) `audio_clips`.
  - For `pattern`: required rows in `grammar_pattern_examples`.
  - For `dialogue_line`: required row in `dialogue_clozes`.
  - For `affixed_form_pair`: required row in `affixed_form_pairs`.

This is the biggest API change in the entire migration. The pipeline-side `validateCapabilities` (used by `materialize-capabilities.ts`, `check-capability-health.ts`, `promote-capabilities.ts`) needs the corresponding adapter API.

**Implementation approach:** add `readinessAdapter` interface to `lib/capabilities/`:

```ts
export interface ReadinessAdapter {
  hasItemReadiness(itemKey: string, contract: ContractItemReqs): Promise<boolean>
  hasPatternReadiness(patternId: string, contract: ContractPatternReqs): Promise<boolean>
  hasDialogueLineReadiness(sourceRef: string, contract: ContractDialogueLineReqs): Promise<boolean>
  hasAffixedFormPairReadiness(sourceRef: string, contract: ContractAffixedFormPairReqs): Promise<boolean>
}
```

The pipeline adapter implements via SQL (the queries from §5 in the target doc). Runtime uses the existing already-loaded data (it's already JOINing for the byKind fetchers).

### 8.4 Tests + health checks

- Existing readiness tests in `src/lib/capabilities/__tests__/` get rewritten to use the new adapter.
- HC: `validateCapability` over every cap should produce the same readiness verdict pre- and post-migration (a one-off comparator script proves the refactor is behaviour-neutral).

---

## §9. Old PR 8 (now new PR 3) — Routing fix: split `exercise_variants` into typed tables

**Scope:** The biggest pure-additive change to the runtime feature surface. This is where the orphan grammar-exercise data becomes live.

### 9.1 Schema diff

Four new tables (DDL from `2026-05-21-data-model-target.md` §Decision B). All FK to `grammar_patterns(id)` with `lesson_id` denormalised.

### 9.2 Backfill

```sql
-- Split each row of exercise_variants into the typed table matching its exercise_type.

insert into indonesian.contrast_pair_exercises
  (id, grammar_pattern_id, lesson_id, prompt_text, target_meaning, options, correct_option_id, explanation_text, is_active, source_candidate_id, created_at, updated_at)
select
  id, grammar_pattern_id, lesson_id,
  payload_json->>'promptText',
  payload_json->>'targetMeaning',
  payload_json->'options',
  payload_json->>'correctOptionId',
  payload_json->>'explanationText',
  is_active, source_candidate_id, created_at, updated_at
from indonesian.exercise_variants
where exercise_type = 'contrast_pair'
on conflict (id) do nothing;

-- (similar INSERT...SELECT for sentence_transformation, constrained_translation, cloze_mcq)
```

### 9.3 Code paths that change

- `src/lib/capabilities/renderContracts.ts:54-127` — update `capabilityTypes` arrays:
  - `contrast_pair`: `[]` → `['pattern_contrast']`
  - `sentence_transformation`: `[]` → `['pattern_recognition']`
  - `constrained_translation`: `[]` → `['pattern_recognition']`
  - `cloze_mcq`: keep `['contextual_cloze']` AND add `'pattern_recognition'`
  - All four widen `supportedSourceKinds` to include `'pattern'`.
  - `requiredArtifacts` updated to reference the per-exercise satellite tables instead of `'exercise_variant'` artifact.
- `src/lib/exercise-content/byKind/pattern.ts` (NEW FILE) — fetcher for `pattern` source kind. Reads from the appropriate typed exercise table.
- `src/lib/exercise-content/adapter.ts` — add `pattern` bucket; wire `fetchForPatternBlocks` into the per-bucket Promise.all (line ~331-335).
- `src/lib/exercise-content/byType/{contrastPair,sentenceTransformation,constrainedTranslation,clozeMcq}.ts` — switch from reading `input.variant.payload_json.X` to reading the typed columns from the new input shape.
- `scripts/lib/pipeline/capability-stage/projectors/grammar.ts` — same emit logic (pattern caps), but readiness now passes (the grammar exercise table has rows).
- `scripts/publish-grammar-candidates.ts` — write to the 4 typed tables instead of `exercise_variants`.
- The exercise-pipeline agent (`.claude/agents/grammar-exercise-creator.md`) — update prompt to emit the new shape.

### 9.4 Tests + health checks

- Capstone integration test for each of the 4 new exercise types (running through buildSession + resolveBlock for a pattern cap).
- Live-session verification (per `feedback_answer_log_check.md`): run a real session targeting grammar exercises; query `capability_review_events` after to confirm `(pattern, pattern_recognition)` / `(pattern, pattern_contrast)` rows appear.

### 9.5 Risk + rollback

**HIGH risk:** First time the orphan data goes live; user-visible behaviour changes. Mitigation:

- Schema change is purely additive (new tables don't break existing readers).
- Runtime changes can be feature-flagged via `exercise_type_availability.session_enabled`: set the 4 grammar types to `session_enabled=false` initially, then flip after manual verification.
- Rollback: drop the new tables; revert `renderContracts.ts`.

---

## §10. Old PR 9 (now part of new PR 2) — Retire `capability_artifacts`

**Scope:** Drop the artifact table once every reader path has been moved.

### 10.1 Pre-checks

Before dropping, **every** reader path must be using the typed-table-readiness API. There are TWO independent readers of `capability_artifacts`:

**Runtime resolver path:**
- `src/lib/exercise-content/adapter.ts:291-303` (`fetchArtifacts`) — must be unused.
- `src/lib/exercise-content/byKind/item.ts:111` — must read upstream tables directly (PR 7 should have done this).
- `src/lib/exercise-content/byKind/dialogueLine.ts` — must use `dialogue_clozes` (PR 5).
- `src/lib/exercise-content/byKind/affixedFormPair.ts` — must use `affixed_form_pairs` (PR 6).
- `src/lib/capabilities/artifactRegistry.ts` (`hasApprovedArtifact`) — usage must be unused or rewritten.

**Planner path** (separate from the resolver; failing to migrate this bricks `buildSession`):
- `src/lib/session-builder/adapter.ts:282-289` — pulls `capability_artifacts` via `chunkedIn` and builds an `artifactIndex` consumed by `validateCapability` at line 303. **The PR 7 (readiness refactor) MUST include this reader.** Without it, post-PR-9 the planner's `validateCapability` call returns `{status:'unknown'}` for every cap and `buildSession` returns zero ready capabilities.

Grep `capability_artifacts` everywhere — every hit must be either in deleted code, in a migration history file, or in the migration plan itself.

### 10.2 Audio-clip artifact migration (W4 of architect review)

Today `capability_artifacts.artifact_kind='audio_clip'` (1,280 rows) carries `{storagePath, voiceId}` per cap. Two listener exercises (`listening_mcq`, `dictation`) read this via `artifactsByKind.get('audio_clip')` in their byType packagers.

**Decision (must finalise before PR 9):** Replace via one of:

| Option | Schema cost | Trade-off |
|---|---|---|
| (a) `capability_audio_refs(capability_id, audio_clip_id, voice_id)` | 1 new table + FK to `audio_clips(id)` | One JOIN per audio cap; clean FK; ~1,280 backfill rows |
| (b) Re-derive: JOIN `learning_items.normalized_text` ↔ `audio_clips.text_content` for the cap's voice | No new table | Couples audio resolution to slug equality; brittle if base_text changes |
| (c) Add `audio_clip_id uuid` directly on `learner_capability_state` rows that are audio caps | Column on existing table | Awkward (only audio caps need it); contaminates the FSRS table with content shape |

**Recommendation: (a).** Mirrors the `dialogue_clozes` / `affixed_form_pairs` pattern from PR 5/6. Add a "PR 8.5" between PR 7 and PR 9: create `capability_audio_refs`, backfill from `capability_artifacts WHERE artifact_kind='audio_clip'`, switch `byKind/item.ts` audio reads to the new table.

Until this is done, **PR 9 cannot drop `capability_artifacts`**.

### 10.2 Schema diff

```sql
drop table if exists indonesian.capability_artifacts cascade;
```

### 10.3 Code paths that change

- `src/lib/capabilities/artifactRegistry.ts` — delete entirely or repurpose.
- `src/lib/capabilities/capabilityTypes.ts:73-95` — `ArtifactKind` type union becomes unused; either retire or shrink to the kinds still meaningful (audio_clip → for audio_clips FK semantics, maybe).
- `scripts/lib/pipeline/capability-stage/projectors/{vocab,grammar,morphology,dialogueArtifacts}.ts` — drop the artifact-write paths (they've already been replaced in PR 5-8).
- `scripts/check-capability-health.ts` — drop artifact-level checks; replace with typed-readiness checks.

### 10.4 Risk + rollback

MEDIUM. The `drop table` step is irreversible. Rollback would require restoring from `pg_dump` + reverting all PR 5-8 code changes.

Mitigation under the no-soak strategy: the schema change + the reader switch + the drop ship atomically in the same PR (new PR 2). The risk is therefore "did the readers actually switch before the drop landed?" — verifiable via `grep capability_artifacts` returning only deleted code, migration history, or this plan. No production soak; the verification is a single grep + smoke test before merge.

---

## §11. Old PR 10 (now new PR 4) — Replace `lesson_page_blocks` with typed satellites

**Scope:** Lesson reader rewrite. HIGH risk due to user-visible UI change.

### 11.1 Schema diff

Eight new tables (per `2026-05-21-data-model-target.md` §Decision C): `lesson_blocks`, `lesson_block_hero`, `lesson_block_recap`, `lesson_block_practice_bridge`, `lesson_block_reading_section`, `lesson_block_vocab_strip`, `lesson_block_dialogue_card`.

### 11.2 Backfill

One row of `lesson_blocks` per `lesson_page_blocks` row; one row of the matching satellite per `block_kind`. Backfill scripts pull the shape-specific keys out of `payload_json`.

For `reading_section`, the backfill needs to classify the 7 sub-shapes into the `reading_kind` enum. The 5 `reading_section` rows that have an `items` shape are reclassified to `vocab_strip` parent block_kind (they functionally are vocab strips that landed under the reading_section umbrella) — this happens in the parent-row backfill, not the satellite. So the satellite reading_kind enum stays bounded:

```sql
insert into indonesian.lesson_block_reading_section
  (block_id, title, reading_kind, intro, paragraphs, sentences, categories, letters, grammar_reference)
select
  lb.id,
  pb.payload_json->>'title',
  case
    when pb.payload_json ? 'categories' and (pb.payload_json ? 'columns' or pb.payload_json ? 'tableTitle') then 'grammar_reference'
    when pb.payload_json ? 'categories' then 'categories'
    when pb.payload_json ? 'paragraphs' then 'paragraphs'
    when pb.payload_json ? 'sentences' then 'sentences'
    when pb.payload_json ? 'letters' then 'letters'
    -- The 5 'items'-shaped rows are handled at the parent level (re-classified
    -- to block_kind='vocab_strip'). They never reach this branch.
    else 'intro_only'
  end as reading_kind,
  pb.payload_json->>'intro',
  case when pb.payload_json ? 'paragraphs' then array(select jsonb_array_elements_text(pb.payload_json->'paragraphs')) else null end,
  case when pb.payload_json ? 'sentences' then pb.payload_json->'sentences' else null end,
  case when pb.payload_json ? 'categories' then pb.payload_json->'categories' else null end,
  case when pb.payload_json ? 'letters' then pb.payload_json->'letters' else null end,
  case when (pb.payload_json ? 'columns' or pb.payload_json ? 'tableTitle' or pb.payload_json ? 'footnotes')
       then pb.payload_json else null end
from indonesian.lesson_page_blocks pb
join indonesian.lesson_blocks lb on lb.source_ref = pb.source_ref and lb.display_order = pb.display_order
where pb.block_kind = 'reading_section';
```

### 11.3 Code paths that change

- `src/components/lessons/LessonReader.tsx` and `blocks/LessonBlockRenderer.tsx` — rewrite to dispatch on `block_kind` and JOIN to the typed satellite.
- `src/lib/lessons/lessonExperience.ts` — rewrite `buildLessonExperience` to consume the typed satellite rows.
- `src/services/coverageService.ts:39-58` — switch from reading `lesson_sections.content.type` to reading `lesson_blocks.block_kind`.
- `scripts/lib/pipeline/lesson-stage/runner.ts` — write the typed satellite rows (drop the JSON write path).
- Per-lesson `Page.tsx` files (currently WIP) — these can simplify since the typed shape is in the DB.

### 11.4 Tests + health checks

- Open every lesson in dev; visually compare against pre-migration.
- Unit tests for each block-kind renderer in `src/components/lessons/blocks/__tests__/`.
- HC: count(*) matches across lesson_page_blocks ↔ (lesson_blocks JOIN satellites).

### 11.5 Risk + rollback

HIGH. Under no-soak: the renderer rewrite + the schema change + the drop ship atomically. Pre-merge gate: visual smoke against every lesson reader on dev. Post-merge: monitor `error_logs` for `LessonReader` errors for the first session; rollback by reverting the PR + re-running migrate (idempotent restoration of the old table from the pg_dump archive — which means archiving `lesson_page_blocks` before PR 4 runs, parallel to the PR 1 legacy-retained archive).

---

## §12. Old PR 11 (now new PR 5) — Replace `lesson_sections.content` with typed satellites

**Scope:** Authoring-side and admin-side migration. The pipeline reads from staging TS files and writes typed satellites instead of the JSON content column.

### 12.1 Schema diff

The full set of satellites from `2026-05-21-data-model-target.md` §Decision D, plus the slim `lesson_sections` header.

### 12.2 Backfill

Per `content.type` discriminator, split each `lesson_sections.content` blob into the matching satellite row(s). Each section type maps:
- `text` → `lesson_section_reading.intro` + `lesson_section_reading.paragraphs`
- `vocabulary` / `expressions` / `numbers` → `lesson_section_items` + `lesson_section_item_rows`
- `dialogue` → `lesson_section_dialogue` + `lesson_dialogue_lines` (already populated in PR 5; this PR adds the parent header row)
- `grammar` → `lesson_section_grammar` + `lesson_section_grammar_categories` + `lesson_section_grammar_topics`
- `pronunciation` → `lesson_section_pronunciation` + `lesson_section_pronunciation_letters`
- `reference_table` → `lesson_section_reference` (with the bespoke JSON kept as a documented one-off)
- `exercises` → `lesson_section_exercise_groups`
- `culture` → `lesson_section_reading` with `section_kind='culture'`

### 12.3 Code paths that change

- `src/lib/lessons/adapter.ts:194,205` — switch from `select *, lesson_sections(*)` to a multi-JOIN over the typed satellites.
- `src/lib/lessons/adapter.ts:172-189` (extractLessonGrammarTopics) — read from `lesson_section_grammar_topics` directly.
- `src/services/coverageService.ts` — read from typed satellites.
- Per-lesson `src/pages/lessons/lesson-{4,5,6,7,8,9}/Page.tsx` — rewrite to read typed satellite rows.
- `scripts/lib/pipeline/lesson-stage/runner.ts` — write typed satellites; drop `content` JSON column write.
- `scripts/data/lessons.ts` (the authoring source) — refactor to emit typed rows (or keep as TS source but have the pipeline write typed rows downstream).

### 12.4 Risk + rollback

HIGH (largest reader surface). Under no-soak: rewrite all consumers + drop the `content` column in the same PR. Pre-merge: archive `lesson_sections` (`pg_dump --table=indonesian.lesson_sections`) so a revert is non-destructive. Visual smoke on every lesson reader on dev + the `coverageService` admin page.

---

## §13. Cross-cutting concerns

### 13.1 Migration idempotency

Every PR's migration block must pass `make migrate-idempotent-check`:

- Schema changes use `if exists` / `if not exists` guards.
- Backfills use `on conflict do nothing` or are gated by a guard on a sentinel column.
- Column renames use `do $$ if exists ... then ... end $$` blocks.

### 13.2 Migration source-of-truth (CLAUDE.md rule)

All schema changes land in `scripts/migration.sql`. Files in `scripts/migrations/*.sql` are paper-trail audit logs ONLY. The per-PR migration block accumulates into `scripts/migration.sql`; rollback `.sql` files go in `scripts/migrations/` for reference.

### 13.3 Health checks added per PR

Each PR adds at least one HC to `scripts/check-supabase-deep.ts`. Examples already named per PR:
- PR 5: dialogue_clozes count parity
- PR 6: affixed_form_pairs source_ref parity
- PR 7: readiness adapter output stability (one-off compare)
- PR 8: live-session smoke for grammar exercises

### 13.5 End-to-end testing per PR

Every PR ships with its own E2E spec extension. The Playwright suite at `e2e/*.spec.ts` is the harness; each PR adds or extends a spec to cover the migrated surface. The spec must include both the user-visible interaction AND a post-session query against `capability_review_events` confirming the new rendering path actually emitted answer rows for the migrated `(source_kind, capability_type)` tuple.

Per-PR E2E breakdown:

| PR | E2E spec | Surface tested | Post-session assertion |
|---|---|---|---|
| 1 | Existing `session.spec.ts` + `lesson-reader.spec.ts` unchanged behaviour | Login → lessons → session → answer; lesson reader renders | Same answer counts as pre-migration. No regressions. |
| 2 | `session.spec.ts` extended: drive a session with item-source caps; assert at least one `text_recognition` + one `dictation` cap renders + can be answered | item source kind end-to-end | `cre WHERE source_kind='item' AND capability_type IN ('text_recognition','meaning_recall','dictation','audio_recognition','l1_to_id_choice','form_recall')` shows new rows |
| 3 | NEW `e2e/dialogue-cloze.spec.ts`: activate L9, start a session, force a `cloze` exercise on a dialogue_line cap, type the answer, submit | `dialogue_line` source kind via typed `cloze` | `cre WHERE source_kind='dialogue_line' AND capability_type='contextual_cloze'` shows ≥ 1 new row (today this query returns zero historically — first-time feature smoke) |
| 4 | NEW `e2e/affixed-form-pair.spec.ts`: activate L9, drive a session, force a `typed_recall` on a `root_derived_*` cap | `affixed_form_pair` source kind via `typed_recall` | `cre WHERE source_kind='affixed_form_pair' AND capability_type IN ('root_derived_recognition','root_derived_recall')` shows ≥ 1 new row |
| 5 | NEW `e2e/grammar-exercises.spec.ts`: 4 sub-tests, one per exercise type (`contrast_pair`, `sentence_transformation`, `constrained_translation`, `cloze_mcq`); each drives a session, answers a pattern-source cap | `pattern` source kind via 4 grammar exercise types | `cre WHERE source_kind='pattern' AND capability_type IN ('pattern_recognition','pattern_contrast')` shows ≥ 4 new rows (one per exercise type). **First-ever rendering of pattern caps for any user.** |
| 6 | n/a (placeholder) | n/a | n/a |
| 7 | Existing `session.spec.ts` + `lesson-reader.spec.ts` unchanged behaviour | All source kinds still resolve after artifact-table drop | No new `capability_resolution_failure_events` rows for the dropped table |
| 8 | `lesson-reader.spec.ts` extended: assert every block kind renders (`lesson_hero`, `reading_section`, `vocab_strip`, `dialogue_card`, `practice_bridge`, `lesson_recap`). Add visual snapshot per kind | `lesson_blocks` typed satellites end-to-end | Every lesson reads correctly; no console errors |
| 9 | `lesson-reader.spec.ts` extended further: assert every section kind renders (`reading`, `vocabulary`, `expressions`, `numbers`, `dialogue`, `grammar`, `pronunciation`, `reference`, `exercises`, `culture`). Plus admin coverage page renders correctly | `lesson_section_*` typed satellites end-to-end | All section types visible on the relevant per-lesson page (`Lesson.tsx` + per-lesson `Page.tsx`) |

**Test user:** the existing test user (per memory `reference_test_user.md`) — `testuser@duin.home` / `TestUser123!` — drives the E2E sessions. PR 1's pre-migration `pg_dump` includes this user's `learner_capability_state` rows so they can be restored on rollback.

**Spec authoring policy:** each per-capability PR (2-5) writes its E2E spec FIRST (before the schema/pipeline changes), confirms the spec FAILS against the current schema (proving it tests the migrated surface), then ships the migration code that makes it pass. This is a TDD-style guard against the failure mode `feedback_answer_log_check.md` documents: claiming a feature renders when it doesn't.

**How each E2E spec forces the migrated cap into a session** ("artificial activation" — the user's term in the 2026-05-21 direction):

Each spec drives the test user through these steps to guarantee the migrated cap renders:

```ts
// e2e/<pr>-<source_kind>.spec.ts pattern

// 1. Log in as the test user (per memory reference_test_user.md).
await page.goto('/login')
await page.getByLabel('Email').fill('testuser@duin.home')
await page.getByLabel('Password').fill('TestUser123!')
await page.getByRole('button', { name: /log in/i }).click()

// 2. Activate the lesson that owns the target source_kind.
//    - Item caps: any lesson (every lesson has item caps); use L1.
//    - dialogue_line caps: L9 only (7 caps).
//    - affixed_form_pair caps: L9 only (4 caps).
//    - pattern caps: any lesson with grammar patterns (L1-L9 all have some).
await page.goto('/lessons/<lesson-uuid>')
await page.getByRole('checkbox', { name: /activate/i }).check()

// 3. Start a session in 'lesson_practice' mode — this forces session-builder
//    to draw caps from that lesson's pool, not from cross-lesson due-list.
//    See src/lib/session-builder/builder.ts for the lesson_practice scope.
await page.goto('/session?lesson=<lesson-uuid>&mode=lesson_practice')

// 4. Iterate cards until the target exercise type renders. The page's
//    [data-exercise-type] attribute (or equivalent) identifies the rendered
//    type. If the type doesn't appear within N cards, the test fails.
const MAX_CARDS_TO_SCAN = 30
let foundTarget = false
for (let i = 0; i < MAX_CARDS_TO_SCAN; i++) {
  const exerciseType = await page.locator('[data-exercise-type]').getAttribute('data-exercise-type')
  if (exerciseType === '<target_exercise_type>') {
    foundTarget = true
    break
  }
  // Submit a no-op / wrong answer to advance.
  await advanceToNextCard(page)
}
expect(foundTarget).toBe(true)

// 5. Submit a real answer to produce a capability_review_events row.
await submitAnswer(page, '<correct-or-wrong>')

// 6. Post-session: query capability_review_events to confirm the row landed
//    for the migrated (source_kind, capability_type) tuple. This is the
//    feedback_answer_log_check.md gate.
const { data } = await sb.schema('indonesian')
  .from('capability_review_events')
  .select('capability_id, learning_capabilities!inner(source_kind, capability_type)')
  .eq('user_id', '<test-user-uuid>')
  .gte('created_at', '<test-start-iso>')
expect(data.some(r => r.learning_capabilities.source_kind === '<target_source_kind>')).toBe(true)
```

**Alternative if the natural card-walk is too slow / flaky:** add a dev-only query param `?force_capability=<canonical_key>` to `/session` that bypasses the session-builder and renders a specific cap. Wire it behind `import.meta.env.DEV` so it never reaches production. Use this for the per-PR E2E spec; the production code path is unchanged. This is a one-time test-affordance, not part of the runtime contract.

**When the spec is genuinely impossible** (e.g. the cap can't appear because no test-user `learner_capability_state` row exists for the brand-new cap kind): PR 5's `pattern` source kind is the only case where this matters today. Seed a state row for the test user in PR 1's `pg_dump` restore step OR programmatically activate the cap before the E2E run via a service-key migration in the spec's `beforeAll`. Document the chosen approach in the spec file's header comment.

**Gate failure handling:** if any of the four gate checks fails (idempotent-check, pre-deploy, playwright, answer-log), the PR does not merge. Rollback is a revert of the PR commit + `make migrate` (idempotent — re-runs the previous schema).

### 13.4 No soak windows

Per user direction (2026-05-21): no soak windows; PRs ship back-to-back. Each PR is atomic — the schema change, reader switch, writer switch, and old-table drop all land in the same commit. The runtime never sees an inconsistent state because the migration script and the code change deploy together.

The pre-PR-1 backup is the only "wait" in the sequence: `pg_dump --table=indonesian.learner_item_state --table=indonesian.learner_skill_state --table=indonesian.review_events` to `learning-indonesian-archive/legacy-state-2026-05-21.sql.gz` BEFORE PR 1 runs. This is a one-time archive operation, not a soak. After it lands, PR 1 drops those tables in the same change.

**Order of ops per PR (revised for repopulate):**
1. Update `scripts/migration.sql` with the schema change (CREATE new tables + slim/ALTER existing + DROP old).
2. Update `supabase/functions/commit-capability-answer-report` (PR 1 only — for column renames).
3. Update runtime code that reads the changed shape.
4. Update pipeline writer code (`scripts/lib/pipeline/*-stage/*.ts`) to emit the new typed tables.
5. Update staging files (and any subagent prompts) that carry shape the pipeline now writes differently. For derived staging files (`capabilities.ts`, `content-units.ts`, `exercise-assets.ts`, `lesson-page-blocks.ts`), the pipeline regenerates them — no manual edit needed.
6. Run `make migrate-idempotent-check` + `make pre-deploy`.
7. Run `make migrate` to apply the schema (homelab).
8. Re-publish every affected lesson: `for i in {1..9}; do bun scripts/publish-approved-content.ts $i; done`. The pipeline writes the new tables; the old tables (if not yet dropped) become stale or get DROPPED in step 1.
9. Visual smoke (lesson reader + a real session). Confirm via `select count(*) from <new_table>` that the publish populated rows as expected.

This is feasible at single-user scale. It would not be at multi-tenant scale; if the app grows users, future migrations need the soak/dual-write pattern. Documented for the next contributor.

### 13.5 Pre-deploy gauntlet per PR

Per CLAUDE.md: `make pre-deploy` (lint + test + build + `check-supabase` + `check-supabase-deep`) is the gate. Each PR must pass it on the local machine before merging.

### 13.6 Service role / RPC / edge function coordination

Two PRs touch the edge function (`commit-capability-answer-report`):
- PR 2 (column renames in `capability_review_events`)

The edge function is deployed via `supabase functions deploy commit-capability-answer-report` — separate from `make migrate`. Deploy order: migration first, edge function second. The few seconds between is acceptable given current load.

### 13.7 Single-user assumption

The plan assumes:
- Single admin (Albert) approves and runs migrations.
- 2 active users (Albert + 1 tester) confirmed by `capability_review_events.user_id` distinct count.
- Low write volume (~10 reviews/day).

If user base grows, individual PR steps may need staged rollouts (e.g. feature flags) — but the current plan is sized for the current load.

---

## §14. Open questions for design review

These are decisions the user / architect must weigh in on before any PR ships:

1. **`item_contexts.context_type` audit.** The `vocabulary_list` and `lesson_snippet` types have 515 + 60 rows. Grep before PR 2 to confirm whether they're consumed at runtime; drop if not.

2. **Audio orphans.** `audio_clips` has 1,334 unreferenced storage paths (investigation §3.11). Either include a cleanup `DELETE FROM audio_clips WHERE id NOT IN (SELECT audio_clip_id FROM capability_audio_refs)` in PR 2's last step, or defer to a separate audio-storage hygiene pass. Recommendation: include in PR 2.

3. **Coordination with staging-file regeneration.** The pipeline regenerates `scripts/data/staging/lesson-N/{capabilities,content-units,exercise-assets,lesson-page-blocks}.ts` from canonical inputs (CLAUDE.md:281). Under the §1.1 repopulate strategy this is the central mechanism — each PR rewrites the pipeline writers and re-publishes, which regenerates these derived files automatically. The canonical staging files (`learning-items.ts`, `grammar-patterns.ts`, `morphology-patterns.ts`) need updating only if their shape changes (mostly they don't; the pipeline reads them as-is).

4. **Should this migration coincide with the `2026-05-18-fold-lib-lessons` plan?** That plan folds `lessonService` into `lib/lessons/`. The two interact (this migration changes what `lib/lessons/` reads). Sequencing: PR 4/5 of this migration touch the same code surface. Recommend: lib-lessons fold first (it's already an `approved` plan), then PR 4 of this migration builds on the folded shape.

5. **Speaking exercise activation.** Decision G2 of the target doc keeps `speaking_exercises` un-built — `speaking` has `capabilityTypes: []` and no cap routes to it. If speaking becomes a real exercise type during this work, it gets a typed `speaking_exercises` table following the Decision G pattern. Not in scope of the 5-PR sequence.

6. **`exercise_type_availability` for `meaning_recall` and `cloze_mcq`.** Both ExerciseTypes are defined in code but missing rows in the table. PR 1 inserts them with `session_enabled=true, rollout_phase='full'`. Confirm this matches product intent.

7. **Audio module data model is forward-looking.** Decision Q in the target doc says lesson long-form audio (`lessons.audio_path`) stays as a text column for now. When the audio deep module is built, it may want per-section audio (`lesson_audio_assets` table) — that's a future migration, not this one. Confirm this is the right call.

---

## §15. What this plan does NOT cover

- **Pipeline staging-file refactor.** The 4 derived staging files need their generators updated to write typed-satellite rows. Tracked but designed downstream.
- **Authoring UX.** Authors today write `lesson.ts` with bespoke `content` JSON shapes. Migrating the authoring shape is out of scope; the pipeline can keep accepting JSON-shaped staging and write typed rows.
- **Performance benchmarks.** Each query in `2026-05-21-data-model-target.md` §5 is structurally simpler; quantifying the win requires before/after timing (not in this plan).
- **Subagent prompt updates.** The 5 Claude subagents (`linguist-creator`, `vocab-exercise-creator`, etc.) that write staging files need their prompts updated. Each PR's "code paths" section names them but doesn't ship the prompt edits.
- **Module specs (`docs/current-system/modules/<name>.md`) updates.** Every PR that touches a module's surface must update its spec same-commit (CLAUDE.md rule). Tracked but not enumerated here.

---

**End of migration plan.** Architect review needed before promotion to `approved`.
