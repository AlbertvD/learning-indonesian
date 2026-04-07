# Retention-First Learning System — V2 Design

> Date: 2026-03-30
> Status: Approved
> Scope: Evolve the app from SM-2 flashcard review to a retention-first learning system with FSRS scheduling, multi-skill tracking, and mixed exercise sessions.

## 1. Core Concept

The app moves from "review your flashcards" to "here's your daily learning session." A session engine pulls items from all lessons, tracks mastery per skill facet (recognition vs. recall), logs every interaction as an immutable event, and uses FSRS for scheduling.

Key properties:
- Sessions are cross-lesson by default
- Per-lesson vocabulary view with scoped practice is also available
- Preferred session size stored in user profile as an integer (slider in UI)
- "Continue" option after completing a session
- Lesson sections (dialogues, numbers, exercises) and vocabulary lists feed into the learning item pool

## 2. Data Sources

Two content sources feed the learning item pool:

1. **Vocabulary data** — absorbed from the existing `scripts/data/vocabulary.ts` data file. One vocab entry becomes one learning item candidate with Indonesian text, English/Dutch translations, example sentences, tags, and lesson provenance. `learning_items` is the runtime source of truth after import.
2. **Lesson section content** — dialogues, themed groups (numbers, greetings), grammar examples, exercises. Extracted via LLM (Claude) into individual teachable items with contexts. One-time extraction per lesson.

No derived or AI-generated content is needed at runtime. All content is seeded ahead of time.

### Dropped tables

The following tables are removed from the schema entirely (no existing user data to preserve):

- **`vocabulary`** — data absorbed into `learning_items` + `item_meanings`
- **`card_sets`**, **`anki_cards`**, **`card_reviews`**, **`card_set_shares`** — replaced by the new learning system
- **`user_progress`** — `current_level` and `grammar_mastery` are no longer tracked; progress is derived from `learner_item_state` and `learner_skill_state`

## 3. Schema Changes

### New content tables

**`learning_items`** — canonical teachable unit (one row per unique schedulable word/phrase/sentence sense, deduplicated conservatively across lessons)
- `id`, `item_type` (word/phrase/sentence/dialogue_chunk), `base_text`, `normalized_text` (lowercase, strip punctuation, trim whitespace — used for dedup)
- `language`, `level`
- `source_type` (lesson/podcast/flashcard/manual), `source_ref`, `source_ref_kind`
- `notes`, `is_active`, `created_at`, `updated_at`
- Lesson provenance tracked via `item_contexts.source_lesson_id`, not on this table — the same item can appear in multiple lessons. Seed script must not deduplicate on `normalized_text` alone when meanings diverge. If the same normalized form carries materially different meanings or usages, create separate learning items or require an explicit merge decision during import.

**`item_meanings`** — translations per item
- `id`, `learning_item_id`, `translation_language` (en/nl), `translation_text`
- `sense_label`, `usage_note`, `is_primary`

**`item_contexts`** — example sentences and dialogue snippets
- `id`, `learning_item_id`, `context_type` (example_sentence/dialogue/cloze/lesson_snippet)
- `source_text`, `translation_text`, `difficulty`, `topic_tag`
- `is_anchor_context`, `source_lesson_id`, `source_section_id`

**`item_answer_variants`** — accepted alternative answers for typed recall
- `id`, `learning_item_id`, `variant_text`, `variant_type`, `language`, `is_accepted`, `notes`
- Variants suggested by extraction should not be accepted automatically. They should default to review-required status before affecting answer correctness or FSRS ratings.

### New learner tables

**`learner_item_state`** — overall item lifecycle per user
- `id`, `user_id`, `learning_item_id`
- `stage` (new/anchoring/retrieving/productive/maintenance)
- `introduced_at`, `last_seen_at`, `priority`, `origin`
- `times_seen`, `is_leech`, `suspended`
- `gate_check_passed` (boolean, nullable — set after the anchoring recall gate check; determines promotion threshold out of retrieving)
- `updated_at`

**`learner_skill_state`** — per-skill FSRS state per user per item
- `id`, `user_id`, `learning_item_id`, `skill_type` (recognition/recall)
- `stability`, `difficulty`, `retrievability`
- `last_reviewed_at`, `next_due_at`
- `success_count`, `failure_count`, `lapse_count`, `consecutive_failures` (reset to 0 on success)
- `mean_latency_ms`, `hint_rate`
- `updated_at`

