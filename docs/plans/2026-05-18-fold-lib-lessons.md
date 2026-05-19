---
status: implementing
implementation: branch fold/lib-lessons (commits 98a64f2, 9ffd3e9, dafdc5b, 6966aa5, cb833ef + this commit)
implementation_paths:
  - src/lib/lessons/
  - src/services/lessonService.ts
supersedes:
  - learning-indonesian-archive/docs/plans/2026-05-08-fold-lib-lessons.md
---

# Fold spec — `lib/lessons/`

**Status:** IMPLEMENTING v1.1 (2026-05-18). Supersedes the archived 2026-05-08 draft (never shipped).
**Architect-review-loop:**
- Round 1 (v1) — NEEDS_REVISION (2 SUBSTANTIVE + 5 WARNING + 4 NIT)
- Round 2 (v1.1) — APPROVED with 2 non-blocking NOTES (LOC-estimate sanity check; client-param vs vi.mock stylistic choice left to architect-on-diff)

**Execution deviations from §9 plan:**
- Original commits 2 (rename) and 3 (caller migration) merged into a single commit because renaming the 4 files breaks 16 callers — per source-test-bundling, both must land atomically to keep build + tests green. Net commit count: 6, not 7. Numbering preserved (commits 1, 2, 4, 5, 6, 7).

---

## 0. Why a refresh

The archived 2026-05-08 draft conflated **mechanical fold** (rename files, add barrel, migrate import paths) with **feature retirements** (status tree, practice-action model, progressService, Lessons.tsx UX). Per `feedback_fold_vs_spec` + `feedback_fold_scope_audit`, those are separate concerns.

This refresh strips the smuggled retirements. **Scope is purely mechanical: existing code at new paths, with `index.ts` + `adapter.ts` + a barrel API.** Behaviour-preserving. Feature retirements (status tree, action model, Voortgang re-architecture, Lessons.tsx UX) become follow-up PRs with their own design rationale.

---

## 1. Goal + scope

Establish `src/lib/lessons/` as a deep module per `docs/target-architecture.md` §lib/lessons + §Module conventions.

The fold:
- Renames the existing files in `src/lib/lessons/` to drop the `lesson` prefix (`lessonOverviewModel.ts` → `overview.ts`, etc.).
- Adds `index.ts` (the inbound port barrel) re-exporting the module's public API.
- Adds `model.ts` collecting the public types.
- Adds `adapter.ts` folding the lessons-domain methods from `src/services/lessonService.ts`.
- Migrates ~14 caller import paths.
- Colocates the existing tests under `src/lib/lessons/__tests__/`.
- Retires `lessonReadiness.ts` (zero non-test callers — confirmed by grep on 2026-05-18).

### In scope

| Item | Rationale |
|---|---|
| Rename `lessonOverviewModel.ts` → `overview.ts` | Module convention: drop folder name from file name |
| Rename `lessonOverviewStatus.ts` → `overviewStatus.ts` | Same |
| Rename `lessonExperience.ts` → `experience.ts` | Same |
| Rename `lessonActionModel.ts` → `actionModel.ts` | Same |
| Keep `activation.ts` as-is | Already correctly named |
| Add `index.ts` (barrel) | Module convention: every `lib/<name>/` has a barrel |
| Add `model.ts` (public types) | Module convention: collect public types when module has > 2 |
| Add `adapter.ts` (folds lesson-domain methods from `lessonService.ts`) | Module convention: I/O lives in adapter.ts |
| Migrate ~14 caller import paths | Required by file moves |
| Colocate `src/__tests__/lessonExperience.test.ts`, `lessonOverviewModel.test.ts`, `lessonOverviewStatus.test.ts`, `lessonActionModel.test.ts` into `src/lib/lessons/__tests__/` | Module convention: colocated tests |
| Delete `src/lib/lessons/lessonReadiness.ts` + `src/__tests__/lessonReadiness.test.ts` | Zero non-test callers; orphan from retirement #6. The only caller of `isMeaningfulDialogueAudio` / `isMeaningfulGrammarAudio` was the test itself. Bundling deletion into the fold is no-risk and matches the target folder shape. |

### Out of scope — explicitly deferred to follow-up PRs

