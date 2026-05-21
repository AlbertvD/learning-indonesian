# Agent 5: Services & helpers

**Date:** 2026-05-20
**Files reviewed:** 22

## Files reviewed

- `src/services/audioService.ts`
- `src/services/lessonService.ts`
- `src/services/podcastService.ts`
- `src/services/progressService.ts`
- `src/services/learnerProgressService.ts`
- `src/services/leaderboardService.ts`
- `src/services/contentFlagService.ts`
- `src/lib/supabase.ts`
- `src/lib/chunkedQuery.ts`
- `src/lib/logger.ts`
- `src/lib/featureFlags.ts`
- `src/lib/i18n.ts`
- `src/lib/audioPreferences.ts`
- `src/lib/listeningPreferences.ts`
- `src/lib/semanticGroups.ts`
- `src/lib/lessons/activation.ts`
- `src/lib/lessons/lessonActionModel.ts`
- `src/lib/lessons/lessonExperience.ts`
- `src/lib/lessons/lessonOverviewModel.ts`
- `src/lib/lessons/lessonOverviewStatus.ts`
- `src/lib/lessons/lessonReadiness.ts`
- `src/lib/distractors/index.ts`, `cascade.ts`, `options.ts`, `semanticGroups.ts`, `structuralTypes.ts`
- `src/lib/preview/localPreviewContent.ts`
- `src/types/learning.ts`, `auth.ts`, `progress.ts`
- Test files in `src/services/__tests__/` and `src/lib/lessons/__tests__/`, `src/lib/distractors/__tests__/`

## Findings

### F5-1: `lessonReadiness.ts` is fully dead post-retirement #6

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/lib/lessons/lessonReadiness.ts:1-85` — `decideLessonReadiness`, `isMeaningfulGrammarAudio`, `isMeaningfulDialogueAudio`, `isMeaningfulTextExposure`, `LessonExposureSignals`, `AudioExposureInput`, `TextExposureInput`, `LessonReadiness` all defined.
  - Only consumer is `src/__tests__/lessonReadiness.test.ts`; zero production importers (grep for `lessonReadiness`/symbols returns nothing outside the test).
  - `lessonOverviewStatus.ts:1-12` comment states "source-progress signals retired" in retirement #6 — this module computed those signals.
- **Recommendation:** Delete `lessonReadiness.ts` and the matching test. None of the exported symbols feed into the current `learner_lesson_activation`/capability flow.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-2: `lessonService.getLessons()` and `getLessonsWithVoice()` are unused

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/services/lessonService.ts:178-187` — `getLessons()` no callers (only `src/__tests__/lessonService.test.ts:48` invokes it).
  - `src/services/lessonService.ts:218-226` — `getLessonsWithVoice()` has zero callers anywhere (no tests either).
