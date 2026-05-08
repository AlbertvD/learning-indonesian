# Retirement #7 — Legacy `src/lib/` root files

**Status:** Spec — R1 + R2 folded. R2 verdict: APPROVE-WITH-NOTES (no blockers; all R2 corrections applied below). Ready for executor.
**Branch:** `retire/legacy-lib-root` (to be created).
**Scope:** Source-only. Zero database changes. Zero edge-function changes.
**Estimated diff:** ~2518 LOC delete, 2 path-only import edits, 12 identifier renames in `lib/session/`, 6 lineage-comment cleanups + 1 user-facing string update, ~10 doc-section edits.

## 1. Summary

Three `src/lib/` root files survive as orphans of prior retirements; a fourth (`sessionCapabilityDiagnostics.ts`, transitively orphaned the moment `sessionQueue.ts` is deleted) is bundled into the same retirement. None has any production caller after the bundling (verified by independent grep below). They are the last entries in `docs/target-architecture.md` §8 ("Code flagged for deletion"), the canonical "next" per the migration order at line 1418 ("Legacy `src/lib/` root cleanup. Last, after the modules above are folded.").

| File | LOC | Status | Why dead |
|------|-----|--------|----------|
| `src/lib/sessionQueue.ts` | 841 | Function surface unused; one type re-homed | Replaced by capability path (Session.tsx → `loadCapabilitySessionPlanForUser`). Helpers extracted into `lib/exercises/builders/` and `lib/distractors/` over multiple PRs. |
| `src/lib/sessionPolicies.ts` | 190 | Fully orphaned | `applyPolicies` has zero non-test callers. Target-arch claimed it would "fold into `lib/session-builder/`" — that directory was never created; `lib/session/` is the modern home and doesn't need this logic. |
| `src/lib/stages.ts` | 114 | Fully orphaned | FSRS stage-promotion gates from the pre-retirement-#3 era. Browser FSRS retired in #3; the current scheduler in `supabase/functions/commit-capability-answer-report/` does not use this file. |
| `src/lib/capabilities/sessionCapabilityDiagnostics.ts` | 100 | Transitively orphaned | Single non-test caller is `sessionQueue.ts:16,139`. Already flagged at `target-architecture.md:850` as "only caller was `lib/sessionQueue.ts` which is dead; retire entirely." Folding into this PR closes the loop. |
| `src/__tests__/sessionQueue.test.ts` | 659 | Bundled with source | Tests against `buildSessionQueue` etc. — irrelevant once the module is gone. |
| `src/__tests__/sessionPolicies.test.ts` | 266 | Bundled with source | Tests against `applyPolicies` — irrelevant once the module is gone. |
| `src/__tests__/stages.test.ts` | 137 | Bundled with source | Tests against `checkPromotion`/`checkDemotion` — irrelevant once the module is gone. |
| `src/__tests__/sessionCapabilityDiagnostics.test.ts` | 211 | Bundled with source | Test of the diagnostics function — irrelevant once the module is gone. |

**Source delete: 1245 LOC. Test delete: 1273 LOC. Total: 2518 LOC.**

Cumulative across retirements 1–7: ~9000 + ~2518 ≈ **~11500 LOC removed**.

## 2. Independent grep verification (the load-bearing safety)

Rule from prior retirements: never trust a doc's "zero callers" claim. Verify every export.

### 2.1 `sessionQueue.ts` exports

Public symbols (from `grep -n "^export" src/lib/sessionQueue.ts`):

```
type SessionMode
interface SessionBuildInput
function buildSessionQueue
function filterEligible
function makeDictation
function hasAudioFor
function makeListeningMcq
function makeClozeMcq
function makeClozeExercise
function makePublishedExercise
```

Production-side grep (excludes `*.test.ts*`):

```
$ rg -n -g '!*.test.ts' -g '!*.test.tsx' \
    "buildSessionQueue|filterEligible|makeDictation|hasAudioFor|\
     makeListeningMcq|makeClozeMcq|makeClozeExercise|\
     makePublishedExercise|SessionBuildInput\b|\bSessionMode\b" src/
```

Result: **zero function callers in production.** All function-name hits are inside `sessionQueue.ts` itself (own internal calls) or doc comments in `lib/exercises/builders/*.ts` and `lib/distractors/cascade.ts` (lineage citations, no runtime imports — verified via the `from '@/lib/sessionQueue'` grep below).

The `SessionMode` type has **two** production importers:

```
src/pages/Session.tsx:11             import { type SessionMode } from '@/lib/sessionQueue'
src/lib/capabilities/capabilityScheduler.ts:2  import type { SessionMode } from '@/lib/sessionQueue'
```

Both are type-only imports. See §3 for the relocation plan.

### 2.2 `sessionPolicies.ts` exports