**`review_events`** — immutable event log
- `id`, `user_id`, `learning_item_id`, `skill_type`, `exercise_type`
- `session_id` (FK to existing `learning_sessions`), `was_correct`, `score`, `latency_ms`
- `hint_used`, `attempt_number`, `raw_response`, `normalized_response`
- `feedback_type`, `scheduler_snapshot` (jsonb — FSRS after-state: stability, difficulty, retrievability, next_due_at. Forensic/debugging only, no features read it), `created_at`
- Append-only by design. Table growth is not a concern at current scale. Partitioning or archival can be added later if needed.

### Modified tables

- `profiles` — add `preferred_session_size` (integer, default 15, representing number of interactions per session)
- `learning_sessions` — update CHECK constraint: `session_type IN ('lesson', 'learning', 'podcast', 'practice')`. The new `'learning'` type is used for all sessions created by the session engine. Legacy `'review'` type is removed.

### Leaderboard changes

- Replace `vocabulary_count` metric with `items_learned` — count of `learner_item_state` rows where stage is past anchoring (retrieving, productive, or maintenance)
- Remove `current_level` metric (was sourced from the now-dropped `user_progress` table)
- The leaderboard SQL view must be rewritten:
  ```sql
  -- items_learned: count learner_item_state rows past anchoring
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS items_learned
    FROM indonesian.learner_item_state
    WHERE stage IN ('retrieving', 'productive', 'maintenance')
    GROUP BY user_id
  ) lis ON lis.user_id = p.id
  ```
- The frontend `LeaderboardMetric` type must be updated to replace `vocabulary_count` with `items_learned` and remove `current_level`
- Remaining metrics (`total_seconds_spent`, `lessons_completed`, `days_active`) are unchanged

### Skipped for now

- `item_forms` — Indonesian morphology is simple enough to not need this
- `item_media` — no per-word audio yet
- `item_relationships` — no confusable-item data yet
- `session_queue_items` — sessions built in-memory first

### Indexes

- `learning_items(normalized_text, item_type)` — unique
- `item_contexts(source_lesson_id)`
- `learner_item_state(user_id, learning_item_id)` — unique
- `learner_item_state(user_id, stage)`
- `learner_skill_state(user_id, next_due_at)`
- `learner_skill_state(user_id, learning_item_id, skill_type)` — unique
- `review_events(user_id, created_at)`
- `item_contexts(learning_item_id, is_anchor_context)`

### RLS

- Content tables: readable by all authenticated users, writable by admin only
- Learner tables: readable and writable only by the owning user
- Review events: SELECT + INSERT for owning user (no UPDATE/DELETE grant) — append-only by design. SELECT needed for progress page, session history, and demotion checks.

### Grants

- Content tables (`learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`): authenticated SELECT
- Learner tables (`learner_item_state`, `learner_skill_state`): authenticated SELECT, INSERT, UPDATE
- Review events (`review_events`): authenticated SELECT, INSERT (no UPDATE/DELETE)

## 4. FSRS Integration

Use the `ts-fsrs` library (TypeScript implementation of FSRS-6 algorithm). It handles stability, difficulty, retrievability, and interval calculation out of the box.

- FSRS state fields stored on `learner_skill_state`
- Each review event is fed to FSRS to compute the next scheduling state
- FSRS operates per (user, item, skill_type) triple
- Default FSRS-6 weights are used at launch. Parameter optimization requires ~1000+ reviews to be meaningful — can be explored once sufficient review data exists.

FSRS handles **when** to review. Our stage system handles **how** to review (exercise selection).

### Persistence rule

Review submission should be treated as one logical write unit:

- insert `review_events`
- update `learner_skill_state`
- update `learner_item_state`
- return final saved state to the UI

For production use, this should execute atomically via a single RPC, edge function, or database transaction. Client-side multi-write orchestration is acceptable only as a temporary implementation detail, not as the intended long-term write path.

### Rating mapping

FSRS ratings are inferred from exercise outcomes — not self-reported by the user. All exercise types have objectively correct answers, so self-rating would be redundant.

| Outcome | FSRS Rating |
|---------|-------------|
| Incorrect | Again |
| Correct + hint used | Hard |
| Correct + fuzzy match (typo accepted) | Hard |
| Correct | Good |

