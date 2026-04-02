# Learning Indonesian Retention-First Target Architecture

> Reference repo: `https://github.com/AlbertvD/learning-indonesian`
>
> Current observed stack: React 19, Vite, TypeScript, Zustand, Mantine, Supabase, Vitest, existing SM-2 review flow.

## 1. Purpose

This document defines the target architecture for evolving the current Learning Indonesian app from a flashcard-centered product into a retention-first language learning system optimized for long-term recollection and transfer.

The target system should:

- maximize durable vocabulary retention rather than short-term review success
- support progression from recognition to recall to production to transfer
- track mastery per skill facet rather than per card only
- personalize scheduling using adaptive forgetting models
- reuse lessons, podcasts, and flashcards inside one coherent learning engine
- support future additions such as speaking, AI-generated practice, and richer analytics without a redesign

## 2. Product Principles

The architecture should enforce these product rules:

1. Memory is multi-dimensional. A learner does not simply "know" a word. They may recognize it, recall its meaning, spell it, understand it in speech, or use it in context at different levels of strength.
2. Retrieval is the primary learning action. Restudy and passive reading are support layers, not the core loop.
3. Difficulty should increase gradually. The app should progress from supported tasks toward more generative tasks only after sufficient success.
4. Context should expand after anchoring. New items start in simple contexts, then appear in varied sentences, speakers, topics, and communicative situations.
5. Scheduling should be adaptive. Review timing should be based on predicted forgetting, not a one-size-fits-all interval table.
6. Transfer matters. The app should measure not only whether an item is remembered on a card, but whether it can be used in reading, listening, writing, and speaking.

## 3. Current-State Assessment

The current app already provides useful foundations:

- authenticated user model via Supabase
- lessons, lesson sections, vocabulary, podcasts, and flashcards
- shared `learning_sessions`
- review experience in `src/pages/Review.tsx`
- flashcard review storage in `scripts/migration.sql`
- SM-2 scheduling in `src/lib/sm2.ts`
- service and store separation via `src/services/*` and `src/stores/*`

Current limitations:

- review state is card-first rather than learning-item-first
- a single review interval is insufficient for recognition, recall, listening, and production
- review is primarily flashcard interaction rather than mixed exercise progression
- content types exist, but there is no unified learner model connecting flashcards, lessons, and podcasts
- no immutable event stream exists for training or evaluating better schedulers
- the current review UI is tightly coupled to a single question/answer card mode

## 4. Architecture Overview

The target system should be organized into six layers.

### 4.1 Content Layer

Stores canonical language content:

- learning items
- meanings and translations
- forms and variants
- audio
- contexts and examples
- relationships such as collocations and confusable items
- lesson and podcast references

This layer should be stable, reusable, and largely learner-independent.

### 4.2 Learner State Layer

Stores per-user state:

- overall item stage
- per-skill mastery state
- due times
- exposure history
- weaknesses and interference signals

This is the foundation of personalization.

### 4.3 Scheduling Layer

Predicts recall probability and decides:

- what is due now
- which skill facet to train next
- which exercise type is appropriate
- when the next review should happen

### 4.4 Session Composition Layer

Builds mixed learning sessions using:

- due reviews
- newly introduced items
- weak items
- contextual reinforcement from lessons and podcasts
- transfer tasks

### 4.5 Exercise Delivery Layer

Renders task types such as:

- recognition
- cued recall
- typed recall
- listening recognition
- listen-and-type
- cloze
- sentence generation
- dialogue response
- speaking

### 4.6 Analytics and Operations Layer

Supports:

- learning analytics
- scheduler evaluation
- A/B experiments
- content quality checks
- admin tooling
- safety and observability

## 5. Domain Model

The target domain model should move from "one flashcard, one interval" to "one learning item, many measurable capabilities."

### 5.1 Core Entities

#### `learning_items`

Represents the canonical teachable unit.

Recommended fields:

- `id`
- `item_type` (`word`, `phrase`, `sentence`, `dialogue_chunk`)
- `base_text`
- `normalized_text`
- `language`
- `level`
- `lesson_id`
- `source_type` (`lesson`, `podcast`, `flashcard`, `manual`, `generated`)
- `notes`
- `is_active`
- `created_at`
- `updated_at`

