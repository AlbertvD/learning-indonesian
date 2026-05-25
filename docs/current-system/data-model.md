---
doc_type: current-system-reference
surface: scripts/migration.sql + scripts/migrations/*.sql
last_verified_against_code: 2026-05-14
status: stable
---

# Data Model

All tables live in the `indonesian` Postgres schema. `scripts/migration.sql` is the authoritative master applied by `make migrate` — idempotent, asserted by `make migrate-idempotent-check`. The capability + content-units subsystem (10 tables) still lives in standalone `scripts/migrations/*.sql` files until folded back; the comment block at the top of `scripts/migration.sql` lists them. Both file sets must be applied for a fresh DB rebuild.

For the *why* behind the capability schema, see `docs/adr/0001-capability-based-learning-core.md` and ADRs 0002–0005. For the publishing pipeline that writes these tables, see `docs/process/content-pipeline.md`.

**Source-of-truth regimes (ADR 0011).** These tables are written under *two* different rules. **Lesson-content tables** (`lessons`, `lesson_sections`, `lesson_dialogue_lines`, `audio_clips`) are a projection of canonical staging files — re-publish regenerates them. **Capability-content tables** (`learning_capabilities` + the typed exercise/distractor satellites) are **DB-authoritative after seeding**: the Capability Stage seeds them once, re-runs are idempotent/additive-only, and post-publish corrections live in the DB and are never overwritten by a routine re-publish. See `docs/adr/0011-capability-content-is-db-authoritative-after-seeding.md` and `CLAUDE.md` § Content Management.

---

## 1. Schema groups

| Group | Tables | Lives in |
|---|---|---|
| **Capability layer** | `learning_capabilities`, `capability_aliases`, `capability_artifacts`, `capability_content_units`, `content_units`, `lesson_page_blocks`, `learner_capability_state`, `capability_review_events`, `capability_resolution_failure_events` | standalone `scripts/migrations/2026-04-25-*.sql` + `2026-05-02-capability-resolution-failures.sql` |
| **Lesson activation** | `learner_lesson_activation` | `scripts/migration.sql:1561` (post-retirement #6) |
| **Content (vocab + sentences)** | `learning_items`, `item_meanings`, `item_answer_variants`, `item_contexts`, `item_context_grammar_patterns`, `grammar_patterns`, `exercise_variants` | `scripts/migration.sql` |
| **Lesson content** | `lessons`, `lesson_sections`, `audio_clips`, `podcasts`, `vocabulary` (legacy) | `scripts/migration.sql` |
| **Authoring pipeline** | `textbook_sources`, `textbook_pages`, `generated_exercise_candidates`, `exercise_review_comments`, `content_flags` | `scripts/migration.sql` |
| **Sessions + progress** | `learning_sessions` (lazy, capability-only), `lesson_progress` (orphan after #6) | `scripts/migration.sql` |
| **Legacy-retained** | `learner_item_state`, `learner_skill_state`, `review_events` | `scripts/migration.sql` (write paths retired; rows preserved as historical record) |
| **Infrastructure** | `profiles`, `user_roles`, `exercise_type_availability`, `error_logs` | `scripts/migration.sql` |

Retired tables (DROPPED with CASCADE in `scripts/migration.sql`) — listed only so readers know they used to exist: `learner_grammar_state` (retirement #2), `learner_weekly_goal_sets`, `learner_weekly_goals`, `learner_daily_goal_rollups`, `learner_stage_events`, `learner_analytics_events` (all #4), `learner_source_progress_events`, `learner_source_progress_state` (#6), `learner_lesson_engagement` (one-off), `anki_cards`, `card_reviews`, `card_set_shares`, `card_sets`, `user_progress`, `user_vocabulary`, `vocabulary` (all retirement #8 — orphan tables, zero rows, never managed in version control).

---

## 2. Capability layer (the schedulable unit)

ADR 0001 makes capabilities the schedulable unit. Every capability has a stable `canonical_key`, a readiness status, and a publication status. FSRS schedules **capabilities**, not items (ADR 0003).

### `learning_capabilities` (`capability-core.sql:5`)

```sql
id                    uuid PK
canonical_key         text UNIQUE
source_kind           text CHECK IN ('item','pattern','dialogue_line','podcast_segment','podcast_phrase','affixed_form_pair')
source_ref            text
capability_type       text
direction             text         -- typically 'id_to_l1' / 'l1_to_id'
modality              text         -- 'text' | 'audio' | ...
learner_language      text         -- usually 'nl'
projection_version    text         -- bump to invalidate stale projections
readiness_status      text CHECK IN ('ready','blocked','exposure_only','deprecated','unknown')
publication_status    text CHECK IN ('draft','published','retired')
source_fingerprint    text
artifact_fingerprint  text
metadata_json         jsonb
```

A capability is only schedulable when both `readiness_status='ready'` AND `publication_status='published'`.

### `capability_aliases` (`capability-core.sql:29`)

Alias keys that resolve to the same canonical capability. Lets the pipeline rename a capability without breaking FSRS history.

### `capability_artifacts` (`capability-core.sql:43`)

The content artifacts a capability needs to render. Artifact kinds include `base_text`, `meaning:l1`, `meaning:nl`, `meaning:en`, `accepted_answers:id`, `accepted_answers:l1`, `cloze_context`, `cloze_answer`, `audio_clip`, `transcript_segment`, `root_derived_pair`, `allomorph_rule`, `pattern_explanation:l1`, `pattern_example`, `minimal_pair`, `dialogue_speaker_context`, `podcast_gist_prompt`, `timecoded_phrase`, `production_rubric`.

Quality status is one of `draft`, `approved`, `blocked`, `deprecated`. As of the deterministic-snapshot-regen change (2026-05-12, status: implementing), the pipeline always emits `quality_status: 'approved'` — there is no manual approval gate.

### `capability_content_units` (`content-units-lesson-blocks.sql:45`)

Junction between `learning_capabilities` and `content_units`. Defines which content units are introduced by / referenced by which capabilities.

### `content_units` (`content-units-lesson-blocks.sql:5`)

Stable teachable objects (word, phrase, sentence, dialogue_line, podcast_segment, podcast_phrase, grammar_pattern, morphology_pattern, affixed_form_pair). Each has a stable slug.

### `lesson_page_blocks` (`content-units-lesson-blocks.sql:23`)

Learner-facing lesson reader content. Each row is a `block_kind` from the 7-value enum (`lesson_hero`, `reading_section`, `vocab_strip`, `dialogue_card`, `pattern_callout`, `practice_bridge`, `lesson_recap`). Carries `payload_json` for the renderer, `source_ref`, `source_refs[]`, and `content_unit_slugs[]`. The lesson renderer consumes these (see `docs/current-system/modules/lesson-renderer.md`). The capability scope for a lesson is derived from `learning_capabilities.lesson_id` (ADR 0006), not denormalized on this table.

### `learner_capability_state` (`capability-core.sql:56`)

Per-(user, capability) FSRS state. Replaces `learner_skill_state` for capability-era scheduling.

```sql
user_id              uuid FK auth.users
capability_id        uuid FK learning_capabilities
activation_state     text  -- 'dormant' | 'active' (only 'active' is scheduled)
review_count         int
stability            numeric         -- FSRS S
difficulty           numeric         -- FSRS D
retrievability       numeric         -- computed retrospectively
last_review_at       timestamptz
next_due_at          timestamptz
lapse_count          int
PRIMARY KEY (user_id, capability_id)
```

`activation_state` flips from `dormant` to `active` only on first successful review (ADR 0004 — review processor is the sole writer).

### `capability_review_events` (`capability-core.sql:83`)

Append-only log of every capability review. `session_id` is `text NOT NULL` with no FK (intentionally — events can be written before the `learning_sessions` row exists; the same RPC upserts the session row in the same transaction).

### `capability_resolution_failure_events` (`2026-05-02-capability-resolution-failures.sql:14`)

Append-only log of capability resolution failures (when the resolver can't materialize a render plan for a due capability). Diagnostic surface for the content pipeline.

---

## 3. Lesson activation (post-retirement #6)

### `learner_lesson_activation` (`migration.sql:1561`)

```sql
user_id      uuid FK auth.users
lesson_id    uuid FK indonesian.lessons
activated_at timestamptz DEFAULT now()
PRIMARY KEY (user_id, lesson_id)
```

Replaces the retired source-progress state machine. Existence of a row signals the learner has activated the lesson; the pedagogy planner then admits the lesson's capabilities for new-capability introduction.

**Write surface:** `set_lesson_activation(p_user_id, p_lesson_id, p_activated)` RPC (SECURITY DEFINER, identity-checked). Browser `GRANT` is `SELECT`-only. New sign-ins auto-activate lessons 1–3 via the `authStore.onAuthStateChange` SIGNED_IN hook (idempotent via `ON CONFLICT DO NOTHING`).

---

## 4. Content tables (vocab + sentences + exercises)

### `learning_items` (`migration.sql:~110`)

Canonical teachable unit for vocabulary, expressions, numbers, dialogues, and sentences.

```sql
id                uuid PK
item_type         text  -- 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
base_text         text  -- Indonesian text (authoritative form)
normalized_text   text  -- lowercase + punctuation-stripped (dedup key)
language          text  -- always 'id'
level             text  -- 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
pos               text  -- 12-value POS taxonomy (verb, noun, adjective, …)
source_type       text  -- 'lesson' | 'podcast' | 'flashcard' | 'manual'
source_vocabulary_id uuid
source_card_id    uuid
is_active         boolean
UNIQUE(normalized_text, item_type)
```

`pos` was added by the POS-aware-distractors work — runtime MCQ distractor pools filter by POS to avoid "verb in a noun-MCQ" misfires.

### `item_meanings`, `item_answer_variants`, `item_contexts`, `item_context_grammar_patterns`

Detail tables for translations, accepted answer variants, example sentences / cloze contexts, and grammar-pattern junctions. `item_contexts.context_type` is one of `example_sentence`, `dialogue`, `cloze`, `lesson_snippet`, `vocabulary_list`, `exercise_prompt`. Only `context_type='cloze'` is eligible for cloze exercises.

### `grammar_patterns`

Reusable grammar patterns with stable `slug`, `complexity_score`, and `confusion_group` (read by interleaving policy to keep confusable forms apart).

### `exercise_variants`

Published grammar exercises authored by the pipeline. Carries `payload_json` (display-safe) and `answer_key_json` (correctness data, server-only read).

---

## 5. Sessions + progress

### `learning_sessions` (post-retirement #5)

Rows are now materialised lazily by the `commit_capability_answer_report` RPC's upsert from the answer log. The first answer in a session inserts the row; each subsequent answer advances `ended_at` via `GREATEST(existing, submittedAt)`. **Only the capability path produces sessions** — `session_type` is always `'learning'` for new rows. Lesson reading and podcast listening no longer create rows. Sessions with zero answers leave no row. `duration_seconds` is a generated column. Browsers no longer write to this table directly — `authenticated` GRANT was narrowed to `SELECT` only.

### `lesson_progress` (orphan after retirement #6)

The legacy `progressService.markLessonComplete` write path retired. Existing rows were promoted to `learner_lesson_activation` via backfill. Reads survive only as a fallback in `get_lessons_overview`'s `has_started_lesson` derivation. A future retirement can drop the table after a quiet period.

---

## 6. Legacy-retained tables

Three tables stayed in the schema with their write paths retired (per the canonical-contract spec — "they stay as historical record"):

- **`learner_item_state`** (`migration.sql:173`) — per-(user, item) lifecycle stage. Stages: `new → anchoring → retrieving → productive → maintenance`. Replaced by `learner_capability_state` for the capability path. No new rows.
- **`learner_skill_state`** (`migration.sql:191`) — per-(user, item, skill_type) FSRS state. Replaced by `learner_capability_state`. No new rows.
- **`review_events`** (`migration.sql:212`) — append-only review log. Capability path writes to `capability_review_events` instead. `learnerProgressService.getCurrentStreakDays` reads from `capability_review_events`, not this table.

These are kept because dropping them would lose historical analytics data and a follow-up retirement is cheap to do later.

---

## 7. Infrastructure tables

### `profiles`

User display preferences. Created automatically on signup.

```sql
id                     uuid PK FK auth.users
display_name           text
language               text     -- 'nl' | 'en' (UI language)
preferred_session_size integer  DEFAULT 15
daily_new_items_limit  integer  DEFAULT 10
timezone               text     -- IANA timezone
```

### `user_roles`

Admin role table — controls access to admin-gated routes (`/admin/design-lab`, `/admin/page-lab`).

### `exercise_type_availability`

Per-exercise-type rollout state. `session_enabled` controls whether a type appears in sessions. Missing row = enabled (fail-open).

### `error_logs`

Write-only error log from the app. Admin-queryable via Supabase Studio. Logged via `logError` from `src/lib/logger.ts` — see CLAUDE.md "Logging" section.

---

## 8. Leaderboard view

`indonesian.leaderboard` is a view (not a table), refreshed live on read. Definition at `scripts/migration.sql:277-295`. **Currently uses legacy-retained tables:**
- `items_learned` derives from `learner_item_state` (stage `IN ('retrieving','productive','maintenance')`).
- `lessons_completed` derives from `lesson_progress` (orphan after retirement #6).
- `total_seconds_spent` / `days_active` derive from `learning_sessions` (now lazy + capability-only).

The view is **partially stale for capability-era users**: `items_learned` reads `learner_item_state`, which receives no new writes after retirement #5/#6 — so a user who only ever used the capability path will see `items_learned = 0`. A future rewrite should source `items_learned` from `learner_capability_state` (`review_count > 0` or equivalent). Tracked as a follow-up to this audit (2026-05-14).

---

## 9. RPCs (selected — for the full list, grep `migration.sql`)

| RPC | Purpose | File |
|---|---|---|
| `commit_capability_answer_report` | Atomic capability review commit (ADR 0004) — the only writer of `capability_review_events`, `learner_capability_state`, and (lazily) `learning_sessions` | `2026-04-25-capability-review-rpc.sql` |
| `set_lesson_activation` | The only writer of `learner_lesson_activation` | `migration.sql` (post-#6) |
| `get_lessons_overview` | Consolidated lesson-list query for the Lessons page | `2026-05-02-lessons-overview-function.sql` |
| `learnerProgressService.*` RPCs | Surfacing-layer reads: streak, memory health, review forecast, etc. | `2026-05-01-learner-progress-functions.sql` |

---

## 10. Notes for future work

- The 10 capability-era tables in `scripts/migrations/2026-04-25-*.sql` (+ `2026-05-02-capability-resolution-failures.sql`) are tracked for fold-back into `scripts/migration.sql`. Until then, fresh DB rebuilds need both file sets applied. The fold is non-trivial because it requires reconciling the lowercase-DDL style of the standalone files with the uppercase-DDL style of master (the master uses `IF NOT EXISTS` aggressively for idempotency, which the standalone files also do).
- `learner_item_state`, `learner_skill_state`, and `review_events` are candidates for a future retirement once the historical-analytics use case is resolved (could be folded into `capability_review_events` via a backfill view, or kept indefinitely as cold storage).
- **Leaderboard view rewrite** — currently reads from legacy tables; needs to source `items_learned` from `learner_capability_state` to stop reporting 0 for capability-era-only users. Tracked but not yet specced.
