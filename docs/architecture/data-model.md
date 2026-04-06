# Data Model

All tables live in the `indonesian` Postgres schema. `scripts/migration.sql` is the authoritative schema definition — it is idempotent and re-runnable via `make migrate`.

---

## Schema groups

Tables fall into four functional groups:

| Group | Tables | Writer | Reader |
|---|---|---|---|
| **Content** | `learning_items`, `item_meanings`, `item_answer_variants`, `item_contexts`, `item_context_grammar_patterns`, `exercise_variants`, `grammar_patterns` | Admin via scripts | All authenticated users |
| **Content pipeline** | `textbook_sources`, `textbook_pages`, `generated_exercise_candidates` | Admin via scripts | Admin |
| **Learner state** | `learner_item_state`, `learner_skill_state`, `review_events`, `learner_stage_events`, `learner_analytics_events` | Row owner (app) | Row owner |
| **Progress & sessions** | `lesson_progress`, `learning_sessions` | Row owner | All (for leaderboard) |
| **Goal system** | `learner_weekly_goal_sets`, `learner_weekly_goals`, `learner_daily_goal_rollups` | App | Row owner |
| **Infrastructure** | `profiles`, `user_roles`, `exercise_type_availability`, `error_logs` | Mixed | Mixed |

---

## Content tables

### `learning_items`

The canonical teachable unit. Every vocabulary word, phrase, sentence, and dialogue chunk is a row here.

```sql
id                uuid PK
item_type         text  -- 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
base_text         text  -- the Indonesian text (authoritative form)
normalized_text   text  -- lowercase, punctuation-stripped (used for dedup)
language          text  -- always 'id'
level             text  -- 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
source_type       text  -- 'lesson' | 'podcast' | 'flashcard' | 'manual'
source_vocabulary_id uuid  -- FK to vocabulary table if from vocabulary seed
source_card_id    uuid  -- FK if from flashcard
notes             text
is_active         boolean DEFAULT true
UNIQUE(normalized_text, item_type)
```

Grammar exercises create `item_type: 'sentence'` rows. Their `base_text` is derived from the exercise payload (see [content-pipeline.md](content-pipeline.md)).

### `item_meanings`

Translations for a learning item. One row per language per item; an item can have both EN and NL meanings.

```sql
id                    uuid PK
learning_item_id      uuid FK → learning_items
translation_language  text  -- 'en' | 'nl'
translation_text      text
sense_label           text  -- optional disambiguation (e.g. "formal")
usage_note            text  -- shown as inline hint/explanation
is_primary            boolean
```

The session engine uses `is_primary = true` to pick the displayed translation for MCQ exercises.

### `item_answer_variants`

Accepted alternative answers for typed-recall grading. For example, a word may accept both a prefix and non-prefix form.

```sql
id                uuid PK
learning_item_id  uuid FK → learning_items
variant_text      text
variant_type      text  -- 'alternative_translation' | 'informal' | 'with_prefix' | 'without_prefix'
language          text  -- 'id' for Indonesian forms
is_accepted       boolean DEFAULT true
notes             text
```

### `item_contexts`

Example sentences, cloze blanks, exercise prompts, and lesson-association snippets for a learning item.

```sql
id                uuid PK
learning_item_id  uuid FK → learning_items
context_type      text  -- see below
source_text       text  -- the Indonesian sentence or placeholder
translation_text  text  -- translation (null for some types)
difficulty        text
topic_tag         text
is_anchor_context boolean DEFAULT false
source_lesson_id  uuid FK → lessons  -- lesson association
source_section_id uuid FK → lesson_sections
```

**`context_type` values:**

| Type | Purpose | Display? |
|---|---|---|
| `example_sentence` | Illustrative sentence | Yes |
| `dialogue` | Dialogue line | Yes |
| `cloze` | Sentence with `___` blank — used in cloze exercises | Yes |
| `lesson_snippet` | Bare word placeholder — carries `source_lesson_id` only | **No** |
| `vocabulary_list` | Vocabulary list entry | Context-dependent |
| `exercise_prompt` | Grammar exercise prompt — created by `publish-grammar-candidates.ts` | Via exercise variant |

Only `context_type: 'cloze'` contexts are eligible for cloze exercises. `lesson_snippet` contexts with `is_anchor_context = true` are not used for display — their `source_text` is the bare Indonesian word.

### `grammar_patterns`

Defines reusable grammar patterns that exercises can be linked to.

```sql
id                       uuid PK
slug                     text NOT NULL UNIQUE  -- e.g. 'me-prefix', 'di-passive'
name                     text NOT NULL         -- display name
short_explanation        text NOT NULL         -- one-sentence explanation
complexity_score         integer NOT NULL      -- relative complexity ranking
confusion_group          text                  -- groups confusable forms (used by interleaving policy)
introduced_by_source_id  uuid FK → textbook_sources
```

