---
module: capability-stage-vocabulary
surface: scripts/lib/pipeline/capability-stage/vocabulary/
last_verified_against_code: 2026-06-25
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
   `updateLearningItemPos`) → `upsertCapabilitiesSkipIfExists` (item caps only; inserts new
   caps via `ignoreDuplicates`, then a follow-up `update({retired_at:null})` over the emitted
   keys **reanimates** any that an earlier orphan-sweep soft-retired — fixes the one-way
   retire trap where a routine republish could never revive a still-authored item's caps,
   2026-06-25; only `retired_at`/`updated_at` are touched, FSRS/readiness preserved) →
   `buildItemContentUnits` (`contentUnits.ts`) + `upsertContentUnits` → junction
   (`upsertCapabilityContentUnits`) → `retireOrphanedCapabilities({ sourceKinds: ['item'] })`.
   - **Item `contextual_cloze` is NOT emitted** — won't-build (see §4); cloze stays dialogue-only.
6. **Seed distractors** (absorbs the old Stage C): `seedDistractors` over `createDistractorStore` +
   `createLocalEmbedder` (the done distractor slice — `selectDistractors`/`planDistractors`/`seedDistractors`).
6b. **Reconcile artifact presence** (`reconcileArtifactPresence({ sourceKinds: ['item'] })`, after the
   seed, before promotion — 2026-06-14 spec): the item-scoped mirror of the runner's reconciliation.
   Effectively a no-op (item MCQ caps have no per-cap satellite row — `findCapsMissingSatellite` returns
   none for them); kept for ownership symmetry (the runner owns the non-item kinds).
7. **Gate post-write** (`gate.ts:runVocabGatePostWrite`) — MUST run after step 6 so CS15 reads seeded
   counts: CS14 (POS post-backfill), CS15 (distractor coverage), CS23 (audio coverage WARN), CS17
   (cross-lesson dupes). Aggregates into `status` (`ok`|`partial`).

## 3. Invariants

- **Identity (load-bearing).** Item caps' `canonical_key` is opaque/deterministic. `UNIQUE(source_ref,
  capability_type)` is the writer-bug backstop.
- **Idempotent / seed-once (ADR 0011).** A re-publish is zero-delta: idempotent item upsert
  (translations-only update), `upsertCapabilitiesSkipIfExists` (ON CONFLICT DO NOTHING), `upsertContentUnits`
  (on `content_unit_key`), distractor skip-if-seeded. `--regenerate item` is the only destructive path.
- **No staging reads (Stage Contract).** Inputs are DB tables only; enforced by `__tests__/enforcement/noDiskReads.test.ts`.
- **content_units split.** Item units carry a disjoint `content_unit_key` set + `display_order` range
  (1000+) from the runner's section/grammar/affixed units, so both write `content_units` idempotently.
- **Orphan-sweep scoping.** `retireOrphanedCapabilities` AND `reconcileArtifactPresence` are both scoped
  to `sourceKinds:['item']` so neither sweep retires the runner's non-item caps for the same lesson (and
  vice-versa). The two share one soft-retire write seam (`softRetireCapabilities`) that also clears the
  retired caps' `learner_capability_state.next_due_at` (HC14 invariant — 2026-06-14 spec §2d).
- **Audio (§0.8 / #165).** Audio caps are emitted for word/phrase items; a missing `audio_clip` is a
  CS23 WARNING (not blocked). The hard Stage-A error is #165.

## 4. Known limitations / not yet landed

- **Item `contextual_cloze` — WON'T BUILD (decided 2026-06-09).** A deliberate won't-build, not a TODO —
  do not re-investigate. The architecture forces first-class-or-nothing (a capability is the SR unit;
  `renderContracts` binds the `cloze` exercise to `capabilityTypes:['contextual_cloze']` only — there is no
  lightweight render-variant), so item cloze would mean **+1 FSRS card on every word/phrase item**. The
  literature makes that low-yield: decontextualised recall is equal-or-better than contextual cloze for
  form-meaning (Webb/Nation), and the real lever — *number of retrievals* (Folse 2006, TESOL Q) — is already
  covered by the word's other caps. The cap emitter (`projectItemCloze.ts`) + carrier reader
  (`store.fetchItemsWithClozeCarrier`) + their tests were **deleted**.
  - **One line for the next reader:** the runtime item-cloze render leg (`byType/cloze.ts` item path,
    `renderContracts` `'item'` in the `cloze` contract, `byKind/item.ts`) and the empty
    `cloze_mcq_item_distractors` table are the *entangled remainder* — they sit alongside the LIVE
    `dialogue_line` cloze, so their removal is folded into the **#109** lint-staging/teardown, not a
    drive-by. Authored `item_contexts(cloze)` rows stay in the DB (ADR 0011 seed-once); harmless.
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
  pointer table). `byType/cloze.ts`'s item leg is unreachable (item cloze won't-build — §4), flagged for #109.

## What this spec does NOT cover

Distractor selection internals (the done slice — `selectDistractors`/`planDistractors`/embeddings);
the runner's non-item kinds (its own surface); the runtime exercise rendering (`exercise-content` specs).
