# ADR 0013: The Lesson Gate — a self-contained, stage-local certification of Lesson Stage output

## Status

**Accepted (2026-05-26).** Emerged from a grilling session scoping what publish-time validation should look like for the **Lesson Stage**, after a lesson-10 publish attempt exposed that the current gate cannot pass a net-new lesson. Companion to **ADR 0011** (capability content is DB-authoritative after seeding) and **ADR 0012** (stage responsibilities). `CONTEXT.md` → Lesson Gate asserts the term; this ADR is the decision record behind it. The complementary half — the Capability Stage's own gate — is recorded on epic #98; this ADR governs the Lesson Stage half only.

Forward-looking: the decision is made, the implementation (decompose `lint-staging`, add the post-write layer + a Stage-A-only entry point) is not yet built. Written before that work so it has a fixed target rather than re-deriving the contract.

## Context

The textbook-lesson publish (`publish-approved-content.ts`) runs two deep modules in sequence — Stage A (`runLessonStage`) then Stage B (`runCapabilityStage`) — but its only *gate* is **`scripts/lint-staging.ts`**, a **monolithic pre-flight** run once, before Stage A, over **all** staging files. That made sense under the pre-staged model (one regime, re-publish overwrites everything). Under the staged architecture (ADR 0011/0012) it is a category error in three ways:

1. **It conflates both stages' concerns.** It validates `lesson.ts` (lesson-stage: `grammar-section-unstructured`, `grammar-category-empty`, `exercises-section-unstructured`, `translation-drill-no-answer`) *and* capability-side files (`candidates.ts`, `cloze-contexts.ts`, `grammar-patterns.ts`, `learning-items.ts`) in one pass.

2. **It validates capability checks against post-publish DB state, at pre-flight time.** The cloze `dialogue-cloze-blank-not-in-pool` known-word pool is built from `learning_items` in the **live DB** (`lint-staging.ts:231`, `is_active=true`). A never-published lesson's own new vocabulary is not there yet — so a fresh lesson that blanks any of its own newly-introduced words fails. Same class as `dialogue-translation-missing` (a *later* stage propagates those translations, but lint runs first).

3. **It duplicates the lesson stage's own in-stage validators.** `GT1/GT5/GT6/GT8/GT9` already validate overlapping `lesson.ts` concerns inside `runLessonStage`; `lint-staging` re-checks them up front. Two implementations of the same concern can drift.

The concrete trigger: **lesson 10** — the first net-new lesson published after these checks existed — was refused with 22 CRITICALs. **Zero were `lesson.ts` findings**; all 22 were capability-side (`candidates` ×11, `cloze-contexts` ×1, `learning-items` ×10). The lesson-stage content was entirely publishable; the monolithic gate blocked it on downstream concerns and on state that only exists after publication. (Lessons 1–9 only pass because they are already in the DB, so the DB-state-dependent checks pass on re-lint.) See `memory/project_lint_staging_stage_specific_gates.md`.

## Decision

Introduce the **Lesson Gate**: the Lesson Stage's own quality gate, certifying that a **single lesson's** Stage A output is complete and correct — Stage A's definition-of-done. It replaces the lesson-stage portion of `lint-staging`; the Capability Stage gets the symmetric, DB-state-aware gate (epic #98).

**1. Subject — the lesson stage's full write-set, both consumers.** The gate validates everything Stage A writes for the lesson: the typed capability-contract tables (`lesson_section_item_rows`, `lesson_section_grammar_categories`, `lesson_section_grammar_topics`, `lesson_section_affixed_pairs`, `lesson_dialogue_lines`) **and** the retained `lesson_sections.content` blob (incl. `section_kind`/`source_section_ref`). This covers both consumers of lesson content — the Capability Stage (typed tables) and the lesson reader (blob). Display-only sections (pronunciation, book exercises, reading/culture, reference_table) have no typed table but are still gated on **generic per-type blob shape** at CRITICAL; per-bespoke-page fields (e.g. a lesson's `Page.tsx` reading `content.borobudur_levels`) are not generically knowable and remain the page's own concern, backed by a render smoke.

**2. Three layers, partitioned by how a column is populated** (not three copies of one check):

| Layer | Owns | Examples |
|---|---|---|
| **DB constraints** (NOT NULL / CHECK / FK / UNIQUE) | columns populated **deterministically at write time** | `section_id`, `lesson_id`, `display_order`, `source_item_ref`, `item_type` (+ CHECK), `indonesian_text`, `l1_translation`, FKs, uniques (already in the PR 6 DDL) |
| **Pre-write validator** (the `GT*` family) | async-enriched columns + cross-field rules the DB cannot express | `l2_translation`/`title_en`/`rules_en` (LLM enrichment); `rules_en` parallel to `rules` |
| **Post-write verification** (new; lesson-stage analogue of `CS7–CS9`) | "did the write *land*" | per-lesson row-count parity; **`content` blob non-empty per section** |

**3. A single validator, two run-points.** The pre-write validator is one implementation parameterised by `mode` (or `enrichmentDone`), not two check sets:
- **In-stage, post-enrichment, pre-write** = the **authoritative** gate; enriched-column completeness (EN) is CRITICAL.
- **Standalone pre-flight** (dry-run / `--check`) on raw `lesson.ts` = the **same** validator with enriched-column checks relaxed to warnings (the enricher has not run); structural/deterministic checks stay CRITICAL.

