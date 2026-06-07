---
module: capability-stage-vocabulary
surface: scripts/lib/pipeline/capability-stage/vocabulary/
last_verified_against_code: 2026-06-07
status: in-flight   # cutover (Task 8) not yet landed — the runner still co-writes item caps until then
---

# Capability Stage — Vocabulary module

The clean, DB-native sub-pipeline that owns the **item slice** of the Capability Stage
(`source_kind='item'`): vocabulary capabilities, their learning_items + POS + anchor contexts, item
content_units + junction, item `contextual_cloze` capabilities, and curated distractors. Built as the
cap-v2 strangler (`docs/plans/2026-06-06-capability-stage-v2-slice-1-vocabulary.md` + the HOW plan
`docs/plans/2026-06-07-cap-v2-vocabulary-module-rebuild.md`): it replaces the runner's scattered item
branch, which is amputated at the cutover (Task 8). The two stages share only DB tables, never code
(CONTEXT.md "separation stops at the shared capability table").

## 1. Public interface

- **`publishVocabulary(input, hooks?)`** (`publish.ts`) — the entry. `input = { lessonId, lessonNumber,
  dryRun?, regenerate? }`. Returns `CapabilityStageOutput` (`{ status, counts, findings, durationMs }`).
  Called by `publish-approved-content.ts` AFTER the (item-amputated) runner, per the spec §5a publish
  shape. `hooks` inject DB-read seams + embedder for tests.
- **`populateLessonDistractors` / `populateAllDistractors` / `populateDistractors`** (`orchestrate.ts`)
  — the standalone distractor populate seam (the ascending Pool(N) pass + the single-lesson entry).

## 2. Internal flow (functional)

`publishVocabulary` is thin composition (CLAUDE.md "thin composition of pure functions > runner"):

1. **Load** (DB-only): `loadLesson` (audio map, level) + `loadFromDb` (typed item rows + existing item state).
2. **Project** (pure): `projectItemsFromTypedRows` (`projectors/vocab.ts`) → 4 text caps + 2 audio caps
   per word/phrase item + `learningItemInput` + `anchorContext`.
3. **Gate pre-write** (pure, `gate.ts:runVocabGatePreWrite`): CS4/CS4b/CS19/CS20. An `error` →
   `validation_failed`, no writes. (CS5 POS is NOT run here — the projection's pos is null by
   construction; POS is validated post-backfill by CS14.)
4. **dryRun** → return `ok` before writes.
5. **Write** (dependency order): `upsertLearningItemIdempotent` + `upsertItemAnchorContext` per item →
   DB-native POS backfill (`fetchLearningItemPosByNormalizedText` + `enrichMissingPos` +
   `updateLearningItemPos`) → `upsertCapabilitiesSkipIfExists` (item caps only) →
   `buildItemContentUnits` (`contentUnits.ts`) + `upsertContentUnits` → junction
   (`upsertCapabilityContentUnits`) → `retireOrphanedCapabilities({ sourceKinds: ['item'] })`.
   - **Item `contextual_cloze` is NOT emitted** — see §4. The emitter (`projectItemCloze.ts`) +
     reader (`store.fetchItemsWithClozeCarrier`) are present as scaffolding but unwired.
6. **Seed distractors** (absorbs the old Stage C): `seedDistractors` over `createDistractorStore` +
   `createLocalEmbedder` (the done distractor slice — `selectDistractors`/`planDistractors`/`seedDistractors`).
7. **Gate post-write** (`gate.ts:runVocabGatePostWrite`) — MUST run after step 6 so CS15 reads seeded
   counts: CS14 (POS post-backfill), CS15 (distractor coverage), CS23 (audio coverage WARN), CS17
   (cross-lesson dupes). Aggregates into `status` (`ok`|`partial`).

## 3. Invariants

- **Identity (load-bearing).** Item caps' `canonical_key` is opaque/deterministic; the item
  `contextual_cloze` cap uses `direction:'id_to_l1', modality:'text', learnerLanguage:'none'` — verified
  against the live dialogue precedent (`projectors/dialogueCloze.ts:47-54`). `UNIQUE(source_ref,
  capability_type)` is the writer-bug backstop.
- **Idempotent / seed-once (ADR 0011).** A re-publish is zero-delta: idempotent item upsert
  (translations-only update), `upsertCapabilitiesSkipIfExists` (ON CONFLICT DO NOTHING), `upsertContentUnits`
  (on `content_unit_key`), distractor skip-if-seeded. `--regenerate item` is the only destructive path.
- **No staging reads (Stage Contract).** Inputs are DB tables only; enforced by `__tests__/enforcement/noDiskReads.test.ts`.
- **content_units split.** Item units carry a disjoint `content_unit_key` set + `display_order` range
  (1000+) from the runner's section/grammar/affixed units, so both write `content_units` idempotently.
- **Orphan-sweep scoping.** `retireOrphanedCapabilities` is scoped to `sourceKinds:['item']` so it never
  retires the runner's non-item caps for the same lesson (and vice-versa).
- **Audio (§0.8 / #165).** Audio caps are emitted for word/phrase items; a missing `audio_clip` is a
  CS23 WARNING (not blocked). The hard Stage-A error is #165.

## 4. Known limitations / not yet landed

- **Item `contextual_cloze` — planned FIRST-CLASS capability, not yet wired.** The cap emitter
  (`projectItemCloze.ts`) + carrier reader (`store.fetchItemsWithClozeCarrier`) are present + tested but
  `publishVocabulary` does not call them. Two blockers must clear before wiring:
  1. **Real-sentence carriers.** Today's item carriers (from `cloze-creator` / `extract-cloze-items.ts`)
     are *fabricated* sentences that don't serve the lesson content. First-class item cloze must blank the
     item in a sentence the learner actually read (a real lesson sentence), the way dialogue cloze blanks
     a real dialogue line. The ~1,171 existing fabricated carriers are retirement candidates.
  2. **The activation gap.** No cloze of any kind currently reaches a learner — the 85 `dialogue_line`
     contextual_cloze caps are `ready`/`published` but have **0** review events and **0**
     `learner_capability_state` rows. Only the 6 core item vocab types ever activate. This is a runtime
     activation-path defect (separate issue), and it blocks *all* cloze/grammar/morphology — fix it first.
- **Live write-path verification** is at the lesson-11 acceptance publish (HOW plan Task 10), per the
  store-glue convention (orchestration logic unit-tested; DB glue live-verified). Acceptance scope =
  the 6 core families + distractors (the proven path); cloze render is deferred to the activation fix.

## 5. Seams

- **Upstream:** the lesson-content tables the Lesson Stage wrote (`lesson_section_item_rows`,
  `audio_clips`, authored `item_contexts(cloze)`) — the Stage Contract. See
  `docs/current-system/modules/` lesson-stage (or CONTEXT.md → Stage Contract).
- **Sibling:** the shrunk `runCapabilityStage` runner (non-item kinds — dialogue_line, pattern,
  affixed), sharing only `learning_capabilities` / `content_units`. `runner.ts`.
- **Downstream:** the runtime reader `src/lib/exercise-content/byKind/item.ts` (reads the `distractors`
  pointer table + `item_contexts` carrier) and `byType/cloze.ts` (renders the item cloze).

## What this spec does NOT cover

Distractor selection internals (the done slice — `selectDistractors`/`planDistractors`/embeddings);
the runner's non-item kinds (its own surface); the runtime exercise rendering (`exercise-content` specs).