```
interface SessionPoliciesContext
function applyPolicies
```

Production-side grep:

```
$ rg -n -g '!*.test.ts' -g '!*.test.tsx' \
    "applyPolicies|SessionPoliciesContext" src/ scripts/ supabase/
```

Result: **zero production callers.** The only hits are inside `sessionPolicies.ts` itself (helper signatures). One stale documentation comment exists at `src/services/exerciseAvailabilityService.ts:45` ("Note: sessionPolicies.ts filterByExerciseAvailability uses the raw map and …") — comment only, no runtime reference.

### 2.3 `stages.ts` exports

```
function checkPromotion
function checkDemotion
```

Production-side grep:

```
$ rg -n -g '!*.test.ts' -g '!*.test.tsx' \
    "checkPromotion|checkDemotion" src/ scripts/ supabase/
```

Result: **zero production callers.** Only its own test imports it.

### 2.3a `sessionCapabilityDiagnostics.ts` exports (added in R1 fold; expanded in R2 fold)

Six public exports (verified via `grep -n "^export" src/lib/capabilities/sessionCapabilityDiagnostics.ts`):

```
interface SessionCapabilityDiagnostic            (line 6)
interface SessionCapabilityDiagnosticInput       (line 14)
type      SessionCapabilityDiagnosticsProvider   (line 20)
function  setSessionCapabilityDiagnosticsProvider (line 24)
function  runSessionCapabilityDiagnosticsIfEnabled (line 28)
function  diagnoseSessionItems                   (line 56)
```

Production-side grep across **all six**:

```
$ rg -n -g '!*.test.ts' -g '!*.test.tsx' \
    "SessionCapabilityDiagnostic\b|SessionCapabilityDiagnosticInput|\
     SessionCapabilityDiagnosticsProvider|setSessionCapabilityDiagnosticsProvider|\
     runSessionCapabilityDiagnosticsIfEnabled|diagnoseSessionItems" \
   src/ scripts/ supabase/
```

Result: **two production hits, both inside `sessionQueue.ts`** (`:16` import of `runSessionCapabilityDiagnosticsIfEnabled`, `:139` call site). The other five exports (`SessionCapabilityDiagnostic`, `SessionCapabilityDiagnosticInput`, `SessionCapabilityDiagnosticsProvider`, `setSessionCapabilityDiagnosticsProvider`, `diagnoseSessionItems`) have **zero non-test consumers anywhere**. Once `sessionQueue.ts` is deleted, the production caller count for the entire module drops to zero. The transitive orphan is the textbook case for bundling into the same PR.

### 2.4 Import-line confirmation across the entire codebase

```
$ rg -n "from '@/lib/sessionQueue'|from '@/lib/sessionPolicies'|\
        from '@/lib/stages'|from '\./sessionQueue'|\
        from '\./sessionPolicies'|from '\./stages'" src/ scripts/ supabase/
```

Result (5 hits total):

```
src/pages/Session.tsx:11                           import { type SessionMode } from '@/lib/sessionQueue'
src/lib/capabilities/capabilityScheduler.ts:2      import type { SessionMode } from '@/lib/sessionQueue'
src/__tests__/sessionQueue.test.ts:3-4             buildSessionQueue, SessionBuildInput
src/__tests__/sessionPolicies.test.ts:2            applyPolicies, SessionPoliciesContext
src/__tests__/stages.test.ts:2                     checkPromotion, checkDemotion
```

The two production hits are both `SessionMode` (type-only). All function/class imports are test-only.

### 2.5 CLAUDE.md self-confirms

CLAUDE.md:187 already declares: *"The legacy `buildSessionQueue` in `src/lib/sessionQueue.ts` has zero non-test callers — it survives only as a source of extracted helpers."* This retirement closes that loop.

## 3. `SessionMode` type relocation — only architect-bait edge case

The `SessionMode` type at `sessionQueue.ts:18` is:

```typescript
export type SessionMode = 'standard' | 'lesson_practice' | 'lesson_review'
```

`src/lib/session/sessionPlan.ts:5` already defines an **identical** type under a different name:

```typescript
export type CapabilitySessionMode = 'standard' | 'lesson_practice' | 'lesson_review'
```

`CapabilitySessionMode` has **12 occurrences across 3 files** in `lib/session/` (see grep at §3.1).

**Plan (revised after R1 IMPORTANT-2):** Rename `CapabilitySessionMode` → `SessionMode` in `sessionPlan.ts` and its 12 internal `lib/session/` occurrences. The two production importers (`Session.tsx`, `capabilityScheduler.ts`) then become path-only edits — zero identifier churn. Drop the duplicate type in `sessionQueue.ts` along with the file itself.