No `Easy` rating at launch. Adding it later would require per-exercise-type speed thresholds, which need real data to calibrate. Three ratings (Again/Hard/Good) are sufficient for scheduling accuracy.

## 5. Skill Facets

Two facets at launch:

- **recognition** — can you identify the meaning when shown the Indonesian word?
- **recall** — can you produce the Indonesian word when given the meaning?

Each facet gets its own FSRS state, so an item can be due for recall even if recognition is strong.

### Future facets (when exercise types expand)

- `listening_recognition` — identify from audio
- `spoken_production` — say it aloud
- `context_use` — use correctly in a sentence

## 6. Learning Stages

Items progress through stages that control exercise selection:

| Stage | Description | Allowed exercises |
|-------|-------------|-------------------|
| new | Never seen. Eligible for introduction. | — |
| anchoring | Just introduced. Low-friction practice. | Recognition MCQ, then one typed recall as gate check |
| retrieving | Recognized reliably. Active retrieval. | Typed recall (words), Cloze (sentences) |
| productive | Can actively produce it. Mixed exercises. | All three types |
| maintenance | Long-term stable. Low-frequency review. | All three types, occasionally harder |

### Promotion rules

Promotion requires **both facets** to meet the threshold (all values are initial, subject to tuning):

| Transition | Criteria |
|---|---|
| new → anchoring | Automatic on first presentation |
| anchoring → retrieving | Recognition: stability ≥ 1.8 AND success_count ≥ 3. At least one recall attempt (gate check — see below). Result does not block promotion but affects retrieving threshold. |
| retrieving → productive | Both facets: stability ≥ 5.0 AND success_count ≥ 3 (if gate check passed) or success_count ≥ 5 (if gate check failed) |
| productive → maintenance | Both facets: stability ≥ 21.0 AND zero lapses in last 5 reviews per facet |

**Anchoring gate check:** Once recognition hits its threshold, the engine serves one typed recall exercise before promoting. The item promotes regardless — the retrieving stage is designed to build recall through practice. However, the gate check result is recorded on `learner_item_state.gate_check_passed` and affects the promotion threshold out of retrieving: pass requires success_count ≥ 3, fail requires success_count ≥ 5. The recall FSRS state is initialized fresh (neutral) regardless of the gate check outcome — no penalty baked into scheduling.

### Demotion rules

**2 consecutive failures** on any single facet drops the item one stage, resetting to easier exercises. Consecutive failures are tracked via the `consecutive_failures` counter on `learner_skill_state` (reset to 0 on success). Demotion floors at `anchoring` — items never drop back to `new`.

### Stage storage

Stage is stored on `learner_item_state` as the source of truth. It is recomputed and written after every review event based on the promotion/demotion rules above. The review event handler is the single update path.

> **Scaling note:** At current scale, sequential exercise delivery acts as a natural lock against concurrent stage updates. If the app later supports parallel sessions (e.g., mobile + desktop), wrap the review event insert + state update in a transaction with `SELECT ... FOR UPDATE` on the `learner_item_state` row.

## 7. Exercise Types

### Launch exercises

1. **Recognition MCQ** — "What does 'rumah' mean?" with 4 options. Distractors pulled from other items at same level. For new/anchoring items.
2. **Typed recall** — "How do you say 'house' in Indonesian?" with text input + answer normalization. For words/phrases at retrieving+ stage.
3. **Cloze** — "Saya tinggal di ___ besar" with text input for the missing word. Uses item contexts. For sentences/phrases and items moving toward productive use.

### Item type treatment

- **Words/short phrases** → recognition (MCQ) + recall (typed recall)
- **Sentences/dialogue chunks** → recognition (MCQ) + recall (cloze)

Cloze exercises feed the `recall` skill_type — producing the missing word from context is active retrieval.

### Future exercise types

- Cued recall — recall with first-letter hint or contextual support
- Listen and select — hear audio, pick the correct meaning
- Listen and type — hear audio, type what you heard
- Sentence build — arrange words into correct order
- Spoken recall — say the word/phrase aloud with speech scoring
- Dialogue reply — respond to a conversational prompt in context

### Answer normalization

All typed responses normalized before matching:
- Trim whitespace
- Case folding
- Punctuation stripping
- Parenthetical removal

Accepted answer variants checked from `item_answer_variants` table. Variants may be suggested by the LLM during content extraction, but they should not automatically become accepted answers unless they pass explicit validation or review.

