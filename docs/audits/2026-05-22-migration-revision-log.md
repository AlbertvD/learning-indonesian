---
doc_type: audit-revision-log
date: 2026-05-22
target: docs/plans/2026-05-22-data-model-migration.md
applies: docs/audits/2026-05-22-migration-architect-review.md
---

# Migration plan revision log — 2026-05-22

Revised `docs/plans/2026-05-22-data-model-migration.md` against the architect's audit and the user's five Q1–Q5 decisions made in dialogue 2026-05-22. The data-architect subagent could not write directly (hook blocked subagent-Read tracking); the orchestrator (main session) applied edits via the Edit tool.

## User decisions applied

| ID | Decision | Plan location |
|---|---|---|
| Q1 | Retire the leaderboard entirely | §3.7 (rewrite from "view rewrite" → full retire); §2 PR 0 description |
| Q2 | Podcasts out of scope; ships post-migration | §3.1 (removed drop line; added explicit out-of-scope note) |
| Q3 | Build `?force_capability` dev bypass as real PR 0 deliverable | §3.8 (new); §1.5 (mention now references built bypass) |
| Q4 | Deterministic post-deploy check via bypass; no 48h wait | §1.6 (full rewrite) |
| Q5 | Rewrite admin to read four typed exercise tables | §7.3 (expanded scope) |

## Architect findings applied

### CRITICAL

| ID | Status | Plan location |
|---|---|---|
| C1 — `scripts/migration.sql` co-edits for table drops | applied | §3.1 (added enumeration + idempotency rule); §3.5, §3.7, §7.3 (co-edit notes) |
| C2 — `commit_capability_answer_report` Postgres RPC is the writer | applied | §3.4 (full writer co-edit spec; RPC body co-edit in same transaction) |
| C3 — `podcasts` table drop conflicts with live UI | applied via Q2 | §3.1 |
| C4 — `dialogue_voices` / `transcript_*` / `duration_seconds` consumer enumeration | applied | §3.5 (type-surface, writers, readers separately enumerated; grep-based no-missed-consumer gate) |
| C5 — `lib/analytics/memory/adapter.ts` reader does not exist | applied | §3.3 (correction: `fsrs_state_json` is write-only; only the RPC writes it) |
| C6 — `?force_capability` mechanism is fictional | applied via Q3 | §3.8 (mechanism made real in PR 0) |
| C7 — `dialogue_voices` backfill ordering + `set-lesson-voices.ts` writer | applied | §3.5 (ordering note added; writer redirected to `lesson_speakers` UPSERT) |

### MAJOR

| ID | Status | Plan location |
|---|---|---|
| M1 — Enumerate 9 lesson-N `Page.tsx` files | applied | §10 (full enumeration; "no missed consumer" gate via `git grep`) |
| M2 — `ContractInputShapes` cascade enumeration | applied | §7.3 (byType packagers, test fixtures, admin components, localPreviewContent enumerated) |
| M3 — `coverageService` / `exerciseReviewService` consumers | applied | §10 (coverageService); §7.3 (exerciseReviewService); leaderboardService struck (retired in §3.7) |
| M4 — `Lesson` interface + `setLessonVoicesForLesson` writer | applied | §3.5 (Lesson interface enumerated; `setLessonVoicesForLesson` switched to `upsert(lesson_speakers)`) |
| M5 — `learner_lesson_activation` writer/reader/validator | partial | §3.7 note added; full triangle in §3 still implicit. Acceptable: not a typed-table introduction. |
| M6 — RPC NOT VALID/VALIDATE pattern | applied | §3.4 (RPC body drop + recreate atomic block specified) |
| M7 — `prerequisite_keys` backfill ordering | applied | §3.2 (ordering note — writer changes ship with migration in single PR) |
| M8 — retracted by audit | n/a | — |
| M9 — typed_table reference parameterised | applied via Q4 | §1.6 (full rewrite uses parameterised `<typed_table>` and `<source_kind>`) |

### MINOR + INFO

| ID | Status | Note |
|---|---|---|
| m1 — 48h check at 2-user load | resolved by Q4 | 48h check replaced with deterministic bypass-driven check |
| m2 — `lesson_dialogue_lines.line_text` already correct | n/a | already correct in §5.1 |
| m3 — audio orphans tracking | retained as residual pre-flight | §12 |
| m4, m5, m6, m7, m8 — author judgment calls | not applied | the audit's MINOR findings; left for the author's call |
| I1 — supersedes frontmatter | already correct | frontmatter `supersedes: 2026-05-21-data-model-migration.md` set |
| I2 — `grammar_patterns.slug` UNIQUE | closed | §12 marks the residual question as closed |
| I3 — duplicate §12 numbering | applied | §13 ("What this plan does NOT cover") renumbered |
| I4 — `item_contexts` audit | retained as residual pre-flight | §12 |

## Surviving residuals

Three pre-flight verifications (not blockers; PR-author runs as pre-flight at PR-write time):