| Deferred item | Reason for deferral |
|---|---|
| Retire `decideLessonOverviewStatus` / 6-state status tree → simplify to `isActivated` + `isPrepared` | UX simplification; needs a design pass on the Lessons page card layout. Target architecture currently lists `getLessonOverviewStatus` as part of the public API; either keep the surface or amend target arch first. |
| Retire `buildLessonPracticeActions` + `LessonPracticeAction` type | Has 2 live callers (`PracticeActions.tsx`, `Lesson.tsx`) generating user-facing CTAs ("Practice this lesson · N ready" / "Review this lesson"). Removal is a feature retirement, not a fold. |
| Retire `services/progressService.ts` entirely + collapse `useProgressData.ts` indirection | progressService is already a thin façade over `learnerProgressService` (8 lines of body per method); collapsing it is a Voortgang-page architecture clean-up that belongs in the analytics/mastery fold. |
| Retire `markLessonComplete` | Active caller in `pages/Lesson.tsx`. Retirement requires confirming `lesson_progress` is fully derivable + the Dashboard "Continue where you left off" widget can survive without it. Out of fold scope. |
| Rewrite `Lessons.tsx` page render (~40 LOC, retire 6-state status pill) | Coupled to the status-tree retirement above. UX change, not a fold. |
| Clean up `LessonBlockRenderer.tsx:78-82` legacy `payload.audioUrl` read path | Dead code path (pipeline already rejects writes via GT3). Small follow-up retirement PR. |
| `block_kind` legacy 4-value enum (`hero`/`section`/`exposure`/`recap`) removal from `LessonPageBlock` type + `blockKindFromPipeline` classifier retirement | Depends on confirming live DB has no rows with legacy values. Verification + backfill is its own PR. Until then, `experience.ts` keeps the bridging classifier. |
| `lib/preview/localPreviewContent.ts` adaptation | Caller of `buildLessonExperience` — must continue to work post-fold. The fold keeps `buildLessonExperience` **public** (re-exported via `index.ts`) so preview is not broken. The archived draft's "preview-module regression accepted" is dropped from scope. |
| `services/lessonService.getAudioUrl` relocation | Stays in `services/` as long-form lesson audio transport. |
| SQL function `get_lessons_overview` slimming (drop 8 unused fields) | Pipeline-side cleanup. Pairs with analytics fold. |
| Mastery `not_assessed` label retirement | Mastery/analytics fold concern. |
| Target-architecture amendment for the `isMeaningfulDialogueAudio` / `isMeaningfulGrammarAudio` orphans | The target arch §lib/lessons (lines 525-540) still lists them as public. Will be amended in a paired commit to this PR, but the amendment is small (delete 2 lines from the public-API block + 1 line from the file structure block) so does not change fold scope. |

### Prerequisites (already shipped, verified 2026-05-18)

| Prereq | Status |
|---|---|
| Pipeline writes `lesson_sections.content.grammar_topics: string[]` | ✅ `scripts/lib/pipeline/lesson-stage/enrichGrammarTopics.ts` |
| Pipeline writes canonical 7-value `lesson_page_blocks.block_kind` | ✅ `scripts/lib/pipeline/lesson-stage/runner.ts:183` via `classifyBlockKind`. Legacy data tolerance preserved by runtime classifier (defer-cleanup item above). |
| Pipeline rejects `payload.audioUrl` on page-blocks | ✅ `scripts/lib/pipeline/lesson-stage/__tests__/runner.test.ts:290` ("payload audioUrl in a page-block surfaces a GT3 error") |
| Voice-paired `fetchSessionAudioMap` API | ✅ `src/services/audioService.ts:24` takes `AudioRequest[]` with `voiceId` |

No new prerequisites required by the mechanical fold.

---

## 2. Public surface (post-fold, behaviour-preserving)

```ts
// src/lib/lessons/index.ts

// Overview
export { buildLessonOverviewModel, buildLessonOverviewSignals, isPublishedOverviewLesson } from './overview'
export type {
  LessonOverviewModel,
  LessonOverviewModelLesson,
  LessonOverviewExposure,
  LessonOverviewExposureKind,
  LessonOverviewCapabilityCounts,
  LessonOverviewRow,
} from './overview'

// Overview status helpers (still public until the status-tree retirement PR)
export {
  decideLessonOverviewStatus,
  formatGrammarTopicTag,
  isLessonSatisfiedForRecommendation,
  overviewActionLabel,
  recommendLesson,
} from './overviewStatus'
export type {
  LessonOverviewStatus,
  LessonOverviewSignal,
  LessonGrammarTopic,
} from './overviewStatus'

// Experience
export { buildLessonExperience } from './experience'
export type {
  LessonExperience,
  LessonExperienceBlock,
  LessonExperienceBlockKind,
} from './experience'

// Practice actions
export { buildLessonPracticeActions } from './actionModel'
export type {
  LessonPracticeAction,
  LessonPracticeActionState,
} from './actionModel'

// Activation
export {
  isLessonActivated,
  listActivatedLessons,
  setLessonActivated,
} from './activation'

// Lesson-domain adapter (folded from lessonService.ts lessons-domain methods)
export {
  getLessons,
  getLesson,
  getLessonsBasic,
  getLessonsWithVoice,
  getLessonPageBlocks,
  getLessonsOverview,
  getLessonCapabilityPracticeSummary,
  lessonSourceRefForOverview,
  lessonSourceRefsByLesson,
  extractLessonGrammarTopics,
} from './adapter'
export type {
  Lesson,
  LessonSection,
  LessonPageBlock,
  LessonCapabilityPracticeSummary,
  LessonOverviewSourceBlock,
  LessonOverviewRow as LessonOverviewServiceRow, // disambiguate from overview's LessonOverviewRow
} from './adapter'
```

