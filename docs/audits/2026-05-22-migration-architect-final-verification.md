---
status: completed
doc_type: architect-final-verification
plan_audited: docs/plans/2026-05-22-data-model-migration.md
prior_audit: docs/audits/2026-05-22-migration-architect-verification.md
revision_log: docs/audits/2026-05-22-migration-revision-log.md
last_verified_against_code: 2026-05-22
verdict: NEEDS MINOR REVISION
---

# Architect final verification pass — 2026-05-22 migration plan (round 3)

**Plan under verification:** `docs/plans/2026-05-22-data-model-migration.md` (1528 lines).
**Prior verdict (round 2):** `NEEDS MINOR REVISION` (1 CRITICAL + 3 MAJOR + 2 MINOR + 2 follow-ups).
**This pass's verdict:** `NEEDS MINOR REVISION` — round 2 cleared the 9 prior findings substantively, but the new RPC body sketch in §3.1 introduces two new defects that block PR 0 from shipping as-written (one CRITICAL, one MINOR). Both are localised to ~25 lines around lines 310-332; one cross-reference is wrong in §1.6. No structural rework needed.

**One-paragraph summary.** Round 2 was high-quality: NC1's `get_lessons_overview` co-edit landed with the correct `DROP FUNCTION ... CASCADE` idiom; NM1's grep scoping narrowed cleanly to lesson paths; NM2 enumerated the two `duration_seconds` consumers explicitly; NM3 distributed three `coverageService.ts` reader fixes across the right PR sections (§3.1 / §4.2 / §7.3); NM4 added `ContentReview.tsx:20,30,132` to §7.3; the AdminGuard path was corrected and the framing reworded inline; the §1.5 E2E template now imports from `e2e/_helpers.ts` extracted in PR 0; leaderboard sub-enumeration in §3.7 is complete (`Sidebar.tsx:39`, `types/learning.ts:272-283`, `i18n.ts` keys, `__tests__/leaderboardService.test.ts`); the `force-capability-answer.ts` contract gained USAGE / ENV / EXIT / CORS subsections. However the NC1 fix added an *example* RPC body at lines 314-331 that (a) omits `security invoker` (the live function at `migration.sql:1727` is `security invoker`; without that declaration the recreated function will run as the calling role and break the join to `learner_lesson_activation`, which has RLS), and (b) introduces a brand-new return-shape `is_activated` while silently retiring `has_started_lesson` — but `src/pages/Lessons.tsx:178,182,193` consume `row.has_started_lesson` and the §3.1 prose only tells the PR author to drop `row.duration_seconds`, not to renamethem to the new field. The PR-as-written would either compile but show every lesson as un-started (Lessons.tsx silently treats `undefined` as falsy) or fail TypeScript on the consumer side. One short revision pass clears this.

---

## Iteration log