1. `item_contexts.vocabulary_list` + `lesson_snippet` runtime grep (before PR 1.2).
2. `audio_clips` orphan cleanup (during or after PR 1.3 — author's call).
3. Staging file shape verification for distractor tables (before PR 1.1).

## Verdict (after round 1 revisions)

Round-1 verdict was held pending the architect's verification pass.

---

## Round 2 — architect verification follow-ups (2026-05-22)

Architect verification at `docs/audits/2026-05-22-migration-architect-verification.md` returned `NEEDS MINOR REVISION` with 1 new CRITICAL (NC1), 3 new MAJOR (NM1–4), 2 new MINOR (Nm1–2), and small follow-ups on §3.7 + §3.8. Round 2 applied:

| ID | Finding | Plan location |
|---|---|---|
| NC1 | `get_lessons_overview` RPC reads dropped surfaces; PR 0 co-edit list missed it | §3.1 — added RPC body co-edit with `DROP FUNCTION ... CASCADE` + recreate inside the table-drop transaction; `src/pages/Lessons.tsx:155-171` mapping co-edit named |
| NM1 | §3.5 grep gate scoping false-positives on podcast columns | §3.5 — grep gate narrowed to lesson-scoped paths; `do NOT broaden` warning added; podcasts intentionally untouched per Q2 |
| NM2 | `Lessons.tsx:164,169` + `Lesson.tsx:235` `duration_seconds` consumers not enumerated | §3.5 — added "Known live readers" subsection with both files |
| NM3 part 1 | `coverageService.ts:81` reads `item_context_grammar_patterns` | §3.1 — added coverageService co-edit subsection |
| NM3 part 2 | `coverageService.ts:76` reads `item_meanings` | §4.2 — added coverage service co-edit after the existing reader rewrite |
| NM3 part 3 | `coverageService.ts:78` + `ExerciseCoverage.tsx:55` read `exercise_variants` | §7.3 — added both to the admin rewrite scope |
| NM4 | `src/pages/ContentReview.tsx:20,30,132` consumes `ExerciseVariant` | §7.3 — added the host page to the admin rewrite + `types/learning.ts` ExerciseVariant retirement |
| Nm1 | AdminGuard path wrong + "piggybacks on" framing misleading | §3.8 — path corrected to `src/pages/admin/AdminGuard.tsx`; reframed as "uses the same `useAuthStore().profile?.isAdmin` check that AdminGuard uses" (inline check, not wrapper) |
| Nm2 | §1.5 E2E template doesn't reuse `bypassSupabaseCors` + `login` helpers | §1.5 — template rewritten to be bypass-first, imports `e2e/_helpers.ts` (PR 0 extracts from `e2e/session.spec.ts:9-44`); legacy card-walk relegated to session-level smoke |
| Leaderboard sub-enum | `Sidebar.tsx:39`, `types/learning.ts:272-283`, `i18n.ts` keys, test file | §3.7 — full enumeration added with grep-based "no missed consumer" gate |
| Script contract | `force-capability-answer.ts` exit codes, auth source, CORS | §3.8 — added contract subsection with USAGE / ENV / EXIT / CORS |

**Plan size after round 2:** ~1500 lines (up from 1437; round 2 added ~65 lines of targeted enumeration).

## Verdict (after round 2)

Held pending architect verification pass.

---

## Round 3 — final architect verification follow-ups (2026-05-22)

Architect final verification at `docs/audits/2026-05-22-migration-architect-final-verification.md` returned `NEEDS MINOR REVISION` with 3 small findings — all in the example RPC body added during round-2 NC1. Round 3 applied:

| ID | Finding | Plan location |
|---|---|---|
| NC2 (CRITICAL) | Example RPC body missing explicit `security invoker` | §3.1 — added `security invoker` to the recreated `get_lessons_overview` function; matches the live function at `scripts/migration.sql:1727`; required because the function joins RLS-protected `learner_lesson_activation` |
| NM5 (MAJOR) | Example body renamed `has_started_lesson` → `is_activated` without telling consumers | §3.1 — preserved `has_started_lesson` column name in the recreated body; semantics now derive from `learner_lesson_activation` existence (equivalent under new schema); no consumer rename required at `Lessons.tsx:182` |
| Nm3 (MINOR) | Cross-reference at §1.6 line 158 said `§3.7` (leaderboard retire) instead of `§3.8` (bypass) | §1.6 — corrected to `§3.8` |

**Round-1 regression spot-check (per architect final verification):** C1, C2, C4, C7 re-verified clean. Round 2 + round 3 edits were additive; no regression.

**Plan size after round 3:** ~1510 lines (round 3 added ~10 lines).

## Verdict (after round 3)

Per the architect's final verification: "After NC2 + NM5 + Nm3 are addressed... the plan is ready for promotion to `status: approved` and PR 0 can begin." All three are addressed.

**Plan size by round:** 1300 (data-architect draft) → 1437 (round 1 revisions) → ~1500 (round 2 follow-ups) → ~1510 (round 3 micro-fixes).

The plan is ready for promotion. PR 0 (schema cleanup + slim columns + leaderboard retire + force_capability bypass build) is the first implementation work.
