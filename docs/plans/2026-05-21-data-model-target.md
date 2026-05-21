---
status: draft
doc_type: data-model-target-proposal
last_verified_against_code: 2026-05-21
depends_on:
  - 2026-05-21-data-model-investigation.md
---

# Data-model target — proposed schema

**Role:** This document proposes the target schema for the `indonesian` Postgres schema. It is grounded in `2026-05-21-data-model-investigation.md` (the evidence doc); every claim about the current state cites a section there. Every choice is justified against the user's stated preferences and the ADRs.

**What this doc is not:** It is not a migration sequence. The migration order, idempotency, rollback, and code-paths-changed live in `2026-05-21-data-model-migration.md`.

**What this doc decides:** What the schema should look like once the migration completes. Each current table is classified: **survives** (no change), **renamed**, **split**, **merged**, or **retired**. Each new table is named with its columns, types, constraints, indexes, RLS, and read/write roles.

---

## §1. Design pressures and rules

These are the constraints any target schema must satisfy, derived from `docs/target-architecture.md` § Architectural rules + ADRs + user-stated preferences in this session.

### 1.1 From ADRs (binding)

- **ADR 0001:** Capabilities are the schedulable unit. A content source produces many capabilities; each has canonical identity + readiness + activation + review evidence.
- **ADR 0002:** Stages are derived, not authoritative. Mastery labels are read-only views over evidence.
- **ADR 0003:** FSRS schedules capabilities. Content sources / units provide provenance + sequencing only.
- **ADR 0004:** Review commits are atomic + idempotent. Sole writer is the server RPC.
- **ADR 0006:** Every lesson-derived capability has a non-null `lesson_id`. Podcast caps are the documented exception (`source_kind in (podcast_segment, podcast_phrase) OR lesson_id is not null`).
- **ADR 0007:** Receptive-before-productive staging — capability staging gate consumes `stability` + `successfulReviewCount`. The schema must continue to expose these per-cap-per-learner.

### 1.2 From `docs/target-architecture.md` (binding)

- **Rule #1 (module shape):** A folder under `src/lib/<name>/` is justified only when at least one function hides non-trivial logic. CRUD-shaped data adapters stay in `src/services/`.
- **Rule #3 (one job per module):** Capabilities is the noun; everything else (scheduling, planning, rendering, analytics) is a verb. A "X-and-Y" table is two tables.
- **Rule #6 (one source of truth):** No concept stored in two places. Drift cure: pick one as canonical, derive the other.
- **Rule #9 (user-driven gates over inferred ones):** Activation = explicit checkbox, not inferred from interactions.
- **Rule #10 (no dead infrastructure on speculation):** If a subsystem has no live use case, retire it.

### 1.3 From the user's explicit preferences (this session)

1. **"Structurally and architecturally sound and easy to maintain."** Optimise for the next contributor; minimise shape-divergence bug class.
2. **`lesson_id` directly on every content table** so per-lesson joins are uniform.
3. **Deep modules with one job each**, not generic blob storage with consumer-side dispatching.

These three principles concretely imply:
- **No generic `capability_artifacts` bag.** Each artifact-kind shape becomes a typed table or is read from its existing canonical table.
- **No shape-variable JSON column that the runtime decodes via discriminator + opportunistic extraction.** A discriminator column means "split into typed tables."
- **`lesson_id` is a first-class column** on lesson-derived content rows, not encoded in a path-shaped `source_ref` text column.

### 1.4 From the live data (investigation §5)

- 6 source_kinds declared in code; only 4 ever written. (`podcast_segment`, `podcast_phrase` are aspirational.)
- 22 artifact_kinds declared; only 12 ever written. The unused 10 are aspirational.
- 716 exercise_variants are orphaned at runtime — the schema-decision must say what to do with them.
- 6 of 12 capability_types have never rendered for any learner. The schema doesn't need to assume they all become live tomorrow, but should not block their being wired later.

### 1.5 Hierarchy when rules conflict

When the user's preferences and the ADRs conflict (e.g. user wants `lesson_id` directly on every content table; ADR 0006 only requires it on capabilities), favour the user's preference if it does not violate an ADR. Lesson_id on more tables is purely additive.

---

## §2. Decision walkthrough

This section works through the explicit design questions in the user's prompt, justified against §1.

### Decision A — Does the generic `capability_artifacts` abstraction survive?

**Decision: Retire `capability_artifacts` as a single bag. Replace with a small typed-satellite set.**

**Evidence (investigation §3.2, §5.2):**
- 12 artifact_kinds in use; 7 collapse to `{value: string}`, 2 to `{values: string[]}`, 3 are structured.
- The "uniform fetch" pattern (`fetchArtifacts` at `lib/exercise-content/adapter.ts:291-303`) returns one big `Map<ArtifactKind, CapabilityArtifact>` per cap, which per-builder code (`byType/*.ts`) then unpacks. The bag → unpack round trip serves no purpose the schema can't serve directly.
- 9 of 12 kinds are *already* canonically stored in other tables (`learning_items.base_text`, `item_meanings.translation_text`, `item_answer_variants.variant_text`, `grammar_patterns.short_explanation`/`name`). The artifact row is a denormalised snapshot.

**Target shape (5 sources replace one bag):**

| Today (artifact_kind) | Live count | Target home | Why |
|---|---:|---|---|
| `base_text` | 2,605 | `learning_items.base_text` (no change) | Already canonical; runtime reads can JOIN instead of duplicate |
| `meaning:l1` | 3,260 | `item_meanings WHERE translation_language=user_language AND is_primary` | Already canonical; runtime joins |
| `accepted_answers:l1` | 655 | `item_answer_variants WHERE language=l1 AND is_accepted` | Already canonical |
| `accepted_answers:id` | 1,295 | `item_answer_variants WHERE language='id' AND is_accepted` | Already canonical |
| `pattern_explanation:l1` | 94 | `grammar_patterns.short_explanation` (no change) | Already canonical |
| `pattern_example` | 94 | NEW: `grammar_pattern_examples` (id, pattern_id, example_text, display_order) | Pattern can have multiple examples (today 1:1; future > 1 → satellite) |
| `cloze_answer` | 7 | NEW: `dialogue_clozes` table column `answer_text` | Coheres with cloze_context as one logical row |
| `cloze_context` | 7 | NEW: `dialogue_clozes` table | One typed row per dialogue cloze, replacing 3 artifact rows |
| `translation:l1` | 7 | NEW: `dialogue_clozes.translation_text` | Same — coheres with cloze |
| `audio_clip` | 1,280 | `audio_clips` (existing) + FK from cap-source-kind tables | The duplication is the bug; remove the wrapper |
| `root_derived_pair` | 4 | NEW: `affixed_form_pairs` (root_text, derived_text, allomorph_rule, lesson_id) | One typed row per pair |
| `allomorph_rule` | 4 | NEW: `affixed_form_pairs.allomorph_rule` | Same — coheres with the pair |

**Net change:**
- Retire: `capability_artifacts` (9,312 rows).
- New typed tables: `dialogue_clozes`, `affixed_form_pairs`, `grammar_pattern_examples`. **3 new tables**, not 17.
- No new table needed for text artifacts — read from `learning_items` + `item_meanings` + `item_answer_variants` + `grammar_patterns`.

**Capability-side change:**
- `learning_capabilities.artifact_fingerprint` is retired — readiness is derived from "do the upstream rows the contract needs exist + are approved" at projection time.
- `learning_capabilities.metadata_json.requiredArtifacts` is retired — same reason.
- Readiness check moves from "do all required artifacts exist as `capability_artifacts` rows" to "does the upstream typed-table query return non-empty for the contract's required reads." The contract layer in `renderContracts.ts:54-127` becomes the validator's ground truth.