**Why this direction (not the inverse):**
- `Session.tsx`'s URL-param helpers (`parseSessionMode`, `VALID_SESSION_MODES`, `isLessonScopedSessionMode`) name themselves around `SessionMode`. Renaming the type to `CapabilitySessionMode` would force `parseSessionMode` to return a `CapabilitySessionMode`, which is semantically awkward — the URL-param parser handles every session mode, not just capability ones.
- Once retirement #7 lands, every production session is a capability session (CLAUDE.md:187 + `Session.tsx:18` confirm `loadCapabilitySessionPlanForUser` is the only mount path), so the `Capability` prefix carries zero distinguishing information at runtime — vestigial naming from when both types co-existed.
- This direction also yields a smaller diff: 8 mechanical renames in `lib/session/` (one sed pass) + 2 path-only import edits in production importers, vs. 6 identifier edits in production importers + 0 internal renames. Roughly equivalent diff size, but the chosen direction preserves the natural identifier semantics.

### 3.1 Existing `CapabilitySessionMode` consumers

```
src/lib/session/sessionPlan.ts:5,41                                    export + 1 field type    (2 hits)
src/lib/session/sessionComposer.ts:3,32                                type-only import + 1 parameter (2 hits)
src/lib/session/capabilitySessionLoader.ts:13,19,42,90,95,110,120,328  import + 7 parameter/local types (8 hits)
```

All **12 occurrences across 3 files** in `lib/session/`. One mechanical rename pass.

### 3.2 Required edits

```
src/lib/session/sessionPlan.ts:5
  - export type CapabilitySessionMode = 'standard' | 'lesson_practice' | 'lesson_review'
  + export type SessionMode = 'standard' | 'lesson_practice' | 'lesson_review'

src/lib/session/sessionPlan.ts:41
  - mode: CapabilitySessionMode
  + mode: SessionMode

src/lib/session/sessionComposer.ts:3,32
  Replace 2 occurrences `CapabilitySessionMode` → `SessionMode` (1 import-line, 1 parameter type).

src/lib/session/capabilitySessionLoader.ts:13,19,42,90,95,110,120,328
  Replace 8 occurrences `CapabilitySessionMode` → `SessionMode` (1 import-line, 7 parameter types).

src/pages/Session.tsx:11
  - import { type SessionMode } from '@/lib/sessionQueue'
  + import type { SessionMode } from '@/lib/session/sessionPlan'
  (No identifier rename — only the import path.)

src/lib/capabilities/capabilityScheduler.ts:2
  - import type { SessionMode } from '@/lib/sessionQueue'
  + import type { SessionMode } from '@/lib/session/sessionPlan'
  (No identifier rename — only the import path.)
```

No behavioural change. Both names alias the same string-union literal.

### 3.3 Decision locked: URL-param helpers stay in `Session.tsx`

R1 IMPORTANT-3 confirmed: `VALID_SESSION_MODES`, `parseSessionMode`, `isLessonScopedSessionMode` stay in `Session.tsx`. Reasons:
- They are page-only (URL parsing is a page concern, not a domain-model concern).
- `lib/session/sessionPlan.ts` is currently a pure type/data module with zero side-effecting helpers; moving URL-shape glue there inverts that purity.
- Verified zero external callers via `rg -n 'parseSessionMode|isLessonScopedSessionMode|VALID_SESSION_MODES' src/` — all 4 hits are in `Session.tsx` itself. No cross-module refactor benefit.

## 4. Lineage-comment cleanup + one user-facing string

Six doc comments cite line numbers in `sessionQueue.ts`. Once the file is gone, those line references rot. One user-facing warning string in a developer script also references a retired symbol by name.

| File | Line | Current text | Action |
|------|------|--------------|--------|
| `src/lib/exercises/builders/ContrastPair.ts` | 3 | `// Mirrors makePublishedExercise's contrast_pair branch at sessionQueue.ts:973-994.` | Drop the line-number, keep the lineage idea: "Originally extracted from `sessionQueue.ts` (retired in #7)." |
| `src/lib/exercises/builders/SentenceTransformation.ts` | 2 | `// Authored only. Mirrors makePublishedExercise's sentence_transformation …` | Same. |
| `src/lib/exercises/builders/ConstrainedTranslation.ts` | 2 | (similar) | Same. |
| `src/lib/exercises/builders/Speaking.ts` | 3 | `// utterance. Mirrors makePublishedExercise's speaking branch at …` | Same. |
| `src/lib/exercises/builders/ClozeMcq.ts` | 7 | `// makeClozeMcq at sessionQueue.ts:984-1027.` | Same. |
| `src/lib/distractors/cascade.ts` | 24 | `(makeRecognitionMCQ, makeCuedRecall, makeClozeMcq, and the new …)` | Drop the symbol-name list referring to the deleted module; replace with module-name reference. |
| `scripts/dev-stage-force.ts` | 103 | `console.warn('  ⚠️ item is inactive — filterEligible will exclude it even after forcing due/stage. Reactivate first.')` | Update to reflect the capability-eligibility gate: `'  ⚠️ item is inactive — the capability-loader eligibility gate will exclude it even after forcing due/stage. Reactivate first.'`. Behaviour unchanged. |
| `scripts/lint-staging.ts` | 421 | `// sessionQueue.ts:243-266 normalises options to text strings and the …` | Drop the file-line citation; keep the substantive description. |