`confusion_group` is read by `applyGrammarAwareInterleaving` in session policies to avoid placing confusable items adjacent to each other.

### `item_context_grammar_patterns`

Junction table linking an `item_context` to one or more `grammar_patterns`.

```sql
id                  uuid PK
context_id          uuid FK → item_contexts
grammar_pattern_id  uuid FK → grammar_patterns
is_primary          boolean
UNIQUE(context_id, grammar_pattern_id)
```

### `exercise_variants`

Published grammar exercises. Each row is one fully-authored exercise for a specific context.

```sql
id                  uuid PK
exercise_type       text NOT NULL  -- no DB CHECK constraint; validated at application layer
learning_item_id    uuid FK → learning_items
context_id          uuid FK → item_contexts
grammar_pattern_id  uuid FK → grammar_patterns
payload_json        jsonb  -- display-only fields (prompt, instructions, explanation, option labels)
answer_key_json     jsonb  -- correctness data (correctOptionId, acceptableAnswers, disallowedShortcutForms)
source_candidate_id uuid   -- reference to staging candidate (informational)
is_active           boolean DEFAULT true
```

**payload/answer_key split:** `payload_json` is safe to send to the client and contains everything needed to render the exercise. `answer_key_json` contains correctness data and is read only during session building by `makePublishedExercise`. This split ensures display and grading concerns are cleanly separated.

### `exercise_type_availability`

Controls per-type rollout state. One row per exercise type.

```sql
exercise_type         text PK
session_enabled       boolean   -- whether this type appears in sessions
authoring_enabled     boolean   -- whether new content can be authored
requires_approved_content boolean
rollout_phase         text
notes                 text
```

The session policy layer reads `session_enabled`. Missing rows are treated as enabled (fail-open). See [feature-flags.md](feature-flags.md) for the interaction with env-var flags.

---

## Learner state tables

### `learner_item_state`

One row per (user, item) pair. Tracks the item's lifecycle stage.

```sql
id                uuid PK
user_id           uuid FK → auth.users
learning_item_id  uuid FK → learning_items
stage             text  -- 'new' | 'anchoring' | 'retrieving' | 'productive' | 'maintenance'
introduced_at     timestamptz
last_seen_at      timestamptz
priority          integer
origin            text
times_seen        integer DEFAULT 0
is_leech          boolean DEFAULT false
suspended         boolean DEFAULT false
gate_check_passed boolean
UNIQUE(user_id, learning_item_id)
```

Stage transitions: `new → anchoring → retrieving → productive → maintenance`. Lapses can regress a stage.

### `learner_skill_state`

One row per (user, item, skill_type). Stores FSRS parameters for each independently-tracked skill.

```sql
id                  uuid PK
user_id             uuid FK → auth.users
learning_item_id    uuid FK → learning_items
skill_type          text  -- 'recognition' | 'form_recall' | 'meaning_recall' | 'spoken_production'
stability           numeric DEFAULT 0   -- FSRS S parameter
difficulty          numeric DEFAULT 0   -- FSRS D parameter
retrievability      numeric             -- computed periodically, not live
last_reviewed_at    timestamptz
next_due_at         timestamptz
success_count       integer DEFAULT 0
failure_count       integer DEFAULT 0
lapse_count         integer DEFAULT 0
consecutive_failures integer DEFAULT 0
mean_latency_ms     integer
hint_rate           numeric
UNIQUE(user_id, learning_item_id, skill_type)
```

`retrievability` is stored but stale — `getRetrievability(stability, last_reviewed_at)` is computed live in the session engine. `next_due_at` drives the due-item query.

### `review_events`

Immutable append-only log of every exercise attempt.

```sql
id                    uuid PK
user_id               uuid FK → auth.users
learning_item_id      uuid FK → learning_items
skill_type            text
exercise_type         text
session_id            uuid FK → learning_sessions (nullable)
was_correct           boolean
score                 numeric
latency_ms            integer
hint_used             boolean DEFAULT false
attempt_number        integer DEFAULT 1
raw_response          text
normalized_response   text
feedback_type         text
scheduler_snapshot    jsonb  -- FSRS state at time of review
created_at            timestamptz
```

This table is write-only from the app's perspective. The `scheduler_snapshot` allows retrospective analysis of scheduling decisions.

### `learner_stage_events`

Append-only log of stage transitions (for analytics and goal system).

```sql
id                    uuid PK
user_id               uuid FK → auth.users
learning_item_id      uuid FK → learning_items
from_stage            text
to_stage              text
source_review_event_id uuid UNIQUE FK → review_events
created_at            timestamptz
```

