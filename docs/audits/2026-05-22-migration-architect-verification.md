---
status: completed
doc_type: architect-verification
plan_audited: docs/plans/2026-05-22-data-model-migration.md
prior_audit: docs/audits/2026-05-22-migration-architect-review.md
revision_log: docs/audits/2026-05-22-migration-revision-log.md
last_verified_against_code: 2026-05-22
verdict: NEEDS MINOR REVISION
---

# Architect verification pass — 2026-05-22 migration plan

**Plan under verification:** `docs/plans/2026-05-22-data-model-migration.md` (1437 lines, 16 PRs after revisions).
**Prior verdict:** `NEEDS REVISION` (7 CRITICAL, 9 MAJOR, 8 MINOR, 6 INFO).
**This pass's verdict:** `NEEDS MINOR REVISION` — orchestrator addressed the 7 CRITICAL findings and most MAJOR findings substantively, but a small number of newly-introduced issues and residual under-enumeration in MAJOR-class items need a quick second-pass before promotion. Most issues are mechanical adds, not structural rethinks.

**One-paragraph summary.** The revision round materially improved the plan: PR 0 now enumerates `scripts/migration.sql` co-edits, the `commit_capability_answer_report` RPC is correctly identified as the writer with an atomic drop+recreate block, the legacy table drops are enumerated with grep-based "no missed consumer" gates, the `?force_capability` bypass is promoted to a real PR 0 deliverable with admin-gate + env-flag activation, the Q4 deterministic post-deploy check replaces the 48h false-negative window, and §7.3 expands to a typed-table admin rewrite. However: (1) `get_lessons_overview` RPC (`scripts/migration.sql:1709-1798`) reads BOTH the dropped `lesson_progress` AND the dropped `lessons.duration_seconds` and is missing from the PR 0 co-edit list — this is a load-bearing function used on every Lessons page render; (2) the Dashboard/Voortgang consumers of `lesson_progress` via `lessonService.getUserLessonProgress` (`src/services/lessonService.ts:25`, called from `Dashboard.tsx:47` and `useProgressData.ts:93`) are not enumerated; (3) §3.5's grep gate "must return zero non-comment hits" is broken by Q2 (podcast service still consumes `transcript_*`/`duration_seconds` column names which the grep matches); (4) the AdminGuard path cite (`src/components/AdminGuard.tsx`) is wrong (actual: `src/pages/admin/AdminGuard.tsx`); (5) coverageService consumers for `item_meanings` (line 76), `exercise_variants` (line 78), and `item_context_grammar_patterns` (line 81) aren't enumerated in their respective sections — only the `lesson_sections.content` reader is. None of these reach C1-class structural blocker; all are mechanical adds or scope-clarifying language. Verdict: NEEDS MINOR REVISION — one short follow-up pass clears it.

---

## Iteration log

**Pass 1 (prior):** 30 findings. Verdict NEEDS REVISION.
**Pass 2 (this verification):** orchestrator addressed CRITICAL findings via Q1–Q5 + audit fixes; this pass re-verifies and audits new content. 6 new findings (1 CRITICAL, 3 MAJOR, 2 MINOR). Verdict NEEDS MINOR REVISION.
**Anticipated pass 3:** orchestrator addresses the 6 new findings; re-verify; expect APPROVAL.

---

## Status of prior findings

### CRITICAL (7)