This is wider than the convention's soft cap of ~10 symbols (the deep-module width rule). **That is explicit** — the wide surface is the current behaviour expressed at the new path. The narrowing happens in the follow-up retirement PRs.

Note: `LessonOverviewRow` collision between `overview.ts` (the rich UI row) and `adapter.ts` (the raw SQL-shaped row from `get_lessons_overview` RPC) is resolved by re-export alias `LessonOverviewServiceRow`. Caller updates pick one or the other.

---

## 3. File-by-file plan

```
src/lib/lessons/
  index.ts              NEW — public barrel
  overview.ts           RENAME from lessonOverviewModel.ts; body unchanged
  overviewStatus.ts     RENAME from lessonOverviewStatus.ts; body unchanged
  experience.ts         RENAME from lessonExperience.ts; body unchanged
                        EXCEPT: import path for `Lesson` / `LessonPageBlock`
                        switches from `@/services/lessonService` to `./adapter`
  actionModel.ts        RENAME from lessonActionModel.ts; body unchanged
  activation.ts         UNCHANGED — already correctly named
  adapter.ts            NEW — folds lesson-domain methods from
                        services/lessonService.ts (see §4)
  __tests__/
    overview.test.ts        MOVE from src/__tests__/lessonOverviewModel.test.ts
    overviewStatus.test.ts  MOVE from src/__tests__/lessonOverviewStatus.test.ts
    experience.test.ts      RENAME from src/lib/lessons/__tests__/lessonExperience.test.ts
                              AND MERGE in the 2 non-overlapping it() blocks from
                              src/__tests__/lessonExperience.test.ts (see §6)
    actionModel.test.ts     MOVE from src/__tests__/lessonActionModel.test.ts
    activation.test.ts      ALREADY EXISTS at src/lib/lessons/__tests__/
    adapter.test.ts         NEW — split out from src/__tests__/lessonService.test.ts:
                              the tests for the 7 folded methods + 3 pure helpers
                              + 6 type fixtures move here; the tests for the 2
                              remaining service methods (getUserLessonProgress,
                              getAudioUrl) stay in src/__tests__/lessonService.test.ts.
                              Net it() count is preserved (split, not deletion).

DELETE (after merge above):
  src/__tests__/lessonExperience.test.ts          (cases merged into colocated experience.test.ts)
  src/lib/lessons/lessonReadiness.ts              (orphan, zero non-test callers)
  src/__tests__/lessonReadiness.test.ts           (paired with the orphan)
```

### `model.ts` decision

**Elided in v1.** The convention says "include `model.ts` when the module has > 2 public types". The module does cross that threshold, but the existing per-file colocation pattern is intentional — each type is exported next to its consumer, and extracting to `model.ts` risks circular imports between (e.g.) `overview.ts` reading `LessonOverviewStatus` from `overviewStatus.ts`. Defer the consolidation pass to a follow-up if drift becomes painful. The barrel in §2 does **not** import from `./model`; the file is not created.

---

## 4. `adapter.ts` content (the new file)

Folds the **lesson-domain** methods from `src/services/lessonService.ts`. The line "lesson-domain methods move into the adapter; pure-CRUD methods stay in `services/`" from the archived draft was too clever — every lesson method is "CRUD-shaped" in the sense that it's a Supabase read. What the adapter actually does is hide the schema name, the column-shape mapping, and the source_ref convention. So **all 9 methods** in `lessonService.ts` plus the 4 helper pure functions move into the adapter:

| Symbol | Today | Post-fold |
|---|---|---|
| `Lesson` interface | `services/lessonService.ts:6` | `lib/lessons/adapter.ts` |
| `LessonSection` interface | `services/lessonService.ts:24` | `lib/lessons/adapter.ts` |
| `LessonPageBlock` interface | `services/lessonService.ts:32` | `lib/lessons/adapter.ts` |
| `LessonCapabilityPracticeSummary` interface | `services/lessonService.ts:57` | `lib/lessons/adapter.ts` |
| `LessonOverviewSourceBlock` interface | `services/lessonService.ts:62` | `lib/lessons/adapter.ts` |
| `LessonOverviewRow` interface (RPC-shape) | `services/lessonService.ts:160` | `lib/lessons/adapter.ts` |
| `lessonSourceRefForOverview` (pure) | `services/lessonService.ts:67` | `lib/lessons/adapter.ts` |
| `lessonSourceRefsByLesson` (pure) | `services/lessonService.ts:71` | `lib/lessons/adapter.ts` |
| `extractLessonGrammarTopics` (pure) | `services/lessonService.ts:140` | `lib/lessons/adapter.ts` |
| Helper `trimTopic` (private) | `services/lessonService.ts:94` | `lib/lessons/adapter.ts` (still private) |
| Helper `stringList` (private) | `services/lessonService.ts:100` | `lib/lessons/adapter.ts` (still private) |
| Helper `categoryTitles` (private) | `services/lessonService.ts:106` | `lib/lessons/adapter.ts` (still private) |
| `lessonService.getLessons` | `services/lessonService.ts:178` | `lib/lessons/adapter.ts: getLessons` |
| `lessonService.getLesson` | `services/lessonService.ts:189` | `lib/lessons/adapter.ts: getLesson` |
| `lessonService.getLessonsBasic` | `services/lessonService.ts:208` | `lib/lessons/adapter.ts: getLessonsBasic` |
| `lessonService.getLessonsWithVoice` | `services/lessonService.ts:218` | `lib/lessons/adapter.ts: getLessonsWithVoice` |
| `lessonService.getLessonPageBlocks` | `services/lessonService.ts:228` | `lib/lessons/adapter.ts: getLessonPageBlocks` |
| `lessonService.getLessonCapabilityPracticeSummary` | `services/lessonService.ts:239` | `lib/lessons/adapter.ts: getLessonCapabilityPracticeSummary` |
| `lessonService.getLessonsOverview` | `services/lessonService.ts:279` | `lib/lessons/adapter.ts: getLessonsOverview` |
| `lessonService.getUserLessonProgress` | `services/lessonService.ts:287` | **STAYS in `services/lessonService.ts`** — reads `lesson_progress` table (Dashboard concern). Belongs in the analytics/mastery fold, not lessons. |
| `lessonService.getAudioUrl` | `services/lessonService.ts:201` | **STAYS in `services/lessonService.ts`** — long-form lesson audio bucket transport. Per target arch §lib/lessons "Not part of this module" + draft §1 deferral list. |

### After the fold, `services/lessonService.ts` retains

- `getUserLessonProgress(userId)` — lesson_progress read (Dashboard)
- `getAudioUrl(audioPath)` — long-form lesson audio bucket URL builder

These are 2 methods. If both prove to be the only remaining surface, the service file may be promoted to a re-export shim or retired entirely — but that decision belongs to a follow-up. For this PR, the file shrinks but stays.

### Shape conventions inside `adapter.ts`

- Exports default-export functions (not a `lessonService` object) — matches module convention.
- Adapter functions accept an optional `client` parameter for testability, defaulting to the `supabase` import. This matches the existing `activation.ts` pattern. (Architect may push back: per the archived draft's §4.4 "no `client` injection — vi.mock pattern". That's a stylistic preference question. The current code uses the parameter pattern; preserving it is mechanical. Switching to `vi.mock` is a behavioural test-style change worth a separate decision.)

---

## 5. Caller migration

Callers updated by the fold (17 files: 4 page, 4 component, 1 hook, 1 preview, 7 test). The mechanical fold's correctness depends on enumerating every import-path edit — under-counting risks a missed import in commits 3 or 6.

### Production code (10 files)