**Fuzzy matching fallback:** Levenshtein tolerance (distance ≤ 1) is applied only when matching against the canonical answer and known variants from `item_answer_variants`. It acts as typo forgiveness on top of the variants list, not as a freestanding matcher. This prevents accepting genuinely wrong words that happen to be close (e.g., "membeli" vs "memberi").

### Feedback

After every exercise:
- Correct/incorrect indicator
- The correct answer
- One example sentence (anchor context)

Keep it brief. No long grammar explanations inside the session shell.

## 8. Session Queue (`src/lib/sessionQueue.ts`)

The session engine was replaced in April 2026 with a simpler FSRS-driven due queue. The old stage-based priority logic caused anchoring items to be reviewed multiple times per day at R≈1, which drove stability to zero instead of growing it. The fix: trust `next_due_at` completely.

### Flow

1. **User opens app** → Dashboard shows due count, current lesson, "Start Today's Session"
2. **Start session** → INSERT a `learning_sessions` row. `buildSessionQueue` assembles a queue:
   - **Due items:** any item where any skill has `next_due_at ≤ now`, sorted most-overdue first
   - **New items:** gated by lesson mastery (70% of prior lesson's items must be past anchoring), capped by `dailyNewItemsLimit`
   - Due items fill the queue first, then new items, trimmed to `preferredSessionSize`
3. **Exercise delivery** → One item at a time:
   - Exercise type chosen by item stage and item type (new/anchoring → recognition MCQ; retrieving+ → typed recall or cloze)
   - User answers → immediate feedback
   - Result logged to `review_events`
   - `learner_skill_state` updated via FSRS
   - `learner_item_state` stage promoted/demoted if threshold met
4. **Session complete** → summary screen with stats; session row closed
5. **Wrong answer requeue:** Incorrect items are reinserted 3 positions ahead so the user revisits them before the session ends

### Session size

Users set their preferred session size via a slider in their profile (stored as `profiles.preferred_session_size`, default 15). The queue is trimmed to this count.

### Session modes

| Mode | Behavior |
|------|----------|
| `standard` | Due items + new items, up to `preferredSessionSize` |
| `backlog_clear` | Due items only — no new items introduced |
| `quick` | Capped at 5 items regardless of profile setting |

Unknown or removed mode values (e.g. old `recall_sprint`, `push_to_productive`) fall back to `standard` silently.

### Queue assembly rules

- No stage-based priority — `next_due_at` is the sole scheduling signal
- Most overdue items appear first
- Up to 2 recognition MCQ items placed at the front of the ordered queue
- New items appear after all due items
- Lesson gate: new items from lesson N are only introduced once ≥70% of lesson N−1 items are past anchoring

### Edge cases

- **Nothing due, nothing new:** Session returns empty; UI shows "no exercises available"
- **Overloaded queue (many due items):** Most-overdue first; trimmed to session size. No items are skipped in favour of stage-based priority
- **Insufficient MCQ distractors:** Pulled from other lessons, preferring same level > any lesson
- **Mid-session quit:** Review events are saved as they happen — no all-or-nothing
- **Same item due for both recognition and recall:** Appears twice in the queue, spaced apart

### Scoped sessions

"Practice This Lesson" passes `lessonFilter=<lessonId>` to `buildSessionQueue`, which restricts eligible items to those with an `item_contexts` row linking to that lesson. Same FSRS scheduling, just scoped.

## 9. Navigation & Pages

### App structure

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Primary entry. Due count, current lesson, "Start Session" CTA |
| Lessons | `/lessons` | Browse all lessons by level |
| Lesson Detail | `/lesson/:id` | Learn tab (sections/audio) + Vocabulary tab (items with mastery, "Practice This Lesson") |
| Learn Session | `/session` | Exercise delivery, progress bar, feedback, summary |
| Podcasts | `/podcasts` | Stays as-is |
| Practice | `/practice` | Future: targeted skill practice. Placeholder for now. |
| Progress | `/progress` | Memory strength, recognition vs recall, lesson completion |
| Profile | `/profile` | Settings including preferred session size |

### Removed entirely

- `/cards`, `/sets`, `/review` — routes and all associated components, services, and stores are deleted. No legacy data to preserve.

### Dashboard components

- **Header strip**: streak, minutes today, items due
- **Hero card**: "Start Today's Session" with summary (X reviews due, Y new from Lesson Z, W weak items)
- **Quick actions**: Continue Lesson, Practice Weak Words
- **Progress snapshot**: stable items, production-ready items, lesson progress

### Lesson vocabulary tab

Shows all learning items from that lesson with:
- Indonesian text and translation
- Mastery indicator per item (stage + skill strength)
- "Practice This Lesson" button → launches scoped session

This replaces the old per-lesson flashcard decks. Content is richer because it includes vocabulary, dialogues, numbers, and exercises — not just manually created cards.

## 10. Content Pipeline

### Current pipeline (unchanged)

```
make seed-lessons       → lessons + lesson_sections
make seed-vocabulary    → vocabulary
make seed-podcasts      → podcast audio + metadata
```

### New additions

```
make extract-learning-items LESSON=<N> ANTHROPIC_API_KEY=<key>
# Reads:   lesson sections from scripts/data/lesson-<N>.ts
#          + vocabulary data from scripts/data/vocabulary.ts (for that lesson)
# Sends:   section content to Claude with structured output prompt
# Writes:  scripts/data/learning-items-lesson-<N>.ts
# Then:    manual review/edit before seeding
#
# Output per item:
#   - learning_item: item_type, base_text, normalized_text, language, level
#   - meanings[]: translation_language, translation_text, sense_label, is_primary
#   - contexts[]: context_type, source_text, translation_text, is_anchor_context
#   - answer_variants[]: variant_text, variant_type, language
#
# Section type → item type mapping:
#   - Vocabulary sections → word items
#   - Dialogue sections → dialogue_chunk items
#   - Exercise sections → sentence items
#   - Number/greeting groups → phrase items
#
# Prompt and structured output schema live in the script itself.

make seed-learning-items SUPABASE_SERVICE_KEY=<key>
# Reads:   vocabulary table + extracted learning item files
# Writes:  learning_items + item_meanings + item_contexts
# Idempotent, safe to re-run
```

### Removed

```
make seed-flashcards    → deleted, learning items replace public decks
make seed-vocabulary    → deleted, absorbed into seed-learning-items
```

### Updated chain

```
make seed-all = seed-lessons + seed-podcasts + seed-learning-items
```

## 11. Supabase Requirements

### Schema changes

- New tables as defined in section 3
- Drop old tables: `vocabulary`, `card_sets`, `anki_cards`, `card_reviews`, `card_set_shares`, `user_progress`
- RLS policies for all new learner tables (owner-only read/write)
- RLS policies for content tables (authenticated read, admin write)
- Grants: authenticated SELECT on content tables, authenticated SELECT/INSERT/UPDATE on learner tables, authenticated SELECT/INSERT on review_events

### homelab-configs changes

- [x] PostgREST: no change needed (indonesian schema already exposed)
- [ ] Kong: no change needed
- [ ] GoTrue: no change needed
- [ ] Storage: no new buckets needed

### Health check additions

- Add `learning_items`, `learner_skill_state`, `review_events` table checks to `check-supabase-deep`
- Add RLS verification for new learner tables

## 12. Migration Strategy

- No existing user data to preserve — clean slate
- Old routes (`/cards`, `/sets`, `/review`) and associated components, services, stores, and the SM-2 implementation (`src/lib/sm2.ts`) are removed only after V2 review/session flow is working end-to-end
- Feature flags are optional, but the legacy review path should remain available until V2 seeding, submission, and session completion are stable

### Migration SQL ordering

The migration must execute in this order to avoid referencing dropped objects while preserving a working review path during rollout:

1. `DROP VIEW indonesian.leaderboard` — references `user_progress` and vocabulary-related joins that will be removed
2. `UPDATE indonesian.learning_sessions SET session_type = 'practice' WHERE session_type = 'review'` — existing `'review'` rows would violate the new CHECK constraint
3. Alter `learning_sessions` CHECK constraint to `IN ('lesson', 'learning', 'podcast', 'practice')`
4. Create new tables (`learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`, `learner_item_state`, `learner_skill_state`, `review_events`)
5. Seed and validate V2 content
6. Build and verify V2 review/session flows
7. Recreate `indonesian.leaderboard` view with `items_learned` from `learner_item_state`
8. Only after V2 is working end-to-end, drop old tables (`vocabulary`, `card_sets`, `anki_cards`, `card_reviews`, `card_set_shares`, `user_progress`)