### 4.1 Lineage references kept (not edited)

Two prose references to `sessionQueue.ts` are kept as historical breadcrumbs (verified non-load-bearing, comments only):

- `src/lib/distractors/index.ts:2` — *"Extracted from `src/lib/sessionQueue.ts` (cascade + helpers) and `src/lib/semanticGroups.ts`…"*
- `src/lib/distractors/__tests__/cascade.test.ts:1` — *"Cascade tier-behavior tests, lifted verbatim from `sessionQueue.test.ts` during PR-1 of the capabilityContentService spec."*

Both intentionally retained: a future code-archeologist puzzling over why these files have their current shape benefits from the breadcrumb. The references survive a `git log` for the deleted file, so they don't go stale in a corrosive way — they point at a removed file rather than rotted line numbers.

These edits land in the same atomic commit as the source deletion (see §6).

## 5. Documentation updates

R1 CRITICAL-2 expansion: the four architecture docs that describe the deleted code as live runtime are added below. These docs are intended to describe **current** code, not history — so the right edit is structural removal of the legacy sections rather than annotation.

### 5.1 `docs/architecture/` updates (R1 CRITICAL-2)

| File | What changes |
|------|--------------|
| `docs/architecture/session-engine.md` | (a) Delete the "Legacy Item Queue" section (lines 18-40 — describes `buildSessionQueue` and `applyPolicies` as live behaviour). (b) In the lead diagram (lines 5-14), drop the "legacy item queue" branch (lines 6-9) — keep only the "capability session path" branch. (c) Delete the opening paragraph at **line 16** ("The legacy queue still powers the normal item-based session UI…") which becomes false post-retirement. The H1 title at line 1 + the framing at line 3 stay. |
| `docs/architecture/session-modes.md` | Delete the "Legacy Queue Modes" section spanning **lines 3-29** (NOT 1-29 — line 1 is the H1 `# Session Modes` which must stay; line 2 is blank). **Already structurally broken**: the section claims `SessionMode = 'standard' \| 'backlog_clear' \| 'quick'`, but the live code at `sessionQueue.ts:18` declares `'standard' \| 'lesson_practice' \| 'lesson_review'` — the `backlog_clear`/`quick` modes were removed in a prior retirement and the doc never tracked it. After the section delete, the file becomes "capability planner modes only" (the `## Capability Planner Modes` section already exists at line 31). |
| `docs/architecture/session-policies.md` | Entire file describes `applyPolicies` as live runtime. Delete the file outright. The capability path's gates are already documented in `lib/session/sessionPlan.ts` source comments and `docs/architecture/session-engine.md` (capability path section), so a stub adds no information. **NB:** see the README.md row immediately below for the broken-link cleanup that this entails. |
| `docs/architecture/README.md` | Three coordinated edits: (a) **Line 11** — drop the sentence "The legacy item queue lives in `src/lib/sessionQueue.ts`. The newer capability path…" — replace with capability-path-only framing. (b) **Lines 13-15** — delete the entire `## [Session Policies](session-policies.md)` heading + paragraph block (target file is being deleted; broken-link removal is mandatory). (c) **Line 17 (now `## [Session Modes](session-modes.md)` heading) + line 19** — update the paragraph to drop the "legacy queue modes are `standard`, `quick`, and `backlog_clear`" phrasing; modes are now `standard`, `lesson_practice`, `lesson_review`. |
| `docs/architecture/fsrs-scheduling.md:97` | *"The exact thresholds are in `src/lib/stages.ts` (`checkPromotion`, `checkDemotion`)."* → "The exact thresholds were in `src/lib/stages.ts` (retired in retirement #7); the current scheduler is `supabase/functions/commit-capability-answer-report/`. The historical constants are preserved in git history if needed for FSRS tuning research." |
| `docs/architecture/fsrs-scheduling.md:113-115` | Delete the entire `## filterByApprovedContent (deferred)` section — both the heading at line 113 and the paragraph at line 115. Once `sessionPolicies.ts` is gone, the section references nothing. |

### 5.2 Other doc / source updates