#### `item_meanings`

Represents senses and translations.

- `id`
- `learning_item_id`
- `translation_language`
- `translation_text`
- `sense_label`
- `usage_note`
- `is_primary`

#### `item_forms`

Represents surface forms and structural metadata.

- `id`
- `learning_item_id`
- `surface_form`
- `romanization`
- `ipa`
- `part_of_speech`
- `register`
- `morph_features`
- `is_primary`

#### `item_media`

Stores pronunciation and associated assets.

- `id`
- `learning_item_id`
- `media_type` (`audio`, `image`)
- `storage_path`
- `speaker_id`
- `voice_style`
- `duration_ms`
- `transcript`

#### `item_contexts`

Stores contextualized usage examples.

- `id`
- `learning_item_id`
- `context_type` (`example_sentence`, `dialogue`, `podcast_clip`, `lesson_snippet`, `cloze`)
- `source_text`
- `translation_text`
- `audio_path`
- `difficulty`
- `topic_tag`
- `speaker_id`
- `is_anchor_context`

#### `item_relationships`

Allows graph-like enrichment.

- `id`
- `source_item_id`
- `target_item_id`
- `relationship_type` (`collocation`, `synonym`, `antonym`, `confusable`, `same_root`, `same_topic`)
- `strength`

### 5.2 Learner Entities

#### `learner_item_state`

Tracks the item's overall lifecycle for a user.

- `id`
- `user_id`
- `learning_item_id`
- `stage` (`new`, `anchoring`, `retrieving`, `productive`, `transfer`, `maintenance`, `suspended`)
- `introduced_at`
- `last_seen_at`
- `priority`
- `origin` (`lesson`, `review`, `podcast`, `manual`)
- `times_seen`
- `times_mastered`
- `is_leech`

#### `learner_skill_state`

This is the primary mastery table.

- `id`
- `user_id`
- `learning_item_id`
- `skill_type` (`recognition`, `meaning_recall`, `form_recall`, `listening_recognition`, `spoken_production`, `context_use`)
- `stability`
- `difficulty`
- `retrievability`
- `last_reviewed_at`
- `next_due_at`
- `success_count`
- `failure_count`
- `lapse_count`
- `mean_latency_ms`
- `hint_rate`
- `current_model_version`

#### `review_events`

Immutable event log for all learning interactions.

- `id`
- `user_id`
- `learning_item_id`
- `skill_type`
- `exercise_type`
- `session_id`
- `was_correct`
- `score`
- `latency_ms`
- `hint_used`
- `attempt_number`
- `response_text`
- `feedback_type`
- `scheduler_snapshot` (jsonb)
- `created_at`

#### `session_queue_items`

Optional persisted queue for resumable sessions.

- `id`
- `session_id`
- `position`
- `learning_item_id`
- `skill_type`
- `exercise_type`
- `context_id`
- `status`

## 6. Learning Lifecycle

Each item should move through a controlled progression.

### Stage A: Anchor

Purpose:
- establish initial form-meaning link with low cognitive load

Activities:
- show meaning
- play audio
- show one simple sentence
- one very light recognition check

Exit criteria:
- learner shows basic familiarity across one or two successful low-friction checks

### Stage B: Supported Retrieval

Purpose:
- transition from exposure to effortful memory reconstruction

Activities:
- meaning-to-form with hints
- listen-and-choose
- cued recall

Exit criteria:
- repeated successful retrieval with limited support

### Stage C: Active Recall

Purpose:
- strengthen durable retrieval pathways

Activities:
- typed answer
- recall from audio cue
- cloze completion

Exit criteria:
- stable success in form recall and meaning recall

### Stage D: Productive Use

Purpose:
- strengthen usable output

Activities:
- typed sentence
- translate into Indonesian
- short prompt response
- spoken recall

Exit criteria:
- learner can reliably produce the item, not just recognize it

### Stage E: Transfer

Purpose:
- move memory from exercise success to real-world use

Activities:
- podcast/lesson reinforcement
- choose appropriate usage in context
- sentence generation
- dialogue reply

Exit criteria:
- learner succeeds in new contexts and mixed-item sessions

### Stage F: Maintenance

Purpose:
- preserve durable memory efficiently