**Quality-status concern:** `capability_artifacts.quality_status in ('draft','approved','blocked','deprecated')` (`capability-core.sql:47`) lets a draft artifact suppress capability readiness. Per CLAUDE.md ("Everything publishes immediately. There is no manual approval gate."), `quality_status='approved'` is the universal post-publish state. **The quality_status field is dead in practice.** Retiring `capability_artifacts` also retires this field.

### Decision B — `exercise_variants`: kept, split, or retired?

**Decision: Split into 4 typed tables, one per exercise_type. Wire the routing (Decision F).**

**Evidence (investigation §3.3):**
- 716 rows; 4 distinct shapes per `exercise_type`; `answer_key_json` is pure subset of `payload_json`.
- All rows are `grammar_pattern_id`-keyed; none are `learning_item_id`-keyed despite the runtime fetcher reading `WHERE learning_item_id IN (...)`.

**Options considered:**

| Option | Schema impact | Routing fix needed | Verdict |
|---|---|---|---|
| (a) Retire entirely | Drop 716 rows; drop columns | No routing fix | **No.** Authoring path (grammar-exercise-creator agent) wrote these; data has linguistic value; retire is too aggressive. |
| (b) Keep single table; type the column-set | Add 5+ nullable columns | Same routing problem | **No.** Doesn't solve the shape-divergence problem the user named as a goal. |
| (c) Split into 4 typed tables | 4 new tables; drop 1 table | Yes — wire pattern capabilities to grammar exercises | **Yes — and the routing wire IS a coupled feature change, not just a schema change.** The table split eliminates JSON shape variability per ADR 0009. The accompanying routing change (`renderContracts.ts` capabilityTypes widening) is what makes the new tables live — see Decision G + ADR 0010. **Approving this decision is therefore approving a behaviour change, not a pure refactor.** |

**Target shape (4 tables, each FK to `grammar_patterns(id)` with `lesson_id` denormalised for join uniformity):**

```sql
-- Each table mirrors one row of the live exercise_variants table, but
-- with typed columns instead of a JSON blob.
create table indonesian.contrast_pair_exercises (
  id uuid primary key default gen_random_uuid(),
  grammar_pattern_id uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id uuid not null references indonesian.lessons(id) on delete restrict,
  prompt_text text not null,
  target_meaning text not null,
  options jsonb not null,                         -- shape: [{id:string, text:string}, ...] (small bounded array)
  correct_option_id text not null,
  explanation_text text not null,
  is_active boolean not null default true,
  source_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table indonesian.sentence_transformation_exercises (
  id uuid primary key default gen_random_uuid(),
  grammar_pattern_id uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id uuid not null references indonesian.lessons(id) on delete restrict,
  source_sentence text not null,
  transformation_instruction text not null,
  hint_text text,
  acceptable_answers text[] not null,
  explanation_text text not null,
  is_active boolean not null default true,
  source_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table indonesian.constrained_translation_exercises (
  id uuid primary key default gen_random_uuid(),
  grammar_pattern_id uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id uuid not null references indonesian.lessons(id) on delete restrict,
  source_language_sentence text not null,
  required_target_pattern text not null,
  disallowed_shortcut_forms text[] not null default '{}',
  acceptable_answers text[] not null,
  explanation_text text not null,
  is_active boolean not null default true,
  source_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table indonesian.cloze_mcq_exercises (
  id uuid primary key default gen_random_uuid(),
  grammar_pattern_id uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  lesson_id uuid not null references indonesian.lessons(id) on delete restrict,
  sentence text not null,
  translation text not null,
  options jsonb not null,                         -- shape: string[] (just the option strings)
  correct_option_id text not null,
  explanation_text text not null,
  is_active boolean not null default true,
  source_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Note on `options jsonb`:** The MCQ options are tightly coupled to their parent exercise row and are small bounded arrays (typically ≤ 5 options). The choice is between (a) keeping options as a small jsonb array on the parent row or (b) extracting to a separate `mcq_exercise_options` junction table. Keeping as jsonb on the parent is simpler (one query, no JOIN) and fits the "deep modules" preference (the option set IS the exercise). The shape is fixed and validatable via Zod at write time. **Recommendation: keep as jsonb.**

**Routing fix (Decision F):** `pattern_recognition` and `pattern_contrast` capability_types route to these tables. The 4 exercise_type contracts in `renderContracts.ts` widen `capabilityTypes` to include those. See Decision F.

### Decision C — `lesson_page_blocks.payload_json` shape variance: split or formalise?

**Decision: Split `lesson_page_blocks` into typed satellites, one per block_kind. Retire the generic table.**

**Evidence (investigation §3.4):**
- 7 distinct shapes within `reading_section` alone; 5 within `dialogue_card`.
- Generic reader `LessonBlockRenderer.tsx:12-76` uses forgiving extraction that silently drops shape-specific fields.
- Per-lesson bespoke `Page.tsx` files (currently WIP per git status) cast `section.content as Shape` per shape — this is the second reader path emerging because the generic one can't handle the variability.

**Options considered:**

| Option | Schema | Reader | Verdict |
|---|---|---|---|
| (a) Keep generic; add Zod / JSON schema validation at write time | Same; +runtime validation | Same forgiving extraction | **No.** Doesn't help the runtime — still extracting from a JSON blob via key probes. |
| (b) Keep generic; add many more `block_kind` values for each sub-shape | Same; +constraint widening | Generic reader needs new branches per kind | **No.** Doubles down on the discriminator-with-JSON pattern. |
| (c) Split: one typed table per block_kind | Drop generic; +6-7 new tables | Each kind's reader is a typed query | **Yes.** Eliminates the shape-divergence problem. |

**Target shape (6 typed tables — `pattern_callout` is dropped per §5.3, has zero rows):**

```sql
-- Stable base: every lesson page block carries lesson + ordering + source ref.
create table indonesian.lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references indonesian.lessons(id) on delete cascade,
  block_kind text not null check (block_kind in (
    'lesson_hero','reading_section','vocab_strip','dialogue_card',
    'practice_bridge','lesson_recap'
  )),
  display_order integer not null,
  source_ref text not null,                       -- e.g. 'lesson-1/section-3'; kept as audit trail / debugging hook
  -- the typed satellite row is found by (lesson_id, block_kind) + a kind-specific UNIQUE on satellite
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, display_order),
  unique (lesson_id, source_ref)
);

-- ─────────────── per-kind typed satellites ───────────────

create table indonesian.lesson_block_hero (
  block_id uuid primary key references indonesian.lesson_blocks(id) on delete cascade,
  title text not null,
  level text not null  -- e.g. 'A1'
);

create table indonesian.lesson_block_recap (
  block_id uuid primary key references indonesian.lesson_blocks(id) on delete cascade,
  title text not null
);

create table indonesian.lesson_block_practice_bridge (
  block_id uuid primary key references indonesian.lesson_blocks(id) on delete cascade,
  label text not null
);

create table indonesian.lesson_block_reading_section (
  block_id uuid primary key references indonesian.lesson_blocks(id) on delete cascade,
  title text not null,
  reading_kind text not null check (reading_kind in (
    'paragraphs','categories','letters','sentences','intro_only','grammar_reference'
  )),
  intro text,
  paragraphs text[],
  sentences jsonb,                                -- shape: [{indonesian, dutch}]
  categories jsonb,                               -- shape: [{title, rules[], examples[{indonesian,dutch}]}, ...]
  letters jsonb,                                  -- shape: [{letter, rule, examples[]}]
  grammar_reference jsonb                         -- holdout for the 1-row reference_table shape; documented as "if non-null, the reader uses a bespoke renderer"
);

create table indonesian.lesson_block_vocab_strip (
  block_id uuid primary key references indonesian.lesson_blocks(id) on delete cascade,
  title text not null,
  -- items reference content_units (the stable identity), not raw strings; renderer joins
  -- to get the displayed Indonesian + L1 text. See content_units retirement in Decision E
  -- and replacement table in target §3.
  content_unit_slugs text[] not null
);