---

## Progress and session tables

### `learning_sessions`

One row per study session. `duration_seconds` is a generated column.

```sql
id           uuid PK
user_id      uuid FK → auth.users
session_type text  -- 'lesson' | 'learning' | 'podcast' | 'practice'
started_at   timestamptz DEFAULT now()
ended_at     timestamptz
duration_seconds integer GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (ended_at - started_at))::integer) STORED
```

### `lesson_progress`

Tracks lesson completion per user.

```sql
id                uuid PK
user_id           uuid FK → auth.users
lesson_id         uuid FK → lessons
completed_at      timestamptz
sections_completed text[] DEFAULT '{}'
UNIQUE(user_id, lesson_id)
```

---

## Goal system tables

### `learner_weekly_goal_sets`

One row per user per week. The container for that week's goals.

```sql
id                           uuid PK
user_id                      uuid
goal_timezone                text   -- IANA timezone (e.g. 'Europe/Amsterdam')
week_start_date_local        date
week_end_date_local          date
week_starts_at_utc           timestamptz
week_ends_at_utc             timestamptz
generation_strategy_version  text DEFAULT 'v1'
generated_at                 timestamptz   -- when goals were computed
closing_overdue_count        integer       -- overdue count at week close
closed_at                    timestamptz
UNIQUE(user_id, week_starts_at_utc)
```

### `learner_weekly_goals`

Individual goals within a weekly goal set.

```sql
id                    uuid PK
goal_set_id           uuid FK → learner_weekly_goal_sets
goal_type             text  -- 'consistency' | 'recall_quality' | 'usable_vocabulary' | 'review_health'
goal_direction        text  -- 'at_least' | 'at_most'
goal_unit             text  -- 'count' | 'percent'
target_value_numeric  numeric
current_value_numeric numeric DEFAULT 0
status                text  -- 'on_track' | 'at_risk' | 'off_track' | 'achieved' | 'missed'
is_provisional        boolean DEFAULT false
provisional_reason    text
sample_size           integer DEFAULT 0
goal_config_jsonb     jsonb DEFAULT '{}'
UNIQUE(goal_set_id, goal_type)
```

### `learner_daily_goal_rollups`

One row per (user, local_date). Daily snapshot used to track streaks and weekly goal progress.

```sql
id                        uuid PK
user_id                   uuid
goal_timezone             text
local_date                date
study_day_completed       boolean DEFAULT false
recall_accuracy           numeric
recall_sample_size        integer DEFAULT 0
usable_items_gained_today integer DEFAULT 0
usable_items_total        integer DEFAULT 0
overdue_count             integer DEFAULT 0
UNIQUE(user_id, local_date)
```

---

## Infrastructure tables

### `profiles`

User display preferences. Created automatically on signup.

```sql
id                     uuid PK FK → auth.users
display_name           text
language               text     -- 'nl' | 'en' (UI language)
preferred_session_size integer  DEFAULT 15
daily_new_items_limit  integer  DEFAULT 10  -- new items introduced per session
timezone               text     -- IANA timezone (for goal system)
```

### `error_logs`

Write-only error log from the app. Admin-queryable via Supabase Studio.

```sql
id            uuid PK
user_id       uuid FK → auth.users (nullable)
page          text
action        text
error_message text
error_code    text
created_at    timestamptz
```

---

## Key indexes

```sql
idx_item_contexts_lesson            — item_contexts(source_lesson_id)
idx_item_contexts_item_anchor       — item_contexts(learning_item_id, is_anchor_context)
idx_learner_item_state_stage        — learner_item_state(user_id, stage)
idx_learner_skill_state_due         — learner_skill_state(user_id, next_due_at)
idx_review_events_user_time         — review_events(user_id, created_at)
idx_weekly_goal_sets_user_week      — learner_weekly_goal_sets(user_id, week_starts_at_utc)
idx_weekly_goal_sets_finalization   — learner_weekly_goal_sets(user_id, closed_at, week_ends_at_utc)
idx_stage_events_to_stage           — learner_stage_events(user_id, to_stage, created_at)
idx_stage_events_user_time          — learner_stage_events(user_id, created_at)
idx_daily_rollups_user_date         — learner_daily_goal_rollups(user_id, local_date)
```

---

## Leaderboard

`indonesian.leaderboard` is a view (not a table) that aggregates:
- `items_learned` — count of items at `retrieving`/`productive`/`maintenance`
- `lessons_completed` — from `lesson_progress`
- `total_seconds_spent` — sum of `learning_sessions.duration_seconds`
- `days_active` — distinct session dates

All authenticated users can read it. It is not cached — queried live.
