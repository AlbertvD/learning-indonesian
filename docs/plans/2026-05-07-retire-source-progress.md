# Retirement #6 — Source-progress state machine → lesson-activation

**Branch:** `retire/source-progress` (to be cut from `main` after retirement #5 merges)
**Spec date:** 2026-05-07
**Parent doc:** `docs/target-architecture.md` §1258-1296 (item 4) + §1414 (migration order step 5) + §322-323, §477-490, §690 (architectural shape)
**Cumulative LOC across retirements 1-5:** ~265 + ~450 + ~341 + ~3400 + ~221 ≈ ~4677 LOC delete + DB objects (post-#5 baseline)

---

## 1. Why

The target architecture (§322-323, §1258-1296) declares: *"Capabilities are eligible only if their owning lesson is activated by the learner (single boolean, replaced the source-progress state machine)."*

Today's implementation runs in the opposite direction:

- A 7-event state machine (`opened`, `section_exposed`, `intro_completed`, `heard_once`, `pattern_noticing_seen`, `guided_practice_completed`, `lesson_completed`) is recorded per `(user_id, source_ref, source_section_ref)` triple via the `record_source_progress_event` RPC at `scripts/migrations/2026-04-25-capability-core.sql:179-317` (~140 LOC of plpgsql).
- Each capability declares a `requiredSourceProgress` requirement (`{kind: 'source_progress', sourceRef, requiredState}` or `{kind: 'none', reason: …}`). The eligibility gate `isSourceProgressSatisfied` (`src/lib/pedagogy/sourceProgressGates.ts:67-94`) checks that the per-`source_ref` state has reached the required event with one evidence-bypass exemption (`form_recall` capabilities can satisfy via successful recognition reviews).
- Three browser surfaces emit events on user interaction:
  - `LessonReader.tsx:63` — section "Mark as seen" buttons
  - `LessonBlockRenderer.tsx:127,373` — pattern-noticing block buttons (renders `'Markeer sectie als gezien'` / `'Ik heb dit patroon opgemerkt'`)
  - `Lesson.tsx:163-189` (manual) and `Lesson.tsx:191-229` (exposure-translated) — the page-level handlers wired into the reader
- A second SQL function `_capability_source_progress_met` (`scripts/migrations/2026-05-01-learner-progress-functions.sql:56-116`) mirrors the gate logic in plpgsql so analytics queries (`compute_todays_plan_raw` "new" count) can filter without a round trip.
- The `get_lessons_overview` consolidating function (`scripts/migrations/2026-05-02-lessons-overview-function.sql`, 184 LOC) joins `learner_source_progress_state` to derive `has_started_lesson` and `has_meaningful_exposure` flags for the Lessons overview list.
- A `source_progress_event text` column on `lesson_page_blocks` (`scripts/migrations/2026-04-25-content-units-lesson-blocks.sql:32-35`) tags each block with the event it should emit.
- `mastery/masteryModel.ts` Rule 2 reads `sourceProgressState` to distinguish `'introduced'` from `'not_assessed'` (`src/lib/mastery/masteryModel.ts:194,381-403,445`).
- Every `scripts/data/staging/lesson-N/capabilities.ts` file (lessons 1-9) carries `requiredSourceProgress` payloads on every projected capability (190-482 occurrences per file; ~2660 total across the 9 files).

The state-of-the-art under the target arch is dramatically simpler: a single per-`(user_id, lesson_id)` row in `learner_lesson_activation`. The eligibility gate becomes "is this capability's lesson activated by the learner?". The state machine, evidence bypass, exposure-map translator, per-block UI buttons, and idempotent event log all retire.

The product motivation is consonant with retirement #4's "streak-only motivation" decision: the learner is the authority on what they've consumed. Asking them with a single checkbox is more honest than inferring it from button clicks they could equally fake.

---

## 2. Doc-claim verification (independent grep, never trust the doc)

Per the playbook from retirements #1-#5 (every prior retirement found 1-7 disproven claims): full grep of every flagged symbol against the live tree.

### 2.1 Symbols flagged in target-architecture.md §1262-1283

| Doc symbol | Reality at HEAD `bc3a382` | Verdict |
|---|---|---|
| `src/services/sourceProgressService.ts ~161 LOC` | 161 LOC verified. Defined at line 1; sole consumers: `Lesson.tsx:20,170,198`, `lessonExposureProgress.ts:1`, `sourceProgressGates.ts:2`, `LessonReader.tsx:10`, `LessonBlockRenderer.tsx:7`, `lessonExperience.ts:2`. | ✅ Confirmed |
| `src/lib/pedagogy/sourceProgressGates.ts ~94 LOC` | 94 LOC verified. Defined at line 1; consumers: `pedagogyPlanner.ts:9`, `lessonIntroduction.ts:1` (only the type `ReviewEvidence`), `capabilitySessionDataService.ts:19` (only the types). | ✅ Confirmed |
| `src/lib/lessons/lessonExposureProgress.ts ~48 LOC` | 48 LOC verified. Defined at line 1; consumers: `Lesson.tsx:24`, `LessonReader.tsx:9` (type only), `LessonBlockRenderer.tsx:5` (type only). | ✅ Confirmed |
| `indonesian.record_source_progress_event ~80 LOC` | Defined at `2026-04-25-capability-core.sql:179-317` — actually ~140 LOC of plpgsql (doc undercounted by ~60 LOC; the upsert state-rank logic is more involved than the signature suggests). Sole TS caller: `sourceProgressService.recordEvent`. | ⚠️ LOC undercount; ~140 not ~80 |
| `indonesian.learner_source_progress_events` table | Defined at `2026-04-25-capability-core.sql:103-114`. Has `idempotency_key` unique constraint; readers: `record_source_progress_event` RPC; the RLS policy "source progress events owner read" + the `_capability_source_progress_met` function (indirectly via the state table, not the events table). | ✅ Confirmed |
| `indonesian.learner_source_progress_state` table | Defined at `2026-04-25-capability-core.sql:116-127`. Has unique `(user_id, source_ref, source_section_ref)`. Readers: `_capability_source_progress_met`, `get_lessons_overview`, browser PostgREST direct read in `lessonService.getLessonSourceProgress`. | ✅ Confirmed |
| `CapabilitySourceProgressRequirement` type | Defined at `capabilityTypes.ts:82-96`. Threads through every capability projection. | ✅ Confirmed |
| `requiredSourceProgress` field on capability metadata | Defined at `capabilityTypes.ts:174` on `ProjectedCapability`. Threads through every projection. | ✅ Confirmed |

### 2.2 Disproven / under-specified doc claims

The target arch §1262-1283 framed retirement #6 as **3 source files + 1 RPC + 2 tables + 1 type field**. Independent grep proves the surface is **substantially larger**:

**(a) Three source files retire fully; FIFTEEN more need surgery (not flagged in the doc — R1 v1 caught six the spec author missed in v0).**

| File | Surgery |
|---|---|
| `src/lib/capabilities/capabilityTypes.ts` | Delete `SourceProgressRequirement` (lines 82-92), `CapabilitySourceProgressRequirement` (94-96), and the `requiredSourceProgress?:` field on `ProjectedCapability` (174). |
| `src/lib/capabilities/capabilityCatalog.ts` | Delete every `requiredSourceProgress: …` field assignment (lines 26, 82, 95, 109, 122, 137, 150, 169, 189, 205, 221, 233, 249, 264). All assignments collapse to "no field" once the type drops. |
| `src/lib/capabilities/capabilityContracts.ts` | Delete the `'exposure_only'` branch (line 62). The `'exposure_only'` semantic is preserved via `source_kind IN ('podcast_segment', 'podcast_phrase')` gate — see §3.12. |
| `src/lib/pedagogy/pedagogyPlanner.ts` | Delete the `isSourceProgressSatisfied` call (line 265), the `LearnerSourceProgress` and `ReviewEvidence` imports (line 9), the `requiredSourceProgress?:` field on `PlannerCapability` (line 22), the `sourceProgress` and `recentReviewEvidence` inputs on `PedagogyInput` (lines 77-78), the `currentSourceRefs?:` input (line 79), the `'missing_source_progress'` reason (line 39), the `suppress('missing_source_progress')` branch (line 272), the `isSourceSwitch` helper + load-budget gate (line 117-119, 291-293, 299). **R1 v2 fix (I20): preserve lesson-scoped session filtering** — restructure `isUsefulForCurrentPath` (line 138-151) into a clearer two-signal check that does NOT silently regress lesson-scoped sessions: (a) if `isLessonScopedMode(input.mode)`, gate by `isInSelectedLessonScope(capability, input.selectedSourceRefs)` (existing helper at line 181-189; inline the call); (b) otherwise gate by `matchesActiveGoalTags(capability, input.activeGoalTags)` (free-form goal-tag filter; `default-allow` when no goal tags set). Drop the union with `currentSourceRefs` entirely. Add `lessonId?: string` field to `PlannerCapability` and `activatedLessons: Set<string>` input to `PedagogyInput`. The new gate: `if (capability.lessonId != null && !activatedLessons.has(capability.lessonId)) suppress('lesson_not_activated'); continue`. |
| `src/lib/pedagogy/lessonIntroduction.ts` | Inline a local `ReviewEvidence` interface (kept private to this module) instead of re-importing from the deleted `sourceProgressGates.ts`. The shape is identical — the type was always lightweight and shared by accident. |
| `src/lib/lessons/lessonExperience.ts` | Delete the `sourceProgressEvent` field on `LessonExperienceBlock` (line 23), the `SourceProgressEventType` import (line 2), the `isSourceProgressEvent` predicate (line 47-48), the `'noticing_prompt'` block-kind classification at line 65 (collapse to the existing `'pattern_callout'`), and the `block.source_progress_event` mapping (line 79). |
| `src/lib/lessons/lessonOverviewModel.ts` | Drop `hasMeaningfulExposure` from the `LessonOverviewRow` shape (lines 31, 82, 130-131, 140) and the derived status logic. New status decision tree per §3.13. |
| `src/lib/lessons/lessonOverviewStatus.ts` | Rewrite the 7-status decision tree (lines 13-66). Collapse to: `not_started` (no activation) → `in_progress` (activated, `ready_count > 0`, `practiced_count == 0`) → `practiced` (`practiced_count > 0`). The `'ready_to_practice'` and `'lesson_satisfied_for_recommendation'` statuses retire (driven by `hasMeaningfulExposure`, gone). See §3.13 for the new decision tree. |
| `src/lib/lessons/lessonActionModel.ts` | Repoint `practiceReadyCount` (lines 21-28). The current derivation `practiceReadyCapabilityCount(experience.blocks, progressBySourceRef)` retires with source-progress; new derivation: `lessonActivated ? max(0, ready_capability_count - active_practiced_count) : 0`, with both counts sourced from the `LessonOverviewRow`. The "Practice this lesson · N ready" CTA renders only when `lessonActivated && practiceReadyCount > 0`. |
| `src/lib/mastery/masteryModel.ts` | Delete `sourceProgressState` from the evidence shape (line 44), the `state !== 'not_started'` rule (line 194), the `sourceProgress` data fetcher and parameter (lines 381, 384, 402, 445, 461, 463, 501, 503). Rewrite Rule 2 from `state !== 'not_started' ? 'introduced' : 'not_assessed'` to `lessonActivated ? 'introduced' : 'not_assessed'`. The mastery loader gains a `listActivatedLessons(userId)` fetcher. **Add `lesson_id` to the explicit SELECT lists at lines 419, 482, 494** (and any `CAPABILITY_COLUMNS`-style constants) — needed to source `capability.lessonId` for the new evidence shape. |
| `src/lib/session/sessionPlanningSignals.ts` | Drop `lastMeaningfulExposureAt` from `SessionPlanningSignals` (line 5, 21-25, 85-89) and the `sourceProgressRows` input from `DeriveSessionPlanningSignalsInput`. The signal had no analytics-grade caller after retirement #4; document deletion in §10. |
| `src/lib/pedagogy/sessionPosture.ts` | Drop `lastMeaningfulExposureAt` from `SessionPostureInput` (line 16) and any consuming branch. |
| `src/lib/preview/localPreviewContent.ts` | **Production /preview admin page surface.** Strip the `event:` parameter from the `lessonBlock(...)` helper (line 39-60) + the `source_progress_event: input.event ?? null` line (57) + all 17 call-site `event:` argument occurrences (lines 79, 90, 105, 125, 137, 153, 176, 187, 201, …). After surgery, `lessonBlock()` takes a smaller input shape and emits no `source_progress_event` field. |
| `src/pages/Lessons.tsx` | **R1 v2 caught this.** Strip `STATUS_TONE['ready_to_practice']: 'accent'` (line 101) — the retired-status entry stays in the map otherwise. Rewrite the exposure-synthesis loop (lines 182-200) that reads `row.has_meaningful_exposure` (line 189) and synthesizes `LessonOverviewExposure` rows with `meaningful: true/false` flags — collapse to use `has_started_lesson` only. Strip any `'ready_to_practice'` consumer left over from the status-tone map. |
| `src/services/lessonService.ts` | Delete `getLessonSourceProgress` (line 236), the `LessonSourceProgressRow` type (line 41 area), and any reference to the `source_progress_event` block field. **R1 v3 verification (I27): `getLessonCapabilityPracticeSummary` (line 248) STAYS UNCHANGED** — verified to query only `learning_capabilities` (`readiness_status='ready'`, `publication_status='published'`) and `learner_capability_state` (`activation_state='active'`, `review_count > 0`); never reads `learner_source_progress_*`. The method's outputs (`readyCapabilityCount`, `activePracticedCapabilityCount`) are load-bearing for the I24 fix in `Lesson.tsx:249-258`. |
| `src/services/capabilitySessionDataService.ts` | Delete the `LearnerSourceProgress`/`ReviewEvidence` imports (line 19), the `sourceProgressStates` set (line 107), the `isSourceProgressEventState` predicate (line 123), `sourceProgressRequirement` parser (line 126), all `requiredSourceProgress` field reads (lines 173, 176-177, 189, 211), the `sourceProgressResult` query (lines 338, 353, 394, 414), the `currentSourceRefs` derivation (line 393-397), the `reviewEvidenceResult` query (line 339, 354) AND its adapter `toReviewEvidence` (line 288-310), and the `requiresConcreteSourceProgress` predicate. The session-builder eligibility filter rewrites to use `listActivatedLessons` from `lib/lessons/`. **Add `lesson_id` to `CAPABILITY_COLUMNS` (line 34-49)** to source `capability.lessonId`. |

**(b) Three React surfaces need surgery (only `Lesson.tsx` was flagged in §1281).**

| Component | Surgery |
|---|---|
| `src/pages/Lesson.tsx` | Delete `sourceProgressService` and `sourceProgressEventForLessonExposure` imports (lines 20, 24), the `PRACTICE_READY_SOURCE_EVENTS` set (29-36), `hasPracticeReadyExposure` (47-55), `practiceReadyCapabilityCount` (57-68), the `lessonSourceProgress` state and setter (80, 99), the `getLessonSourceProgress` fetch (122-131), the `upsertLessonSourceProgress` callback (150-161), `handleReaderSourceProgress` (163-189), `handleLessonExposureProgress` (191-229), and the practice-ready toast logic. **R1 v2 (I24):** also rewrite `Lesson.tsx:249-258` (the three-line `practiceReadyCount` derivation): the `exposedReadyCapabilityCount = practiceReadyCapabilityCount(blocks, progressBySourceRef)` call goes (the helper retired); the `Math.min(exposed, backendUnpracticed)` collapses to `lessonActivated ? Math.max(0, readyCapabilityCount - activePracticedCapabilityCount) : 0`. Replace the entire block (3 lines → 1 line) with the new derivation. Replace the practice handlers + practice toast with a single "Activate this lesson" checkbox bound to `setLessonActivated(userId, lessonId, on)` and an `isLessonActivated(userId, lessonId)` read at fetch time. |
| `src/components/lessons/LessonReader.tsx` | Delete the `LessonExposureKind` and `SourceProgressEventType`/`SourceProgressState` imports (lines 9, 10), the `onProgress` and `onLessonExposureProgress` props, the per-block `progressBySourceRef` lookup (line 63), and any per-block status-pill rendering driven by `progressBySourceRef`. Reader becomes purely informational: it renders blocks but emits no progress events. |
| `src/components/lessons/blocks/LessonBlockRenderer.tsx` | Delete the `LessonExposureKind` and `SourceProgressState` imports (lines 5, 7), the `block.sourceProgressEvent === 'pattern_noticing_seen'` branch (line 127, 373), the "Markeer sectie als gezien" + "Ik heb dit patroon opgemerkt" section CTAs, the `lesson_hero` "Markeer als geopend" CTA (lines 258-265), the `lesson_recap` "Markeer les als afgerond" CTA (lines 314-322), the `progress` prop, the `status` derivation (line 166), and the `<StatusPill>` rendering (line 332 + `labelForStatus` mapping at lines 159-163). All four hero/section/recap "mark as X" buttons retire — the activation checkbox is the only state-modifying control on the lesson page. |

**(c) Two SQL functions drop; one rewrites.**

| Object | Surgery |
|---|---|
| `indonesian.record_source_progress_event(jsonb)` | D-R-O-P. |
| `indonesian._capability_source_progress_met(uuid, jsonb, text, text)` | D-R-O-P. The doc never mentioned this function. It lives in `2026-05-01-learner-progress-functions.sql:56-116` and exists solely to inline the gate logic for one caller — and that caller (`compute_todays_plan_raw`) was retired in retirement #4. Both retire together. |
| `indonesian.compute_todays_plan_raw(uuid, timestamptz)` | **NOT TOUCHED.** R1 v1 caught this: the function was already retired in retirement #4 — see `scripts/migration.sql:1115-1120` (`drop function if exists indonesian.compute_todays_plan_raw(uuid, timestamptz)` in the goal-subsystem retirement section). Zero TS callers (`Grep` returns no matches in `src/`). The original spec author's plan to "rewrite this function" was a phantom — the function does not exist on `main`. Removing the rewrite saves ~70 LOC of dead PL/pgSQL from the master section. |
| `indonesian.get_lessons_overview(uuid)` | REWRITE. Strip the `block_kind_classified`, `source_progress_events_lookup`, and `exposures` CTEs (lines 82-138). Drop `has_meaningful_exposure` from the return shape entirely (callers in `lessonOverviewModel`, `lessonOverviewStatus`, and `Lessons.test.tsx` lose access). Replace `has_started_lesson` derivation with the union: `EXISTS lla(user_id, lesson_id) OR EXISTS lp(user_id, lesson_id)` — preserves "started" for users who clicked through legacy lesson_progress before this retirement (per §3.6 lesson_progress backfill). |

**(d) Two tables drop, one column drops, one new column added.**

| Object | Surgery |
|---|---|
| `indonesian.learner_source_progress_events` | D-R-O-P with CASCADE. Includes the unique constraint and the RLS policy. |
| `indonesian.learner_source_progress_state` | D-R-O-P with CASCADE. Includes the unique constraint, the RLS policy, and the index `learner_source_progress_state(user_id, source_ref)` defined in `2026-05-01-learner-progress-functions.sql:488`. |
| `indonesian.lesson_page_blocks.source_progress_event` column | D-R-O-P. The check constraint goes with it. The pipeline scripts that emit this column on insert (publishing) drop it from their payload. |
| `indonesian.learning_capabilities.lesson_id uuid` column | NEW. Nullable. References `lessons(id) ON DELETE SET NULL`. NULL = capability is not lesson-scoped (podcast capabilities, cross-lesson references). Backfilled from `lesson_page_blocks.capability_key_refs[]` JOIN through `lessons.order_index`. |

**(e) Seven pipeline scripts emit `requiredSourceProgress` or `source_progress_event` into the DB.**

| Script | Surgery |
|---|---|
| `scripts/materialize-capabilities.ts` | Line 165 — strip `requiredSourceProgress: capability.requiredSourceProgress ?? null` from the metadata payload. **R1 v2 fix (I23):** add `lessonId` as a per-row field on `ProjectedCapability` (NOT a per-call argument) — staging files mix lesson-scoped and podcast capabilities in the same batch. Each projected capability already knows its lesson identity (the staging-file structure has lesson-scoped + cross-lesson sections). Read `capability.lessonId` per-row at line 169 and write it into the insert plan. Podcast capabilities have `lessonId: undefined → null`. |
| `scripts/promote-capabilities.ts` | Line 204 — strip `requiredSourceProgress` from the metadata projection write. |
| `scripts/check-capability-health.ts` | Lines 67, 155, 217-235, 531 — strip `requiredSourceProgress?:` field reads and the entire `'ready_capability_unknown_source_progress_ref'` / `'ready_capability_source_progress_ref_mismatch'` validator branches. The validator becomes obsolete. |
| `scripts/check-capability-release-readiness.ts` | Lines 31, 46, 105, 119, 198, 211 — strip `sourceProgressRows` row-counter and the warning "No learner source progress rows exist yet". Add a parallel check: every `'ready'` published capability has either non-null `lesson_id` or `source_kind ∈ {'podcast_segment', 'podcast_phrase'}`. |
| `scripts/lib/content-pipeline-output.ts` | Strip any `requiredSourceProgress` field on the staging-projection helpers (search for it; flagged by `rg`). |
| `scripts/publish-approved-content.ts` | Strip any `requiredSourceProgress` thread-through (verify on read). Strip `source_progress_event` from any `lesson_page_blocks` insert payload. |
| `scripts/sync-lesson-page-blocks-only.ts` | **R1 v1 caught this.** Lines 30, 65 read+write `source_progress_event`. After column drop, this script crashes on any sync run. Strip both lines. |

**(f) EIGHTEEN staging files have ~2820 mechanical strips (R1 v1 caught the 161 page-blocks occurrences the spec author missed in v0).**

`capabilities.ts` files (~2660 `requiredSourceProgress` occurrences):

| File | Occurrences |
|---|---|
| `scripts/data/staging/lesson-1/capabilities.ts` | 190 |
| `scripts/data/staging/lesson-2/capabilities.ts` | 267 |
| `scripts/data/staging/lesson-3/capabilities.ts` | 276 |
| `scripts/data/staging/lesson-4/capabilities.ts` | 482 |
| `scripts/data/staging/lesson-5/capabilities.ts` | 267 |
| `scripts/data/staging/lesson-6/capabilities.ts` | 203 |
| `scripts/data/staging/lesson-7/capabilities.ts` | 293 |
| `scripts/data/staging/lesson-8/capabilities.ts` | 285 |
| `scripts/data/staging/lesson-9/capabilities.ts` | 399 |

`lesson-page-blocks.ts` files (~161 `source_progress_event` occurrences):

| File | Occurrences |
|---|---|
| `scripts/data/staging/lesson-1/lesson-page-blocks.ts` | 16 |
| `scripts/data/staging/lesson-2/lesson-page-blocks.ts` | 23 |
| `scripts/data/staging/lesson-3/lesson-page-blocks.ts` | 17 |
| `scripts/data/staging/lesson-4/lesson-page-blocks.ts` | 16 |
| `scripts/data/staging/lesson-5/lesson-page-blocks.ts` | 18 |
| `scripts/data/staging/lesson-6/lesson-page-blocks.ts` | 17 |
| `scripts/data/staging/lesson-7/lesson-page-blocks.ts` | 16 |
| `scripts/data/staging/lesson-8/lesson-page-blocks.ts` | 20 |
| `scripts/data/staging/lesson-9/lesson-page-blocks.ts` | 18 |

These are mechanical strips — every occurrence is a `requiredSourceProgress: { … },` line on a projected capability or `source_progress_event: '…',` line on a page-block literal. Once `ProjectedCapability` and `LessonPageBlock` types drop the fields, these lines fail tsc unless removed. A scripted edit (`scripts/strip-source-progress-from-staging.ts`, ~60 LOC, throwaway after the retirement merges) is the cleanest surgery — bundled into commit 3 (per §5).

**(g) ≥18 test files need surgery (R1 v1 caught five the spec author missed in v0).**

| Test | Surgery |
|---|---|
| `src/__tests__/sourceProgressService.test.ts` | DELETE (file retires with the source). |
| `src/__tests__/sourceProgressGates.test.ts` | DELETE. |
| `src/__tests__/lessonExposureProgress.test.ts` | DELETE. |
| `scripts/__tests__/source-progress-rpc-migration.test.ts` | DELETE. |
| `src/__tests__/capabilityContracts.test.ts` | Edit — strip `requiredSourceProgress` field from fixtures + assertions. |
| `src/__tests__/capabilityCatalog.test.ts` | Edit — strip `requiredSourceProgress` field from fixtures + assertions. |
| `src/__tests__/podcastCapabilityProjection.test.ts` | Edit. |
| `src/__tests__/morphologyCapabilityProjection.test.ts` | Edit. |
| `src/__tests__/Lesson.test.tsx` | Edit — strip `sourceProgressService` mocks + handler assertions; add activation-checkbox interaction test. |
| `src/__tests__/Lessons.test.tsx` | **R1 v1 caught this.** Edit — strip `has_meaningful_exposure` from fixture rows (lines 77, 248, 250, 272, …); update status assertions per the new lessonOverviewStatus tree (§3.13). |
| `src/__tests__/LessonReader.test.tsx` | **R1 v1 caught this.** Edit — strip `onSourceProgress`/`onLessonExposureProgress` props; strip "Markeer sectie als gezien" interaction tests; reader is now informational-only. |
| `src/__tests__/lessonExperience.test.ts` | **R1 v1 caught this.** Edit — strip `source_progress_event` from block fixtures (lines 40, 51, …); strip `'noticing_prompt'` block-kind assertions. |
| `src/__tests__/sessionPlanningSignals.test.ts` | **R1 v1 caught this.** Edit — strip `sourceProgressRows` input; strip `lastMeaningfulExposureAt` assertions. |
| `src/__tests__/lessonOverviewStatus.test.ts` | **R1 v2 caught this.** Edit — strip 13× `hasMeaningfulExposure` field from fixtures (lines 14, 29-130); rewrite `'ready_to_practice'` assertions per the §3.13 4-status tree; rewrite the 6× `recommendLesson` calls to assert against the simplified return contract. |
| `src/__tests__/lessonOverviewModel.test.ts` | **R1 v2 caught this.** Edit — strip `meaningful: true` from `LessonOverviewExposure` fixtures (lines 24, 68, 95, 132); strip `'ready_to_practice'` status assertions. |
| `src/__tests__/masteryModel.test.ts` | Edit — strip `sourceProgressState` evidence + Rule 2 assertions; replace with `lessonActivated` evidence + assertions. |
| `src/__tests__/pedagogyPlanner.test.ts` | Edit — strip `sourceProgress`/`recentReviewEvidence`/`currentSourceRefs` inputs; strip `'missing_source_progress'`/`isSourceSwitch`/`'not_useful_for_current_path'` assertions; add `activatedLessons: Set<string>` input; assert on the new `'lesson_not_activated'` gate path. |
| `src/__tests__/capabilitySessionDataService.test.ts` | Edit — strip `sourceProgressResult` and `reviewEvidenceResult` mock branches + assertions; verify `lesson_id` is selected via `CAPABILITY_COLUMNS`. |
| `src/__tests__/capabilitySessionLoader.test.ts` | Edit — same shape as `capabilitySessionDataService.test.ts`. |
| `scripts/__tests__/check-capability-health.test.ts` | Edit — strip the `'ready_capability_unknown_source_progress_ref'` / `'…_mismatch'` validator assertions. |
| `scripts/__tests__/publish-approved-content-capability-output.test.ts` | Edit — strip `requiredSourceProgress` payload assertions. |
| `scripts/__tests__/capability-staging.test.ts` | Edit — strip `requiredSourceProgress` payload assertions. |
| `scripts/__tests__/content-units-staging.test.ts` | Edit — strip `source_progress_event` field assertions on `lesson_page_blocks` payloads. |
| `scripts/__tests__/materialize-capabilities.test.ts` | **R1 v1 caught this.** Edit — assert that the insert plan contains `lessonId` (or null for podcasts) and does NOT contain `requiredSourceProgress`. |

**(h) Capability→lesson identity is unaddressed by the doc.**

The doc declares "capabilities are eligible only if their owning lesson is activated" but `learning_capabilities` has no `lesson_id` column. The eligibility filter cannot be efficient without one. Spec choice (§3.9 below): add the column with backfill. This is an architectural decision the doc skipped.

**(i) New-user activation flow is unaddressed by the doc.**

The doc says "auto-activate legacy lessons (1–3) for existing users" — but does not specify how new users get auto-activated. Options: DB trigger on `auth.users` insert; app-side `authStore.signUp` hook; explicit "activate your starter lessons" UI step. Spec choice (§3.11): app-side `authStore` hook + idempotent backfill migration for existing users. The `auth.users` schema is owned by GoTrue and is not the right surface for app triggers (per the same reasoning as not adding signup triggers in retirements #1-#5 — none of them did).

**(j) Master `migration.sql` does NOT contain source-progress objects today.**

Verified by `grep -i "source_progress\|learner_lesson_activation" scripts/migration.sql` — zero hits in 1502 lines. The source-progress tables, RPC, and analytics function helpers all live in tracked timestamped migrations (`2026-04-25-capability-core.sql`, `2026-05-01-learner-progress-functions.sql`, `2026-05-02-lessons-overview-function.sql`, `2026-05-02-lesson-content-rls-policies.sql`).

This means: the master `migration.sql` retirement-#6 section appends `D-R-O-P` statements that hit objects only present because tracked migrations were applied historically. Pattern matches retirement #5 — same `D-R-O-P … if exists` + `do $$ exception when others then null end $$` idempotent style. The original CREATEs in tracked files do not need to be removed (they are paper-trail; `make migrate` ignores them per `scripts/migrate.ts:24` reading only the master).

### 2.3 Things the doc got right (no correction needed)

- The 7-event taxonomy and the gate semantics match `sourceProgressGates.ts`. ✅
- The `kind: 'none'` escape hatch encodes three reasons (`not_lesson_sequenced`, `exposure_only`, `legacy_projection`); doc cites all three at §1414 + capability-types.ts:96. ✅
- Mastery Rule 2 simplifies as described in §690 — replace `'sourceProgressState'` evidence with `'lessonActivated'` evidence. ✅
- `lib/lessons/` is the right home for the new activation API. ✅
- Auto-activation of legacy lessons for existing users is correctly identified as a one-shot backfill migration. ✅
- The lesson reader becomes "purely informational" (§1296). ✅

### 2.4 What the doc missed entirely

- The capability→lesson schema relationship is not specified. Spec adds `learning_capabilities.lesson_id` (§3.9).
- The new-user activation strategy is not specified. Spec proposes `authStore.signUp` post-create hook (§3.11).
- The doc undercounts the SQL surface by one function (`_capability_source_progress_met`) and one column (`lesson_page_blocks.source_progress_event`).
- `get_lessons_overview` rewrite is significant (~80 LOC of CTE strip-out + replacement); the doc treats it as elision.
- ~2660 staging-file edits are silent in the doc; spec adds a one-shot strip script (§3.10).
- ≥13 test files need surgery; doc enumerates none.
- The `'practice ready' toast` UX in `Lesson.tsx:213-224` (driven by `practiceReadyCapabilityCount`) is removed entirely as a behavioral consequence — doc does not flag this UX retirement.

---

## 3. Retirement scope (final, after grep verification)

### 3.1 Source files

**Delete entirely (3 files, ~303 LOC):**

```
src/services/sourceProgressService.ts                    161 LOC
src/lib/pedagogy/sourceProgressGates.ts                   94 LOC
src/lib/lessons/lessonExposureProgress.ts                 48 LOC
```

**Surgery (18 files, ~750 LOC of edits) — R1 v1 expanded the list by 6 files:**

```
src/lib/capabilities/capabilityTypes.ts          delete SourceProgressRequirement type + field
src/lib/capabilities/capabilityCatalog.ts        strip 14 requiredSourceProgress assignments
src/lib/capabilities/capabilityContracts.ts      add isExposureOnly helper + strip 'exposure_only' branch (§3.12)
src/lib/pedagogy/pedagogyPlanner.ts              swap source-progress gate for lesson-activation gate;
                                                  drop isSourceSwitch + currentSourceRefs path
src/lib/pedagogy/lessonIntroduction.ts           inline a local ReviewEvidence type
src/lib/pedagogy/sessionPosture.ts               drop lastMeaningfulExposureAt from input
src/lib/session/sessionPlanningSignals.ts        drop lastMeaningfulExposureAt + sourceProgressRows
src/lib/lessons/lessonExperience.ts              strip sourceProgressEvent + 'noticing_prompt' kind
src/lib/lessons/lessonOverviewModel.ts           drop hasMeaningfulExposure (§3.13)
src/lib/lessons/lessonOverviewStatus.ts          rewrite 7-status tree to 4-status tree (§3.13)
src/lib/lessons/lessonActionModel.ts             repoint practiceReadyCount derivation
src/lib/mastery/masteryModel.ts                  rewrite Rule 2 + drop sourceProgress fetcher;
                                                  add lesson_id to SELECT lists
src/lib/preview/localPreviewContent.ts           strip event: param from lessonBlock helper + 17 callers
src/services/lessonService.ts                    delete getLessonSourceProgress + LessonSourceProgressRow
                                                  (getLessonCapabilityPracticeSummary STAYS — verified, R1 v3 I27)
src/services/capabilitySessionDataService.ts     drop sourceProgressResult + reviewEvidenceResult
                                                  + currentSourceRefs; add lesson_id to CAPABILITY_COLUMNS
src/pages/Lesson.tsx                             strip ~110 LOC of progress handlers; add activation checkbox
src/components/lessons/LessonReader.tsx          strip onProgress prop + per-block progress lookup
src/components/lessons/blocks/LessonBlockRenderer.tsx  strip "Markeer als gezien" + hero CTA + recap CTA
                                                  + StatusPill mechanism
src/stores/authStore.ts                          rename _event → event in onAuthStateChange listener;
                                                  add SIGNED_IN-gated activateStarterLessons call (§3.11)
src/pages/Lessons.tsx                            strip STATUS_TONE['ready_to_practice'];
                                                  rewrite exposure-synthesis loop to use has_started_lesson only (§3.13)
```

**Add (3 files, ~150 LOC):**

```
src/lib/lessons/activation.ts                    NEW — isLessonActivated, listActivatedLessons, setLessonActivated
src/lib/lessons/__tests__/activation.test.ts     NEW — test the three exports
src/components/lessons/LessonActivationCheckbox.tsx (or inline in Lesson.tsx)  NEW — UI
```

### 3.2 Caller surgery (atomic — source and tests in the SAME commit per the source/test bundling rule from retirement #1-#5)

The atomic-commit boundary: every modified source file ships in the same commit as its modified tests. Concretely, commit 2 (per §5) bundles 12 source files + 13 test files atomically.

### 3.3 Tests

**Delete entirely (4 files):**

```
src/__tests__/sourceProgressService.test.ts
src/__tests__/sourceProgressGates.test.ts
src/__tests__/lessonExposureProgress.test.ts
scripts/__tests__/source-progress-rpc-migration.test.ts
```

**Surgery (≥13 files) — see §2.2(g) for the per-file list.**

**New tests:**
- `src/lib/lessons/__tests__/activation.test.ts` — covers `isLessonActivated`, `listActivatedLessons`, `setLessonActivated` against a mocked Supabase client.
- `src/__tests__/Lesson.test.tsx` gains an integration test: render the page, click the activation checkbox, assert the RPC is called and the page state updates.

### 3.4 Postgres functions

**Drop (2):**

```
indonesian.record_source_progress_event(jsonb)
indonesian._capability_source_progress_met(uuid, jsonb, text, text)
```

**Rewrite (1):**

```
indonesian.get_lessons_overview(uuid)
  Strip block_kind_classified, source_progress_events_lookup, exposures CTEs.
  Replace has_started_lesson derivation with the union of activation + lesson_progress:
    EXISTS (SELECT 1 FROM indonesian.learner_lesson_activation lla
            WHERE lla.user_id = p_user_id AND lla.lesson_id = l.id)
    OR EXISTS (SELECT 1 FROM indonesian.lesson_progress lp
            WHERE lp.user_id = p_user_id AND lp.lesson_id = l.id) AS has_started_lesson
  Drop has_meaningful_exposure from return shape (caller TS at lessonService also drops the field).
```

**No new SQL functions are added. The `_capability_lesson_activated` helper proposed in v1/v2 was DROPPED in R1 v3 per finding I19** — the helper had zero callers (the only intended consumer, `compute_todays_plan_raw`, was a phantom retired in #4). YAGNI applies; if a future analytics function needs the lookup, it can recreate the helper or inline the EXISTS check.

**Note on the previously-flagged `compute_todays_plan_raw` rewrite (REMOVED in R1 v2).** Spec v0 proposed rewriting `indonesian.compute_todays_plan_raw(uuid, timestamptz)` to swap the source-progress filter for a lesson-activation filter. R1 v1 caught: this function was already retired in retirement #4 (`scripts/migration.sql:1115-1120`). Zero TS callers in `src/`. The rewrite would resurrect ~70 LOC of dead PL/pgSQL.

### 3.5 Lesson activation table + RPC + RLS

**New table:**

```sql
create table indonesian.learner_lesson_activation (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  lesson_id    uuid        not null references indonesian.lessons(id) on delete cascade,
  activated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists learner_lesson_activation_user_idx
  on indonesian.learner_lesson_activation(user_id);
```

**RLS:** owner-read; writes go through the RPC (`set_lesson_activation`) which is `SECURITY DEFINER`. No direct INSERT/UPDATE/DELETE grant to `authenticated` — same defense-in-depth pattern retirement #5 applied to `learning_sessions`.

```sql
alter table indonesian.learner_lesson_activation enable row level security;

drop policy if exists "lesson activation owner read" on indonesian.learner_lesson_activation;
create policy "lesson activation owner read"
  on indonesian.learner_lesson_activation for select
  to authenticated
  using (user_id = auth.uid());

grant select on indonesian.learner_lesson_activation to authenticated;
revoke insert, update, delete on indonesian.learner_lesson_activation from authenticated;
grant all on indonesian.learner_lesson_activation to service_role;
```

**New RPC:**

```sql
create or replace function indonesian.set_lesson_activation(
  p_user_id   uuid,
  p_lesson_id uuid,
  p_activated boolean
)
returns void
language plpgsql
security definer
set search_path = indonesian, public
as $$
begin
  if p_user_id is null or p_lesson_id is null or p_activated is null then
    raise exception 'set_lesson_activation requires p_user_id, p_lesson_id, p_activated';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'set_lesson_activation user mismatch';
  end if;

  if not exists (select 1 from indonesian.lessons where id = p_lesson_id) then
    raise exception 'set_lesson_activation lesson not found: %', p_lesson_id;
  end if;

  if p_activated then
    insert into indonesian.learner_lesson_activation (user_id, lesson_id)
    values (p_user_id, p_lesson_id)
    on conflict (user_id, lesson_id) do nothing;
  else
    delete from indonesian.learner_lesson_activation
    where user_id = p_user_id and lesson_id = p_lesson_id;
  end if;
end;
$$;

revoke all on function indonesian.set_lesson_activation(uuid, uuid, boolean) from public;
grant execute on function indonesian.set_lesson_activation(uuid, uuid, boolean) to authenticated, service_role;
```

### 3.6 Backfill for existing users (idempotent migration block)

Two backfill steps — both idempotent, both run on every `make migrate`:

**Step 1 — Auto-activate lessons 1, 2, 3 for every existing user (legacy starter lessons):**

```sql
insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)
select u.id, l.id, now()
from auth.users u
cross join indonesian.lessons l
where l.order_index in (1, 2, 3)
on conflict (user_id, lesson_id) do nothing;
```

**Step 2 — Promote existing `lesson_progress` rows to activation (preserves "started" state for any user who clicked through legacy lessons 4+ via the old reader):**

```sql
insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)
select lp.user_id, lp.lesson_id, coalesce(lp.completed_at, now())
from indonesian.lesson_progress lp
on conflict (user_id, lesson_id) do nothing;
```

**Note (R1 v2 caught):** The `lesson_progress` table schema (`scripts/migration.sql:198-206`) has columns `id, user_id, lesson_id, completed_at, sections_completed, created_at` — no `last_accessed_at`. R1 v1's draft included a phantom column reference (`coalesce(lp.completed_at, lp.last_accessed_at, now())`) that would have hard-aborted the forward.sql at first deploy under `psql -v ON_ERROR_STOP=1`. Verified by `Grep` against the master + `progressService.markLessonComplete` write surface.

This resolves R1 v1 finding C8: a user with `lesson_progress.{user_id, lesson_id}` rows from `progressService.markLessonComplete` keeps their "started" status. The activated_at preserves the historical timestamp. After this commit, `lesson_progress` becomes orphan data (no future writes; no code reads it after R1 v2's `get_lessons_overview` rewrite). Spec calls out the orphan-data state in §8 and proposes a follow-up retirement for `lesson_progress` after a quiet period to confirm no analytics still consume it.

### 3.7 capability→lesson identity (the unaddressed architectural decision)

**Decision.** Add `lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE SET NULL` to `learning_capabilities`. NULL = capability is not lesson-scoped (podcast capabilities, cross-lesson references). NOT NULL = capability is owned by that lesson and eligible only when the lesson is activated.

**Backfill SQL** (in master `migration.sql`, runs once; subsequent runs are no-ops because the column is already populated):

```sql
-- Add the column
alter table indonesian.learning_capabilities
  add column if not exists lesson_id uuid references indonesian.lessons(id) on delete set null;

create index if not exists learning_capabilities_lesson_idx
  on indonesian.learning_capabilities(lesson_id) where lesson_id is not null;

-- Backfill from lesson_page_blocks adjacency.
-- Each capability appears in capability_key_refs[] of one or more blocks; each
-- block belongs to a lesson via source_ref pattern 'lesson-N' → lessons.order_index.
update indonesian.learning_capabilities c
set lesson_id = sub.lesson_id
from (
  select distinct on (cap_key)
    unnest(pb.capability_key_refs) as cap_key,
    l.id as lesson_id
  from indonesian.lesson_page_blocks pb
  join indonesian.lessons l on pb.source_ref = 'lesson-' || l.order_index
  where array_length(pb.capability_key_refs, 1) > 0
  order by cap_key, l.order_index  -- if a capability is referenced by multiple lessons, take the lowest order_index (the "introducing" lesson)
) sub
where c.canonical_key = sub.cap_key
  and c.lesson_id is null;
```

**Pipeline change.** `scripts/materialize-capabilities.ts:165` writes the new column on insert. The staging context already knows the lesson (each `staging/lesson-N/capabilities.ts` file is lesson-N-scoped). Podcast capabilities continue to insert with `lesson_id = NULL`.

**Capabilities not present in any block (rare).** If a capability has no `lesson_page_blocks.capability_key_refs[]` reference, it ends up `lesson_id = NULL`. This means it's always-eligible (treated as cross-lesson). For safety, the publish-approved-content path validates that every published capability either has `lesson_id IS NOT NULL` OR `source_kind IN ('podcast_segment', 'podcast_phrase')`. The validator is part of `check-capability-release-readiness.ts`'s post-PR enforcement.

### 3.8 Master migration retirement-#6 section (idempotent, appended at EOF)

Order of operations within the section:

1. **Forward** — add new objects:
   - Create `learner_lesson_activation` table + index + RLS + GRANT.
   - Create `set_lesson_activation` RPC.
   - Add `learning_capabilities.lesson_id` column + index.
2. **Backfill** — populate state:
   - Insert legacy lesson activations for existing users × lessons {1, 2, 3}.
   - Backfill `learning_capabilities.lesson_id` from page-block adjacency.
3. **Rewrite** — replace analytics consumers (cleanup-only per R1 v2 C10):
   - Replace `get_lessons_overview` body to drop the source-progress CTEs (cleanup stage; the old function shape lives until cleanup runs).
   - (`compute_todays_plan_raw` is NOT touched — already retired in retirement #4.)
4. **Drop** — retire dead surface:
   - Drop column `lesson_page_blocks.source_progress_event` (CASCADE: the check constraint goes with it).
   - Drop function `_capability_source_progress_met(uuid, jsonb, text, text)`.
   - Drop function `record_source_progress_event(jsonb)`.
   - Drop policy `"source progress events owner read"` on `learner_source_progress_events`.
   - Drop policy `"source progress state owner read"` on `learner_source_progress_state`.
   - Drop table `learner_source_progress_events` CASCADE.
   - Drop table `learner_source_progress_state` CASCADE (drops the index `(user_id, source_ref)` automatically).

All wrapped in `do $$ … exception when others then null end $$` for idempotency where the underlying object may have already retired — same pattern as retirement #5 master section.

The full inlined retirement-#6 section (~330 LOC of SQL) is in §3.8.1 below.

### 3.8.1 Full inlined master retirement-#6 section (post-patch)

```sql
-- ============================================================================
-- RETIREMENT #6 — Source-progress state machine → lesson-activation checkbox
-- ============================================================================
-- See docs/plans/2026-05-07-retire-source-progress.md for the spec.
-- Idempotent. Safe to re-run.
--
-- This entire block is the end-state appended to master scripts/migration.sql.
-- For deploy ordering (per §6), the block is split into two physical files:
--   forward.sql  → steps 1-6 (FORWARD-ONLY; applied via psql -f BEFORE code deploy)
--   cleanup.sql  → steps 7-10 (CLEANUP-ONLY; applied via make migrate AFTER code deploy)
-- The same block runs end-to-end on a fresh DB via make migrate (idempotent).

-- ============================================================================
-- FORWARD-ONLY (applied in forward.sql BEFORE code deploy; mirrored in master)
-- ============================================================================

-- 1. NEW TABLE: learner_lesson_activation
create table if not exists indonesian.learner_lesson_activation (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  lesson_id    uuid        not null references indonesian.lessons(id) on delete cascade,
  activated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists learner_lesson_activation_user_idx
  on indonesian.learner_lesson_activation(user_id);

alter table indonesian.learner_lesson_activation enable row level security;

drop policy if exists "lesson activation owner read" on indonesian.learner_lesson_activation;
create policy "lesson activation owner read"
  on indonesian.learner_lesson_activation for select
  to authenticated
  using (user_id = auth.uid());

grant select on indonesian.learner_lesson_activation to authenticated;
revoke insert, update, delete on indonesian.learner_lesson_activation from authenticated;
grant all on indonesian.learner_lesson_activation to service_role;

-- 2. NEW RPC: set_lesson_activation
create or replace function indonesian.set_lesson_activation(
  p_user_id   uuid,
  p_lesson_id uuid,
  p_activated boolean
)
returns void
language plpgsql
security definer
set search_path = indonesian, public
as $$
begin
  if p_user_id is null or p_lesson_id is null or p_activated is null then
    raise exception 'set_lesson_activation requires p_user_id, p_lesson_id, p_activated';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'set_lesson_activation user mismatch';
  end if;

  if not exists (select 1 from indonesian.lessons where id = p_lesson_id) then
    raise exception 'set_lesson_activation lesson not found: %', p_lesson_id;
  end if;

  if p_activated then
    insert into indonesian.learner_lesson_activation (user_id, lesson_id)
    values (p_user_id, p_lesson_id)
    on conflict (user_id, lesson_id) do nothing;
  else
    delete from indonesian.learner_lesson_activation
    where user_id = p_user_id and lesson_id = p_lesson_id;
  end if;
end;
$$;

revoke all on function indonesian.set_lesson_activation(uuid, uuid, boolean) from public;
grant execute on function indonesian.set_lesson_activation(uuid, uuid, boolean) to authenticated, service_role;

-- 3. (REMOVED in R1 v3.) The _capability_lesson_activated helper was dropped
-- because it had zero callers — its only intended consumer (compute_todays_plan_raw)
-- was a phantom retired in retirement #4. Eligibility filtering happens in TS
-- (planner reads activatedLessons set; capability.lessonId is the gate).

-- 4. NEW COLUMN: learning_capabilities.lesson_id (with backfill)
alter table indonesian.learning_capabilities
  add column if not exists lesson_id uuid references indonesian.lessons(id) on delete set null;

create index if not exists learning_capabilities_lesson_idx
  on indonesian.learning_capabilities(lesson_id) where lesson_id is not null;

-- Backfill from page-block adjacency. Each capability_key in
-- lesson_page_blocks.capability_key_refs[] is owned by the lowest-order_index
-- lesson that references it (the "introducing" lesson). NULL stays for
-- capabilities not referenced by any page block (e.g., podcast).
-- The cap_key matches learning_capabilities.canonical_key (verified against
-- capability_key_refs[] convention in the materialize pipeline).
-- NO exception handler: the UPDATE is idempotent on its own (the
-- `c.lesson_id is null` clause makes re-runs no-ops); silent-swallow of
-- real errors here would mask backfill mis-population.
update indonesian.learning_capabilities c
set lesson_id = sub.lesson_id
from (
  select distinct on (cap_key)
    unnest(pb.capability_key_refs) as cap_key,
    l.id as lesson_id
  from indonesian.lesson_page_blocks pb
  join indonesian.lessons l on pb.source_ref = 'lesson-' || l.order_index
  where array_length(pb.capability_key_refs, 1) > 0
  order by cap_key, l.order_index
) sub
where c.canonical_key = sub.cap_key
  and c.lesson_id is null;

-- 5. BACKFILL — Step 1: auto-activate legacy lessons (1, 2, 3) for every existing user.
-- Idempotent — safe to re-run.
insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)
select u.id, l.id, now()
from auth.users u
cross join indonesian.lessons l
where l.order_index in (1, 2, 3)
on conflict (user_id, lesson_id) do nothing;

-- 5. BACKFILL — Step 2: promote legacy lesson_progress rows to activation.
-- Preserves "started" state for users who clicked through any lesson via the
-- pre-retirement reader. After this commit lesson_progress becomes orphan data
-- (no future writes, no future reads); follow-up retirement to drop it.
-- R1 v2 fix: lesson_progress has no last_accessed_at column (master line 198-206).
insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)
select lp.user_id, lp.lesson_id, coalesce(lp.completed_at, now())
from indonesian.lesson_progress lp
on conflict (user_id, lesson_id) do nothing;

-- ============================================================================
-- CLEANUP-ONLY (applied in cleanup.sql AFTER code deploy; mirrored in master)
-- ============================================================================
--
-- get_lessons_overview rewrite is in cleanup, NOT forward, per R1 v2 C10:
-- rewriting in forward.sql breaks the old client's has_meaningful_exposure
-- field read during the deploy window between forward and code deploy.

-- 6. REWRITE: get_lessons_overview — drop source-progress CTEs; use activation
-- (compute_todays_plan_raw rewrite was REMOVED in R1 v2 — function was already
-- retired in retirement #4, see scripts/migration.sql:1115-1120.)
create or replace function indonesian.get_lessons_overview(p_user_id uuid)
returns table (
  lesson_id uuid,
  order_index int,
  title text,
  description text,
  audio_path text,
  duration_seconds int,
  primary_voice text,
  publication_status text,
  is_published boolean,
  lesson_sections jsonb,
  has_started_lesson boolean,
  has_page_blocks boolean,
  ready_capability_count int,
  practiced_eligible_capability_count int
)
language sql stable security invoker as $$
  with lesson_blocks as (
    select
      l.id as lesson_id,
      pb.block_key,
      pb.payload_json,
      coalesce(nullif(pb.source_refs, array[]::text[]), array[pb.source_ref]) as expanded_refs
    from indonesian.lessons l
    join indonesian.lesson_page_blocks pb
      on pb.source_ref = 'lesson-' || l.order_index
  ),
  lesson_capabilities as (
    select distinct on (lb.lesson_id, c.id)
      lb.lesson_id,
      c.id as capability_id,
      c.readiness_status,
      c.publication_status,
      s.activation_state,
      s.review_count
    from lesson_blocks lb
    cross join lateral unnest(lb.expanded_refs) as expanded_ref
    join indonesian.learning_capabilities c
      on c.source_ref = expanded_ref
    left join indonesian.learner_capability_state s
      on s.capability_id = c.id and s.user_id = p_user_id
  ),
  capability_counts as (
    select
      lesson_id,
      count(*) filter (
        where readiness_status = 'ready' and publication_status = 'published'
      )::int as ready_count,
      count(*) filter (
        where readiness_status = 'ready'
          and publication_status = 'published'
          and activation_state = 'active'
          and coalesce(review_count, 0) > 0
      )::int as practiced_count
    from lesson_capabilities
    group by lesson_id
  ),
  lesson_sections_json as (
    select
      ls.lesson_id,
      jsonb_agg(to_jsonb(ls) order by ls.order_index) as sections
    from indonesian.lesson_sections ls
    group by ls.lesson_id
  ),
  lesson_block_presence as (
    select lesson_id, true as has_blocks
    from lesson_blocks
    group by lesson_id
  )
  select
    l.id,
    l.order_index,
    l.title,
    l.description,
    l.audio_path,
    l.duration_seconds,
    l.primary_voice,
    'published'::text as publication_status,
    true as is_published,
    coalesce(lsj.sections, '[]'::jsonb) as lesson_sections,
    (
      exists (
        select 1 from indonesian.learner_lesson_activation lla
        where lla.user_id = p_user_id and lla.lesson_id = l.id
      )
      or exists (
        select 1 from indonesian.lesson_progress lp
        where lp.user_id = p_user_id and lp.lesson_id = l.id
      )
    ) as has_started_lesson,
    coalesce(lbp.has_blocks, false) as has_page_blocks,
    coalesce(cc.ready_count, 0) as ready_capability_count,
    coalesce(cc.practiced_count, 0) as practiced_eligible_capability_count
  from indonesian.lessons l
  left join capability_counts cc on cc.lesson_id = l.id
  left join lesson_sections_json lsj on lsj.lesson_id = l.id
  left join lesson_block_presence lbp on lbp.lesson_id = l.id
  order by l.order_index;
$$;

grant execute on function indonesian.get_lessons_overview(uuid) to authenticated;

-- 7. DROP: column lesson_page_blocks.source_progress_event (and its check constraint)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'indonesian'
      and table_name = 'lesson_page_blocks'
      and column_name = 'source_progress_event'
  ) then
    alter table indonesian.lesson_page_blocks drop column source_progress_event;
  end if;
exception when others then null;
end $$;

-- 8. DROP: dead SQL functions
drop function if exists indonesian._capability_source_progress_met(uuid, jsonb, text, text) cascade;
drop function if exists indonesian.record_source_progress_event(jsonb) cascade;

-- 9. DROP: source-progress RLS policies (defensive — harmless if already gone)
drop policy if exists "source progress events owner read" on indonesian.learner_source_progress_events;
drop policy if exists "source progress events owner insert" on indonesian.learner_source_progress_events;
drop policy if exists "source progress state owner read" on indonesian.learner_source_progress_state;
drop policy if exists "source progress state owner update" on indonesian.learner_source_progress_state;
drop policy if exists "source progress state owner insert" on indonesian.learner_source_progress_state;

-- 10. DROP: source-progress tables (CASCADE picks up index learner_source_progress_state(user_id, source_ref))
drop table if exists indonesian.learner_source_progress_state cascade;
drop table if exists indonesian.learner_source_progress_events cascade;
```

### 3.9 Tracked timestamped migration files (paper-trail per retirement #2/#4 pattern)

Two new files, neither auto-applied:

```
scripts/migrations/2026-05-07-retire-source-progress.sql           (~340 LOC — same content as the master section)
scripts/migrations/2026-05-07-retire-source-progress.rollback.sql  (~360 LOC — restores the dropped surface)
```

These exist purely for paper-trail and operator-rollout-on-fresh-DB. `make migrate` reads only `scripts/migration.sql` (per `scripts/migrate.ts:24`).

### 3.10 Staging-file mechanical strip

A throwaway script `scripts/strip-source-progress-from-staging.ts` (~60 LOC; R1 v1 doubled the scope to cover both file types) is added in commit 3. It runs once, edits in place:
- All 9 staging `capabilities.ts` files — removes every `requiredSourceProgress: …` line (~2660 occurrences).
- All 9 staging `lesson-page-blocks.ts` files — removes every `source_progress_event: …` line (~161 occurrences).

Then the script is deleted in the same commit. Equivalent in spirit to the `bun fx`-style throwaway scripts used in retirement #4 for i18n cleanup.

The script is deleted in the same commit because it has no future use — once both types drop the fields, future staging files won't generate them, and the strip is one-shot.

### 3.11 New-user activation flow

**Decision (R1 v3):** App-side `onAuthStateChange` listener hook, gated on `event === 'SIGNED_IN'` AND a first-time signal (e.g., `localStorage` `'starter_lessons_attempted'` flag, or a check against `learner_lesson_activation` row count for the user). After the auth event fires, deferred via `setTimeout(0)` per the documented CLAUDE.md auth-deadlock pattern, fire-and-forget calls to `set_lesson_activation` for lessons {1, 2, 3}. The implementation extends the EXISTING listener at `authStore.ts:53-86` rather than adding a new hook in `signUp` — R1 v2 finding I21: signUp doesn't run inside an auth callback, but `onAuthStateChange` does, AND a SIGNED_IN event fires on every sign-in (including post-signUp). Putting the activation call in the listener means new users get auto-activation on first sign-in regardless of which `authStore` method they entered through.

```typescript
// src/stores/authStore.ts — extend the existing onAuthStateChange listener
async function activateStarterLessons(userId: string): Promise<void> {
  try {
    const { data: lessons } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('id, order_index')
      .in('order_index', [1, 2, 3])

    if (!lessons?.length) return

    await Promise.allSettled(
      lessons.map(lesson =>
        supabase
          .schema('indonesian')
          .rpc('set_lesson_activation', {
            p_user_id: userId,
            p_lesson_id: lesson.id,
            p_activated: true,
          })
      )
    )
  } catch (err) {
    logError({ page: 'auth', action: 'activate-starter-lessons', error: err })
    // non-blocking — user can self-activate via the lesson page
  }
}

// Inside the existing onAuthStateChange listener (authStore.ts:53-86).
// SCHEMATIC — keep the existing rich body (profile upsert + loadProfileData +
// checkAdmin + set({...}) inside its setTimeout). Add ONLY the new
// SIGNED_IN-gated activation block alongside it. Implementer must NOT replace
// the existing body with a stub. Also rename the listener's parameter from
// `_event` (currently underscored, unused) to `event` to read the event type.

supabase.auth.onAuthStateChange(async (event, session) => {  // _event → event
  if (session?.user) {
    // ... EXISTING body unchanged: profile upsert + loadProfileData
    //     + checkAdmin + set({...}) inside setTimeout(0). Keep as-is.
    if (event === 'SIGNED_IN') {
      // NEW: deferred per CLAUDE.md auth-deadlock pattern. Idempotent —
      // set_lesson_activation uses ON CONFLICT DO NOTHING; calling on every
      // SIGNED_IN event is safe (the master backfill has already populated
      // for existing users, so this is a no-op for them; new users get
      // their starter lessons activated regardless of which authStore method
      // they entered through).
      setTimeout(() => { void activateStarterLessons(session.user!.id) }, 0)
    }
  }
})
```

**Surgery in §3.1 for `authStore.ts` (R1 v3 M17):** rename the listener parameter `_event` → `event` (CLAUDE.md ESLint config does not honor `_` prefix); add the SIGNED_IN block per above.

**Why setTimeout(0)?** Per CLAUDE.md "Auth store pattern (critical)": fetching user data inside `onAuthStateChange` callbacks deadlocks the Supabase auth pipeline. The same pattern applies to RPC calls. Defer to the next event-loop tick.

**Why every SIGNED_IN, not first-signup-only?** The set_lesson_activation RPC is idempotent (`on conflict do nothing`). The cost of running it on every sign-in is one round-trip × 3 lessons = trivial. This avoids the corner case of a user signing in pre-backfill (e.g., tester account) — they get auto-activated even if the migrate's existing-user backfill missed them.

**Why not a DB trigger on `auth.users`?** GoTrue owns `auth.users` schema; adding triggers there is a homelab cross-stack change beyond this PR's scope. The app-side hook is the same pattern used everywhere else in this codebase (no signup-time DB triggers exist in master `migration.sql`).

**Why not require manual activation for lessons 1-3?** The app currently has 9 lessons; lessons 1-3 are the legacy lessons (predate the staging pipeline) that every signed-up user has already started. Forcing them to click 3 checkboxes after signup is friction without value. The auto-activation is a UX simplification, not a hidden behavior — the checkboxes are right there if they want to deactivate.

### 3.12 `'exposure_only'` readiness preservation (resolves R1 v1 C2)

The pre-retirement code uses `requiredSourceProgress: { kind: 'none', reason: 'exposure_only' }` to mark `podcast_segment` capabilities as out-of-scope for spaced practice — they are eligible for one-time exposure (the podcast plays through), then retire. Dropping the field naïvely breaks this: podcast capabilities flow to `'ready'` and become schedulable in sessions.

**Decision.** Replace the field-based escape hatch with a `source_kind`-based gate. **R1 v2 fix (I22):** the helper takes only `ProjectedCapability` (camelCase shape) — wrap a separate snake-case overload if `LearningCapabilityRow` callers exist (verify by grep before adding):

```ts
// src/lib/capabilities/capabilityContracts.ts
function isExposureOnly(capability: Pick<ProjectedCapability, 'sourceKind'>): boolean {
  return capability.sourceKind === 'podcast_segment'
      || capability.sourceKind === 'podcast_phrase'
}
```

If a snake-case row consumer exists at the surgery time, add a parallel `isExposureOnlyRow(row: { source_kind: CapabilitySourceKind })` helper rather than a union-typed parameter (the two shapes can't share a type safely without a discriminated union accessor).

Any code path that previously asked "is this capability exposure-only?" via the field now asks via `source_kind`. The exposure-only behavior is reproducible from the source kind alone — no other capability type was ever marked exposure-only in production.

Surgery scope:
- `src/lib/capabilities/capabilityContracts.ts` — add `isExposureOnly` helper (~5 LOC); replace the line-62 branch.
- Any other consumer of `requiredSourceProgress?.kind === 'none' && reason === 'exposure_only'` — re-route to the helper. (Verified by `rg`: only `capabilityContracts.ts` uses this exact pattern.)

No DB column needed. No backfill needed.

### 3.13 Lessons overview status decision tree rewrite (resolves R1 v1 I5; refined R1 v2 I25)

The pre-retirement `lessonOverviewStatus.ts` has a 7-status decision tree (`later`, `coming_later`, `not_started`, `in_progress`, `ready_to_practice`, `in_practice`, `practiced`). Two of these (`later`, `coming_later`) are unrelated to source-progress and SURVIVE this retirement unchanged:
- `later` — gated on `!earlierLessonsSatisfied` (line 39-41). Driven by lesson-order satisfaction, not source-progress.
- `coming_later` — set in `lessonOverviewModel.ts:164` for lessons whose `has_page_blocks` is false (not yet content-prepared). Unrelated to source-progress.

The five source-progress-derived statuses collapse to four:

**New decision tree (5 statuses surviving + 4 source-progress-derived collapse to 4):**

```
hasStartedLesson = activation OR legacy lesson_progress (per §3.4)
ready = ready_capability_count
practiced = practiced_eligible_capability_count

if !earlierLessonsSatisfied            → 'later'        (UNCHANGED)
if !has_page_blocks                    → 'coming_later' (UNCHANGED)
if !hasStartedLesson                   → 'not_started'
if hasStartedLesson AND practiced == 0                         → 'in_progress'   (activated; capabilities ready or not — UI surfaces "Practice this lesson · N ready" CTA when ready > 0)
if hasStartedLesson AND practiced  > 0 AND practiced  < ready  → 'in_practice'
if hasStartedLesson AND practiced  > 0 AND practiced ==  ready  → 'practiced'
```

The `'ready_to_practice'` status retires — its old meaning ("user has had enough exposure to start practicing") is subsumed by `'in_progress'` (activation IS that signal now).

**Helper functions also need spec'd rewrites (R1 v2 caught):**
- `isLessonSatisfiedForRecommendation` (`lessonOverviewStatus.ts:27-36`) — current branch reads `signal.hasMeaningfulExposure` on line 34. After retirement, the function simplifies to `status === 'practiced'` only. Rewrite the body; preserve the function signature for callers.
- `recommendLesson` (`lessonOverviewStatus.ts:106-140`) — current `readyOrInPractice` branch (lines 119-125) reads `'ready_to_practice'`. After retirement, that branch collapses to just `'in_practice'` (no `'ready_to_practice'` to consider). Rewrite the body; preserve the function signature.

Surgery scope:
- `src/lib/lessons/lessonOverviewStatus.ts` — rewrite the decision function + `isLessonSatisfiedForRecommendation` + `recommendLesson`. ~50 LOC delete, ~35 LOC add.
- `src/lib/lessons/lessonOverviewModel.ts` — drop `hasMeaningfulExposure` field references; update the row mapper. ~15 LOC delete.
- `src/pages/Lessons.tsx` — strip `STATUS_TONE['ready_to_practice']` entry; rewrite the exposure-synthesis loop (lines 182-200) per §3.1.
- `src/__tests__/Lessons.test.tsx` + `lessonOverviewStatus.test.ts` + `lessonOverviewModel.test.ts` — update fixtures + assertions per the new tree.

### 3.14 GRANT + RLS audit (resolves §2.2(j) drift risk)

Update `scripts/check-supabase-deep.ts` expected-grants/policies in the same commit as the migration:

- Add `learner_lesson_activation` with grants `(SELECT)` to authenticated, `(ALL)` to service_role, RLS enabled, ≥1 SELECT policy.
- Remove `learner_source_progress_events` and `learner_source_progress_state` from the expected-tables list.
- Add `set_lesson_activation` to the expected-functions list. (`_capability_lesson_activated` was DROPPED in R1 v3 per finding I19; do not add it.)
- Remove `_capability_source_progress_met` and `record_source_progress_event`.
- Update the `learning_capabilities` table check to expect the new `lesson_id` column.

The check fails closed: any retirement that drops a previously-expected object without updating the check will fail `make check-supabase-deep`. This is the pattern established in retirement #5.

---

## 4. Architectural shift — runtime semantics

### 4.1 Before (today)

```
User clicks "Markeer als gezien" in LessonReader
  ↓
LessonBlockRenderer onProgress callback fires
  ↓
Lesson.tsx handleReaderSourceProgress(block, eventType)
  ↓
sourceProgressService.recordEvent({ userId, sourceRef, sourceSectionRef: block.id, eventType })
  ↓
PostgREST RPC indonesian.record_source_progress_event(p_event)
  ↓
INSERT learner_source_progress_events ON CONFLICT idempotency_key DO NOTHING
INSERT learner_source_progress_state ON CONFLICT (user_id, source_ref, source_section_ref) DO UPDATE
  state = max-rank(existing, new), completed_event_types = union, updated_at = now()
  ↓
Returns updated state row → setLessonSourceProgress(rows)

(Later, in session-builder)
pedagogyPlanner.planLearningPath fetches sourceProgress + recentReviewEvidence
isSourceProgressSatisfied({ requiredSourceProgress, sourceProgress, evidence, allowEvidenceBypass })
  → if requirement is { kind: 'source_progress', sourceRef: 'lesson-N', requiredState: 'intro_completed' }
    → check sourceProgress[sourceRef] state ≥ rank(requiredState)
    → fall back to evidence bypass if form_recall + recognition reviews exist
  → boolean
  → if false: suppress capability with reason 'missing_source_progress'

(Analytics — narrative only; the SQL function compute_todays_plan_raw was already
retired in retirement #4 along with its goalService caller, so there is no live
analytics consumer of the source-progress gate today. Its role was to count
"new capabilities not yet active" filtered through the same gate. After this
retirement, no equivalent analytics function exists; if a future Dashboard
needs the count, it can re-derive via TS by reading activatedLessons + capability rows.)
```

### 4.2 After (target arch)

```
User clicks "Activate this lesson" checkbox on Lesson.tsx
  ↓
setLessonActivated(userId, lessonId, true)
  ↓
PostgREST RPC indonesian.set_lesson_activation(p_user_id, p_lesson_id, true)
  ↓
INSERT learner_lesson_activation (user_id, lesson_id) ON CONFLICT DO NOTHING
  ↓
Returns void → caller's local state updates optimistically + refetches isLessonActivated

(Later, in session-builder)
pedagogyPlanner.planLearningPath fetches activatedLessons: Set<string>
For each capability:
  if capability.lessonId == null: eligible (cross-lesson)
  if activatedLessons.has(capability.lessonId): eligible
  else: suppress with reason 'lesson_not_activated'

(Analytics — no SQL-level analytics function consumes the gate after this
retirement. The R1 v3 spec dropped the `_capability_lesson_activated` helper
proposed in v0/v1/v2 because it had no live caller; if a future Dashboard's
"new" count needs eligibility filtering, it can reference `activatedLessons`
in TS or re-introduce the helper function locally.)
```

### 4.3 Behavioral consequences (worth surfacing)

1. **Per-block "mark as seen" UI disappears.** The entire interaction model changes. Users do not click per-section buttons anymore; one checkbox per lesson.
2. **The 'practice ready' toast disappears with no replacement.** Currently fires when the per-section progress events crosses a threshold. R1 v1 surfaced this as I6 (the "lesson card badge" replacement claim wasn't backed by code). Decision: the toast simply goes away. The lesson reader's existing CTA "Practice this lesson · N ready" (driven by the rewritten `lessonActionModel` per §3.1) is the surviving practice-ready signal. Users learn that activation = ready-to-practice; no incremental notification needed.
3. **Mastery Rule 2 simplifies.** A capability with zero reviews shows as `'introduced'` if its lesson is activated, `'not_assessed'` otherwise. Strictly more permissive than the old rule (which required at least one source-progress event in the lesson, which often required UI interaction).
4. **Backfill for existing users auto-activates lessons 1-3.** Every user instantly has lessons 1-3 in their activation set on first deploy. New users get the same on signup.
5. **Lessons 4-9 require explicit user activation.** On the Lessons overview, lessons 4+ show with an "Activate" affordance. Without activation, capabilities from those lessons are not eligible for new-capability introduction in sessions. (Due-card review of already-activated capabilities is unaffected — the activation state is for `dormant → active` introduction only.)
6. **Eligibility filter is faster.** A boolean lookup in a small per-user set replaces the multi-state machine + evidence-bypass logic. Each gate evaluation drops from O(eventCount + evidenceCount) to O(1).
7. **`get_lessons_overview` returns a smaller payload.** `has_meaningful_exposure` field disappears. Callers in `Lessons.tsx` and `lessonService` drop the field.
8. **The "lesson reading time" implicit signal disappears.** Currently, the lesson reader instruments time-on-page exposures via `LessonExposureKind`. Under the new model, reading is purely informational — the reader is a presentation, not a tracker. If a user reads a lesson without checking the activation box, the lesson is treated as not activated. This is intentional: the user is the authority.

---

## 5. Implementation plan — atomic commits

Per the source/test bundling rule from retirements #1-#5: every modified source file ships in the same commit as its modified tests.

### Commit 1 — DB schema: new objects + backfill (master migration.sql + forward + cleanup paper-trail)

**Scope:**
- Append the full retirement-#6 section to master `scripts/migration.sql` (forward + cleanup, ~340 LOC).
- Add `scripts/migrations/2026-05-07-retire-source-progress.forward.sql` (~270 LOC; applied via `psql -f` BEFORE code deploy per §6).
- Add `scripts/migrations/2026-05-07-retire-source-progress.cleanup.sql` (~70 LOC; applied via `make migrate` AFTER code deploy per §6).
- Add `scripts/migrations/2026-05-07-retire-source-progress.rollback.sql` (~360 LOC; full undo paper-trail).
- Update `scripts/check-supabase-deep.ts` expected-grants/policies/functions/columns per §3.14.
- Add a new migration test `scripts/__tests__/retire-source-progress-migration.test.ts` (~80 LOC, R1 v1 expanded) that exercises:
  - `set_lesson_activation` upsert + delete + idempotency
  - `set_lesson_activation` lesson-not-found error
  - `set_lesson_activation` user-mismatch error
  - The two backfill paths (legacy lessons {1,2,3} and lesson_progress promotion).

**Tests:** `bun run test --run` passes.

### Commit 2 — Source surgery + test surgery (atomic; the big one)

**Scope (18 source files modified + 3 deleted + ≥18 test files):**

Source deletes (3):
- `src/services/sourceProgressService.ts`
- `src/lib/pedagogy/sourceProgressGates.ts`
- `src/lib/lessons/lessonExposureProgress.ts`

Source surgery (18 — see §3.1 for the full list):
- All 18 files enumerated in §3.1 surgery block.

Source additions (1):
- `src/lib/lessons/activation.ts` (NEW)

Test deletes (4):
- See §3.3.

Test surgery (≥18):
- See §2.2(g) for the complete list.

Test additions:
- `src/lib/lessons/__tests__/activation.test.ts`

**Tests:** `bun run lint && bun run test --run && bun run build` — code-level gate is the binding gate.

### Commit 3 — Pipeline scripts surgery + staging strip

**Scope (7 scripts + 18 staging files):**

- `scripts/materialize-capabilities.ts` — strip `requiredSourceProgress` write; add `lessonId` plumbing.
- `scripts/promote-capabilities.ts` — strip `requiredSourceProgress` write.
- `scripts/check-capability-health.ts` — strip the validator branches.
- `scripts/check-capability-release-readiness.ts` — strip `sourceProgressRows` counter; add lesson_id-or-podcast invariant check.
- `scripts/lib/content-pipeline-output.ts` — strip the field thread-through.
- `scripts/publish-approved-content.ts` — strip the field thread-through.
- `scripts/sync-lesson-page-blocks-only.ts` — strip `source_progress_event` read+write (R1 v1 caught).
- Run + delete `scripts/strip-source-progress-from-staging.ts` (one-shot, ~60 LOC); commit shows the staging-file diff for both `capabilities.ts` and `lesson-page-blocks.ts` (18 files total).
- `scripts/__tests__/materialize-capabilities.test.ts` updated to assert `lessonId` insert plan.

**Tests:** `bun run test --run scripts/__tests__/` — pipeline tests pass.

### Commit 4 — UI polish + Lesson.tsx integration

**Scope:**
- Polish the activation checkbox UX (icon, copy, success notification).
- Adjust the Lessons overview list (`src/pages/Lessons.tsx`) to reflect the simpler `has_started_lesson` semantic — the overview's "Started" / "Ready to practice" / "Practiced" status badges should remain functional after `has_meaningful_exposure` drops from the response.
- Adjust `src/services/authStore.ts` signUp flow to call `activateStarterLessons` per §3.11.

**Tests:** `bun run lint && bun run test --run && bun run build`.

### Commit 5 — docs(arch): patch target-architecture.md + data-model.md inline (per retirement #4 playbook)

**Scope:**
- Update `docs/target-architecture.md` §1258-1296 — change "RETIRES IN #6" to "RETIRED in retirement #6".
- Update §1414 to mark migration-order step 5 done.
- Update §322-323 + §477-490 to reflect the realised activation API.
- Update §690 mastery rule 2 to the new shape.
- Update `docs/architecture/data-model.md` — add `learner_lesson_activation` and the `learning_capabilities.lesson_id` column; remove `learner_source_progress_events` and `learner_source_progress_state`.

### Commit 6 — Spec doc itself

**Scope:** This file (`docs/plans/2026-05-07-retire-source-progress.md`).

---

## 6. Deploy ordering

**Decision (R1 v2):** Two-stage migrate, eliminates all failure windows. Adopted on R1 v1 finding I13.

The retirement-#6 master section is conceptually two parts; the deploy executes them in two steps separated by code deploy:

- **Forward part** (lines marked "FORWARD-ONLY" in §3.8.1): create activation table + RPC + `lesson_id` column + run both backfills. Source-progress objects still alive, untouched. **`get_lessons_overview` is NOT rewritten in this stage** — old client still reads `has_meaningful_exposure` from the live source-progress JOINs (per R1 v2 finding C10: rewriting in forward.sql breaks the old client's `has_meaningful_exposure` read during the deploy window).
- **Cleanup part** (lines marked "CLEANUP-ONLY" in §3.8.1): rewrite `get_lessons_overview` (drops `has_meaningful_exposure` from response shape — by this point only NEW clients are reading it), drop `lesson_page_blocks.source_progress_event` column, drop `_capability_source_progress_met` and `record_source_progress_event` functions, drop the source-progress tables.

These two parts are split into two physical files inside `scripts/migrations/` AND mirrored as a single contiguous block at the EOF of master `migration.sql`. The split is realised at deploy time:

```
scripts/migrations/2026-05-07-retire-source-progress.forward.sql   (~200 LOC; applied via psql -f BEFORE code deploy)
scripts/migrations/2026-05-07-retire-source-progress.cleanup.sql   (~140 LOC; applied via make migrate AFTER code deploy)
scripts/migrations/2026-05-07-retire-source-progress.rollback.sql  (~360 LOC; paper-trail full undo)
```

R1 v2 fix (C10): `get_lessons_overview` rewrite (~70 LOC) moved from forward.sql to cleanup.sql so the OLD client's `has_meaningful_exposure` field read survives the deploy window.

Master `migration.sql` retirement-#6 section concatenates `forward.sql` + `cleanup.sql` so a fresh-DB `make migrate` reproduces the end state. Idempotent: re-runs of the master section against a live DB are no-ops (the cleanup drops have `if exists` guards; the forward creates use `create … if not exists` and `add column if not exists`; the backfills use `on conflict do nothing` and `where ... is null`).

**Operational checklist (homelab single-tenant):**

1. **Pre-flight:** run `make pre-deploy` locally from the PR branch; merge only if green.
2. **PR merges to main.**
3. **Apply forward migration** (operator, before deploy):
   ```bash
   PGPASSWORD=$POSTGRES_PASSWORD psql -h <homelab-postgres> -U postgres \
     -d postgres -f scripts/migrations/2026-05-07-retire-source-progress.forward.sql
   ```
   ETA: ~5 sec. New objects are present; old objects still functional. Old client (still running, not yet replaced) reads/writes source-progress unaffected.
4. **GitHub Actions builds + pushes the image** (auto, ~3-5 min). The new image starts but is not yet pulled.
5. **Pull + recreate the container** per CLAUDE.md deploy section:
   ```bash
   ssh mrblond@master-docker "sudo docker pull ghcr.io/albertvd/learning-indonesian:latest"
   ssh mrblond@master-docker "sudo docker stop learning-indonesian && sudo docker rm learning-indonesian && sudo docker run -d ..."
   ```
   ETA: ~30 sec. The new client is now live; it reads/writes `learner_lesson_activation` (works — table was added in step 3); it never calls source-progress RPCs.
6. **Apply cleanup migration** (operator, after deploy):
   ```bash
   make migrate                 # runs master migration.sql which now contains the full retirement-#6 section
   ```
   ETA: ~10 sec. The cleanup section runs: get_lessons_overview rewrite (drops `has_meaningful_exposure` from response shape — only NEW clients reading by this point) + drops execute against the now-unused source-progress surface. No active client is calling the dropped RPCs. `make migrate` then auto-runs `check-supabase-deep` to verify clean state. **Benign second-run note (R1 v2 M12):** the forward portion in master re-evaluates on this run. The `update learning_capabilities … where lesson_id is null` may pick up rows authored between step 3 and step 6 (e.g., a content-pipeline `materialize-capabilities` run that landed during deploy). This is harmless — those rows get their `lesson_id` populated by the second-run UPDATE.
7. **Verify** `make check-supabase-deep` reports no regressions.

**Why this works (and the single-shot approach didn't):**
- Step 3 removes the activation-write failure window: by the time the new client is live (step 5), the table it writes to has already existed for ~5+ seconds.
- Step 6 removes the source-progress-write failure window: by the time the source-progress tables drop (step 6), no live client calls those RPCs.
- The forward.sql and cleanup.sql are both idempotent; either can be re-run against a partially-applied DB without harm.
- `make migrate` (step 6) re-runs forward + cleanup as one block. The forward steps are no-ops (objects already exist). The cleanup steps execute the drops.

**The single-shot alternative — pros and cons (rejected):**
- Pro: one operator step instead of two. Acceptable for homelab single-tenant where the operator can tightly time the window.
- Con: ~10-second window where the new client is live but cleanup hasn't run, OR the new client is not yet live but cleanup HAS run. Both failure modes surface error notifications to active learners.
- The two-stage approach removes both failure windows for the trivial cost of one extra `psql -f` invocation.

**Rollback:** If anything fails, rollback procedure:
1. Re-run `scripts/migrations/2026-05-07-retire-source-progress.rollback.sql` against the live DB via `psql -f`. This recreates source-progress tables + RPCs (empty, no event history recovered) and drops the new activation table + RPC + helper + `lesson_id` column.
2. Revert the merge commit on main; trigger a re-deploy of the prior image.
3. If the rollback fires AFTER step 5 of the deploy and BEFORE step 6, the source-progress tables still exist (cleanup hasn't run). The rollback is a no-op for the drops; it only undoes the forward additions. This is the "graceful partial-revert" path.

The rollback cannot recover lost source-progress event history (event-log table contents drop in step 6). If preservation is required, a pre-step-6 `pg_dump` of `indonesian.learner_source_progress_*` is the operator's responsibility per the homelab backup policy.

---

## 7. Tests + code-level gate

The binding gate per the retirement playbook is the code-level gate — `bun run lint && bun run test --run && bun run build`. Full `make pre-deploy` may fail on environmental homelab issues unrelated to this PR (the lesson-audio_path seed gap from retirement #4 still exists on main as of 2026-05-07; do not block on it).

**New tests added by this retirement:**
- `src/lib/lessons/__tests__/activation.test.ts` — exercises `isLessonActivated`, `listActivatedLessons`, `setLessonActivated` against a mocked Supabase client; asserts the RPC is called with the right arguments and the optimistic local state matches.
- `scripts/__tests__/retire-source-progress-migration.test.ts` — exercises `set_lesson_activation` upsert + delete + lesson-not-found error + user-mismatch error against `pglite`, plus the two backfill paths (legacy lessons {1,2,3} and lesson_progress promotion).
- `src/__tests__/Lesson.test.tsx` — adds an integration test: mock RPC, render the page with a non-activated lesson, click the activation checkbox, assert the RPC is called and the rendered state flips.

**Tests removed:**
- 4 deleted whole-file tests per §3.3.

**Tests modified:** ≥13 per §3.3.

**Net test surface:** roughly the same line count after surgery (~50 LOC removed net; the new tests are smaller than the deleted ones).

---

## 8. Risk + invariants

### What the PR explicitly preserves

- `lesson_progress` table (legacy "completed_at" tracking) — untouched. Different concept from activation.
- `capability_review_events` and the answer log — untouched. Reviews flow unchanged.
- `learner_capability_state` rows — untouched. FSRS scheduling continues unchanged. Activation gates only the `dormant → active` transition for new capabilities.
- `learning_sessions` table — untouched. Retirement #5's RPC-side upsert is preserved.
- `lesson_page_blocks` table — column-level surgery only. The `capability_key_refs` adjacency is preserved (reused for the `learning_capabilities.lesson_id` backfill). The `source_progress_event` column drops.
- Podcast capabilities — unaffected. They have `lesson_id IS NULL` so the eligibility helper trivially returns true.
- Existing user activation state — backfilled. No user loses their lesson 1-3 access on deploy day.

### What changes

- Lesson reader no longer instruments per-section progress.
- Lesson page gains an activation checkbox header.
- "Practice ready" toast disappears.
- Mastery rule 2 simplifies (more permissive — capabilities with activated lessons immediately show as `'introduced'` even before any review).
- Eligibility gate runtime drops from O(events + evidence) to O(1).
- Pipeline staging files no longer carry per-capability progress requirements; capabilities carry `lesson_id` instead.

### Invariants preserved

- The retirement adds no new browser-side write surfaces beyond `set_lesson_activation`.
- Cross-lesson capabilities (podcast) remain always-eligible without a special-case branch — the helper handles null gracefully.
- The new `set_lesson_activation` RPC validates user identity (service-role bypass + `auth.uid()` match otherwise) and lesson existence — same defense pattern as `commit_capability_answer_report` (per retirement #5).
- The activation table's `(user_id, lesson_id)` primary key prevents duplicate rows; the `ON CONFLICT DO NOTHING` makes the RPC idempotent.

### Rollback

The rollback path is documented in §6. The tracked migration `2026-05-07-retire-source-progress.rollback.sql` recreates the source-progress objects from their original CREATE-statement contents (lifted from `2026-04-25-capability-core.sql:103-317` and `2026-05-01-learner-progress-functions.sql:56-116`), drops the new activation table + RPC + helper, and removes the `learning_capabilities.lesson_id` column. Lost data: source-progress event history (acceptable; the value of those events is transient now that activation replaces them).

---

## 9. Architect-review iteration log

### 9.1 R1 v1 → revisions (2026-05-07)

R1 v1 returned **REVISE — 35 findings (8 CRITICAL + 17 IMPORTANT + 10 MINOR)**. Cumulative-review pattern matches retirements #4 (22 findings/3 rounds) and #5 (32 findings/3 rounds). All 8 CRITICALs verified against the live tree before folding.

**CRITICAL findings folded into v2:**

- **C1** — `compute_todays_plan_raw` rewrite was a phantom (function retired in retirement #4 at `migration.sql:1115-1120`; zero TS callers). Rewrite removed from §3.4 + §3.8.1; ~70 LOC of dead PL/pgSQL saved.
- **C2** — `'exposure_only'` readiness preservation. Replaced field-based check with `source_kind`-based `isExposureOnly` helper (§3.12).
- **C3** — 9 `lesson-page-blocks.ts` staging files have ~161 occurrences of `source_progress_event`. Strip script extended (§3.10); §2.2(f) updated to enumerate.
- **C4** — `src/lib/preview/localPreviewContent.ts` (production /preview admin page) carries 17 `event:` arguments and one `source_progress_event:` line. Added to §3.1 surgery list.
- **C5** — `scripts/sync-lesson-page-blocks-only.ts:30,65` reads+writes the dropped column. Added to §2.2(e) + §3.1.
- **C6** — Three test files unenumerated in v0: `LessonReader.test.tsx`, `lessonExperience.test.ts`, `sessionPlanningSignals.test.ts`. Added to §2.2(g).
- **C7** — `Lessons.test.tsx` uses `has_meaningful_exposure` repeatedly. Added to §2.2(g).
- **C8** — `lesson_progress` derivation drop creates orphan-data state. Resolved via lesson_progress promotion backfill (§3.6 step 2) + `get_lessons_overview` rewrite uses union of activation + lesson_progress.

**IMPORTANT findings folded into v2:**

- **I1** — Hero "Markeer als geopend" + recap "Markeer les als afgerond" CTAs. Decision: drop both. Activation checkbox is the only state-modifying control. Updated §2.2(b).
- **I2** — StatusPill mechanism. Decision: drop entirely. Updated §2.2(b).
- **I3** — `currentSourceRefs` plannerInput goes inert. Decision: drop `isSourceSwitch` + `currentSourceRefs` path of `isUsefulForCurrentPath` (keep goal-tags path + `selectedSourceRefs` path). Updated §2.2(a) for `pedagogyPlanner.ts`.
- **I4** — `reviewEvidenceResult` query becomes dead. Added to `capabilitySessionDataService.ts` surgery (§2.2(a) + §3.1).
- **I5** — `lessonOverviewStatus.ts` + `lessonOverviewModel.ts` 7-status decision tree collapses. Decision: rewrite to 4-status tree (§3.13). Both files added to §3.1.
- **I6** — Practice-ready toast replacement. Decision: drop the toast; lesson-overview status surfaces "Practice this lesson · N ready" via `lessonActionModel`. Updated §4.3 item 2.
- **I7** — `lessonActionModel.ts` `practiceReadyCount`. Repointed to `LessonOverviewRow.ready_capability_count - active_practiced_count` gated on activation. Added to §3.1.
- **I8** — Informational only. Verified the user-mismatch check pattern is correct.
- **I9** — `mastery/masteryModel.ts` SELECT lists need `lesson_id`. Added to §2.2(a).
- **I10** — `materialize-capabilities` lesson_id plumbing. Decision: option (b) — `planCapabilityMaterialization` gains a `lessonId?: string` argument; staging-runner wraps. Updated §2.2(e).
- **I11** — `PlannerCapability` `lessonId?` field shape. Specified in §2.2(a) + §3.1.
- **I12** — `_capability_lesson_activated` SECURITY INVOKER vs DEFINER trap. Resolution: keep INVOKER, add explicit warning comment in the SQL block. Updated §3.4 + §3.8.1.
- **I13** — Migration ordering. **Adopted: switch to two-stage migrate** (forward.sql before deploy, cleanup.sql after deploy). Eliminates both failure windows. §6 fully rewritten.
- **I14** — Backfill exception handler swallowed real errors. Resolution: drop the handler from the `learning_capabilities.lesson_id` UPDATE — UPDATE is idempotent on its own via the `c.lesson_id is null` clause. Updated §3.8.1.
- **I15** — `sessionPlanningSignals.ts` + `sessionPosture.ts` `lastMeaningfulExposureAt`. Decision: drop both. Added to §3.1.
- **I16** — `materialize-capabilities.test.ts` missing. Added to §2.2(g).
- **I17** — `signUp` flow setTimeout(0) deadlock pattern. Updated §3.11 with the corrected pattern.

**MINOR findings folded into v2:**

- **M1, M2** — `check-supabase-deep.ts` and `data-model.md` claims clarified.
- **M3** — `'noticing_prompt'` block-kind classification dropped/folded into `'pattern_callout'`. Updated §2.2(a).
- **M4** — Strip script LOC bumped to ~60.
- **M5** — Master section LOC tightened to ~330.
- **M6** — Backfill JOIN comment added inline.
- **M7** — Migration-test LOC bumped to ~80.
- **M8** — LessonReader.tsx LOC bumped to ~25.
- **M9** — `make pre-deploy` step added as Step 1 of the deploy checklist (§6).
- **M10** — Eligibility-runtime claim corrected to O(N) per-call from O(N × (events + evidence)).

**Net change:** ~3739 → ~3899 LOC delete (added staging page-blocks strips, added preview/sync surgery), ~745 → ~875 LOC add (added §3.12 helper, §3.13 status tree, lesson_progress backfill).

R1 v1 → R1 v2 spec: ready for re-dispatch to the architect for round 2.

### 9.2 R1 v2 → revisions (2026-05-07)

R1 v2 returned **REVISE — 16 findings (4 CRITICAL + 8 IMPORTANT + 4 MINOR)**. Round-2-on-spec defects of "round-1 fix introduced this corner case" — exactly the OpenBrain playbook pattern from retirement #5.

**CRITICAL findings folded into v3:**

- **C9** — `lesson_progress.last_accessed_at` column does not exist (Grep verified against `migration.sql:198-206` and `progressService.ts:14-26`). Forward.sql would have hard-aborted at first deploy under `psql -v ON_ERROR_STOP=1`. Resolution: replaced `coalesce(lp.completed_at, lp.last_accessed_at, now())` with `coalesce(lp.completed_at, now())` in §3.6 + §3.8.1.
- **C10** — Forward-stage `get_lessons_overview` rewrite breaks the OLD client (which reads `has_meaningful_exposure` per `lessonService.ts:168` + `Lessons.tsx:189`) during the deploy window. Resolution: moved the rewrite from the FORWARD section to the CLEANUP section in §3.8.1. The old function shape (with `has_meaningful_exposure` derived from live source-progress) survives until cleanup runs post-deploy.
- **C11** — Two test files missed in v2: `lessonOverviewStatus.test.ts` (13 `hasMeaningfulExposure` refs + 6 `recommendLesson` calls) and `lessonOverviewModel.test.ts` (4 `meaningful: true` fixture rows). Added to §2.2(g).
- **C12** — `Lessons.tsx` reads `row.has_meaningful_exposure` (line 189) and renders `STATUS_TONE['ready_to_practice']` (line 101); not in v2 surgery list. Added to §3.1.

**IMPORTANT findings folded into v3:**

- **I18** — Stale `compute_todays_plan_raw` references in §3.8 line 468 + §4.1 (analytics flow) + §4.2 (analytics flow). All three sections updated to either remove the references or annotate them as historical context.
- **I19** — `_capability_lesson_activated` helper has zero callers after R1 v1 retired the only intended consumer (`compute_todays_plan_raw`). Adopted YAGNI: helper DROPPED entirely from §3.4 + §3.8.1 + §3.14 grant list. Saves ~12 LOC of unused SQL infrastructure + one expected-functions surface entry.
- **I20** — `currentSourceRefs` drop wording risked regressing lesson-scoped session filtering (lines 257-264 of pedagogyPlanner re-route `selectedSourceRefs` through `currentSourceRefs`). §2.2(a) for `pedagogyPlanner.ts` rewritten to spec the explicit two-signal restructure: `isInSelectedLessonScope` for lesson-scoped modes + `matchesActiveGoalTags` for free-form, dropping the `currentSourceRefs` union entirely.
- **I21** — `signUp` setTimeout(0) doesn't match the documented auth-deadlock pattern (which is `onAuthStateChange`-specific). Resolution: §3.11 rewritten to put the activation call inside the EXISTING `onAuthStateChange` listener gated on `event === 'SIGNED_IN'`. Idempotent RPC tolerates duplicate firings; covers both signUp + every subsequent sign-in (defensive against pre-backfill testers).
- **I22** — `isExposureOnly` typing bug (`ProjectedCapability | LearningCapabilityRow` union has incompatible field-naming conventions). Resolution: helper signature narrowed to `Pick<ProjectedCapability, 'sourceKind'>` only; if a snake-case row consumer exists at surgery time, add a parallel `isExposureOnlyRow` rather than a union.
- **I23** — `materialize-capabilities` `lessonId` plumbing: per-call argument fails when staging files mix lesson-scoped + podcast capabilities in the same batch. Resolution: switch to per-row `lessonId?: string` field on `ProjectedCapability` (matches the per-row insert plan at line 169).
- **I24** — `Lesson.tsx:249-258` `practiceReadyCount` rewrite was implicit. Resolution: §3.1 surgery for `Lesson.tsx` now explicitly specs the three-line collapse: `practiceReadyCount = lessonActivated ? Math.max(0, readyCapabilityCount - activePracticedCapabilityCount) : 0`.
- **I25** — Status-tree "4 statuses" framing understated the actual surface. Resolution: §3.13 rewritten to (a) explicitly mark `'later'` and `'coming_later'` as UNCHANGED survivors; (b) spec the rewrite of `isLessonSatisfiedForRecommendation` (collapses to `status === 'practiced'`) and `recommendLesson` (`readyOrInPractice` branch collapses to `'in_practice'` only); (c) add both helper functions to the test-rewrite scope.

**MINOR findings folded into v3:**

- **M11** — Resolved as I18 (cross-section consistency).
- **M12** — Added an inline note to §6 step 6 about benign second-run UPDATE.
- **M13** — Resolved as I19 (helper dropped entirely).
- **M14** — LOC tally rounded; see §10.

**Net change v2 → v3:** ~120 LOC delete (dropped helper, dropped get_lessons_overview rewrite forward placement) and ~80 LOC add (expanded surgery spec + R1 v2 acknowledgements).

R1 v2 → R1 v3 spec: ready for re-dispatch to the architect for round 3.

### 9.3 R1 v3 → revisions (2026-05-07)

R1 v3 returned **REVISE — 5 findings (0 CRITICAL + 2 IMPORTANT + 3 MINOR)**. Round-3 convergence pattern: residuals from incomplete R1 v2 fix propagation, no new defect classes. All 5 folded into v4:

**IMPORTANT findings folded:**

- **I26** — I19 helper-drop fold was incomplete. Four stale `_capability_lesson_activated` references survived in §3.8 step 1 (line 448), §3.14 expected-functions list (line 890), §5 commit-1 migration-test scope (line 992), and §7 new-tests catalog (line 1134). All four removed/rewritten in v4. The §3.14 fix is load-bearing: keeping the orphan in the expected-functions list would fail `make check-supabase-deep` post-merge (the helper does not exist).
- **I27** — `getLessonCapabilityPracticeSummary` survives, verified. v3 left this as a "verify on read" TODO. Folded the verification result explicitly into §2.2(a) and §3.1 surgery list: the method queries only `learning_capabilities` + `learner_capability_state`, never source-progress, and its outputs (`readyCapabilityCount`, `activePracticedCapabilityCount`) are load-bearing for the I24 `Lesson.tsx:249-258` rewrite. Without this commit-to-survival, the implementer might delete the method and break the I24 fix.

**MINOR findings folded:**

- **M15** — §10 LOC tally drift (~4180 vs ~4173 vs ~4173 in three different rows). Recomputed via column-sum check; aligned all three to ~4172.
- **M16** — §10 subtitle "R1 v2 estimate" → "R1 v3 estimate".
- **M17** — §3.11 implementation snippet annotated as schematic; explicit instruction to keep the existing rich body and add ONLY the SIGNED_IN block alongside; explicit `_event → event` rename callout in §3.1 surgery list (`authStore.ts` added with the rename + SIGNED_IN block as its surgery scope).

**Net change v3 → v4:** ~5 LOC delete (4 stale refs + LOC alignment), ~30 LOC add (verification commits + schematic annotations + authStore surgery row).

R1 v3 → R1 v4 spec: ready for re-dispatch to the architect for round 4 (expected: clean APPROVE, per the playbook arithmetic — round-3 residuals are typically the last propagation defects).

### 9.4 R1 v4 → revisions

(pending)

---

## 10. Cumulative retirement tally after this PR

LOC breakdown for #6 (R1 v4 estimate, refined from R1 v1 + v2 + v3 findings):

| Surface | LOC delete | LOC add |
|---|---:|---:|
| `src/services/sourceProgressService.ts` (full delete) | 161 | 0 |
| `src/lib/pedagogy/sourceProgressGates.ts` (full delete) | 94 | 0 |
| `src/lib/lessons/lessonExposureProgress.ts` (full delete) | 48 | 0 |
| `src/lib/capabilities/capabilityTypes.ts` (type strip) | ~20 | 0 |
| `src/lib/capabilities/capabilityCatalog.ts` (14 strips) | ~28 | 0 |
| `src/lib/capabilities/capabilityContracts.ts` (branch strip + isExposureOnly add) | ~5 | ~5 |
| `src/lib/pedagogy/pedagogyPlanner.ts` (gate rewrite + isSourceSwitch drop) | ~50 | ~15 |
| `src/lib/pedagogy/lessonIntroduction.ts` (inline ReviewEvidence) | ~3 | ~5 |
| `src/lib/pedagogy/sessionPosture.ts` (drop lastMeaningfulExposureAt) | ~3 | 0 |
| `src/lib/session/sessionPlanningSignals.ts` (drop lastMeaningfulExposureAt + sourceProgressRows) | ~20 | 0 |
| `src/lib/lessons/lessonExperience.ts` (field + 'noticing_prompt' strip) | ~15 | 0 |
| `src/lib/lessons/lessonOverviewModel.ts` (drop hasMeaningfulExposure) | ~10 | 0 |
| `src/lib/lessons/lessonOverviewStatus.ts` (4-status tree rewrite) | ~30 | ~25 |
| `src/lib/lessons/lessonActionModel.ts` (repoint practiceReadyCount) | ~10 | ~10 |
| `src/lib/mastery/masteryModel.ts` (rule rewrite + lesson_id select) | ~35 | ~20 |
| `src/lib/preview/localPreviewContent.ts` (event: param strip; 17 callers) | ~25 | 0 |
| `src/services/lessonService.ts` (method delete) | ~20 | 0 |
| `src/services/capabilitySessionDataService.ts` (query+adapter delete + lesson_id add) | ~90 | ~5 |
| `src/pages/Lesson.tsx` (handler strip + checkbox add) | ~110 | ~25 |
| `src/components/lessons/LessonReader.tsx` (prop+pill strip) | ~25 | 0 |
| `src/components/lessons/blocks/LessonBlockRenderer.tsx` (4 CTAs + StatusPill strip) | ~70 | 0 |
| Test deletes (4 files) | ~250 | 0 |
| Test surgery (≥18 files; R1 v1 added 5) | ~160 | ~110 |
| `src/lib/lessons/activation.ts` (NEW) | 0 | ~80 |
| `src/lib/lessons/__tests__/activation.test.ts` (NEW) | 0 | ~60 |
| Pipeline-script surgery (7 files; R1 v1 added sync-lesson-page-blocks-only) | ~40 | ~20 |
| Staging `capabilities.ts` strips (9 files; one-shot script) | ~2660 | 0 |
| Staging `lesson-page-blocks.ts` strips (9 files; one-shot script) | ~161 | 0 |
| One-shot strip script (~60 LOC; added + deleted in commit 3) | 0 | 0 |
| `scripts/migration.sql` retirement-#6 section | 0 | ~320 |
| `scripts/__tests__/retire-source-progress-migration.test.ts` (new) | 0 | ~80 |
| `scripts/check-supabase-deep.ts` updates | ~10 | ~15 |
| `docs/target-architecture.md` annotations | ~15 | ~25 |
| `docs/architecture/data-model.md` annotation | ~5 | ~10 |
| **TOTAL — executable surface (R1 v4)** | **~4173** | **~830** |
| `scripts/migrations/2026-05-07-retire-source-progress.forward.sql` (paper-trail; applied via `psql -f`) | 0 | ~200 |
| `scripts/migrations/2026-05-07-retire-source-progress.cleanup.sql` (paper-trail; mirrored in master) | 0 | ~140 |
| `scripts/migrations/2026-05-07-retire-source-progress.rollback.sql` (paper-trail) | 0 | ~360 |
| `docs/plans/2026-05-07-retire-source-progress.md` (this spec) | 0 | ~1700 |
| **TOTAL — including paper-trail/spec files (delete column unchanged; only add column grows)** | **~4173** | **~3230** |

**Net (executable surface):** ~4173 LOC delete, ~830 LOC add. The bulk of the deletes is the staging-file strip (~2821) — single-line field deletions on machine-generated payloads. The TypeScript code surgery is ~770 LOC delete + ~290 LOC add — comparable to retirement #4 (~600 LOC delete + ~100 LOC add) and significantly larger than #5 (~221 LOC).

```
#1 Audio multi-voice            -265 LOC                                                  (PR #34, merged)
#2 Grammar-state subsystem      -450 LOC + 1 table + indexes                             (PR #35, merged)
#3 Browser FSRS                 -341 LOC                                                  (PR #36, merged)
#4 Goal subsystem + event log   -3400 LOC + 5 tables + 9 fns + 4 crons                   (branch retire/goal-subsystem)
#5 Session lifecycle            -~221 LOC + 1 fn + 1 cron + RPC modification + dead RLS  (branch retire/session-lifecycle)
#6 Source-progress (this)       -~4173 LOC + 2 tables + 2 fns + 1 fn rewrite + 1 column drop + 1 column add
                                 ----
TOTAL retired                    ~8850 LOC + 8 tables + 13 fns + 5 crons + 2 dead RLS policies + DB column rewrites
```

**End of spec.**