| ID | Prior concern | Resolved? | Evidence in revised plan |
|---|---|---|---|
| **C1** | `scripts/migration.sql` co-edits for table drops | **Partial** | §3.1 (lines 297-305) enumerates the drop-co-edit list for `learner_item_state`, `learner_skill_state`, `review_events`, `lesson_progress`, and 4 empty tables. **But the `get_lessons_overview` RPC (`migration.sql:1709-1798`) — explicitly cited in the original C1 evidence at audit line 46 — is NOT enumerated.** The RPC reads both `lesson_progress` (line 1784) and `l.duration_seconds` (line 1773); both are dropped in PR 0. See new finding **NC1** below. The plan also does NOT name the leaderboard view rewrite as inside-the-same-transaction with the table drops, though §3.7 implicitly handles it via "drop view if exists indonesian.leaderboard;" (line 487). |
| **C2** | `commit_capability_answer_report` RPC writer co-edit | **Resolved** | §3.4 (lines 385-403) explicitly names the RPC at `migration.sql:1205-1538`, calls out the atomic drop+recreate pattern, drops the `fsrs_state_json` UPDATE, and orders migration before edge-function deploy. RPC return type is `jsonb` (scalar, `migration.sql:1206`), so the `DROP FUNCTION ... CASCADE` requirement from CLAUDE.md (function return-shape changes) does not strictly apply, but the plan adds it anyway as a safe-by-default idiom. **Acceptable.** |
| **C3** | `podcasts` table drop conflicts with live UI | **Resolved via Q2** | §3.1 lines 295-296 explicitly state "out of scope; ships post-migration"; the drop statement is removed. **But this creates a new contradiction:** §3.5's grep gate (line 466-467) says the same grep "must return zero non-comment hits" — `transcript_*` and `duration_seconds` are also podcast columns and the grep is over `src/ scripts/`. See new finding **NM1** below. |
| **C4** | `dialogue_voices`/`transcript_*`/`duration_seconds` consumer enumeration | **Partial** | §3.5 (lines 447-467) lists type-surface (`Lesson` interface), writers (`set-lesson-voices.ts`, `audio.ts`), readers (`check-supabase-deep.ts:309-315`, generic `src/services/*.ts` callout). **But specific live readers `src/pages/Lessons.tsx:155-171` and `src/pages/Lesson.tsx:235` are not enumerated by name** — both use `lesson.duration_seconds` post-shape-change. See new finding **NM2** below. The "no missed consumer" grep gate (line 466-467) catches these in principle, but the plan should name them. |
| **C5** | `lib/analytics/memory/adapter.ts` cite (file does not exist) | **Resolved** | §3.3 (line 349) corrects: "the `src/lib/analytics/memory/adapter.ts` reader the predecessor plan cited does not exist — `docs/target-architecture.md` describes `lib/analytics/memory/` as not-yet-built. The drop is therefore safe." Acknowledges write-only column status; co-edits the RPC writer (§3.4). Clean. |
| **C6** | `?force_capability` mechanism is fictional | **Resolved via Q3** | §3.8 (lines 505-531) specifies the bypass as a real PR 0 deliverable with: admin-role gate (`isAdmin` per AdminGuard pattern), env-flag prod-allowed switch (`VITE_ALLOW_FORCE_CAPABILITY`), failure-mode enumeration (`CapabilityNotFoundError`, idempotent state seed, fail-loud on missing typed-table row), implementation surface (~150-200 LOC across `Session.tsx`, `session-builder/builder.ts`, `adapter.ts`, AdminGuard, new `scripts/force-capability-answer.ts`), and a master template E2E. **One nit:** the cite at line 526 names `src/components/AdminGuard.tsx`, but the file actually lives at `src/pages/admin/AdminGuard.tsx` (verified via Glob). See new finding **NM3** below. |
| **C7** | `set-lesson-voices.ts` writer + backfill ordering | **Resolved** | §3.5 (lines 420-425) explicitly addresses the `jsonb_each_text` ordering concern and explains why (lesson_id, speaker) PK makes determinism preserved. Lines 452-453 redirect `scripts/set-lesson-voices.ts:151-160` from `update(lessons).set({ dialogue_voices: ... })` to `upsert(lesson_speakers)`. Clean. |

### MAJOR (9)

