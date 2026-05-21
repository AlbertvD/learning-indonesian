# Agent 8: Schema, tests, build/CI, docs

**Date:** 2026-05-20
**Files reviewed:** 80+ (scripts/migration.sql, scripts/migrations/*.sql (25 files), scripts/migrate.ts, scripts/migrate-run.ts, scripts/check-supabase*.ts, src/__tests__/ (66 files), src/test-setup.ts, scripts/__tests__/, e2e/ (4 files), evals/ (6 files), playwright.config.ts, vite.config.ts, eslint.config.js, tsconfig*.json, Makefile, Dockerfile, nginx.conf, package.json, .husky/, .github/workflows/ (3 files) and pull_request_template.md, supabase/functions/, docs/adr/ (7 files), docs/current-system/ (full tree incl. modules/), docs/plans/ (18 files), docs/process/ (3 files), docs/superpowers/, docs/target-architecture.md, docs/known-regressions.md, root MD files (CLAUDE.md, CONTEXT.md, DESIGN_SYSTEM.md, GEMINI.md, ARCHIVE.md)).

## Files reviewed

Selected highlights worth pinning:

- `scripts/migration.sql` (2109 LOC) — read in three passes covering lines 1–300, 300–900, 900–1500, 1500–2109.
- `scripts/migrations/2026-05-02-capability-resolution-failures.sql`, `2026-05-14-retirement-8-orphan-tables.sql`, `2026-04-25-capability-core.sql` (spot checks against CLAUDE.md guidance).
- `scripts/migrate.ts`, `scripts/migrate-run.ts`, `scripts/check-supabase-deep.ts`.
- `src/lib/featureFlags.ts`, `src/lib/capabilities/index.ts`, `src/lib/session-builder/index.ts`, `src/components/experience/{ExperiencePlayer,types}.tsx`, `src/components/lessons/LessonReader.tsx`.
- All 4 module specs + all 7 ADRs.
- All 18 plan files (frontmatter + spot reads) and current-system docs.

---

## Findings

### F8-1: GEMINI.md references Makefile targets that no longer exist
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `GEMINI.md:56` — "**Extract:** `make extract-lesson LESSON=<N> ANTHROPIC_API_KEY=<key>`."
  - `GEMINI.md:63` — "**Database:** `make migrate`, `make seed-lessons`, `make seed-vocabulary`, `make seed-podcasts`, `make seed-flashcards`, `make seed-all`, `make extract-lesson`."
  - `Makefile` has no `extract-lesson` or `seed-vocabulary` targets (confirmed by `grep -E "^extract-lesson|^seed-vocabulary" Makefile`).
- **Recommendation:** Replace with current pipeline commands (`bun scripts/publish-approved-content.ts <N>`) or delete the file — CLAUDE.md is the canonical agent file.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F8-2: Makefile `seed-flashcards` target invokes missing script
- **Severity:** blocker
- **Category:** half-finished-migration
- **Sub-area:** build-ci
- **Evidence:**
  - `Makefile:105-107` — `seed-flashcards: ... NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-flashcards.ts`
  - `scripts/seed-flashcards.ts` does not exist (`ls` returns ENOENT).
- **Recommendation:** Delete the `seed-flashcards` target. Flashcards are gone (retirement #8 dropped `anki_cards`/`card_sets` per `scripts/migration.sql:2024-2030`).
- **Estimated effort:** trivial

### F8-3: ADR 0005 contradicts current code (lesson reader emits source progress)
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `docs/adr/0005-lesson-reader-emits-source-progress-not-fsrs-activation.md:5,13` — "Status: Accepted" + "Decision: The Lesson Reader emits source progress events such as opened, section exposed, intro completed, heard once, …"
  - `docs/current-system/modules/lesson-renderer.md:32` — "After retirement #6 (`retire-source-progress`, shipped 2026-05-07) even source-progress emission was removed — the renderer is now fully passive."
  - `grep -rn "source_progress\|sourceProgress" src/components/lessons/` returns no matches.
- **Recommendation:** Append a "Superseded by retirement #6 (2026-05-07)" status header or rewrite to reflect the now-passive reader (ADR 0006 / retirement #6 captured the inversion).
- **Estimated effort:** trivial

### F8-4: CONTEXT.md still defines "Source Progress" and "Lesson Experience Module emits source progress"
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `CONTEXT.md:33-35` — "## Source Progress / Evidence that a learner has encountered source material in the Lesson Reader or listening experience. Examples include opened, section exposed, …"
  - `CONTEXT.md:37-39` — "Lesson Page Block … optional source progress events."
  - `CONTEXT.md:53-55` — "Lesson Experience Module … emits source progress, and bridges to practice."
  - All of `learner_source_progress_*` tables/functions were dropped in retirement #6 (`scripts/migration.sql:1841-1854`).
- **Recommendation:** Drop the "Source Progress" entry. Update Lesson Page Block + Lesson Experience Module to reflect the passive reader + `learner_lesson_activation` model.
- **Estimated effort:** small

### F8-5: docs/current-system/README.md release posture lists flags that are no longer load-bearing + plans that don't exist
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `docs/current-system/README.md:27-35` — "Safe default release posture: VITE_CAPABILITY_SESSION_DIAGNOSTICS=false / …_REVIEW_SHADOW / …_REVIEW_COMPAT / …_STANDARD_SESSION=false …". CLAUDE.md says the runtime is unified and `Session.tsx:110` always passes `enabled: true`.
  - `grep -rn "capabilityMigrationFlags\." src/` only finds `LocalPreview.tsx:31,59` (one of the seven flags). The other six flags are dead.
  - `docs/current-system/README.md:41-44` lists four planning references; none exist on disk (verified with `ls`): `2026-04-25-capability-based-learning-architecture.md`, `2026-04-25-capability-content-pipeline-and-exercises.md`, `2026-04-25-learning-experience-ui-audio-mastery.md`, `capability-implementation-slices/00-index.md`.
- **Recommendation:** Rewrite the "Release Posture" section to reflect the unified capability runtime. Replace dead plan links with the current shipped-plan or module-spec pointers.
- **Estimated effort:** small

### F8-6: Six capability-migration feature flags are dead
- **Severity:** cleanup
- **Category:** dead-code
- **Sub-area:** build-ci
- **Evidence:**
  - `src/lib/featureFlags.ts:66-74` declares 7 flags. Searching `src/` for `capabilityMigrationFlags.<name>` finds only `localContentPreview` (used in `src/pages/LocalPreview.tsx:31,59`). The other six (`sessionDiagnostics`, `reviewShadow`, `reviewCompat`, `standardSession`, `experiencePlayerV1`, `lessonReaderV2`) have zero non-test consumers.
  - `src/__tests__/featureFlags.test.ts:14-19,42-46` keeps stubbing the env vars only to exercise the parser.
- **Recommendation:** Delete the six dead flags + their parser branches + their env-stub coverage in `featureFlags.test.ts`. Keep `localContentPreview`.
- **Estimated effort:** trivial

### F8-7: Two test files reference legacy functions that no longer exist in production
- **Severity:** cleanup
- **Category:** test-gap
- **Sub-area:** tests
- **Evidence:**
  - `src/__tests__/capabilitySessionLoader.test.ts:2` imports `loadCapabilitySessionPlan` from `@/lib/session-builder/builder` — per `docs/current-system/modules/session-builder.md` (verified 2026-05-18) the exposed symbol is `buildSession`, with `loadCapabilitySessionPlan` flagged as test-only. CLAUDE.md says `loadCapabilitySessionPlanForUser` was retired (retirement #7).
  - `src/__tests__/capabilitySessionDataService.test.ts:1-2` imports `createSessionBuilderAdapter` (still present) — this one is fine; the file *name* misleads because the old `capabilitySessionDataService.ts` is gone.
- **Recommendation:** Rename `capabilitySessionDataService.test.ts` → `sessionBuilderAdapter.test.ts`. Audit `capabilitySessionLoader.test.ts` against the surviving `loadCapabilitySessionPlan` export (the function is still in `builder.ts` for tests but the test-name lingo is stale).
- **Estimated effort:** trivial

### F8-8: e2e test feature-flag gate is meaningless (flag still exists but no longer gates production)
- **Severity:** cleanup
- **Category:** dead-code
- **Sub-area:** tests
- **Evidence:**
  - `e2e/lesson-reader.spec.ts:4` — `test.skip('requires an authenticated local app with VITE_LESSON_READER_V2=true')`
  - `src/lib/featureFlags.ts:72` — `lessonReaderV2: parseEnabledByDefaultFlag('VITE_LESSON_READER_V2')`. Default is true. No production consumer (see F8-6).
- **Recommendation:** Either delete the `test.skip` header line (the actual test below already covers a real concern: viewport overflow) or remove the spec file if it's dead.
- **Estimated effort:** trivial

### F8-9: e2e tests have no Makefile / package.json entry point and no CI hook
- **Severity:** cleanup
- **Category:** dead-code
- **Sub-area:** tests
- **Evidence:**
  - `package.json:6-15` has no `test:e2e` or `playwright` script.
  - `Makefile` has no e2e target (grep verified).
  - `playwright.config.ts` exists; `e2e/{design-lab-capture,lesson-reader,pr4a-smoke,session}.spec.ts` exist; nothing invokes them.
  - `@playwright/test ^1.59.1` is installed (`package.json:34`).
- **Recommendation:** Either add a `test:e2e` script + CI job, or delete `playwright.config.ts` + `@playwright/test` + the four `e2e/*.spec.ts` files. Right now they're paying upgrade-tax without exercising the app.
- **Estimated effort:** small

### F8-10: `evals/rls-check.sh` targets wrong migrations path
- **Severity:** cleanup
- **Category:** bug
- **Sub-area:** build-ci
- **Evidence:**
  - `evals/rls-check.sh:8` — `MIGRATION_FILES=$(echo "$CHANGED_FILES" | grep -E "supabase/migrations/.*\.sql$" || true)`
  - This repo's migrations live in `scripts/migration.sql` + `scripts/migrations/*.sql`. `ls supabase/migrations` returns ENOENT.
  - Net effect: every run of the eval short-circuits at line 9 ("No migration files changed — no RLS check needed").
- **Recommendation:** Change the path to `^scripts/migration\.sql$|^scripts/migrations/.*\.sql$` — and decide if the eval should fail on a missing `ENABLE ROW LEVEL SECURITY` or just warn.
- **Estimated effort:** trivial

### F8-11: `scripts/migrate-run.ts` is dead code (one-off migration script)
- **Severity:** cleanup
- **Category:** dead-code
- **Sub-area:** build-ci
- **Evidence:**
  - `scripts/migrate-run.ts:21-27` adds `profiles.language` column — duplicated by `scripts/migration.sql:53` already.
  - No caller anywhere: `grep -rn "migrate-run" Makefile package.json .github scripts docs` returns only the file itself.
- **Recommendation:** Delete `scripts/migrate-run.ts`.
- **Estimated effort:** trivial

### F8-12: vite.config.ts excludes a Progress.test.tsx that does not exist
- **Severity:** cleanup
- **Category:** dead-code
- **Sub-area:** tests
- **Evidence:**
  - `vite.config.ts:62` — `exclude: ['**/node_modules/**', 'src/__tests__/Progress.test.tsx']`
  - `find src -name "Progress.test.tsx"` returns no rows. The page `src/pages/Progress.tsx` exists but no test does.
- **Recommendation:** Either restore the test file or remove the orphaned exclude. The current state hides the "missing test" signal.
- **Estimated effort:** trivial

### F8-13: data-model.md self-contradicts on `vocabulary` table
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `docs/current-system/data-model.md:23` lists `vocabulary` (legacy) in the "Lesson content" active group.
  - `docs/current-system/data-model.md:29` lists `vocabulary` in the retirement-#8-dropped list.
  - `scripts/migration.sql:2030` — `drop table if exists indonesian.vocabulary cascade;`
- **Recommendation:** Drop `vocabulary` from line 23.
- **Estimated effort:** trivial

### F8-14: 10 shipped plans still live in docs/plans/ — should be archived
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - CLAUDE.md: "Shipped plans are archived to `/Users/albert/home/learning-indonesian-archive/`. See `ARCHIVE.md` at repo root."
  - `grep "^status: shipped" docs/plans/*.md` returns 10 plans (2026-05-08-pipeline-cleanup-{for-lessons-fold,implementation}, 2026-05-14-experience-stepwise-redesign-design, 2026-05-16-fold-session-builder-design, 2026-05-17-{decision-3b-cleanup-rollout,drop-capability-key-refs,extend-decision-3-lesson-id,honor-profile-session-size,itemslug-shared-helper}, 2026-05-18-{capability-staging-gate,render-contracts}).
- **Recommendation:** Move the 10 shipped plan files into `learning-indonesian-archive/docs/plans/` (mirror path) so forward-looking work in `docs/plans/` stays uncluttered.
- **Estimated effort:** trivial

### F8-15: 4 plan files have no YAML frontmatter at all
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `grep -L "^status:" docs/plans/*.md` returns: `2026-05-01-ui-polish-ticket.md`, `2026-05-01-commercialization-roadmap.md`, `2026-05-16-fold-session-builder-architect-review.md`, `2026-05-16-fold-session-builder-architect-review-2.md`.
  - Each opens with prose-status (e.g. `2026-05-01-ui-polish-ticket.md:3` — "**Status:** Open. Captured from a mobile-session audit (2026-05-01 morning) … Not a spec — a punch list.").
  - CLAUDE.md ("Plan status awareness"): "Grep for `grep -L '^status:' docs/plans/*.md` to find plans missing frontmatter — these need backfilling before any agent uses them."
- **Recommendation:** Add YAML frontmatter (likely `status: draft` for the punch-list / commercialization notes; the two architect-review docs may belong in archive rather than `plans/`).
- **Estimated effort:** trivial

### F8-16: `docs/plans/2026-05-12-deterministic-snapshot-regen.md` has been `status: implementing` for 8 days with known follow-up bugs unaddressed
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `docs/plans/2026-05-12-deterministic-snapshot-regen.md:2-15` — `status: implementing` / `implementation: branch fold/capability-stage (commits 97ceec8, 2140668, 957ba0c, b3b1ef1, 2d7f646, efd2fb6, 077f8bd, d078661, 5ce328e)` / `follow_ups: - CS7 count-parity query at scripts/lib/pipeline/capability-stage/verify/countParity.ts:43-49 … - projectors/vocab.ts:109-113 review_status filter …`
  - The 9 commits all exist on `main` (verified `git log --oneline 97ceec8`). The `fold/capability-stage` branch is not present locally.
  - Memory file `project_pipeline_followup_bugs.md` confirms "Two capability-stage bugs (CS7 count-parity, projectVocab review_status filter) fixed on branch fix/cs7-count-parity-via-junction; PR after fold/capability-stage lands."
- **Recommendation:** Either flip the plan to `shipped` (the 9 commits are merged) with the follow-ups carved out into a fresh draft, or amend the `implementation:` field to point at the merged PR(s).
- **Estimated effort:** trivial

### F8-17: docs/process/decision-3b-rollout.md is a one-time runbook that is now operationally complete
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `docs/process/decision-3b-rollout.md:9` — "Run this once, against the homelab DB, after PR-3 merges …"
  - `docs/plans/2026-05-17-extend-decision-3-lesson-id.md` (frontmatter) — `status: shipped`, all 3 PR-merge timestamps set 2026-05-17. PR-4 also shipped (`docs/plans/2026-05-17-decision-3b-cleanup-rollout.md`).
- **Recommendation:** Archive the runbook into `learning-indonesian-archive/docs/process/` once the operator confirms the homelab DB satisfies the post-condition.
- **Estimated effort:** trivial

### F8-18: DESIGN_SYSTEM.md cites a defunct hook path + nonexistent pages
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `DESIGN_SYSTEM.md:34` — "A git pre-commit hook automatically enforces the `<Paper>` standard: `.git/worktrees/retention-v2/hooks/pre-commit`" — this path is internal-to-git-machinery and worthless to a reader. The actual hook is `.husky/pre-commit` and doesn't enforce `<Card>`/`<Paper>`.
  - `DESIGN_SYSTEM.md:80-81` — lists "Sets/Decks (list cards)" under "Pages Using This System". `ls src/pages/` confirms neither `Sets.tsx` nor `Decks.tsx` exist (retirement #8 dropped `card_sets`/`anki_cards`).
- **Recommendation:** Drop the worktree-hook reference; either implement the `<Paper>` check in `.husky/pre-commit` or delete the section. Remove the Sets/Decks line.
- **Estimated effort:** trivial

### F8-19: docs/superpowers/plans/2026-03-18-lesson-audio-integration.md is ancient + has no frontmatter
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - File at `docs/superpowers/plans/2026-03-18-lesson-audio-integration.md` (March 2026) describes adding audio columns to `lessons` — work that landed long ago (`scripts/migration.sql:969-970` carries `primary_voice` + `dialogue_voices`).
  - No frontmatter; file lives outside `docs/plans/` so `grep -L "^status:" docs/plans/*.md` misses it.
- **Recommendation:** Archive (it documents shipped work) and drop the `docs/superpowers/plans/` directory unless an active project owns it.
- **Estimated effort:** trivial

### F8-20: known-regressions.md "five lessons missing audio_path" — still present, but the fix path is the same as a clean re-publish
- **Severity:** nice-to-have
- **Category:** TODO
- **Sub-area:** docs
- **Evidence:**
  - `docs/known-regressions.md:12-48` describes the 5 affected lessons.
  - `scripts/data/lessons.ts` carries exactly 5 `audio_filename:` entries (lessons 1–5 via grep). Modules' `seed-lessons.ts:100` writes the `audio_path` from `audio_filename`.
  - The "Fix" listed (`make seed-lessons`) blocks on an operator running the seed once. No code regression.
- **Recommendation:** Hold the entry until the operator runs `make seed-lessons` against the live DB; the regression file is the right home, but mark it as "operator-blocked, no code change pending" so it doesn't repeatedly surface as a new finding.
- **Estimated effort:** trivial

### F8-21: tsconfig.node.json scope is too narrow for scripts/ + evals/ + e2e/
- **Severity:** nice-to-have
- **Category:** inconsistency
- **Sub-area:** build-ci
- **Evidence:**
  - `tsconfig.node.json:25` — `"include": ["vite.config.ts"]`
  - `scripts/` has 60+ `.ts` files (`scripts/migrate.ts`, `scripts/migrate-run.ts`, `scripts/check-supabase*.ts`, …) that import Node-only modules (`Bun`, `postgres`, `node:fs`).
  - `e2e/` has 4 `.ts` files. `evals/lib/` has TS as well? (verified directory listing).
  - `tsconfig.app.json:28` `include: ["src"]` — so `scripts/` is not type-checked by either project. The pre-commit hook runs `tsc -b --noEmit` which only checks the two reference targets.
- **Recommendation:** Either add a third project (`tsconfig.scripts.json`) and reference it from `tsconfig.json`, or extend `tsconfig.node.json` to include `scripts/**/*.ts`. Today, type errors in scripts only surface when the script is actually invoked.
- **Estimated effort:** small

### F8-22: pre-push hook runs the full test suite — duplicates CI on every push
- **Severity:** nice-to-have
- **Category:** inefficiency
- **Sub-area:** build-ci
- **Evidence:**
  - `.husky/pre-push:4` — `bun run test`
  - `.github/workflows/ci.yml` runs `safety.yml@v1` + `dependency-audit.yml@v1` + `seam-contract` — but no test job. Pushing duplicates is not strictly wasteful, but the developer pays the cost.
- **Recommendation:** Either move tests into a CI job (so pre-push can be lighter — typically lint + tsc only) or keep pre-push and drop the duplicate intent. Note: CI deliberately cannot reach the homelab, so the supabase health checks must stay local.
- **Estimated effort:** small

### F8-23: scripts/check-supabase-deep.ts EXPECTED_TABLES is missing 9 capability + content-pipeline tables
- **Severity:** cleanup
- **Category:** inconsistency
- **Sub-area:** schema
- **Evidence:**
  - `scripts/check-supabase-deep.ts:24-42` — 17 tables.
  - `scripts/migration.sql` + standalone files define many more: `content_flags`, `audio_clips` (in), `textbook_sources`, `textbook_pages`, `grammar_patterns`, `item_context_grammar_patterns`, `exercise_type_availability`, `generated_exercise_candidates`, `exercise_variants`, `exercise_review_comments`, the entire capability layer (`learning_capabilities`, `capability_aliases`, `capability_artifacts`, `capability_content_units`, `content_units`, `lesson_page_blocks`, `learner_capability_state`, `capability_review_events`, `capability_resolution_failure_events`).
  - The RLS-policy check at lines 112–123 iterates over `report.tables` (all tables) regardless, so the gap doesn't blind RLS — but `Check: all expected tables exist` (lines 86–92) silently misses if any of the above gets dropped.
- **Recommendation:** Add the capability + content-pipeline tables to `EXPECTED_TABLES` + `EXPECTED_GRANTS` so a missing-table regression surfaces in `make check-supabase-deep`.
- **Estimated effort:** small

### F8-24: tsconfig drift — `verbatimModuleSyntax: true` in both projects but `erasableSyntaxOnly: true` only applies when the runtime supports it
- **Severity:** nice-to-have
- **Category:** inconsistency
- **Sub-area:** build-ci
- **Evidence:**
  - `tsconfig.app.json:24` + `tsconfig.node.json:21` both set `erasableSyntaxOnly: true` (TS 5.8+ flag) — fine for Vite + tsx, but bun/node usage in `scripts/` not covered (see F8-21).
  - `verbatimModuleSyntax: true` (both files, line 15/13) is correct for Vite + tsx, but it means importing types-only must use `import type`. Tests at `scripts/__tests__/*.test.ts` are not part of any tsconfig include.
- **Recommendation:** Tie this together when the `scripts/` tsconfig project is added (see F8-21).
- **Estimated effort:** trivial

### F8-25: Several module-spec LOC counts are stale (drift not yet caught by the 30-day refresh)
- **Severity:** nice-to-have
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `docs/current-system/modules/session-builder.md:16-24` cites: `adapter.ts | 350 LOC`, `compose.ts | 115 LOC`, `pedagogy.ts | 252 LOC`, `labels.ts | 66 LOC`, `loadBudget.ts | 53 LOC`.
  - Actual `wc -l` for these files: `adapter.ts | 356`, `compose.ts | 149`, `pedagogy.ts | 344`, `labels.ts | 117`, `loadBudget.ts | 58`.
  - Spec carries `last_verified_against_code: 2026-05-18` (only 2 days old) — implies drift in less than 30 days, so the 30-day refresh rule won't catch it.
  - `docs/current-system/modules/experience.md:42` cites `ExperiencePlayer.tsx:67-241`; actual end-of-function brace is at line 240 (LOC 242). Off-by-one but indicative.
- **Recommendation:** Treat LOC counts as advisory only, or run a freshness check that re-verifies via `wc -l`. Either is fine — the spec graph is otherwise strong and the file-path / line-range cites are accurate.
- **Estimated effort:** small

### F8-26: docs/current-system/human-product-and-learning-guide.md links a plan that doesn't exist
- **Severity:** cleanup
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `docs/current-system/human-product-and-learning-guide.md:7` — `[Learning Experience Rules](../plans/2026-04-28-learning-experience-rules.md)`
  - `ls docs/plans/2026-04-28-learning-experience-rules.md` returns ENOENT.
- **Recommendation:** Either restore the plan from the archive or drop the link.
- **Estimated effort:** trivial

### F8-27: Five current-system reference docs have no YAML frontmatter
- **Severity:** nice-to-have
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `docs/current-system/capability-system-handoff.md`, `capability-release-runbook.md`, `content-pipeline-and-quality-gates.md`, `lesson-content-audio-migration-status.md`, `human-product-and-learning-guide.md` — verified by reading lines 1–10 of each, none start with `---`.
  - Module specs (4) + `data-model.md` + `infrastructure.md` + `page-framework-status.md` (partial — verified) DO carry frontmatter.
- **Recommendation:** Add `last_verified_against_code` + `status:` frontmatter to the 5 missing files so the freshness convention applies uniformly across `docs/current-system/`.
- **Estimated effort:** small

### F8-28: scripts/fixtures/* files are not referenced by any test
- **Severity:** nice-to-have
- **Category:** dead-code
- **Sub-area:** tests
- **Evidence:**
  - `scripts/fixtures/sample-audio-manifest.json`, `sample-candidates.ts`, `sample-grammar-patterns.ts`, `sample-lesson-stub.ts`, `sample-qa-report.json` exist.
  - `grep -rln "fixtures/" scripts/__tests__/ scripts/lib/ src/` finds no references; `grep -rln "sample-candidates\|sample-grammar-patterns\|sample-lesson-stub\|sample-audio-manifest\|sample-qa-report" scripts/ src/` finds only the files themselves.
- **Recommendation:** Delete or wire into a real test. They were probably staged for the linguist pipeline tests and never picked up.
- **Estimated effort:** trivial

### F8-29: `bun.lock` + `package-lock.json` both present — duplicate lockfiles
- **Severity:** cleanup
- **Category:** duplication
- **Sub-area:** build-ci
- **Evidence:**
  - Root `ls -la` shows `bun.lock` (May 16) and `package-lock.json` (Apr 29). Repository explicitly uses Bun (`Dockerfile:3-4` runs `bun install --frozen-lockfile`).
  - `.github/workflows/deploy.yml:23` uses `bun install --ignore-scripts`.
- **Recommendation:** Delete `package-lock.json` (drift risk — npm-installed could diverge from bun resolution).
- **Estimated effort:** trivial

### F8-30: CLAUDE.md "Pure logic (SM-2, formatters)" example is stale
- **Severity:** nice-to-have
- **Category:** spec-drift
- **Sub-area:** docs
- **Evidence:**
  - `CLAUDE.md` Testing section: "| Pure logic (SM-2, formatters) | Vitest unit tests | `calculateNextReview('good', 2.5, 1, 0)` |"
  - The project uses ts-fsrs (per `package.json:28` — `ts-fsrs ^5.3.2`) — no SM-2 implementation exists (`grep -rln "calculateNextReview\|sm2\|SM-2" src/` returns no rows).
- **Recommendation:** Replace with a ts-fsrs / fuzzy-grading / canonical-key example.
- **Estimated effort:** trivial

---

## Open questions for orchestrator

1. **Plan archival policy** (F8-14, F8-17, F8-19): is moving the 10 shipped plans + the rollout runbook into `learning-indonesian-archive/` in scope for this review, or do we just leave findings for the operator?
2. **e2e tests** (F8-9): the suite is installed but un-runnable end-to-end. Keep + wire up, or delete? Agent 8 leans toward deleting because the design-lab + lesson-reader specs both rely on a live local dev server + auth shape — they were ad-hoc not steady-state.
3. **Capability migration flags** (F8-6): deletion crosses agents (the flag is read by `LocalPreview.tsx`, owned by frontend). Coordinate with Agent 6 (pages) before removing.
4. **Cross-slice** for F8-3 (ADR 0005) + F8-4 (CONTEXT.md) + F8-5 (current-system/README.md): these all need a single sweep that says "the lesson reader is passive and FSRS activates only via the review processor." Treat as one docs cleanup PR.

## Coverage notes

- Schema/migrations: read the full 2109 lines of `scripts/migration.sql`; spot-read 3 of the 25 standalone files (capability-resolution-failures, retirement-8-orphan-tables, capability-core). The standalone files are kept deliberately per CLAUDE.md (load-bearing for capability subsystem until folded back into `migration.sql`) — verified by inspecting the `capability_resolution_failure_events` table not present in master file.
- Tests: full `src/__tests__/` listing (66 files), checked for skips/onlys (none found), spot-read 6 tests (`buildSections`, `generateExercises`, `featureFlags`, `capabilitySessionLoader`, `capabilitySessionDataService`, plus the orphan checks). `scripts/__tests__/` listing (18 files) — not deep-read but no skips found.
- Build/CI: pre-commit + pre-push hooks, both `.github/workflows/` files (ci + deploy), the cache-cleanup workflow, vite.config.ts, eslint.config.js, all 3 tsconfigs, Dockerfile, nginx.conf, playwright.config.ts.
- Docs: full ADR roster (7 files, all read at least to the Decision section), all 4 module specs (read in full + spot-verified `file:line` cites — see F8-25), the current-system README + data-model.md (read full), infrastructure.md (front matter only), human-product-and-learning-guide.md (front matter + opening), all 18 plan files (frontmatter parsed, 4 opened in full), known-regressions.md (read full), root MD files (read full).
- Did NOT review in depth: `scripts/migrations/*.rollback.sql` (audit logs by design); the `evals/lib/common.sh` and the lesson-capture eval (out of slice).
