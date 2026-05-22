---
status: completed
doc_type: architect-review
plan_audited: docs/plans/2026-05-22-data-model-migration.md
last_verified_against_code: 2026-05-22
verdict: NEEDS REVISION
---

# Architect review — 2026-05-22 migration plan

**Plan under review:** `docs/plans/2026-05-22-data-model-migration.md` (1300 lines, 16 PRs)
**Status of plan:** `draft` (forward-looking; edit appropriate)
**Reviewer constraint:** Available tools are Read / Glob / Grep / Write. No Edit. To avoid corruption from full-file rewrites of a 1300-line spec, edits are left to the data-architect / developer; findings below are written to be directly actionable.

**Summary in one paragraph.** The plan slices the data-model migration capability-by-capability with a 7-gate (ingestion → authoring → lesson-stage → capability-stage → activation → session-build → learning) per-source-kind shadow-run pattern. The slicing is sound, the writer/reader/validator triangle is enforced per typed table, and Decisions C1/M1/m2/M2 from the data-architect audit are reflected. **However the PR 0 schema cleanup conflates table drops with editing `scripts/migration.sql` and underestimates the impact of dropping `lesson_progress`, the `podcasts` table, the legacy `learner_item_state`/`learner_skill_state`/`review_events` cluster, and the `lessons.dialogue_voices` / `transcript_*` / `duration_seconds` columns — the existing live readers (Podcast.tsx, the `Lesson` interface in lessons/adapter.ts, get_lessons_overview, the leaderboard view) are not enumerated, and the `commit_capability_answer_report` Postgres RPC at `migration.sql:1465-1500` writes the columns being renamed/dropped without the plan acknowledging that it (not just the edge function) needs surgery in the same transaction. The migration as written would fail `make migrate-idempotent-check`: the table CREATEs being dropped via CASCADE remain elsewhere in `scripts/migration.sql` and would be re-created on the second pass. The per-PR test mechanism cites a non-existent "artificial session" infrastructure from commit 5e39c28 — Playwright e2e in this repo today drives the real `/session` route, no `?force_capability` param exists. The plan is structurally sound but the PR 0 chapter and the test mechanism reference are NOT ready for implementation. Verdict: NEEDS REVISION.

---

## Iteration log

**Pass 1 (this review):** Read all 7 source documents, verified the live code shape, enumerated findings. Verdict drafted. No edits applied to the plan (tool constraint — Edit unavailable, Write would risk corruption of 1300-line file). All findings written below in directly-actionable form so the data-architect can apply.

**Anticipated pass 2:** Data-architect addresses findings; re-review.
**Anticipated pass 3:** New defects from the fixes; re-verify.

---

## Findings — by severity

### CRITICAL (blocks approval)

#### C1 — `scripts/migration.sql` is not edited in the same PR as the table drops

**Where:** §3.1 (the table-drop DDL block).

**Evidence:**
- `scripts/migration.sql:173` creates `learner_item_state`.
- `scripts/migration.sql:191` creates `learner_skill_state`.
- `scripts/migration.sql:212` creates `review_events`.
- `scripts/migration.sql:231` creates `lesson_progress`.
- `scripts/migration.sql:285-295` defines the `leaderboard` view that JOINs `learner_item_state` (line 288) and `lesson_progress` (line 292).
- `scripts/migration.sql:300-302` creates indexes on the legacy tables.
- `scripts/migration.sql:317-319` GRANTs against the legacy tables.
- `scripts/migration.sql:344-346` ENABLE ROW LEVEL SECURITY for those tables.
- `scripts/migration.sql:414-432` creates RLS policies for them.
- `scripts/migration.sql:1697-1798` `get_lessons_overview` function reads `lesson_progress` (line 1784).

The plan's `drop table if exists ... cascade` removes the live rows but leaves the CREATE / GRANT / ENABLE-RLS / CREATE-POLICY / INDEX / view / function statements in `scripts/migration.sql`. **The second `make migrate` pass re-creates the dropped tables** (because `scripts/migration.sql` is the authoritative source — CLAUDE.md "Migration source-of-truth rule") and the migration is not idempotent.

The `make migrate-idempotent-check` gate at §3.8 would fail.

