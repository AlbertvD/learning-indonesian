# Lessons Overview And Lesson Practice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the agreed lessons overview, lesson readiness, and lesson-specific practice/review flow from `2026-04-29-lessons-overview-and-lesson-practice-spec.md`.

**Architecture:** Keep Today as the global guided path and make lessons a side path that prepares and focuses practice. Add pure lesson-status/readiness modules first, then wire service adapters and UI. Lesson-specific practice/review must use the capability session path where possible and remain selected-lesson only, FSRS-writing, profile-size capped, and cleanly underfilled.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Mantine, Supabase service adapters, existing capability/session/source-progress modules.

---

## Task 1: Add Lesson Status And Recommendation Domain Module

**Files:**
- Create: `src/lib/lessons/lessonOverviewStatus.ts`
- Test: `src/__tests__/lessonOverviewStatus.test.ts`

**Step 1: Write failing tests**

Cover:

- status values: `not_started`, `in_progress`, `ready_to_practice`, `in_practice`, `practiced`, `later`;
- overview actions: `Open lesson` for not started, ready, practiced, later; `Continue` for in progress and in practice;
- recommendation priority prefers in-progress not-ready lesson over next not-started lesson;
- recommendation priority selects the earliest ready-to-practice or in-practice non-practiced lesson before the next not-started lesson;
- practiced lessons usually yield to the next not-started lesson;
- later lessons are openable but not practice-forward;
- later lessons are only recommended when earlier lessons are satisfied;
- zero eligible introduced items must not display as `practiced`;
- ready counts inform status and lesson-page practice actions, but are not shown on overview rows;
- grammar tags show at most two topics and then `+1 more`.
- new learners get Lesson 1 as the recommendation without an empty stats message.

Run:

```bash
npm run test -- src/__tests__/lessonOverviewStatus.test.ts
```

Expected: FAIL because the module does not exist.

**Step 2: Implement the pure module**

Export:

```ts
export type LessonOverviewStatus =
  | 'not_started'
  | 'in_progress'
  | 'ready_to_practice'
  | 'in_practice'
  | 'practiced'
  | 'later'

export interface LessonOverviewSignal {
  lessonId: string
  orderIndex: number
  hasMeaningfulExposure: boolean
  readyItemCount: number
  practicedEligibleItemCount: number
  eligibleIntroducedItemCount: number
  hasAuthoredEligiblePracticeContent: boolean
  hasStartedLesson: boolean
  earlierLessonsSatisfied: boolean
}

export interface LessonGrammarTopic {
  lessonId: string
  label: string
}

export function decideLessonOverviewStatus(signal: LessonOverviewSignal): LessonOverviewStatus
export function overviewActionLabel(status: LessonOverviewStatus): 'Open lesson' | 'Continue'
export function formatGrammarTopicTag(topics: LessonGrammarTopic[], lessonId: string): string | null
export function recommendLesson(signals: LessonOverviewSignal[]): string | null
```

Rules:

- `later` wins when `earlierLessonsSatisfied === false`;
- `ready_to_practice` requires meaningful exposure and `readyItemCount > 0` and no practice yet;
- `in_practice` requires some, but not all, eligible introduced items practiced;
- `practiced` requires `eligibleIntroducedItemCount > 0` and every currently eligible introduced item to have one FSRS-writing attempt;
- `in_progress` means started/exposed but not practice-ready;
- `not_started` means no meaningful exposure and not later.
- use `hasAuthoredEligiblePracticeContent` to distinguish lessons that truly have no practice material from lessons whose authored material is not eligible yet;
- an earlier lesson is satisfied when it is `practiced`, or when it has meaningful exposure and `hasAuthoredEligiblePracticeContent === false`.
- lessons with zero eligible introduced items can satisfy recommendation gating through meaningful exposure plus no authored eligible practice content, but they should not appear as `practiced`.

**Step 3: Verify**

Run:

