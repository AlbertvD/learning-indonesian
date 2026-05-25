---
status: implementing
implementation: PR 6 (branch pr-6-typed-lesson-sections) — lesson-side typed capability contract; the capability-side reader (#98/#99) remains separate
doc_type: lesson-pipeline-alignment-spec
created: 2026-05-25
depends_on:
  - docs/adr/0011-capability-content-is-db-authoritative-after-seeding.md
  - docs/adr/0012-stage-responsibilities-and-the-no-disk-capability-stage.md
  - docs/plans/2026-05-22-data-model-migration.md   # §9 (PR 6) is the migration vehicle
  - docs/plans/2026-05-21-data-model-target.md       # Decision D (the typed satellites)
grounded_against:
  - CONTEXT.md → Lesson Stage, Capability Stage, Stage Contract, Learning Item, Capability Type
  - scripts/lib/pipeline/lesson-stage/runner.ts
  - scripts/lib/pipeline/capability-stage/{runner,loader,adapter}.ts
  - docs/process/content-pipeline.md
---

# Lesson pipeline — alignment to ADR 0011 + 0012

**Role.** This spec defines exactly what the **Lesson Stage** must produce so that, under ADR 0011 (capability content DB-authoritative after seeding) + ADR 0012 (the Lesson Stage owns ingestion + learner-facing content; the Capability Stage reads only the DB, never disk), the **Capability Stage can generate every non-podcast capability by reading structured DB rows — no prose interpretation, no disk reads.** It is the lesson-side half of the contract; the capability-side reader is the redesign (#98/#99), out of scope here.

**What this is not.** Not the capability-stage redesign, not a migration sequence (that's migration plan §9 / PR 6), not a schema reference (DDL lives in `2026-05-21-data-model-target.md` Decision D).

**Grounding result.** The target architecture folds these stages as deep modules (`Lesson Stage` / `Capability Stage` in CONTEXT.md); no `src/lib/<module>` is touched (this is `scripts/lib/pipeline/`). The as-is was read directly: Stage A already writes `lesson_dialogue_lines` + does dialogue/grammar-topic enrichment lesson-side (`lesson-stage/runner.ts:15-21,105-125`); Stage B reads lesson content + capability authoring from disk (`capability-stage/loader.ts:132-141`), enriches POS/level/EN + writes back to staging (`capability-stage/runner.ts:167-226`), and blind-upserts/delete-reinserts capability tables (`capability-stage/adapter.ts:70,125,231,264,350/357,406/413,450,536,558/566`). Those are the behaviours this spec realigns.

---

## §1. The principle (ADR 0011 + 0012)

Two regimes, do not conflate (ADR 0011):
- **Lesson content** stays *pipeline-is-writer / staging-canonical*: the Lesson Stage reads `scripts/data/staging/lesson-N/*` and writes the DB. Unchanged.
- **Capability content** is *DB-authoritative after seeding*: the Capability Stage reads lesson content **from the DB only** (no disk), generates capabilities, seeds them once, additive-only on re-run, corrections live in the DB.

The dividing line (ADR 0012): **what the learner reads → Lesson Stage; what feeds generation/scheduling → Capability Stage.**

**Corollary that drives this whole spec:** the Capability Stage's *input* is DB tables the Lesson Stage wrote. To keep the Capability Stage interpreter-free, **every section that feeds a capability gets a typed lesson-side table** carrying structured rows — not a JSON blob the Capability Stage would have to parse.

---

## §2. Section classification

| Lesson section | Storage | Feeds capability | Drilled |
|---|---|---|---|
| vocab / expressions / **named numbers** | **typed** `lesson_section_item_rows` | `item` | ✓ |
| dialogue lines | **typed** `lesson_dialogue_lines` (exists, PR 2) | `dialogue_line` | ✓ |
| grammar (categories, rules, examples, topics) | **typed** `lesson_section_grammar_categories` + `grammar_topics` | `pattern` | ✓ |
| morphology (root→derived pairs) | **typed** `lesson_section_affixed_pairs` *(new)* | `affixed_form_pair` | ✓ |
| number-formation rule | typed (the numbers-section series) → the `belas-numbers` `pattern` | `pattern` | ✓ |
| pronunciation letters | **blob** (`content.json`) | — | display only |
| book exercises | **blob** | — | display only |
| reading / culture text | **blob** | — | display only |

The `content` JSON blob is **retained permanently** on `lesson_sections` (it is the round-trippable authored snapshot and the sole source the bespoke `Page.tsx` reader renders from, via `content.json`). The typed tables are the *capability contract*, not a render path.

---

## §3. Per-section spec

### §3.1 Items (`lesson_section_item_rows`)
- Columns: `section_id`, `lesson_id`, `display_order`, `source_item_ref` (`lesson-N/section-M/item-K`), `item_type` (`word`/`phrase`), `indonesian_text`, `l1_translation` (NL), `l2_translation` (EN).
- **Harvest rule (memorised primitives only):** a word or a *short phrase* (reusable lexical chunk — fixed expression, collocation, greeting). **Not** whole sentences or dialogue lines (those are `dialogue_line` caps; a learnable phrase *inside* a line is extracted as a phrase item). The legacy whole-line `dialogue_chunk` rows are over-harvest → dropped.
- **Numbers are vocab:** named numbers with their own lexical name — **0–20** + place-value landmarks (`seratus`, `seribu`, `sejuta`, place words `ratus`/`ribu`/`juta`/`miliar`/`triliun`) — are item rows. Composed numbers (`dua puluh satu`, `dua ratus`, `sepuluh ribu`) are **not** items (see §3.5).
- **Per-occurrence, not 1:1 with caps:** item caps key on `learning_items/<normalized_text>` (global dedup). `source_item_ref` is the lesson-side occurrence id; the Capability Stage reduces these rows by `indonesian_text → learning_items.normalized_text`. (Decision D's "source_item_ref *is* the cap source_ref" claim was wrong — corrected.)

### §3.2 Dialogue (`lesson_dialogue_lines`, exists)
- Already written by Stage A. **Add `translation_nl` + `translation_en`** (today a single Dutch `translation`). One row per line; `dialogue_clozes` likewise needs `translation_nl`/`translation_en` (today single `translation_text`).

### §3.3 Grammar (`lesson_section_grammar_categories` + `grammar_topics`)
- The Lesson Stage **structures** the book's grammar section into typed rows: per category `title`, `rules[]`, `examples` (`[{indonesian, dutch, english}]`); per section, topic-label rows. **Add EN** to the explanation (today `short_explanation` is Dutch-only).
- The Capability Stage reads these structured rows to mint `pattern` caps + generate the exercise content. "No interpreter" = no parsing of unstructured prose; exercise-content *generation* (distractors, contrast pairs) remains a capability-side step.

### §3.4 Morphology (`lesson_section_affixed_pairs`, new)
- The DB form of staging `morphology-patterns.ts`. Columns: `root_text`, `derived_text`, `affix` (`meN-`/`di-`/`ber-`…), `allomorph_rule`, FK to `lesson_sections`.
- **Why typed, not derived from items (decision 2a):** the pair carries authored linguistic analysis ("meN- becomes mem- before b"). Deriving `baca→membaca` from items would require both forms to be items, a morphological analyser to pair them, and on-the-fly authoring of the rule — i.e. exactly the interpreter the principle rejects. The pairs are editorial selections (chosen exemplars), so they're authored lesson content, like vocab.

### §3.5 Number-formation pattern
- A drilled `pattern` (`belas-numbers` already exists — **keep, do not retire**). The Lesson Stage's numbers sections enumerate the `belas`/`puluh`/`ratus` series; that series is the pattern's typed lesson-side source. Composed numbers are formed by the rule (drilled via the pattern), never harvested as individual items.

### §3.6 Display-only (blob)
- Pronunciation letters, book exercises, reading/culture paragraphs, and the bespoke fields (`examples`/`spelling`/`sentences`/`borobudur_levels`) have **no capability consumer**. They stay in the `content` blob and render via `content.json`. No typed tables.

---

## §4. Translations / English (the EN dimension)

Today EN exists only for items (`learning_items.translation_en`); dialogue + grammar are Dutch-only single columns, and **zero `en` capabilities are projected** (3,244 item-`nl`, 0 `en`). Per ADR 0012 the Lesson Stage owns **NL + EN for all learner-facing content**:
- Item rows: `l1_translation` + `l2_translation`.
- Dialogue: `lesson_dialogue_lines.translation_nl/en` + `dialogue_clozes.translation_nl/en`.
- Grammar: NL + EN explanation/examples.
- **Relocate + widen the EN/NL enricher** out of `capability-stage/enrichEnTranslations.ts` into a lesson-stage enricher covering items + dialogue + grammar. The Capability Stage stops generating translations; `learning_items.translation_*` becomes a *derived dedup copy* it lifts from the lesson-side rows (Rule #6: one canonical source).
- (Whether the capability layer then projects `en` caps, or resolves language from the item columns at render, is a **capability-stage** decision — out of scope here, but flagged: the data to support EN must exist on the lesson side first, which is this spec's job.)

---

## §5. The seam (what crosses Lesson → Capability)

DB-only, one direction. The Lesson Stage writes; the Capability Stage reads **only** these:

`lessons` · `lesson_sections` (`section_kind`, `source_section_ref`, + retained `content` blob) · `lesson_section_item_rows` · `lesson_dialogue_lines` · `lesson_section_grammar_categories` + `grammar_topics` · `lesson_section_affixed_pairs` · `audio_clips` + `lesson_speakers`.

No staging file crosses the boundary. The capability-side staging files (`learning-items.ts`, `grammar-patterns.ts`, `morphology-patterns.ts`, `candidates.ts`, `cloze-contexts.ts`, derived `content-units`/`capabilities`/`exercise-assets`) cease to be a re-published source: `learning-items.ts` etc. become Lesson-Stage *inputs* projected into the seam tables; capability-side generation (exercises, distractors, cloze, interpreted patterns) happens in-stage and seeds the DB.

---

## §6. Lesson-Stage change-set (determined)

1. **Add typed tables** for every capability-feeding section: `lesson_section_item_rows`, `lesson_section_grammar_categories` + `grammar_topics`, `lesson_section_affixed_pairs` (`lesson_dialogue_lines` exists).
2. **Add `section_kind` + `source_section_ref`** to `lesson_sections`; retain the `content` blob.
3. **Add NL+EN** to dialogue (`lesson_dialogue_lines`, `dialogue_clozes`) and grammar; **relocate + widen** the EN/NL enricher into the Lesson Stage.
4. **Writer** (`lesson-stage/runner.ts`): write one typed table per capability-feeding section, applying the §3 harvest/structuring rules.
5. **Validator** (`lesson-stage/validators/sectionShape.ts`): per-row required-field gates (item: refs + 3 texts; grammar: title + rules; affixed: root/derived/rule). CRITICAL on miss.
6. **Lesson-Stage regime unchanged:** still reads `lesson.ts` staging → writes DB; its own staging writeback stays (lesson content is staging-canonical).

---

## §7. Out of scope (downstream / separate)

- **Capability-Stage redesign (#98/#99):** the reader side — stop reading staging from disk, read the seam tables, generate in-stage, seed idempotently, adapter → skip-if-exists. This spec is its fixed target.
- **`lesson_dialogue_lines.text → line_text` rename** — standalone PR.
- **`en`-capability projection model** — capability-stage decision (§4).
- **Retire `belas-numbers`?** — no; kept as the drilled number-formation pattern.
- **Display-only typed tables** (`lesson_section_pronunciation_letters`, `_exercise_groups`) — intentionally not built.

---

## §8. Supabase Requirements

### Schema changes
- New typed tables: `lesson_section_grammar_categories`, `lesson_section_grammar_topics`, `lesson_section_affixed_pairs` (DDL per `2026-05-21-data-model-target.md` Decision D). New columns: `lesson_sections.section_kind` + `source_section_ref`; `lesson_section_item_rows` already specced; `lesson_dialogue_lines.translation_nl/en` + `dialogue_clozes.translation_nl/en`; EN on the grammar explanation. All additive (`migration.sql`).
- RLS/grants: `GRANT SELECT TO authenticated`; `REVOKE INSERT/UPDATE/DELETE FROM authenticated`; `GRANT ALL TO service_role` — mirrors the existing typed-satellite pattern.
- FK indexes on every `section_id` / `lesson_id` column; per-discriminator CHECK on `section_kind`.

### homelab-configs changes
- [ ] PostgREST: N/A — no new schema, all in `indonesian`.
- [ ] Kong: N/A.
- [ ] GoTrue: N/A.
- [ ] Storage: N/A.

### Health check additions
- `check-supabase-deep.ts`: no-orphan check per new typed table (every capability-feeding section row reachable; every `pattern`/`affixed_form_pair` cap has its lesson-side source once the capability redesign lands).
```
