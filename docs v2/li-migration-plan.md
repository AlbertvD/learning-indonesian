# Learning Indonesian Migration Plan: Current App to Retention-First Architecture

> Reference repo: `https://github.com/AlbertvD/learning-indonesian`
>
> Goal: migrate the existing flashcard-and-content app to the target retention-first architecture without a destructive rewrite.

## 1. Migration Strategy

The recommended path is an incremental, compatibility-preserving migration.

Guiding rules:

1. Do not freeze product progress while rebuilding architecture.
2. Keep existing flashcard review working until the replacement path is proven.
3. Introduce new learner-state and event tables before replacing scheduling.
4. Migrate in vertical slices that each deliver user value.
5. Prefer coexistence and feature flags over big-bang replacement.

This means the app should temporarily run both:

- the current card-first review model
- the new item-and-skill model

## 2. Current Baseline

Observed baseline from the repo:

- `anki_cards` and `card_reviews` are the current review foundation
- `card_reviews` stores one interval per card/user pair
- scheduling is SM-2 via `src/lib/sm2.ts`
- review UI is centered on `src/pages/Review.tsx`
- lessons, podcasts, and vocabulary already exist in schema
- bidirectional review work is already underway in repo plans

This is a good starting point because the app already has:

- content
- user auth
- progress tracking
- session tracking
- testing infrastructure

## 3. What Must Change

To reach the target architecture, the app needs these structural changes:

- move from `card_reviews` as the main source of truth to `learner_skill_state`
- introduce canonical `learning_items`
- separate skill facets instead of one generic review interval
- log immutable `review_events`
- support exercise-driven sessions
- attach lesson and podcast contexts to items
- support adaptive scheduling

## 4. Migration Phases

## Phase 0: Prepare the Ground

### Objectives

- understand content overlap and duplicates
- lock down the migration path
- avoid schema choices that later block speaking, context, or analytics

### Tasks

1. Audit all existing content sources:
   - flashcards
   - vocabulary table
   - lesson text
   - podcast transcripts
2. Identify canonical item candidates and duplicates:
   - same Indonesian form with multiple translations
   - phrase vs single-word collisions
   - flashcards that should remain user-only rather than canonical
3. Decide the canonical content strategy:
   - admin-managed core items
   - user-created personal items
   - whether these share one table or two linked tables
4. Add a design note for answer normalization:
   - punctuation stripping
   - parenthetical handling
   - whitespace normalization
   - acceptable synonyms

### Deliverables

- content audit document
- canonical item rules
- answer normalization rules

## Phase 1: Introduce the New Core Schema

### Objectives

- add the new target tables without breaking current flows

### Schema additions

Add:

- `learning_items`
- `item_meanings`
- `item_forms`
- `item_media`
- `item_contexts`
- `item_relationships`
- `learner_item_state`
- `learner_skill_state`
- `review_events`

Optional now, useful later:

- `session_queue_items`
- `scheduler_models`
- `generated_contexts`

### Key compatibility decisions

- keep `anki_cards` and `card_reviews`
- do not delete or repurpose them yet
- add mapping fields so old content can resolve to new `learning_items`

### Recommended extra fields

You may want to add early:

- `source_card_id` on `learning_items` for provenance
- `model_version` on `learner_skill_state`
- `scheduler_snapshot` on `review_events`
- `is_leech` and `confusable_group` support

### Deliverables

- schema migration SQL
- TypeScript types for new entities
- RLS policies for new learner tables

## Phase 2: Build the Content Unification Layer

### Objectives

- unify content without forcing an immediate UI rewrite

### Tasks

1. Create a content import/mapping process:
   - existing `anki_cards` -> `learning_items`
   - existing `vocabulary` -> `learning_items`
   - lesson example sentences -> `item_contexts`
   - podcast clips/transcript snippets -> `item_contexts`
2. Decide uniqueness rules:
   - same surface form with different meanings
   - phrase-level items
   - one item with multiple contexts and meanings
3. Preserve provenance:
   - source lesson
   - source podcast
   - source flashcard set
4. Create validation scripts:
   - missing primary meaning
   - missing anchor context
   - duplicate normalized forms
   - orphan contexts

### Deliverables

- import scripts
- validation scripts
- content mapping report

## Phase 3: Add Event Logging Before Replacing Scheduling

### Objectives

- capture the data needed for an adaptive scheduler

### Tasks

1. Create `reviewEventService`
2. Log all existing review interactions into `review_events`
3. Record:
   - correctness
   - selected quality
   - latency
   - direction
   - hint use
   - exercise type