```bash
npm run test -- src/__tests__/lessonOverviewStatus.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/lessons/lessonOverviewStatus.ts src/__tests__/lessonOverviewStatus.test.ts
git commit -m "Add lesson overview status model"
```

## Task 2: Add Lesson Exposure And Readiness Rules

**Files:**
- Create: `src/lib/lessons/lessonReadiness.ts`
- Test: `src/__tests__/lessonReadiness.test.ts`

**Step 1: Write failing tests**

Cover:

- grammar audio under 5 minutes requires completion;
- grammar audio 5 minutes or longer requires at least 60 percent playback and at least 5 listened minutes;
- 45 seconds does not satisfy long grammar audio exposure;
- grammar text exposure satisfies grammar readiness;
- short dialogue audio requires completion once;
- longer dialogue audio uses 60 percent playback with no 5-minute minimum;
- dialogue text exposure satisfies words/sentences after about 2 minutes or meaningful section viewing;
- grammar exposure unlocks words/sentences only when dialogue is absent;
- culture and pronunciation do not gate readiness.

Run:

```bash
npm run test -- src/__tests__/lessonReadiness.test.ts
```

Expected: FAIL because the module does not exist.

**Step 2: Implement the pure module**

Export:

```ts
export interface AudioExposureInput {
  durationSeconds: number
  playedSeconds: number
  completed: boolean
}

export interface TextExposureInput {
  visibleSeconds: number
  meaningfulScroll: boolean
}

export interface LessonExposureSignals {
  hasDialogue: boolean
  grammarAudio?: AudioExposureInput
  grammarText?: TextExposureInput
  dialogueAudio?: AudioExposureInput
  dialogueText?: TextExposureInput
}

export interface LessonReadiness {
  grammarReady: boolean
  wordsAndSentencesReady: boolean
  meaningfulExposure: boolean
}

export function isMeaningfulGrammarAudio(input: AudioExposureInput): boolean
export function isMeaningfulDialogueAudio(input: AudioExposureInput): boolean
export function isMeaningfulTextExposure(input: TextExposureInput): boolean
export function decideLessonReadiness(input: LessonExposureSignals): LessonReadiness
```

Keep grammar text and dialogue text semantics explicit: grammar text needs meaningful exposure of the grammar explanation block; dialogue text needs about 2 minutes in the dialogue section or meaningful dialogue-section viewing.

Keep this module independent from Supabase and React.

**Step 3: Verify**

Run:

```bash
npm run test -- src/__tests__/lessonReadiness.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/lessons/lessonReadiness.ts src/__tests__/lessonReadiness.test.ts
git commit -m "Add lesson exposure readiness rules"
```

## Task 3: Add Source-Progress Adapter For Lesson Exposure

**Files:**
- Modify: `src/services/sourceProgressService.ts`
- Create: `src/lib/lessons/lessonExposureProgress.ts`
- Test: `src/__tests__/lessonExposureProgress.test.ts`
- Test: `src/__tests__/sourceProgressService.test.ts`

**Step 1: Write failing tests**

Cover:

- grammar audio threshold records `heard_once` on a grammar-audio section ref with metadata `{ exposureKind: 'grammar_audio' }`;
- grammar text threshold records `intro_completed` with metadata `{ exposureKind: 'grammar_text' }`;
- dialogue audio threshold records `heard_once` with metadata `{ exposureKind: 'dialogue_audio' }`;
- dialogue text threshold records `section_exposed` with metadata `{ exposureKind: 'dialogue_text' }`;
- repeated threshold events are idempotent for the same user/source/section/event kind;
- opening or reading a later lesson records source progress only for that later lesson;
- no new database event type is required.

Run:

```bash
npm run test -- src/__tests__/lessonExposureProgress.test.ts src/__tests__/sourceProgressService.test.ts
```

Expected: FAIL because the adapter does not exist.

**Step 2: Implement the adapter**

Create a pure helper that converts exposure threshold decisions into `SourceProgressEventInput`.

Export:

```ts
export type LessonExposureKind =
  | 'grammar_audio'
  | 'grammar_text'
  | 'dialogue_audio'
  | 'dialogue_text'

export interface LessonExposureProgressInput {
  userId: string
  lessonId: string
  sourceRef: string
  sourceSectionRef: string
  exposureKind: LessonExposureKind
  occurredAt: string
  metadata?: Record<string, unknown>
}

export function sourceProgressEventForLessonExposure(input: LessonExposureProgressInput): SourceProgressEventInput
```

Mapping:

- `grammar_audio` -> `heard_once`;
- `grammar_text` -> `intro_completed`;
- `dialogue_audio` -> `heard_once`;
- `dialogue_text` -> `section_exposed`.

Use stable idempotency keys:

```text
lesson-exposure:{userId}:{sourceRef}:{sourceSectionRef}:{exposureKind}
```

Do not add a migration for new source progress event types in this task.

**Step 3: Verify**

Run:

```bash
npm run test -- src/__tests__/lessonExposureProgress.test.ts src/__tests__/sourceProgressService.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/lessons/lessonExposureProgress.ts src/services/sourceProgressService.ts src/__tests__/lessonExposureProgress.test.ts src/__tests__/sourceProgressService.test.ts
git commit -m "Add lesson exposure progress adapter"
```

## Task 4: Add Lessons Overview Data Composition

**Files:**
- Modify: `src/services/lessonService.ts`
- Create: `src/lib/lessons/lessonOverviewModel.ts`
- Test: `src/__tests__/lessonOverviewModel.test.ts`
- Test: `src/__tests__/lessonService.test.ts`

**Step 1: Write failing tests**

Cover:

- overview model combines lessons, source progress, capability state/review counts, and grammar topics;
- overview rows remain sorted by `order_index`;
- recommended lesson duplicates in the list;
- missing progress data falls back to openable rows;
- new-user state recommends Lesson 1 without empty stats copy;
- lessons with meaningful exposure and no authored eligible practice content can satisfy earlier-lesson recommendation gating;
- culture/pronunciation-only exposure does not produce meaningful lesson exposure for status or recommendation;
- only published lessons are included;
- grammar topic tag is omitted when no metadata exists.

Run:

```bash
npm run test -- src/__tests__/lessonOverviewModel.test.ts src/__tests__/lessonService.test.ts
```

Expected: FAIL because the model does not exist.

**Step 2: Implement pure composition model**

Export:

```ts
export interface LessonOverviewRow {
  lessonId: string
  orderIndex: number
  title: string
  status: LessonOverviewStatus
  actionLabel: 'Open lesson' | 'Continue'
  href: string
  grammarTopicTag: string | null
}

export interface LessonOverviewModel {
  recommendedLessonId: string | null
  recommendedRow: LessonOverviewRow | null
  rows: LessonOverviewRow[]
}

export function buildLessonOverviewModel(input: {
  lessons: Array<{ id: string; title: string; order_index: number }>
  signals: LessonOverviewSignal[]
  grammarTopics: LessonGrammarTopic[]
}): LessonOverviewModel
```

Keep data loading outside this pure model. Add service methods only for efficient reads needed by the page, such as all lesson source refs and all learner source progress for those refs. Task 4 should consume explicit signal inputs and mocked service data; do not bake temporary exposure placeholders into the overview status model.

**Step 3: Verify**

Run:

```bash
npm run test -- src/__tests__/lessonOverviewModel.test.ts src/__tests__/lessonService.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/lessons/lessonOverviewModel.ts src/services/lessonService.ts src/__tests__/lessonOverviewModel.test.ts src/__tests__/lessonService.test.ts
git commit -m "Compose lessons overview model"
```

## Task 5: Rebuild Lessons Overview UI

**Files:**
- Modify: `src/pages/Lessons.tsx`
- Modify: `src/pages/Lessons.module.css`
- Modify: `src/lib/i18n.ts`
- Test: `src/__tests__/Lessons.test.tsx`

**Step 1: Write failing UI tests**