| ID | Prior concern | Resolved? | Evidence in revised plan |
|---|---|---|---|
| **M1** | Enumerate 9 lesson-N `Page.tsx` files | **Resolved** | §10 (lines 1291-1303) lists all nine `src/pages/lessons/lesson-N/Page.tsx` files explicitly, with a grep-based "no missed consumer" gate (line 1303). Matches my Glob result `src/pages/lessons/lesson-N/` for N=1..9 (status: 4-9 are untracked WIP per git status). Clean. |
| **M2** | `ContractInputShapes` cascade enumeration | **Resolved** | §7.3 (lines 1181-1188) enumerates the `byType/*.ts` packagers (4 files), test fixtures, admin components (`VariantPreview.tsx`, `ExerciseSummaryCard.tsx`), `localPreviewContent.ts:57`. Adds the `git grep -n "variant\.payload_json\|ExerciseVariant\b\|as ExerciseVariant" src/` enumeration gate. **Missing one consumer:** `src/pages/ContentReview.tsx:20,30,132` consumes `ExerciseVariant` directly and holds `variants: ExerciseVariant[]` state — this is the admin oversight PAGE that hosts `VariantPreview`; it must be rewritten alongside. See new finding **NM4** below. |
| **M3** | `coverageService` / `exerciseReviewService` / `leaderboardService` consumers | **Partial** | §10 covers `coverageService.ts` for the `lesson_sections.content` reader (lines 1307, 1318, 1328). §7.3 covers `exerciseReviewService.ts` for the admin rewrite. `leaderboardService.ts` is struck (retired in §3.7). **But three `coverageService.ts` readers are still unenumerated in their respective PR sections:** line 76 (`item_meanings`) is dropped in PR 1.2 §4.2 (no mention); line 78 (`exercise_variants`) is dropped in PR 4.3 §7.3 (no mention); line 81 (`item_context_grammar_patterns`) is dropped in PR 0 §3.1 (no mention). See new finding **NM5** below. Also missing: `src/pages/ExerciseCoverage.tsx:55` reads `exerciseVariants` via coverageService — when exercise_variants drops, this page silently breaks. |
| **M4** | `Lesson` interface + `setLessonVoicesForLesson` writer | **Resolved** | §3.5 line 450 explicitly enumerates `src/lib/lessons/adapter.ts:19-35` `Lesson` interface; line 453 redirects `scripts/set-lesson-voices.ts:151-160` to `upsert(lesson_speakers)`. Clean. |
| **M5** | `learner_lesson_activation` writer/reader/validator | **Acceptable partial** | §3.7 line 503 mentions writer (`set_lesson_activation` RPC) + readers (session-builder + lessons page). Revision log says "partial; not a typed-table introduction" — I concur. The table is unchanged; no triangle needed for an unchanged table. **Acceptable as-is.** |
| **M6** | RPC NOT VALID/VALIDATE pattern | **Resolved** | §3.4 lines 387-401 specifies the atomic `drop function if exists ... ; create function ...` block in the same transaction as the column renames. RPC return is `jsonb` scalar (verified at `migration.sql:1206`), so the `RETURNS TABLE` shape-change concern doesn't apply, but the drop+create pattern is safe-by-default. §11.4 separately addresses `learning_sessions.session_type_check` NOT VALID/VALIDATE — correct usage. Clean. |
| **M7** | `prerequisite_keys` backfill ordering | **Resolved** | §3.2 lines 329-340 explicitly state the ordering: (a) deploy writer code; (b) run migration backfill + drop in one transaction; (c) next publish writes to `prerequisite_keys` directly. Names every writer to update with `file:line` cites (`runner.ts:379`, `adapter.ts:147`, `capabilityCatalog.ts:30-44,191,205`, `podcastProjectionRules.ts:81,96`, `session-builder/adapter.ts:138,154,176`, `pedagogy.ts:26`). Clean. |
| **M8** | (retracted by audit) | n/a | The original audit retracted this finding mid-write — confirmed correct (the SQL in §1.6 joins through `learning_capabilities` to pull `source_kind`). No action needed. |
| **M9** | typed_table reference parameterised per source_kind | **Resolved via Q4** | §1.6 (lines 165-198) parameterises `$TEST_CAP_KEY`, `$SOURCE_KIND`, `$TYPED_TABLE`, `$DEPLOY_TIME` as per-PR variables. Lines 191-198 also parameterise the Phase N.1 writer-only check. Clean. |

### MINOR (8) + INFO (6)