- **Recommendation:** Delete both methods. The overview-page now uses `getLessonsOverview` RPC; per-lesson reads use `getLesson(id)`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-3: `listActivatedLessons` exported but never imported in production

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/lib/lessons/activation.ts:36-47` — `listActivatedLessons(userId, client)` defined and tested (`__tests__/activation.test.ts:52-58`).
  - No production caller — only the test file references it. `isLessonActivated` and `setLessonActivated` are wired into `ActivationGate.tsx`/`PracticeActions.tsx`, but the set-listing variant is orphaned.
- **Recommendation:** Either delete `listActivatedLessons` or wire it into the Lessons overview hook (currently reads activation via the `get_lessons_overview` RPC's `has_started_lesson` projection, which subsumes this).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-4: Two distinct `LessonOverviewRow` types share the same name

- **Severity:** cleanup
- **Category:** type-hole
- **Evidence:**
  - `src/services/lessonService.ts:160-175` — DB row shape (snake_case: `lesson_id`, `order_index`, `lesson_sections`, `has_page_blocks`, `ready_capability_count`…).
  - `src/lib/lessons/lessonOverviewModel.ts:41-50` — UI model shape (camelCase: `lessonId`, `orderIndex`, `status`, `actionLabel`, `href`, `grammarTopicTag`, `isPrepared`).
  - Both exported, both named `LessonOverviewRow`. Both are imported in `pages/Lessons.tsx` (lines 28 and 33-39); there is no compile error only because callers happen to import the right one by path.
- **Recommendation:** Rename one. Suggested: `LessonOverviewRow` → `LessonsOverviewDbRow` in `lessonService.ts` (it mirrors the RPC return shape), keep the UI model name in `lessonOverviewModel.ts`.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F5-5: `ItemContextGrammarPattern` defined twice with incompatible shapes

- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `src/types/learning.ts:269-275` — `{ id, context_id, grammar_pattern_id, is_primary, created_at }`.
  - `src/services/learningItemService.ts:6-10` — `{ context_id, grammar_pattern_id, pattern_name? }` (different fields, no `id`/`is_primary`/`created_at`, has optional `pattern_name`).
  - `learningItemService.ts:94-102` uses its local re-declaration.
- **Recommendation:** Pick one. The service variant is only ever populated with `(context_id, grammar_pattern_id)` from the select (`.select('context_id, grammar_pattern_id')`) — collapse to the service-local subset or import from `types/learning` and accept the wider shape.
- **Estimated effort:** trivial
- **Cross-slice dependency:** agent 1 (owns learningItemService)

### F5-6: `i18n.ts` has substantial dead-key residue across `lessons`, `practice`, `session.feedback`, `session.summary`, `session.cloze`, `session.recall`, `leaderboard`, `lessons.lessonComplete*`

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/lib/i18n.ts:124-130` — `vocabulary`, `noVocabulary`, `practiceThisLesson` (no `T.lessons.vocabulary` callers; verified `grep ".lessons." src/components src/pages`).
  - `src/lib/i18n.ts:100-122` — `section`, `of`, `previous`, `nextSection`, `finishLesson`, `completed`, `lessonComplete`, `lessonCompleteMessage`, `failedToLoad`, `dutch`, `indonesian`, `phonetic`, `rule`, `example`, `examples`, `spelling`, `simpleSentences`, `sections`, `lessonsCount`, `learn` all unused.
  - `src/lib/i18n.ts:174-186` — `T.leaderboard.level` unused (Leaderboard.tsx never reads it; only `rank/user/value/timeSpent/lessons/words/consistency/hours/days/anonymous/noEntries/failedToLoad/title` are referenced).
  - `src/lib/i18n.ts:199-213` — entire `practice` namespace (`title`, `noVocabulary`, `noVocabularyMsg`, `translateToEnglish`, …) — `grep ".practice." src/components src/pages` returns nothing.
  - `src/lib/i18n.ts:234-242` — `T.session.feedback.yourAnswer`, `theWord`, `example`, `continue` unused (callers only use `correct`, `incorrect`, `almostCorrect`, `check`).
  - `src/lib/i18n.ts:264-275` — entire `T.session.summary` namespace unused.
  - `src/lib/i18n.ts:215-219` — `T.session.title`, `exerciseOf`, `of`, `correct`, `failedToLoadSession`, `noExercises` unused.
- **Recommendation:** Sweep — the `Translations = typeof nl` (i18n.ts:554) shape causes every NL key to require a parallel EN key, so dead keys cost double. Removing them will shrink the file ~30%.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F5-7: `audioService` silently drops RPC errors, no `logError` call

- **Severity:** nice-to-have
- **Category:** error-handling
- **Evidence:**
  - `src/services/audioService.ts:47-63` and `:69-77` — both paths do `if (!error && data)` then continue. On RPC failure, the map is returned empty/partial with no logging.
  - Per CLAUDE.md error-handling rules: "Never `console.error` as the only error handling — always surface it to the user" / "Always log the technical detail even when showing a friendly message."
  - Caller in `Session.tsx:131` wraps the *outer* try/catch around `resolveCapabilityBlocks` + `fetchSessionAudioMap` together — but a *partial* audio-map fetch with a Kong 500 won't reach that catch (no error is thrown).