create table indonesian.lesson_block_dialogue_card (
  block_id uuid primary key references indonesian.lesson_blocks(id) on delete cascade,
  title text not null,
  intro text,
  setup text,
  closing text,
  -- dialogue lines are typed rows in lesson_dialogue_lines (Decision D), not embedded JSON
  source_section_ref text not null   -- e.g. 'lesson-1/section-3' → the parent dialogue section in lesson_sections
);
```

**Reading shape simplification:** The `reading_section` kind has 7 sub-shapes today. The proposal collapses them via a `reading_kind` discriminator + typed columns. This admits the data without forcing the renderer to probe keys. The one bespoke `reference_table` row (lesson 4) becomes `reading_kind='grammar_reference'` + `grammar_reference jsonb` (an honest single-row bespoke shape with a clear flag).

**On `lesson_block_vocab_strip.content_unit_slugs`:** This is the only place arrays survive in the proposal — see Decision G.

### Decision D — `lesson_sections.content` shape variance

**Decision: Split `lesson_sections.content` into typed rows in new satellite tables. Retire the generic JSON column.**

**Evidence (investigation §3.5):**
- 10 declared `content.type` values; 9+ observed shapes; one bespoke 9-key shape (`reference_table`).
- Per-lesson bespoke `Page.tsx` files cast specific shapes — these are the runtime readers.
- `coverageService.ts` reads `content->>'type'` for admin coverage — needs a discriminator after the split.

**Why this matters even though the lesson page-block table also exists:** `lesson_page_blocks` is the *projection* (what the lesson reader renders). `lesson_sections` is the *authoring source* (what the pipeline reads from staging + writes per lesson). Both exist today (`data-model.md:127, 96`). The lesson reader uses page_blocks (`LessonReader.tsx:55` via `LessonExperience`); other consumers (coverage, grammar topic extraction, dialogue propagation) use `lesson_sections.content`.

**Target shape:** Replace `lesson_sections.content` with typed rows. `lesson_sections` becomes a slim header table:

```sql
-- Slim header: identity + ordering. Content lives in typed satellites.
create table indonesian.lesson_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references indonesian.lessons(id) on delete cascade,
  title text not null,
  section_kind text not null check (section_kind in (
    'reading','vocabulary','expressions','numbers','dialogue',
    'grammar','pronunciation','reference','exercises','culture'
  )),
  order_index integer not null,
  source_section_ref text not null,               -- 'lesson-N/section-M' — stable identifier
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lesson_id, source_section_ref)
);

-- Typed satellites. Most lesson_section.section_kind values map to one of:

-- 'reading' — paragraphs of prose
create table indonesian.lesson_section_reading (
  section_id uuid primary key references indonesian.lesson_sections(id) on delete cascade,
  intro text,
  paragraphs text[] not null
);

-- 'vocabulary' / 'expressions' / 'numbers' — uniform items shape today (investigation §3.5);
-- merge into one table with a sub-kind discriminator
create table indonesian.lesson_section_items (
  section_id uuid primary key references indonesian.lesson_sections(id) on delete cascade
  -- items list lives in lesson_section_item_rows (Decision G — junction over array)
);

create table indonesian.lesson_section_item_rows (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references indonesian.lesson_section_items(section_id) on delete cascade,
  display_order integer not null,
  indonesian_text text not null,
  l1_translation text not null,
  unique(section_id, display_order)
);

-- 'dialogue' — per-line typed rows; also the source of dialogue_line capabilities
create table indonesian.lesson_section_dialogue (
  section_id uuid primary key references indonesian.lesson_sections(id) on delete cascade,
  intro text,
  setup text,
  closing text
  -- lines live in lesson_dialogue_lines (next table)
);

create table indonesian.lesson_dialogue_lines (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references indonesian.lesson_section_dialogue(section_id) on delete cascade,
  lesson_id uuid not null references indonesian.lessons(id) on delete cascade,  -- denormalised for query uniformity per user preference
  line_index integer not null,                                                  -- 0-based; same as canonical-key line-K
  source_line_ref text not null,                                                -- 'lesson-N/section-M/line-K' — stable identifier
  text text not null,
  speaker text,                                                                 -- nullable for narrator-style lines
  translation text not null,                                                    -- propagated by pipeline enrichDialogueTranslations
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(section_id, line_index),
  unique(source_line_ref)
);

-- 'grammar' — explanation with optional examples and topic tags
create table indonesian.lesson_section_grammar (
  section_id uuid primary key references indonesian.lesson_sections(id) on delete cascade,
  intro text,
  word_order text,                                -- for the SE-prefix section
  note text                                       -- short trailing note
);

create table indonesian.lesson_section_grammar_categories (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references indonesian.lesson_section_grammar(section_id) on delete cascade,
  display_order integer not null,
  title text not null,
  rules text[] not null default '{}',
  examples jsonb,                                 -- [{indonesian,dutch}] — bounded
  unique(section_id, display_order)
);

create table indonesian.lesson_section_grammar_topics (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references indonesian.lesson_section_grammar(section_id) on delete cascade,
  topic_label text not null,
  unique(section_id, topic_label)
);

-- 'pronunciation' — letters with rules
create table indonesian.lesson_section_pronunciation (
  section_id uuid primary key references indonesian.lesson_sections(id) on delete cascade,
  intro text
);

create table indonesian.lesson_section_pronunciation_letters (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references indonesian.lesson_section_pronunciation(section_id) on delete cascade,
  display_order integer not null,
  letter text not null,
  rule text not null,
  examples text[] not null,
  unique(section_id, display_order)
);

-- 'reference' — the one 9-key bespoke shape; documented as "bespoke, structured, do not generalise"
create table indonesian.lesson_section_reference (
  section_id uuid primary key references indonesian.lesson_sections(id) on delete cascade,
  intro text,
  table_title text,
  reference_payload jsonb not null                -- documented as: the bespoke reference-table shape for this 1 section; if generalised later, this becomes typed
);

-- 'exercises' — embedded question lists (read-only display, distinct from runtime exercises)
create table indonesian.lesson_section_exercise_groups (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references indonesian.lesson_sections(id) on delete cascade,
  display_order integer not null,
  title text,
  questions text[] not null,
  unique(section_id, display_order)
);

