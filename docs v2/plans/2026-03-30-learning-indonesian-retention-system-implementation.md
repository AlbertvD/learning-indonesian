# Learning Indonesian Retention System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve the current `learning-indonesian` app from an SM-2 flashcard review product into a retention-first language learning system with learner skill states, review event logging, adaptive scheduling, mixed exercise sessions, and context-aware reinforcement.

**Architecture:** Keep the current app operational while layering in a new item-and-skill learning model beside the existing flashcard model. Migrate in compatibility-preserving slices: schema first, then event capture, then learner skill state, then adaptive scheduling, then unified sessions and richer exercise types.

**Tech Stack:** React 19, TypeScript, Vite, Zustand, Mantine, Supabase, Vitest, Postgres SQL migrations

---

## Implementation Principles

- Preserve the current daily review flow until the new session engine is proven.
- Add immutable review events before replacing the scheduler.
- Treat `learner_skill_state` as the future source of truth, but not the initial one.
- Prefer feature flags and coexistence over destructive cutovers.
- Ship each phase with tests and verification commands.

## Assumed Current Files

Primary existing files expected to change:

- `scripts/migration.sql`
- `src/lib/sm2.ts`
- `src/pages/Review.tsx`
- `src/services/cardService.ts`
- `src/stores/cardStore.ts`
- `src/types/cards.ts`
- `src/__tests__/sm2.test.ts`
- `src/__tests__/cardService.test.ts`

Primary new files expected:

- `src/domain/learning/model.ts`
- `src/domain/learning/skills.ts`
- `src/domain/learning/stages.ts`
- `src/domain/learning/masteryRules.ts`
- `src/domain/scheduler/recallPrediction.ts`
- `src/domain/scheduler/dueScoring.ts`
- `src/services/learning/itemService.ts`
- `src/services/learning/learnerStateService.ts`
- `src/services/learning/reviewEventService.ts`
- `src/services/scheduler/schedulerService.ts`
- `src/services/scheduler/sessionBuilderService.ts`
- `src/stores/sessionStore.ts`
- `src/types/learning.ts`
- `src/types/reviewEvents.ts`
- `src/pages/LearnSession.tsx`
- `src/components/exercises/ExerciseShell.tsx`
- `src/components/exercises/RecognitionExercise.tsx`
- `src/components/exercises/CuedRecallExercise.tsx`
- `src/components/exercises/TypedRecallExercise.tsx`

---

### Task 1: Freeze the Baseline and Inventory Current Review Behavior

**Files:**
- Modify: `docs/plans/2026-03-30-learning-indonesian-retention-system-implementation.md`
- Reference: `src/pages/Review.tsx`
- Reference: `src/lib/sm2.ts`
- Reference: `src/services/cardService.ts`
- Reference: `src/stores/cardStore.ts`
- Test: `src/__tests__/sm2.test.ts`

**Step 1: Document current review flow and assumptions**

Capture:
- how due cards are fetched
- how review quality is selected
- what state is persisted
- what directionality already exists
- where session tracking begins and ends

**Step 2: Run current test suite**

Run:

```bash
npm test
```

Expected:
- current tests pass
- failures are documented before any new work begins

**Step 3: Add a short "current baseline" section to the architecture docs if gaps are found**

Include:
- current due-card model
- current review state fields
- key invariants that migration must preserve

**Step 4: Commit**

```bash
git add docs/plans/2026-03-30-learning-indonesian-retention-system-implementation.md
git commit -m "docs: capture retention system implementation baseline"
```

---

### Task 2: Add New Database Schema for Retention-First Learning

**Files:**
- Modify: `scripts/migration.sql`
- Create: `src/types/learning.ts`
- Create: `src/types/reviewEvents.ts`
- Test: `src/__tests__/learningSchemaTypes.test.ts`

**Step 1: Write the failing type test**

Add a test that asserts the new learning domain types compile and support:
- `LearningItem`
- `LearnerItemState`
- `LearnerSkillState`
- `ReviewEvent`

**Step 2: Extend the SQL schema**

Add tables:
- `learning_items`
- `item_meanings`
- `item_forms`
- `item_media`
- `item_contexts`
- `item_relationships`
- `learner_item_state`
- `learner_skill_state`
- `review_events`

Add:
- indexes for `user_id`, `learning_item_id`, `skill_type`, `next_due_at`
- RLS policies for learner-owned tables
- optional provenance fields such as `source_card_id`

**Step 3: Add TypeScript interfaces**

