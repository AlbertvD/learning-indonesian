# Learning Indonesian Domain Context

This context defines the domain language for the capability-based learning architecture. Use these terms consistently in code, docs, tests, and reviews.

## Content Source

A source of learning material, such as a textbook lesson, dialogue line, podcast segment, story, grammar pattern, or morphology pattern. A content source is provenance and sequencing context; it is not itself the thing scheduled by FSRS.

## Content Unit

A stable, publishable unit derived from a content source. Content units preserve source refs, section refs, ordering, and relationships to lesson page blocks and learning capabilities.

## Learning Item

A single atomic piece of **lexical** content to be learned — one word, phrase, or dialogue chunk (e.g. `hati` = liver). Learning items are stored globally and deduplicated by `normalized_text` (one row per unique item across the whole course, 758 rows today); a lesson links to an item through the capabilities the item produces, not through the item row itself (the table has no `lesson_id`). A learning item is *content*, not a skill — it is never itself scheduled.

**A learning item is only one *kind* of Content Source — the lexical kind.** It is not the universal store of "things to be learned": grammar patterns live in `grammar_patterns`, morphology pairs in `affixed_form_pairs`, dialogue lines in `lesson_dialogue_lines` — each its own typed table (ADR 0009). A capability reaches whichever source it belongs to through `source_kind` + `source_ref`, so the thing learned in a capability is frequently *not* a learning item. (The `learning_items` table is really the lexical-item store; the name overreaches.)

## Capability Type

One of the 12 *kinds* of skill facet through which a content source can be practised, fixed in code (`src/lib/capabilities/capabilityTypes.ts`): `text_recognition`, `meaning_recall`, `form_recall`, `l1_to_id_choice`, `audio_recognition`, `dictation` (vocabulary items); `pattern_recognition`, `pattern_contrast` (grammar patterns); `contextual_cloze` (dialogue lines); `root_derived_recognition`, `root_derived_recall` (morphology); `podcast_gist` (podcasts). A capability type is the *how* of knowing, not a thing in itself.

## Learning Capability

A concrete memory trace: **one content source (e.g. a learning item) combined with one capability type** — e.g. item `hati` × type `form_recall` = "recall the written form of *hati*". This pair is the atomic unit FSRS schedules and that a review event is recorded against. One vocabulary item produces several capabilities — one per capability type that applies to it (~6 for a typical word). The capability, not the item, is what is practiced, reviewed, and scheduled.

## Capability Contract

The fail-closed readiness contract for a learning capability. It defines required typed artifacts, allowed exercise families, readiness status, publication status, and why a capability is ready, blocked, exposure-only, deprecated, or unknown.

## Typed Artifact

A named piece of approved content required by a capability or exercise, such as `meaning:l1`, `accepted_answers:id`, `base_text`, `audio_clip`, `cloze_context`, `pattern_example`, `transcript_segment`, or `root_derived_pair`.

## Capability Readiness

The scheduling/rendering readiness state of a capability. Valid states are `ready`, `blocked`, `exposure_only`, `deprecated`, and `unknown`. Only ready and published capabilities can become active learner review targets.

## Learner Activation State

The learner-specific state describing whether a capability is dormant, active, suspended, or retired for that learner. FSRS schedules active learner capabilities only.

There are two distinct tables, and they must not be conflated. **`learning_capabilities`** is the shared *catalog* — every capability that exists, content-level (`readiness_status`, `publication_status`), no learner and no FSRS timing on it. **`learner_capability_state`** is the *per-learner schedule* — `activation_state` plus the FSRS fields (`stability`, `difficulty`, `next_due_at`). A catalog capability is only content until a learner **activates** it (first introduction mints an `active` `learner_capability_state` row, dormant → active); only then is it FSRS-eligible for that learner. A session draws (due active) ∪ (eligible new) from the per-learner state, scoped to the learner's activated lessons (`learner_lesson_activation`) — never the whole catalog.

## Lesson Page Block

A web-native lesson rendering block with stable identity, source refs, optional content unit refs, and optional capability refs. Lesson page blocks make book-derived lessons feel modern without directly activating FSRS review.

## Review Processor

The write owner for capability review commits. It validates answer reports, computes or validates outcomes, commits review events and FSRS state atomically/idempotently, and performs first-review activation of eligible dormant capabilities.

## Exercise Resolver

The module that maps a ready capability plus approved artifacts to an exercise render plan or an explicit typed failure. It prevents sessions from silently falling back to unrelated legacy exercises.

## Session Composer

The module that composes a learning session from due active capabilities, Pedagogy Planner recommendations, and Exercise Resolver results. It is composition-only and does not write activation, FSRS, or review state.

## Lesson Experience Module

The module that renders lesson page blocks and bridges to practice. It is fully passive: it does not emit progress events and does not directly activate FSRS review. Source-progress emission was removed in retirement #6 (2026-05-07).