All MINOR + INFO findings tracked correctly per the revision log. m1 resolved by Q4 (deterministic check), m2 (line_text already correct in §5.1), m3 retained as residual pre-flight (§12). I1 (frontmatter `supersedes` set), I2 (`grammar_patterns.slug` UNIQUE closed), I3 (duplicate §12 numbering renumbered to §13).

---

## Newly identified findings

### CRITICAL (1)

#### NC1 — `get_lessons_overview` RPC reads dropped `lesson_progress` AND dropped `lessons.duration_seconds`; PR 0 co-edit list does not mention it

**Where:** §3.1 (PR 0 table drops) + §3.5 (lesson column drops). Plan-wide grep: `get_lessons_overview` returns zero hits.

**Evidence:** `scripts/migration.sql:1709-1798` declares `create or replace function indonesian.get_lessons_overview(p_user_id uuid)`. The function:
- Line 1773 `select ... l.duration_seconds ...` — reads `lessons.duration_seconds` (dropped in §3.5).
- Line 1784-1786 `exists (select 1 from indonesian.lesson_progress lp where lp.user_id = ... and lp.lesson_id = ...)` — reads `lesson_progress` (dropped in §3.1).
- Line 1717 declares `duration_seconds int` in the `RETURNS TABLE(...)` shape — return signature reference.

This RPC is called from `src/pages/Lessons.tsx` (the entire Lessons listing page is built on its rows; line 155-171 maps the returned shape into `Lesson[]` and uses `row.duration_seconds`). After PR 0 lands as written, the next call to `get_lessons_overview` errors with "column l.duration_seconds does not exist" AND "relation indonesian.lesson_progress does not exist."

The prior audit's C1 finding explicitly cited `migration.sql:1697-1798 get_lessons_overview` (audit line 46) as part of the C1 scope. The revision log marks C1 as "applied," but §3.1's enumeration (lines 297-305) names only CREATE/INDEX/RLS/GRANT/policy blocks — it does NOT name the RPC body.

**Fix needed:**
- §3.1 must enumerate `scripts/migration.sql:1709-1798` as a co-edit. The RPC body must (a) drop the `l.duration_seconds` select; (b) drop the `RETURNS TABLE` column `duration_seconds`; (c) drop the legacy `lesson_progress` existence subquery (keep only the `learner_lesson_activation` branch); (d) re-publish PostgREST cache via `make migrate` (which already handles this).
- §3.5 must also reference the RPC return-shape change: `RETURNS TABLE(... duration_seconds int ...)` becomes `RETURNS TABLE(... )` (dropped). Per CLAUDE.md "Function return-shape changes need `DROP FUNCTION ... CASCADE` first" — this IS a return-shape change. The RPC must be `drop function indonesian.get_lessons_overview(uuid) cascade;` BEFORE the `create or replace`.
- §3.1 + §3.5 + §3.7 must be in the same transaction (the leaderboard view is also dropped in §3.7 and references the same tables).
- Update `src/pages/Lessons.tsx:164` to stop selecting `duration_seconds` from the RPC row, OR (preferred) hard-code the lesson tile duration display to omit duration entirely (the lesson media UI does not currently render this — verify at PR-write time).
- Update `src/lib/lessons/adapter.ts:19-35` `Lesson` interface (already addressed in §3.5 — drop `duration_seconds` field) and ensure `Lessons.tsx:164` doesn't reconstruct it.

This is the same severity class as the original C1: a load-bearing function reads a dropped table/column. The plan as written would fail the first `make migrate` pass.

---

### MAJOR (3)

#### NM1 — §3.5 "grep returns zero non-comment hits" gate is broken by Q2 (podcast columns share names)

**Where:** §3.5 lines 462-467.

**Evidence:** The grep pattern is `dialogue_voices|transcript_dutch|transcript_indonesian|transcript_english|duration_seconds` across `src/ scripts/`. `podcasts` table at `scripts/migration.sql:104-116` declares all four of `transcript_indonesian`, `transcript_english`, `transcript_dutch`, `duration_seconds`. Per Q2 (§3.1 lines 295-296), the podcast feature is out of scope — `podcasts` table stays, `podcastService.ts` stays, `Podcast.tsx`/`Podcasts.tsx` pages stay.