-- 'culture' — same shape as 'reading' (paragraphs) in practice; merge into reading and add culture_flag
-- → use lesson_section_reading with section_kind='culture' on the parent header (discriminator on lesson_sections.section_kind)
```

**Net change:** `lesson_sections` becomes a header table. ~10 typed satellites cover the 10 section_kinds. The pipeline emits typed rows directly. The runtime readers query the satellite that matches the section_kind.

**Note on the bespoke `reference_table` row:** This is the one case where a 9-key JSON column survives, in `lesson_section_reference.reference_payload`. Documented as a known one-off; if a future lesson needs the same shape, formalise it then.

**`source_section_ref` denormalisation:** kept as a TEXT column even though it could be derived from `lessons.order_index + lesson_sections.order_index`. The path-shaped ref is referenced from:
- `learning_capabilities.source_ref` for `dialogue_line` caps (`lesson-N/section-M/line-K`)
- `lesson_blocks.source_ref` for the per-block source citation
- canonical_key encoding in `capabilities.canonicalKey.ts`

Keeping the canonical text identifier as a column matches the user's stated preference for lookup uniformity. The trade-off: two writers (path-builder + lesson-ordering-builder) must agree. The pipeline emits both in one transaction so drift is prevented by construction.

### Decision E — `content_units` and `capability_content_units` (the M:N bridge)

**Decision: Retire `content_units.payload_json` (it's pure denormalisation). Keep `content_units` as an identity-only table (the slug-identity needed for the M:N bridge). Rename `capability_content_units` → `capability_content_unit_refs` for clarity.**

**Evidence (investigation §3.6):**
- 4 unit_kinds, all with stable shape, but payload_json is denormalised from upstream tables: learning_items, grammar_patterns, lesson_sections.
- `source_fingerprint` denormalises EVEN MORE (carries POS, level, context_type — not in payload_json).
- The bridge `capability_content_units` (4,078 rows) is actively used; the table itself isn't the problem.

**Options considered:**

| Option | Schema | Verdict |
|---|---|---|
| (a) Retire entirely; replace junction with per-source-kind FKs | Drop both tables; add `capability_<kind>_refs` per kind | **No.** Loses the uniform "content_unit" identity that the bridge provides. |
| (b) Keep both; just drop the denormalised payload | content_units becomes (id, content_unit_key, source_ref, source_section_ref, unit_kind, unit_slug, display_order) | **Yes.** Minimal disruption; eliminates denorm. |
| (c) Same as (b) but also denormalise lesson_id | + lesson_id column for query uniformity | **Yes — add lesson_id per user preference.** |

**Target shape:**

```sql
create table indonesian.content_units (
  id uuid primary key default gen_random_uuid(),
  content_unit_key text not null unique,
  -- ON DELETE CASCADE: deleting a lesson cascades its content_units away.
  -- Compare to learning_capabilities.lesson_id which uses RESTRICT (a lesson
  -- with active capabilities cannot be deleted). The asymmetry is deliberate:
  -- content_units are derived projections (regenerated by the pipeline) so
  -- losing them on lesson delete is recoverable; capabilities are FSRS-keyed
  -- (orphaning them would lose learner state).
  lesson_id uuid references indonesian.lessons(id) on delete cascade,  -- nullable for podcast (when added)
  source_ref text not null,
  source_section_ref text not null,
  unit_kind text not null check (unit_kind in (
    'lesson_section','learning_item','grammar_pattern','dialogue_line',
    'affixed_form_pair','podcast_segment','podcast_phrase'
  )),
  unit_slug text not null,
  display_order integer not null,
  -- Removed: payload_json (denormalised; readers join the source table)
  -- Removed: source_fingerprint (denormalised; replace with versioning at the source level)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_ref, source_section_ref, unit_slug)
);

create table indonesian.capability_content_units (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  content_unit_id uuid not null references indonesian.content_units(id) on delete cascade,
  relationship_kind text not null check (relationship_kind in (
    'introduced_by','practiced_by','assessed_by','referenced_by'
  )),
  created_at timestamptz not null default now(),
  unique(capability_id, content_unit_id, relationship_kind)
);
```

**What changes for readers:** Code that previously read `content_units.payload_json.baseText` now JOINs to `learning_items.base_text`. The runtime does this in spirit already (it loads `learning_items` via the byKind/item fetcher). Pipeline code that regenerates content_units removes the payload_json computation.

### Decision F — `learning_capabilities.metadata_json` retire-or-keep

**Decision: Retire entirely. Promote needed fields to columns.**

**Evidence (investigation §3.1, §5.3):**
- `goalTags` — **dead in effect.** The goal subsystem that consumed this field was retired #4 (2026-05-07). 4 caps carry non-empty values + the podcast projector writes them, but `grep -rn '\.goalTags' src/` returns zero non-writer references — the values flow into `PlannerCapability.goalTags` and stop. Retire the column; remove the writers in the same PR.
- `requiredSourceProgress` — dead in DB (always null) but still emitted by pipeline. Retiring the column requires updating `pipeline/capability-stage/runner.ts:379` + `adapter.ts:147` in the same PR.
- `prerequisiteKeys` — actively used by `pedagogy.ts` staging gate (ADR 0007).
- `requiredArtifacts` — duplicates `artifact_fingerprint`.
- `skillType` — duplicates `capability_type`.
- `difficultyLevel` — set per-cap-type, never read at runtime (verified by grep — only emitted in `capabilityCatalog.ts`, no runtime consumer).

**Target shape:** Promote `prerequisiteKeys` to a typed column. Retire everything else.

```sql
alter table indonesian.learning_capabilities
  drop column metadata_json,
  drop column source_fingerprint,                 -- JSON-as-text; redundant with (source_kind, source_ref)
  drop column artifact_fingerprint,               -- JSON-as-text; derive from contract + cap state
  add column prerequisite_keys text[] not null default '{}';
```

| Field | Disposition |
|---|---|
| `goalTags` | Drop — goal subsystem retired #4; grep confirms no reader. Pipeline + adapter writers at `capabilityCatalog.ts:191,205` + `podcast-stage/podcastProjectionRules.ts:81,96` + `pipeline/capability-stage/runner.ts:381` + `adapter.ts:149` removed in the same PR. |
| `requiredSourceProgress` | Drop — source-progress retired #6. Pipeline emitters at `runner.ts:379` + `adapter.ts:147` must be updated in the same PR. |
| `requiredArtifacts` | Drop — derivable from `renderContracts.RENDER_CONTRACTS[exercise_type].requiredArtifacts[source_kind]` |
| `skillType` | Drop — equivalent to `capability_type` (per `capabilityCatalog.ts`) |
| `difficultyLevel` | Drop — no runtime consumer — annotation only |
| `source_fingerprint` | Drop — trivially `JSON.stringify({sourceKind, sourceRef})` — derivable, not stored |
| `artifact_fingerprint` | Drop — trivially `JSON.stringify(requiredArtifacts)` — derivable, not stored |

### Decision G — Routing fix for grammar exercises

**Decision: Wire `pattern_recognition` and `pattern_contrast` capability types to the 4 grammar exercise tables. Implement as part of the schema work (not separate).**

**Why include in the schema doc:** The schema design must reflect the routing. If `learning_capabilities` source_kind='pattern' rows have no runtime path, retiring them is just as principled as wiring them. The user has explicitly said this app should be "structurally sound," which implies no dead data paths.

**Investigation evidence (§3.3, §1.4):** 716 exercise_variants + 94 pattern caps + 2 pattern capability_types are all currently unreachable. The 4 exercise types `contrast_pair`, `sentence_transformation`, `constrained_translation`, `cloze_mcq` declare `capabilityTypes: []`.

**Target routing (matches the proposed table split):**

| Exercise type (new table) | Capability types it serves | Source kinds it accepts |
|---|---|---|
| `contrast_pair_exercises` | `pattern_contrast` | `pattern` |
| `sentence_transformation_exercises` | `pattern_recognition` | `pattern` |
| `constrained_translation_exercises` | `pattern_recognition` | `pattern` |
| `cloze_mcq_exercises` | `pattern_recognition` OR `contextual_cloze` (with `supportedSourceKinds=['pattern','item']`) | both |

**Code change accompanying the schema migration:**
- `renderContracts.ts:43-127` gets updated `capabilityTypes` arrays for the 4 grammar exercises.
- `lib/exercise-content/byKind/` gets a new `pattern.ts` fetcher that reads the typed exercise tables by `grammar_pattern_id`.
- `pipeline/capability-stage/projectors/grammar.ts` writes the same `pattern_recognition` + `pattern_contrast` cap rows as today, but the readiness check (validateCapability) now passes (the grammar exercise table has rows for the pattern).

### Decision G2 — Exercise-type roster: all 12 types accounted for

The 4 authored grammar exercises get typed tables (Decision G). The other 8 exercise types are runtime-derived from existing tables and need **no new table**. This decision makes the policy explicit so every `ExerciseType` in `src/types/learning.ts:130` has a documented home.

| Exercise type | Source kinds | Storage | Reader path |
|---|---|---|---|
| `recognition_mcq` | item | `learning_items` + `item_meanings`; pool from `item_meanings` of other items in lesson | Runtime JOIN |
| `cued_recall` | item | `learning_items` + `item_meanings`; pool from `learning_items` of other items in lesson | Runtime JOIN |
| `typed_recall` | item, affixed_form_pair | item: `learning_items` + `item_meanings` + `item_answer_variants`; affixed_form_pair: `affixed_form_pairs` (Decision A) | Runtime JOIN |
| `meaning_recall` | item | `learning_items` + `item_meanings` + `item_answer_variants` | Runtime JOIN |
| `listening_mcq` | item | `learning_items` + `item_meanings` + `capability_audio_refs` → `audio_clips` (Decision Q); pool from other items in lesson | Runtime JOIN |
| `dictation` | item | `learning_items` + `item_answer_variants` + `capability_audio_refs` → `audio_clips` | Runtime JOIN |
| `cloze` | item, dialogue_line | item: `item_contexts WHERE context_type='cloze'`; dialogue_line: `dialogue_clozes` + `lesson_dialogue_lines` (Decisions A + D) | Runtime JOIN |
| `cloze_mcq` | item, pattern | item: `item_contexts WHERE context_type='cloze'` + computed pool; pattern: `cloze_mcq_exercises` (Decision G) | Runtime JOIN OR typed-table read |
| `contrast_pair` | pattern | `contrast_pair_exercises` (Decision G) | Typed-table read |
| `sentence_transformation` | pattern | `sentence_transformation_exercises` (Decision G) | Typed-table read |
| `constrained_translation` | pattern | `constrained_translation_exercises` (Decision G) | Typed-table read |
| `speaking` | item | `learning_items.base_text` + (optional, future) `speaking_exercises` for per-cap rubrics | Runtime JOIN (no new table needed today; `capabilityTypes: []` per `renderContracts.ts:130` — no cap routes to it yet) |

**Policy for future authored exercises:** when a new exercise type ships with hand-authored per-cap content (prompts, options, hints), it gets a typed table named `<exercise_type>_exercises`. When the content is derivable from upstream typed tables, no new table is needed.

**`exercise_type_availability` audit:** the table currently has 10 rows but the code defines 12 `ExerciseType` values. Missing: `meaning_recall`, `cloze_mcq`. Both must be inserted in the migration (with `session_enabled=true`, `rollout_phase='full'`) so the runtime's check at `lib/session-builder/` doesn't fail-open / fail-closed inconsistently.

### Decision H — `learner_capability_state.fsrs_state_json` vs columnar duplication

**Decision: Retire `fsrs_state_json`. Keep columnar fields. Add `retrievability` as a generated column** (today it's computed in `state_after_json` retrospectively).

**Evidence (investigation §3.7):** 0/50 divergence between column-stored and JSON-stored FSRS state. The JSON is pure duplication.

**Target shape:**

```sql
alter table indonesian.learner_capability_state
  drop column fsrs_state_json;