Cover:

- top recommended card appears;
- ordered list still includes the recommended lesson;
- each row shows title, status, action, and grammar tag when present;
- overview does not render progress bars;
- overview does not render direct `Practice` buttons;
- overview does not render ready item counts;
- overview does not render estimated lesson time;
- overview does not render learner-visible admin/content-health signals;
- `Later` row uses `Open lesson`;
- `In progress` row uses `Continue`;
- first-time learners see Lesson 1 recommended, not an empty stats message;
- failure to refresh progress still renders openable lessons.

Run:

```bash
npm run test -- src/__tests__/Lessons.test.tsx
```

Expected: FAIL because current page renders progress bars and direct practice cards.

**Step 2: Implement UI**

Use the overview model from Task 4.

Design rules:

- one recommended lesson section at top;
- compact ordered lesson list below;
- no nested cards;
- no progress bars;
- no search/filter;
- no course-progress summary;
- no estimated lesson time;
- no culture/audio/pronunciation metadata;
- no learner-visible admin/content-health signals;
- grammar tag only.

Use learner-facing copy:

```text
Recommended lesson
Start or continue this lesson to meet new words and patterns.
Lesson progress could not be refreshed.
```

For first-time learners, the recommended card uses:

```text
Start with Lesson 1
Listen to the explanation and read the first examples to prepare your first practice.
```

Add Dutch and English i18n keys for all status/action labels.

**Step 3: Verify**

Run:

```bash
npm run test -- src/__tests__/Lessons.test.tsx
npm run build
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/pages/Lessons.tsx src/pages/Lessons.module.css src/lib/i18n.ts src/__tests__/Lessons.test.tsx
git commit -m "Rebuild lessons overview"
```

## Task 6: Wire Lesson Page Exposure Tracking

**Files:**
- Modify: `src/pages/Lesson.tsx`
- Modify: `src/components/lessons/LessonReader.tsx`
- Modify: `src/components/lessons/blocks/LessonBlockRenderer.tsx`
- Test: `src/__tests__/LessonReader.test.tsx`
- Test: `src/__tests__/Lesson.test.tsx`

**Step 1: Write failing tests**

Cover:

- grammar audio below threshold does not record readiness progress;
- grammar audio at threshold records source progress once;
- dialogue audio uses 60 percent playback without 5-minute minimum;
- grammar text exposure records progress;
- dialogue text exposure records progress;
- authored grammar audio/text, dialogue, vocabulary, sentences/examples, culture, and pronunciation notes render when present;
- culture and pronunciation blocks do not affect readiness;
- practice-ready transition shows subtle toast copy `Lesson 4 is ready to practice.`

Run:

```bash
npm run test -- src/__tests__/LessonReader.test.tsx src/__tests__/Lesson.test.tsx
```

Expected: FAIL because current reader records simple block progress only.

**Step 2: Implement exposure tracking**

Use the pure readiness module and exposure-progress adapter.

Implementation notes:

- track audio duration and played seconds per grammar/dialogue block;
- call the adapter only when thresholds are crossed;
- keep events idempotent;
- keep lesson-page interactions as source progress only;
- do not write FSRS review state from the lesson page.

**Step 3: Add practice-ready UI**

When readiness and ready count indicate practice is available:

- surface the ready state needed for `Practice this lesson · N ready`;
- keep it visible but not interruptive;
- show near the companion/top area and near the end of the lesson if layout allows;
- on mobile, prefer one clear bottom/end action over a crowded sticky control.

Before Tasks 8 and 9 are complete, this state may be display-only or hidden behind the existing lesson page action area. Do not expose a clickable lesson-practice action that bypasses the lesson action model or lesson-session routing. The final clickable practice/review actions are completed in Tasks 8 and 9.

**Step 4: Verify**

Run:

```bash
npm run test -- src/__tests__/LessonReader.test.tsx src/__tests__/Lesson.test.tsx
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/pages/Lesson.tsx src/components/lessons src/lib/i18n.ts src/__tests__/LessonReader.test.tsx src/__tests__/Lesson.test.tsx
git commit -m "Track lesson exposure and readiness"
```

## Task 7: Add Lesson-Scoped Capability Session Modes

**Files:**
- Modify: `src/lib/pedagogy/loadBudgets.ts`
- Modify: `src/lib/pedagogy/pedagogyPlanner.ts`
- Modify: `src/lib/session/capabilitySessionLoader.ts`
- Modify: `src/services/capabilitySessionDataService.ts`
- Modify: `src/lib/session/sessionComposer.ts`
- Test: `src/__tests__/loadBudgets.test.ts`
- Test: `src/__tests__/pedagogyPlanner.test.ts`
- Test: `src/__tests__/capabilitySessionLoader.test.ts`
- Test: `src/__tests__/capabilitySessionDataService.test.ts`
- Test: `src/__tests__/sessionComposer.test.ts`

**Step 1: Write failing tests**

Cover:

- `lesson_practice` filters due, active, and new candidates to the selected lesson only;
- `lesson_practice` includes candidates from every source ref that belongs to the selected lesson;
- `lesson_practice` can include not-yet-due active capabilities from the selected lesson after due/fragile and new eligible candidates;
- `lesson_practice` respects preferred session size;
- `lesson_practice` underfills cleanly;
- `lesson_practice` preserves direction balance where possible;
- `lesson_review` includes only active/practiced selected-lesson capabilities;
- `lesson_review` never introduces new capabilities;
- neither mode pulls from other lessons;
- lesson modes fail closed when `selectedLessonId` is missing;
- both modes continue to use the normal Review Processor / FSRS-writing attempt path.

Run:

```bash
npm run test -- src/__tests__/loadBudgets.test.ts src/__tests__/pedagogyPlanner.test.ts src/__tests__/capabilitySessionLoader.test.ts src/__tests__/capabilitySessionDataService.test.ts src/__tests__/sessionComposer.test.ts
```

Expected: FAIL because the session path only accepts `standard` capability sessions today.

**Step 2: Extend types**

Add planner/session modes:

```ts
lesson_practice
lesson_review
```

Add selected lesson scope input:

```ts
selectedLessonId?: string
selectedSourceRefs?: string[]
```

Use `selectedLessonId` as the canonical lesson filter. `selectedSourceRefs` is derived from the lesson and can contain multiple source refs; it is a candidate-loading optimization, not the product scope.

For `lesson_practice` and `lesson_review`, missing `selectedLessonId` should return no lesson-scoped candidates or a handled route error. It must never fall back to a global session.

**Step 3: Implement lesson-practice selection**

For `lesson_practice`, selected lesson only:

1. due or fragile active selected-lesson capabilities;
2. recently failed selected-lesson capabilities;
3. introduced but not yet practiced eligible selected-lesson capabilities;
4. under-practiced active selected-lesson capabilities;
5. light stretch selected-lesson items if budget allows.

All selected capabilities still pass readiness, prerequisites, source progress, and resolver checks.
Selections still flow through the existing review-processing path so submitted answers create normal FSRS-writing attempts.

**Step 4: Implement lesson-review selection**

For `lesson_review`, selected lesson only:

- active/practiced capabilities only;
- prioritize due/fragile;
- no new activation requests;
- clean underfill;
- normal Review Processor / FSRS-writing attempt handling.

**Step 5: Verify**

Run:

```bash
npm run test -- src/__tests__/loadBudgets.test.ts src/__tests__/pedagogyPlanner.test.ts src/__tests__/capabilitySessionLoader.test.ts src/__tests__/capabilitySessionDataService.test.ts src/__tests__/sessionComposer.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/pedagogy src/lib/session src/services/capabilitySessionDataService.ts src/__tests__/loadBudgets.test.ts src/__tests__/pedagogyPlanner.test.ts src/__tests__/capabilitySessionLoader.test.ts src/__tests__/capabilitySessionDataService.test.ts src/__tests__/sessionComposer.test.ts
git commit -m "Add lesson-scoped capability sessions"
```

