# ADR 0009: Typed-Table-Per-Content-Concept Is The Storage Pattern

## Status

Proposed (2026-05-21). Pending architect review of `docs/plans/2026-05-21-data-model-target.md`.

## Context

Multiple tables in the `indonesian` schema today store shape-variable content as a JSONB column with a discriminator. The investigation (`docs/plans/2026-05-21-data-model-investigation.md` §3, §4) catalogues:

- `lesson_page_blocks.payload_json`: discriminator `block_kind`; **7 distinct shapes inside `reading_section` alone**, 5 inside `dialogue_card`.
- `lesson_sections.content`: discriminator `content->>'type'` (inside the JSON itself); 9+ shapes including a one-off 9-key `reference_table` shape.
- `exercise_variants.payload_json` + `answer_key_json`: discriminator `exercise_type`; 4 distinct shapes; `answer_key_json` is pure subset duplication of `payload_json`.
- `capability_artifacts.artifact_json`: discriminator `artifact_kind`; 12 distinct shapes (addressed in ADR 0008).
- `content_units.payload_json`: discriminator `unit_kind`; 4 shapes; all denormalisations of upstream tables.

The downstream cost of this pattern is observable in the codebase:

- The lesson reader (`src/components/lessons/blocks/LessonBlockRenderer.tsx:12-76`) uses forgiving extraction — `textFromPayload(payload)` probes 6 known key names, `itemsFromPayload(payload)` probes 9 more — and silently drops anything outside those probed sets. The 9-key `reference_table` shape, the `categories[].table[][]` 2D arrays, `tableTitle`, `footnotes`, `grammar_topics`, `setup`, `closing` are all invisible to the renderer.
- A second reader path is emerging (per-lesson bespoke `src/pages/lessons/lesson-{2,4,5,6,9}/Page.tsx` files) that casts `section.content as Shape` per shape and renders with custom components — code growing as the lesson reader retreats from handling variability.
- The pipeline-side validators (`scripts/lib/pipeline/lesson-stage/validators/`) check shape *at write time*, but the runtime has no shape validation — so any shape-emitter regression that escapes the validator surfaces only as "the renderer drops some content."

The user has stated (this session): "I want this app to be structurally and architecturally sound and easy to maintain. Deep modules with one job each, not generic blob storage with consumer-side dispatching."

`docs/target-architecture.md` Rule #6 (one source of truth per concept) and Rule #3 (one job per module) both push against generic-discriminator-with-shape-variable-JSON.

## Decision

**Whenever a JSON column's shape is keyed by a sibling discriminator column, split it into one typed table per discriminator value.** The discriminator column on the parent table identifies which satellite to JOIN; the satellite table holds the typed columns.

Concrete applications (each is a separate decision in the target proposal):

- `lesson_page_blocks` → `lesson_blocks` (slim header) + 6 typed satellites (`lesson_block_hero`, `lesson_block_reading_section`, etc.). See `docs/plans/2026-05-21-data-model-target.md` §Decision C.
- `lesson_sections` → slim header + 10 typed satellites (`lesson_section_reading`, `lesson_section_dialogue`, `lesson_dialogue_lines`, etc.). See §Decision D.
- `exercise_variants` → 4 typed tables (`contrast_pair_exercises`, `sentence_transformation_exercises`, `constrained_translation_exercises`, `cloze_mcq_exercises`). See §Decision B.
- `capability_artifacts` → typed satellites + upstream-table reads (ADR 0008).
- `content_units.payload_json` → retired (the discriminator stays on the parent for identity, but the payload is dropped — see ADR 0008's denormalisation principle).

**Exceptions where JSON survives:**

1. **Small bounded MCQ option arrays** (e.g. `contrast_pair_exercises.options jsonb`): the option set is tightly coupled to its parent exercise row, bounded to ~5 items, and consumed only by that exercise's renderer. Extracting to a junction table would add a query and a JOIN for no benefit. JSON column with a typed shape (e.g. `[{id: string, text: string}]`) is acceptable when the shape is fixed and the values are bounded.

2. **Audit-log snapshots** (e.g. `capability_review_events.state_after`): the row is a frozen point-in-time snapshot of FSRS state. Splitting into typed columns would couple the audit log to the live state schema, and frozen snapshots are exactly what a row in an audit table should be. JSON column with a typed (frozen-at-write-time) shape is acceptable.

3. **Bespoke one-off shapes** (e.g. the single `reference_table` row in `lesson_sections`): when exactly one row carries a unique shape and there's no plan to generalise, accept a documented JSONB column on the satellite (e.g. `lesson_section_reference.reference_payload jsonb`). The `reference_payload` shape becomes a documented one-off with a clear flag; if a second row needs the same shape, formalise then.

**Non-exception (must always be typed):** A JSONB column whose shape is determined by a discriminator AND whose shape varies across rows AND whose contents are read by runtime code with typed expectations — this is the bug class this ADR exists to retire.

## Consequences

- **Each typed satellite is queryable in SQL.** `SELECT title FROM lesson_block_reading_section WHERE block_id = ...` replaces "fetch the parent, JSONB-extract `payload_json->>'title'`." Indexable; type-safe; readable.
- **The renderer dispatches on the discriminator and JOINs to the satellite.** No more forgiving extraction. Anything the renderer needs is a typed column.
- **The pipeline writes typed rows.** Stage A and Stage B (capability-stage) both gain typed-write paths. Validators move from JSON-shape-checking to type-system-checking via Zod / TypeScript at the writer.
- **Schema reader code (per-lesson `Page.tsx`, coverage, grammar-topic extraction) simplifies.** Today each reader writes its own type assertion against the JSON shape. Target: each reader queries the typed satellite directly.
- **More tables in the schema.** From 35 today to ~44 after the migration (14 new satellites, 9 retired). This is a deliberate trade — preferring many small typed tables over few JSON-blob tables.
- **Pipeline writes more rows per publish.** Today a lesson publish writes ~30 `lesson_page_blocks` rows. Target: ~30 `lesson_blocks` header rows + ~30 satellite rows. Same order of magnitude. Per-row size shrinks because the payload moves to typed columns.
- **A migration is required.** The plan at `docs/plans/2026-05-21-data-model-migration.md` sequences this across 11 PRs.
- **The principle generalises forward.** Future schema additions that hit "I have a column that holds different shapes per type" trigger an automatic typed-table-per-type split, not a JSON column.

## Related

- [ADR 0001: capability-based learning core](./0001-capability-based-learning-core.md) — the abstraction this storage pattern serves.
- [ADR 0008: retire generic capability_artifacts abstraction](./0008-retire-generic-capability-artifacts-abstraction.md) — the most prominent application.
- [ADR 0010: wire grammar exercises via pattern capabilities](./0010-wire-grammar-exercises-via-pattern-capabilities.md) — depends on this storage pattern for the 4 new exercise tables.
- [Target architecture §Module conventions](../target-architecture.md) — Rule #3 (one job per module) and Rule #6 (one source of truth).
- [Data model target proposal](../plans/2026-05-21-data-model-target.md) §1.3 — the user-preference framing this ADR codifies.