- **Recommendation:** Add `logError({ page: 'session', action: 'audioService:get_audio_clips', error })` (or similar) inside the `if (error)` branches. UX is fine staying degraded silently, but the error log is currently lost.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-8: `logger.ts` awaits `supabase.auth.getUser()` — fire-and-forget contract is partially broken

- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/lib/logger.ts:18-25` — comment says "Fire-and-forget — never throws" but the function `await`s `supabase.auth.getUser()` before issuing the insert. A slow auth refresh blocks the caller; an exception is swallowed by the `try/catch` only because it wraps just the `await`.
  - Callers like `ExperiencePlayer.tsx:135` invoke `logError(...)` without `await` and rely on it not blocking — but `await supabase.auth.getUser()` *can* block on a token refresh.
- **Recommendation:** Either (a) read user via `getAccessTokenSync()` (already exported from `supabase.ts:23`) plus a cached `userId`; or (b) keep `getUser()` but use `.then(...)` chain instead of `await` so the function returns synchronously.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-9: `learnerProgressService.getLastPracticeAgeDays` is the only RPC-bypass; uses raw table read

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/services/learnerProgressService.ts:235-254` — directly reads `learning_sessions` table with `.select('started_at').order().limit(1).maybeSingle()`.
  - Every other method in the file routes through a SQL function (`get_lapsing_count`, `get_lapse_prevention`, `get_review_latency_stats`, etc.). The file's header comment (line 9-11) says "the service hides predicate parity with the session engine, transitive-closure source-progress satisfaction, slug-based joins, and timezone-correct day bucketing behind a typed TS interface."
  - Day bucketing is done client-side in `calendarDayAgeIn` (line 130-143). A `get_last_practice_age_days(p_user_id, p_timezone)` RPC would keep the contract uniform.
- **Recommendation:** Add an RPC; mirrors the existing `get_current_streak_days(p_user_id, p_timezone)` pattern. Caller signature stays the same.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F5-10: `progressService` is a 1:1 façade over `learnerProgressService` — collapse candidate

- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `src/services/progressService.ts:14-70` — `getAccuracyBySkillType`, `getLapsePrevention`, `getVulnerableItems`, `getAvgLatencyMs` are all thin wrappers around `learnerProgressService` calls.
  - `progressService.ts:8-11` header comment acknowledges the redundancy: "progressService stays as a façade so the existing useProgressData hook contract doesn't need to change in this PR; once the hook itself is refactored a future cleanup can collapse the indirection."
  - The only non-façade method is `markLessonComplete` (line 15-26), which writes to `lesson_progress`.
- **Recommendation:** Move `markLessonComplete` to `lessonService` (already owns `lesson_progress` reads via `getUserLessonProgress` at line 287), delete `progressService.ts`, update `useProgressData.ts` (line 8) to call `learnerProgressService`/`lessonService` directly.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F5-11: `lib/lessons/` lacks a barrel; callers do six different deep imports

- **Severity:** nice-to-have
- **Category:** architecture-violation
- **Subtype:** bypassed-barrel
- **Evidence:**
  - `src/components/lessons/PracticeActions.tsx:6-8`, `LessonReader.tsx:7-8`, `ActivationGate.tsx:5`, `pages/Lesson.tsx:20-22`, `pages/Lessons.tsx:33-39`, `lib/preview/localPreviewContent.ts:2-3` all deep-import individual files.
  - `src/lib/distractors/index.ts` already establishes the barrel pattern for sibling modules.