| Caller | Today's imports (file:line) | Post-fold |
|---|---|---|
| `pages/Lessons.tsx` | `services/lessonService` (`lessonService`); `@/lib/lessons/lessonOverviewModel` (`buildLessonOverviewModel` line 33) | `@/lib/lessons` (single barrel) |
| `pages/Lesson.tsx` | `services/lessonService` (line 8: `lessonService`); `@/lib/lessons/lessonActionModel` (line 21: `buildLessonPracticeActions`, `LessonPracticeActionState`); `@/lib/lessons/activation` (line 22: `isLessonActivated`, `setLessonActivated`) | `@/lib/lessons` |
| `pages/Session.tsx` | `services/lessonService` (`lessonService.getLessonPageBlocks`) | `@/lib/lessons` |
| `pages/Dashboard.tsx` | `services/lessonService` (`lessonService.getLessonsBasic` + `getUserLessonProgress`) | `getLessonsBasic` from `@/lib/lessons`; `getUserLessonProgress` stays at `@/services/lessonService` |
| `hooks/useProgressData.ts` | `services/lessonService` (transport calls); `services/progressService` (deferred — unchanged) | `@/lib/lessons` for lessonService side; progressService unchanged |
| `components/lessons/LessonReader.tsx` | `@/lib/lessons/lessonActionModel` (`LessonPracticeAction` type, line 8) | `@/lib/lessons` |
| `components/lessons/PracticeActions.tsx` | `@/lib/lessons/activation` (line 6: `isLessonActivated`); `@/services/lessonService` (line 7: `lessonService` → `getLesson`, `getLessonPageBlocks`, `getLessonCapabilityPracticeSummary`); `@/lib/lessons/lessonActionModel` (line 8: `buildLessonPracticeActions`) | `@/lib/lessons` |
| `components/lessons/ActivationGate.tsx` | `@/lib/lessons/activation` | `@/lib/lessons` |
| `components/lessons/blocks/LessonBlockRenderer.tsx` | `@/lib/lessons/lessonExperience` (`LessonExperienceBlock` type) | `@/lib/lessons` |
| `lib/preview/localPreviewContent.ts` | `services/lessonService` + `@/lib/lessons/lessonExperience` (calls `buildLessonExperience`) | `@/lib/lessons` |

### Test code (7 files)

| Caller | Today's imports | Post-fold |
|---|---|---|
| `src/__tests__/Lessons.test.tsx` | `services/lessonService` + `@/lib/lessons/*` paths | `@/lib/lessons` |
| `src/__tests__/Lesson.test.tsx` | `services/lessonService` (line 8); `@/lib/lessons/activation` (line 10); `vi.mock('@/services/lessonService')` (line 37); `vi.mock('@/lib/lessons/activation')` (line 52). Mocks `lessonService.getLesson`, `getLessonPageBlocks`, `getLessonCapabilityPracticeSummary`, `getUserLessonProgress`, `getAudioUrl`. | `@/lib/lessons`; `vi.mock` targets switch to `@/lib/lessons` for folded methods, `@/services/lessonService` only for `getUserLessonProgress` + `getAudioUrl` |
| `src/__tests__/dashboard-redesign.test.tsx` | `vi.mock('@/services/lessonService')` (line 26); imports `lessonService` (line 31); mocks `getUserLessonProgress` (lines 64, 104) + `getLessonsBasic` (lines 65, 101) | `vi.mock` split between `@/lib/lessons` (for `getLessonsBasic`) and `@/services/lessonService` (for `getUserLessonProgress`) |
| `src/__tests__/LessonReader.test.tsx` | `@/lib/lessons/lessonExperience` (line 5: `LessonExperience` type) | `@/lib/lessons` |
| `src/__tests__/lessonService.test.ts` | `services/lessonService` direct calls | Split per §6 — adapter-method tests move; the 2 remaining service-method tests stay |
| `src/__tests__/lessonExperience.test.ts` | `@/lib/lessons/lessonExperience` (line 2); `@/services/lessonService` (line 3, types only) | DELETE — unique cases merged into colocated `experience.test.ts` per §6 |
| `src/lib/lessons/__tests__/lessonExperience.test.ts` | `../lessonExperience` (line 2); `@/services/lessonService` (line 3, types only) | RENAME → `experience.test.ts`; rewire to `../experience` + `@/lib/lessons` for types |

### Inline activation-API call sites — NOT rewired in this fold

Three call sites bypass `@/lib/lessons/activation` and hit the table/RPC directly:

| Site | Today | This-fold action |
|---|---|---|
| `lib/mastery/masteryModel.ts:451` | Inline `from('learner_lesson_activation').select(...)` | **Skip.** Rewiring to `listActivatedLessons` from `@/lib/lessons` is a DRY pass, not a mechanical rename. |
| `lib/session-builder/adapter.ts:272` | Inline `from('learner_lesson_activation').select(...)` inside a `Promise.all` batch | **Skip.** Same reasoning. |
| `stores/authStore.ts:172` | Inline `.rpc('set_lesson_activation', ...)` | **Skip.** Same. |

They become a tiny follow-up PR (§11 item 2). Bundling them into this fold would smuggle a DRY pass — exactly what `feedback_fold_scope_audit` warns against.

---

## 6. Test migration