- Round 1 (data-architect draft → architect review #1): 30 findings.
- Round 2 (orchestrator applied Q1–Q5 + audit fixes): re-audited; 6 new findings.
- Round 3 (this pass): 2 new findings on the round-2 edits + 1 cross-reference typo.

---

## Status of round-2 findings

### CRITICAL

#### NC1 — `get_lessons_overview` RPC co-edit
**Status:** Substantively resolved at §3.1 lines 302-334. **But the example RPC body introduces two new defects (see new findings NC2 + NM5 below).**

The §3.1 prose correctly identifies: the RPC at `scripts/migration.sql:1709-1798`; the load-bearing role for `Lessons.tsx`; the three dropped surfaces (`l.duration_seconds`, `lesson_progress`, the `RETURNS TABLE` shape); and the `DROP FUNCTION ... CASCADE` idiom (line 312, verified `cascade` keyword present). The Lessons.tsx mapping co-edit is named at line 334. Atomic-transaction requirement is stated at line 311 ("Atomic block (same transaction as the §3.1 table drops)"). This portion is clean.

### MAJOR

#### NM1 — §3.5 grep gate scoping
**Status:** Resolved at §3.5 lines 498-516. The grep is now scoped to `'src/lib/lessons/**'`, `'src/pages/Lesson*.tsx'`, `'src/pages/lessons/**'`, `'src/pages/Dashboard.tsx'`, `'scripts/lib/pipeline/lesson-stage/**'`, `'scripts/set-lesson-voices.ts'`, `'scripts/seed-lessons.ts'`, `'scripts/data/lessons.ts'`, `'scripts/check-supabase-deep.ts'`. Line 516 adds the explicit warning "**Do NOT broaden the grep to the full `src/ scripts/` sweep** — the podcast surface is intentionally untouched per Q2". Verified no false-positive on podcast surface — `src/services/podcastService.ts` is not in the scoped paths.

#### NM2 — `Lessons.tsx:164,169` + `Lesson.tsx:235` enumeration
**Status:** Resolved at §3.5 lines 491-495. Both files named with `file:line` cites. Verified against the live code:
- `src/pages/Lessons.tsx:164` assigns `duration_seconds: row.duration_seconds`. Confirmed at the actual file.
- `src/pages/Lessons.tsx:169` assigns `dialogue_voices: null` — already nullified. Confirmed.
- `src/pages/Lesson.tsx:235` `lessonDurationSeconds={lesson.duration_seconds}`. Confirmed.

#### NM3 — coverageService readers in three PR sections
**Status:** Resolved across three locations:
- §3.1 line 336 — `coverageService.ts:81` (`item_context_grammar_patterns` reader). Verified at the live file: line 81 reads `from('item_context_grammar_patterns')`.
- §4.2 line 768 — `coverageService.ts:76` (`item_meanings` reader). Verified: line 76 reads `from('item_meanings')`.
- §7.3 line 1255 — `coverageService.ts:78` (`exercise_variants` reader). Verified: line 78 reads `from('exercise_variants')`.
- §7.3 line 1256 — `ExerciseCoverage.tsx:55` consumes `exerciseVariants`. Verified: line 55 reads `label: 'exercise_variants in DB'` (the rendered coverage row).

Clean.

#### NM4 — `ContentReview.tsx` host page in §7.3
**Status:** Resolved at §7.3 lines 1249-1252. All three cites verified against the live code:
- Line 20: `import type { ExerciseVariant, ... } from '@/types/learning'` — confirmed.
- Line 30: `useState<ExerciseVariant[]>([])` — confirmed.
- Line 132: `function renderExercisePreview(variant: ExerciseVariant)` — confirmed.

`types/learning.ts` `ExerciseVariant` retirement named at §7.3 line 1257. Clean.

### MINOR

#### Nm1 — AdminGuard path + framing
**Status:** Resolved at §3.8 lines 579-580. Path corrected to `src/pages/admin/AdminGuard.tsx`. Verified: file exists at that path; the existing `bypassAuth=1` dev escape is at lines 20-24 (matches the plan's reference). The "piggybacks on" language is replaced with "the bypass uses **the same `useAuthStore().profile?.isAdmin` check that AdminGuard uses** — not AdminGuard itself as a wrapper" (line 579). Clean.

#### Nm2 — §1.5 E2E template imports helpers
**Status:** Resolved at §1.5 lines 118-150. Template now imports `bypassSupabaseCors` + `login` from `e2e/_helpers.ts`. Line 118 explicitly notes the helpers are extracted in PR 0 from `e2e/session.spec.ts:9-44` — verified the existing inline `bypassSupabaseCors` is at exactly lines 9-34 and `login` at lines 36-44 in the current `e2e/session.spec.ts`. The template uses `bypassSupabaseCors(page)` + `login(page, { admin: true })` — the `{ admin: true }` flag is a forward-looking parameter the PR 0 helper extraction must support (no current `login` accepts an admin variant; the current helper hardcodes `TEST_EMAIL = 'testuser@duin.home'`).

**Note (not a finding):** the PR 0 helper extraction has a small open detail: either `login()` accepts `{ admin: true }` and routes to a separate admin credential, or the test always logs in as the test user and grants that user the admin role server-side. The plan doesn't specify; either is defensible. The §3.8 ENV block at line 590 names `TEST_USER_EMAIL` only — no `ADMIN_TEST_USER_EMAIL`. PR 0 author will resolve.

### Follow-ups

#### Leaderboard sub-enumeration
**Status:** Resolved at §3.7 lines 545-549. All four targets enumerated:
- `Sidebar.tsx:39` — verified: line 39 is the `{ label: T.nav.leaderboard, ... }` entry.
- `types/learning.ts:272-283` — verified: lines 272-283 are the `LeaderboardEntry` interface + `LeaderboardMetric` type.
- `i18n.ts` keys — verified via Grep: 6 hits at lines 10, 196, 279, 465, 466, 478. The plan says "at lines `10, 196, 279, 465, 478`" (line 547) — misses line 466 (`title: 'Leaderboard'`) which is inside the section header opened at line 465 (`leaderboard: {`). Negligible: the PR-author is directed to verify via `git grep -n "leaderboard" src/lib/i18n.ts` and remove each (line 547). The grep gate at line 549 catches anything missed.
- `__tests__/leaderboardService.test.ts` — covered by line 543.

Clean.

#### `force-capability-answer.ts` contract
**Status:** Resolved at §3.8 lines 583-597. USAGE / ENV / EXIT / CORS subsections present. Exit codes 0/1/2/3 distinguish bypass URL failure, capability-not-found, missing-typed-row, and answer-not-logged — the four likely failure modes. ENV references `reference_test_user.md` defaults. CORS handled via `bypassSupabaseCors()` from `e2e/_helpers.ts`. Implementable as a real script. Clean.

---

## Newly identified findings (round-3 surface)

### CRITICAL (1)

#### NC2 — Example `get_lessons_overview` body in §3.1 omits `security invoker`; recreated function will run as caller role and either bypass RLS (if invoker is admin) or break the join to RLS-protected `learner_lesson_activation`

**Where:** §3.1 lines 314-331 (the example RPC body the orchestrator added to address NC1).

**Evidence:** the live function at `scripts/migration.sql:1727` declares `language sql stable security invoker as $$` — explicit `security invoker`. The plan's example at line 319 declares only `language sql stable as $$` — `security invoker` is OMITTED.

This matters because the recreated function joins `indonesian.learner_lesson_activation` (which has RLS enabled). The default function security mode in Postgres is `SECURITY INVOKER` for `LANGUAGE SQL` — so technically the plan's body would work — but per the architect-mode hard constraint ("SECURITY INVOKER + RLS-protected join requires authenticated-role test in the spec") the declaration must be explicit to make the intent legible. The current `migration.sql:1727` comment chain (lines 1697-1707, "Re-anchored 2026-05-20 (Phase 1 of retiring lesson_page_blocks)") explicitly calls out the SECURITY INVOKER property as load-bearing.

More importantly: the live RPC also relies on `learner_capability_state` (via `lesson_capabilities` CTE at lines 1737-1739) which has RLS. The 2026-05-08 lesson-reader outage was precisely a `SECURITY INVOKER` + RLS-protected-join class — when RLS denies, the row comes back as zero with no error.

**Fix needed:** the §3.1 example body must declare `language sql stable security invoker as $$` explicitly (one keyword). The §3.1 prose should also remind the PR-author that the recreated function joins RLS-protected tables and the post-deploy bypass test (§1.6) is the SECURITY-INVOKER-over-RLS gate.

**Severity rationale:** CRITICAL per the architect-mode hard constraint list — "SECURITY INVOKER + RLS-protected join requires authenticated-role test in the spec." The plan's example shifts the RPC's documented security mode without acknowledging it; that is exactly the spec-level lapse the constraint exists to catch.

---

### MAJOR (1)

#### NM5 — Example `get_lessons_overview` body in §3.1 silently retires `has_started_lesson` and replaces it with `is_activated`; Lessons.tsx consumers of `has_started_lesson` are not enumerated as needing the rename

**Where:** §3.1 lines 314-334 (the example RPC body + the line-334 Lessons.tsx co-edit instruction).

**Evidence:** The live RPC at `migration.sql:1727-1796` returns a row with column `has_started_lesson` (line 1787 `... ) as has_started_lesson,`). `src/pages/Lessons.tsx` consumes this:
- Line 178: `// After retirement #6, has_started_lesson is the union of ...` (comment)
- Line 182: `if (row.has_started_lesson) {` — the live read
- Line 186: `started: true,` (uses the value from line 182)
- Line 193 area: subsequent code paths fan out on the `exposures` array driven by `has_started_lesson`

The plan's example at lines 322-328 silently REPLACES `has_started_lesson` with `is_activated` AND drops the `lesson_progress` branch of the union (which is correct given §3.1 drops `lesson_progress`). But the §3.1 prose at line 334 only directs the PR-author to "drop that assignment" referring to `row.duration_seconds` — not to rename `row.has_started_lesson` to `row.is_activated` throughout `Lessons.tsx`.

If the PR ships the plan literally, one of two failure modes lands:
1. The example body is used verbatim → the RPC returns `is_activated` and `Lessons.tsx:182` reads `row.has_started_lesson` which becomes `undefined`; every lesson tile silently shows as not-started. Symptom: dashboard says "no lessons started" for every user with activations.
2. The PR-author intuits the rename and updates Lessons.tsx → but no spec-level enumeration of the `has_started_lesson` consumers exists; the audit blind spot from rounds 1-2 (the audit verified `duration_seconds` consumers but not `has_started_lesson` consumers) carries forward.

**Fix needed:** the §3.1 RPC body must either:
- (a) preserve the `has_started_lesson` column name (rename `is_activated` back to `has_started_lesson` in the recreated function) — the value semantics are equivalent (existence of `learner_lesson_activation` row), and the column name preserves the existing consumer surface. Lessons.tsx needs no rename. This is the minimum-touch fix.
- (b) Keep the rename, but enumerate every `row.has_started_lesson` consumer (at minimum `Lessons.tsx:178,182` based on round-3 grep; verify via `git grep -n "has_started_lesson" src/`) and the prose at line 334 must direct the PR-author to perform the rename.

Recommendation: option (a). The renaming creates code-churn for no semantic gain; the existing column name is already correct under the new semantics (lesson is started iff activated).

**Severity rationale:** MAJOR (not CRITICAL) because the production-runtime fail mode is a silent UI regression rather than a crash; the §3.5 grep gate would not catch this (it greps for lesson columns, not RPC-row consumers); but a competent PR-author following the §1.6 deterministic post-deploy check WILL see the dashboard regression. Still: enumeration is the architect's job and round 2 missed it.

---

### MINOR (1)

#### Nm3 — §1.6 line 158 cross-reference to §3.7 should be §3.8

**Where:** §1.6 line 158: `the ?force_capability=<canonical_key> dev bypass (built in PR 0, see §3.7) is exercised once per source_kind affected by the PR:`

**Evidence:** §3.7 is "Retire the leaderboard" (line 531: `### 3.7 Retire the leaderboard (decision Q1, 2026-05-22)`). The bypass is built in §3.8 (line 558: `### 3.8 Build the ?force_capability dev bypass (decision Q3, 2026-05-22)`). Same typo also appears at §1.6 line 158 stem of the cross-reference. The bypass is correctly cross-referenced as §3.8 in 4+ other places in the document (e.g. §1.5 line 118, §13 line 1503), and the document body has §3.8 in the right place.

**Fix needed:** one-character edit on line 158: `§3.7` → `§3.8`.

**Severity rationale:** MINOR. Reader can follow the surrounding context; the bypass mechanism is unambiguously defined exactly once in §3.8 and the typo doesn't affect implementation.

---

## Round-1 spot re-check (regression audit)

Per the prompt's anti-regression directive, I spot-checked the round-1 resolved findings C1, C2, C4, C7 — the ones with most edits in their territory:

- **C1 (migration.sql co-edits):** §3.1 lines 292-300 list the 8 tables; verified at the file — each block exists today (e.g. `learner_item_state` CREATE block, `lesson_progress` block, etc.). Round-2 added the RPC body co-edit at lines 302-334 — that section is where NC2/NM5 above live; the round-1 enumeration is untouched. **No regression.**

- **C2 (commit_capability_answer_report writer co-edit):** §3.4 lines 416-434 — the writer is correctly named as the Postgres RPC at `migration.sql:1205-1538`; the atomic drop+recreate is correctly specified; the deploy order (migration first, edge function second) is unchanged from round 1. Round 2 did not touch this section. Verified `migration.sql:1205` is `create or replace function indonesian.commit_capability_answer_report` (line range claim is correct). **No regression.**

- **C4 (dialogue_voices/transcript consumers):** §3.5 lines 478-516 — round-2 expanded the enumeration via NM2 (added Lessons.tsx + Lesson.tsx readers) and NM1 (narrowed the grep scope). The round-1 type-surface enumeration (`adapter.ts:19-35`), writers (`set-lesson-voices.ts:151-160`, `audio.ts`), and `check-supabase-deep.ts:309-315` reader are intact. **No regression.**

- **C7 (set-lesson-voices.ts writer + jsonb_each_text ordering):** §3.5 lines 451-457 — the `jsonb_each_text` ordering rationale is intact; the `set-lesson-voices.ts:151-160` upsert redirect is intact. Round 2 did not edit this section. **No regression.**

Round-2 edits are all additive (enumeration adds, the RPC sketch, the §3.7 leaderboard sub-list, the §3.8 contract subsection). Spot check sample: no removed content from round-1 findings.

---

## Architectural seams re-verification on the round-2 surface

The new content added in round 2 lives at three locations:

- **§3.1 RPC body sketch (lines 310-332):** this is migration-DDL prose, not module-surface code. No architecture seam touched. NC2 + NM5 (above) are *contract* defects in the sketch, not architectural drift.
- **§3.7 leaderboard enumeration (lines 545-549):** additive deletions of `Sidebar.tsx`, `types/learning.ts`, `i18n.ts`, leaderboard test. All targets are pure top-level files; no seam between modules touched.
- **§3.8 force-capability-answer.ts contract (lines 583-597):** the contract describes a new node script that drives Playwright; the script sits in `scripts/` alongside `set-lesson-voices.ts` etc. The script is a deploy-pipeline tool, not a runtime module. No seam concern.
- **§1.5 E2E template (lines 118-150):** the template references `e2e/_helpers.ts` (a new file to be extracted in PR 0) and `src/lib/supabase` (existing). No drift; the `_helpers.ts` extraction is a mechanical move of an inline helper into a shared file. Module structure unchanged.

**Verdict on round-2 seams:** clean. No fold-target drift; no shallow-module drift; no new architectural pattern smuggled in via the round-2 edits.

---

## Promotion verdict

**`status: draft → status: approved` — NEEDS MINOR REVISION.**

The plan is structurally sound and one short revision pass from green. Round 2's quality was high; the residual findings are localised to ~25 lines around §3.1 lines 310-334 and a one-character cross-reference fix in §1.6.

### Blockers (must address before promotion)

1. **NC2** — Add `security invoker` to the §3.1 example RPC body at line 319. One-word edit; the explicit declaration matters per the architect-mode SECURITY INVOKER + RLS hard constraint. Optionally add one prose sentence: "the recreated function joins RLS-protected `learner_capability_state` and `learner_lesson_activation` — the §1.6 deterministic bypass check is the SECURITY INVOKER + RLS gate."

2. **NM5** — Resolve the `is_activated` vs `has_started_lesson` rename. **Recommended:** option (a) — preserve the `has_started_lesson` column name in the recreated RPC body. The semantics are correct under the new definition (existence of `learner_lesson_activation` row); no consumer rename needed; minimum-touch fix. Update the §3.1 example body's `as is_activated` (line 327) to `as has_started_lesson`.

3. **Nm3** — One-character edit on §1.6 line 158: `§3.7` → `§3.8`.

### After these fixes — expected outcome

`APPROVED`. The plan can promote to `status: approved` and PR 0 can begin. None of the three remaining findings require structural rework; total prose change ≤ 30 words.

### Tiny stylistic notes for PR 0 author (do not block promotion)

- The plan's example RPC body at lines 314-331 is a SKETCH — the live RPC's full shape is much richer (`lesson_sections jsonb`, `has_page_blocks`, `ready_capability_count`, `practiced_eligible_capability_count`, `audio_path`, `primary_voice`, `order_index`). The PR-author must preserve all those columns when writing the actual recreate statement; the §3.1 sketch only illustrates the two changes (drop `duration_seconds`, drop the `lesson_progress` branch).
- The §3.8 ENV block at line 590 names `TEST_USER_EMAIL` only — no `ADMIN_TEST_USER_EMAIL`. The `login(page, { admin: true })` pattern at §1.5 line 132 implies either the helper accepts a separate admin credential, or the test user is granted admin server-side. PR 0 author chooses; either is defensible.
- The §3.7 leaderboard i18n enumeration says `lines 10, 196, 279, 465, 478` (line 547) but a fresh grep on `src/lib/i18n.ts` shows 6 hits including line 466. The grep gate at line 549 catches anything missed, but the count in the prose is one off. Not worth a revision pass.
- §3.5 line 502 grep gate uses `git grep -nE 'dialogue_voices|...'` — single quotes around the pattern. macOS / zsh users may need to use double quotes if the pattern shell-expands; consider noting `bash -lc 'git grep ...'` to lock the shell.

---

## Anti-shallow guard count

Round-3 surface (~65 new lines of round-2 content): 2 new findings (1 CRITICAL + 1 MAJOR) on the §3.1 RPC body sketch, plus 1 MINOR cross-reference typo elsewhere. Total: 3 new findings. Within the prompt's expected range (0-3 new findings on round-2 surface). Two of the three findings (NC2 + NM5) cluster on the same 18-line edit block (§3.1 lines 314-331) — that block is dense and load-bearing; the orchestrator sketched the body to address NC1 without re-grounding the sketch against the live RPC's shape. The third finding (Nm3) is a stale cross-reference from before §3.8 was inserted.

Distribution check: 11 round-1+round-2 findings all status-verified; 3 new findings on round-2 surface. Not pathologically clean; not suspiciously dirty.

---

## Cross-PR dependency check

Unchanged from round 2: every per-source-kind PR depends on PR 0 (verified at §2 lines 240-256, PR roadmap table). The `?force_capability` bypass + `e2e/_helpers.ts` extraction are PR 0 deliverables; downstream PRs cannot start until PR 0 lands. The dependency tracking is correct.

---

**End of architect final verification.**
