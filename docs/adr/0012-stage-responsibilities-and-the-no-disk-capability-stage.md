# ADR 0012: Stage responsibilities — the Lesson Stage owns ingestion and learner-facing content; the Capability Stage reads only the database

## Status

**Accepted (2026-05-25).** Companion to **ADR 0011**, which deferred exactly this question: *"This scopes the reversal to capabilities. The lesson-content side (Lesson Stage) is out of scope here … a separate decision"* (0011 line 32). This ADR records the responsibility split between the two stages and the Capability Stage's no-disk rule, with their rationale and trade-off. `CONTEXT.md` → Stage Contract asserts the boundary as a domain term; this ADR is the decision record behind it. It is written **before** the capability-stage redesign (epic #98/#99) so that redesign has a fixed target rather than re-deriving the contract — the failure mode that closed PR #103.

## Context

Two deep modules own the textbook-lesson content pipeline (`CONTEXT.md` → Lesson Stage, Capability Stage):

- **Lesson Stage** — raw page photos → publishable lesson content (the material a learner reads).
- **Capability Stage** — lesson content → the learning capabilities FSRS schedules.

ADR 0011 made capability content DB-authoritative after seeding, and the Stage Contract declares the hand-off to be **purely database tables**. But neither records *which work runs in which stage*, and the live code blurs the line two ways:

1. **The Capability Stage reads staging files off disk** (`learning-items.ts`, `grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts`) — the dual-read the Stage Contract forbids.
2. **Its enrichment mixes two different kinds of work.** It produces *learner-facing* content (NL + EN translations, dialogue-NL propagation — `CLAUDE.md` § Derived staging files) alongside *practice-generation* metadata (POS, level). These have different rightful owners but live in one stage today.

Without a recorded boundary, every migration PR re-litigates "does this belong in the Lesson Stage or the Capability Stage?", and a wrong guess bakes a broken contract into the foundation the redesign builds on.

## Decision

The dividing line is **what the learner reads vs. what is needed to generate or schedule practice.**

**Lesson Stage** owns the entire chain from raw input to learner-facing lesson content, and writes that content to the database:

- Ingestion + processing: HEIC → JPEG conversion, OCR, validation/check, lesson-content assembly.
- **All learner-facing enrichment, including NL and EN translations** — item meanings and dialogue-line translations. English meanings are lesson material the learner reads (not present in the Dutch book), so the Lesson Stage generates them. This relocates the EN/NL enrichers out of the Capability Stage (migration plan §9.1).
- Output: the typed lesson-content tables (`lesson_sections` + `lesson_section_item_rows` + `lesson_dialogue_lines` …) plus the retained `content` snapshot.

**Capability Stage** reads lesson content **only from the database — never from disk** — and generates everything capability-side from it:

- Deduped `learning_items` (global by `normalized_text`), POS, level, and other practice-generation metadata.
- Capabilities, exercises, distractors, cloze contexts, and interpreted grammar/morphology patterns.
- It holds **no staging-file input**. Its source of material is the lesson-content tables the Lesson Stage wrote.

**POS and level stay capability-side**: they are never shown to the learner; they drive distractor selection and exercise eligibility. **Translations cross to the Lesson Stage** because the learner reads them. That asymmetry is the whole point of the rule — "enrichment" is not monolithic; it splits on whether the output is read by a human or consumed by generation.

## Consequences

- **The EN/NL translation enrichers move from capability-stage to lesson-stage** (migration plan §9.1). The Capability Stage stops generating translations; it reads ID / NL / EN from `lesson_section_item_rows` + `lesson_dialogue_lines`.
- **The Capability Stage's disk reads must be replaced by DB reads** (`learning-items.ts`, `grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts` → the typed lesson-content tables). This is the substance of the capability-stage redesign (#98/#99). This ADR is the contract that redesign implements.
- **The two stages are sequenced, not concurrent.** PR 6 (typed `lesson_sections`) is the lesson-stage *writer* of the item contract; #98/#99 is the capability-stage *reader*. PR 6 lands first so the reader has a fixed target.
- **Future allocation questions resolve without re-grilling.** New enrichment defaults to: shown to the learner → Lesson Stage; only feeds generation/scheduling → Capability Stage.
- **This does not change ADR 0011's source-of-truth split.** Lesson content stays pipeline-is-writer / staging-canonical; capability content stays DB-authoritative after seeding. This ADR governs *where work runs*, not *what is canonical*. (A consequence worth stating because the two are easy to conflate: a stage boundary is not a source-of-truth boundary.)

## Amendment (2026-06-05 — Slice 5b #147, the no-disk cutover)

Slice 5b implemented the §Consequences disk-reads → DB-reads consequence in full:
the Capability Stage now reads **only** the database (loader is DB-only; the
staging regeneration, `stagingWriteback`, and every staging-file read are removed),
and the global no-file-I/O gate (`noDiskReads.test.ts` `globalNoFileIO`) is ON and
green — the contract this ADR set is now enforced in code.

**POS enrichment clarification (corrects a stray "deviation" framing in the Slice-5
plan).** POS staying capability-side is **not** a deviation — it is exactly what the
§Decision prescribes (line 37: "POS and level stay capability-side"). The only thing
Slice 5b changed is the *substrate*: POS enrichment went from staging-file-coupled to
**DB-native** — it reads existing `learning_items.pos` from the DB and writes back via
`updateLearningItemPos` (the sole POS writer), inside the capability stage, with no
disk access. This is consistent with both this ADR (POS is practice-generation
metadata, capability-side) and the no-disk rule. There is no tracked debt here.

## Related

- [ADR 0011: capability content is DB-authoritative after seeding](./0011-capability-content-is-db-authoritative-after-seeding.md) — deferred this split (line 32); this ADR completes it for the lesson-content side.
- [ADR 0009: typed-table-per-content-concept storage](./0009-typed-table-per-content-concept-storage.md) — the typed tables the Lesson Stage writes and the Capability Stage reads.
- `CONTEXT.md` → Lesson Stage, Capability Stage, Stage Contract — the domain terms this ADR allocates work across.
- `docs/plans/2026-05-22-data-model-migration.md` §9.1 — the translation-enricher relocation decision this ADR generalises into a principle.
