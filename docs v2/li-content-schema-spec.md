# Learning Indonesian Content and Learning Schema Specification

## Purpose

This document defines the target schema structure for the retention-first system at a table and field level.

It explains:

- what each table is for
- why it exists
- how tables relate
- which fields are essential
- what should remain compatibility-only during migration

## Design Principles

1. Separate canonical content from learner-specific state.
2. Treat learning items as richer than flashcards.
3. Preserve provenance from lessons, podcasts, and flashcards.
4. Support multiple skill facets per item.
5. Keep the event stream immutable.

## Schema Layers

The schema should be thought of in four layers:

1. canonical content
2. learner state
3. review and session events
4. compatibility and migration support

## 1. Canonical Content Tables

## `learning_items`

### Purpose

Represents the canonical teachable unit used across the app.

### Example records

- one Indonesian word
- one phrase
- one fixed expression
- one sentence fragment worth tracking directly

### Core fields

- `id`
- `item_type`
- `base_text`
- `normalized_text`
- `language`
- `level`
- `source_type`
- `lesson_id`
- `notes`
- `is_active`
- `created_at`
- `updated_at`

### Notes

- `normalized_text` supports duplicate detection and answer matching
- `source_type` preserves where the item first came from
- `lesson_id` is optional because not all items originate in lessons

## `item_meanings`

### Purpose

Stores meanings, translations, and sense-level information.

### Core fields

- `id`
- `learning_item_id`
- `translation_language`
- `translation_text`
- `sense_label`
- `usage_note`
- `is_primary`

### Why separate table

Because one item may have:

- more than one translation
- more than one sense
- different display languages

## `item_forms`

### Purpose

Stores surface-form and linguistic representation details.

### Core fields

- `id`
- `learning_item_id`
- `surface_form`
- `romanization`
- `ipa`
- `part_of_speech`
- `register`
- `morph_features`
- `is_primary`

### Why separate table

Because one item may have:

- multiple written forms
- register variants
- useful morphology metadata

## `item_media`

### Purpose

Stores media assets tied to an item.

### Core fields

- `id`
- `learning_item_id`
- `media_type`
- `storage_path`
- `speaker_id`
- `voice_style`
- `duration_ms`
- `transcript`

### Main use cases

- pronunciation audio
- sentence audio
- future image support

## `item_contexts`

### Purpose

Stores contexts where the item appears.

### Core fields

- `id`
- `learning_item_id`
- `context_type`
- `source_text`
- `translation_text`
- `audio_path`
- `difficulty`
- `topic_tag`
- `speaker_id`
- `is_anchor_context`
- `source_lesson_id`
- `source_podcast_id`

### Why this matters

This table makes context reuse possible for:

- cloze
- lesson reinforcement
- podcast reinforcement
- transfer practice

## `item_relationships`

### Purpose

Stores links between items.

### Core fields

- `id`
- `source_item_id`
- `target_item_id`
- `relationship_type`
- `strength`

### Relationship examples

- collocation
- confusable
- same topic
- same root
- synonym-like

## `item_answer_variants`

### Purpose

Stores accepted answer alternatives for productive tasks.

### Core fields

- `id`
- `learning_item_id`
- `variant_text`
- `variant_type`
- `language`
- `is_accepted`
- `notes`

### Why add this

This prevents productive tasks from feeling unfair and makes answer normalization explicit instead of hidden in ad hoc code.

## 2. Learner State Tables

## `learner_item_state`

### Purpose

Stores the learner's overall relationship with an item.

### Core fields

- `id`
- `user_id`
- `learning_item_id`
- `stage`
- `introduced_at`
- `last_seen_at`
- `priority`
- `origin`
- `times_seen`
- `times_mastered`
- `is_leech`
- `suspended`

### Why this exists

The app needs one high-level item status separate from the individual skill facets.

## `learner_skill_state`

### Purpose

Stores skill-specific memory state.

### Core fields

- `id`
- `user_id`
- `learning_item_id`
- `skill_type`
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

### Why this is the main mastery table

Because one learner may:

- recognize an item well
- fail to produce it
- understand it in reading
- still struggle in speaking

One row per item is not enough.

## 3. Event and Session Tables

## `review_events`

### Purpose

Append-only log of learning interactions.

### Core fields

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
- `raw_response`
- `normalized_response`
- `feedback_type`
- `scheduler_snapshot`
- `created_at`

### Why immutable

Because analytics, scheduler evaluation, and debugging all depend on historical truth.

## `learning_sessions`

### Purpose

Tracks session-level activity.

### Existing table usage

You already have a `learning_sessions` table. Keep it and extend it if needed.

### Recommended additional fields

- `session_goal`
- `items_reviewed`
- `skills_practiced`
- `session_summary`

## `session_queue_items`

### Purpose

Optional persisted session queue for resumable sessions.

### Core fields

- `id`
- `session_id`
- `position`
- `learning_item_id`
- `skill_type`
- `exercise_type`
- `context_id`
- `status`

### Why optional

Useful for resumability and analytics, but not required in the first migration slice.

## 4. Compatibility and Migration Tables

## Keep Existing Tables During Migration

These should remain during transition:

- `card_sets`
- `card_set_shares`
- `anki_cards`
- `card_reviews`
- `lessons`
- `lesson_sections`
- `vocabulary`
- `podcasts`

### Recommendation

Treat some of these as:

- source content
- compatibility layer
- or authored curriculum layer

not necessarily as the final learning engine model.

## Suggested Compatibility Fields

To make migration easier, consider adding:

- `source_card_id` on `learning_items`
- `source_vocabulary_id` on `learning_items`
- `source_lesson_id` and `source_podcast_id` on contexts

These help with:

- provenance
- debugging
- backfills
- safe cutover

## Recommended Indexes

Add indexes for:

- `learning_items(normalized_text)`
- `learner_item_state(user_id, stage)`
- `learner_skill_state(user_id, next_due_at)`
- `learner_skill_state(user_id, learning_item_id, skill_type)`
- `review_events(user_id, created_at)`
- `review_events(learning_item_id, skill_type, created_at)`
- `item_contexts(learning_item_id, is_anchor_context)`

## Recommended Constraints

Examples:

- unique `learner_skill_state` per `(user_id, learning_item_id, skill_type)`
- unique primary meaning per item per language if required
- unique anchor context rule if only one anchor context is allowed

## Recommended Enums or Check Constraints

Use consistent bounded values for:

- `item_type`
- `skill_type`
- `stage`
- `exercise_type`
- `relationship_type`
- `media_type`

## Data Ownership Rules

### Canonical content

Readable broadly, writeable by admin or content-authoring workflow only.

### Learner state

Readable and writeable only by the learner.

### Review events

Readable by learner, writeable only through app workflows.

### Compatibility content

Use current existing RLS patterns as the starting point.

## Table Relationships Summary

Conceptually:

- one `learning_item` has many meanings
- one `learning_item` has many forms
- one `learning_item` has many contexts
- one `learning_item` has many media assets
- one `learning_item` has many relationships
- one learner has one `learner_item_state` per item
- one learner has many `learner_skill_state` rows per item
- one learner skill state produces many `review_events`

## Migration-Safe Schema Strategy

Do not try to force all current tables into the new structure immediately.

Better approach:

1. add new schema
2. backfill gradually
3. link old content to new content
4. move new logic to new tables
5. retire old review state later

## Final Recommendation

The schema should evolve toward a model where:

- content is reusable
- learner memory is multi-faceted
- events are immutable
- scheduling is skill-aware

That is the data foundation required for a true retention-first language learning system.