Create `src/types/learning.ts` and `src/types/reviewEvents.ts` with exact field names matching the SQL schema.

**Step 4: Run tests**

Run:

```bash
npm test -- learningSchemaTypes
```

Expected:
- the new type tests pass

**Step 5: Commit**

```bash
git add scripts/migration.sql src/types/learning.ts src/types/reviewEvents.ts src/__tests__/learningSchemaTypes.test.ts
git commit -m "feat: add retention learning schema and types"
```

---

### Task 3: Create Domain Model for Skills, Stages, and Exercise Types

**Files:**
- Create: `src/domain/learning/skills.ts`
- Create: `src/domain/learning/stages.ts`
- Create: `src/domain/learning/model.ts`
- Create: `src/domain/learning/masteryRules.ts`
- Test: `src/__tests__/masteryRules.test.ts`

**Step 1: Write failing tests for stage and skill transitions**

Cover:
- valid skill types
- valid learning stages
- promotion guardrails
- demotion guardrails
- no direct jump from `new` to `maintenance`

**Step 2: Implement the domain enums and rules**

Define:
- `LearningStage`
- `LearningSkillType`
- `ExerciseType`
- helper functions like:
  - `canPromoteStage`
  - `shouldDemoteStage`
  - `getDefaultSkillsForStage`

**Step 3: Run tests**

Run:

```bash
npm test -- masteryRules
```

Expected:
- stage and skill rule tests pass

**Step 4: Commit**

```bash
git add src/domain/learning src/__tests__/masteryRules.test.ts
git commit -m "feat: add learning domain model and mastery rules"
```

---

### Task 4: Add Review Event Logging to the Existing Review Flow

**Files:**
- Create: `src/services/learning/reviewEventService.ts`
- Modify: `src/pages/Review.tsx`
- Modify: `src/types/cards.ts`
- Test: `src/__tests__/reviewEventService.test.ts`
- Test: `src/__tests__/reviewPageEventLogging.test.tsx`

**Step 1: Write the failing tests**

Cover:
- review event insert payload shape
- event logging on successful review submission
- event includes:
  - `direction`
  - `exercise_type`
  - `latency_ms`
  - quality
  - correctness

**Step 2: Implement `reviewEventService`**

Add methods:
- `createReviewEvent`
- optional helpers to build scheduler snapshots later

**Step 3: Integrate event logging into `Review.tsx`**

Capture:
- review start timestamp per card
- answer reveal timestamp if needed
- rating submit latency
- current direction and exercise type

Do not remove SM-2 updates yet.

**Step 4: Run tests**

Run:

```bash
npm test -- reviewEventService
npm test -- reviewPageEventLogging
```

Expected:
- events are written exactly once per submitted review

**Step 5: Commit**

```bash
git add src/services/learning/reviewEventService.ts src/pages/Review.tsx src/types/cards.ts src/__tests__/reviewEventService.test.ts src/__tests__/reviewPageEventLogging.test.tsx
git commit -m "feat: log review events from existing review flow"
```

---

### Task 5: Introduce Learner Item State and Learner Skill State

**Files:**
- Create: `src/services/learning/learnerStateService.ts`
- Modify: `src/pages/Review.tsx`
- Create: `src/__tests__/learnerStateService.test.ts`

**Step 1: Write failing tests for learner state upserts**

Cover:
- creating a new `learner_item_state`
- creating or updating `learner_skill_state`
- incrementing success and failure counts
- updating `next_due_at`

**Step 2: Implement `learnerStateService`**

Methods:
- `ensureLearnerItemState`
- `upsertLearnerSkillState`
- `recordReviewOutcome`

Initial supported skill facets:
- `recognition`
- `form_recall`

**Step 3: Add compatibility mapping from current review direction**

Suggested mapping:
- forward review -> `meaning_recall`
- reverse review -> `form_recall`

Document the mapping in code comments and in the migration docs.

**Step 4: Integrate into current review submit path**

After the old `card_reviews` update succeeds:
- write learner state changes
- keep errors isolated so existing review still works if learner-state persistence has transient issues

**Step 5: Run tests**

Run:

```bash
npm test -- learnerStateService
```

Expected:
- learner state is updated consistently per submitted review

**Step 6: Commit**

```bash
git add src/services/learning/learnerStateService.ts src/pages/Review.tsx src/__tests__/learnerStateService.test.ts
git commit -m "feat: add learner item and skill state tracking"
```

---

### Task 6: Add Content Unification Layer