## Task 8: Route Individual Lesson Actions To Lesson Sessions

**Sequencing note:** Tasks 8 and 9 are a pair. It is fine to add route parsing before the final UI logic, but do not expose clickable lesson practice/review actions to learners until the action-priority rules from Task 9 are in place.

**Files:**
- Modify: `src/pages/Lesson.tsx`
- Modify: `src/pages/Session.tsx`
- Modify: `src/lib/sessionQueue.ts` only for legacy fallback filtering
- Test: `src/__tests__/Lesson.test.tsx`
- Test: `src/__tests__/sessionFlow.test.tsx`
- Test: `src/__tests__/sessionQueue.test.ts`

**Step 1: Write failing tests**

Cover:

- `Practice this lesson` navigates to `/session?lesson=<id>&mode=lesson_practice`;
- `Review this lesson` navigates to `/session?lesson=<id>&mode=lesson_review`;
- Session parses both modes;
- capability session loader receives selected lesson scope and all source refs for that lesson;
- legacy fallback, if used, filters grammar and vocabulary to the selected lesson;
- legacy fallback, if used, fully enforces the same safety envelope: selected lesson only, source progress, prerequisites, profile session size, clean underfill, no new introductions for lesson review, and normal FSRS-writing submission;
- legacy fallback fails closed with an empty handled state or route error if it cannot enforce that safety envelope;
- browsing a `Later` lesson records source progress only for that lesson and does not add Today/global-session candidates while earlier lessons still need exposure or practice;
- overview still has no direct practice/review button.

Run:

```bash
npm run test -- src/__tests__/Lesson.test.tsx src/__tests__/sessionFlow.test.tsx src/__tests__/sessionQueue.test.ts
```

Expected: FAIL because routing does not support these modes yet.

**Step 2: Implement routing**

Update `Session.tsx` mode parsing to accept:

```ts
standard
quick
backlog_clear
lesson_practice
lesson_review
```

When capability standard/session flags are enabled, route lesson modes through the capability session loader.

**Step 3: Implement legacy fallback only if needed**

If capability sessions are disabled, keep behavior safe:

- selected lesson only;
- no cross-lesson grammar;
- source progress and prerequisite checks enforced;
- profile session size respected;
- clean underfill.
- no new introductions for `lesson_review`;
- normal FSRS-writing submission.

If the legacy path cannot enforce these rules, fail closed instead of starting an unsafe lesson session. Do not make the legacy fallback more sophisticated than needed.

**Step 4: Verify**

Run:

```bash
npm run test -- src/__tests__/Lesson.test.tsx src/__tests__/sessionFlow.test.tsx src/__tests__/sessionQueue.test.ts
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/pages/Lesson.tsx src/pages/Session.tsx src/lib/sessionQueue.ts src/__tests__/Lesson.test.tsx src/__tests__/sessionFlow.test.tsx src/__tests__/sessionQueue.test.ts
git commit -m "Route lesson practice and review sessions"
```

## Task 9: Add Lesson Review Action Logic

**Files:**
- Modify: `src/lib/lessons/lessonOverviewStatus.ts`
- Create: `src/lib/lessons/lessonActionModel.ts`
- Test: `src/__tests__/lessonActionModel.test.ts`
- Modify: `src/pages/Lesson.tsx`
- Test: `src/__tests__/Lesson.test.tsx`

**Step 1: Write failing tests**

Cover:

- before first practice, no review action;
- if unpracticed eligible content exists, practice is primary;
- if active practiced content exists and no unpracticed eligible content remains, review is primary;
- if both exist, practice is primary and review is secondary;
- ready count appears on practice action;
- review action does not show a ready-new count.

Run:

```bash
npm run test -- src/__tests__/lessonActionModel.test.ts src/__tests__/Lesson.test.tsx
```

Expected: FAIL because action model does not exist.