**Fix needed:**
- §3.1 must also delete from `scripts/migration.sql` the lines that create + grant + RLS + index + reference the dropped tables.
- Specifically: lines 173-228 (CREATE TABLE statements); lines 300-302 (indexes); lines 317-319 (GRANTs); lines 344-346 (ENABLE RLS); lines 414-432 (policies); lines 258-269 (FK + constraint cleanup that's no longer needed); lines 285-295 (leaderboard view — replace with the §3.7 rewrite); lines 1697-1798 (`get_lessons_overview` — must be updated to remove the lesson_progress fallback at line 1784).
- The plan should name §3.1 + §3.7 as the same SQL edit — the leaderboard view CANNOT be a CREATE OR REPLACE against the old view definition while the old underlying tables are dropping in the same transaction. Order: drop tables in the same transaction that recreates the view.

This is the single biggest structural problem in the plan — the §3.8 gate ("make migrate-idempotent-check") cannot pass as written.

#### C2 — `commit_capability_answer_report` Postgres RPC writes the columns being renamed/dropped; plan only names the edge function

**Where:** §3.3 (line 313 — "Reader to update: `src/lib/analytics/memory/adapter.ts`") and §3.4 (line 349 — "Edge function that writes to this table (`commit-capability-answer-report`) must be redeployed alongside the migration").

**Evidence:** The writer that produces every `capability_review_events` row is the **Postgres function** `indonesian.commit_capability_answer_report(p_command jsonb)` at `scripts/migration.sql:1205-1538`. The edge function at `supabase/functions/commit-capability-answer-report/index.ts` is a transport wrapper that calls this RPC via `supabase.rpc(...)` (target-architecture.md:1296 — "the edge function delegates DB writes to the Postgres RPC").

The RPC INSERTs (line 1466-1494) name the columns `answer_report_json`, `scheduler_snapshot_json`, `state_before_json`, `state_after_json`, `artifact_version_snapshot_json`. The RPC UPDATEs `fsrs_state_json` (line 1500). After the renames + drops in §3.4 and §3.3, the RPC errors immediately on every commit.

The edge function is a secondary writer concern (its `state_after_json` references at index.ts:59 and :248 — the read-back path).

**Fix needed:**
- §3.3 + §3.4 must enumerate the `commit_capability_answer_report` RPC body in `scripts/migration.sql:1205-1538` as a co-edit. The CREATE OR REPLACE FUNCTION block needs the new column names + the removal of `fsrs_state_json` write (line 1500). All three of these (the rename, the drop, the RPC edit) must land in the same transaction.
- §3.3 must additionally note: `learner_capability_state.fsrs_state_json` is also written by the RPC at line 1500. Drop-column + RPC edit, same transaction.
- Note: ALTER TABLE RENAME COLUMN + CREATE OR REPLACE FUNCTION work in the same transaction in Postgres; idempotency requires the rename to be guarded (the plan does this at §3.4) AND the function body to be parseable against either state. Easiest path: rename first within a `do $$ begin ... end $$` transaction, then re-create the function with the new column names. Single migration pass works; second pass is no-op.
- Hard constraint per CLAUDE.md: "Function return-shape changes need `DROP FUNCTION ... CASCADE` first." The plan must verify the RPC return-shape is unchanged; if it changes, add explicit `drop function indonesian.commit_capability_answer_report(jsonb) cascade;` before the CREATE OR REPLACE.

#### C3 — `podcasts` table drop is incompatible with the live UI

**Where:** §3.1 line 258: `drop table if exists indonesian.podcasts cascade;`.

**Evidence:**
- `src/App.tsx:16-17, 165, 173, 176` wires `/podcasts` and `/podcast/:podcastId` to `pages/Podcasts.tsx` and `pages/Podcast.tsx`.
- `src/pages/Podcast.tsx:33` calls `podcastService.getPodcast(podcastId)`.
- `src/services/podcastService.ts:21-43` queries `indonesian.podcasts` via Supabase.
- The architectural intent in target-architecture.md:1027-1051 says `podcastService` stays as a service-layer thin transport and that the schedulable `podcast_gist` capability type is part of the locked pedagogy. The service is supposed to stay live for browsing.
- The data-architect's target plan §Decision K (target.md:914) says "Drop — Feature not built; build with the podcast schema design when needed."

These two sources disagree. The target plan's "feature not built" is wrong: a live UI exists, with routing, that queries the table. The investigation §1.1 evidence shows the table has zero rows but that's not the same thing as the feature being un-built; it's empty content with live readers.

**Fix needed:** Pick one path:
- **(a)** Keep `podcasts` table; remove from the §3.1 drop list. Add to "deferred — feature inactive, table stays as the contract surface for `podcastService`." This is the safest path.
- **(b)** Delete `App.tsx` routes + `pages/Podcast.tsx` + `pages/Podcasts.tsx` + `services/podcastService.ts` + `src/__tests__/podcastService.test.ts` in the same PR as the table drop, and audit `src/components/Layout.tsx` for the "Podcasts" nav link.
- **(c)** Drop the rows but keep the table shape; downgrade the feature to "table exists, no content." This is what's effectively true today, but the §3.1 entry says drop, not truncate.

The plan's "feature not built" assertion is contradicted by the file system. The §12.1 risks section does not name this risk. Without enumeration, the implementer drops the table and breaks production routes.

#### C4 — `lessons.dialogue_voices` + `transcript_*` + `duration_seconds` drop breaks `lib/lessons/adapter.ts` Lesson interface and downstream consumers

**Where:** §3.5 (DDL at line 370-375; "Writers to update" at line 389-392).

**Evidence:**
- `src/lib/lessons/adapter.ts:19-35` declares `interface Lesson` with mandatory-typed fields `duration_seconds`, `transcript_dutch`, `transcript_indonesian`, `transcript_english`, `dialogue_voices`.
- `src/lib/lessons/adapter.ts:194` `select '*, lesson_sections(*)'` returns rows that now don't have those columns — the type assertion `data as Lesson` becomes a lie.
- Grep of `duration_seconds|transcript_dutch|transcript_indonesian|transcript_english|dialogue_voices` across `src/` returns 19 files including `src/pages/Lessons.tsx`, `src/pages/Lesson.tsx`, `src/services/lessonService.ts`, lesson tests.
- Grep across `scripts/` returns 17 files including the active publish pipeline (`scripts/lib/pipeline/lesson-stage/runner.ts`, `audio.ts`, validators, the `check-supabase-deep.ts` audio coverage check, and `scripts/set-lesson-voices.ts:154-160` which writes `dialogue_voices` directly on the lessons row).

The plan §3.5 lists only `scripts/lib/pipeline/lesson-stage/audio.ts` and `scripts/check-supabase-deep.ts:309-315` as writers. It misses:
- `src/lib/lessons/adapter.ts:19-35` — type definition.
- `scripts/set-lesson-voices.ts:154-160` — writes `dialogue_voices` to `lessons` row directly; this needs to switch to writing `lesson_speakers` rows.
- `scripts/lib/pipeline/lesson-stage/validators/lessonVoices.ts` — reads/validates the column.
- `scripts/lib/pipeline/lesson-stage/runner.ts` — references the lesson fields.
- `scripts/fetch-lesson-content.ts` — references the fields.
- `scripts/seed-lessons.ts` + `scripts/data/lessons.ts` — staging files that emit dialogue_voices for fresh DB rebuilds.

`lessons.transcript_*` are always-NULL per investigation §1.1 (no live read I could find — confirmed grep across `src/pages/`, `src/lib/lessons/` only references via the Lesson interface destructure). Safe to drop the columns but the interface needs editing.

`lessons.duration_seconds` is always-NULL — same conclusion.

**Fix needed:**
- §3.5 must enumerate `src/lib/lessons/adapter.ts:19-35`, `scripts/set-lesson-voices.ts:151-160`, `scripts/lib/pipeline/lesson-stage/validators/lessonVoices.ts`, `scripts/lib/pipeline/lesson-stage/runner.ts`, `scripts/fetch-lesson-content.ts`, `scripts/seed-lessons.ts`, `scripts/data/lessons.ts`.
- The grep clause at line 392 is right ("Grep `dialogue_voices`, `transcript_dutch`, ... — remove every reference") but the rule must be: "remove every reference in PR 0; CI grep must return zero hits before merge."
- `src/lib/lessons/adapter.ts:19-35` `Lesson` interface: remove the 5 fields; touch every downstream consumer (the grep is the audit). Plan must state this explicitly.

#### C5 — `lib/analytics/` does not yet exist; the §3.3 "Reader to update" cite is to a non-existent file

**Where:** §3.3 line 313 — "`src/lib/analytics/memory/adapter.ts` — remove any `fsrs_state_json->>'retrievability'` reads".

**Evidence:**
- `src/lib/analytics/` does not exist (Glob `src/lib/analytics/**/*.ts` returns no matches).
- target-architecture.md:684-720 documents `lib/analytics/` as a target module that does not exist yet ("Locked" but not built).
- Active `retrievability` references are at `src/services/learnerStateService.ts:73,87`, `src/lib/reviews/capabilityReviewProcessor.ts:18`, `src/types/learning.ts:98`. None of them read `fsrs_state_json->>'retrievability'`; they pass through `retrievability` as a typed field on the answer-report path.
- The only `fsrs_state_json` read I found is the migration plan and target plan themselves. **No live code reads `fsrs_state_json`.** It's a write-only column.

So the §3.3 fix is even simpler than the plan claims: drop the column, no reader change. But the cite to `lib/analytics/memory/adapter.ts` is **vapor** — citing target-architecture as if it were code. CLAUDE.md "Read code before describing it" is exactly the bug class this violates.

**Fix needed:**
- §3.3 line 313: replace the false cite with: "No live reader exists. `fsrs_state_json` is write-only today. The `commit_capability_answer_report` RPC at `migration.sql:1500` is the only writer; remove its `fsrs_state_json = v_state_after,` line in the same transaction."
- Removes a load-bearing false claim and reduces the §3.3 surface to "drop column + update RPC."

#### C6 — Per-PR "artificial session" E2E mechanism is unspecified; commit 5e39c28's mechanism does not exist

**Where:** §1.5 line 116-157, item 5 of every PR template.

**Evidence:**
- Commit `5e39c28` is referenced in the recent commits log: `docs(plans): make 'artificial session' E2E mechanism explicit`. But the live e2e tests at `e2e/session.spec.ts`, `e2e/lesson-reader.spec.ts`, `e2e/pr4a-smoke.spec.ts`, `e2e/design-lab-capture.spec.ts` use the real `/session` route — there is NO `?force_capability` query param, NO bypass for the session-builder, NO seed mechanism to inject capability state for the test user.
- The plan's §1.5 line 157 says: "If the natural card-walk is too slow for a rare source_kind ..., add a dev-only query param `?force_capability=<canonical_key>` behind `import.meta.env.DEV` that bypasses the session-builder and renders a specific cap. Wire it only for E2E; never ship to production. Seed a `learner_capability_state` row for the test user in the PR's `beforeAll` if none exists."
- This is **the plan adding new product code** (a dev-only query param hook that bypasses the session-builder) inside a *test-mechanism* description. That code does not exist. PR 1.1 (the tracer bullet) cannot start without it. The implementer would have to build the bypass before writing tests.

**Fix needed:** The plan must either:
- **(a)** Spec the `?force_capability` bypass as a Phase 0 sub-PR (PR 0.5?) with its own DDL/code/test surface, OR
- **(b)** Drop the bypass; commit to the card-walk pattern (slower but uses real production code paths), OR
- **(c)** Use a test-data seed pattern instead: PRE-test, `INSERT INTO learner_capability_state (...)` against the test user with stability set very low so the cap surfaces in the first session card. This is the pattern at `affixedFormPairCapstone.test.tsx` + `dialogueLineCapstone.test.tsx` — fully-mocked component tests at the React boundary. They test "given this resolveBlock output, the component renders." A real `/session` E2E + the §1.5 card-walk is the production proof.

**Recommendation:** (b) + the component-test pattern. Component-test in the same PR for fast iteration; one true E2E per-source-kind smoke after deploy, walking real cards.

Either way the plan must NOT cite the mechanism as if it exists. The §1.5 line 157 escape hatch is fictional.

#### C7 — `dialogue_voices` backfill `jsonb_each_text` ordering does not preserve speaker assignment determinism

**Where:** §3.5 line 364-368 (backfill SQL).

**Evidence:** The current data is per `set-lesson-voices.ts:142-148` which iterates dialogue sections AND dialogue lines in order, calling `pickDialogueVoice(speaker, primaryVoice, usedVoices)` once per unique speaker. The voice assignment depends on the **order** in which `usedVoices` accumulates (line 80-82 has a `toggleFemale = usedVoices.size % 2 === 0` rule for narrator/ambiguous). The `dialogue_voices` jsonb column was written by this script, so its **kvp ordering is non-deterministic** (Postgres jsonb stores keys sorted, not insertion order).

The backfill `select l.id, kv.key, kv.value::text from indonesian.lessons l, jsonb_each_text(coalesce(l.dialogue_voices, '{}'::jsonb)) kv` extracts (speaker, voice_id) pairs. Each existing row's voice was deterministically chosen ONCE by `set-lesson-voices.ts`; the backfill just copies the current state. **That part is fine.**

But what is NOT fine: the §3.5 plan ALSO drops `dialogue_voices` from `lessons` (line 371). Future re-publishes through `set-lesson-voices.ts:154-160` write to the column that's been dropped. The plan §3.5 says to update `audio.ts` to read from `lesson_speakers`, but `set-lesson-voices.ts` is the WRITER. It needs to switch from "update lessons.dialogue_voices" to "upsert lesson_speakers rows."

**Fix needed:**
- §3.5 must enumerate `scripts/set-lesson-voices.ts:151-160` as a writer to rewrite. Its `update(lessons).set({ dialogue_voices: ... })` becomes `upsert(lesson_speakers).onConflict(['lesson_id', 'speaker'])`.
- Re-publishes after PR 0 must continue to assign voices the same way (deterministic on order_index for primary; deterministic order on speakers within dialogue for assignment). Verify `setLessonVoicesForLesson` output, asserted via golden snapshot, is unchanged before and after the switch.

---

### MAJOR (must be addressed; not blocking spec approval but blocking implementation)

#### M1 — Per-lesson bespoke `src/pages/lessons/lesson-N/Page.tsx` files are second readers; consumed `section.content` shape via cast — but the plan only enumerates one of them at §10

**Where:** §10 (PR 7 — Lesson sections typed satellites).

**Evidence:**
- Grep for `content as|section\.content` across `src/pages/lessons/` returns hits in EVERY one of `lesson-1/Page.tsx` through `lesson-9/Page.tsx` (9 files; git status shows `lesson-4`, `lesson-5`, `lesson-6`, `lesson-7`, `lesson-8`, `lesson-9` directories untracked — actively WIP).
- `lesson-9/Page.tsx` specifically casts: `section.content as { paragraphs: string[] }` (line 108), `{ lines: DialogueLine[] }` (216), `{ categories: GrammarCategory[] }` (289, 393), `{ items: Item[] }` (457, 514, 565, 593) — 8 explicit shape casts.
- The plan §10 "Writer/Reader/Validator triangle" line 1175-1179 names "per-lesson `Page.tsx`" generically but does not enumerate the 9 files or the specific casts each one performs.

This is the exact pattern the target plan §Decision C / ADR 0009 calls out: per-lesson `Page.tsx` files emerging as second reader paths. Every cast becomes a typed-table fetch when `lesson_sections.content` is dropped.

**Fix needed:**
- §10 must enumerate each of the 9 `src/pages/lessons/lesson-N/Page.tsx` files, with the shape cast(s) each one performs.
- Each cast becomes a typed-table read post-PR 7.2 (e.g. `{ lines: DialogueLine[] }` → `SELECT * FROM lesson_dialogue_lines WHERE section_id = ...`, `{ items: Item[] }` → `SELECT * FROM lesson_section_item_rows WHERE section_id = ...`).
- The plan should NOT batch all 9 into one PR; each lesson's Page.tsx is independent enough that the reader rewrite can ship lesson-by-lesson if needed. Alternative: rewrite all 9 in PR 7.2 — but the plan must explicitly choose.
- The git status shows lessons 4-9 directories are untracked (new). If those are WIP that hasn't shipped to main, the rewrite for those happens BEFORE PR 7.1 ships (otherwise the new pages render against the old shape and break on deploy).

#### M2 — Decision M1 (ContractInputShapes) implementation is named at PR 4.2 but the affected `byType/*.ts` packagers and helpers/types aren't enumerated; multiple packagers will need synchronized edits

**Where:** §7.2 line 1014-1037.

**Evidence:**
- The plan says "Remove `variant: ExerciseVariant | null` from `RawProjectorInput`. Add `patternExercise: ...`."
- `src/lib/exercise-content/byType/contrastPair.ts`, `sentenceTransformation.ts`, `constrainedTranslation.ts`, `clozeMcq.ts` each currently read `input.variant.payload_json.<field>`.
- The `RawProjectorInput` type lives in `@/lib/capabilities/renderContracts.ts` (per `lib/exercise-content/byType/types.ts:1-28`). The shape change cascades to projector, builder, every test fixture.
- Test files `src/__tests__/affixedFormPairCapstone.test.tsx`, `src/__tests__/dialogueLineCapstone.test.tsx`, `src/lib/exercise-content/__tests__/byType.test.ts`, `src/lib/capabilities/__tests__/renderContracts.test.ts` all build mock `RawProjectorInput` with `variant: null` or a concrete variant. Each needs editing.
- `src/components/admin/VariantPreview.tsx` and `src/components/admin/ExerciseSummaryCard.tsx` consume the existing variant `payload_json` shape for admin preview surfaces. Their input shape changes when the typed exercise tables replace `exercise_variants`.
- `src/lib/preview/localPreviewContent.ts:57` builds a fake `payload_json: input.payload` — local-preview content surface for design-lab. Needs typed-row equivalent for the 4 grammar exercise types.

**Fix needed:**
- §7.2 must enumerate each `byType/*.ts` file that destructures `input.variant.payload_json`, with the specific field renames.
- §7.2 must enumerate the test fixture sites.
- §7.2 must enumerate `src/components/admin/VariantPreview.tsx`, `src/components/admin/ExerciseSummaryCard.tsx`, `src/lib/preview/localPreviewContent.ts` as second-reader sites.
- The split between "type changes in capabilities/renderContracts.ts" and "code changes in byType/" should be at the file-edit level; the PR can be large but the spec should make it clear nothing is missed.

#### M3 — Plan does NOT name `src/services/coverageService.ts` + `src/services/exerciseReviewService.ts` + `src/services/leaderboardService.ts` as consumers of affected tables

**Where:** Throughout §3-§11. Per the architect-mode review territory item #4 ("service-layer shape changes").

**Evidence:**
- `src/services/coverageService.ts:39` reads `lesson_sections` `content` field — second reader for §10 (PR 7).
- `src/services/coverageService.ts:76, 78` reads `item_meanings` + `exercise_variants` — second readers for §4 (PR 1.x) + §7 (PR 4.x).
- `src/services/coverageService.ts:81` reads `item_context_grammar_patterns` — table dropped in PR 0 §3.1. The function will error.
- `src/services/exerciseReviewService.ts:61, 68, 169` reads `exercise_variants` — second reader for §7 (PR 4.x).
- `src/services/exerciseReviewService.ts:94, 114, 136, 156` reads/writes `exercise_review_comments` — Decision O in §11.3 adds lesson_id; the service does not consume that field today.
- `src/services/leaderboardService.ts:9` reads `leaderboard` view. The view rewrite at §3.7 changes the column from `lessons_completed` to `lessons_activated` (line 426). `src/pages/Leaderboard.tsx:48-49` reads `entry.lessons_completed` — the rename breaks the column reference. `src/types/learning.ts:LeaderboardEntry` and `LeaderboardMetric` types both have `lessons_completed`.

**Fix needed:**
- §3.1 must name `coverageService.ts:81` — the `item_context_grammar_patterns` read is broken after the drop.
- §3.7 must name `src/pages/Leaderboard.tsx:48-49`, `src/types/learning.ts` (LeaderboardEntry + LeaderboardMetric types), `src/lib/i18n.ts` (the translation key `leaderboard.lessonsCompleted` if present) — every reference to the renamed column must be edited.
- §4 must name `coverageService.ts:76` (item_meanings reader).
- §7 must name `coverageService.ts:78`, `exerciseReviewService.ts:61/68/169` (exercise_variants readers).
- §10 must name `coverageService.ts:39` (lesson_sections.content reader).

#### M4 — `lessons.dialogue_voices` not dropped from `Lesson` interface in lessons/adapter.ts + the `setLessonVoicesForLesson` writer not switched

**Where:** §3.5 line 389-392.

**Evidence:** See C4. Specifically the `Lesson` interface at `src/lib/lessons/adapter.ts:19-35` includes `dialogue_voices: Record<string, string> | null` (line 33), `transcript_dutch`, `transcript_indonesian`, `transcript_english`, `duration_seconds`. The interface is consumed across `src/pages/Lessons.tsx`, `src/pages/Lesson.tsx`, `src/services/lessonService.ts`, lesson tests (19 files).

`setLessonVoicesForLesson` at `scripts/set-lesson-voices.ts:151-160` writes `dialogue_voices` directly to the lessons row.

**Fix needed:** Same as C4. M4 is the file-level enumeration; C4 is the structural call-out. Both must be addressed.

#### M5 — `learner_lesson_activation` is mentioned only as a leaderboard input; not audited as a writer/reader/validator for §3.7

**Where:** §3.7 (leaderboard view rewrite).

**Evidence:** The leaderboard view JOINs `learner_lesson_activation` to derive `lessons_activated`. But:
- `learner_lesson_activation` has only `(user_id, lesson_id, activated_at)` columns per `migration.sql:1561-1567`. There's no count semantic — "lessons activated" = `count(*)` of rows.
- Per target plan §Decision L "lessons_completed ← `count(*) FROM learner_lesson_activation WHERE activated_at IS NOT NULL` (or another definition; today this reads from `lesson_progress`)". `activated_at` is `not null` by construction (per `migration.sql:1564` — `activated_at timestamptz not null default now()`). So `WHERE activated_at IS NOT NULL` is always true. The plan's SQL at line 425 drops the WHERE clause, which is correct.

This is a minor MAJOR — the rewritten leaderboard view is right, but the plan does not explicitly cite the WHERE-clause elimination or anchor the new `lessons_activated` semantic. **Question for the user:** "lessons_activated" is a count of activated lessons. Is that the right semantic for the leaderboard column, or should the leaderboard count "lessons COMPLETED" using `learning_capabilities WHERE lesson_id = X AND review_count > 0 GROUP BY lesson_id HAVING count(*) = lesson_total_caps`? The original `lessons_completed` semantic was "lesson_progress.completed_at IS NOT NULL" — a user explicit action. The new `lessons_activated` semantic is "checkbox checked." These are different. **Open question for the user.**

**Fix needed:** Document the chosen semantic explicitly. The plan's renaming is honest ("activation ≠ completion") but the user may want a different metric.

#### M6 — Migration scope for `commit_capability_answer_report` RPC NOT VALID / VALIDATE pattern not specified

**Where:** §11.4 line 1238-1251 (learning_sessions session_type CHECK).

**Evidence:** §11.4 uses `add constraint if not exists ... CHECK (session_type = 'learning') NOT VALID;` followed by `VALIDATE`. That's correct for `learning_sessions` (existing rows have non-'learning' values; backfill or delete before validate).

But §3.4 column-rename of `capability_review_events.answer_report_json → answer_report` (etc.) does not need the NOT VALID + VALIDATE dance — RENAME COLUMN is metadata-only. The plan correctly uses the `do $$ ... end $$` idempotent guard.

Where the plan does NOT handle this correctly: the rename happens before the `commit_capability_answer_report` RPC update. There's a transactional window where the column has the new name but the RPC inserts into the old name. The plan §3.4 line 349 frames this as "Deploy order: migration first, edge function second" — but the WRITER is the RPC, not the edge function. The RPC is part of the migration, not a separate deploy. **Single-transaction migration**: rename columns + replace RPC, atomically. The plan must state this.

**Fix needed:** §3.4 must reframe the deploy ordering: "migration includes both ALTER TABLE RENAME and CREATE OR REPLACE FUNCTION for the RPC in the same `make migrate` run. Edge function (the transport wrapper) only reads back from `state_after_json` for idempotency response — it must be re-deployed in the same window to use the new name `state_after`, but is not part of the migration transaction."

#### M7 — `prerequisite_keys text[]` backfill from `metadata_json` happens before `goalTags` writers are updated

**Where:** §3.2 line 275-293 (DDL) and line 295-304 (writer updates).

**Evidence:** The DDL block runs BEFORE the writer-update list. If the migration runs first, the writer code still emits `metadata_json.prerequisiteKeys` because the writers haven't been updated. Next publish creates rows with `prerequisite_keys = '{}'` (default) AND no metadata_json to backfill from (column was dropped).

Wait — the plan drops `metadata_json` IN THE SAME DDL block at line 290. So after the migration, the backfill SQL is no-op for future publishes (metadata_json doesn't exist). That's intentional — the backfill is one-shot for legacy data. **OK.**

But: the writer code at `src/lib/session-builder/pedagogy.ts:26` reads `cap.metadata_json.prerequisiteKeys`. After the migration, `cap.metadata_json` is undefined. The pedagogy gate breaks. The plan needs the code switch (line 303) to happen IN THE SAME PR + DEPLOY as the migration; otherwise the session-builder breaks for the migration window.

**Fix needed:** The §3.2 PR includes BOTH the migration AND the code edits at lines 295-304 in the same commit, deployed together. The plan implies this with "Writers to update in same PR" but the deploy ordering is not made explicit. State: "ship the code edit + migration in the same deploy; migration runs first per Postgres ALTER TABLE; the next page load reads `prerequisite_keys` column from the table directly."

#### M8 — Per-PR 48h post-deploy check (§1.6) cites `source_kind` on `capability_review_events` but the table does NOT have a `source_kind` column

**Where:** §1.6 line 165-172.

**Evidence:** `capability_review_events` schema per `migration.sql:1190-1198` and the RPC INSERT at 1466-1494 — columns are `user_id, capability_id, learner_capability_state_id, idempotency_key, session_id, session_item_id, attempt_number, rating, answer_report_json, scheduler_snapshot_json, state_before_json, state_after_json, artifact_version_snapshot_json`. **No `source_kind` column.**

The SQL at line 167-172 would error on `lc.source_kind` if the JOIN to `learning_capabilities lc` were missing — actually the plan's SQL DOES join: `join indonesian.learning_capabilities lc on lc.id = cre.capability_id` (line 169). So the SQL is correct; it pulls `source_kind` from the join. **Disregard finding.**

Actually re-reading: the plan SQL is correct. `lc.source_kind` is `learning_capabilities.source_kind`, fetched via the join. Strike this finding from MAJOR. (Leaving here for review trace.)

#### M9 — Per-PR §1.6 "exception for Phase N.1" claims writer is checked via `SELECT count(*) FROM <typed_table>` but the typed_table reference is not parameterised per source_kind

**Where:** §1.6 line 175-176.

**Evidence:** "Phase N.1 (writer-only) PRs: the 48h check is on the writer — confirm the new typed table has rows via `SELECT count(*) FROM indonesian.<typed_table>` after publish."

For pattern (Phase 4.1), there are 5 new tables: `grammar_pattern_examples`, `contrast_pair_exercises`, `sentence_transformation_exercises`, `constrained_translation_exercises`, `cloze_mcq_exercises`. The single-table check doesn't cover all 5. Each PR's exception should name the specific table(s).

**Fix needed:** §1.6 line 175 expand to enumerate per-phase. Phase 4.1 should name all 5 tables. Phase 2.1 names `dialogue_clozes` + `lesson_dialogue_lines` (or note that lesson_dialogue_lines lives on the lesson-stage side and has a different check).

---

### MINOR (judgment calls; author may push back)

#### m1 — §1.6 48h post-deploy check assumes a 2-user, 10-review/day live environment

**Where:** §1.6, §3.4 line 349.

The 48h window is the right idea (memory `feedback_answer_log_check.md`) but at 2 users + 10 reviews/day the chance of every source_kind being touched is low. Phase 4.x (`pattern`) caps especially — there are 94 pattern caps and the only learners are the test user + admin. The "no answer in 48h" verdict may not mean the feature is broken; it may mean no user happened to be at the right capability state.

**Author judgment:** Either (a) accept the noise and use the check as best-effort, (b) make the test user explicitly review one cap per source_kind via the admin path post-deploy, (c) extend the window to 7 days.

#### m2 — Per-PR test files in `e2e/` directory don't match the existing test pattern

**Where:** §1.5 line 96-114.

The existing e2e tests at `e2e/session.spec.ts` and `e2e/lesson-reader.spec.ts` use Playwright + a CORS bypass + a `login` helper + a `navigateToSession` helper. The plan's §1.5 E2E template is a different shape (different test helpers, different setup). **Author judgment:** either match the existing e2e file shape or note the inconsistency as a deliberate refactor.

#### m3 — `audio_clips` 1,334 orphan rows tracked as Open Question #2 but not as a per-source-kind impact

**Where:** §12 Open question #2.

`capability_audio_refs` (new in PR 1.1) binds capabilities to audio_clips by capability_id + audio_clip_id. After PR 1.x ships, `audio_clip` artifact rows (1,280 in the live DB) are retired. The 1,334 orphans then become 1,334 + 1,280 ≈ 2,614 orphans (the dialogue_line caps' audio refs are not yet replaced). After PR 2.x ships, they drop back. The plan should at least note the orphan count surface as a metric for the §1.6 health check.

**Author judgment:** Accept the Open Question framing OR add a per-PR orphan-count delta.

#### m4 — Decision G2's `cloze_mcq_item_distractors` vs `cloze_mcq_exercises` naming risks confusion

**Where:** §4.1 + §7.1.

Two tables share `cloze_mcq` in their name: `cloze_mcq_item_distractors` (item-source curated distractors, PR 1.1) and `cloze_mcq_exercises` (pattern-source authored exercises, PR 4.1). Per Decision G the `cloze_mcq` exercise type accepts BOTH source kinds. The naming reflects this but a developer reading the schema would need both tables in mind.

**Author judgment:** Accept the precision (the naming IS precise) OR rename to `cloze_mcq_pattern_exercises` for clarity. Not a blocker.

#### m5 — §3.2 backfill of `prerequisite_keys` uses `array(select jsonb_array_elements_text(...))` which is non-trivial; idempotency concern

**Where:** §3.2 line 281-287.

The backfill is guarded by `where prerequisite_keys = '{}'` — idempotent. But: the `metadata_json` column may already be NULL for some rows post-prior-migration. The `where ... metadata_json is not null` guard handles that. The `where ... metadata_json ? 'prerequisiteKeys'` guard handles missing key. Safe. **MINOR — no fix needed; flagged for completeness.**

#### m6 — §3.7 view defines `total_seconds_spent` and `days_active` via subqueries (correlated SELECT per row); performance is OK at small scale but won't scale

**Where:** §3.7 line 412-426.

The new leaderboard view uses subqueries instead of JOINs. For 2 users today, this is fine. For 100+ users it becomes a per-row scan. **Author judgment:** Defensible at current scale; flag for a future refactor when leaderboard load matters.

#### m7 — §5.1 (Phase 2) DDL recreates `lesson_dialogue_lines` despite Decision D (target plan §Decision D) already declaring it; coordination with §10 (PR 7) is implicit

**Where:** §5.1 line 648-673, §10 line 1166.

Phase 2 creates `lesson_dialogue_lines` because the dialogue-cloze source_kind needs it. Phase 7 (lesson-sections rewrite) ALSO needs it for the lesson-sections satellite shape. §10 line 1166 correctly says "PR 7 does not recreate it; it only adds the FK index from `lesson_sections` → `lesson_dialogue_lines` if any navigation from section to lines is needed." Good.

But: `lesson_dialogue_lines.section_id` FK is to `lesson_sections.id`. If PR 7 changes the `lesson_sections` shape (and `lesson_sections.id` semantics are preserved — only columns added), then no FK update is needed. The plan should note this explicitly.

**Author judgment:** §10 already says "no recreate." Add: "section_id FK is preserved; lesson_sections shape change does not affect `lesson_dialogue_lines.section_id` FK target."

#### m8 — §7.3 (PR 4.3) drops `exercise_variants` after Phase 4.2 lands; but `exerciseReviewService.ts`, `coverageService.ts`, and admin preview components still read it

**Where:** §7.3 line 1059-1075.

`exercise_variants` is a writer-and-reader table for the admin review path (`exerciseReviewService.ts`, `VariantPreview.tsx`, `ExerciseSummaryCard.tsx`). Dropping it in PR 4.3 breaks the admin review flow. The plan §7.3 line 1075 cleanup section names `byKind/` and `capabilityTypes.ts` retirements but not the admin path.

**Author judgment:** Either (a) keep the table in the same shape but stop writing to it (the data freezes at PR 4.1's last write); (b) drop the admin review service entirely + update `ContentReview.tsx`; (c) re-shape the admin services to read from the typed exercise tables. **(c)** is the structurally-clean answer.

---

### INFO (observations the author may close)

#### I1 — Migration plan supersedes 2026-05-21-data-model-migration.md; the older file should be marked superseded

**Where:** frontmatter line 5.

The frontmatter says `supersedes: 2026-05-21-data-model-migration.md`. Per CLAUDE.md "Plan Status Awareness," the older plan's frontmatter `status:` should change to `superseded` (not a documented status) or `shipped: false; superseded_by: <new file>`. Author judgment.

#### I2 — `grammar_patterns.slug` UNIQUE constraint already exists; open question #3 (line 1281) can be marked resolved

**Where:** §12 Open question #3.

`scripts/migration.sql:548` declares `slug text NOT NULL UNIQUE` on `grammar_patterns`. The plan's open question can be closed: the constraint is in place; `affixed_form_pairs.pattern_source_ref` FK is valid as written.

#### I3 — §12 (Risks + open questions) numbering wraps: §12 appears twice in the document (line 1261 and line 1289)

**Where:** §12 (twice).

Editorial. Author fix: rename the second one to §13 or merge.

#### I4 — `item_contexts.context_type` audit at Open Question #1 (line 1277) — `vocabulary_list` and `lesson_snippet` should be grepped before PR 1.2

**Where:** §12 Open question #1.

Live code grep of `byKind/item.ts` confirms `item_contexts` is read but the filter (`adapter.ts:91 in fetchDistractorPool`) does NOT filter on context_type. So the context_type value is irrelevant at runtime. **Conclusion: the audit is unnecessary; the rows are not consumed by `context_type`. The check constraint could be widened or narrowed without runtime impact.**

#### I5 — `affixed_form_pair` cap distribution: 4 caps for 2 linguistic pairs, per investigation §1.4 line 119

**Where:** §6.

The plan correctly says "2 caps per linguistic pair" but the per-PR test target should be exactly 4 rows in `affixed_form_pairs` after PR 3.1. The plan line 826 says "assert ... = 4 (2 pairs × 2 caps)" — correct.

#### I6 — §1.4 default 3-phase per-source-kind model (12 PRs) vs §2 8-PR roster

**Where:** §1.4 line 62-64 + §2 line 218-236.

The §1.4 paragraph leaves the 8-PR alternative as a "fold option" but §2 commits to the 12-phase model. The plan should resolve this — either commit to 12 or 8. Currently the §2 roster lists 13 PRs (PR 0 + 12 phase PRs + 5 ortho/final).

**Author judgment:** Decide. The 12-PR model is more granular; the 8-PR model is faster but reverts are wider. **Recommendation: 12 PRs for the tracer bullet (PR 1.x), evaluate, then consider 8-PR for PR 2.x onward if the 3-phase pattern proves overhead.**

---

## Surviving open questions (escalate to user)

1. **M5: Leaderboard `lessons_activated` semantic.** "Activated lesson count" vs "completed lesson count." The user retired `lesson_progress.completed_at`; the new semantic uses checkbox-only activation. The user must choose.

2. **C3 (option choice): podcasts table fate.** Drop the table + delete the page + service + types? Keep the table empty + alive for the future feature? The plan and target plan disagree; user must adjudicate.

3. **C6 (option choice): test mechanism.** `?force_capability` bypass (new product code), capstone-pattern component tests (existing), or card-walk e2e? User preference.

4. **m1: 48h post-deploy check at 2-user load.** Plan accepts the noise; user may want a deterministic post-deploy script that submits one answer per source_kind as the test user.

5. **m8 / C3 / C7: admin path consequences.** PR 4.3 drops `exercise_variants`; the admin review flow (`exerciseReviewService`, `VariantPreview.tsx`, `ExerciseSummaryCard.tsx`) reads it. Rewrite admin to typed-tables (best), freeze the data (medium), or delete the admin flow (worst — loses oversight).

---

## Promotion verdict

**`status: draft` → `status: approved` NOT READY.**

**Blockers (must resolve before approval):**
1. **C1** — `scripts/migration.sql` co-edits for §3.1 drops. The plan must enumerate the migration.sql lines removed alongside each `drop table cascade`. Migration must pass `make migrate-idempotent-check`.
2. **C2** — `commit_capability_answer_report` RPC body co-edit in §3.3 + §3.4. The Postgres RPC is the writer; the edge function is a transport.
3. **C3** — Adjudicate the `podcasts` table fate. Either keep or fully retire (page + service + routes).
4. **C4 / M4** — Enumerate every `Lesson` interface + `lesson_speakers` writer consumer in §3.5.
5. **C5** — Remove or correct the `lib/analytics/memory/adapter.ts` cite in §3.3 (file does not exist).
6. **C6** — Choose a real test mechanism. The `?force_capability` cite is fictional.
7. **C7** — Switch `set-lesson-voices.ts` writer to `lesson_speakers` in §3.5.

**Recommended (address before PR 1 starts):**
- M1: enumerate all 9 lesson-N Page.tsx files in §10.
- M2: enumerate byType/ packagers + test fixture sites + admin VariantPreview/ExerciseSummaryCard in §7.2.
- M3: enumerate coverageService + exerciseReviewService + leaderboardService consumers.
- M5: explicit leaderboard semantic.
- m8: adjudicate admin review path post-PR 4.3.

After these, the plan structure (slicing, gating, writer/reader/validator triangle, 48h check) is sound and approval is appropriate. The data-architect's audit (C1, M1, M2, M3 in the target plan) IS satisfied; this review's CRITICALs are cross-codebase seam findings the data-architect's territory naturally missed.

**Anti-shallow guard count:** 7 CRITICAL + 9 MAJOR + 8 MINOR + 6 INFO = 30 findings. Above the ~15 floor for a 1300-line plan touching 17 PRs.

---

**End of architect review.**