- **Recommendation:** Add `src/lib/lessons/index.ts` exporting `buildLessonExperience`, `buildLessonPracticeActions`, `buildLessonOverviewModel`, `buildLessonOverviewSignals`, `decideLessonOverviewStatus`, activation helpers, plus the relevant types. Update callers in a follow-up.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F5-12: `src/lib/semanticGroups.ts` is a re-export shim with one residual test caller

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/lib/semanticGroups.ts:1-6` — comment says "kept until the q3 cleanup". Production code already imports from `@/lib/distractors`.
  - Only remaining caller is `src/__tests__/semanticGroups.test.ts:2` (grep confirmed).
- **Recommendation:** Update the test to import from `@/lib/distractors`, then delete the shim.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-13: `lessonExperience.ts` carries legacy 5-value `block_kind` fallback that was supposed to retire

- **Severity:** nice-to-have
- **Category:** half-finished-migration
- **Evidence:**
  - `src/services/lessonService.ts:36-53` — `LessonPageBlock['block_kind']` union still includes legacy `'hero' | 'section' | 'exposure' | 'recap'` plus the canonical 7 values, comment at line 46-48 says "Legacy 5-value enum (lessons authored before commit 4 backfill) … until the lessons fold PR retires the function entirely."
  - `src/lib/lessons/lessonExperience.ts:40-71` — `blockKindFromPipeline` carries the fallback logic.
  - `src/lib/preview/localPreviewContent.ts:73, 96, 117, 138, 161, 217, 230, 264` — *all* preview blocks use legacy values (`'hero'`, `'section'`, `'exposure'`, `'recap'`). So as long as the local-preview surface lives, the fallback can't retire — but the local-preview surface is itself gated behind a disabled-by-default flag (`capabilityMigrationFlags.localContentPreview` in `featureFlags.ts:73`).
- **Recommendation:** Update the preview content to use canonical 7-value `block_kind` so the legacy fallback in `lessonExperience.ts:56-70` can be deleted. The preview's own type annotations would tighten too.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F5-14: `Lesson.module_id` is `string` but never read; `dialogue_voices` always `null`

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/services/lessonService.ts:8` — `module_id: string` required.
  - No reader in production code (grep `module_id` returns only the type def and a test fixture; schema has it).
  - `src/services/lessonService.ts:20` — `dialogue_voices: Record<string, string> | null`. No production reader.
- **Recommendation:** Either drop both from the TS type (the SELECT `*` will still return them; no behavioural change) or add `// retained for future use` comments. Currently silently coupled to schema.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-15: `chunkedQuery.ts` casts the builder to `any`

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/lib/chunkedQuery.ts:31, 39` — `queryFn?: (builder: any) => any` and `let builder = (sb.schema('indonesian').from(table) as any).select('*')…`.
  - `SchemaClient` (line 9-14) types `from` as `unknown` — defeats the purpose.
- **Recommendation:** Use Supabase's `PostgrestFilterBuilder` generic; or constrain `T` and use `SupabaseClient<Database, 'indonesian'>` from the project's typed client (referenced by `learnerProgressService.ts:118-126` as `SchemaClient`).
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F5-16: `learningItemService.getGrammarPatternsByItem` reimplements `chunkedIn` inline

- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `src/services/learningItemService.ts:114-140` — explicit `const CHUNK_SIZE = 50` + manual `for (i; i+=CHUNK_SIZE)` loop. The file already imports `chunkedIn` (line 3) and uses it five other times.
  - `chunkedIn` accepts a `queryFn` callback that could compose the nested select.
- **Recommendation:** Refactor to use `chunkedIn` (the only blocker is the nested-resource select; pass it via `queryFn`).
- **Estimated effort:** small
- **Cross-slice dependency:** agent 1 (owns this file)

### F5-17: `chunkedQuery.ts` hardcodes `'indonesian'` schema; not configurable

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/lib/chunkedQuery.ts:39` — `sb.schema('indonesian').from(table)`.
  - Most callers already passed in a client (`client?: SchemaClient`) intending schema flexibility, but the helper forces `'indonesian'`. The `SchemaClient` type even hides the schema literal behind `any`.