-- retrievability is computed from (stability, last_reviewed_at, now()); it lives
-- only in the answer log today (capability_review_events.state_after_json.retrievability).
-- Adding it as a generated column lets the analytics path query it directly.
-- (Postgres GENERATED ALWAYS AS ... STORED can't reference now(); compute at read time
-- in a view instead.)

create view indonesian.learner_capability_state_with_retrievability as
select
  s.*,
  -- ts-fsrs retrievability formula; matches getRetrievability in _shared/srs/algorithm.ts
  case
    when s.last_reviewed_at is null then null
    else exp(extract(epoch from (now() - s.last_reviewed_at)) / (-86400 * s.stability * (greatest(0.85, 0.85) / log(0.85))))
  end as retrievability
from indonesian.learner_capability_state s;
```

Or simpler: leave retrievability out of the schema entirely; analytics can compute it from the columns at query time as today (`src/lib/analytics/memory/adapter.ts`).

**Per the user's "deep modules" preference,** retrievability is FSRS math; the schema doesn't need to materialise it. Analytics queries can compute on read.

### Decision I — `capability_review_events` JSON columns: rationalise

**Decision: Merge the two redundant columns (`scheduler_snapshot_json` ≡ `state_before_json`). Drop `artifact_version_snapshot_json` (derivable). Keep `answer_report_json` and `state_after_json`.**

**Evidence (investigation §3.8):** 5 JSON columns; 2 fully duplicate; 1 derivable from joins.

**Target shape:**

```sql
alter table indonesian.capability_review_events
  drop column scheduler_snapshot_json,
  drop column artifact_version_snapshot_json,
  rename column state_before_json to state_before,
  rename column state_after_json to state_after,
  rename column answer_report_json to answer_report;
```

Note: `state_before` is needed (audit log; reproducing FSRS computation requires knowing what came in). `state_after` is needed (idempotency check; if a duplicate insert tries to write a different state_after for the same idempotency_key, that's a bug). `answer_report` is needed (the learner's actual answer).

Drop:
- `scheduler_snapshot_json` — same data as state_before.
- `artifact_version_snapshot_json` — `capability_id` already gives access to the cap row at the time of review (with `projection_version` to detect drift). The snapshot adds nothing.

`rating` `int 1..4` survives (rating=4 is empty in DB but the system supports it).

### Decision J — `lessons.dialogue_voices` JSON map: split or keep?

**Decision: Split into `lesson_speakers` junction table.**

**Evidence (investigation §3.12):** Per-lesson speaker→voice map, key set varies per lesson (2-5 speakers). The schema has no place for "voice for speaker S in lesson L" except the JSON map.

**Target shape:**

```sql
create table indonesian.lesson_speakers (
  lesson_id uuid not null references indonesian.lessons(id) on delete cascade,
  speaker text not null,                          -- e.g. 'Ibu', 'Pak', 'narrator'
  voice_id text not null,                         -- e.g. 'id-ID-Chirp3-HD-Sulafat'
  primary key (lesson_id, speaker)
);

alter table indonesian.lessons
  drop column dialogue_voices,
  drop column duration_seconds,                   -- always NULL
  drop column transcript_dutch,                   -- always NULL
  drop column transcript_indonesian,              -- always NULL
  drop column transcript_english;                 -- always NULL
```

### Decision K — Drop empty tables (aspirational)

**Decision: Drop 5 of 6 empty tables. KEEP `capability_aliases`.**

| Table | Drop / Keep | Reason |
|---|---|---|
| `capability_aliases` | **KEEP** | Per ADR 0001 (capability core) + target-architecture.md "constraints to honour" — the canonical_key contract is immutable BUT alias rows are the documented escape hatch for ever evolving cap shape without orphaning learner FSRS state. Retiring the table forecloses optionality. Zero rows is cheap; keep until ADR 0001 is amended. |
| `item_context_grammar_patterns` | Drop | Junction unused; `grammar_patterns.confusion_group` is the live mechanism. |
| `generated_exercise_candidates` | Drop | Authoring-pipeline table never written to. Staging stays in TS files. |
| `textbook_pages` | Drop | Same — staging stays in TS files. |
| `textbook_sources` | Drop | Same. |
| `podcasts` | Drop | Feature not built; build with the podcast schema design when needed. |

If any of the dropped tables become needed, design them then with concrete requirements rather than carrying empty aspirational shells.

### Decision L — Drop legacy-retained tables

**Decision: Drop `learner_item_state`, `learner_skill_state`, `review_events`. Rewrite the `leaderboard` view to source from `learner_capability_state` + `capability_review_events`.**

**Evidence (investigation §3.16):** Last writes: 2026-05-01. 4,428 rows total. The `leaderboard` view (`data-model.md:218-223`) reads from `learner_item_state` for `items_learned` and `learning_sessions` for time-based metrics.

**Leaderboard rewrite:**
- `items_learned` ← `count(distinct lcs.capability_id) FROM learner_capability_state lcs WHERE lcs.review_count > 0 GROUP BY user_id` (or stability-based; pick a definition).
- `lessons_completed` ← `count(*) FROM learner_lesson_activation WHERE activated_at IS NOT NULL` (or another definition; today this reads from `lesson_progress` which is also retired).
- `total_seconds_spent` ← `sum(ls.duration_seconds) FROM learning_sessions ls WHERE ls.session_type='learning'` (post-#5 semantics).

These three definitions need confirmation in the design review; the schema can be migrated with placeholders and the view rewritten as part of the migration.

### Decision M — Drop `lesson_progress`

**Decision: Drop entirely.** Per investigation §3.13 + CLAUDE.md / data-model.md:170-173 — write path retired, only used by `get_lessons_overview`'s `has_started_lesson` derivation as a fallback. The fallback can be removed.

### Decision N — Drop `capability_resolution_failure_events`?

**Decision: Keep. Already small (69 rows), diagnostic-only, low risk.** Add `lesson_id` denormalisation per user preference.

```sql
alter table indonesian.capability_resolution_failure_events
  add column lesson_id uuid references indonesian.lessons(id) on delete cascade;