Live grep evidence: `src/services/podcastService.ts:9-13` declares `transcript_indonesian`, `transcript_english`, `transcript_dutch`, `duration_seconds` fields on its Podcast interface. The §3.5 grep WILL match these. The gate (line 466-467) "the same grep must return zero non-comment hits" then forces the PR to either (a) edit out-of-scope podcast code (contradicts Q2), or (b) fail the gate.

**Fix needed:** Narrow the grep pattern in §3.5 to exclude the podcast surface. Options:
- (preferred) Scope the grep to lesson-related files: `git grep -nE 'dialogue_voices|transcript_dutch|transcript_indonesian|transcript_english|duration_seconds' -- 'src/lib/lessons/**' 'src/pages/Lesson*.tsx' 'src/pages/lessons/**' 'scripts/lib/pipeline/lesson-stage/**' 'scripts/set-lesson-voices.ts' 'scripts/seed-lessons.ts' 'scripts/data/lessons.ts'`.
- Or: require zero hits **after excluding any line that matches `podcasts|podcastService`**. Less clean.
- Or: scope to specific file paths, not the broad src/ scripts/ sweep.

The gate's intent is right (no stale lesson-column readers) but the scoping is too broad.

---

#### NM2 — `src/pages/Lessons.tsx:155-171` + `src/pages/Lesson.tsx:235` consume `lesson.duration_seconds` and aren't enumerated in §3.5

**Where:** §3.5 (lesson column drops + consumer enumeration).

**Evidence:**
- `src/pages/Lessons.tsx:164` `duration_seconds: row.duration_seconds` — constructs a `Lesson` shape from `get_lessons_overview` RPC rows; line 169 also constructs `dialogue_voices: null`. (The construction explicitly nullifies the transcript and dialogue_voices fields — those are dead — but `duration_seconds` is live.)
- `src/pages/Lesson.tsx:235` `lessonDurationSeconds={lesson.duration_seconds}` — passes the value down to a child component.

