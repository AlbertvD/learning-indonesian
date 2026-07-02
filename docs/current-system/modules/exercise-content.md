---
module: exercise-content
surface: src/lib/exercise-content/
last_verified_against_code: 2026-06-19
inbound_port: src/lib/exercise-content/index.ts
status: stable
---

# Exercise content deep module

**Surface:** `src/lib/exercise-content/`. Inbound port: `index.ts` — the public surface every production caller imports from. Internal files remain importable from their paths for tests and sibling files inside the module.

**Status:** stable as of 2026-05-21. The module was created by PR-A of `docs/plans/2026-05-21-lib-exercise-content-fold.md` (commits `bc45009` step 1, `c70271e` step 2, `fbefba7` step 3). Before PR-A, the logic lived in `src/services/capabilityContentService.ts` + `capabilityContentService.internal.ts` + `src/lib/exercises/builders/*`. Today PR-A is shipped; behavioral claims cite the new module paths. The fold is a pure relocation + internal restructuring around source-kind bucketing; the public surface (the factory + `resolveCapabilityBlocks` convenience + `CapabilityContentService` interface + type re-exports) is byte-identical to pre-fold.

**Files (verified line counts 2026-05-21 via `wc -l`):**

| File | LOC | Role |
|---|---|---|
| `index.ts` | 20 | Barrel — re-exports `createCapabilityContentService`, `resolveCapabilityBlocks`, and the public types (`CapabilityContentService`, `ResolveOptions`, `ResolutionReasonCode`, `CapabilityRenderContext`, `ResolutionDiagnostic`). |
| `resolver.ts` | 140 | `resolveBlocks(blocks, options)` orchestrator + `createCapabilityContentService(client)` factory + `resolveCapabilityBlocks` lazy convenience. Decode + bucket → `adapter.loadBlockData` → per-block dispatch via `buildForExerciseType`. **No SQL.** |
| `adapter.ts` | 588 | Source-kind bucketing (`bucketByDecodedSourceKind`), per-source-kind fetchers (`fetchForItemBlocks` + `fetchForDialogueLineBlocks`), canonical-key decode (`decodeCanonicalKey` + `extractItemKey`, absorbed from former `internal.ts`), diagnostic helpers (`makeFailContext`, `trimPayloadSnapshot`). Public surface: one `Adapter` interface with `loadBlockData` + `logResolutionFailure`; factory `createAdapter(client)`. **Sole SQL touchpoint of the module.** |
| `byType/index.ts` | 73 | Barrel + `buildForExerciseType(exerciseType, raw)` dispatch + `BUILDERS` registry. |
| `byType/<exerciseType>.ts` | 543 across 12 files | Per-exercise-type packagers. Source-kind-agnostic. Receive `BuilderInputFor<T>` (narrowed by the projector), return `BuilderResult`. The 12 files: `recognitionMcq.ts` (56), `cuedRecall.ts` (61), `typedRecall.ts` (19), `meaningRecall.ts` (17), `listeningMcq.ts` (56), `dictation.ts` (20), `cloze.ts` (31), `clozeMcq.ts` (112), `contrastPair.ts` (48), `sentenceTransformation.ts` (39), `constrainedTranslation.ts` (42), `speaking.ts` (44). |
| `byType/helpers.ts` | 28 | Shared helpers — `pickUserLangMeaning`, `shuffle`. |
| `byType/types.ts` | 28 | `BuilderResult` type + re-export of `BuilderInputFor<T>`, `RawProjectorInput` from `@/lib/capabilities`. |
| `__tests__/resolver.test.ts` | 503 | Mocked-Supabase service tests including the URL-budget guard for Kong's 8 KB request-line buffer, plus end-to-end dialogue_line resolution scenarios (PR-B). |
| `__tests__/adapter.test.ts` | 174 | Unit tests for `decodeCanonicalKey` + `extractItemKey` (absorbed from former `capabilityContentService.internal.test.ts`) + `bucketByDecodedSourceKind` (item, dialogue_line, unsupported kinds, malformed refs). |
| `__tests__/byType.test.ts` | 516 | Builder unit tests covering all 12 exercise types via `buildForExerciseType` (exercises projector + dispatch + builder), plus cloze packager dialogue_line branch (PR-B). |