**Files:**
- Create: `src/services/learning/itemService.ts`
- Create: `scripts/backfill-learning-items.ts`
- Create: `scripts/validate-learning-content.ts`
- Test: `src/__tests__/itemService.test.ts`

**Step 1: Write failing tests for item mapping**

Cover:
- mapping `anki_cards` to `learning_items`
- preserving provenance via `source_card_id`
- duplicate normalization rules

**Step 2: Implement `itemService`**

Methods:
- `getLearningItemById`
- `findLearningItemBySourceCard`
- `createLearningItemFromCard`
- `getContextsForItem`

**Step 3: Add a backfill script**

Create a script that:
- reads from `anki_cards`
- creates `learning_items`
- links source card ids
- is idempotent

**Step 4: Add a validation script**

Check for:
- missing primary meaning
- duplicate normalized forms
- missing anchor context

**Step 5: Run tests**

Run:

```bash
npm test -- itemService
```

Expected:
- content mapping rules behave predictably

**Step 6: Commit**

```bash
git add src/services/learning/itemService.ts scripts/backfill-learning-items.ts scripts/validate-learning-content.ts src/__tests__/itemService.test.ts
git commit -m "feat: add learning item service and backfill tooling"
```

---

### Task 7: Build the First Adaptive Scheduler

**Files:**
- Create: `src/domain/scheduler/recallPrediction.ts`
- Create: `src/domain/scheduler/dueScoring.ts`
- Create: `src/services/scheduler/schedulerService.ts`
- Modify: `src/pages/Review.tsx`
- Create: `src/__tests__/schedulerService.test.ts`

**Step 1: Write failing scheduler tests**

Cover:
- lower retrievability for long-unseen items
- lower retrievability after failures
- higher due score for fragile productive skills than strong recognition skills
- deterministic next due time for identical input state

**Step 2: Implement a pragmatic adaptive model**

Inputs:
- elapsed time
- last correctness
- success/failure counts
- latency
- hint use placeholder
- skill type

Outputs:
- `recallProbability`
- `nextDueAt`
- `dueScore`

**Step 3: Feature flag the scheduler**

Add a simple feature switch:
- environment variable or config constant
- if disabled, continue to use SM-2
- if enabled, update `learner_skill_state.next_due_at`

**Step 4: Integrate without cutting over the old UI**

The existing review UI may continue fetching old due cards initially, but adaptive next-due values should be stored for analytics and comparison.

**Step 5: Run tests**

Run:

```bash
npm test -- schedulerService
```

Expected:
- scheduler outputs are deterministic and interpretable

**Step 6: Commit**

```bash
git add src/domain/scheduler src/services/scheduler/schedulerService.ts src/pages/Review.tsx src/__tests__/schedulerService.test.ts
git commit -m "feat: add adaptive scheduler v1"
```

---

### Task 8: Build a Unified Session Engine

**Files:**
- Create: `src/services/scheduler/sessionBuilderService.ts`
- Create: `src/stores/sessionStore.ts`
- Create: `src/pages/LearnSession.tsx`
- Create: `src/components/exercises/ExerciseShell.tsx`
- Create: `src/__tests__/sessionBuilderService.test.ts`

**Step 1: Write failing tests for session composition**

Cover:
- due items are included
- weak items can be mixed in
- new items are capped
- confusable items are not placed back-to-back when avoidable

**Step 2: Implement `sessionBuilderService`**

Initial responsibilities:
- fetch due learner skill states
- choose exercise type for each state
- assemble a mixed queue

**Step 3: Implement `sessionStore`**

Store:
- current queue
- current index
- current exercise payload
- submit status
- session metrics

**Step 4: Implement `LearnSession.tsx` and `ExerciseShell.tsx`**

Do not build every exercise type yet. Start with:
- recognition
- cued recall
- typed recall

**Step 5: Add a route behind a feature flag**

Modify:
- `src/App.tsx`

Add:
- `/learn-session`

**Step 6: Run tests**

Run:

```bash
npm test -- sessionBuilderService
```

Expected:
- session queues are built predictably

**Step 7: Commit**

```bash
git add src/services/scheduler/sessionBuilderService.ts src/stores/sessionStore.ts src/pages/LearnSession.tsx src/components/exercises/ExerciseShell.tsx src/__tests__/sessionBuilderService.test.ts src/App.tsx
git commit -m "feat: add unified learning session engine"
```

---

### Task 9: Add First Three Exercise Types