4. Keep current SM-2 updates running in parallel

### Why this matters

Without event history, you cannot properly evaluate or train a better scheduler later.

### Deliverables

- event writer integrated into current review flow
- tests for event logging
- analytics queries for baseline retention patterns

## Phase 4: Introduce Learner Skill State in Parallel

### Objectives

- start tracking multi-facet mastery while the old UI still works

### Scope

Start with only two skill facets:

- `recognition`
- `form_recall`

These map cleanly to the current flashcard flow.

### Tasks

1. Create `learnerStateService`
2. On each current review event:
   - update `learner_item_state`
   - update `learner_skill_state`
3. Write mapping rules:
   - forward card review may affect `meaning_recall` or `form_recall`
   - reverse card review may affect a different facet depending on prompt direction

### Deliverables

- compatibility updater
- unit tests for state transitions
- initial state backfill job

## Phase 5: Replace SM-2 with a First Adaptive Scheduler

### Objectives

- keep the UI familiar while improving the learning model underneath

### Approach

Do not jump straight to a complex ML model. Start with an interpretable adaptive model that estimates recall probability using:

- previous success/failure
- repetition count
- elapsed time
- latency
- hint use
- skill type
- stage

### Tasks

1. Add `schedulerService`
2. Create scheduler inputs from `review_events` and `learner_skill_state`
3. Replace `calculateNextReview` usage behind a feature flag
4. Keep SM-2 fallback available
5. Compare both schedulers on:
   - due count
   - lapse rate
   - session completion

### Deliverables

- v1 adaptive scheduler
- feature flag
- comparison dashboard

## Phase 6: Introduce the Unified Session Engine

### Objectives

- stop building separate hardcoded learning flows for each task type

### Tasks

1. Create `sessionBuilderService`
2. Build one unified session payload format:
   - item
   - skill
   - exercise type
   - context
   - feedback payload
3. Add `sessionStore`
4. Build a new `LearnSession` page and `ExerciseShell`
5. Keep current `Review.tsx` until parity is reached

### Session-builder rules

- mix due items with weaker items
- cap new introductions
- interleave modalities
- avoid confusable runs

### Deliverables

- session engine
- new session page
- parity checklist against old review page

## Phase 7: Expand Exercise Types

### Objectives

- move from one flashcard mode to progressive retrieval

### New exercise rollout order

1. recognition
2. cued recall
3. typed recall
4. listen-and-select
5. cloze
6. listen-and-type
7. sentence build
8. spoken recall
9. dialogue reply

### Why this order

It increases learner difficulty gradually while keeping implementation complexity manageable.

### Deliverables

- reusable exercise component library
- shared scoring contract
- answer normalization utilities

## Phase 8: Add Context Engine

### Objectives

- move beyond decontextualized cards

### Tasks

1. Populate `item_contexts`
2. Link contexts to lessons and podcasts
3. Add context selection logic to scheduler/session builder
4. Introduce anchor-context and varied-context policies
5. Add contextual transfer metrics

### Rules

- every core item should have at least one anchor context
- mature items should be recycled in varied contexts
- same context should not be repeated too often for mature items

### Deliverables

- context importer
- context-aware exercises
- context coverage report

## Phase 9: Add Productive and Speaking Layers

### Objectives

- support durable active use, not just recognition and typing

### Tasks

1. Add `spoken_production` skill facet
2. Add speaking exercise component
3. Decide speech scoring strategy:
   - browser speech APIs
   - external speech-to-text
   - manual self-assessment fallback
4. Log response quality and confidence separately from binary correctness

### Deliverables

- spoken production MVP
- speech scoring strategy
- privacy and retention policy for speech data

## Phase 10: Full Cutover

### Objectives

- retire the old review core only after the new architecture has proven itself

### Cutover conditions

Do not remove the old system until:

- new session flow has feature parity for core daily review
- adaptive scheduler is stable
- learner skill states are being updated correctly
- event logging is complete
- content coverage is acceptable
- key metrics do not regress

### Final cutover tasks

1. switch default route from old review flow to new session flow
2. deprecate direct use of `card_reviews` for primary review scheduling
3. keep `anki_cards` as content/provenance if still useful
4. remove old-only UI and logic after a safe period

## 5. Recommended File and Module Migration

### Existing files likely to evolve

- `src/lib/sm2.ts`
- `src/pages/Review.tsx`
- `src/services/cardService.ts`
- `src/stores/cardStore.ts`
- `src/types/cards.ts`
- `scripts/migration.sql`

### New modules to add