- **Recommendation:** Either (a) accept the constraint and document it (this app only has one schema), or (b) add a `schema?: string` parameter. Given the project rule "All Supabase queries use `.schema('indonesian')` — never query the public schema directly" (CLAUDE.md), (a) is defensible.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-18: `learnerProgressService.SchemaClient` is loosely typed; `rpc` returns `any`

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/services/learnerProgressService.ts:118-126` — `SchemaClient.schema(name).rpc(fn, args): any`.
  - `rpc<T>(rpcName, methodName, args)` (line 150-156) does `data as T` — caller-supplied generic with no runtime guard. If the RPC return shape drifts (e.g. column rename), every method silently returns `undefined` props.
- **Recommendation:** Add a thin `z.infer` (or hand-rolled) validation in dev mode, or at least narrow the cast through the row interfaces declared at lines 75-114.
- **Estimated effort:** medium
- **Cross-slice dependency:** null

### F5-19: `featureFlags.ts:80-105` `isExerciseTypeEnabled` is exported but never called

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/lib/featureFlags.ts:80-105` — defined.
  - Grep `isExerciseTypeEnabled` returns only the definition; no production caller.
  - Same for `isContentPipelineEnabled` (line 110-112), `isTextbookImportEnabled` (114-116), `isAiGenerationEnabled` (118-120) — no callers.
- **Recommendation:** Delete these helpers and the corresponding flags from `featureFlags` (textbookImport, aiGeneration, cuedRecall, contrastPair, sentenceTransformation, constrainedTranslation, speaking, listeningMcq, dictation) unless agent 1's slice discovers usage in builders/. Cross-check before deleting.
- **Estimated effort:** small
- **Cross-slice dependency:** agent 1, agent 6 (exercise builders / registry)

### F5-20: `capabilityMigrationFlags` mixes migration flags with feature flags

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/lib/featureFlags.ts:20-28, 66-74` — `sessionDiagnostics`, `reviewShadow`, `reviewCompat`, `standardSession` look like leftover migration toggles from earlier capability rollouts.
  - Only `experiencePlayerV1`, `lessonReaderV2`, `localContentPreview` are referenced in production code (`pages/Lesson.tsx`, `pages/LocalPreview.tsx`, `__tests__/Lesson.test.tsx`).
  - Per CLAUDE.md Session.tsx:110 "always invokes `loadCapabilitySessionPlanForUser({ enabled: true, ... })`" — so `standardSession` is dead.
- **Recommendation:** Audit `sessionDiagnostics`, `reviewShadow`, `reviewCompat`, `standardSession` — if not referenced, delete. Likely all four are leftover from a migration that has shipped.
- **Estimated effort:** small
- **Cross-slice dependency:** agent 1

### F5-21: `SessionQueueItem` type is dead

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/types/learning.ts:247-252` — defined.
  - Grep `SessionQueueItem` returns only the type definition. Per CLAUDE.md "Legacy `buildSessionQueue` was retired in retirement #7" — this type is leftover from that.
- **Recommendation:** Delete.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-22: `contentFlagService.mapRow` re-implements snake→camel mapping inline; no shared helper

- **Severity:** nice-to-have
- **Category:** duplication
- **Evidence:**
  - `src/services/contentFlagService.ts:14-28` — `mapRow` casts every field.
  - `src/services/exerciseReviewService.ts:4-` (agent 1) has `mapComment` doing the same pattern.
  - `learnerProgressService.ts:207-215` has another snake→camel mapping.
- **Recommendation:** Either (a) accept per-file mappers as the project pattern (currently it is) or (b) extract a `snakeToCamel<T>(row)` helper. (a) is fine — flagging mainly so reviewers know the duplication is conscious.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-23: `STRUCTURALLY_SIMILAR_TYPES`, `optionComponents`, `sharesMeaningfulWord` only used internally

- **Severity:** nice-to-have
- **Category:** dead-code
- **Evidence:**
  - `src/lib/distractors/index.ts:8-9` — both barrelled.
  - `STRUCTURALLY_SIMILAR_TYPES` only consumed at `src/lib/distractors/cascade.ts:51`.
  - `optionComponents`/`sharesMeaningfulWord` only consumed at `cascade.ts:64`.