**Files:**
- Create: `src/components/exercises/RecognitionExercise.tsx`
- Create: `src/components/exercises/CuedRecallExercise.tsx`
- Create: `src/components/exercises/TypedRecallExercise.tsx`
- Create: `src/lib/answerNormalization.ts`
- Create: `src/__tests__/answerNormalization.test.ts`
- Create: `src/__tests__/exerciseComponents.test.tsx`

**Step 1: Write failing tests for answer normalization**

Cover:
- trimming
- case folding
- parenthetical stripping
- punctuation normalization

**Step 2: Implement `answerNormalization.ts`**

Add helpers:
- `normalizeAnswer`
- `stripParentheticalHints`
- `answersMatch`

**Step 3: Implement the first exercise components**

Recognition:
- low-friction recognition prompt

Cued recall:
- prompted answer with support

Typed recall:
- free text input with normalized evaluation

**Step 4: Wire them into `ExerciseShell.tsx`**

**Step 5: Run tests**

Run:

```bash
npm test -- answerNormalization
npm test -- exerciseComponents
```

Expected:
- typed answer matching behaves fairly and consistently

**Step 6: Commit**

```bash
git add src/components/exercises src/lib/answerNormalization.ts src/__tests__/answerNormalization.test.ts src/__tests__/exerciseComponents.test.tsx
git commit -m "feat: add initial exercise components and answer normalization"
```

---

### Task 10: Add Context Engine Using Lessons and Podcasts

**Files:**
- Modify: `scripts/backfill-learning-items.ts`
- Create: `scripts/backfill-item-contexts.ts`
- Modify: `src/services/learning/itemService.ts`
- Create: `src/__tests__/contextBackfill.test.ts`

**Step 1: Write failing tests for context extraction**

Cover:
- anchor context generation from lessons
- podcast snippet mapping to item contexts
- no duplicate identical context rows

**Step 2: Implement context backfill script**

Inputs:
- `lessons`
- `lesson_sections`
- `podcasts`
- transcript content

Outputs:
- `item_contexts`

**Step 3: Update `itemService` to fetch contexts**

Add:
- `getAnchorContextForItem`
- `getVariedContextsForItem`

**Step 4: Run tests**

Run:

```bash
npm test -- contextBackfill
```

Expected:
- contexts are attached reliably and without duplication

**Step 5: Commit**

```bash
git add scripts/backfill-item-contexts.ts scripts/backfill-learning-items.ts src/services/learning/itemService.ts src/__tests__/contextBackfill.test.ts
git commit -m "feat: add context backfill from lessons and podcasts"
```

---

### Task 11: Add Context-Aware Session Selection

**Files:**
- Modify: `src/services/scheduler/sessionBuilderService.ts`
- Modify: `src/services/scheduler/schedulerService.ts`
- Modify: `src/components/exercises/ExerciseShell.tsx`
- Create: `src/__tests__/contextAwareSession.test.ts`

**Step 1: Write failing tests**

Cover:
- anchored items get anchor context first
- mature items receive varied contexts
- context repetition is limited

**Step 2: Update session builder**

Add context selection rules:
- new items -> anchor context
- stable items -> varied context
- weak items -> easier context after lapse

**Step 3: Update exercise payloads**

Ensure each payload can carry:
- `contextId`
- `sourceText`
- `translationText`
- `audioPath`

**Step 4: Run tests**

Run:

```bash
npm test -- contextAwareSession
```

Expected:
- context progression is stage-appropriate

**Step 5: Commit**

```bash
git add src/services/scheduler/sessionBuilderService.ts src/services/scheduler/schedulerService.ts src/components/exercises/ExerciseShell.tsx src/__tests__/contextAwareSession.test.ts
git commit -m "feat: add context-aware session composition"
```

---

### Task 12: Add Analytics and Scheduler Observability

**Files:**
- Create: `src/services/analytics/analyticsService.ts`
- Create: `scripts/report-retention-metrics.ts`
- Create: `src/__tests__/analyticsService.test.ts`

**Step 1: Write failing tests**

Cover:
- scheduler prediction error aggregation
- lapse rate by skill type
- time-to-stability calculation

**Step 2: Implement analytics service**

Expose methods for:
- retention summary
- scheduler accuracy
- skill distribution
- lapse clusters

**Step 3: Add reporting script**

Generate a basic CLI report for:
- due load
- recent lapse rate
- high-failure items
- skills with weakest retention

**Step 4: Run tests**

Run:

```bash
npm test -- analyticsService
```

