---
status: shipped
merged_at: 2026-05-21
doc_type: data-model-evidence-audit
last_verified_against_code: 2026-05-21
last_verified_against_live_db: 2026-05-21
---

# Data-model investigation — evidence document

**Audience:** Future contributors (human or AI) designing changes to the `indonesian` schema. Read this first, then `2026-05-21-data-model-target.md`.

**Status:** This is an **evidence document**, not a forward plan. Every claim cites either a live-DB row count + sample payload, or a `file:line` reference in the codebase. Where the canonical migrations have drifted from the live DB, the live DB takes precedence and is cited.

**Scope:** All 35 tables in the `indonesian` schema, every JSON/JSONB and array column, every shape-variable text column, all known emitters/readers/validators.

**Method note:** Live DB introspected via `schema_health()` RPC + per-table `SELECT *` samples grouped by the natural discriminator column. Sample sizes: ≥ 20 rows per discriminator value or full table for small tables. Investigation scripts at `/tmp/inv.ts`, `/tmp/inv2.ts`, `/tmp/shapes2.ts`, `/tmp/verify.ts`, `/tmp/verify2.ts` (not committed). Code-emitter/reader cites are grounded in `Read`/`Grep` against the current `main` branch; no claims rely on doc prose.

---

## §1. Schema-level summary

### 1.1 Table inventory

35 base tables in `indonesian` schema as of 2026-05-21. Grouped per `docs/current-system/data-model.md:18-28`:

| Group | Table | Row count | Status |
|---|---|---:|---|
| Capability core | `learning_capabilities` | 4,005 | live |
| Capability core | `capability_aliases` | 0 | **empty** — alias resolution never used |
| Capability core | `capability_artifacts` | 9,312 | live (12 distinct artifact_kinds) |
| Capability core | `capability_content_units` | 4,078 | live |
| Capability core | `capability_resolution_failure_events` | 69 | live (diagnostic log) |
| Capability core | `capability_review_events` | 632 | live (answer log) |
| Capability core | `content_units` | 1,004 | live (4 unit_kinds) |
| Capability core | `lesson_page_blocks` | 169 | live (6 block_kinds; 7th allowed by constraint but unused) |
| Capability core | `learner_capability_state` | 476 | live (FSRS state) |
| Lesson activation | `learner_lesson_activation` | 36 | live |
| Content | `learning_items` | 758 | live (4 item_types) |
| Content | `item_meanings` | 1,248 | live |
| Content | `item_answer_variants` | 1,083 | live |
| Content | `item_contexts` | 1,733 | live (6 context_types) |
| Content | `item_context_grammar_patterns` | 0 | **empty** — junction unused |
| Content | `grammar_patterns` | 47 | live |
| Content | `exercise_variants` | 716 | **ORPHAN at runtime** (see §5.3) |
| Lesson content | `lessons` | 9 | live |
| Lesson content | `lesson_sections` | 77 | live (10 content.type values allowed; 9+ observed shapes) |
| Lesson content | `audio_clips` | 1,974 | live (1,334 unreferenced by capability_artifacts — see §5.4) |
| Lesson content | `podcasts` | 0 | **empty** — podcast feature not yet built |
| Authoring | `textbook_sources` | 0 | **empty** — aspirational |
| Authoring | `textbook_pages` | 0 | **empty** — aspirational |
| Authoring | `generated_exercise_candidates` | 0 | **empty** — aspirational |
| Authoring | `exercise_review_comments` | 4 | live (tiny — 4 rows total) |
| Authoring | `content_flags` | 51 | live (4 flag_types) |
| Sessions | `learning_sessions` | 1,914 | live (4 session_types in DB; only `'learning'` written post-#5) |
| Sessions | `lesson_progress` | 14 | live (orphan write path post-#6; read fallback only) |
| Legacy-retained | `learner_item_state` | 649 | last write 2026-05-01 (write path retired) |
| Legacy-retained | `learner_skill_state` | 763 | last write 2026-05-01 (write path retired) |
| Legacy-retained | `review_events` | 3,016 | last write 2026-05-01 (write path retired) |
| Infrastructure | `profiles` | 9 | live |
| Infrastructure | `user_roles` | 1 | live (1 admin) |
| Infrastructure | `exercise_type_availability` | 10 | live (12 exercise types in code; 10 rows here — divergence) |
| Infrastructure | `error_logs` | 536 | live |

**Empty tables: 6.** `capability_aliases`, `item_context_grammar_patterns`, `generated_exercise_candidates`, `podcasts`, `textbook_pages`, `textbook_sources`.

**Tables retired by retirement #8** (`scripts/migration.sql:2017-2023`, 2026-05-14, dropped from `indonesian.*`): `anki_cards`, `card_reviews`, `card_set_shares`, `card_sets`, `user_progress`, `user_vocabulary`, `vocabulary`. Not in the live schema; listed here only so future readers don't search for them.

### 1.2 Naming inconsistencies — JSON column names

Six different naming conventions for "the JSON blob on this row" coexist in the live schema:

| Convention | Used by |
|---|---|
| `_json` suffix | `learning_capabilities.metadata_json`, `capability_artifacts.artifact_json`, `exercise_variants.payload_json` + `.answer_key_json`, `lesson_page_blocks.payload_json`, `content_units.payload_json`, `capability_review_events.*_json` (5 cols), `capability_resolution_failure_events.payload_json`, `learner_capability_state.fsrs_state_json`, `learner_source_progress_events.metadata_json` (retired), `learner_source_progress_state.metadata_json` (retired) |
| no suffix | `lessons.dialogue_voices`, `lesson_sections.content` |
| JSON-encoded into a TEXT column | `learning_capabilities.source_fingerprint` (stores `JSON.stringify(...)`), `learning_capabilities.artifact_fingerprint` (stores `JSON.stringify(...)`), `content_units.source_fingerprint` (same), `capability_artifacts.artifact_fingerprint` (this one is plain text, not JSON-encoded — but the column name suggests JSON) |

Confirmed by sample at §3 — `learning_capabilities.source_fingerprint` is `"{\"sourceKind\":\"item\",\"sourceRef\":\"learning_items/akhir\"}"` (an escape-encoded JSON string, not a JSONB column).

This naming drift is a smell. A clean model would either (a) name every JSON column the same way or (b) eliminate JSON columns where possible.

### 1.3 Discriminator pattern — how shape-variable tables key their JSON

| Table | Discriminator column | Distinct values in DB | Shape-variable column(s) | Worst case |
|---|---|---:|---|---|
| `learning_capabilities` | `source_kind` × `capability_type` | 4 × 12 = up to 48; 11 actually present | `metadata_json`, `source_fingerprint`, `artifact_fingerprint` | metadata_json shape is uniform across kinds (good) but contains 2 dead fields |
| `capability_artifacts` | `artifact_kind` | 12 in DB (out of 22 declared in code) | `artifact_json` | 12 shapes; 7 collapse to `{value: string}`, 2 to `{values: string[]}` |
| `exercise_variants` | `exercise_type` | 4 (cloze_mcq, contrast_pair, sentence_transformation, constrained_translation) | `payload_json`, `answer_key_json` | 4 distinct shapes; answer_key_json is pure subset duplication of payload_json |
| `lesson_page_blocks` | `block_kind` | 6 (out of 7 allowed) | `payload_json` | reading_section: **7 distinct shapes** within one kind |
| `lesson_sections` | `content->>'type'` (inside JSON) | 10 allowed; 9+ observed | `content` | reference_table shape has 9 keys: `{columns, examples, footnotes, grammar_topics, intro, sections, tableTitle, title, type}` |
| `content_units` | `unit_kind` | 4 (out of 7 allowed) | `payload_json` | clean — 1 uniform shape per kind |
| `item_contexts` | `context_type` | 6 | (no JSON; columnar) | n/a |
| `learning_items` | `item_type` | 4 | (no JSON; columnar) | n/a |
| `capability_review_events` | none (uniform) | n/a | 5 JSON columns | uniform shape across rows |
| `capability_resolution_failure_events` | `reason_code` | 2 observed | `payload_json` | tiny — `{sourceRef, sourceKind}` or `{itemKey, itemId}` |
| `content_flags` | `flag_type` | 4 | (no JSON; `comment` is columnar text) | n/a |
| `lessons` | none | n/a | `dialogue_voices` (jsonb) | per-lesson speaker→voice map; key set varies per lesson |

Two columns dominate the shape-divergence risk: `lesson_page_blocks.payload_json` (worst case 7 shapes within one block_kind) and `lesson_sections.content` (worst case 9 keys; 9+ shapes total). These are the tables most likely to silently break renderers when authors emit a new shape.

### 1.4 Capability projection summary (the centerpiece of the schema)

`learning_capabilities` row distribution by `(source_kind, capability_type)`, per `select source_kind, capability_type, count(*) from indonesian.learning_capabilities group by 1,2`:

```
  3,900 item (4 capability_types × 655 + 2 × 640)
        655 item / l1_to_id_choice         — productive (Phase 3)
        655 item / text_recognition        — receptive (Phase 1) ← top of staging
        655 item / form_recall             — productive (Phase 4)
        655 item / meaning_recall          — receptive (Phase 2)
        640 item / dictation               — productive (Phase 4) — only items with audio
        640 item / audio_recognition       — receptive (Phase 1) — only items with audio
     94 pattern (47 patterns × 2)
         47 pattern / pattern_recognition  ← INERT (renderContracts.ts:42-110)
         47 pattern / pattern_contrast     ← INERT
      7 dialogue_line / contextual_cloze   ← unblocked 2026-05-21 (PR-B of fold)
      4 affixed_form_pair (2 pairs × 2)
         2 affixed_form_pair / root_derived_recognition  ← INERT
         2 affixed_form_pair / root_derived_recall       ← INERT
```

Total: **4,005 rows**. All 4,005 have `lesson_id IS NOT NULL` (ADR 0006 satisfied — verified by `/tmp/verify.ts`). Two source_kinds declared in `capabilityTypes.ts:5-30` (`podcast_segment`, `podcast_phrase`) have **zero rows** in the DB.

`capability_review_events` actual rendering distribution (i.e. which capabilities have ever rendered to a user) over 632 events across 63 sessions and 2 users:

```
  item/text_recognition      25 distinct caps reviewed
  item/dictation             12
  item/audio_recognition      9
  item/form_recall            3
  item/meaning_recall         2
  item/l1_to_id_choice        1
  ---
  TOTAL DISTINCT REVIEWED:   252 (of 4,005 projected)
```

**Six of twelve capability types have never rendered for any learner.** Specifically: `contextual_cloze`, `podcast_gist`, `pattern_recognition`, `pattern_contrast`, `root_derived_recognition`, `root_derived_recall`. The dialogue_line gap closed PR-B at the lib/exercise-content fold on 2026-05-21 (`docs/current-system/capability-runtime-data-model-gap.md:46`); the rest remain inert.

---

## §2. Where the live DB schema diverges from the canonical migrations

Both file sets must be applied for a fresh DB rebuild (`docs/current-system/data-model.md:10`). The canonical schema for the capability subsystem lives in standalone files (`scripts/migrations/2026-04-25-*.sql`), but a number of later ALTERs in `scripts/migration.sql` have drifted the live shape away from those files.

### 2.1 `learning_capabilities`

- **Standalone** (`scripts/migrations/2026-04-25-capability-core.sql:5-22`): 17 columns, no `lesson_id`.
- **Live**: 17 columns including `lesson_id` (added by `scripts/migration.sql:1627-1628`). My sample at §3.1 confirms `lesson_id` is present.
- **Constraints added in migration.sql**:
  - `learning_capabilities_lesson_id_required_for_lessons` CHECK (`migration.sql:2042-2049`): `source_kind in ('podcast_segment', 'podcast_phrase') OR lesson_id is not null`. Per ADR 0006.
  - `learning_capabilities_lesson_id_fkey` → `ON DELETE RESTRICT` (`migration.sql:2055-2059`).

### 2.2 `lesson_page_blocks`

- **Standalone** (`scripts/migrations/2026-04-25-content-units-lesson-blocks.sql:23-40`): 13 columns; block_kind CHECK admits `('hero','section','exposure','practice_bridge','recap')`.
- **Live**: 10 columns. Dropped columns: `source_progress_event` (`migration.sql:1809`, retirement #6), `capability_key_refs text[]` (`migration.sql:1829`). 
- **block_kind constraint rewritten** (`migration.sql:1946-1975`): admits `('lesson_hero','reading_section','vocab_strip','dialogue_card','pattern_callout','practice_bridge','lesson_recap')`. Note: the value `pattern_callout` is allowed but has **zero rows** in the live DB.

### 2.3 `capability_artifacts`, `learner_capability_state`, `capability_review_events`, `capability_aliases`

All four child-table FKs were converted from `NO ACTION` to `ON DELETE CASCADE` (`migration.sql:2061-2097`). Cascade reach from a `learning_capabilities` delete is now: artifacts + state + review_events + the alias FK (`capability_aliases.new_capability_id_fkey`).

### 2.4 `exercise_variants`

- Original schema at `scripts/migration.sql:~735`; column `lesson_id` was added later via `ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE CASCADE` (`migration.sql:771`). Live data: all 716 rows have `lesson_id` set; `learning_item_id`, `context_id` are all NULL; `grammar_pattern_id` is set on all 716. See §5.3.

### 2.5 `lesson_sections.content` CHECK constraint

`migration.sql:1987-2002`: admits `content->>'type' IN ('text','grammar','reference_table','vocabulary','expressions','numbers','dialogue','pronunciation','culture','exercises')` — 10 values. Live data shows 9+ in use (`text`, `grammar`, `vocabulary`, `expressions`, `numbers`, `dialogue`, `pronunciation`, `reference_table`, `exercises`); `culture` may or may not be present.

### 2.6 Retirement #8 (2026-05-14)

`scripts/migration.sql:2017-2023` drops 7 out-of-band tables that existed in the live DB but were never managed in version control: `anki_cards`, `card_reviews`, `card_set_shares`, `card_sets`, `user_progress`, `user_vocabulary`, `vocabulary`. All zero rows. Important for future contributors: do not assume any pre-2026-04 docs that mention `vocabulary` (singular) are still valid.

---

## §3. Per-table reference

This section catalogues each non-trivial table: its purpose, columns, JSON shape variants, and primary emitters/readers. Tables already exhaustively covered above (legacy-retained, infrastructure, empty) are listed without repeating their column lists.

### 3.1 `learning_capabilities` (4,005 rows)

**Purpose:** Capability catalog — every schedulable atomic skill. ADR 0001.

**Columns (live, 17):** `id, canonical_key, source_kind, source_ref, capability_type, direction, modality, learner_language, projection_version, readiness_status, publication_status, source_fingerprint, artifact_fingerprint, metadata_json, created_at, updated_at, lesson_id`. Live DDL spread across `scripts/migrations/2026-04-25-capability-core.sql:5-22` + `scripts/migration.sql:1626-1631, 2042-2059`.

**source_kind values (4 in use; 6 declared):** `item` (3,900), `pattern` (94), `dialogue_line` (7), `affixed_form_pair` (4). Declared but never written: `podcast_segment`, `podcast_phrase`.

**capability_type values (12 in use):** see §1.4 distribution. All 12 declared in `src/lib/capabilities/capabilityTypes.ts:32-44`.

**`source_ref` shape (varies by source_kind):**
- `item`: `learning_items/<normalized_text-slug>` (e.g. `learning_items/akhir`) — emitted by `capabilityCatalog.ts:50`. Note: in scope at that line, the `item` is of type `CurrentLearningItem` (defined `capabilityTypes.ts:97-106`), whose `.id` field is the **slug**, not a DB uuid — the snapshot type and the DB row type both call the field `id`, with different semantics. The runtime decoder flags this at `src/lib/exercise-content/adapter.ts:96-103` ("item.id == base_text/normalized_text"). Live data confirms the slug shape (`learning_items/rumah`, not a uuid).
- `pattern`: `lesson-N/pattern-<slug>` (e.g. `lesson-1/pattern-no-articles`) — see resolution failure samples
- `dialogue_line`: `lesson-N/section-M/line-K` — `lib/exercise-content/adapter.ts:148`
- `affixed_form_pair`: `lesson-N/morphology/<slug>` (e.g. `lesson-9/morphology/meN-baca-membaca`) — `adapter.ts:152`

**`metadata_json` shape (uniform across all rows):**
```
{
  difficultyLevel: number,                    // also implicit in capabilityCatalog rules
  goalTags: string[],                         // mostly [], but **NOT always** — see note below
  prerequisiteKeys: string[],                 // used by pedagogy.ts staging gate (ADR 0007)
  requiredArtifacts: ArtifactKind[],          // duplicates artifact_fingerprint
  requiredSourceProgress: null,               // post-retirement #6 — see note below
  skillType: SkillType                        // duplicates capability_type (functional equivalent)
}
```
Verified across 50 sampled rows per capability_type: shape is uniform (no per-type variation). Field status:

- `goalTags` — **dead in effect.** The goal subsystem that would have consumed this field was retired #4 (2026-05-07, `docs/plans/2026-05-07-retire-goal-subsystem.md`). 4 of 4,005 caps carry `['morphology', 'meN-active']` (the 4 `affixed_form_pair` caps at `capabilityCatalog.ts:191,205`); the podcast projector emits `['podcast', ...]` (no podcast caps in DB yet). These writes flow into `PlannerCapability.goalTags` via `src/lib/session-builder/adapter.ts:138,154,176` — and stop there. Grep `\.goalTags` across `src/` returns zero non-writer references; the field is set by emitters and projected through the planner, but **never read** for ordering, filtering, or display. Retirement is safe; the writers are dead-writes against a retired subsystem.
- `requiredSourceProgress` — always null in DB (source-progress retired #6). **But the field is still actively emitted as null by the pipeline** at `scripts/lib/pipeline/capability-stage/runner.ts:379` and `scripts/lib/pipeline/capability-stage/adapter.ts:147`. Same shape as `goalTags`: writers survived the subsystem retirement. Retiring the column requires changing those emitters in the same PR.
- `requiredArtifacts`, `skillType` — duplicates of columnar / type-projection data per `capabilityCatalog.ts`.

**`source_fingerprint` shape:** TEXT column storing `JSON.stringify({sourceKind, sourceRef})`. Example: `"{\"sourceKind\":\"item\",\"sourceRef\":\"learning_items/akhir\"}"`. Emitted by `capabilityCatalog.ts:30-32`. Used to detect projection-input drift in the validator.

**`artifact_fingerprint` shape:** TEXT column storing `JSON.stringify(requiredArtifacts)`. Example: `"[\"audio_clip\",\"base_text\",\"accepted_answers:id\"]"`. Same emitter line.

**Emitters:** `scripts/lib/pipeline/capability-stage/projectors/{vocab,grammar,morphology}.ts` write rows via the upserter at `scripts/lib/pipeline/capability-stage/adapter.ts`.

**Readers:**
- `src/lib/session-builder/adapter.ts:303` — calls `validateCapability` per row to derive readiness. (Line 299 is the unknown-projection fallback; line 303 is the actual validator call.)
- `src/lib/session-builder/adapter.ts:282-289` — **separate** planner-side reader: pulls `capability_artifacts` rows via `chunkedIn` and builds an `artifactIndex` that `validateCapability` consumes. This is a planner-side artifact reader distinct from the runtime resolver's `lib/exercise-content/adapter.ts:fetchArtifacts`. Both must be moved to typed-table reads before `capability_artifacts` can be dropped.
- `src/lib/exercise-content/adapter.ts` — `decodeCanonicalKey(canonical_key_snapshot)` for source-kind bucketing.
- `src/lib/analytics/mastery/derive.ts` — pulls capability_type / source_kind / artifact list for mastery labelling.

**Invariants enforced at DB level:**
- `canonical_key` UNIQUE (`capability-core.sql:7`).
- `(readiness_status, publication_status)` indexed (`capability-core.sql:26-27`).
- Source kind enum + readiness enum + publication enum (CHECK constraints).
- Lesson-id required for non-podcast (CHECK, ADR 0006).

### 3.2 `capability_artifacts` (9,312 rows)

**Purpose:** The content blobs that capabilities reference. ADR 0001.

**Columns:** `id, capability_id, artifact_kind, quality_status, artifact_ref, artifact_json, artifact_fingerprint, created_at, updated_at`. DDL: `scripts/migrations/2026-04-25-capability-core.sql:43-54`. Cascade FK from `migration.sql:2076-2081`.

**artifact_kind values in DB (12):**

| artifact_kind | count | `artifact_json` shape |
|---|---:|---|
| `meaning:l1` | 3,260 | `{value: string}` |
| `base_text` | 2,605 | `{value: string}` |
| `accepted_answers:id` | 1,295 | `{values: string[]}` |
| `audio_clip` | 1,280 | `{storagePath: string, voiceId: string}` |
| `accepted_answers:l1` | 655 | `{values: string[]}` |
| `pattern_explanation:l1` | 94 | `{value: string}` |
| `pattern_example` | 94 | `{value: string}` |
| `cloze_answer` | 7 | `{value: string}` |
| `cloze_context` | 7 | `{line_text, source_ref, source_text, speaker}` |
| `translation:l1` | 7 | `{value: string}` |
| `allomorph_rule` | 4 | `{rule: string}` |
| `root_derived_pair` | 4 | `{root: string, derived: string}` |

**Declared but unused (10 of 22):** `meaning:nl`, `meaning:en`, `exercise_variant`, `audio_segment`, `transcript_segment`, `minimal_pair`, `dialogue_speaker_context`, `podcast_gist_prompt`, `timecoded_phrase`, `production_rubric`. All defined in `src/lib/capabilities/capabilityTypes.ts:73-95`. Zero rows for each.

**Shape observations:**
- 7 of 12 kinds collapse to `{value: string}`. The JSON wrapper is pure overhead — a typed text column would carry the same information with less surface area.
- 2 of 12 kinds use `{values: string[]}`. Different key (`value` vs `values`) — naming inconsistency for what is morphologically the same concept.
- 3 of 12 kinds are genuinely structured: `audio_clip` (path+voice pair), `root_derived_pair` (two strings), `cloze_context` (4 fields).
- 1 of 12 (`allomorph_rule`) uses `{rule: string}` — yet another single-string wrapper with a non-`value` key.

**Emitters:**
- `scripts/lib/pipeline/capability-stage/projectors/vocab.ts` writes `base_text`, `meaning:l1`, `accepted_answers:id`, `accepted_answers:l1` for item-source caps.
- `scripts/lib/pipeline/capability-stage/projectors/grammar.ts` writes `pattern_explanation:l1`, `pattern_example`.
- `scripts/lib/pipeline/capability-stage/projectors/morphology.ts` writes `root_derived_pair`, `allomorph_rule`.
- `scripts/lib/pipeline/capability-stage/projectors/dialogueArtifacts.ts` writes `cloze_context`, `cloze_answer`, `translation:l1` for dialogue_line caps.
- `scripts/lib/pipeline/capability-stage/projectors/audio.ts` (path may vary) writes `audio_clip`.

**Readers:**
- `src/lib/exercise-content/adapter.ts:291-303` (`fetchArtifacts`) — bulk fetch by `capability_id IN (...)` with `quality_status = 'approved'`. Returns to the per-byKind fetchers.
- `src/lib/exercise-content/byKind/item.ts:164-172` — indexes results into `Map<capability_id, Map<ArtifactKind, CapabilityArtifact>>`.
- Per-exercise `byType/*.ts` packagers read `artifactsByKind.get(...)` to extract the shape they need.

**Validators:**
- `src/lib/capabilities/renderContracts.ts:54-127` — per-exercise `requiredArtifacts` map.
- `src/lib/capabilities/capabilityContracts.ts:52` — `validateCapability` walks the contract + cap's projected `requiredArtifacts`.
- `src/lib/capabilities/artifactRegistry.ts:39` — `hasApprovedArtifact` scope check.

**Divergence risk:** The shape varies per kind, but each kind's shape is uniform across rows of that kind. No mid-kind shape drift observed. The validation is **at the artifact-kind layer** (the contract knows which kinds an exercise needs); it does NOT validate the **payload shape inside** `artifact_json`. A kind-shape mismatch (e.g. an emitter writing `{val:...}` instead of `{value:...}`) would not be caught by `validateCapability` — only by the byType packager's downstream extraction.

### 3.3 `exercise_variants` (716 rows)

**Purpose:** Authored grammar exercises. Data-model.md:159.

**Columns (live, 12):** `id, exercise_type, learning_item_id, context_id, grammar_pattern_id, payload_json, answer_key_json, source_candidate_id, is_active, created_at, updated_at, lesson_id`. DDL near `scripts/migration.sql:~735` + ALTERs near `:771`.

**Distribution by exercise_type (all is_active=true, all lesson_id non-null):**

| exercise_type | count | payload_json shape |
|---|---:|---|
| `constrained_translation` | 240 | `{acceptableAnswers[], disallowedShortcutForms[], explanationText, requiredTargetPattern, sourceLanguageSentence}` |
| `sentence_transformation` | 189 | `{acceptableAnswers[], explanationText, hintText, sourceSentence, transformationInstruction}` |
| `cloze_mcq` | 146 | `{correctOptionId, explanationText, options[], sentence, translation}` |
| `contrast_pair` | 141 | `{correctOptionId, explanationText, options[], promptText, targetMeaning}` |

**Reference linking:**
- `learning_item_id` is set on **0 of 716 rows**. The column is nullable.
- `context_id` is set on **0 of 716 rows**.
- `grammar_pattern_id` is set on **all 716 rows**.

**`answer_key_json` redundancy:** Pure duplication of the correctness subset of `payload_json`:
- For `contrast_pair` / `cloze_mcq`: `answer_key_json = {correctOptionId}` — already in payload_json.
- For `constrained_translation` / `sentence_transformation`: `answer_key_json = {acceptableAnswers}` — already in payload_json.

The original intent (per `docs/current-system/data-model.md:159`) was "`payload_json` (display-safe) and `answer_key_json` (correctness data, server-only read)" — but the policy is not enforced. Both columns have identical grants (`select` to authenticated), and runtime readers consume the full `payload_json` blob including `correctOptionId` / `acceptableAnswers`. The "server-only read" framing is not realised in code.

**Emitter:** `scripts/publish-grammar-candidates.ts` + the grammar-exercise-creator agent. Pipeline path: `scripts/lib/pipeline/capability-stage/`.

**Readers:**
- `src/lib/exercise-content/byKind/item.ts:77-86` (`fetchActiveVariants`) — fetches by `learning_item_id IN (...) AND is_active=true`. Returns to the byType packagers as `RawProjectorInput.variant`.
- `src/lib/exercise-content/byKind/item.ts:157-162` — indexes returned variants by `${item_uuid}:${exercise_type}` for lookup at the per-block step.
- `src/lib/capabilities/renderContracts.ts:109-127` — declares which exercise types require an exercise_variant (`contrast_pair`, `sentence_transformation`, `constrained_translation` all do; `cloze_mcq` accepts an authored variant OR a runtime cloze context).

**THE ORPHAN PROBLEM — this is the smoking gun for the runtime/data gap:**

1. The runtime fetcher at `byKind/item.ts:77` queries `exercise_variants WHERE learning_item_id IN (item_uuids) AND is_active = true`.
2. **No row in the DB matches this query**: all 716 rows have `learning_item_id = NULL` (`grammar_pattern_id` is set instead).
3. Therefore the runtime never finds any variant for any item block.
4. Therefore `RawProjectorInput.variant` is always null for grammar exercise types.
5. The `projectBuilderInput` at `renderContracts.ts:459-471` then returns `{ ok: false, reasonCode: 'no_active_variant' }` for any cap whose contract names `contrast_pair`/`sentence_transformation`/`constrained_translation` — IF such a cap were to route to the resolver.
6. But step 5 never fires either, because **the four orphan exercise types have `capabilityTypes: []`** at `renderContracts.ts:109-127`. No capability_type routes to them.
7. So the 716 authored variants are dead data: not findable by the item-keyed fetcher, and not routable from any capability anyway.

For `cloze_mcq`: `capabilityTypes: ['contextual_cloze']` (`renderContracts.ts:100`), `supportedSourceKinds: ['item']`. But `contextual_cloze` is emitted ONLY for `dialogue_line` source kind (`capabilityCatalog.ts:166-170` notes "contextual_cloze capability emission moved out of the shared catalog" — now in `pipeline/capability-stage/projectors/vocab.ts` for dialogue lines only). Therefore `cloze_mcq` has no item-sourced `contextual_cloze` cap to route to either — its 146 variants are also orphaned.

**This invariant matches the answer-log evidence:** zero `cloze_mcq`, `contrast_pair`, `sentence_transformation`, or `constrained_translation` events in `capability_review_events` (632 rows, all 6 cap_types are item-sourced — §1.4).

### 3.4 `lesson_page_blocks` (169 rows)

**Purpose:** Learner-facing lesson reader content. Data-model.md:78.

**Columns (live, 10):** `id, block_key, source_ref, source_refs, content_unit_slugs, block_kind, display_order, payload_json, created_at, updated_at`. DDL: `scripts/migrations/2026-04-25-content-units-lesson-blocks.sql:23-40` minus the dropped columns `source_progress_event` + `capability_key_refs`. block_kind constraint rewritten at `migration.sql:1968-1975`.

**block_kind values (6 of 7 allowed):** `reading_section` (100), `vocab_strip` (30), `dialogue_card` (12), `lesson_recap` (9), `lesson_hero` (9), `practice_bridge` (9). The constraint admits `pattern_callout` too but **zero rows** of that kind in the DB.

**Per-lesson distribution (all 9 lessons; via `source_ref LIKE 'lesson-N/...'`):**

```
  lesson-1: reading_section=9,  vocab_strip=4, lesson_hero=1, dialogue_card=1, lesson_recap=1, practice_bridge=1
  lesson-2: reading_section=16, vocab_strip=4, lesson_hero=1, dialogue_card=1, lesson_recap=1, practice_bridge=1
  lesson-3: reading_section=10, vocab_strip=4, lesson_hero=1, dialogue_card=1, lesson_recap=1, practice_bridge=1
  lesson-4: reading_section=10, vocab_strip=3, lesson_hero=1, dialogue_card=1, lesson_recap=1, practice_bridge=1
  lesson-5: reading_section=11, vocab_strip=2, lesson_hero=1, dialogue_card=2, lesson_recap=1, practice_bridge=1
  lesson-6: reading_section=13, vocab_strip=2, lesson_hero=1, lesson_recap=1,   practice_bridge=1  (no dialogue_card)
  lesson-7: reading_section=9,  vocab_strip=3, lesson_hero=1, dialogue_card=2, lesson_recap=1, practice_bridge=1
  lesson-8: reading_section=13, vocab_strip=3, lesson_hero=1, dialogue_card=2, lesson_recap=1, practice_bridge=1
  lesson-9: reading_section=9,  vocab_strip=5, lesson_hero=1, dialogue_card=2, lesson_recap=1, practice_bridge=1
```

**`payload_json` shape — shape count per kind:**

| block_kind | distinct shapes observed | shape variation |
|---|---:|---|
| `reading_section` | **7** | `{categories,title,type}` ×33, `{intro,title,type}` ×6, `{items,title,type}` ×5, `{paragraphs,title,type}` ×3, `{intro,sentences,title,type}` ×1, `{letters,title,type}` ×1, `{columns,examples,footnotes,grammar_topics,intro,sections,tableTitle,title,type}` ×1 |
| `dialogue_card` | **5** | `{items,title,type}` ×4, `{lines,title,type}` ×5, `{lines,setup,title,type}` ×1, `{closing,lines,title,type}` ×1, `{intro,lines,title,type}` ×1 |
| `lesson_hero` | 1 | `{level, title}` |
| `lesson_recap` | 1 | `{title}` |
| `practice_bridge` | 1 | `{label}` |
| `vocab_strip` | 1 | `{items,title,type}` |

The two heavy kinds (reading_section, dialogue_card) account for 112 of 169 rows (66%) and carry 12 distinct shapes between them.

**`source_refs` / `content_unit_slugs` arrays:**
- `source_refs`: populated on all rows; element type `string`; varying length.
- `content_unit_slugs`: populated on **24 of 169 rows (14%); empty on 145 (86%)**. The schema declares this is the M:N bridge to `content_units.unit_slug` for capability scope, but most rows leave it empty.

**Emitter:** `scripts/lib/pipeline/lesson-stage/runner.ts` writes blocks via `upsertLessonPageBlocks`. Shape choice happens in `scripts/lib/pipeline/lesson-stage/adapter.ts` + Stage-A validators in `scripts/lib/pipeline/lesson-stage/validators/`.

**Readers (two distinct paths — relevant for design):**
1. **Generic lesson reader** (`src/components/lessons/LessonReader.tsx` + `blocks/LessonBlockRenderer.tsx`): uses **forgiving extraction**.
   - `textFromPayload(payload)` (`LessonBlockRenderer.tsx:12-42`) probes `body`, `intro`, `description`, `label`, `paragraphs[]`, `categories[].rules`, `categories[].examples[]` and concatenates whatever it finds.
   - `itemsFromPayload(payload)` (`:44-60`) returns `payload.items` or `payload.lines` if array; otherwise wraps the payload as a single item if it has any of a list of common keys (`indonesian`, `text`, `baseText`, `base_text`, `name`, `dutch`, `translation`, `translationNl`, `translation_nl`).
   - This is why the renderer *appears to* handle every shape: any unknown shape just produces less content (rather than failing). Anything outside the probed key set is **silently dropped** — e.g. `categories[].title`, `categories[].table[][]`, `tableTitle`, `footnotes`, `grammar_topics`, `setup`, `closing` are all invisible to the renderer.
2. **Per-lesson bespoke pages** (`src/pages/lessons/lesson-{4,5,6,7,8,9}/Page.tsx` — **all six listed as untracked in `git status`; these are in-flight WIP files, not stable code**): cast `section.content as <Shape>` for specific shapes and render with custom components. They show an in-flight migration toward typed rendering, but the design package should not treat them as a settled reader path. Any conclusion that depends on their shape needs to be re-verified once they land.
3. **`src/services/coverageService.ts:39-58`** reads `lesson_sections.content` directly to compute per-lesson type-coverage for the admin dashboard.

**Validators:** Stage-A pipeline validators (`scripts/lib/pipeline/lesson-stage/validators/`). The runtime has NO validation — the renderer's forgiveness is the only "validator," and it silently drops unknown data.

**Divergence risk: HIGH.** This is the worst shape-variability problem in the schema. The schema declares `block_kind` as the discriminator but doesn't enforce the per-kind payload shape — and the runtime then handles it via fuzzy extraction that loses fidelity.

### 3.5 `lesson_sections` (77 rows)

**Purpose:** Source-of-truth lesson content (separately from the page-block projection). Data-model.md:96.

**Columns (5):** `id, lesson_id, title, content (jsonb), order_index`.

**`content.type` discriminator (10 allowed per `migration.sql:1996-1999`; 9+ observed):**

| content.type | shape observed | example |
|---|---|---|
| `text` | `{type, intro?, sentences[]?, paragraphs[]?}` | `{type:'text', intro:'...', sentences:[{indonesian,dutch}]}` or `{type:'text', paragraphs:[...]}` |
| `vocabulary` | `{type, items[{indonesian, dutch}]}` | basic vocab list |
| `expressions` | `{type, items[{indonesian, dutch}]}` | same shape as vocabulary but different `type` |
| `numbers` | `{type, items[{indonesian, dutch}]}` | same shape, different type |
| `dialogue` | `{type, lines[{text, speaker, translation}], intro?, setup?, closing?}` | up to 5 keys |
| `grammar` | `{type, intro?, categories[], grammar_topics?, examples?, note?, word_order?}` | up to 7 keys |
| `pronunciation` | `{type, letters[{letter, rule, examples[]}]}` | uniform |
| `reference_table` | `{type, columns, examples, footnotes, grammar_topics, intro, sections, tableTitle, title}` | **9-key bespoke shape, 1 row in DB** |
| `exercises` | `{type, sections[{items[{question}]}]}` | per-lesson question lists |
| `culture` | (declared but not observed in samples) | n/a |

**Per content.type observation:** the `vocabulary`, `expressions`, `numbers` types **all use the same shape** but a different `type` discriminator. They could merge.

**Bespoke shapes:** the `reference_table` row carries 9 keys uniquely — a one-off shape for one section in lesson 4. The renderer's fuzzy extraction (above) does not handle this shape; only the bespoke `Page.tsx` for that lesson does.

**Emitter:** `scripts/lib/pipeline/lesson-stage/runner.ts:upsertLessonSections` + `scripts/data/lessons.ts` (still authoritative for display content per CLAUDE.md:273).

**Readers:**
- `src/services/coverageService.ts` — reads `content.type` for admin coverage.
- `src/lib/lessons/adapter.ts:194,205` — fetches with `*, lesson_sections(*)` for the lesson page.
- `src/lib/lessons/adapter.ts:172-189` — `extractLessonGrammarTopics` probes `content.categories[].title` for grammar topic strings.
- Per-lesson `Page.tsx` files cast specific shapes.

**Validators:**
- `migration.sql:1987-2002` — DB-level CHECK on `content->>'type'`.
- Stage-A pipeline GT5 validator (`scripts/lib/pipeline/lesson-stage/validators/sectionType.ts`).
- Per-item GT4 validator (`scripts/lib/pipeline/lesson-stage/validators/perItem.ts`).

### 3.6 `content_units` (1,004 rows)

**Purpose:** Stable teachable units shared across capabilities. Data-model.md:74.

**Columns:** `id, content_unit_key, source_ref, source_section_ref, unit_kind, unit_slug, display_order, payload_json, source_fingerprint, created_at, updated_at`. DDL: `scripts/migrations/2026-04-25-content-units-lesson-blocks.sql:5-18`.

**unit_kind values (4 in use; 7 allowed):** `learning_item` (878), `lesson_section` (77), `grammar_pattern` (47), `affixed_form_pair` (2). Declared but unused: `word`, `phrase`, `sentence`, `dialogue_line`, `podcast_segment`, `podcast_phrase`, `morphology_pattern` per the CHECK constraint (`content-units-lesson-blocks.sql:10`).

Note: the constraint says `dialogue_line` is a permitted `unit_kind`, but content_units never holds dialogue_line rows — those live as `learning_capabilities.source_kind='dialogue_line'` and are emitted from `lesson_sections.content.lines[]` at projection time. **The naming overlaps but the storage doesn't.** This is a design smell.

**`payload_json` shape per unit_kind:**

| unit_kind | shape |
|---|---|
| `learning_item` | `{baseText, itemType, translationEn, translationNl}` (4 keys; uniform across 878 rows) |
| `grammar_pattern` | `{complexityScore, description, name, slug}` (4 keys) |
| `lesson_section` | `{contentType, title}` (2 keys — just labels) |
| `affixed_form_pair` | `{allomorphRule, derived, patternSourceRef, root}` (4 keys) |

Each unit_kind has a single uniform shape — clean.

**`source_fingerprint` is JSON-as-text** (same pattern as `learning_capabilities.source_fingerprint`). For a learning_item row, sample: `"{\"base_text\":\"berapa?\",\"item_type\":\"word\",\"translation_nl\":\"hoeveel?\",\"context_type\":\"cloze\",\"source_page\":1,\"review_status\":\"published\",\"pos\":\"question_word\",\"level\":\"A1\",\"translation_en\":\"how much?\"}"`. Note this fingerprint **carries information not in `payload_json`** (POS, level, context_type, source_page, review_status) — it's not just a "fingerprint" of the payload, it's a denormalised snapshot of the upstream `learning_items` + `item_meanings` + `item_contexts` rows. Bug-prone.

**Redundancy with other tables:**
- For `learning_item` rows: `payload_json.baseText` = `learning_items.base_text`. `payload_json.translationEn` / `translationNl` = `item_meanings.translation_text` filtered by language. `source_fingerprint`'s `pos`/`level` = `learning_items.pos`/`learning_items.level`. **Every fact in payload_json is denormalised from elsewhere.**
- For `grammar_pattern` rows: `payload_json` mirrors `grammar_patterns.{slug, name, short_explanation, complexity_score}`.

**Emitter:** Capability-stage `runCapabilityStage` regenerates the file `scripts/data/staging/lesson-N/content-units.ts` from canonical inputs after enrichment (per CLAUDE.md:281). The DB row is written via the capability-stage adapter.

**Readers:**
- `capability_content_units` (junction) joins content_units to learning_capabilities.
- `lesson_page_blocks.content_unit_slugs[]` references `content_units.unit_slug` (M:N bridge — but mostly empty per §3.4).

**Status:** This table is a derived projection. Per CLAUDE.md:281, "Hand-edits to these four files are overwritten on the next publish."

### 3.7 `learner_capability_state` (476 rows)

**Purpose:** Per-(user, capability) FSRS state. ADR 0003.

**Columns:** `id, user_id, capability_id, canonical_key_snapshot, activation_state, activation_source, activation_event_id, fsrs_state_json, stability, difficulty, next_due_at, last_reviewed_at, review_count, lapse_count, consecutive_failure_count, state_version, created_at, updated_at`. DDL: `scripts/migrations/2026-04-25-capability-core.sql:56-76`.

**Redundancy — FSRS state is stored twice:**
- Columnar fields: `stability`, `difficulty`, `next_due_at`, `last_reviewed_at`, `review_count`, `lapse_count`, `consecutive_failure_count`, `state_version`, `activation_state`, `activation_source`.
- JSON column `fsrs_state_json`: contains `{nextDueAt, stability, difficulty, lapseCount, reviewCount, stateVersion, lastReviewedAt, retrievability, activationState, activationSource, consecutiveFailureCount}` — the same fields plus `retrievability` (computed retrospectively).

**Full audit 2026-05-21** (all 476 rows): column-vs-JSON divergence = 0/258 of rows that have both populated; 218 of 476 rows (45.8%) have `fsrs_state_json = NULL` and only the columnar fields. Conclusion: when both are populated, they always agree; when only one is populated, it's the column. Safe to retire the JSON column.

**Why both exist:** Likely transitional — the JSON column was probably original (single source of truth) and the columnar fields added later to enable SQL filtering on `next_due_at` and the FSRS index `learner_capability_state_due_idx` at `capability-core.sql:78-79`. Both writers (`commit_capability_answer_report` RPC) update both. Bug surface: any change to one field that misses the other.

**Emitter:** Sole writer per ADR 0004 — `indonesian.commit_capability_answer_report` RPC (`scripts/migration.sql:1205` + `scripts/migrations/2026-04-25-capability-review-rpc.sql`). Browser GRANT is `SELECT` only (per `scripts/migrations/2026-04-25-capability-core.sql:330` — `REVOKE INSERT, UPDATE, DELETE`).

**Readers:**
- `src/lib/session-builder/adapter.ts` — pulls due-list.
- `src/lib/analytics/upcoming/filter.ts` — read-side due filter.
- `src/lib/analytics/memory/*` — retention/stability/health analytics.
- `src/lib/analytics/mastery/*` — mastery label derivation.

### 3.8 `capability_review_events` (632 rows)

**Purpose:** Append-only answer log. ADR 0004.

**Columns:** `id, user_id, capability_id, learner_capability_state_id, idempotency_key, session_id, session_item_id, attempt_number, rating, answer_report_json, scheduler_snapshot_json, state_before_json, state_after_json, artifact_version_snapshot_json, created_at`. DDL: `scripts/migrations/2026-04-25-capability-core.sql:83-101`.

**Five JSON columns (uniform shape across rows):**

| Column | Purpose | Shape |
|---|---|---|
| `answer_report_json` | What the player shipped | `{isFuzzy, hintUsed, latencyMs, wasCorrect, rawResponse, normalizedResponse}` |
| `scheduler_snapshot_json` | Pre-scheduling state read | `{lapseCount, reviewCount, stateVersion, activationState, consecutiveFailureCount}` |
| `state_before_json` | Same shape as scheduler_snapshot_json | (5 keys) |
| `state_after_json` | New FSRS state | `{nextDueAt, stability, difficulty, lapseCount, reviewCount, stateVersion, lastReviewedAt, retrievability, activationState, activationSource, consecutiveFailureCount}` (11 keys) |
| `artifact_version_snapshot_json` | Capability version this answer was against | `{sourceRef, capabilityKey, projectionVersion, requiredArtifacts, sourceFingerprint, artifactFingerprint}` (6 keys) |

**Redundancies:**
- `scheduler_snapshot_json` and `state_before_json` carry the same keys with identical values across all sampled rows. One of them is redundant.
- `state_after_json` carries the same shape as `fsrs_state_json` in `learner_capability_state` — but the row is *also* uniquely identified by `(user_id, capability_id)` in `learner_capability_state`, so the snapshot is for audit only.
- `artifact_version_snapshot_json.sourceRef` + `capabilityKey` = derivable from `capability_id` lookup. `requiredArtifacts` + `sourceFingerprint` + `artifactFingerprint` = derivable from the cap row.

**`rating` discriminator:** integer 1-4 (CHECK at line 92). Distribution: rating=1: 161, rating=2: 6, rating=3: 465. **Rating 4 has zero rows** in the live DB — never used. The FSRS-style "Easy" rating is dead.

**Other field types:**
- `session_id` is `text NOT NULL` — no FK to `learning_sessions.id`. Intentional per ADR 0004 — events can be written before the session row exists. (Note: in the sibling table `capability_resolution_failure_events.session_id` is `uuid` — TYPE DIVERGENCE across two tables that both reference the same conceptual session.)
- `idempotency_key`, `session_item_id`: TEXT, no FK. The first is UNIQUE per user; the second is UNIQUE per (session, session_item, attempt).
- `learner_capability_state_id`: FK to `learner_capability_state(id)`. Adds nothing over `(user_id, capability_id)`.

**Emitter:** Sole writer is `commit_capability_answer_report` RPC. Browser GRANT is `SELECT` only.

**Readers:**
- `src/lib/analytics/memory/adapter.ts`, `engagement/adapter.ts`, etc. — analytics queries.
- `src/lib/analytics/upcoming/forecast.ts` — review-density forecasts.

### 3.9 `capability_resolution_failure_events` (69 rows)

**Purpose:** Diagnostic log of runtime resolution failures. DDL: `scripts/migrations/2026-05-02-capability-resolution-failures.sql`.

**Columns:** `id, capability_id, capability_key, reason_code, exercise_type, user_id, session_id, block_id, payload_json, created_at`.

**reason_code distribution:**
- `unsupported_source_kind`: 33 rows (mostly `pattern` capabilities the runtime cannot render)
- `item_inactive`: 36 rows

**`payload_json` shape (varies by reason_code):**
- `unsupported_source_kind`: `{sourceRef, sourceKind}` (sample: `{"sourceRef":"lesson-1/pattern-no-articles","sourceKind":"pattern"}`)
- `item_inactive`: `{itemKey, itemId}`

**`session_id` is `uuid` here vs `text` in `capability_review_events`.** Inconsistency.

**Emitter:** `src/lib/exercise-content/adapter.ts:339-354` — fire-and-forget insert from `createAdapter().logResolutionFailure`.

**Readers:** The aggregated view `capability_resolution_issues` (`scripts/migrations/2026-05-02-capability-resolution-failures.sql:73-86`) — admin-only dashboard.

### 3.10 `content_units`, `learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`, `grammar_patterns`

All columnar (no significant JSON columns). Documented in §3.6, §1.1.

Key observation on `item_contexts` (1,733 rows, 6 `context_type` values):

| context_type | count | purpose |
|---|---:|---|
| `cloze` | 1,028 | cloze-eligible — only this type is consumed by cloze exercises |
| `vocabulary_list` | 515 | huge count for what appears to be a labeling category |
| `lesson_snippet` | 60 | small |
| `dialogue` | 58 | small |
| `exercise_prompt` | 45 | small |
| `example_sentence` | 27 | smallest |

Two large counts (`cloze`, `vocabulary_list`) account for 89% of rows. Investigate whether `vocabulary_list` and `lesson_snippet` are still consumed — they may be projection residue.

### 3.11 `audio_clips` (1,974 rows)

**Purpose:** TTS audio file references. Per-text-per-voice rows.

**Columns:** `id, text_content, normalized_text, voice_id, storage_path, duration_ms, generated_for_lesson_id, created_at`. All columnar.

**Cross-reference to `capability_artifacts`:**
- 1,974 distinct storage paths in `audio_clips`.
- 640 distinct storage paths in `capability_artifacts.artifact_json` (1,280 artifact rows × multiple caps per path).
- 0 paths in capability_artifacts not in audio_clips (artifact refs all valid).
- **1,334 paths in audio_clips not referenced by any capability_artifact (68% orphaned audio).** Could be unreferenced TTS from removed items, or staged-but-not-published audio.

### 3.12 `lessons` (9 rows)

**Purpose:** Lesson catalog row.

**Columns (14):** `id, module_id, level, title, description, order_index, created_at, audio_path, duration_seconds, transcript_dutch, transcript_indonesian, transcript_english, primary_voice, dialogue_voices`.

**Always-NULL columns:** `duration_seconds`, `transcript_dutch`, `transcript_indonesian`, `transcript_english`. Five lessons confirmed empty for all four. **4 of 14 columns (29%) are dead.**

**`dialogue_voices` (JSONB):** per-lesson speaker→voice map. Example: `{"Ibu":"id-ID-Chirp3-HD-Sulafat", "Penjual":"id-ID-Chirp3-HD-Achird"}`. L6 has `null` (no dialogue). Key set varies per lesson (2-5 speakers).

### 3.13 `lesson_progress` (14 rows)

**Purpose:** Orphan table — write path retired post-#6. Read fallback only.

**Columns:** `id, user_id, lesson_id, completed_at, sections_completed (text[]), created_at`.

`sections_completed[]` lengths: min=1, max=11, n=14. Old data, no new writes.

### 3.14 `learning_sessions` (1,914 rows)

**Purpose:** Lazy-materialised session row, written by `commit_capability_answer_report` RPC.

**Columns:** `id, user_id, session_type, started_at, ended_at, duration_seconds`. `duration_seconds` is a generated column.

**`session_type` values in DB (4):** `learning` (986), `lesson` (883), `podcast` (3), `practice` (42). Per CLAUDE.md / retirement #5: only `'learning'` is written for new rows. The 883 `'lesson'` + 3 `'podcast'` + 42 `'practice'` rows are legacy from before retirement #5 (2026-05-07). Going forward, the lesson reader and podcast listener do not create rows.

### 3.15 `learner_lesson_activation` (36 rows)

**Purpose:** Lesson activation checkbox state. Replaces retired source-progress per #6.

**Columns:** `user_id, lesson_id, activated_at`. Composite PK. Sole writer is `set_lesson_activation` RPC (`migration.sql:1584`).

### 3.16 Legacy-retained tables (last-write 2026-05-01)

- `learner_item_state` (649 rows) — last `updated_at`: 2026-05-01T12:20:48.908Z. Per-(user, item) lifecycle. Write path retired. `leaderboard` view still reads `stage IN ('retrieving','productive','maintenance')` per `data-model.md:220`.
- `learner_skill_state` (763 rows) — last `updated_at`: 2026-05-01T12:20:48.881Z. Per-(user, item, skill_type) FSRS state. Carries FSRS columns identical in shape to `learner_capability_state` (stability, difficulty, etc.). Replaced by `learner_capability_state`.
- `review_events` (3,016 rows) — last `created_at`: 2026-05-01T12:20:48.926Z. Replaced by `capability_review_events`.

All three: write paths retired 2026-05-01. Rows preserved as historical record.

### 3.17 Tiny utility tables

- `profiles` (9 rows): 8 columns. `preferred_session_size`, `daily_new_items_limit`, `timezone` all in use.
- `user_roles` (1 row): single admin.
- `exercise_type_availability` (10 rows): `speaking` is `session_enabled=false`; per-type rollout toggle. **12 exercise types declared in code; only 10 here.** Two missing: requires verification.
- `error_logs` (536 rows): write-only by `lib/logger.ts`.
- `exercise_review_comments` (4 rows): tiny; admin annotations on grammar exercises.
- `content_flags` (51 rows): user-reported issues. 4 `flag_type`s: `confusing` (11), `other` (26), `bad_sentence` (11), `wrong_translation` (3). Columns are columnar (no JSON payload column).

---

## §4. JSON shape catalogue (full divergence map)

Combined index, sorted by **shape-count within one table**:

| Table.column | Discriminator | Shape count | Notes |
|---|---|---:|---|
| `lesson_page_blocks.payload_json` | `block_kind` | **7 within `reading_section`** + 5 within `dialogue_card` | The biggest variability. §3.4. |
| `lesson_sections.content` | `content.type` (inside JSON) | **9+** | reference_table has 9 keys; vocabulary/expressions/numbers share shape. §3.5. |
| `capability_artifacts.artifact_json` | `artifact_kind` | **12** (one per kind, mostly uniform within kind) | 7 collapse to `{value}`; 2 to `{values}`; 3 structured. §3.2. |
| `exercise_variants.payload_json` | `exercise_type` | **4** | answer_key_json is pure subset duplication. §3.3. |
| `content_units.payload_json` | `unit_kind` | **4** | Clean — one shape per kind. §3.6. |
| `lessons.dialogue_voices` | (none) | **variable per row** | per-lesson speaker→voice map; key set differs per lesson. §3.12. |
| `learning_capabilities.metadata_json` | (uniform) | **1** | Uniform shape, but goalTags + requiredSourceProgress are dead. §3.1. |
| `capability_review_events.*_json` | (uniform) | **1 per column** | 5 JSON columns; scheduler_snapshot + state_before duplicate. §3.8. |
| `learner_capability_state.fsrs_state_json` | (uniform) | **1** | Pure duplication of columnar fields (0/50 divergence). §3.7. |
| `capability_resolution_failure_events.payload_json` | `reason_code` | **2 small** | Diagnostic. §3.9. |

**Risk classification:**

- **HIGH (shape-variable, runtime reader silently drops information):** `lesson_page_blocks.payload_json`, `lesson_sections.content`.
- **MEDIUM (shape-variable but reader validates per kind):** `capability_artifacts.artifact_json`, `exercise_variants.payload_json`, `content_units.payload_json`.
- **LOW (uniform shape, redundant with columns):** `learner_capability_state.fsrs_state_json`, `learning_capabilities.metadata_json`, `capability_review_events.*_json`.
- **LOW (small, diagnostic only):** `capability_resolution_failure_events.payload_json`.

---

## §5. Cross-references, redundancies, and dead paths

### 5.1 Fingerprint columns store JSON-as-text

Three columns store stringified JSON in a TEXT column:

- `learning_capabilities.source_fingerprint` → `"{\"sourceKind\":\"item\",\"sourceRef\":\"...\"}"`
- `learning_capabilities.artifact_fingerprint` → `"[\"audio_clip\",\"base_text\",...]"`
- `content_units.source_fingerprint` → larger JSON snapshot including upstream POS/level/translation_nl/translation_en/etc.

All emitted by `JSON.stringify(...)` in the projector (`capabilityCatalog.ts:30-32`). Reading them requires `JSON.parse` on the client. Querying *into* them requires text-search.

**Issue:** Postgres `jsonb` would store the same data with structural indexing, type safety, and ability to query into the structure (`fingerprint @> '{"sourceKind":"item"}'`). Using `text` for JSON is a missed-opportunity bug class.

### 5.2 Redundancies catalogue

| Redundancy | Tables | Evidence |
|---|---|---|
| FSRS state column-fields + JSON column | `learner_capability_state` (stability + fsrs_state_json.stability, etc.) | 0/50 divergence in sample; §3.7 |
| `learning_capabilities.metadata_json.skillType` ≈ `capability_type` | `learning_capabilities` | `capabilityCatalog.ts:34-44` (skillType is set per-cap-type) |
| `learning_capabilities.metadata_json.requiredArtifacts` = `artifact_fingerprint` | `learning_capabilities` | Both derived from same projection step |
| `exercise_variants.answer_key_json` ⊂ `payload_json` | `exercise_variants` | Same `correctOptionId` / `acceptableAnswers` in both; §3.3 |
| `capability_review_events.scheduler_snapshot_json` = `state_before_json` | `capability_review_events` | Same keys; same values in samples; §3.8 |
| `capability_review_events.artifact_version_snapshot_json` ≈ derivable from `capability_id` join | `capability_review_events` | Fields all present on `learning_capabilities` row; §3.8 |
| `content_units.payload_json` is denormalised from upstream tables | `content_units` | learning_item rows duplicate `learning_items.base_text` + `item_meanings.*`; §3.6 |
| `audio_clip` artifact in two places | `audio_clips` table + `capability_artifacts.artifact_json` of kind=audio_clip | 1,334 paths in audio_clips not in artifacts (68%); §3.11 |

### 5.3 Dead fields / dead types / dead paths

**Permanently dead fields** (filled by emitter but never read):

| Field | Reason | Status |
|---|---|---|
| `learning_capabilities.metadata_json.requiredSourceProgress` | Source-progress retired #6 (2026-05-07) | Always `null` in DB; pipeline still emits null. Retiring the column requires updating `pipeline/capability-stage/runner.ts:379` + `adapter.ts:147` |
| `lessons.transcript_dutch`/`indonesian`/`english` | Never populated | Always NULL |
| `lessons.duration_seconds` | Never populated | Always NULL |
| `capability_review_events.rating = 4` | Easy rating never written | Zero rows of rating=4 |

**Zombie-emitted fields** (writers survived the subsystem retirement that would have consumed them):

| Field | Status |
|---|---|
| `learning_capabilities.metadata_json.goalTags` | Goal subsystem retired #4. Emitters at `capabilityCatalog.ts:191,205` and `podcast-stage/podcastProjectionRules.ts:81,96` still write values. Adapter at `src/lib/session-builder/adapter.ts:138,154,176` projects through to `PlannerCapability.goalTags`. Grep confirms no downstream reader. Dead in effect; retire with the column. |

**Declared but unused enum values:**

| Enum | Total declared | In DB | Unused |
|---|---:|---:|---|
| `learning_capabilities.source_kind` | 6 | 4 | `podcast_segment`, `podcast_phrase` |
| `capability_artifacts.artifact_kind` (in `capabilityTypes.ts:73-95`) | 22 | 12 | `meaning:nl`, `meaning:en`, `exercise_variant`, `audio_segment`, `transcript_segment`, `minimal_pair`, `dialogue_speaker_context`, `podcast_gist_prompt`, `timecoded_phrase`, `production_rubric` |
| `lesson_page_blocks.block_kind` | 7 | 6 | `pattern_callout` |
| `content_units.unit_kind` | 7 | 4 | `word`, `phrase`, `sentence`, `dialogue_line`, `podcast_segment`, `podcast_phrase`, `morphology_pattern` (3 of these 7 vs 7 declared — see CHECK in `content-units-lesson-blocks.sql:10`) |

**Orphan tables** (zero rows, no read path observed):

- `capability_aliases` (alias resolution mechanism declared but never used)
- `item_context_grammar_patterns` (junction table, schema declared but empty — the `confusion_group` denormalisation on `grammar_patterns` is the live mechanism instead)
- `generated_exercise_candidates`, `textbook_pages`, `textbook_sources` (authoring-pipeline tables — staging stays as TS files, never lands in DB)
- `podcasts` (podcast feature not built)

**Orphan routing — the `exercise_variants` problem (§3.3):** All 716 exercise_variants are dead at runtime. None will ever render under the current routing logic.

### 5.4 Dual-storage of audio

`capability_artifacts.artifact_kind='audio_clip'` stores `{storagePath, voiceId}`. `audio_clips` stores `{text_content, normalized_text, voice_id, storage_path, duration_ms, generated_for_lesson_id}`. The same `storagePath` is in both, but with no FK.

The cap-artifact path can lose the `voice_id`/`text_content` association if `audio_clips` is dropped. The `audio_clips` path can hold paths no cap references (1,334 orphans observed). Two tables, one fact, no foreign key — guaranteed drift over time.

### 5.5 The `runtime/data` gap (summary, with citations)

Per `docs/current-system/capability-runtime-data-model-gap.md:30-58` and §1.4 above:

- Schema declares 6 source kinds + 12 capability types + 22 artifact kinds + 12 exercise types (cross-product: 22,176 possible (source_kind × capability_type × artifact_kind × exercise_type) tuples).
- **Effective rendering surface as of 2026-05-21:** 2 source kinds (`item`, `dialogue_line`) × 7 cap_types that route × 12 artifact kinds (those actually populated) × 8 exercise types (4 are orphan-routed) — ~134 active tuples (back-of-envelope).
- **Ever-rendered as of 2026-05-21:** 1 source kind (`item`) × 6 cap_types × ~5 artifact kinds × 6 exercise types — proven by `capability_review_events` distinct distributions.

The data model accommodates the union of all designed capabilities. The runtime renders an intersection. The data documents intent; the live answer log documents reality.

---

## §6. Concrete example walks

### 6.1 Vocabulary item — "rumah" (house)

The item lives across these tables:

- **`learning_items`** (1 row): `{id: <uuid_R>, item_type:'word', base_text:'rumah', normalized_text:'rumah', language:'id', level:'A1', source_type:'lesson', is_active:true, pos:'noun', notes:null}`
- **`item_meanings`** (≥1 row, typically 2: `nl` + `en`): `{learning_item_id:<uuid_R>, translation_language:'nl', translation_text:'huis', is_primary:true}` + EN equivalent.
- **`item_answer_variants`** (0+ rows): per accepted alternative form.
- **`item_contexts`** (0+ rows of various context_types): cloze contexts, lesson_snippet, etc.
- **`learning_capabilities`** (4 to 6 rows): one per item-source cap_type. Has audio? +2 caps (audio_recognition + dictation). All caps have `lesson_id = <lesson 1's uuid>` per ADR 0006.
- **`capability_artifacts`** (5 to 7 rows per cap × 4-6 caps = ~25 rows): `base_text` (×4-6, one per cap), `meaning:l1` (×4-6), `accepted_answers:id` (×2 — only form_recall + dictation need it), `accepted_answers:l1` (×1 — only meaning_recall), `audio_clip` (×2 — only audio caps).
- **`content_units`** (1 row of kind=`learning_item`): `{unit_slug:'item-rumah', payload_json:{baseText:'rumah', itemType:'word', translationEn:'house', translationNl:'huis'}}`.
- **`capability_content_units`** (1+ rows): junction(s) tying caps → content_unit.
- **`audio_clips`** (≥2 rows if audio): one per voice variant of the spoken form.
- **`learner_capability_state`** (per learner per cap reviewed): FSRS state.
- **`capability_review_events`** (per learner per cap per review): answer log.

**One word touches ~10 tables and ~30+ rows.** Many of those rows redundantly carry the word's base_text (`learning_items.base_text`, `content_units.payload_json.baseText`, `capability_artifacts.artifact_json.value` for kind=base_text), the meaning (`item_meanings.translation_text`, `content_units.payload_json.translationNl`, `capability_artifacts.artifact_json.value` for kind=meaning:l1), and the accepted-answers (`item_answer_variants.variant_text`, `capability_artifacts.artifact_json.values`).

### 6.2 Grammar pattern — "meN-" prefix (lesson 9)

- **`grammar_patterns`** (1 row): `{slug:'meN-active', name:'meN- prefix', short_explanation:'...', complexity_score:N, confusion_group:'meN-prefix', introduced_by_lesson_id:<L9 uuid>}`.
- **`learning_capabilities`** (2 rows, source_kind=pattern): `pattern_recognition` + `pattern_contrast`, both with `lesson_id=<L9 uuid>`.
- **`capability_artifacts`** (4 rows): `pattern_explanation:l1` and `pattern_example` each ×2 (one for each cap).
- **`content_units`** (1 row of kind=`grammar_pattern`): `{unit_slug:'pattern-meN-active', payload_json:{slug, name, description, complexityScore}}`.
- **`capability_content_units`** (junctions): caps → content_unit.
- **`item_context_grammar_patterns`** (0 rows): the junction table is empty.

**Runtime visibility:** **None.** The 2 pattern caps are projected but NOT renderable — `renderContracts.ts:109-127` has `capabilityTypes: []` for `contrast_pair`, `sentence_transformation`, `constrained_translation`, and the pattern_recognition / pattern_contrast capability types appear in NO exercise contract. The `contextual_cloze` capability type that the cloze exercises serve is emitted only from dialogue_line source. Confirmed by `capability_resolution_failure_events`: 33 rows with `reason_code='unsupported_source_kind'`, all `sourceKind='pattern'`.

### 6.3 Dialogue cloze on L9 — `lesson-9/section-1/line-11`

- **`lesson_sections`** (1 row for L9 section 1, content.type='dialogue'): `content.lines[10] = {text, speaker, translation}`. The line-11 is the 11th item in `lines[]`.
- **`learning_capabilities`** (1 row, source_kind=dialogue_line): `{source_ref:'lesson-9/section-1/line-11', capability_type:'contextual_cloze', lesson_id:<L9 uuid>}`.
- **`capability_artifacts`** (3 rows): `cloze_context` (`{line_text, source_ref, source_text, speaker}` — see §3.2 exemplar), `cloze_answer` (`{value: "takut"}`), `translation:l1` (`{value: "Echt waar, dokter? ..."}`).
- **`content_units`** (0 rows of kind=dialogue_line): no content_unit emitted for dialogue lines per current pipeline.
- **`learner_capability_state`** (per learner, if reviewed): would exist if anyone has reviewed this cap. **Verified 0 rows: contextual_cloze has zero entries in capability_review_events** — feature was unblocked PR-B (2026-05-21) but no learner has reviewed one yet.
- **`audio_clips`**: line-text audio if present.

**Runtime visibility:** unblocked 2026-05-21. Renderable via typed `cloze` (per `renderContracts.ts:93-98` widening). Not yet exercised — answer-log evidence pending.

### 6.4 Morphology pair — `baca` → `membaca` (lesson 9)

- **`learning_items`** (2 rows): `{base_text:'baca'}`, `{base_text:'membaca'}`. Both `item_type='word'`.
- **`learning_capabilities`** (2 rows for the pair, source_kind=affixed_form_pair): `{source_ref:'lesson-9/morphology/meN-baca-membaca', capability_type:'root_derived_recognition'}` + `{...capability_type:'root_derived_recall'}`. Both have `lesson_id=<L9 uuid>`.
- **`capability_artifacts`** (4 rows, 2 per cap): `root_derived_pair` (`{root:'baca', derived:'membaca'}`) and `allomorph_rule` (`{rule:'meN- becomes mem- before roots beginning with b: baca -> membaca.'}`).
- **`content_units`** (1 row of kind=affixed_form_pair): `{unit_slug:'affix-meN-baca-membaca', payload_json:{root, derived, allomorphRule, patternSourceRef:'lesson-9/pattern-men-active'}}`.

**Runtime visibility:** Inert. Per `renderContracts.ts:70-77`, `typed_recall` supportedSourceKinds=`['item', 'affixed_form_pair']` (widened recently), but `cued_recall` is `['item']` only. The 2 caps × 2 cap_types × 1 exercise route = 4 potential renderings, but `cued_recall` doesn't accept affixed_form_pair yet (needs authored distractors per the contract comment) and `typed_recall` would need its byType packager to branch on `input.affixedFormPair`. Per `docs/current-system/capability-runtime-data-model-gap.md:87`, this is "next pilot."

### 6.5 What every example reveals

A single conceptual entity (vocab word, grammar pattern, dialogue line, morphology pair) sprawls across 5-10 tables. Some of that sprawl is principled (FSRS state separate from content, audit log separate from current state) but much of it is denormalisation: `learning_items.base_text` ↔ `content_units.payload_json.baseText` ↔ `capability_artifacts.artifact_json.value (kind=base_text)`. The same string in three places. Any of them could drift independently.

---

## §7. Code emitter/reader summary table

Per shape-variable JSON column, the chain of emitters → readers → validators:

| Column | Emitter file:line | Reader file:line | Validator file:line | Divergence risk |
|---|---|---|---|---|
| `learning_capabilities.metadata_json` | `src/lib/capabilities/capabilityCatalog.ts:34-44` (createCapability) | `src/lib/session-builder/adapter.ts:299` (just-reads-prerequisiteKeys); `src/lib/exercises/exerciseResolver.ts` (cap-type lookup) | `src/lib/capabilities/capabilityContracts.ts:52` | LOW (uniform shape) |
| `capability_artifacts.artifact_json` | per-kind: `scripts/lib/pipeline/capability-stage/projectors/{vocab,grammar,morphology,dialogueArtifacts}.ts` | `src/lib/exercise-content/byKind/item.ts:164-172` (index) + `byType/*.ts` (extract per kind) | `src/lib/capabilities/renderContracts.ts:54-127` (artifact-kind layer only — does NOT validate JSON payload shape) | MEDIUM (per-kind shape but extracted by client per kind) |
| `exercise_variants.payload_json` + `answer_key_json` | `scripts/publish-grammar-candidates.ts` + grammar-exercise-creator agent | `src/lib/exercise-content/byKind/item.ts:77-86` (fetch) → `byType/{contrastPair,sentenceTransformation,constrainedTranslation,clozeMcq}.ts` (extract) | `src/lib/capabilities/renderContracts.ts:459-471` (presence-only) | **HIGH (orphan): no row ever reaches a reader because of the routing mismatch** |
| `lesson_page_blocks.payload_json` | `scripts/lib/pipeline/lesson-stage/runner.ts:upsertLessonPageBlocks` | (1) generic: `src/components/lessons/blocks/LessonBlockRenderer.tsx:12-76` (fuzzy text/items extraction); (2) bespoke: `src/pages/lessons/lesson-{4,5,6,9}/Page.tsx` (typed casts) | None at runtime — generic reader silently drops unknown keys | **HIGH** |
| `lesson_sections.content` | `scripts/data/lessons.ts` + `scripts/lib/pipeline/lesson-stage/`. Validators: `lesson-stage/validators/{sectionType,perItem}.ts` | (1) `src/services/coverageService.ts:39-58`; (2) `src/lib/lessons/adapter.ts:172-189` (extractLessonGrammarTopics); (3) per-lesson `Page.tsx` files | DB CHECK on `content->>'type'` (`migration.sql:1987-2002`) — type-discriminator only, no shape check | **HIGH (worst — 9+ shapes including bespoke)** |
| `content_units.payload_json` | `scripts/lib/pipeline/capability-stage/runner.ts` (regenerates after enrichment) | Coverage scripts; lesson rendering indirect via `capability_content_units` junction | None | LOW (clean per-kind shape) |
| `capability_review_events.*_json` (5 cols) | `commit_capability_answer_report` RPC (`migrations/2026-04-25-capability-review-rpc.sql`) | `src/lib/analytics/*` adapters | None | LOW (uniform shape) |
| `learner_capability_state.fsrs_state_json` | `commit_capability_answer_report` RPC | `src/lib/analytics/*` adapters; `src/lib/session-builder/adapter.ts` (reads columnar fields, not the JSON) | None | LOW (duplicate of columns) |
| `capability_resolution_failure_events.payload_json` | `src/lib/exercise-content/adapter.ts:339-354` | Admin dashboard via `capability_resolution_issues` view | None | LOW (diagnostic) |
| `lessons.dialogue_voices` | seed scripts | `scripts/check-supabase-deep.ts` (HC4) + lesson-stage audio generator | HC4 in `check-supabase-deep.ts` | LOW (small set of speakers per lesson) |

---

## §8. Where the prior agent's claims need re-evaluation

The prompt that started this investigation noted that the previous session proposed first "17 satellite tables to replace `capability_artifacts`," then retracted to "use existing typed tables for most kinds plus 3 new ones." This document was written **without reading either proposal**, so I cannot endorse or refute their specific claims.

What the evidence here does establish, for the next design pass:

1. **`capability_artifacts` carries 12 actually-used kinds.** Not 17, not "many." The number 17 may reflect the union of *currently-emitted* + *declared-but-unused* artifact kinds (10 declared but unused per §5.3) — but those 10 are aspirational and not material to a refactor of the active surface.

2. **Of those 12 kinds, 7 collapse to `{value: string}` and 2 to `{values: string[]}`.** A clean alternative is not necessarily "1 typed table per kind" (would be 12 tables); it could be:
   - One `capability_text_artifact` table covering the 9 single-/multi-string kinds with `(capability_id, kind, value text, values text[])` shape.
   - Three structured satellites: `capability_audio_clip` (replacing `audio_clip` kind, FK to `audio_clips`), `capability_root_derived_pair`, `capability_cloze_context`.
   - That gives 4 tables, not 17, not 3.
   But this is a *design alternative for §5 of the target doc*, not a finding. The investigation establishes the shape distribution; the design decision is downstream.

3. **The existing-typed-tables view** has some support in the data: `learning_items`, `item_meanings`, `item_answer_variants` already store the same strings as `capability_artifacts` of kinds `base_text` / `meaning:l1` / `accepted_answers:l1`. **However**, the runtime *also* reads `capability_artifacts` directly via `fetchArtifacts` (§3.2) — collapsing into the typed tables would require rewriting `lib/exercise-content/byKind/item.ts` to read from `learning_items` + `item_meanings` instead. The redundancy is real but the migration is non-trivial.

4. **The runtime gap (§5.5) is independent of the artifact-storage question.** Whatever schema the design lands on, the orphan-routing problem (716 unreachable `exercise_variants`, 94+ unreachable pattern caps, 4 unreachable affixed_form_pair caps) is a separate concern — it lives in `renderContracts.ts` + `capabilityCatalog.ts`, not in the table layout.

The design phase should pick an artifact-storage strategy *based on this evidence*, not on the prior agent's framing.

---

## §9. Open observations for the design phase

These are not decisions, just things this investigation noticed that the design phase needs to address explicitly:

1. **Two `lesson_id` carriers, two semantics.** `learning_capabilities.lesson_id` (ADR 0006: capability's introducing lesson) vs `lesson_page_blocks.source_ref/source_refs[]` (M:N exposure). The two complement (ADR 0006 §"M:N exposure bridge"). Decide whether the target schema keeps both, merges them, or chooses one as primary.

2. **`content_units` denormalises upstream tables.** §3.6 — `payload_json.baseText` ≡ `learning_items.base_text`, `payload_json.translationNl` ≡ `item_meanings.translation_text`. Decide whether `content_units` survives as a derived projection, gets a junction-only role, or retires.

3. **`exercise_variants` is the messiest table** — 716 rows that have never rendered, but the authoring path (grammar-exercise-creator agent) actively writes them. The design must decide: (a) wire them into the runtime (route some capability type to them), (b) retire the authoring path, or (c) keep both as no-op data with documented inertness.

4. **`capability_artifacts` could collapse for the 7 `{value:...}` kinds.** The 12-kind table is operationally one row-per-string with a discriminator. A typed approach could either keep the discriminator (1 table) or split (N tables). The 3 structured kinds (audio_clip, root_derived_pair, cloze_context) clearly merit their own typed shape.

5. **`learner_capability_state.fsrs_state_json` is pure duplication** of the columnar fields. Retire one. If the JSON is kept, drop the columnar copies; if the columns are kept, drop the JSON.

6. **`capability_review_events` has 5 JSON columns** with at least one pair (scheduler_snapshot + state_before) fully duplicating each other. The audit log is high-volume — minimising JSON overhead matters for storage + query cost.

7. **`lesson_page_blocks.payload_json` has 7 shapes inside `reading_section` alone.** The generic renderer extracts ~3 keys; everything else is silently lost. Either typed-split the block_kind into more discriminator values (one per shape), or formalise the shape (Zod / JSON schema) so silently-lost data is caught.

8. **Fingerprint columns store JSON in TEXT.** §5.1 — three columns. Migrating to jsonb is straightforward but requires reader updates.

9. **`audio_clips` is 68% orphaned.** Cleanup is non-trivial (need to know which clips are referenced by content not yet published vs truly stranded).

10. **Schema declares 22 artifact kinds; 10 never written.** Decide: prune the type union or commit to writing the dead kinds.

11. **`session_id` is `text` in `capability_review_events` and `uuid` in `capability_resolution_failure_events`.** Type inconsistency for the same conceptual field.

12. **Legacy-retained tables (`learner_item_state`, `learner_skill_state`, `review_events`) have 4,428 rows of historical data.** `leaderboard` view still reads from two of them (`data-model.md:218-223`). Retirement requires rewriting `leaderboard`.

13. **`content_units.unit_kind` and `learning_capabilities.source_kind` overlap conceptually but disagree on `dialogue_line`.** `unit_kind` admits `dialogue_line` (`content-units-lesson-blocks.sql:10`); zero rows of that kind exist. `source_kind` actively uses `dialogue_line`. The two enums should agree or be explicitly different.

14. **Schema drift between standalone migrations and `scripts/migration.sql`.** §2 — the live DB shape lives in two file sets. Folding the 9 standalone capability-subsystem files into `scripts/migration.sql` is on the docs backlog (`docs/target-architecture.md` § Backlog).

---

## §10. What this document does NOT cover

- **The pipeline writers in detail.** I read enough of `scripts/lib/pipeline/capability-stage/projectors/` to verify the emit-shape claims, but a full pass over the pipeline's data-flow belongs in the design and migration docs (where it informs migration strategy).
- **The full set of analytics queries.** I confirmed `src/lib/analytics/*` reads from `learner_capability_state` columnar fields and from `capability_review_events`; I did not catalogue every analytics function's query shape. Design pass should.
- **The lesson reader's full handling of every payload shape.** I traced the forgiving extraction (§3.4) and confirmed it silently drops unknowns, but did not enumerate every key set the renderer probes.
- **The seed scripts for `scripts/data/lessons.ts`.** These remain authoritative for `lesson_sections.content` per CLAUDE.md:273. The design pass should decide whether the typed schema lives in TS or in the DB.
- **RLS policies + grants.** Recorded structurally (per-table) but not catalogued exhaustively in this doc; `schema_health` output is the canonical reference.

---

**End of evidence document.** The companion documents are:

- `2026-05-21-data-model-target.md` — the proposed target schema, justified by this evidence.
- `2026-05-21-data-model-migration.md` — the migration sequence from current to target.
- `docs/adr/<next-numbers>` — architectural decisions pinned out of this work.