-- session_id type: change to text NOT NULL to match capability_review_events.session_id
alter table indonesian.capability_resolution_failure_events
  alter column session_id type text using session_id::text,
  alter column session_id set not null;
```

### Decision Q — Audio data model (forward-looking for the `lib/audio` deep module)

The `lib/audio` module exists today as a single file (`src/lib/audio.tsx`, per target-architecture.md §"lib/audio") but is on the roadmap for promotion to a deep module. The schema needs to support both today's narrow use (TTS playback for exercise audio) and the deep module's plausible future surfaces (lesson-long-form, podcast playback, audio coverage analytics).

**Current state (investigation §3.11):**
- `audio_clips` — 1,974 rows. TTS-clip storage: one row per (`text_content`, `voice_id`). Used by `listening_mcq`, `dictation`, and `lib/audio.fetchSessionAudioMap`.
- `lessons.audio_path text` — 9 rows (one per lesson). Long-form lesson audio file path. Storage bucket `indonesian-lessons`.
- `podcasts.audio_path` (in retired `podcasts` table) — was for podcast audio; feature not built.
- `capability_artifacts(kind=audio_clip)` — 1,280 rows binding caps to clips (retired in Decision A).

**Target shape (3 concerns; 3 tables):**

```sql
-- (1) TTS clips. Keep audio_clips as-is — one row per (text, voice).
--     Already typed; no shape changes. 1,974 rows; 1,334 today are orphaned
--     (no cap references them) — audio-storage hygiene tracked separately
--     (Open Question §7).
-- audio_clips schema unchanged.

-- (2) Capability → audio binding. NEW (replaces the retired audio_clip
--     artifact rows).
create table indonesian.capability_audio_refs (
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  audio_clip_id uuid not null references indonesian.audio_clips(id) on delete restrict,
  voice_id text not null,                          -- denormalised from audio_clips.voice_id for query simplicity
  primary key (capability_id, audio_clip_id)
);

create index if not exists capability_audio_refs_clip_idx
  on indonesian.capability_audio_refs(audio_clip_id);

-- (3) Lesson long-form audio. KEEP lessons.audio_path text column for now;
--     it carries one file path per lesson. The deep module's future needs
--     (section-level audio? per-paragraph timecodes?) may require a
--     `lesson_audio_assets` table later — but the current shape is fit for
--     the current product. No change in this migration.
```

**Decisions deferred to when `lib/audio` is built:**

- Whether `lesson_audio` becomes its own table with per-section playback (vs. one whole-lesson MP3 file).
- Audio coverage analytics (which items lack TTS for which voice).
- Podcast audio (waits for the podcast feature).
- Per-clip duration_ms population (currently NULL on all rows; computed at TTS generation time but not persisted).

**Forward-compatibility check:** none of the proposed schema changes (in this target document) close off plausible audio-module designs:
- TTS clips are stable typed rows.
- Capability binding is a typed junction (extensible if a cap ever needs multiple clips per voice).
- Lesson audio is one column; expanding to a child table is a future migration.
- The audio module can build its read API (`fetchSessionAudioMap`, `resolveSessionAudioUrl`) over the 3-table shape.

### Decision O — `content_flags`, `exercise_review_comments`

**Decision: Keep. Both are admin/UX tables, columnar, no shape issues. Add `lesson_id` denormalisation where it makes per-lesson admin queries simpler.**

```sql
alter table indonesian.content_flags
  add column lesson_id uuid references indonesian.lessons(id) on delete set null;

alter table indonesian.exercise_review_comments
  add column lesson_id uuid references indonesian.lessons(id) on delete set null;