Expected:
- analytics computations produce stable outputs from fixture data

**Step 5: Commit**

```bash
git add src/services/analytics/analyticsService.ts scripts/report-retention-metrics.ts src/__tests__/analyticsService.test.ts
git commit -m "feat: add retention analytics and scheduler observability"
```

---

### Task 13: Add Speaking-Ready Schema and Interface Contracts

**Files:**
- Modify: `scripts/migration.sql`
- Modify: `src/types/learning.ts`
- Create: `src/components/exercises/SpeakingExercise.tsx`
- Create: `src/__tests__/speakingContracts.test.tsx`

**Step 1: Write failing tests**

Cover:
- `spoken_production` skill support
- speaking exercise payload shape
- speaking result contract with confidence and transcript fields

**Step 2: Extend schema and types**

Add fields needed for:
- speech transcript
- pronunciation feedback
- confidence score

**Step 3: Add a placeholder speaking component**

It may initially:
- capture typed mock transcript
- use self-assessment
- defer actual speech scoring integration

**Step 4: Run tests**

Run:

```bash
npm test -- speakingContracts
```

Expected:
- speaking support is structurally ready even if not fully enabled

**Step 5: Commit**

```bash
git add scripts/migration.sql src/types/learning.ts src/components/exercises/SpeakingExercise.tsx src/__tests__/speakingContracts.test.tsx
git commit -m "feat: prepare speaking skill contracts"
```

---

### Task 14: Cut Over Daily Review to the New Session Engine

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Review.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/stores/sessionStore.ts`
- Test: `src/__tests__/dailyReviewCutover.test.tsx`

**Step 1: Write failing integration test**

Cover:
- daily review route uses new session engine when feature flag is on
- fallback to old review flow when feature flag is off

**Step 2: Implement feature-flagged routing**

Recommended:
- preserve `/review`
- route to new engine internally when enabled

**Step 3: Keep old review page as fallback during stabilization**

**Step 4: Run tests**

Run:

```bash
npm test -- dailyReviewCutover
```

Expected:
- cutover is reversible and safe

**Step 5: Commit**

```bash
git add src/App.tsx src/pages/Review.tsx src/components/Sidebar.tsx src/stores/sessionStore.ts src/__tests__/dailyReviewCutover.test.tsx
git commit -m "feat: cut over daily review to new session engine"
```

---

### Task 15: Deprecate Old Review Core

**Files:**
- Modify: `src/services/cardService.ts`
- Modify: `src/stores/cardStore.ts`
- Modify: `src/types/cards.ts`
- Modify: `src/lib/sm2.ts`
- Update: docs and migration notes

**Step 1: Remove direct dependency on old scheduling for primary review**

Keep old code available only for:
- fallback
- data migration
- compatibility

**Step 2: Mark deprecated modules clearly**

Add comments noting:
- what replaced them
- when they can be safely removed

**Step 3: Run full test suite**

Run:

```bash
npm test
npm run build
```

Expected:
- all tests pass
- production build succeeds

**Step 4: Commit**

```bash
git add src/services/cardService.ts src/stores/cardStore.ts src/types/cards.ts src/lib/sm2.ts docs
git commit -m "refactor: deprecate legacy review core"
```

---

## Verification Checklist Per Phase

After each task:

1. Run the targeted tests from that task.
2. Run `npm test` if shared logic changed.
3. Run `npm run build` after routing, store, or type changes.
4. Manually verify core flows:
   - login
   - dashboard
   - cards
   - review
   - lessons
   - podcasts

## Suggested Feature Flags

Use environment or config flags for:

- `adaptive_scheduler_enabled`
- `new_session_engine_enabled`
- `contextual_review_enabled`
- `speaking_enabled`
- `transfer_tasks_enabled`

## Open Decisions to Resolve During Execution

These do not block the first phases, but should be decided before later rollout:

- whether user-created flashcards and canonical learning items should share one table forever
- whether scheduler updates remain client-driven or move to Supabase RPC/edge functions
- how Indonesian answer variants and synonyms are accepted
- which speech scoring path to use for production speaking
- how much lesson/podcast context should be excerpted automatically versus curated manually

## Recommended Near-Term Execution Order

If work starts immediately, execute these first five tasks in order:

1. Task 2: new schema and types
2. Task 3: learning domain model
3. Task 4: review event logging
4. Task 5: learner state tracking
5. Task 7: adaptive scheduler v1

That sequence creates the strongest foundation before UI expansion.