**Step 2: Implement pure action model**

Export:

```ts
export interface LessonPracticeActionState {
  practiceReadyCount: number
  hasActivePracticedItems: boolean
  hasUnpracticedEligibleItems: boolean
}

export interface LessonPracticeAction {
  kind: 'practice' | 'review'
  label: string
  href: string
  priority: 'primary' | 'secondary'
}

export function buildLessonPracticeActions(input: {
  lessonId: string
  state: LessonPracticeActionState
}): LessonPracticeAction[]
```

**Step 3: Wire into lesson page**

Use this model for the individual lesson page actions.

**Step 4: Verify**

Run:

```bash
npm run test -- src/__tests__/lessonActionModel.test.ts src/__tests__/Lesson.test.tsx
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/lessons/lessonActionModel.ts src/lib/lessons/lessonOverviewStatus.ts src/pages/Lesson.tsx src/__tests__/lessonActionModel.test.ts src/__tests__/Lesson.test.tsx
git commit -m "Add lesson practice action model"
```

## Task 10: Add Polish Items

**Files:**
- Modify: `src/pages/Lessons.tsx`
- Modify: `src/pages/Lesson.tsx`
- Modify: `src/lib/i18n.ts`
- Test: `src/__tests__/Lessons.test.tsx`
- Test: `src/__tests__/Lesson.test.tsx`

**Step 1: Write failing tests**

Cover:

- returning from a lesson preserves overview scroll position;
- lesson audio resume restores last known position for the same lesson audio;
- progress-refresh failure shows non-blocking copy and keeps lessons openable;
- no search/filter appears.

Run:

```bash
npm run test -- src/__tests__/Lessons.test.tsx src/__tests__/Lesson.test.tsx
```

Expected: FAIL for missing polish behavior.

**Step 2: Implement scroll restoration**

Use route/local state or session storage keyed by `/lessons`.

Keep this small and non-invasive.

**Step 3: Implement audio resume**

Store lesson audio progress per lesson/audio path in local storage. Resume only after metadata is loaded. Do not autoplay.

**Step 4: Implement fallback copy**

Use learner-facing copy:

```text
Lesson progress could not be refreshed.
```

**Step 5: Verify**

Run:

```bash
npm run test -- src/__tests__/Lessons.test.tsx src/__tests__/Lesson.test.tsx
npm run build
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/pages/Lessons.tsx src/pages/Lesson.tsx src/lib/i18n.ts src/__tests__/Lessons.test.tsx src/__tests__/Lesson.test.tsx
git commit -m "Polish lesson navigation and audio resume"
```

## Task 11: Documentation Alignment

**Files:**
- Modify: `docs/current-system/human-product-and-learning-guide.md`
- Modify: `docs/architecture/session-engine.md`
- Modify: `docs/plans/2026-04-29-lessons-overview-and-lesson-practice-spec.md` if implementation decisions changed

**Step 1: Update docs**

Document:

- Today is the guided path;
- lessons are side quests that prepare Today;
- overview opens lessons only;
- individual lesson page owns `Practice this lesson` and `Review this lesson`;
- lesson practice/review are selected-lesson only and FSRS-writing;
- culture/pronunciation do not gate lesson status.

**Step 2: Verify docs**

Run:

```bash
git diff --check
```

Expected: PASS.

**Step 3: Commit**

```bash
git add docs/current-system/human-product-and-learning-guide.md docs/architecture/session-engine.md docs/plans/2026-04-29-lessons-overview-and-lesson-practice-spec.md
git commit -m "Document lesson overview and practice model"
```

## Final Verification

Run:

```bash
$env:VITE_SUPABASE_URL='http://localhost:54321'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; npm run test
npm run build
git diff --check
```

Expected:

- all Vitest tests pass;
- build succeeds;
- no whitespace errors;
- no direct `Practice` or `Review` action remains on the lessons overview;
- individual lesson page exposes `Practice this lesson` / `Review this lesson` only when rules allow it.