Activities:
- low-frequency adaptive review across mixed contexts
- occasional production checks

## 7. Scheduling Architecture

### 7.1 Scheduler Objective

The scheduler should decide:

- which learner-skill states are due
- which exercise type should be used next
- which context should be used
- when each skill should next be reviewed

The scheduling objective is not merely "avoid forgetting." It is:

- maximize long-term retention
- maximize transfer to real use
- minimize wasted review
- maintain learner momentum

### 7.2 Recommended Model

Recommended long-term target:

- adaptive forgetting model in the family of Half-Life Regression or similar probabilistic recall models

Recommended initial production model:

- a pragmatic adaptive scheduler using interpretable features:
  - prior correctness
  - prior latency
  - skill type
  - stage
  - item difficulty
  - hint use
  - recency
  - contextual difficulty
  - confusable-item penalty

### 7.3 Scheduler Inputs

- `user_id`
- `learning_item_id`
- `skill_type`
- previous review outcomes
- response latency
- hint usage
- context difficulty
- relationship graph signals
- current stage
- session constraints

### 7.4 Scheduler Outputs

- `due_score`
- `recall_probability`
- `recommended_exercise_type`
- `recommended_context_id`
- `next_due_at`
- `promotion_or_demotion_action`

### 7.5 Scheduling Rules

The scheduler should obey these guardrails:

- never rely on a single global interval for all skills
- production skills should generally be reviewed sooner than recognition skills
- new items should stay in a narrower confidence band until stabilized
- mature items should occasionally reappear in more difficult contexts
- leeches and confusable items should be treated differently rather than repeatedly punished by the same pattern

## 8. Session Composition

Sessions should be constructed, not merely fetched as "all due cards."

### 8.1 Session Types

- `daily_review`
- `new_item_learning`
- `lesson_reinforcement`
- `podcast_reinforcement`
- `productive_drill`
- `transfer_practice`
- `weakness_recovery`

### 8.2 Session Builder Inputs

- learner goals
- due items
- unfinished lesson/podcast content
- recent failures
- fatigue limits
- target session duration

### 8.3 Session Mix Rules

Recommended daily mix:

- 50-65% due review
- 10-20% weak-item reinforcement
- 10-20% contextual transfer
- 10-15% new items

Rules:

- cap new items when due load is high
- avoid too many confusable items in a row
- interleave modalities
- end sessions with a winnable item if possible

## 9. Exercise System

The UI should be exercise-driven rather than page-driven.

### 9.1 Exercise Types

- `recognition_mcq`
- `listen_select`
- `cued_recall`
- `typed_recall`
- `listen_type`
- `cloze`
- `spoken_recall`
- `sentence_build`
- `dialogue_reply`
- `self_explanation`

### 9.2 Exercise Contract

Each exercise should receive:

- learner item payload
- target skill
- prompt
- context
- accepted answers or scoring rules
- feedback payload
- scheduler metadata

Each exercise should return:

- correctness
- partial score if relevant
- latency
- hint usage
- normalized learner response

### 9.3 Feedback Rules

Feedback should be immediate and explicit:

- correct form
- pronunciation support
- explanation of error when useful
- one example sentence
- optional contrast with confusable items

## 10. Frontend Architecture

### 10.1 Recommended Module Layout

```text
src/
  domain/
    learning/
      model.ts
      stages.ts
      skills.ts
      exerciseTypes.ts
      masteryRules.ts
    scheduler/
      schedulerTypes.ts
      dueScoring.ts
      recallPrediction.ts
  services/
    content/
      contentService.ts
    learning/
      itemService.ts
      learnerStateService.ts
      reviewEventService.ts
    scheduler/
      schedulerService.ts
      sessionBuilderService.ts
    analytics/
      analyticsService.ts
  stores/
    sessionStore.ts
    learnerStore.ts
  components/
    exercises/
      ExerciseShell.tsx
      RecognitionExercise.tsx
      CuedRecallExercise.tsx
      TypedRecallExercise.tsx
      ListeningExercise.tsx
      ClozeExercise.tsx
      SpeakingExercise.tsx
      GenerativeUseExercise.tsx
  pages/
    LearnSession.tsx
    LessonReinforcement.tsx
    TransferPractice.tsx
```