**Note on `adapter.ts` size (450 LOC, over the ~300 LOC trigger named in fold plan D5):** the file is single-source-kind today — one polymorphic fetcher (`fetchForItemBlocks`) plus bucketing + diagnostic helpers + factory. D5's split trigger is "when a second per-kind fetcher is added" (i.e. PR-B's `fetchForDialogueLineBlocks`), which is what actually shallows the file. Splitting today produces a one-file `adapter/byKind/item.ts` directory — target-arch smell on its own. The current shape is intentional; split happens with PR-B.

**Consumers (production, verified via grep 2026-05-21):**

- `src/pages/Session.tsx:22` — imports `resolveCapabilityBlocks` (value) + `CapabilityRenderContext` (type).
- `src/components/experience/ExperiencePlayer.tsx:14` — `CapabilityRenderContext` (type-only).
- `src/components/experience/buildFeedbackInput.ts:4` — `CapabilityRenderContext` (type-only).
- `src/components/experience/CapabilityExerciseFrame.tsx:20` — `CapabilityRenderContext` (type-only).
- `src/lib/session-builder/audibleTexts.ts:13` — `CapabilityRenderContext` (type-only) — already imports from `@/lib/capabilities`; this is the canonical home for the type.

The first four currently import from `@/services/capabilityContentService`. After PR-A merges, they re-route to `@/lib/exercise-content` (value imports) or `@/lib/capabilities` (type-only imports). The fifth requires no path change.

**Test consumers (post-fold):**

- `src/lib/exercise-content/__tests__/resolver.test.ts` — service-level tests with the URL-budget guard.
- `src/lib/exercise-content/__tests__/adapter.test.ts` — canonical-key decode + item-key extraction unit tests.
- `src/lib/exercise-content/__tests__/byType.test.ts` — per-builder unit tests for all 12 exercise types.
- `src/__tests__/SessionDryingAlert.test.tsx:27-28` — vi.mock target updated from `@/services/capabilityContentService` to `@/lib/exercise-content`.
- `src/__tests__/ExperiencePlayer.test.tsx:12` — `CapabilityRenderContext` type import.
- `src/components/experience/__tests__/buildFeedbackInput.test.ts:4` — `CapabilityRenderContext` type import.

---

## 1. Purpose

One job: **resolve a SessionBlock to a render-ready ExerciseItem** (or a diagnostic fail context). The module hides everything between "the session-builder produced an abstract `{ capabilityId, exerciseType }` block" and "the React component receives a fully-populated `ExerciseItem` it can render."

Concretely, that means hiding:

1. **Canonical-key decoding.** Every `SessionBlock.canonicalKeySnapshot` is a string of shape `cap:v1:<sourceKind>:<encodedSourceRef>:...`. The adapter decodes it.
2. **Source-kind-specific DB fetching.** Item blocks need `learning_items` + `item_meanings` + `item_contexts` + `item_answer_variants` + `exercise_variants` + a distractor pool. Future buckets (dialogue_line, affixed_form_pair, podcast_*) need different table joins.
3. **Distractor pool composition.** The pool is derived from items whose contexts anchor to the same lessons as the target item.
4. **Typed-table content lookup.** Per-source-kind structure is read from the typed satellite tables (`dialogue_clozes`, `affixed_form_pairs`, the 4 grammar-exercise tables) — the legacy `capability_artifacts` bag was dropped in Slice 4b (#102).
5. **Per-exercise-type packaging.** 12 different `ExerciseItem` shapes; one packager per type.
6. **Resolution-failure logging.** Fail contexts fire-and-forget to `capability_resolution_failure_events` so admin queries can find regressions.

---

## 2. Public interface

**Service factory + orchestrator (`resolver.ts`):**

- `createService(client): CapabilityContentService` — factory that takes a Supabase client and returns `{ resolveBlocks }`.
- `resolveBlocks(blocks: SessionBlock[], options: ResolveOptions): Promise<Map<string, CapabilityRenderContext>>` — the orchestrator.
- `resolveCapabilityBlocks(blocks, options): Promise<Map<...>>` — convenience that constructs the default service from the production Supabase client.

**Adapter (`adapter.ts`):**

- `loadBlockData(buckets: Record<CapabilitySourceKind, SessionBlock[]>): Promise<Map<string, BlockResolutionData>>` — single public adapter function. Internally dispatches by source kind.

**Builder registry (`byType/index.ts`):**

- `buildForExerciseType<K extends ExerciseType>(exerciseType: K, raw: RawProjectorInput): BuilderResult` — calls `projectBuilderInput` (from `@/lib/capabilities`), then dispatches to the per-type builder from `BUILDERS`.
- `BUILDERS: Record<ExerciseType, (input: BuilderInputFor<T>) => BuilderResult>` — the 12-entry registry.

**Pattern fetcher (`byKind/pattern.ts`):**

- `GRAMMAR_EXERCISE_TABLES: readonly { table: string; type: string }[]` — the 4 typed grammar-exercise tables paired with their `exercise_type` discriminant. Canonical source for the exercise_type<->table correlation; `pattern.ts` derives its internal `TABLE_BY_TYPE` lookup from it, and `src/services/exerciseReviewService.ts` + `src/services/coverageService.ts` import it directly (deduped 2026-07-02, pre-cloud hardening) instead of each defining their own copy.

**Types re-exported from `@/lib/capabilities` (the canonical owner):**

- `CapabilityRenderContext` — output shape per block: `{ blockId, capabilityId, exerciseItem: ExerciseItem | null, audibleTexts: string[], diagnostic: ResolutionDiagnostic | null }`.
- `ResolutionDiagnostic` — fail context shape.
- `ResolutionReasonCode` — fail-code enum (lives in `@/lib/exercises/resolutionReasons` — the cycle-breaking leaf).

---

## 3. Internal flow

### 3.1 The resolution flow (per-call)

```
SessionBlock[]   (input)
        │
        ▼
resolver.bucketByDecodedSourceKind(blocks)
        │
        │  - Decode canonical key per block (via adapter.decodeCanonicalKey).
        │  - Source-kind-not-in-bucket-roster → fail context with
        │    'unsupported_source_kind' (legacy: capabilityContentService.ts:215-220).
        │  - Source-ref unparseable → fail context with 'sourceref_unparseable'.
        │
        ▼
adapter.loadBlockData(buckets)
        │
        │  Promise.all over per-kind fetchers:
        │
        │    item bucket   → fetchForItemBlocks
        │      Wave 1: fetchLearningItemsByKey(keys) || fetchArtifacts(capIds)
        │      Wave 2: fetchMeanings + fetchContexts +
        │              fetchAnswerVariants + fetchActiveVariants
        │      Pool:   fetchDistractorPool(lessonIds derived from contexts)
        │      → RawProjectorInput per block, with learningItem populated
        │
        │    dialogue_line bucket (post PR-B) → fetchForDialogueLineBlocks
        │      Artifacts only (cloze_context + cloze_answer + translation:l1).
        │      No learning_items join.
        │      → RawProjectorInput per block, with dialogueLine populated +
        │        learningItem=null
        │
        │    other buckets → not yet implemented; fail at the resolver gate
        │
        ▼
Map<blockId, BlockResolutionData = { kind: 'ok', input } | { kind: 'fail', ... }>
        │
        ▼
resolver per-block dispatch loop
        │
        │  for each block:
        │    if fail → makeFailContext(block, reasonCode, message, payloadSnapshot)
        │    else    → buildForExerciseType(exerciseType, input)
        │              │
        │              │  projectBuilderInput<T>(exerciseType, raw)
        │              │     (lives in @/lib/capabilities/renderContracts.ts:182)
        │              │     - Validates RawProjectorInput against the contract.
        │              │     - Returns ok with BuilderInputFor<T> (narrowed) or fail.
        │              │
        │              ▼
        │           BUILDERS[exerciseType](narrowedInput) → BuilderResult
        │
        ▼
Map<blockId, CapabilityRenderContext>
        │
        ▼
Fire-and-forget: for each ctx.diagnostic, logResolutionFailure(...)
        → capability_resolution_failure_events row
```

### 3.2 Why source-kind bucketing is in the adapter, not the resolver

Source kind determines which DB tables the adapter joins. Item blocks need 8 tables joined; dialogue_line blocks read the typed `dialogue_clozes` JOIN `lesson_dialogue_lines`; affixed_form_pair blocks read `affixed_form_pairs`. Putting per-kind fetchers in the adapter and exposing one `loadBlockData(buckets)` keeps the resolver agnostic to schema details — the resolver knows about source kinds only as routing labels.

Exercise-type dispatch lives in `byType/`, on a different axis. The two-axis dispatch (source kind in adapter, exercise type in byType) means adding a new source kind is a one-file addition to `adapter/byKind/` (when split) or a single new fetcher inside `adapter.ts` (when single-file). Adding a new exercise type is a one-file addition to `byType/` + one `BUILDERS` registry entry + one `RENDER_CONTRACTS` entry in capabilities.

### 3.3 Wave coupling inside `fetchForItemBlocks`

The item fetcher (now in `byKind/item.ts:70`) runs two waves of parallel queries followed by a pool fetch:

```
Wave 1 (serial):    fetchLearningItemsByKey(slugs)       // learning_items keyed by normalized_text (byKind/item.ts:83)
Wave 2 (parallel):  fetchContexts(itemIds)               // item_contexts (byKind/item.ts:97)
                    fetchAnswerVariants(itemIds)         // item_answer_variants (byKind/item.ts:104)
                    fetchRecognitionMcqDistractors(capIds) // recognition_mcq_distractors via chunkedIn (byKind/item.ts:114)
                    fetchCuedRecallDistractors(capIds)   // cued_recall_distractors via chunkedIn (byKind/item.ts:120)
After Wave 2:       fetchDistractorPool(lessonIds)       // items whose item_contexts.source_lesson_id matches (byKind/item.ts:126)
```

Wave 1 gathers item UUIDs from slug-shaped source refs (`learning_items/<slug>`); Wave 2 needs those UUIDs to join contexts + variants. The curated-distractor tables are fetched concurrently with Wave 2 (keyed by `capability_id`, not item uuid). The distractor pool is derived from the lessons those items' contexts anchor to — known only after Wave 2.

**No `capability_artifacts` query.** The `capability_artifacts` table was dropped in Slice 4b (#102); no source-kind fetcher reads it (the always-empty `artifactsByKind` plumbing was removed too). Curated distractors come from the typed tables directly. The enforcement test at `scripts/lib/pipeline/capability-stage/__tests__/enforcement/noLegacyItemReader.test.ts` gates against re-introduction with an observable-effect assert (tracks `.from('capability_artifacts')` on the mock client); the former `fetchArtifacts` spy/positive-control was removed with the function.

**Curated-distractor interface.** `RawProjectorInput` (`renderContracts.ts:310`) carries two fields populated by the item fetcher:

- `curatedRecognitionDistractors: Map<string, string[]>` — NL wrong-option strings for `recognition_mcq`, keyed by `capability_id` (`renderContracts.ts:333`).
- `curatedCuedRecallDistractors: Map<string, string[]>` — Indonesian wrong-option strings for `cued_recall`, keyed by `capability_id` (`renderContracts.ts:337`).

Both also appear on `BuilderBase` (`renderContracts.ts:341`) so every builder receives them. The `recognition_mcq` and `cued_recall` builders prefer curated rows when `length >= 3`; fall back to `pickDistractorCascade` otherwise (`byType/recognitionMcq.ts:22`, `byType/cuedRecall.ts:24`). When a curated row has `length > 3`, it is sliced to exactly 3 (`byType/recognitionMcq.ts:24`, `byType/cuedRecall.ts:26`). Cloze curated distractors are deferred to Slice 3.

---

## 4. Invariants

- **Canonical-key decode is the sole entry filter.** `decodeCanonicalKey` (in `adapter.ts`) is the only place that parses `canonicalKeySnapshot`. Malformed snapshots route to `sourceref_unparseable` immediately; everything else flows by source kind.

- **`byType/` packagers are source-kind-agnostic.** They consume `BuilderInputFor<T>` whose source-kind variation is hidden by the projector (`projectBuilderInput` in `@/lib/capabilities/renderContracts.ts`). A packager file may branch on which populated field to read (`input.learningItem != null` vs `input.dialogueLine != null`) but never on the source kind directly.

- **The projector is the sole runtime gate for builder input shape.** Mirrors capabilities spec §4 (`docs/current-system/modules/capabilities.md:176`). Builders trust their inputs; no per-builder `if (!input.X) return fail` guards for fields the contract guarantees. Content-quality guards (cloze-context `___` marker, payload shape validation, distractor cascade min count) stay in the builder bodies because they're not contract-provable.

- **URL-budget invariant for chunked fetches.** Kong's request-line buffer is 8 KB. The item fetcher routes all `.in()` clauses through `chunkedIn` (`src/lib/chunkedQuery.ts`): `fetchLearningItemsById` (pool path, `byKind/item.ts:93`), `fetchRecognitionMcqDistractors` (`byKind/item.ts:115`), and `fetchCuedRecallDistractors` (`byKind/item.ts:121`). Each URL is held under ~2 KB. The resolver test at `__tests__/resolver.test.ts` enforces this with `assertUrlBudget` per `.in()` call.

- **Resolution failures are fire-and-forget.** `logResolutionFailure` swallows errors so a failed insert against `capability_resolution_failure_events` never disrupts the user's session. The dialog with the user is rendered from the fail context's `reasonCode`; the DB row is observability only.

- **The default service is lazy and single-shot.** `resolveCapabilityBlocks` constructs `createService(supabase)` per call. This is intentional — there's no cross-call state; the cost is one factory call (constant time). The factory is the convenience boundary for tests (which inject a mock client) and for the production caller (which uses the configured supabase singleton).

---

## 5. Seams (to other modules)

### Upstream (data feeds the module)

- **`learning_capabilities` table** — capability rows the blocks point at (via `block.capabilityId`).
- **`learning_items`, `item_contexts`, `item_answer_variants` tables** — item-bucket data (`item_meanings` and `exercise_variants` are legacy-retained; item fetcher reads translations from inline columns per Decision R).
- **`recognition_mcq_distractors`, `cued_recall_distractors` tables** — curated wrong-option strings, keyed by `capability_id` (Task 8 / #99). Populated by the capability-stage pipeline.
- **`dialogue_clozes` + `lesson_dialogue_lines` tables** — dialogue_line cloze structure (read by `fetchForDialogueLineBlocks`); **`affixed_form_pairs` table** — morphology pair structure. These typed satellites replaced the dropped `capability_artifacts` bag (Slice 4b, #102).
- **`capability_resolution_failure_events` table** — write-only audit log of fail contexts.

### Sibling (lib modules consumed)

- **`@/lib/capabilities/`** — types (`CapabilitySourceKind`, `ArtifactKind`, `ProjectedCapability`), the render contract (`RENDER_CONTRACTS`, `RawProjectorInput`, `ContractInputShapes`, `projectBuilderInput`), and the `CapabilityRenderContext` output shape. See `docs/current-system/modules/capabilities.md`.
- **`@/lib/exercises/resolutionReasons`** — leaf module owning `ResolutionReasonCode`. Lives outside both capabilities and exercise-content to break a circular import; see `src/lib/exercises/resolutionReasons.ts:1-5`.
- **`@/lib/distractors/`** — `pickDistractorCascade` for MCQ-shaped builders.
- **`@/lib/audio`** (single file) — TTS URL resolution via `audibleTextFieldsOf` used by `byType/` packagers.
- **`@/lib/chunkedQuery`** — `chunkedIn` for URL-safe IN clauses.
- **`@/lib/session-builder/`** — types (`SessionBlock`). One-way dependency; the session-builder doesn't import from exercise-content.

### Downstream (this module's outputs feed these)

- **`pages/Session.tsx`** — production caller. Drives `resolveCapabilityBlocks` from the experience player setup.
- **`components/experience/ExperiencePlayer.tsx`** — consumes `CapabilityRenderContext` values to render.
- **`components/experience/buildFeedbackInput.ts`** — consumes the context to construct answer feedback.
- **`components/experience/CapabilityExerciseFrame.tsx`** — consumes the context to render the exercise frame.
- **`lib/session-builder/audibleTexts.ts`** — consumes the type to collect TTS prefetch lists.

### Cross-cutting

- **Supabase client** (`@/lib/supabase`) — adapter's I/O target. The factory pattern lets tests inject a mock client.

---

## 6. Known limitations and follow-ups

- **Three source kinds supported: `item`, `dialogue_line`, and `word_form_pair_src` (morphology).** The bucketing dispatch handles all three; `fetchForItemBlocks` / `fetchForDialogueLineBlocks` / `fetchForAffixedFormPairBlocks` run in parallel via `Promise.all` inside `loadBlockData`. `cloze` (typed) is the only exercise type whose contract accepts `dialogue_line`; `cloze_mcq` stays item-only because its distractor pool is lesson-anchored and the dialogue_line fetcher does not populate a pool today (follow-up — see below). `podcast_segment` + `podcast_phrase` are the next pilots; `pattern`-sourced capabilities now render the four grammar exercises (ADR 0017).

- **Morphology (`word_form_pair_src`) rendering.** Three exercises serve it: `type_form_ex` (`byType/typedRecall.ts`, production — root→derived, optionally in a harvested carrier sentence per ADR 0019 option B), `decompose_word_ex` (`byType/decomposeWord.ts`, recognition — segment the derived word into its morpheme pieces), and `choose_form_ex` (`byType/cuedRecall.ts`, the derived→root "pick the affix" MCQ). `decompose_word_ex` is declared before `choose_form_ex` in `renderContracts.ts`, so the first-compatible resolver always picks it for `recognise_word_form_link_cap`. `morphemePieces` (`decomposeWord.ts:18`) derives the segmentation: a confix from the stored `circumfix_left/right`; a bare prefix/suffix re-derived from `(root, affix)`; and **reduplication re-derived from the catalog `composition` recipe** — full → `[root, root]`, wrapped → `[left, root-root, right]` (ADR 0019 amended L22). Reduplication rows carry **null `circumfix_left/right`** (Option A — the wrap pieces are re-derived, never stored), so `decompose_word_ex` must read the recipe, not the columns. The reduplication production prompt is the Dutch "Geef de verdubbelde vorm van: …" (`typedRecall.ts`), not the dev affix label.

- **`cloze_mcq` does not accept `dialogue_line`.** The runtime cloze_mcq path picks distractors via `pickDistractorCascade` against `input.poolItems` — items whose `item_contexts.source_lesson_id` matches a touched lesson. `fetchForDialogueLineBlocks` does not fetch a distractor pool today; extending it to do so requires parsing `lesson-N` from the source ref + a lesson-id-keyed pool query. Tracked as a follow-up after `affixed_form_pair` lands.

- **`content_flags` not yet built.** Target architecture's `flagState.ts` (`docs/target-architecture.md:479`) describes "user's existing content_flag for this card, if any." The runtime has no `content_flags` table or fetch today. If the feature ships later, it's a new file `flagState.ts` + an additional optional field on `RawProjectorInput`.

- **`variantChoice.ts` collapsed into adapter.** Target arch's `variantChoice.ts` (line 478) is implemented today as a single `Map.get` keyed on `(item_id, exercise_type)`. Per Ousterhout depth rules, this does not earn its own file; it lives inline in `fetchForItemBlocks`.

- **`availability.ts` deleted.** Target arch's `availability.ts` (line 491-492) was to fold `exerciseAvailabilityService.ts`; that service was deleted at commit `1f430ac` (feature never wired). The fold does not create `availability.ts`.

- **Adapter split deferred.** D5 of the fold plan recommends single-file `adapter.ts` at fold time. Split into `adapter/byKind/<sourceKind>.ts` when LOC crosses ~300 (likely with affixed_form_pair, the third bucket).

- **URL-budget guard pattern not generalized.** The `assertUrlBudget` helper in `__tests__/resolver.test.ts` is specific to this resolver. If a second resolver test adopts the pattern, generalize it into a shared test helper at that point.

---

## 7. What this spec does NOT cover

- **Capability projection.** Catalog → `learning_capabilities` rows is owned by `@/lib/capabilities/capabilityCatalog.ts`. See `docs/current-system/modules/capabilities.md` §1.

- **Render contract declaration + builder input narrowing.** `RENDER_CONTRACTS`, `ContractInputShapes`, and `projectBuilderInput` live in `@/lib/capabilities/renderContracts.ts`. The exercise-content module **consumes** these; it doesn't own them. See `docs/current-system/modules/capabilities.md` §2.

- **The JSX rendering.** React components in `src/components/exercises/implementations/` consume the `ExerciseItem` shape and render it. See `docs/current-system/modules/experience.md` for the player.

- **Session planning.** `buildSession` decides which capabilities + exercise types to schedule; lives in `@/lib/session-builder/`. The exercise-content module receives the resulting `SessionBlock[]` and resolves each block.

- **Answer commits.** Once the user answers, the report goes to `services/answerCommitService` → the `commit-capability-answer-report` Edge Function. The exercise-content module is read-only with respect to capability state.

- **FSRS scheduling.** Server-side; ADR 0003. The exercise-content module reads `learner_capability_state` indirectly via `SessionBlock.reviewContext.schedulerSnapshot` (already on the block when it arrives).

- **Distractor pool authoring.** The pool's contents are authored at content-pipeline time by the `vocab-exercise-creator` agent and stored in `vocab-enrichments.ts`; the runtime fetches the pool but does not generate it. See `@/lib/distractors/` spec.

---

## 8. Migration history

- **2026-05-23 — dialogue_line slice completed onto typed tables (#92):** no reader change here (the dialogue_line reader already reads `dialogue_clozes` JOIN `lesson_dialogue_lines`, fail-loud, since PR 2). The slice's remaining gaps closed elsewhere: `renderContracts` set `dialogue_line` to require no artifacts (`[]`); the projector stopped writing the legacy `cloze_context`/`cloze_answer`/`translation:l1` artifacts (typed `dialogue_clozes` is now the sole representation); `promote-capabilities.ts` fixed to project from typed columns (it was silently blocking promotion); and **HC11 retired** in favour of HC15. The HC11 entry below is therefore historical — the live invariant is HC15 (every dialogue_line cap has a `dialogue_clozes` row).

- **2026-05-21 — PR-C shipped:** session-builder verification + UI speaker prefix + HC11 health check + capstone integration test.
  - `session-builder/pedagogy.ts`: extended the receptive-before-productive staging-gate carve-out from `affixed_form_pair`-only to also include `dialogue_line`. The original carve-out exists because affixed_form_pair caps have no Phase 1/2 sibling at the same source_ref. Dialogue_line has the same property — each line has exactly one productive `contextual_cloze` cap; receptive items on the same lesson live at different source_refs (`learning_items/<slug>`), so the source_ref-keyed sibling lookup never matches. Without this carve-out every dialogue_line cap was permanently orphan-suppressed. **This was the only session-builder code change in PR-C** — the dialogue_line plan PR 5 was originally scoped as verification-only but escalated to PR 5b when the staging-gate behavior was traced.
  - `components/exercises/implementations/Cloze.tsx`: renders `clozeContext.speaker` as a bold prefix (e.g. **Titin:** Aku tidak ___ tinggal di rumah terus) when set; null/undefined speaker leaves the rendering byte-identical to the item path.
  - `components/exercises/primitives/fixtures/dialogue-cloze.ts`: new fixture file holding `DIALOGUE_CLOZE_FIXTURE` + `VOCAB_CLOZE_FIXTURE` for /admin/design-lab side-by-side rendering.
  - `scripts/check-supabase-deep.ts`: new HC11 — for every dialogue_line:contextual_cloze cap, all three required artifacts (cloze_context, cloze_answer, translation:l1) exist with `quality_status='approved'`, and `cloze_context.payload_json.source_text` contains the literal `___` marker. EXPECTED RED until affected lessons re-publish with the dialogueArtifacts emitter (PR 1 / commit 1467cae).
  - Tests: +6 new — `pedagogyPlanner.test.ts` (dialogue_line carve-out), `Cloze.test.tsx` (4 speaker-prefix scenarios), `dialogueLineCapstone.test.tsx` (full read-path: mock Supabase → resolveBlocks → render `<Cloze>` → type correct answer → onAnswer fires). Test baseline 1206 → 1212.

- **2026-05-21 — PR-B shipped:** dialogue_line widening absorbed into the new structure.
  - `renderContracts.ts`: widened `cloze.supportedSourceKinds` to `['item', 'dialogue_line']`; left `cloze_mcq` at `['item']` (lesson-pool distractor extension is a follow-up). Added `DialogueLineInput` type. Made `RawProjectorInput.dialogueLine` honestly nullable; widened `ContractInputShapes.cloze` to allow `learningItem: LearningItem | null` + `dialogueLine: DialogueLineInput | null` (exactly-one invariant enforced by the projector).
  - `adapter.ts`: bucketing now produces an `item` bucket AND a `dialogue_line` bucket. New `fetchForDialogueLineBlocks` runs artifacts-only — no `learning_items` join — reading `cloze_context` + `cloze_answer` + `translation:l1` payload shapes per the writer at `scripts/lib/pipeline/capability-stage/projectors/dialogueArtifacts.ts`. `loadBlockData` calls both bucket fetchers via `Promise.all`.
  - `byType/cloze.ts`: branches on `input.dialogueLine != null`; dialogue path reads sentence + targetWord + translation + speaker from `DialogueLineInput`; item path unchanged.
  - `resolutionReasons.ts`: added `dialogue_line_ref_unparseable` + `dialogue_line_artifact_missing`.
  - `types/learning.ts`: extended `ExerciseItem.clozeContext` + `clozeMcqData` shape with optional `speaker: string | null` for the UI to render as a prefix in PR-C.
  - Tests: +13 new unit tests across resolver.test.ts (end-to-end dialogue_line scenarios), adapter.test.ts (bucketing), byType.test.ts (cloze packager dialogue branch). Test baseline 1193 → 1206 passing.

- **2026-05-21 — PR-A shipped:** the fold itself, in three commits.
  - `bc45009` — step 1: `git mv` `capabilityContentService{,.internal}.ts` → `lib/exercise-content/resolver.ts` + `adapter.ts`; relocate the two test files; create `index.ts` barrel; update 4 production + 3 test importers; retarget 5 `CapabilityRenderContext` type-only imports to `@/lib/capabilities` (the canonical home).
  - `c70271e` — step 2: `git mv` 12 builders + helpers + types + index + test from `lib/exercises/builders/` → `lib/exercise-content/byType/` with camelCase rename per target-arch naming rules; update resolver.ts to import `buildForExerciseType` from `./byType`.
  - `fbefba7` — step 3: extract bucketing seam. Moved all fetchers + diagnostic helpers from `resolver.ts` into `adapter.ts`; introduced `bucketByDecodedSourceKind(blocks): { buckets, failures }` (pure function) and `createAdapter(client): Adapter` with `loadBlockData(buckets, opts)` running per-source-kind fetchers in parallel via `Promise.all`. Resolver became pure orchestration (140 LOC, no SQL); adapter became the single I/O seam (450 LOC). Public surface unchanged.

  Test baseline preserved across all three commits: 1193 passing, 0 lint errors, 4 pre-existing warnings, build clean.

- **2026-05-18 (PR #65):** the render contract layer was extracted into `@/lib/capabilities/renderContracts.ts`. The pre-PR-#65 service had per-builder runtime guards (`if (!input.X) return fail`) which were retired in favor of `projectBuilderInput`'s typed narrowing. This is the seam exercise-content consumes today.

- **Pre-fold legacy paths (DELETED at PR-A):** `src/services/capabilityContentService.ts`, `src/services/capabilityContentService.internal.ts`, `src/lib/exercises/builders/*`.