- **Recommendation:** Drop these three from the public barrel; they're internal implementation details of `pickDistractorCascade`. Reduces module surface.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-24: `i18n.ts` `Translations = typeof nl` shape blocks key divergence — but `T.session.feedback.tryAgain` is referenced where it doesn't exist (uses `T.session.exercise.tryAgain` instead)

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/components/exercises/SentenceTransformationExercise.tsx:157` — `t.session.exercise.tryAgain` (under `session.exercise`).
  - `src/lib/i18n.ts:251` — `tryAgain` declared under `session.exercise`.
  - Other "feedback" labels (`correct`, `incorrect`, `almostCorrect`, `check`) live under `session.feedback`. The grouping is inconsistent: `tryAgain` is a feedback string but lives in the `exercise` (prompt-text) group.
- **Recommendation:** Move `tryAgain` to `session.feedback`. (No bug; just inconsistent grouping.)
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-25: `lessonOverviewModel.normalizeSignalsForLessons` runs the same map twice (`buildLessonOverviewModel` -> normalize via `buildLessonOverviewSignals` -> normalize again)

- **Severity:** nice-to-have
- **Category:** inefficiency
- **Evidence:**
  - `src/lib/lessons/lessonOverviewModel.ts:124-138` — `buildLessonOverviewSignals` ends with `return normalizeSignalsForLessons(input.lessons, signals)`.
  - `src/lib/lessons/lessonOverviewModel.ts:147-180` — `buildLessonOverviewModel` calls `normalizeSignalsForLessons(lessons, input.signals)` again on input already returned from `buildLessonOverviewSignals`.
  - Cost is O(N) per pass — small N, but the double-normalize is hidden contract: the caller in `pages/Lessons.tsx` doesn't know it's redundant.
- **Recommendation:** Tag input as "already normalized" or accept that `buildLessonOverviewModel` is the entry point and skip the first normalize in `buildLessonOverviewSignals`. Alternatively, document the idempotency claim.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F5-26: `lessonService.getLessons` uses `.select('*, lesson_sections(*)')` — when a section join fails (e.g. RLS), the entire lessons read fails

- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/services/lessonService.ts:181-187` — single SELECT with nested resource.
  - Today this is academic because `getLessons()` has no callers (see F5-2). But `getLesson(id)` on line 189-199 uses the same pattern and is heavily called (`pages/Session.tsx:42`, `pages/Lesson.tsx:69`, `components/lessons/PracticeActions.tsx:24`). On a partial RLS regression, the whole lesson read 500s.
- **Recommendation:** Once F5-2 is resolved, audit `getLesson(id)` similarly — possibly fetch sections in a second call and tolerate partial sections.
- **Estimated effort:** small
- **Cross-slice dependency:** null

## Open questions for orchestrator

1. **Agent 1 (capability slice) overlap on `learnerStateService`, `learningItemService`** — F5-5 (duplicate `ItemContextGrammarPattern`) and F5-16 (N+1 in `getGrammarPatternsByItem`) touch those files. I left them flagged but not changed; please route them to agent 1's findings list to avoid double-counting.
2. **Agent 6 (exercise builders / registry) overlap on feature flags** — F5-19/F5-20 depend on whether `isExerciseTypeEnabled` is referenced from exercise registry code. Please cross-check.
3. **Cookie domain `.duin.home` hardcoded in `supabase.ts:12`** — flagged in CLAUDE.md as the intentional SSO seam, not a finding. Mentioned here so it isn't re-raised.

## Coverage notes

- Owned-file scope verified: no missing `.schema('indonesian')` on any Supabase query in my files.
- No runtime reads of the `vocabulary` table found anywhere in my slice (audioService/lessonService/podcastService/etc. all hit the capability-stage projection or RPC endpoints).
- No `console.error` as sole error-handler in my slice (logger.ts:37 is a logger-failure fallback; that's correct).
- N+1 pattern scan: no `for/forEach + await supabase.from(...)` in services I own. The closest case (`learningItemService.getGrammarPatternsByItem`) is agent 1's; flagged in F5-16.
- `chunkedIn` is used in 6 sites; all six pass an `ids` array that could exceed Kong's URL length — usage is appropriate.
- `logger.ts` invariant ("never throws or blocks the UI") is partially broken by the `await getUser()` — see F5-8.
- i18n: NL/EN key counts equal at 251 (verified via Python script counting `^\s+[id]:\s` patterns); no missing translations. Many keys are dead though — see F5-6.