| Existing test file | Action |
|---|---|
| `src/__tests__/lessonExperience.test.ts` | **MERGE** the 2 unique `it()` blocks ("maps pipeline lesson page blocks into ordered reader blocks" line 30; "does not synthesize legacy reader blocks when pipeline blocks are not present" line 66) into the colocated `experience.test.ts` (see next row). These scenarios cover end-to-end shape + empty-blocks behaviour and are **not** present in the colocated file. THEN delete the legacy file. |
| `src/lib/lessons/__tests__/lessonExperience.test.ts` (the colocated file, 7 `it()` cases focused on the `blockKindFromPipeline` classifier) | RENAME → `experience.test.ts`. Merge in the 2 unique cases above. Rewire the type import on line 3 from `@/services/lessonService` to `@/lib/lessons` (must happen in the same commit as the file rename). |
| `src/__tests__/lessonOverviewModel.test.ts` | MOVE → `src/lib/lessons/__tests__/overview.test.ts` |
| `src/__tests__/lessonOverviewStatus.test.ts` | MOVE → `src/lib/lessons/__tests__/overviewStatus.test.ts` |
| `src/__tests__/lessonActionModel.test.ts` | MOVE → `src/lib/lessons/__tests__/actionModel.test.ts` |
| `src/__tests__/lessonReadiness.test.ts` | DELETE — orphan retires (8 `it()` blocks all paired with `lessonReadiness.ts` deletion) |
| `src/__tests__/lessonService.test.ts` | SPLIT — tests for the 7 folded methods + 3 pure helpers move into `src/lib/lessons/__tests__/adapter.test.ts`; tests for the 2 remaining service methods (`getUserLessonProgress`, `getAudioUrl`) stay in `src/__tests__/lessonService.test.ts`. Net `it()` count across the two halves = pre-split count. |
| `src/__tests__/progressService.test.ts` | UNCHANGED (deferred) |
| `src/lib/lessons/__tests__/activation.test.ts` | UNCHANGED |
| `src/__tests__/Lessons.test.tsx` | Update import paths only |
| `src/__tests__/Lesson.test.tsx` | Update import paths + `vi.mock` targets (per §5) |
| `src/__tests__/dashboard-redesign.test.tsx` | Update `vi.mock` target split (per §5) |
| `src/__tests__/LessonReader.test.tsx` | Update import path only |

### Test count delta

The fold is behaviour-preserving except for the `lessonReadiness.test.ts` deletion. Predicted `it()`-block delta:

| Component | Delta |
|---|---|
| `lessonReadiness.test.ts` deletion | **−8** |
| `lessonExperience.test.ts` merge (legacy 2 cases move into colocated file) | **0** (net — 2 added, 2 deleted) |
| `lessonService.test.ts` split | **0** (net — adapter half adds = original minus = service half) |
| All other moves | **0** (rename only) |

**Expected total delta: −8.**

```bash
# pre-fold
bun run test --run 2>&1 | grep -E "Tests +[0-9]"

# verify the 8-block prediction
grep -cE "^\s*(it|test)\(" src/__tests__/lessonReadiness.test.ts  # → 8

# post-fold should equal pre-fold MINUS 8 (exactly, no other deltas)
```

If the post-fold count differs from `pre − 8` by anything other than 0, a test was silently lost (or duplicated) — investigate before merge.

---

## 7. Pipeline contract reference

The lessons module reads from four DB tables populated by the content pipeline. The shapes are unchanged by this fold and described in detail in the archived draft §5. Summary:

- `lessons` — has `id`, `order_index`, `title`, `level`, `description`, `audio_path`, `duration_seconds`, `primary_voice`, `is_published`, `publication_status`. Pipeline filters `publication_status = 'published'`.
- `lesson_sections` — has `content: LessonSectionContent` (discriminated by `.type`). Grammar / reference_table sections carry `grammar_topics: string[]`.
- `lesson_page_blocks` — has `block_kind` (canonical 7-value, with 4 legacy values still tolerated by runtime), `display_order`, `payload_json`, `content_unit_slugs`, `capability_key_refs`.
- `learner_lesson_activation` — has `user_id`, `lesson_id`. Row presence = activated.