```

---

## §3. Target schema — complete table roster

This section names every table in the target schema. For brevity, only changes from the current schema are itemised; survives-as-is tables are listed without full DDL.

### 3.1 Capability layer

| Table | Status | Change |
|---|---|---|
| `learning_capabilities` | survives | Drop `metadata_json`, `source_fingerprint`, `artifact_fingerprint`. Add `prerequisite_keys text[]`. Keep `lesson_id` + CHECK constraint per ADR 0006. |
| `learner_capability_state` | survives | Drop `fsrs_state_json`. Keep columnar fields. |
| `capability_review_events` | survives | Drop `scheduler_snapshot_json` + `artifact_version_snapshot_json`. Rename remaining `_json` columns. |
| `capability_resolution_failure_events` | survives | Add `lesson_id`; change `session_id` to text NOT NULL. |
| `capability_artifacts` | **RETIRED** | All content moves to typed tables; see Decision A. |
| `capability_aliases` | **KEEP** (revised — see Decision K) | Empty today; preserved per ADR 0001 as the canonical-key migration escape hatch. |
| `content_units` | survives | Drop `payload_json` + `source_fingerprint`. Add `lesson_id`. |
| `capability_content_units` | survives | No change. |
| `lesson_page_blocks` | **RETIRED** | Replaced by `lesson_blocks` + per-kind satellites (Decision C). |

### 3.2 Lesson activation

| Table | Status |
|---|---|
| `learner_lesson_activation` | survives unchanged |

### 3.3 Content (vocab + sentences + exercises)

| Table | Status | Change |
|---|---|---|
| `learning_items` | survives | Add `lesson_id` (denormalised — per user preference). |
| `item_meanings` | survives | No change. |
| `item_answer_variants` | survives | No change. |
| `item_contexts` | survives | Add `lesson_id` if not already present (already has `source_lesson_id`). Audit context_type values — drop `vocabulary_list` if confirmed unused. |
| `item_context_grammar_patterns` | **RETIRED** | Empty + unused. |
| `grammar_patterns` | survives | Already has `introduced_by_lesson_id`. No change. |
| `exercise_variants` | **RETIRED** | Replaced by 4 typed tables. |
| **NEW** `contrast_pair_exercises` | new | Decision B |
| **NEW** `sentence_transformation_exercises` | new | Decision B |
| **NEW** `constrained_translation_exercises` | new | Decision B |
| **NEW** `cloze_mcq_exercises` | new | Decision B |
| **NEW** `grammar_pattern_examples` | new | Decision A; replaces `capability_artifacts.artifact_kind='pattern_example'` rows. Multiple examples per pattern is natural. |
| **NEW** `dialogue_clozes` | new | Decision A; one row per dialogue cloze (replaces 3 artifact rows). |
| **NEW** `affixed_form_pairs` | new | Decision A; one row per pair (replaces 2 artifact rows). |

### 3.4 Lesson content

| Table | Status | Change |
|---|---|---|
| `lessons` | survives | Drop `dialogue_voices`, `duration_seconds`, `transcript_*` (Decision J). |
| `lesson_sections` | survives (slimmer) | Drop `content`. Add `section_kind`, `source_section_ref`. (Decision D) |
| `audio_clips` | survives | No change. The 1,334 orphans (§3.11) are cleanup tracked separately. See Decision Q. |
| **NEW** `capability_audio_refs` | new | Decision Q — binds caps to TTS clips (replaces `audio_clip` artifact rows). |
| `podcasts` | **RETIRED** | Empty + feature not built. |
| **NEW** `lesson_speakers` | new | Decision J |
| **NEW** `lesson_blocks` | new | Decision C |
| **NEW** `lesson_block_hero` | new | Decision C |
| **NEW** `lesson_block_recap` | new | Decision C |
| **NEW** `lesson_block_practice_bridge` | new | Decision C |
| **NEW** `lesson_block_reading_section` | new | Decision C |
| **NEW** `lesson_block_vocab_strip` | new | Decision C |
| **NEW** `lesson_block_dialogue_card` | new | Decision C |
| **NEW** `lesson_section_reading` | new | Decision D |
| **NEW** `lesson_section_items` | new | Decision D |
| **NEW** `lesson_section_item_rows` | new | Decision D |
| **NEW** `lesson_section_dialogue` | new | Decision D |
| **NEW** `lesson_section_grammar` | new | Decision D |
| **NEW** `lesson_section_grammar_categories` | new | Decision D |
| **NEW** `lesson_section_grammar_topics` | new | Decision D |
| **NEW** `lesson_section_pronunciation` | new | Decision D |
| **NEW** `lesson_section_pronunciation_letters` | new | Decision D |
| **NEW** `lesson_section_reference` | new | Decision D |
| **NEW** `lesson_section_exercise_groups` | new | Decision D |
| **NEW** `lesson_dialogue_lines` | new | Decision D |

### 3.5 Authoring + flags

| Table | Status |
|---|---|
| `content_flags` | survives + lesson_id added |
| `exercise_review_comments` | survives + lesson_id added |
| `textbook_sources` | **RETIRED** (empty) |
| `textbook_pages` | **RETIRED** (empty) |
| `generated_exercise_candidates` | **RETIRED** (empty) |

### 3.6 Sessions + progress

| Table | Status |
|---|---|
| `learning_sessions` | survives. Session_type values cleaned post-#5; admit only `'learning'` in new CHECK |
| `lesson_progress` | **RETIRED** (Decision M) |

### 3.7 Legacy-retained

| Table | Status |
|---|---|
| `learner_item_state` | **RETIRED** (Decision L) |
| `learner_skill_state` | **RETIRED** (Decision L) |
| `review_events` | **RETIRED** (Decision L) |
| `leaderboard` view | **REWRITTEN** to use capability state (Decision L) |

### 3.8 Infrastructure

| Table | Status |
|---|---|
| `profiles` | survives unchanged |
| `user_roles` | survives unchanged |
| `exercise_type_availability` | survives — audit for missing rows (10/12 exercise types present) |
| `error_logs` | survives unchanged |

---

## §4. Concept → target-table map

For every today-concept observed in §6 of the evidence doc, the target home:

| Concept | Today | Target |
|---|---|---|
| Vocabulary base form (e.g. "rumah") | `learning_items.base_text` + denormalised in `content_units.payload_json.baseText` + denormalised in `capability_artifacts(kind=base_text).artifact_json.value` | `learning_items.base_text` (single source) |
| Vocabulary translation | `item_meanings.translation_text` + denormalised in `content_units.payload_json.translationNl/En` + denormalised in `capability_artifacts(kind=meaning:l1).artifact_json.value` | `item_meanings.translation_text` (single source) |
| Accepted answer (l1 + id) | `item_answer_variants.variant_text` + denormalised in `capability_artifacts(kind=accepted_answers:*).artifact_json.values` | `item_answer_variants.variant_text` (single source) |
| Audio for an item | `audio_clips` row + denormalised in `capability_artifacts(kind=audio_clip).artifact_json` | `audio_clips` (single source); FK from capability via `capability_audio_refs` (new) |
| Grammar pattern explanation | `grammar_patterns.short_explanation` + denormalised in `capability_artifacts(kind=pattern_explanation:l1)` + denormalised in `content_units.payload_json.description` | `grammar_patterns.short_explanation` (single source) |
| Grammar pattern example | `capability_artifacts(kind=pattern_example).artifact_json.value` only | NEW: `grammar_pattern_examples.example_text` (multiple per pattern; today exactly 1) |
| Dialogue cloze (line text + blank + answer + translation) | 3 `capability_artifacts` rows (cloze_context, cloze_answer, translation:l1) + the line in `lesson_sections.content.lines[]` | 1 row in NEW `dialogue_clozes` (FK to `lesson_dialogue_lines`) |
| Morphology pair (root, derived, allomorph rule) | 2 `capability_artifacts` rows (root_derived_pair, allomorph_rule) | 1 row in NEW `affixed_form_pairs` |
| Grammar exercise (contrast pair, etc.) | `exercise_variants` row | 1 row in the corresponding typed table |
| Lesson reading section (paragraphs) | `lesson_sections.content` (with type='text') AND `lesson_page_blocks.payload_json` (with kind='reading_section') | `lesson_section_reading` (source-of-truth) AND `lesson_block_reading_section` (the projection) |
| Lesson dialogue line | `lesson_sections.content.lines[idx]` | `lesson_dialogue_lines` row |
| Capability scope per lesson | `learning_capabilities.lesson_id` (ADR 0006) AND `lesson_page_blocks.source_refs[]` (M:N exposure) | Same (`lesson_id` for owning lesson; `lesson_block_*.lesson_id` for exposure scope) |
| FSRS state per learner per cap | `learner_capability_state.{stability,difficulty,...}` AND `.fsrs_state_json` | `learner_capability_state` columnar fields only |
| Per-answer evidence | `capability_review_events.{answer_report_json, state_before_json, state_after_json, scheduler_snapshot_json, artifact_version_snapshot_json}` | `capability_review_events.{answer_report, state_before, state_after}` |
| Lesson activation | `learner_lesson_activation` (unchanged) | same |
| Speakers + voices per lesson | `lessons.dialogue_voices` JSON map | NEW: `lesson_speakers` |

---

## §5. End-to-end query examples (the runtime data flow)

These show the target schema satisfies the same access patterns the runtime needs today.

### 5.1 Build a session — fetch due capabilities for a user

```sql
-- Same as today; no schema change for the due-list query.
select c.id, c.canonical_key, c.source_kind, c.source_ref, c.capability_type,
       c.lesson_id, lcs.stability, lcs.review_count, lcs.next_due_at
from indonesian.learner_capability_state lcs
join indonesian.learning_capabilities c on c.id = lcs.capability_id
where lcs.user_id = $1
  and lcs.activation_state = 'active'
  and lcs.next_due_at <= now()
  and c.readiness_status = 'ready'
  and c.publication_status = 'published';
```

### 5.2 Resolve an `item:text_recognition` block

```sql
-- Today: 2 queries (learning_items by slug + capability_artifacts).
-- Target: 1 query, JOIN to upstream tables.
select li.base_text, im.translation_text
from indonesian.learning_capabilities c
join indonesian.learning_items li
  on li.normalized_text = split_part(c.source_ref, '/', 2)
left join indonesian.item_meanings im
  on im.learning_item_id = li.id
 and im.translation_language = $user_language
 and im.is_primary
where c.id = $block_capability_id;
```

For `accepted_answers:id`:

```sql
select variant_text
from indonesian.item_answer_variants
where learning_item_id = $item_id
  and language = 'id'
  and is_accepted;
```

### 5.3 Resolve a `dialogue_line:contextual_cloze` block

```sql
-- Today: 3 capability_artifacts rows.
-- Target: 1 dialogue_clozes row.
select dc.sentence_with_blank, dc.answer_text, dc.translation_text,
       dl.speaker
from indonesian.learning_capabilities c
join indonesian.dialogue_clozes dc on dc.capability_id = c.id
join indonesian.lesson_dialogue_lines dl on dl.id = dc.dialogue_line_id
where c.id = $block_capability_id;
```

### 5.4 Resolve a `pattern:pattern_contrast` block

```sql
-- Today: orphan — no path.
-- Target: route via the contrast_pair_exercises table.
select e.prompt_text, e.target_meaning, e.options, e.correct_option_id, e.explanation_text
from indonesian.learning_capabilities c
join indonesian.contrast_pair_exercises e on e.grammar_pattern_id = c.source_ref_to_grammar_pattern  -- via source_ref decoding
where c.id = $block_capability_id;
```

(The `source_ref` decoding is done client-side as today via `canonicalKey.ts`. Alternative: add `grammar_pattern_id` column on `learning_capabilities` for pattern-source caps to skip the decode.)

### 5.5 Build a lesson reader experience

```sql
-- Today: lesson_page_blocks with payload_json blob + fuzzy extraction.
-- Target: typed JOIN per block_kind, ordered by display_order.