This kills the `GT*`/`lint-staging` duplication (one implementation) and fixes the PR 6 dry-run wart (dry-run currently fails on absent EN because it runs the gate without the enricher).

**4. Self-contained to the lesson → fresh-lesson-safe by construction.** All three layers inspect only the lesson being published: the pre-write validator reads `lesson.ts`/`morphology-patterns.ts`; the post-write verifier reads back **only this lesson's own just-written rows** (by `lesson_id`). The gate never consults a cross-lesson vocabulary pool or any capability-side state. "Is this word known across prior lessons?" is explicitly **not** a Lesson Gate question — it is the Capability Stage's, asked against the DB *after* Stage A wrote this lesson's items. This is the property the monolithic gate lacked.

**5. Certifies Stage A standalone; does not gate the hand-off to Stage B.** Post-write failure → Stage A returns non-`ok`; **no rollback** (lesson content is regenerable / pipeline-is-writer; re-publish is the fix; daily backups per ADR 0011 cover the rest). The gate is intrinsic to Stage A and runs whether A is invoked alone or chained. Because ADR 0011 splits the regimes — lesson content re-published freely, capability content seeded once — **Stage A must be independently runnable**, with the Lesson Gate as its definition-of-done; whether Stage B runs next is a separate orchestration choice. A Stage-A-only entry point is therefore required (today `publish-approved-content.ts` always chains A→B).

**6. Untangle `lint-staging`.** Its `lesson.ts` checks fold into the Lesson Gate's single validator (consolidated with `GT*`). Everything else — `candidates`, `cloze-contexts`, `grammar-patterns`, `learning-items` POS/dedup — is the Capability Stage's gate, run **inside** the capability stage against the DB *after* Stage A wrote this lesson's content, where the becak/dialogue bootstrapping failures dissolve (in-stage generation only blanks words in the item set it just read). `lint-staging` as a monolithic pre-flight is retired/decomposed. `learning-items.ts` tracks the ADR 0012 ownership line: its `dialogue-translation-missing` becomes lesson-side (or moot — PR 6 stops harvesting whole dialogue lines), while global dedup stays capability-side.

## Consequences

- **The lesson stage gains a post-write verification layer it lacks today** — closing the asymmetry with the capability stage (which proves its writes landed via `CS7–CS9`; the lesson stage currently does not).
- **A Stage-A-only entry point must be built** (`publish-lesson-content <N>` / `--lesson-only`), with the Lesson Gate as DOD.
- **NOT-NULL hardening is deferred and gated on the full corpus.** Columns nullable by design today (`l2_translation`, `section_kind`, `source_section_ref`) can be tightened to NOT NULL once every lesson is populated (the PR 1 `translation_nl` pattern: add nullable → re-publish → tighten). This is currently **blocked by L5/7/8** (never re-published; their `section_kind` is NULL), which loops back to the fresh-lesson/lint problem this ADR resolves.
- **The `GT*`/`lint-staging` duplication is removed** by folding the lesson checks into the single validator.
- **The capability-stage gate is the complementary half** (epic #98): DB-state-aware, run in-stage; the bootstrapping failures resolve there by construction once cloze/exercise generation is in-stage against the DB.
- **`lint-staging` does not vanish overnight** — until the capability-stage gate exists, its capability checks remain the only coverage for that side; the decomposition lands with the capability redesign, not before.
- **End-to-end acceptance criterion (recorded on epic #98).** The gate work is *not* validated by re-publishing the existing 9 lessons (they are already in the DB, so the DB-state-dependent checks pass trivially). Its acceptance test is that a **net-new lesson runs the full documented pipeline — raw HEIC photos → database publication** (`content-pipeline.md`: HEIC→JPEG → OCR → catalog → generate-staging → linguist authoring agents → Stage A + Lesson Gate → Stage B + capability gate → published). The entire typed-table migration + PR 6 + this gate work was only ever exercised against re-publish; lesson 10 was the first net-new attempt and never cleared the gate. The fresh-lesson path is the real definition-of-done.

## Alternatives considered

- **Keep the monolithic `lint-staging` gate.** Rejected: mismatches the staged architecture, cannot pass a net-new lesson, conflates the two consumers.
- **Hard NOT NULL on every column ("no nulls, ever").** Rejected: breaks the additive migration on existing rows, the async-enrichment flow, and dry-run; the nullable window is intentional and tightened later (above).
- **Two separate gates / a distinct display gate per consumer (Position C).** Rejected: the blob and the typed rows are projected from the *same* authored section; one gate over the section is more cohesive than two over the same input. (The pre-write/post-write *layering* is within the one gate, not two gates.)
- **A separate, lighter pre-flight implementation.** Rejected: that reintroduces exactly the `GT*`/`lint-staging` drift being removed; one validator with a mode flag instead.

## Related

- [ADR 0011: capability content is DB-authoritative after seeding](./0011-capability-content-is-db-authoritative-after-seeding.md) — the regime split that makes Stage A independently runnable.
- [ADR 0012: stage responsibilities — the no-disk Capability Stage](./0012-stage-responsibilities-and-the-no-disk-capability-stage.md) — the dividing line the gate's scope follows.
- `CONTEXT.md` → Lesson Gate, Lesson Stage, Capability Stage, Stage Contract.
- Epic #98 — the symmetric Capability Stage gate (the complementary half).
- `memory/project_lint_staging_stage_specific_gates.md` — the lesson-10 finding that triggered this.
- PR #108 (PR 6) — built `GT9`/`sectionShape`, the seed of the pre-write validator layer.