## Mastery Model

A read-only model that derives learner-facing mastery from capability state, review evidence, modality spread, recency, and confidence. It does not schedule content or overclaim production ability from recognition evidence.

## Lesson Stage

The deep module that ingests raw source material (e.g. HEIC page photos) and processes it — OCR, cataloguing, lesson-content assembly — until it is publishable, then writes the **lesson content** to the database. Lesson content is the material a learner reads: dialogue, vocabulary list, grammar explanations, the book's own exercises, and audio. The Lesson Stage owns everything from raw input to lesson content in the database; it produces no capabilities.

_(Target architecture. Today this work is split across separate authoring scripts — `convert-heic-to-jpg.ts`, `ocr-pages.ts`, `catalog-lesson-sections.ts`, `generate-staging-files.ts` — plus the `lesson-stage` publish step.)_

## Capability Stage

The deep module that reads lesson content **from the database**, enriches it, and creates all the learning capabilities the lesson requires — including the generated practice content (exercises, distractors, cloze contexts) and the interpreted grammar/morphology patterns — then publishes the capabilities to the database. It is a **generator/seeder, not a continuous projector** (ADR 0011): it seeds each capability once, re-runs are idempotent and additive-only (skip-if-exists), and a routine re-publish never overwrites a seeded capability — corrections live in the DB (see Capability Review). `--regenerate <unit>` is the explicit, destructive opt-out.

_(Target architecture. Today this is split across the linguist authoring agents — structurer, exercise/cloze/vocab creators, reviewer — plus the `capability-stage` publish step.)_

## Capability Review

Editorial review and correction of published capabilities happens **post-publish**, via a flag-and-agent loop — not by direct human editing, and not as a pipeline-run gate:

1. A reviewer flags a capability in the app UI by leaving a comment (today: `exercise_review_comments`, keyed to `exercise_variant_id`, with a `status`).
2. Agents read the flagged comments and apply the correction by **updating the capability's rows in the database**.

Corrected content therefore lives in the database, not in any staging file. This is the reason capability content is **DB-authoritative after seeding** (ADR 0011): a routine re-publish must not clobber these DB-resident corrections, so it is idempotent/additive-only and never overwrites a seeded capability. _(Today the flag channel covers exercises only; the model generalises it to any capability.)_

## Stage Contract

The interface between the Lesson Stage and the Capability Stage is **purely database tables**. The Capability Stage reads only from the lesson-content tables the Lesson Stage wrote; no staging file crosses the boundary. The database is the single hand-off point. This forbids the current dual-read, where the Capability Stage reaches back to disk staging files (`learning-items.ts`, `grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts`) for its source material.

This is the operational consequence of **ADR 0011** (capability content is DB-authoritative after seeding): because the Capability Stage seeds capabilities once and corrections then live in the DB, its *input* must also be the DB — a staging-file re-read would reintroduce a source that drifts from the corrected DB state. The typed lesson-content tables the Lesson Stage emits (`lesson_dialogue_lines` today; the `lesson_sections` typed satellites of migration PRs 5–6) **are** that contract. Note the asymmetry: lesson content remains pipeline-is-writer / staging-canonical; only the capability side is DB-authoritative.

The `lesson_sections.content` JSON blob is **retained** alongside the typed tables (not dropped) — it is the complete authored snapshot of a section; the typed columns + child tables are its projection. Readers (the lesson page, the capability-stage contract) use the typed tables; the blob stays next to them as the round-trippable record.

## Pipelines are per content origin

The Lesson Stage and Capability Stage above describe the **textbook-lesson** pipeline (HEIC pages → lesson content → capabilities). They are not universal. Each content origin gets its **own separate pipeline**:

- **Textbook lessons** — HEIC pages → lesson content → capabilities (the Lesson Stage / Capability Stage above).
- **Podcasts** — NotebookLM audio → podcast content → podcast capabilities. A podcast is consumed by *listening*, and its `podcast_gist` capability derives from the podcast itself, not from any textbook lesson — so it is built as a parallel pipeline, not forced through the textbook stages. (See `scripts/lib/pipeline/podcast-stage/`, the intended separate podcast deep module; today podcasts exist only as staging files, 0 DB rows.)

The "consumed vs scheduled" split (Lesson-side = what's read/listened to; Capability-side = what FSRS schedules) holds *within* each pipeline. What is **not** shared is ingestion, content, and capability generation — those are per-origin.

What **is** shared, across all pipelines, is the destination and everything downstream of it: the `learning_capabilities` store (every pipeline writes into the one table, tagged by `source_kind`) and the entire **runtime** — session building, FSRS scheduling, review commits, exercise rendering — which is `source_kind`-agnostic and mixes capabilities of every origin in one session. A pipeline is independent right up to the moment it writes a capability row; from the capability table onward, everything is uniform. Separation stops at the shared capability table.