-- Step 1: header rows
select lb.id, lb.block_kind, lb.display_order
from indonesian.lesson_blocks lb
where lb.lesson_id = $lesson_id
order by lb.display_order;

-- Step 2: load typed satellite per kind. Each satellite query is typed and ~5 columns.
-- The runtime loops the header rows + dispatches by block_kind to the satellite query.
select * from indonesian.lesson_block_reading_section where block_id in (...);
select * from indonesian.lesson_block_vocab_strip where block_id in (...);
-- ... etc per kind ...
```

### 5.6 Health check: every L9 capability has its required satellites

```sql
-- Today: scattered per-artifact-kind checks.
-- Target: simple satellite-existence test per source_kind.

-- Item capabilities → upstream must be active + have a primary meaning
select c.canonical_key, 'missing_meaning' as issue
from indonesian.learning_capabilities c
join indonesian.learning_items li on li.normalized_text = split_part(c.source_ref, '/', 2)
left join indonesian.item_meanings im
  on im.learning_item_id = li.id
 and im.translation_language = 'nl'
 and im.is_primary
where c.lesson_id = $L9
  and c.source_kind = 'item'
  and im.id is null;

-- Dialogue_line capabilities → dialogue_clozes row must exist
select c.canonical_key, 'missing_dialogue_cloze' as issue
from indonesian.learning_capabilities c
left join indonesian.dialogue_clozes dc on dc.capability_id = c.id
where c.lesson_id = $L9
  and c.source_kind = 'dialogue_line'
  and dc.id is null;
```

Much simpler than the current model where readiness depends on a per-artifact-kind walk over `capability_artifacts`.

---

## §6. Cost-shape comparison

A summary count of complexity reduction. Rough numbers; the migration doc has actual diffs.

| Metric | Current | Target | Δ |
|---|---:|---:|---:|
| Tables in `indonesian` schema | 35 | ~30 base + ~14 satellites (slim) = 44 | +9 (but slim tables) |
| JSON/JSONB columns (cumulative) | 16 (across 9 tables) | 5 (small bounded shapes only) | −11 |
| Shape-variable JSON columns (HIGH risk) | 4 (`lesson_page_blocks.payload_json`, `lesson_sections.content`, `exercise_variants.payload_json`+`answer_key_json`) | 0 | −4 |
| Empty tables | 6 | 0 | −6 |
| Legacy-retained dead tables | 3 + 1 view | 0 (view rewritten) | −3 |
| FK chains | partial (cascades added recently) | uniform | n/a |
| Dead columns (always-null / always-empty / always-same) | ~12 (lessons.transcript_*, lessons.duration_seconds, metadata_json.{goalTags,requiredSourceProgress}, etc.) | 0 | −12 |
| Lesson_id present on content tables | 4 (capabilities + exercise_variants + content_unit/junction + page_blocks via source_ref) | every content table | uniform |
| Tables consumed by runtime | ~12 | ~20 (more satellites) but **each query is typed + small** | better |
| Distinct artifact_kind values to track | 12 in DB + 10 declared | 0 (kind dispatch moves to per-table queries) | clear |

**Net:** more tables, each smaller and typed; dramatically less JSON shape-divergence risk; uniform `lesson_id` query story.

---

## §7. RLS and grants

The split tables follow the existing patterns:

- **Public content** (capabilities, lessons, lesson sections + satellites, lesson blocks + satellites, grammar tables, items, meanings, audio_clips, content_units): `authenticated` GRANT `SELECT`; RLS policy `for select to authenticated using (true)`.
- **Learner state** (`learner_capability_state`, `learner_lesson_activation`): owner-only SELECT.
- **Learner writes** (`capability_review_events`, `learning_sessions`): owner-only SELECT, write path is the RPC only (`REVOKE INSERT, UPDATE, DELETE FROM authenticated` per existing pattern).
- **Diagnostic** (`capability_resolution_failure_events`): owner-INSERT, admin-only SELECT (existing policy).
- **Admin** (`content_flags`, `exercise_review_comments`): owner-INSERT (their own flags), admin SELECT/UPDATE.

Per CLAUDE.md "Feature Design Rule: Supabase Requirements," every new table needs an explicit grants + RLS section.

---

## §8. Open questions for design review

These are concrete decisions the user should weigh in on before the migration plan is finalised:

1. **Should the `pattern` source kind's runtime routing land in this migration, or be deferred?** Decision G ties the schema split to the routing fix. Splitting `exercise_variants` without the routing leaves the new tables also dead. Alternative: include the routing change in the same migration step.

2. **Should `cloze_mcq` accept dialogue_line source kinds in the new schema?** Today, `cloze_mcq` is item-only (`renderContracts.ts:100`). The 7 dialogue_line caps render via typed `cloze`, not MCQ. The new `cloze_mcq_exercises` table could accept either source kind; the lesson-anchored distractor pool (today via `item_contexts.source_lesson_id`) needs a target-schema equivalent if we widen.

3. **`lessons.duration_seconds` and `lessons.transcript_*` — drop or keep as nullable?** Investigation finds them always-NULL. The transcripts could be populated by future work; the duration is computed at audio-upload time but never written. Recommend: drop, restore when needed.

4. **`item_contexts` audit — drop `vocabulary_list` and `lesson_snippet` context_types?** 515 + 60 rows; the runtime might still reference them. Audit before dropping.

5. **`learner_lesson_activation.activated_at` — is the timestamp ever read?** Today nothing reads it (only the row's existence matters). Could become a boolean.

6. **`capability_aliases`, `item_context_grammar_patterns` etc. — drop in this migration or defer?** They are empty; drop is risk-free but conservative is to defer to a cleanup PR.

7. **Should the new `lesson_block_dialogue_card` reference the parent dialogue section directly (FK to `lesson_section_dialogue.section_id`) or just carry `source_section_ref`?** FK is structurally tighter; text ref decouples lesson_blocks from lesson_sections (allowing different lesson presentations to mix-and-match). Recommendation: FK.

8. **Pipeline writes more rows per publish; is that a write-latency concern?** A lesson publish today writes ~30 lesson_page_blocks + ~500 capability_artifacts. Target: ~30 lesson_block_* satellite rows + ~10 dialogue_clozes + ~few affixed_form_pairs + reduced JSON. Same order of magnitude; the change is per-row size, not row count.

9. **`learning_capabilities.canonical_key` retention.** Today encodes (source_kind, source_ref, capability_type, direction, modality, learner_language). The decoder lives in `adapter.ts:68-90`. Keep as-is — it's the FSRS key contract, must not change (target-architecture.md "constraints to honour").

10. **`learning_capabilities.projection_version` (currently `capability-v3`).** **Do NOT bump.** Per the migration plan §14.4 — the canonical_key contract is unchanged; only support-table shapes change. Bumping would force every `learner_capability_state.canonical_key_snapshot` to be re-reconciled against v4 caps, with no benefit. The schema cutover is signalled by the table-shape change itself.

---

## §9. What this doc does NOT cover

- **Migration sequencing.** See `2026-05-21-data-model-migration.md`.
- **Code paths that change.** Touched briefly per decision (e.g. "`renderContracts.ts` updates") but the full code edit list lives in the migration doc.
- **Performance impact.** Each query in §5 is simpler than today's equivalent; rigorous timing is migration-doc work.
- **Authoring-pipeline shape changes.** The staging files (`scripts/data/staging/lesson-N/*.ts`) need to evolve to write the new typed satellites. Authoring shape is downstream of this proposal; the migration doc maps it.

---

**End of target proposal.** Architect review needed before promotion to `approved`.
