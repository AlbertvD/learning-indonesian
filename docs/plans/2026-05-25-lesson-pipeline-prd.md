---
status: draft
doc_type: prd
created: 2026-05-25
destined_for: GitHub issue (PRD) — AlbertvD/learning-indonesian
scope: lesson-pipeline slice (capability-stage redesign specced separately, after these tables exist)
links:
  - docs/plans/2026-05-25-lesson-pipeline-adr-0011-0012-alignment.md   # the technical spec
  - docs/adr/0011-capability-content-is-db-authoritative-after-seeding.md
  - docs/adr/0012-stage-responsibilities-and-the-no-disk-capability-stage.md
  - docs/plans/2026-05-22-data-model-migration.md   # §9 = the migration vehicle (PR 6)
---

# PRD — Lesson pipeline: a typed, bilingual capability contract

## Summary

Make the **Lesson Stage** emit a **typed, bilingual capability contract** in the database — one typed table per capability-feeding section (vocab/items, dialogue, grammar, morphology), each carrying **both Dutch and English**, plus the retained display blob. This is the lesson-side foundation for ADR 0011 (capability content DB-authoritative) + ADR 0012 (no-disk Capability Stage). **Scope is the lesson pipeline only.** The Capability Stage redesign that *reads* these tables is specced separately, once the tables exist.

**North star — why this work exists.** Two outcomes it unlocks:
1. **Every learnable thing in the course can finally become a schedulable capability** — items, dialogue, grammar, morphology, numbers — instead of today's partial, inconsistently-wired set.
2. **The app becomes truly suitable for English learners** — bilingual (NL + EN) across all learner-facing content, not Dutch-with-vocab-only-English.

This slice creates the **possibility** for both by laying the typed, bilingual foundation; the Capability Stage rebuild **realises** them by generating and rendering the capabilities off these tables. Measuring this slice against "EN works" or "all caps are live" would be measuring the rebuild's bar, not this one's (see Success criteria).

## Background

The content pipeline is half file-based, half DB-based, and was wired inconsistently from the start. Verified against the live DB + code:

- The Capability Stage reads lesson content **and** capability-authoring **from disk** (`capability-stage/loader.ts:132-141`) and writes enrichments back to disk — the dual-read ADR 0012 forbids.
- It **blind-upserts / delete-reinserts** capability rows (`capability-stage/adapter.ts:70,125,231,…`), so an admin's in-app correction is destroyed on the next re-publish — the exact conflict ADR 0011 resolves.
- **English is effectively absent.** EN translations exist only for vocab items; dialogue (`lesson_dialogue_lines.translation`) and grammar (`grammar_patterns.short_explanation`) are single Dutch columns, and **zero `en` capabilities are projected** (3,244 item-`nl`, 0 `en`). An English-set learner is unserved.
- The drill set is **wrong**: whole dialogue lines and composed numbers (e.g. `dua puluh satu`) are harvested as vocabulary flashcards — meaningless to drill — while genuine phrases and the grammar/number-formation skills are under-served.

## Goals

1. The Lesson Stage writes a **typed table per capability-feeding section**, so the (future) Capability Stage reads structured rows — no prose interpretation, no disk reads.
2. **All learner-facing content is bilingual (NL + EN)** — items, dialogue, grammar — written by the Lesson Stage.
3. The **harvest rule is correct**: only memorised primitives become items (words, phrases, named numbers); whole lines and composed numbers do not.
4. The lesson content blob is **retained** as the display source; the bespoke `Page.tsx` reader is untouched.

## Non-goals

- The **Capability Stage redesign** (reading the tables, in-stage generation, seed-once/skip-if-exists adapter, the flag→agent correction loop) — separate PRD, after these tables exist.
- **Podcast** capabilities (`podcast_*`) — out of scope, 0 rows.
- The **`lesson_dialogue_lines.text → line_text`** rename — standalone PR.
- Building **display-only** typed tables (pronunciation, book exercises) — they stay in the blob.

## User impact (why this matters to the learner)

The two north-stars, made concrete — each *enabled here, realised at rebuild*:

- **A complete learnable surface.** Every item, dialogue line, grammar pattern, morphology pair, and number skill the lessons teach becomes representable as a typed, schedulable source — so the rebuilt Capability Stage can finally expose *all* of it for review, not the partial set live today.
- **A genuinely bilingual app.** NL + EN land across items, dialogue, and grammar (today EN exists only on vocab items; 0 `en` capabilities are projected). An English learner becomes a first-class user once the capability side renders EN.