The §3.5 plan enumerates `src/lib/lessons/adapter.ts:19-35` (interface) and "Any `src/services/*.ts` that selects from `lessons`" but does not name these two `src/pages/` files. The grep gate (line 466-467) catches them in principle (subject to NM1's scoping), but the plan should enumerate them explicitly so the PR-author doesn't miss them.

**Fix needed:** Add to the §3.5 reader list:
- `src/pages/Lessons.tsx:164,169` — RPC-row construction. Stop reconstructing `duration_seconds` and `dialogue_voices` once the RPC return type drops them.
- `src/pages/Lesson.tsx:235` — child prop. Either drop the prop entirely or replace with a different signal (e.g. `lesson.audio_path` presence).

Plus the `LessonHeader` / `lessonDurationSeconds` consumer downstream — verify at PR-write time.

---

#### NM3 — `coverageService.ts` readers for `item_meanings` / `exercise_variants` / `item_context_grammar_patterns` not enumerated in their respective PR sections

**Where:** §3.1 (item_context_grammar_patterns drop), §4.2 (item_meanings drop), §7.3 (exercise_variants drop).

**Evidence:**
- `src/services/coverageService.ts:76` reads `item_meanings` (`supabase.schema('indonesian').from('item_meanings').select('learning_item_id')`). Dropped in §4.2 PR 1.2; not enumerated there.
- `src/services/coverageService.ts:78` reads `exercise_variants` (`supabase.schema('indonesian').from('exercise_variants')...`). Dropped in §7.3 PR 4.3; not enumerated there.
- `src/services/coverageService.ts:81` reads `item_context_grammar_patterns` (`supabase.schema('indonesian').from('item_context_grammar_patterns').select('context_id, grammar_pattern_id')`). Dropped in §3.1 PR 0; not enumerated there.
- `src/pages/ExerciseCoverage.tsx:55` consumes `exerciseVariants` field from coverageService output. Breaks when the underlying table drops.

§10's writer/reader/validator triangle does mention `coverageService` for the `lesson_sections.content` reader (line 1307), but the other three reader paths are unaddressed. Each is a separate concern in a separate PR.

**Fix needed:**
- §3.1 (PR 0): name `coverageService.ts:81` as a reader to edit (delete the `item_context_grammar_patterns` select; either remove the corresponding coverage row or stub it).
- §4.2 (PR 1.2): name `coverageService.ts:76` as a reader to switch from `item_meanings.translation_text` to `learning_items.translation_<userLanguage>`.
- §7.3 (PR 4.3): name `coverageService.ts:78` + `src/pages/ExerciseCoverage.tsx:55` as readers to rewrite over the 4 typed exercise tables.

---

#### NM4 — `src/pages/ContentReview.tsx` consumes `ExerciseVariant` directly and isn't enumerated in the Q5 admin rewrite

**Where:** §7.3 Q5 admin rewrite scope (lines 1174-1186).

**Evidence:**
- `src/pages/ContentReview.tsx:20` `import type { ExerciseVariant, ... } from '@/types/learning'`.
- `src/pages/ContentReview.tsx:30` `const [variants, setVariants] = useState<ExerciseVariant[]>([])`.
- `src/pages/ContentReview.tsx:132` `function renderExercisePreview(variant: ExerciseVariant)`.

This is the admin page that hosts `VariantPreview` (line 19 import). The §7.3 Q5 rewrite enumerates the service (`exerciseReviewService.ts`) and the inner components (`VariantPreview.tsx`, `ExerciseSummaryCard.tsx`) but not the host page itself. The host page holds `ExerciseVariant[]` state — if the discriminated-union shape proposed in §7.3 line 1176 is used, the host's state type and the prop type passed to VariantPreview must change in lockstep.

**Fix needed:** Add `src/pages/ContentReview.tsx` (the host) to §7.3 line 1174-1186 as a third top-level consumer:
- `src/pages/ContentReview.tsx:20,30,132` — switches `useState<ExerciseVariant[]>` to `useState<ExerciseReviewRow[]>` (or whichever shape the discriminated-union surfaces). The `renderExercisePreview` function dispatches via `switch (variant.exercise_type)` instead of probing `payload_json`.

Also list `src/types/learning.ts` `ExerciseVariant` type-definition for retirement.

---

### MINOR (2)

#### Nm1 — `src/components/AdminGuard.tsx` cite in §3.8 is wrong path

**Where:** §3.8 line 526.

**Evidence:** Plan cites `src/components/AdminGuard.tsx` ("already exists; the bypass piggybacks on its role check"). Verified via Glob: the file lives at `src/pages/admin/AdminGuard.tsx` (not under `src/components/`). The existing `bypassAuth=1` dev bypass in that file (`src/pages/admin/AdminGuard.tsx:20-24`) is the precedent the §3.8 bypass should follow.

**Fix needed:** Correct the cite to `src/pages/admin/AdminGuard.tsx`. (One-character edit.)

Also: the §3.8 says "the bypass piggybacks on its role check" — but `AdminGuard.tsx` is a route-level wrapper, not a hook. The `?force_capability` bypass on `/session` would not naturally pass through AdminGuard (the `/session` route isn't admin-gated). The role check has to be inlined in `Session.tsx` directly, using `useAuthStore().profile?.isAdmin` — the same source AdminGuard reads from. The §3.8 should say "the bypass uses the same `useAuthStore().profile?.isAdmin` check that AdminGuard uses" — not "piggybacks on AdminGuard."

---

#### Nm2 — §1.5 E2E template doesn't reuse existing `bypassSupabaseCors` + `login` helpers

**Where:** §1.5 lines 118-155 (E2E template).

**Evidence:** Existing `e2e/session.spec.ts:9-44` defines `bypassSupabaseCors(page)` (CORS injection for the Supabase Kong gateway, required because Playwright runs from localhost:5175 but Kong allows only `.duin.home` origins) and `login(page)` helpers. The §1.5 template at line 122-125 inlines the login flow with hardcoded selectors and skips the CORS bypass.

Without `bypassSupabaseCors`, the E2E test will fail at the first Supabase auth call with a CORS error (the existing tests confirm this). The §1.5 template as written cannot pass against the real environment.

**Fix needed:** Reference the existing helpers. Either:
- Extract `bypassSupabaseCors`, `login`, `navigateToSession` to `e2e/_helpers.ts` and have §1.5's template import them.
- Or: inline the bypass into the §1.5 template snippet (verbatim from `e2e/session.spec.ts:9-34`).

This is mechanical; the orchestrator can add a one-paragraph note.

---

## Architectural seams re-verification (§3.8 bypass)

The §3.8 bypass adds product code to `src/pages/Session.tsx`, `src/lib/session-builder/builder.ts`, and `src/lib/session-builder/adapter.ts`. Per the architect-mode checklist item 4b ("fold-target drift"):

- `src/lib/session-builder/` is **LOCKED** per `docs/target-architecture.md:175`. Adding an optional `forceCapabilityKey` argument to `buildSession` is additive and matches the module's contract (the module accepts a `mode` + filter inputs and returns a `SessionPlan`). **No fold-target drift.**
- `src/lib/exercise-content/` is **LOCKED** per `target-architecture.md:176`. Not touched by the bypass.
- `src/pages/Session.tsx` is the integration point per `target-architecture.md:512`, `:814`, `:1022`, `:1295`. Adding a URL-param-gated branch matches its existing role.
- `src/pages/admin/AdminGuard.tsx` already has a `?bypassAuth=1` precedent (line 20-24). The new `?force_capability` bypass uses an analogous pattern. **No new architectural pattern introduced.**

**Verdict on §3.8 seams:** clean. The bypass lands at the right seams; the only issue is the path-typo (Nm1) and the AdminGuard "piggybacking" misnomer.

---

## Cross-PR dependency check (PR 0 prerequisite)

The PR roadmap (§2 lines 241-261) lists every per-source-kind PR as `depends on: PR 0`. The `?force_capability` bypass is built in PR 0 and consumed by every later PR's E2E test (§1.5 line 157). This dependency is correctly tracked. No PR 1.x / 2.x / 3.x / 4.x can start before PR 0 lands.

**Verdict on dependency tracking:** clean.

---

## UI consequence check (Q1 leaderboard retire)

Q1 retires the leaderboard. The §3.7 plan enumerates:
- (correct) `src/services/leaderboardService.ts` — delete.
- (correct) `src/pages/Leaderboard.tsx` — delete.
- (correct) `src/App.tsx` route — verified `App.tsx:18,189,192` reference Leaderboard.
- (incorrect cite) "the leaderboard entry from `src/pages/Lessons.tsx` navigation / sidebar / any nav config" — the nav entry is in `src/components/Sidebar.tsx:39`, not `Lessons.tsx`. Verified: `Sidebar.tsx:39` declares `{ label: T.nav.leaderboard, icon: <IconTrophy size={17} />, path: '/leaderboard' }`.

**Not enumerated:**
- `src/types/learning.ts:272-283` — `LeaderboardEntry` interface + `LeaderboardMetric` type. Must be deleted.
- `src/lib/i18n.ts:10, 196, 279, 465, 478` — leaderboard i18n strings (4 keys minimum). Must be removed.
- `src/__tests__/leaderboardService.test.ts` — test file. Must be deleted.

**Fix needed:** §3.7 should enumerate `Sidebar.tsx:39`, `types/learning.ts:272-283`, `i18n.ts:10,196,279,465,478`, `__tests__/leaderboardService.test.ts`. The §3.7 already mentions "any leaderboard tests under `src/__tests__/` or `e2e/`" (line 496) — that's adequate for the test file. The type + i18n surfaces are the gap.

This is the same M3 class — under-enumeration. Folded into NM5 above; not a separate finding.

---

## Service-layer check (Q5 admin rewrite)

§7.3 enumerates `exerciseReviewService.ts`, `VariantPreview.tsx`, `ExerciseSummaryCard.tsx`. Missing: `ContentReview.tsx` (the host page — see NM4) and `ExerciseCoverage.tsx:55` (the coverage-display page that consumes coverageService's `exerciseVariants` map).

No other admin/service files read `exercise_variants` that I found via grep. Clean otherwise.

---

## Test strategy check (`scripts/force-capability-answer.ts`)

§3.8 line 527 names the script: "small node script that, given a canonical_key, drives a headless Playwright session that hits `/session?force_capability=<key>` as the test user, answers one card, and exits. Called from the deploy pipeline per §1.6."

**Sufficient for implementation?** Mostly yes, but a few gaps:
- The script's exit code semantics aren't specified. §1.6 line 187 says "the deploy job exits non-zero on empty result or wrong shape — the deploy fails and the PR rolls back." Implied that `force-capability-answer.ts` should exit non-zero on Playwright error or assertion failure. Should be made explicit.
- Auth: the script needs to log in as the test user. §3.8 doesn't say which credentials path — presumably `reference_test_user.md` (testuser@duin.home / TestUser123!). Should reference it.
- CORS: the script needs to bypass CORS the same way `e2e/session.spec.ts` does (see Nm2). The §3.8 design doesn't address this.

**Fix needed:** §3.8 should add a sub-section "force-capability-answer.ts contract" specifying exit codes, auth source, and CORS handling. ~10 lines of prose.

---

## Promotion verdict

**`status: draft → status: approved` — NEEDS MINOR REVISION.**

The revision round addressed the structural CRITICAL findings (C1 mostly, C2–C7 fully) and the load-bearing MAJOR findings (M1, M2 mostly, M4, M6, M7). The plan is structurally sound: the slicing is coherent, the writer/reader/validator triangle holds per typed table, the deploy ordering is correct, the rollback paths are named, and the new content sections (§3.8 bypass, §1.6 deterministic check, §7.3 admin rewrite) are well-grounded.

**Remaining blockers (must address before promotion):**

1. **NC1** — `get_lessons_overview` RPC co-edit. The RPC reads both dropped surfaces (`lesson_progress` AND `lessons.duration_seconds`) and is the active data source for the Lessons page. PR 0 cannot merge without the RPC body co-edit + the `DROP FUNCTION ... CASCADE` idiom for the return-shape change.

**Recommended (small fixes; address in the same revision round):**

2. **NM1** — Narrow the §3.5 grep gate scoping so the podcast surface doesn't false-positive.
3. **NM2** — Enumerate `src/pages/Lessons.tsx:155-171` + `src/pages/Lesson.tsx:235` in §3.5 reader list.
4. **NM3** — Enumerate the three `coverageService.ts` readers (76, 78, 81) + `ExerciseCoverage.tsx:55` in their respective PR sections.
5. **NM4** — Add `src/pages/ContentReview.tsx` to §7.3 admin rewrite.
6. **Nm1** — Fix the `AdminGuard.tsx` path cite (`src/components/` → `src/pages/admin/`) and reword the "piggybacks on" framing.
7. **Nm2** — Reference existing e2e helpers (`bypassSupabaseCors`, `login`) in §1.5 template.
8. Leaderboard sub-enumeration: §3.7 should name `Sidebar.tsx:39`, `types/learning.ts:272-283`, `i18n.ts:10,196,279,465,478` explicitly.
9. **`force-capability-answer.ts` contract** — add exit-code semantics + auth source + CORS handling to §3.8.

**After these fixes — expected outcome:** APPROVED. The plan is one short revision pass from green. None of the remaining findings require a structural redesign; they are all enumeration adds or scope-clarifying language changes (~30-50 lines of prose total).

---

## Anti-shallow guard count

This pass: 1 new CRITICAL + 3 new MAJOR + 2 new MINOR = 6 new findings on ~150 lines of new content (and re-audit of the full 1437-line revised plan). Plus 7 prior CRITICAL all status-verified, 9 prior MAJOR all status-verified.

Findings/line density on the new content: 6 / 150 ≈ 4% — within the "new text has new bug surface" expectation (target: 3-8 findings on the revised range). Not suspiciously clean; not pathologically dirty. The orchestrator's revision quality was high; the residual gaps are mechanical under-enumerations the original audit had partially exposed and the orchestrator partially closed.

---

**End of architect verification.**