| File | What changes |
|------|--------------|
| `docs/target-architecture.md:850` | Drop the line `sessionCapabilityDiagnostics.ts only caller was lib/sessionQueue.ts` (becomes meaningless after R1 CRITICAL-1 fold). |
| `docs/target-architecture.md:1368-1382` (§8) | Mark the section as DONE — bullet line per the retirement-#5/#6 pattern, citing this spec. |
| `docs/target-architecture.md:1418` (migration order step 7) | Update step 7 to DONE. |
| `CLAUDE.md:187` | Drop the parenthetical "the legacy `buildSessionQueue` in `src/lib/sessionQueue.ts` has zero non-test callers — it survives only as a source of extracted helpers" — replace with: "Legacy `buildSessionQueue` was retired in retirement #7." |
| `docs/current-system/capability-system-handoff.md:15` | Drop `→ buildSessionQueue` from the flow diagram (replace with the capability-loader path that's already adjacent in that file). |
| `docs/FSRS_LANGUAGE_LEARNING_TUNING.md:5,60,158,159` | Add a header note: "**Note:** `src/lib/stages.ts` was retired in retirement #7. The promotion-gate semantics described below describe the historical pre-FSRS-retirement design; the current scheduler lives at `supabase/functions/commit-capability-answer-report/index.ts`. Constants and pseudocode below are preserved for SLA / FSRS-tuning reference." Then the four cited line references just become part of the historical description that the header reframes — no further per-line edits needed. |

### 5.3 Out of scope (intentionally NOT updated)

- `docs/research/2026-04-25-skill-rotation-and-pedagogical-sequencing.md` — historical research artifact, ~30 references to the retired files. Convention from prior retirements: leave research/historical plans as-is; add forward-pointers only if confusion is plausible. The doc's preamble already frames it as a redesign proposal.
- `docs/plans/2026-04-17-listening-mcq-impl.md`, `docs/plans/2026-04-07-fsrs-simplification.md` — historical implementation plans; same convention.

## 6. Commit plan

Following the OpenBrain "atomic source+test bundling" rule (every commit must build + tests green). One commit for all four source+test pairs, plus a doc-update commit.

**Commit 1 (source + test atomic bundle, all four files together — R1 CRITICAL-1 added the fourth):**
```
chore: retire src/lib/sessionQueue.ts + sessionPolicies.ts + stages.ts +
       sessionCapabilityDiagnostics.ts (retirement #7)

- Delete sessionQueue.ts, sessionPolicies.ts, stages.ts,
  sessionCapabilityDiagnostics.ts
- Delete the matching tests in src/__tests__/
- Rename CapabilitySessionMode → SessionMode in lib/session/sessionPlan.ts
  and its 8 internal consumers (one rename pass)
- Swap the two production SessionMode imports to point at
  '@/lib/session/sessionPlan' (path-only edits)
- Clean up six lineage comments in lib/exercises/builders/ + lib/distractors/cascade.ts
- Update one user-facing warning string at scripts/dev-stage-force.ts:103
- Drop the stale comment reference at scripts/lint-staging.ts:421
```

Bundling all four together is the right call because:
- Each file's source+test pair is independently atomic.
- Inter-file dependencies between the four are: only `sessionQueue.ts → sessionCapabilityDiagnostics.ts` (one-way); the other three are independent. Splitting into four separate commits would force `sessionCapabilityDiagnostics.ts` removal to land **after** `sessionQueue.ts` removal (otherwise unused-import warnings or import-error). Bundling is simpler.
- The `SessionMode` rename + relocation must land in the same commit as the source delete, otherwise either intermediate state is non-typechecking.
- Splitting offers no debugging benefit (revert is the rollback path either way).

**Commit 2 (docs):**
```
docs(arch): mark retirement #7 done in target-architecture + CLAUDE.md +
            architecture/ doc cleanup
```

Alternative considered: split commit 1 into per-file commits. Rejected — see "atomic source+test bundling" lesson from retirement #1; splitting introduces no debugging benefit and creates an unnecessary multi-way dependency between the rename and the deletes.

**Spec commit:** This file lands first, before any deletion — same convention as retirements #5 and #6.

## 7. Pre-deploy gate

Standard retirement-PR gate. Run **all** of these locally before opening the PR:

```
bun run lint
bun run test --run
bun run build
```

`make pre-deploy` is the documented gauntlet but it includes `make check-supabase` and `make check-supabase-deep` which require the homelab Supabase stack. Per retirement-#5/#6 lesson: code-level gate above is the binding gate for source-only retirements.

Test count expectation (R1 IMPORTANT-1, hard number):

| File | `it(` / `test(` blocks |
|------|-----------------------:|
| `sessionQueue.test.ts` | 37 |
| `sessionPolicies.test.ts` | 7 |
| `stages.test.ts` | 15 |
| `sessionCapabilityDiagnostics.test.ts` | 5 |
| **Total deletion delta** | **64** |

**Pre-deletion count: 64 individual test cases.** Capture the pre-PR `bun run test --run` total, subtract 64, and assert the post-PR total matches. Per OpenBrain vitest-discovery lesson: a soft range fails the diagnostic ("did the count actually drop?"). The executor should record both numbers in the PR description.

`make check-supabase-deep` not required (no DDL). The 2026-05-02 RLS-empty-table regression on `learner_lesson_engagement` and `capability_resolution_failure_events` is **out of scope**; existing `known-regressions.md` entry remains.

## 8. Why this is safe

- **Zero production function-callers** of any retired symbol (verified §2.1, §2.2, §2.3, §2.4).
- **Type-only consumer** for the one survivor (`SessionMode`), trivially relocated to an existing identical type.
- **No database changes.** No DDL. No migration. No GRANT or RLS audit needed.
- **No edge-function changes.** `commit-capability-answer-report/` does not import any of these files.
- **No CI/build glob changes.** vitest's `src/**/__tests__/**/*.test.{ts,tsx}` glob doesn't enumerate the deleted files; they simply stop existing.
- **No public-API surface change.** Nothing the user-facing app exposes goes through these files.
- **No content-pipeline changes.** Lesson seeding, audio synthesis, and capability publishing are independent of these modules.
- **No PWA / service-worker / Vite bundle implications** — no entry-point or chunk depends on these files.

## 9. Why this could be unsafe (architect should challenge these)

Listed for R1 challenge:

1. **Lineage comments could be the only documentation of pre-capability-path behaviour.** If a future engineer needs to understand why ContrastPair was structured a particular way, the line-number reference into `sessionQueue.ts` was the only breadcrumb. Mitigation: replace with the module-level reference rather than dropping the comment entirely.

2. **`SessionMode` re-rename touches a hot path.** `Session.tsx` is the page that actually mounts every learning session. A typo in the type-rename could fail the URL-mode parser. Mitigation: 4 mechanical edits + typecheck + smoke test (`bun run dev`, navigate `/session?mode=lesson_practice`).

3. **Test-count drop assumption.** If the deleted tests' total `it(...)` count is wrong, the post-PR test count won't be diagnostic. Mitigation: capture pre-deletion test count, expected count, post-deletion count in the PR description.

4. **Historical plan/research docs not updated.** A reader following an old plan link could be confused. Mitigation: forward-pointers in target-arch (covered in §5) plus a "historical reference" disclaimer in `FSRS_LANGUAGE_LEARNING_TUNING.md`.

5. **`scripts/lint-staging.ts:421` is touched.** It's not a frontend file; it's a Bun-runner script in the content pipeline. The edit is a comment-only change — runtime behaviour is unaffected. Architect should still verify by reading the surrounding function.

6. **Distractors module lineage assertion is load-bearing or not?** `src/lib/distractors/index.ts:2` (verified earlier) literally says *"Extracted from src/lib/sessionQueue.ts (cascade + helpers) and …"*. Confirm the comment is not somehow load-bearing (e.g. a search target for a tool). Likely fine.

## 10. Out of scope (intentionally deferred)

- **`src/lib/useExerciseScoring.ts`** — target-arch §8 lists it but says "relocate to src/hooks/", not retire. It has 11 production callers (every exercise implementation). Relocation is a separate refactor — different mechanics, different blast radius. Recommend a follow-up PR.
- **`learner_lesson_engagement` table retirement** — flagged in `docs/known-regressions.md` §1 as a candidate. DB-only change; should be bundled with the un-fixed RLS regression on `capability_resolution_failure_events` rather than with this source-only PR.
- **The 14 other `src/lib/` root standalone files** (`audioPreferences.ts`, `featureFlags.ts`, `i18n.ts`, etc.) — all have live callers; not retirement candidates. They survive `src/lib/` root cleanup as legitimate utility files until/unless they fold into a module.
- **Updating `docs/architecture-layers.html`** — already noted in target-arch §"Backlog" as an optional future task.

## 11. Rollback plan

If post-deploy any consumer surfaces missing symbols, `git revert` the deletion commit. The branch is source-only, so revert restores the files atomically with no DB consequences. There is no migration to roll back. Edge functions are untouched.

If a partial rollback is needed (e.g. `Session.tsx` typecheck failure), revert `commit 1` and re-apply only the documentation commit afterward.

## 12. Appendix — Verification commands the architect should re-run

For independent confirmation:

```
# Function-symbol callers (production):
rg -n -g '!*.test.ts' -g '!*.test.tsx' \
   "buildSessionQueue|filterEligible|makeDictation|hasAudioFor|\
    makeListeningMcq|makeClozeMcq|makeClozeExercise|makePublishedExercise|\
    applyPolicies|SessionPoliciesContext|checkPromotion|checkDemotion|\
    SessionBuildInput\b" src/ supabase/ scripts/

# Import-line callers (all):
rg -n "from '@/lib/sessionQueue'|from '@/lib/sessionPolicies'|\
       from '@/lib/stages'" src/ scripts/ supabase/

# SessionMode consumers (production):
rg -n -g '!*.test.ts' -g '!*.test.tsx' '\bSessionMode\b' src/

# CapabilitySessionMode consumers (validates target home is real):
rg -n 'CapabilitySessionMode' src/
```

---

**Architect R1 prompt:** Apply the 2026-05-02 OpenBrain lesson (*enumerate every codepath that imports X*) plus the retirement-series playbook lessons. Specifically challenge: §3 type-relocation correctness; §6 commit-bundling decision (was the all-three-together choice the right call vs. per-file?); §5 doc-update completeness (any references missed?); §9 risk list completeness; whether the in-scope vs. out-of-scope split is the right one.

---

## 13. R1 + R2 acknowledgements (folded 2026-05-08)

This section records what changed in response to architect R1 and R2, plus what the architect explicitly endorsed, so that future reviewers know what NOT to second-guess.

### 13.1 R1 findings folded

| Finding | Severity | Disposition |
|---------|----------|-------------|
| C1 — `sessionCapabilityDiagnostics.ts` is transitively orphaned | CRITICAL | Folded. Added as a fourth source+test pair to §1 table, §6 commit plan, and §2 (new §2.3a grep verification). Updated LOC totals: 2207 → 2518. |
| C2 — Architecture docs describe deleted code as live | CRITICAL | Folded. §5 expanded into §5.1 (architecture/ docs) and §5.2 (everything else). Five additional doc files listed: `session-engine.md`, `session-modes.md`, `session-policies.md`, `architecture/README.md`, `fsrs-scheduling.md`. The `session-modes.md` doc was also doubly-broken (listed pre-#6-retirement modes); the rewrite handles both. |
| I1 — Hard test-count = 59 from the three originally-listed files | IMPORTANT | Folded. §7 now lists the exact per-file counts in a table; total updated to 64 with the diagnostics-test bundle. |
| I2 — Invert rename direction (`CapabilitySessionMode` → `SessionMode`) | IMPORTANT | Folded. §3 fully rewritten: the rename now happens inside `lib/session/` (**12 occurrences across 3 files** — corrected from 8 in R2), and the two production importers become path-only edits with zero identifier churn. Reasons documented inline. |
| I3 — URL-param helpers stay in `Session.tsx` | IMPORTANT | Folded as a locked decision in §3.3 — verified zero external callers via `rg`. |
| M1 — `distractors/index.ts:2` + `cascade.test.ts:1` lineage references | MINOR | §4.1 added: kept as historical breadcrumbs (verified non-load-bearing). |
| M3 — `dev-stage-force.ts:103` user-facing string | MINOR | §4 table now lists the warning-string update. |
| M4 — Commit-bundling decision endorsed | MINOR (endorsement) | No edit needed; architect explicitly endorsed §6's all-together bundling against retirement #1's per-file convention. Recorded here for trail completeness. |
| N1 — Rollback realism | NIT | No edit needed; architect confirmed §11 is correct. |
| N2 — Lineage-comment pedagogy | NIT | No edit needed; architect endorsed §4's altitude. |

### 13.2 R1 finding deferred (with reason — corrected in R2 round)

| Finding | Reason for deferring |
|---------|----------------------|
| M2 — `scripts/publish-approved-content.ts:892` references `filterEligible` | **R1 finding is correct; my original R1 acknowledgement was wrong.** Independent re-grep confirms 1 hit at `publish-approved-content.ts:892`: `// two render paths satisfies filterEligible.` This is a code comment inside a publish-gate explanation block — not a runtime reference. The original R1 acknowledgement section claimed a "hallucinated reference"; that was incorrect (a multi-file grep had silently dropped the file from results). The reference exists. **Disposition:** the comment is bookkeeping, not safety-critical; updating it is deferred to a follow-up code-comment sweep rather than bundling it into the retirement-#7 PR. The runtime behaviour of the publish script is unaffected by the retirement. Logged for transparency; future grep audits will catch any further stragglers. |

### 13.3 Architect R1 acknowledgements (executor: do not re-litigate)

The architect explicitly endorsed these spec decisions; later reviewers should not re-open them:

1. **Independent grep verification methodology** at §2 is the load-bearing safety. Reproduced under R1 re-grep — methodology is sound.
2. **Atomic source+test bundling** at §6 is correct (R1 MINOR-4 explicitly endorsed it against retirement #1's per-file convention).
3. **Migration-order placement** is right: target-arch §migration-order step 7 cited at line 1418 — this PR is the literal next step.
4. **`make check-supabase-deep` exemption** at §7 is correct: zero DDL, zero RLS, zero schema changes.
5. **`useExerciseScoring.ts` deferral** at §10 is the right split: relocation, not retirement (11 production callers per target-arch §1380).
6. **`learner_lesson_engagement` deferral** at §10 is correct: bundle with the un-fixed RLS regression on `capability_resolution_failure_events`, not with this source-only PR.
7. **CLAUDE.md self-confirmation citation** at §2.5 is exactly the right pedagogical move.
8. **`scripts/lint-staging.ts:421` catch** at §5 — the architect noted this was non-obvious.
9. **The 6-comment §4 cleanup list** is exhaustive for `lib/exercises/builders/` + `lib/distractors/cascade.ts`.

### 13.4 R2 corrections folded (2026-05-08)

R2-on-spec verdict: **APPROVE-WITH-NOTES.** No blockers. R2 caught 5 precision defects introduced or surviving R1; all corrected in this revision:

| R2 finding | Severity | Correction |
|------------|----------|------------|
| §13.2 M2 claim was factually wrong (a hit exists at `publish-approved-content.ts:892`) | WARNING | §13.2 fully rewritten — the line is a code comment, not runtime; deferred to a follow-up sweep with corrected rationale. |
| `CapabilitySessionMode` count is 12, not 8 | WARNING | §1, §3 prose, §3.1, §13.1 C1 row updated — all four summary numbers now correctly read 12. |
| §5.1 `session-modes.md` "delete lines 1-29" would kill the H1 title | WARNING | §5.1 row updated to "delete lines 3-29" with H1 preservation note. |
| §5.1 README missed the `## [Session Policies](session-policies.md)` link block (lines 13-15) that breaks if `session-policies.md` is deleted | WARNING | §5.1 README row expanded to (a) line 11 framing edit, (b) lines 13-15 broken-link removal, (c) line 17-19 mode-list update. |
| §2.3a only greps 1 of 6 `sessionCapabilityDiagnostics.ts` exports | WARNING | §2.3a expanded to enumerate all 6 exports + grep all of them. |
| §5.1 `session-engine.md` line numbers off by one (diagram, opening paragraph) | MINOR | §5.1 row updated: diagram is lines 5-14 (not 1-15); opening paragraph at line 16 (not 17). |
| §5.1 `fsrs-scheduling.md` "Delete the section" was ambiguous about the `## filterByApprovedContent` heading | MINOR | §5.1 row updated to "lines 113-115" with explicit heading-deletion. |
| §13.3 acknowledgement #2 referenced "MINOR-4" not in §13.1 | NIT | §13.1 now has an M4 row marking the commit-bundling endorsement. |

### 13.5 R2 acknowledgements (executor: do not re-litigate)

The R2 architect explicitly endorsed these revised-spec decisions:

1. **C1 fold is tight and consistent across §1 / §2.3a / §6 / §7.** LOC math sums correctly (2518); fourth file appears in every required section.
2. **I2 rename direction inversion is the right call.** Reasoning at §3 lines 158-161 holds.
3. **§3.3 URL-param helpers stay in `Session.tsx`** — verified zero external callers.
4. **§4.1 lineage breadcrumbs** kept as historical references.
5. **§5.1 structural-delete vs annotation reasoning** is correct — these arch docs describe current code, not history.
6. **C2 expansion correctly identifies 5 architecture/ docs**; all five contain stale references as claimed.
7. **§7 hard test-count = 64** with per-file table.
8. **§11 rollback realism** is correct.

### 13.6 Architect R3 not required

R2 was on the revised spec, not on a diff. The R1+R2 fold cycle has converged: R1 found 2 CRITICAL + 3 IMPORTANT + 4 MINOR/NIT; R2 found 0 CRITICAL + 0 IMPORTANT + 5 MINOR + 1 NIT (all precision corrections to R1 fixes, no new structural defects). Per the retirement #5 lesson — "when R1-on-spec converges across multiple rounds with explicit acknowledgements, R2-on-diff finds zero defects" — the next architect round is **R-on-diff after execution**, not another R-on-spec.

Specifically the post-execution R-on-diff round should check:
- Was the architecture/ doc cleanup at §5.1 actually structural (full section deletes) rather than just annotated headers?
- Did the rename inversion (§3.2) catch all 12 `CapabilitySessionMode` occurrences in `lib/session/`?
- Did the test-count delta match exactly (64 fewer tests)?
- Did the executor capture pre-PR + post-PR test counts in the PR description?
- Are there any new lineage comments referencing the deleted symbols that surfaced during execution?
