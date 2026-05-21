# Code review — 2026-05-20

**Branch:** `chore/exercises-ui-cleanup`
**Scope:** whole repo (src/, scripts/, docs/, build/CI infra) for half-finished migrations, dead code, duplication, bugs, inefficiency, type holes, error-handling gaps, inconsistencies, spec drift, test gaps, TODOs, and architecture violations (barrel bypass, layering, single-caller invariants, etc.).
**Method:** 9 parallel subagents on disjoint slices + a cross-slice seam audit. Each finding carries `file:line` evidence. All findings here are **agent-reported — re-verify against the cited code before acting on any of them** (per CLAUDE.md "Quality Over Speed").

## Headline

**~234 findings** — **5 blockers**, ~155 cleanup, ~74 nice-to-have.

| Agent | Slice | Blocker | Cleanup | Nice | Total |
|---|---|---|---|---|---|
| 1 | Capability runtime & scheduling | 1 | 4 | 25 | 30 |
| 2 | Exercise framework | 0 | 19 | 9 | 28 |
| 3 | Lesson reader & page UI | 1 | 22 | 6 | 29 |
| 4 | Auth, routing, aux pages, admin | 0 | 27 | 3 | 30 |
| 5 | Services & helpers | 0 | 16 | 10 | 26 |
| 6 | Content pipeline | 1 | 19 | 4 | 24 |
| 7 | Authoring scripts | 1 | 17 | 10 | 28 |
| 8 | Schema, tests, build/CI, docs | 1 | 22 | 7 | 30 |
| 9 | Architecture seam audit | 0 | 9 | 0 | 9 |

## The 5 blockers (fix now)

| ID | Finding | Cite | Effort |
|---|---|---|---|
| **F1-1** | `dimensionForCapability` has no `root_derived_recall` case — morphology recall reviews fall into the `'exposure'` bucket on the Progress screen | `src/lib/mastery/masteryModel.ts:152-177` | small |
| **F3-1** | Dashboard "Continue lesson" tile silently broken: builds `/lessons/${id}?section=...` but the route is `/lesson/:lessonId` (singular) | `src/pages/Dashboard.tsx:62` | trivial |
| **F6-1** | `CS8 contentNonEmpty` validator skips `capability_artifacts` + `exercise_variants` checks — two of five table checks are silent no-ops | `scripts/lib/pipeline/capability-stage/runner.ts:562-568` | small |
| **F7-14** | `scripts/data/staging/lesson-10/index.ts` re-exports four derived files that don't exist yet pre-publish — any consumer errors out | `scripts/data/staging/lesson-10/index.ts:6-9` | trivial |
| **F8-2** | `Makefile:105` `seed-flashcards` invokes `scripts/seed-flashcards.ts` which doesn't exist | `Makefile:105` | trivial |

## Cross-slice patterns (the high-leverage clusters)

These are findings from multiple agents that share a root cause. Fixing each as one batch is more efficient than addressing them separately.

### Pattern A — Retirement #7 (session-builder) cleanup incomplete
Legacy exercise components and session-queue types persist behind tests and admin preview.
- **F2-1:** legacy `src/components/exercises/*.tsx` runtime components — ~1700 lines duplicating `implementations/`, kept alive by tests + admin preview only.
- **F2-2:** dead `src/components/exercises/FlagButton.tsx` duplicates `primitives/FlagButton.tsx`.
- **F2-3:** `src/components/exercises/registry.ts` references retired `ExerciseShell` at 5 lines.
- **F5-21:** `SessionQueueItem` type dead post-retirement #7.
- **Recommendation:** delete the legacy components, update the test imports to point at `implementations/`, retire the registry references. Single PR.

### Pattern B — Retirement #6 (passive lesson reader) lag
Reader is fully passive but docs and supporting code haven't caught up.
- **F8-3, F8-4, F8-5:** ADR 0005 says "lesson reader emits source progress" but retirement #6 made it fully passive — docs/adr/0005 vs module spec drift.
- **F5-1:** `src/lib/lessons/lessonReadiness.ts` — entire module dead post-retirement #6 (only test imports it).
- **F3-28:** bespoke lesson-1 reader at `/lesson-preview/1` already diverging from `Lesson.tsx`.
- **F4-23:** `/lesson-preview/1` route unreachable from UI.
- **Recommendation:** retire `lessonReadiness.ts` + its test, update ADR 0005 + lesson-renderer module spec, decide bespoke-lesson-1's fate (productionize or delete).