Supporting quality wins that come with the typed foundation: the drill set becomes correct (no whole-sentence or giant-number flashcards; real phrases like `apa kabar?` kept; grammar/morphology/numbers drilled as designed), and admin corrections become possible to preserve (ADR 0011) rather than clobbered on re-publish.

## Requirements

Technical detail in the alignment spec (`docs/plans/2026-05-25-lesson-pipeline-adr-0011-0012-alignment.md`). Summary:

**R1 — Typed tables for capability-feeding sections.** `lesson_section_item_rows` (item), `lesson_section_grammar_categories` + `grammar_topics` (pattern), `lesson_section_affixed_pairs` (morphology, new). `lesson_dialogue_lines` already exists.

**R2 — Discriminator + identity.** Add `section_kind` + `source_section_ref` to `lesson_sections`; retain the `content` blob.

**R3 — Bilingual.** Item rows carry `l1_translation` + `l2_translation`; add `translation_nl`/`translation_en` to `lesson_dialogue_lines` + `dialogue_clozes`; add EN to the grammar explanation. **Relocate + widen** the EN/NL enricher out of the Capability Stage into the Lesson Stage (items + dialogue + grammar).

**R4 — Harvest rule (memorised primitives).** Items = words + short phrases + named numbers (0–20 + place-value landmarks); never whole dialogue lines or composed numbers. Composed numbers are the drilled `belas-numbers` `pattern`, not items. Numbers are vocab.

**R5 — Morphology as authored pairs.** `lesson_section_affixed_pairs` holds `root_text`/`derived_text`/`affix`/`allomorph_rule` (the DB form of `morphology-patterns.ts`), not derived from items.

**R6 — Writer + validator.** `lesson-stage/runner.ts` writes the typed tables; `lesson-stage/validators/sectionShape.ts` enforces per-row required fields (CRITICAL on miss).

**R7 — No reader regression.** The bespoke `Page.tsx`, coverage, and grammar-topic chips keep reading the retained blob; nothing learner-facing regresses. The typed tables are write-only until the Capability Stage redesign consumes them.

## Success criteria

- Every capability-feeding section in all 9 lessons has its typed rows populated (G4).
- `l2_translation` (and dialogue/grammar EN) non-null for all rows — EN coverage = 100%.
- Zero over-harvested items: no whole-line/`dialogue_chunk` items, no composed-number items.
- No-orphan checks green; `make pre-deploy` green.
- Visual smoke: all 9 lessons render unchanged (blob-driven).

## Scope / deliverables

Lands as **migration PR 6** (`docs/plans/2026-05-22-data-model-migration.md` §9) + the enricher relocation. Additive DDL → re-publish all 9 lessons → typed rows populated. Write-only at merge.

## Open questions (not blockers)

- The `en`-capability projection model (project `en` caps vs. resolve language from item columns at render) — a **capability-stage** decision; this PRD only guarantees the EN *data* exists.
- The number-formation pattern's exact typed source table.
- `content-pipeline.md` is stale (names `lesson_page_blocks`, `item_meanings`, legacy 1–3) — refresh as a side task.

## Supabase Requirements

### Schema changes
- New typed tables: `lesson_section_grammar_categories`, `lesson_section_grammar_topics`, `lesson_section_affixed_pairs` (DDL per `2026-05-21-data-model-target.md` Decision D). New columns: `lesson_sections.section_kind` + `source_section_ref`; `lesson_dialogue_lines.translation_nl/en`; `dialogue_clozes.translation_nl/en`; EN on the grammar explanation. All additive (`scripts/migration.sql`).
- RLS/grants: `GRANT SELECT TO authenticated`; `REVOKE INSERT/UPDATE/DELETE FROM authenticated`; `GRANT ALL TO service_role` (mirrors the existing typed-satellite pattern). FK indexes on `section_id`/`lesson_id`; per-discriminator CHECK on `section_kind`.

### homelab-configs changes
- [ ] PostgREST: N/A — no new schema (all in `indonesian`).
- [ ] Kong: N/A.
- [ ] GoTrue: N/A.
- [ ] Storage: N/A.

### Health check additions
- `scripts/check-supabase-deep.ts`: no-orphan check per new typed table; EN-coverage count (`translation_en`/grammar-EN non-null).