- `src/domain/learning/model.ts`
- `src/domain/learning/stages.ts`
- `src/domain/learning/skills.ts`
- `src/domain/scheduler/recallPrediction.ts`
- `src/services/learning/itemService.ts`
- `src/services/learning/learnerStateService.ts`
- `src/services/learning/reviewEventService.ts`
- `src/services/scheduler/schedulerService.ts`
- `src/services/scheduler/sessionBuilderService.ts`
- `src/stores/sessionStore.ts`
- `src/components/exercises/*`
- `src/pages/LearnSession.tsx`

## 6. Data Migration Details

### 6.1 `anki_cards` to `learning_items`

Recommended mapping:

- `anki_cards.front` -> item prompt or source text
- `anki_cards.back` -> meaning or target text depending on direction
- `anki_cards.notes` -> metadata/provenance notes
- `anki_cards.tags` -> topic tags / import hints

Important:

- not every flashcard should become one canonical item without review
- some flashcards are personal mnemonics and should remain user-owned rather than canonical content

### 6.2 `card_reviews` to `learner_skill_state`

Recommended initial backfill:

- current forward review rows map to one or two learner skill facets
- current reverse rows map to complementary facets
- existing interval/repetition data should seed initial `stability` and `retrievability`

This backfill will be approximate, which is acceptable. Event data after migration will become the stronger truth source over time.

### 6.3 Lessons and Podcasts

Recommended approach:

- keep lessons and podcasts as authored content
- derive reusable contexts from them
- link relevant `learning_items` to their source contexts
- do not duplicate full transcripts blindly into item context rows; create targeted excerpts

## 7. Feature Flags

Use feature flags from early in the migration.

Recommended flags:

- `adaptive_scheduler_enabled`
- `new_session_engine_enabled`
- `contextual_review_enabled`
- `speaking_enabled`
- `transfer_tasks_enabled`

These will make rollout and rollback much safer.

## 8. Testing Strategy

### Unit tests

- answer normalization
- state promotion/demotion
- scheduler calculations
- due selection
- context selection

### Integration tests

- review submission writes event + updates skill state
- session builder returns mixed queue as expected
- learner stage transitions occur correctly

### Regression tests

- current flashcard flow still works during migration
- shared card set behavior is preserved
- existing lessons and podcasts remain unaffected

### Analytics validation

- due counts are sensible
- no sudden explosion in review load
- scheduler prediction error is tracked

## 9. Operational Recommendations You May Have Missed

These are easy to under-scope but important for a strong foundation.

### 9.1 Answer Normalization and Variant Handling

You will need a serious normalization layer for:

- punctuation
- capitalization
- parenthetical variants
- synonyms
- acceptable Indonesian variants
- morphology-aware matching where appropriate

Without this, productive tasks will feel unfair.

### 9.2 Confusable Item Handling

Track similarity groups explicitly:

- orthographic similarity
- semantic similarity
- collocational competition

Then use them in:

- queue construction
- feedback
- scheduling penalties

### 9.3 Content Quality Tooling

Build scripts or admin views to detect:

- items with no audio
- items with no anchor context
- items with too few varied contexts
- duplicate meanings
- broken podcast/lesson links

### 9.4 Analytics from Day One

At minimum, measure:

- delayed retention
- productive recall success
- lapse recovery
- time-to-stability
- context-transfer performance

### 9.5 Model Versioning

Always write scheduler model version into learner state or event logs. Future comparisons will depend on this.

## 10. Recommended Build Order

If you want the strongest long-term outcome with manageable risk, build in this exact order:

1. new schema
2. content mapping
3. event logging
4. learner skill state
5. adaptive scheduler v1
6. unified session engine
7. new exercise types
8. context engine
9. speaking
10. old-system retirement

## 11. Suggested Milestones

### Milestone 1: Observability Ready

- new schema exists
- current reviews log events
- baseline analytics available

### Milestone 2: Adaptive Core Ready

- learner skill states active
- adaptive scheduler powering at least one review flow

### Milestone 3: Session Engine Ready

- one new learn session can serve multiple exercise types

### Milestone 4: Contextual Learning Ready

- lessons and podcasts actively reinforce vocabulary via contexts

### Milestone 5: Production-Grade Retention System

- speaking, transfer tasks, and stable analytics all in place

## 12. Final Recommendation

Build toward the target architecture as a sequence of compatible layers, not a rewrite.

The most important practical insight is:

- first capture events
- then model skill states
- then improve scheduling
- then expand exercises and contexts

That order gives you the strongest foundation with the least architectural regret.