### Pattern C — Admin gating inconsistency
Three different admin-check patterns across three admin pages.
- **F4-11:** `ContentReview.tsx:32-34, 173` reinvents admin gating in-page instead of using `AdminGuard`.
- **F4-12:** `/content/sections` and `/content/exercises` lack admin gating despite reading pipeline tables (`src/App.tsx:139-154`).
- **F4-15:** `ExerciseCoverage.tsx` makes 6 direct Supabase queries — no service layer, no admin gate.
- **Recommendation:** route all admin pages through `AdminGuard`; pull queries into a service.

### Pattern D — Error-handling violations (CLAUDE.md rule)
CLAUDE.md mandates every async op → user-friendly notification + `logError`. Multiple violations.
- **F4-6:** `Session.tsx:138-142` leaks raw `JSON.stringify(err)` into a user-facing alert.
- **F2-15:** `Cloze.tsx:44-46` (and 6 siblings) render raw red `<div>` error strings.
- **F5-7:** `audioService` swallows RPC errors with no `logError`.
- **F5-8:** `logger.ts:18-25` comment claims fire-and-forget but `await supabase.auth.getUser()` can block.
- **Recommendation:** sweep for all `console.error` + raw-string error paths in one pass; fix `logger.ts` to actually be fire-and-forget.

### Pattern E — i18n drift / hardcoded NL
Bilingual mode is partially broken because of hardcoded Dutch strings.
- **F3-22:** all 5 progress components + `Progress.tsx` hardcode ~30 NL strings — bilingual mode broken on `/progress`.
- **F4-9:** `Login.tsx` / `Register.tsx` hard-code Dutch.
- **F3-7:** `ActivationGate` duplicates strings already in `T.lessons`.
- **F5-6:** `src/lib/i18n.ts` has large dead-key residue (`practice` namespace, `session.summary`, most `lessons.*` reader keys, `leaderboard.level`).
- **Recommendation:** one i18n sweep — migrate hardcoded strings to keys, then prune the dead keys at the end.

### Pattern F — Spec & doc drift
CLAUDE.md and several specs cite code that no longer matches.
- **F1-6:** CLAUDE.md:275 and `docs/current-system/modules/capabilities.md:217` cite retired `requiredSourceProgress.kind: 'legacy_projection'` field.
- **F9-5:** CLAUDE.md:267 cites phantom `loadCapabilitySessionPlanForUser` at wrong line `Session.tsx:110` (actual: `buildSession` at `Session.tsx:101`).
- **F2-3:** `registry.ts` references retired `ExerciseShell`.
- **F8-14:** 10 `status: shipped` plans still in `docs/plans/` should be archived per CLAUDE.md.
- **F8-3/4/5:** ADR 0005 vs lesson-renderer module spec drift.
- **Recommendation:** schedule a docs-only refresh PR; archive shipped plans; backfill module specs' `last_verified_against_code` dates.

### Pattern G — Dead service-layer code
A surprising amount of the service layer has no production callers.
- **F1-2:** `learningItemService.ts:13-141` — all 11 methods unused; duplicates `capabilityContentService`'s private fetchers.
- **F1-3:** `exerciseAvailabilityService.ts` — zero production callers, but `validateCapability` (`capabilityContracts.ts:48,126`) still carries an unused `exerciseAvailability` param — author DB toggles silently ignored.
- **F1-4:** `capabilityService.ts:38-73` — runtime methods (`listCapabilities`, `getCapabilityByCanonicalKey`, `upsertCapability`) zero callers; service exists only to host two enum types.
- **F5-2:** `lessonService.ts:178-187, 218-226` — `getLessons()` / `getLessonsWithVoice()` no production callers.
- **F5-10:** `progressService` is a 1:1 façade over the store — no transformation.
- **Recommendation:** delete or fold each. The `exerciseAvailability`-param ghost is the most worrying (silent ignore of an author toggle).

### Pattern H — Inverted dependencies (`lib/` ← `services/`)
8 sites where `src/lib/` imports row-shape types from `src/services/`. Layering arrow points the wrong way.
- **F9-3:** `session-builder/{model,adapter,pedagogy,audibleTexts}.ts`, `capabilities/capabilityScheduler.ts:1`, `lessons/lessonExperience.ts:1`, `preview/localPreviewContent.ts:1`, `reviews/capabilityReviewProcessor.ts:1`.
- **F9-6:** type-only cycle: `capabilities ↔ session-builder` (`capabilityScheduler.ts:2`, `renderContracts.ts:20`).
- **Recommendation:** hoist the shared row types into `src/types/` (or a new `src/domain/learning/` per the future-work memory).