### 10.2 UI Strategy

- one unified session shell
- exercise components chosen by `exercise_type`
- shared progress, answer, feedback, and transition UI
- keep page routing thin; let the session engine control sequencing

### 10.3 State Strategy

- Zustand for client session state
- services for Supabase access
- domain functions for promotion, demotion, and exercise choice
- event-first updates rather than directly mutating one card row as the only truth

## 11. Backend and Supabase Design

### 11.1 Data Access Strategy

Supabase remains a good fit for:

- auth
- row-level security
- content reads
- learner-state persistence
- session and event logging

Suggested approach:

- keep simple CRUD through client-side Supabase for low-risk flows
- move scheduler-sensitive updates into RPCs or edge functions once concurrency and correctness matter more

### 11.2 RLS Considerations

New learner tables should enforce:

- user can only read and mutate their own learner state and events
- content tables remain broadly readable to authenticated users
- admin-authored content remains write-protected

### 11.3 RPC / Function Opportunities

Recommended future functions:

- `start_learning_session`
- `submit_review_event`
- `compute_next_due_batch`
- `promote_item_stage`
- `record_generated_context`

## 12. Analytics and Experimentation

This is easy to miss early and expensive to add late.

Recommended analytics tables or derived views:

- item retention by skill
- scheduler prediction error
- lapse rate by exercise type
- transfer success rate by lesson/podcast source
- confusable-item failure clusters
- new-item overload indicators

Experiments worth enabling:

- exercise ordering experiments
- context-diversity timing experiments
- scheduler threshold comparisons
- speaking introduction timing

## 13. Content Operations

The long-term system needs a content pipeline, not just app code.

### 13.1 Content Standards

For each new core item, aim to have:

- primary meaning
- Dutch and English translations where useful
- audio
- one anchor context
- two to five varied contexts over time
- tags for topic, difficulty, and confusable groups

### 13.2 Content Tooling Suggestions

- content admin screens or scripts for `learning_items`, `item_contexts`, and relationships
- validation scripts for missing audio, missing anchor context, and duplicate forms
- automated importers that convert lesson and podcast content into reusable item-context links

## 14. Non-Functional Requirements

### Performance

- sessions should load quickly with precomputed due batches where possible
- avoid expensive client joins for every exercise
- cache stable content payloads

### Reliability

- event logging should be append-only
- scheduler logic should be deterministic for a given model version
- session submission should be idempotent where feasible

### Observability

- log scheduler decisions
- surface prediction drift
- track failure hotspots by item and exercise type

### Privacy

- keep speech and response data under explicit retention rules
- separate learner-generated content from canonical content

## 15. Recommended Architectural Decisions

1. Preserve current flashcard entities during transition, but stop treating them as the final domain model.
2. Make `learner_skill_state` the core mastery table.
3. Add `review_events` before building the advanced scheduler.
4. Build one flexible session engine instead of separate hardcoded pages per modality.
5. Keep lessons and podcasts as first-class reinforcement sources, not parallel silos.
6. Design the model so speaking can be added without reworking the schema.
7. Treat confusable-item handling as a first-class concern.
8. Invest in analytics early enough to evaluate scheduler quality.

## 16. Risks to Avoid

- rebuilding the product around a prettier flashcard screen without changing the underlying learning model
- storing only aggregate state and losing event-level learning data
- introducing too many exercise types before the state model is stable
- using one mastery score for all skills
- overloading new learners with production tasks too early
- failing to create content operations for contexts and audio

## 17. Suggested Success Metrics

Primary:

- delayed recall at 7, 30, and 90 days
- productive recall success rate
- transfer success rate in contextual tasks
- session completion rate

Secondary:

- average time-to-stable-item
- lapse recovery speed
- ratio of recognition-only mastery to production mastery
- percentage of items with adequate context coverage

## 18. Final Recommendation

The correct foundation for this app is not a bigger flashcard engine. It is a retention-oriented learning platform built around:

- canonical learning items
- per-skill learner states
- adaptive scheduling
- mixed exercise sessions
- contextual enrichment
- transfer into real language use

This architecture is intentionally stronger than the current product shape, but it can still be delivered incrementally if migration is planned carefully.