Pipeline invariants enforced by `publish-approved-content.ts`:
1. `order_index` immutable for published lessons (`source_ref = 'lesson-${order_index}'` matching).
2. Runtime sees only `publication_status = 'published' AND is_published = true`.
3. Grammar/reference_table sections have non-empty `grammar_topics` (post pipeline-cleanup PR #41).
4. `source_ref` matches `^lesson-\d+(/.*)?$`.
5. Every `capability_key_refs` entry resolves to an existing `learning_capabilities` row.

The adapter **does not** add new validation in this fold (would be a behaviour change). Validation hardening is a follow-up if drift is detected.

---

## 8. Risks + open questions

1. **Import path churn surface.** ~14 caller files update their import paths. Vitest + tsc catch broken imports; pre-commit hook + `make pre-deploy` catch lint/build. Low risk, conventional.
2. **Test colocation collision (RESOLVED in §6).** Both `src/__tests__/lessonExperience.test.ts` (2 `it()` blocks, end-to-end shape coverage) and `src/lib/lessons/__tests__/lessonExperience.test.ts` (7 `it()` blocks, classifier coverage) exist with **non-overlapping** scenarios. Treatment is merge-then-delete (§6 first 2 rows), not "delete one." Pre-merge: confirm the merge captured both unique cases (`Test count delta` block in §6 verifies this).
3. **`lessonService.test.ts` split.** Splitting the file by which methods moved is mechanical; risk is missing a test for an adapter method. Mitigation: count `it(` blocks in the original, sum the splits, assert equality.
4. **`LessonOverviewRow` type-name collision.** Two `LessonOverviewRow` types exist (overview.ts richer; adapter.ts RPC-shape). The barrel re-exports the adapter's as `LessonOverviewServiceRow`. Caller updates pick one; type-check failures will be loud.
5. **The barrel exports more than the convention's soft cap.** Acknowledged in §2. The barrel is wide because this is a fold, not a narrowing. Narrowing happens in the follow-up retirement PRs.
6. **Atomic deployment.** Fold is one PR. Bisecting is hard if a runtime regression appears post-merge; partial revert risky. Mitigation: each commit builds + tests green per source-test-bundling rule.
7. **Target architecture doc drift — 4 amendments paired with the fold's PR.** `docs/target-architecture.md` §lib/lessons has 4 inaccuracies relative to what this fold actually ships. The amendments land in commit 7:
   - Delete `isMeaningfulDialogueAudio(...)` from the public-API block (line ~530).
   - Delete `isMeaningfulGrammarAudio(...)` from the public-API block (line ~531).
   - Delete `readiness.ts            folds lessonReadiness (isMeaningfulDialogueAudio etc.)` from the file-structure block (line 557).
   - Edit `adapter.ts              folds lessonService.ts + progressService.ts` (line 560) to drop the false `+ progressService.ts` claim, since this fold defers progressService retirement entirely. Replacement: `adapter.ts              folds lessonService.ts lesson-domain methods`.

   Doc still lists `getLessonOverviewStatus` as a public function — keep, since the underlying `decideLessonOverviewStatus` exists and is in scope of a future retirement, not this fold.

---

## 9. Migration order (within the fold's PR)

Each commit must build + test green per source-test-bundling.

1. **Commit 1 — establish barrel.** Add empty `src/lib/lessons/index.ts`. No callers touched. (Sanity-check the file exists.)
2. **Commit 2 — rename files in place + rewire experience.ts + colocated test.** Rename the 4 files inside `src/lib/lessons/` (`lessonOverviewModel.ts` → `overview.ts`, etc.). Update internal cross-imports. Update `index.ts` to re-export from the new paths. Rename `src/lib/lessons/__tests__/lessonExperience.test.ts` → `experience.test.ts`. In the same commit: rewire `experience.ts` line 1 import of `Lesson` / `LessonPageBlock` from `@/services/lessonService` to `./adapter` (adapter is added in commit 6 — until then keep the import on `@/services/lessonService` to avoid breakage, and update in commit 6). Also in the same commit: rewire the colocated `experience.test.ts` line 3 type import from `@/services/lessonService` to `../experience` (re-exports the types via the experience module's own surface).
3. **Commit 3 — migrate caller imports for the renamed files.** Files in `pages/`, `components/lessons/`, `lib/preview/` switch their imports to the barrel. The 7 test files listed in §5 update.
4. **Commit 4 — colocate `src/__tests__/lessonOverviewModel.test.ts`, `lessonOverviewStatus.test.ts`, `lessonActionModel.test.ts`** + **merge `src/__tests__/lessonExperience.test.ts` into the colocated `experience.test.ts`**. Move + rename. Confirm via diff that both unique `it()` blocks from the legacy `lessonExperience.test.ts` survive in the merged file before deleting the legacy file.
5. **Commit 5 — retire `lessonReadiness.ts`.** Delete `src/lib/lessons/lessonReadiness.ts` + `src/__tests__/lessonReadiness.test.ts`. Pre-delete: re-run grep `grep -rn "lessonReadiness\|isMeaningfulDialogueAudio\|isMeaningfulGrammarAudio" --include="*.ts" --include="*.tsx"` to confirm zero non-test references.
6. **Commit 6 — fold lessonService lesson-domain methods into `adapter.ts`.** Create `src/lib/lessons/adapter.ts` with the 7 folded methods (`getLessons`, `getLesson`, `getLessonsBasic`, `getLessonsWithVoice`, `getLessonPageBlocks`, `getLessonCapabilityPracticeSummary`, `getLessonsOverview`) + 6 type fixtures (`Lesson`, `LessonSection`, `LessonPageBlock`, `LessonCapabilityPracticeSummary`, `LessonOverviewSourceBlock`, RPC-shape `LessonOverviewRow`) + 3 pure helpers (`lessonSourceRefForOverview`, `lessonSourceRefsByLesson`, `extractLessonGrammarTopics`) + 3 private helpers (`trimTopic`, `stringList`, `categoryTitles`). Migrate the production callers + test mocks (per §5) of folded methods to import from `@/lib/lessons`. Keep `getUserLessonProgress` + `getAudioUrl` in `services/lessonService.ts:201` (and at the relevant `getUserLessonProgress` line). Split `lessonService.test.ts` per §6. Rewire `experience.ts` line 1 from `@/services/lessonService` to `./adapter` now that adapter exists.
7. **Commit 7 — target-architecture amendment + plan frontmatter.** Apply the 4 amendments listed in §8 risk #7 (delete 2 readiness lines from the public-API block; delete the readiness file-structure row at line 557; edit the adapter file-structure row at line 560 to drop the false `progressService.ts` claim). Set this plan's frontmatter `status: implementing`, populate `implementation` + `implementation_paths`.

Total: 7 commits. Estimated diff: most of the LOC is **renames** (file moves preserved by git, not counted as add/delete on most diff tools). True net changes:
- ADD `index.ts` (~30 LOC barrel)
- ADD `adapter.ts` (~250 LOC — body relocated from `lessonService.ts:6-282`, not duplicated)
- DELETE `lessonReadiness.ts` (84 LOC) + `lessonReadiness.test.ts` (117 LOC) = −201 LOC
- DELETE the 2 unique `it()` blocks worth from `src/__tests__/lessonExperience.test.ts` (file deleted, ~45 LOC after merge into colocated)
- SHRINK `lessonService.ts` from 296 → ~50 LOC (keeps `getUserLessonProgress` + `getAudioUrl`)

Approximate net: +280 add / −490 delete = **−210 LOC**, mostly orphan-driven. If the actual PR diff shows substantially more `+`, it's a smell for accidental duplication during the fold — flag in review.

---

## 10. Verification gates

Pre-merge:
- `bun run lint` clean
- `bun run test --run` shows exactly `pre_count − 8` tests passing (the 8 = `lessonReadiness.test.ts`'s `it()` blocks; merger + service-test split are net-zero per §6)
- `bun run build` clean
- `make migrate-idempotent-check` no-op (no SQL changes in this PR)
- `make check-supabase-deep` clean
- Architect-review-loop on this spec → APPROVE
- Architect-review-loop on the executed diff → APPROVE

Post-merge:
- Manual smoke test: log in as test user, open `/lessons` (overview renders identically), open one lesson (reader renders + activation toggle works), activate lesson, verify session-builder picks up the new capabilities on next session start.
- Confirm no behaviour regression vs. the pre-fold baseline (UI screenshots + Lessons.tsx / Lesson.tsx rendered output).

---

## 11. Follow-up PRs (queued for after this fold ships)

In rough priority order, each its own design + architect review:

1. **`lessonReadiness.ts` → already in this fold.** No follow-up.
2. **Rewire 3 inline activation queries** (`masteryModel.ts:447`, `session-builder/adapter.ts:272`, `authStore.ts:172`) to call `listActivatedLessons` / `setLessonActivated` from `@/lib/lessons`. Tiny PR, behaviour-preserving DRY pass.
3. **Retire `LessonBlockRenderer.tsx:78-82` `payload.audioUrl` read.** Dead code (pipeline rejects writes). Single-file deletion.
4. **`block_kind` legacy enum removal.** Audit live DB for legacy `hero|section|exposure|recap` rows; backfill if any; retire `blockKindFromPipeline` classifier in `experience.ts`; narrow `LessonPageBlock.block_kind` type to the 7 canonical values.
5. **Status tree retirement** (`decideLessonOverviewStatus`, 6 statuses) + paired `Lessons.tsx` UX redesign. UX-driven, needs design rationale.
6. **Practice action retirement** (`buildLessonPracticeActions` + `LessonPracticeAction`). Same — UX rationale required.
7. **`services/progressService.ts` retirement** + `useProgressData.ts` rewire to `learnerProgressService` direct. Voortgang-page architecture clean-up; belongs in the analytics/mastery fold.
8. **`markLessonComplete` retirement.** Audit Dashboard "Continue where you left off" widget for dependency; replace with derivable state.