### Pattern I — Pipeline shortcuts (writes bypassing stage validators)
Maintenance scripts and repair scripts mutate capability tables outside the runner — silent invariant evasion.
- **F9-8:** ~12 scripts (`promote-capabilities.ts:255`, `triage-residual-capabilities.ts:135`, `repair-item-meanings.ts:77`, `extract-cloze-items.ts:202`, …) write directly to capability tables.
- **F7-16:** 4 repair scripts write to capability-stage tables outside the runner.
- **Recommendation:** route writes through the runner where possible; for scripts that legitimately need direct access, document the carve-out and add a runtime guard.

### Pattern J — Barrel bypass + scripts/ tsconfig gap
- **F9-1:** 17 `scripts/` sites bypass `@/lib/capabilities` via `../../../src/lib/capabilities/<file>` paths.
- **Root cause:** `tsconfig.node.json` doesn't have the `@/*` alias, so scripts can't use it. The bypass is sanctioned by infra, not by intent.
- **F6-7:** `lint-staging.ts:40` imports a stage internal instead of the barrel.
- **Recommendation:** add the `@/*` alias to `tsconfig.node.json`, then sweep the 17 imports.

### Pattern K — Feature-flag rot
- **F8-6:** 6 of 7 `capabilityMigrationFlags` in `src/lib/featureFlags.ts:66-74` have zero non-test consumers (only `localContentPreview` survives).
- **Recommendation:** prune.

## Recommended remediation order

Run them in this sequence so each batch lands cleanly:

1. **Blockers** (5 items, all small/trivial) — 1-2 hours. Stand alone.
2. **Pattern A** (Retirement #7 cleanup) — delete legacy exercise components + registry references. Single PR.
3. **Pattern B** (Retirement #6 docs + dead lessonReadiness) — single PR.
4. **Pattern C** (admin gating consolidation) — single PR.
5. **Pattern G** (dead services) — bundle with Patterns A/B where overlap exists; otherwise standalone.
6. **Pattern D** (error handling sweep) — distinct PR.
7. **Pattern J** (`@/*` alias for scripts) — small PR, unblocks the barrel-bypass sweep that comes next.
8. **Pattern E** (i18n sweep) — larger; consider gating with new tests.
9. **Pattern H** (hoist row types out of services) — touches many files; do after the dead-services cleanup so there's less surface.
10. **Pattern I** (pipeline shortcuts) — needs design discussion (which writes legitimately need direct access?).
11. **Pattern F** (doc/spec drift) — keep as ongoing housekeeping; refresh as the above PRs land.
12. **Pattern K** (feature-flag prune) — fold into one of the above.

## Remediation log

### 2026-05-21 — Pattern I + retirement (final session)

Final session in the remediation series. Cleared the remaining items.

**Commits landed on `main`:**

| Commit | Scope | Tests |
|---|---|---|
| `577e3ad` | `chore(retirement): delete legacy seed-learning-items + vocabulary.ts` — clears F7-3. Removed `scripts/seed-learning-items.ts`, `scripts/data/vocabulary.ts`, the Makefile target, and the `seed-all` chain reference. Lessons 1–3 are confirmed on the modern capability pipeline (`projection_version='capability-v3'`, lesson_id set on every non-podcast row), so the retirement condition in the shipped Phase 3 plan is met. | 1182 → 1182 |
| `0e505af` | `fix(pipeline): upsertLearningItem writes is_active=true on every publish` — three-layer invariant gate. Adapter writes `is_active: true` on every learning_items upsert (`scripts/lib/pipeline/capability-stage/adapter.ts:307-326`); two regression tests in `adapter.test.ts` capture and assert the payload; live-DB health check **HC10** in `scripts/check-supabase-deep.ts` refuses any item-source-kind cap that references an `is_active=false` learning_item. HC10 is RED at landing time (186 cap offenders across 3 lessons) and turns green as those lessons re-publish. | 1182 → 1184 |

**Pattern I reframing.** The original Pattern I framing — "12 maintenance scripts mutate capability tables outside the runner — silent invariant evasion" — was tested against the live DB and largely held up *as observation*, but the right response turned out to be:

- Most of the 12 scripts are finished one-shots or dev sandboxes; only `reactivate-dialogue-chunks.ts` does live work, and that work was papering over a real runner bug (the `is_active` upsert omission).
- The fix is not to route those scripts through the runner — it is to make the runner correct so the workaround scripts become residual. Once L7/L8 re-publish, `reactivate-dialogue-chunks.ts` can be deleted in a follow-up.
- The other 11 scripts are paper-trail / repair tools whose direct writes are deliberate; documentation is the right disposition, not enforcement.

**Gap A — false alarm.** The follow-up memory `project_pipeline_followup_bugs.md` named the projectVocab `review_status` filter as a suspected cause for items present in `item_contexts` but missing item-source-kind caps. Investigation showed:

- The filter fix shipped in commit `c44bf27` (PR #46, merged 2026-05-13) — it already includes `'published'`.
- The real cause is 45 ghost `learning_items` rows (11 active) from the now-deleted legacy seeder. Its `normalizeText()` stripped trailing punctuation (`?!.,;:'"`); modern `itemSlug` preserves it (`src/lib/capabilities/itemSlug.ts:23`). The upsert on `normalized_text` couldn't match the legacy rows, so it inserted duplicates with the proper slug. Legacy `item_contexts` still references the ghost row.
- Runtime is unaffected (uses caps, not item_contexts). Deferred as a one-shot cleanup migration; recorded in the memory file.

**Gap C — phantom.** An initial reading framed lessons 4/5/7/8 as "missing dialogue_line:contextual_cloze capabilities" relative to lesson 9. Verification against the code showed:

- No exercise type supports the `dialogue_line` source kind today. `src/services/capabilityContentService.ts:215-220` rejects non-`item` sourceKinds; every render contract in `src/lib/capabilities/renderContracts.ts:42-104` declares `supportedSourceKinds: ['item']`; the lock-in test at `src/lib/capabilities/__tests__/renderContracts.test.ts:144-148` asserts dialogue_line is unsupported on purpose.
- L9's 7 dialogue_line:contextual_cloze caps have zero `capability_artifacts` — they are projected but inert. The "L9 works" framing was a misread.
- Adding cloze entries to L5/L7/L8 staging would produce more inert data without any user-facing effect. The cloze-creator agent was almost dispatched on L5 before this was caught.

This finding generalised: see [capability-runtime-data-model-gap.md](../current-system/capability-runtime-data-model-gap.md) in `docs/current-system/` for the full picture — **97% of the 4,005 capability rows are item-sourced and renderable; 3% (105 rows) sit in five non-item source kinds that the runtime cannot consume.** The data model is roughly 2× the size of the running app; whether to grow the app or trim the data model is a strategic question the doc lays out.

**Status after this session:**

- The 5 blockers and Patterns A–H + J are resolved on `main`.
- Pattern I is resolved with the dialogue is_active fix + HC10 + the documentation above. The 12 "pipeline-shortcut" scripts are observationally correct as flagged but the right disposition is per-script (one runner fix, several deletions-after-re-publish, several docstring-only documentation passes). Tracked informally in the memory file.
- Pattern K (feature-flag prune) was not addressed this session — small standalone task, no dependencies.
- Pattern F (doc/spec drift) — partial: this session updated `docs/current-system/` with the new architectural finding; doc-spec drift sweeps remain ongoing housekeeping.

## Caveats

- Agent 2 reported one finding as a "verification" (F2-20 confirming policy compliance, not a defect). It's counted in the 28 total above.
- Findings counts are the agents' self-reports; spot-check before relying on a specific number.
- Several agents flagged cross-slice dependencies — those are tagged in each report's per-finding metadata and contributed to the Pattern groupings above.
- **Re-verify every cite before acting on it.** Agent reports are inventories, not authority. Per CLAUDE.md: "the code is authoritative."

## Index of per-agent reports

| Agent | Report |
|---|---|
| 1 | [agent-1-capability-runtime.md](agent-1-capability-runtime.md) |
| 2 | [agent-2-exercise-framework.md](agent-2-exercise-framework.md) |
| 3 | [agent-3-lesson-reader-page-ui.md](agent-3-lesson-reader-page-ui.md) |
| 4 | [agent-4-auth-pages-admin.md](agent-4-auth-pages-admin.md) |
| 5 | [agent-5-services-helpers.md](agent-5-services-helpers.md) |
| 6 | [agent-6-content-pipeline.md](agent-6-content-pipeline.md) |
| 7 | [agent-7-authoring-scripts.md](agent-7-authoring-scripts.md) |
| 8 | [agent-8-schema-tests-build-docs.md](agent-8-schema-tests-build-docs.md) |
| 9 | [agent-9-architecture-seam-audit.md](agent-9-architecture-seam-audit.md) |
