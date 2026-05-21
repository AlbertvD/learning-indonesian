---
module: exercise-content
surface: src/lib/exercise-content/
last_verified_against_code: 2026-05-21
inbound_port: src/lib/exercise-content/index.ts
status: in-flight
---

# Exercise content deep module

**Surface:** `src/lib/exercise-content/`. Inbound port: `index.ts` — the public surface every production caller imports from. Internal files remain importable from their paths for tests and sibling files inside the module.

**Status:** in-flight as of 2026-05-21. PR-A of `docs/plans/2026-05-21-lib-exercise-content-fold.md` is landing the module. Before-PR-A, the logic this spec documents lived in `src/services/capabilityContentService.ts` + `capabilityContentService.internal.ts` + `src/lib/exercises/builders/*`. The spec is written **first** as the diff target for the fold; behavioral claims cite either the current legacy paths (during PR-A) or the new module paths (post PR-A merge). The frontmatter flips to `stable` and `last_verified_against_code` is bumped on PR-A merge.

**Files (post-fold target shape):**

| File | LOC (estimated post-fold) | Role |
|---|---|---|
| `index.ts` | — | Barrel — re-exports `resolveBlocks`, `resolveCapabilityBlocks`, `createService`. Re-exports `CapabilityRenderContext` + `ResolutionDiagnostic` types from `@/lib/capabilities` for ergonomic callers. |
| `resolver.ts` | ~90 | `resolveBlocks(blocks, options)` orchestrator. Decode + bucket-by-source-kind → adapter.loadBlockData → per-block dispatch via `buildForExerciseType`. No SQL. |
| `adapter.ts` | ~205 | Source-kind-specific fetchers, bucketing dispatch, canonical-key decode (absorbs former `internal.ts`), diagnostic helpers (`makeFailContext`, `logResolutionFailure`, `trimPayloadSnapshot`). One public function `loadBlockData(buckets)` + factory `createService(client)`. Sole SQL touchpoint of the module. |
| `byType/index.ts` | ~70 | Barrel + `buildForExerciseType(exerciseType, raw)` dispatch + `BUILDERS` registry. |
| `byType/<exerciseType>.ts` | ~545 across 12 files | Per-exercise-type packagers. Source-kind-agnostic. Receive `BuilderInputFor<T>` (narrowed by the projector), return `BuilderResult`. The 12 files: `recognitionMcq.ts`, `cuedRecall.ts`, `typedRecall.ts`, `meaningRecall.ts`, `listeningMcq.ts`, `dictation.ts`, `cloze.ts`, `clozeMcq.ts`, `contrastPair.ts`, `sentenceTransformation.ts`, `constrainedTranslation.ts`, `speaking.ts`. |
| `byType/helpers.ts` | ~28 | Shared helpers — `pickUserLangMeaning`, `shuffle`. |
| `byType/types.ts` | ~28 | `BuilderResult` type + re-export of `BuilderInputFor<T>`, `RawProjectorInput` from `@/lib/capabilities`. |
| `__tests__/resolver.test.ts` | ~380 | Mocked-Supabase service tests including the URL-budget guard for Kong's 8 KB request-line buffer. |
| `__tests__/adapter.test.ts` | — | Unit tests for `decodeCanonicalKey` + `extractItemKey` (absorbed from former `capabilityContentService.internal.test.ts`); per-bucket fetcher tests added over time. |
| `__tests__/byType.test.ts` | ~440 | Builder unit tests covering all 12 exercise types. |

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
4. **Artifact lookup.** Per-capability `capability_artifacts` rows are joined by `capability_id` and indexed by `artifact_kind`.
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

Source kind determines which DB tables the adapter joins. Item blocks need 8 tables joined; dialogue_line blocks need 1 (capability_artifacts); affixed_form_pair blocks need a different shape again. Putting per-kind fetchers in the adapter and exposing one `loadBlockData(buckets)` keeps the resolver agnostic to schema details — the resolver knows about source kinds only as routing labels.

Exercise-type dispatch lives in `byType/`, on a different axis. The two-axis dispatch (source kind in adapter, exercise type in byType) means adding a new source kind is a one-file addition to `adapter/byKind/` (when split) or a single new fetcher inside `adapter.ts` (when single-file). Adding a new exercise type is a one-file addition to `byType/` + one `BUILDERS` registry entry + one `RENDER_CONTRACTS` entry in capabilities.

### 3.3 Wave coupling inside `fetchForItemBlocks`

The item fetcher runs two waves of parallel queries:

```
Wave 1 (parallel):  fetchLearningItemsByKey(slugs)   // learning_items keyed by normalized_text
                    fetchArtifacts(capabilityIds)    // capability_artifacts
Wave 2 (parallel):  fetchMeanings(itemIds)           // item_meanings
                    fetchContexts(itemIds)           // item_contexts
                    fetchAnswerVariants(itemIds)     // item_answer_variants
                    fetchActiveVariants(itemIds)     // exercise_variants
After Wave 2:       fetchDistractorPool(lessonIds)   // derived from contexts' lessons
```

Wave 1 gathers item UUIDs from slug-shaped source refs (`learning_items/<slug>`); Wave 2 needs those UUIDs to join meanings + contexts + variants. The distractor pool is derived from the lessons those items' contexts anchor to — known only after Wave 2.

---

## 4. Invariants

- **Canonical-key decode is the sole entry filter.** `decodeCanonicalKey` (in `adapter.ts`) is the only place that parses `canonicalKeySnapshot`. Malformed snapshots route to `sourceref_unparseable` immediately; everything else flows by source kind.

- **`byType/` packagers are source-kind-agnostic.** They consume `BuilderInputFor<T>` whose source-kind variation is hidden by the projector (`projectBuilderInput` in `@/lib/capabilities/renderContracts.ts`). A packager file may branch on which populated field to read (`input.learningItem != null` vs `input.dialogueLine != null`) but never on the source kind directly.

- **The projector is the sole runtime gate for builder input shape.** Mirrors capabilities spec §4 (`docs/current-system/modules/capabilities.md:176`). Builders trust their inputs; no per-builder `if (!input.X) return fail` guards for fields the contract guarantees. Content-quality guards (cloze-context `___` marker, payload shape validation, distractor cascade min count) stay in the builder bodies because they're not contract-provable.

- **URL-budget invariant for chunked fetches.** Kong's request-line buffer is 8 KB. The adapter's distractor-pool path uses `chunkedIn` (in `src/lib/chunkedQuery.ts`) to keep each `.in(...)` URL under ~2 KB. The resolver test at `__tests__/resolver.test.ts` (post-fold) enforces this with `assertUrlBudget` per `.in()` call — every test call is checked against the 8 KB cap regardless of which caller emitted the request.

- **Resolution failures are fire-and-forget.** `logResolutionFailure` swallows errors so a failed insert against `capability_resolution_failure_events` never disrupts the user's session. The dialog with the user is rendered from the fail context's `reasonCode`; the DB row is observability only.

- **The default service is lazy and single-shot.** `resolveCapabilityBlocks` constructs `createService(supabase)` per call. This is intentional — there's no cross-call state; the cost is one factory call (constant time). The factory is the convenience boundary for tests (which inject a mock client) and for the production caller (which uses the configured supabase singleton).

---

## 5. Seams (to other modules)

### Upstream (data feeds the module)

- **`learning_capabilities` table** — capability rows the blocks point at (via `block.capabilityId`).
- **`learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`, `exercise_variants` tables** — item-bucket data.
- **`capability_artifacts` table** — per-capability content blobs, indexed by `(capability_id, artifact_kind)`.
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

- **One source kind supported at PR-A merge: `item`.** The bucketing dispatch is in place but only the item bucket has a fetcher. `dialogue_line` lands with PR-B of the fold plan (`docs/plans/2026-05-21-lib-exercise-content-fold.md`). `affixed_form_pair` is the next pilot after that. `podcast_segment` + `podcast_phrase` follow; `pattern`-sourced capabilities are slated for retirement (the projection pipeline emits them but no exercise renders them and the gap doc recommends a cleanup migration).

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

- **2026-05-21 → PR-A merge (TBD):** the fold itself. See `docs/plans/2026-05-21-lib-exercise-content-fold.md`. Before-PR-A logic lived in `src/services/capabilityContentService.ts` (375 LOC) + `capabilityContentService.internal.ts` (53 LOC) + `src/lib/exercises/builders/` (12 packagers + helpers + index + tests). PR-A is a pure relocation + internal restructuring around source-kind bucketing; behavior is byte-identical (verified by the PR-A baseline-diff verification gate).

- **2026-05-18 (PR #65):** the render contract layer was extracted into `@/lib/capabilities/renderContracts.ts`. The pre-PR-#65 service had per-builder runtime guards (`if (!input.X) return fail`) which were retired in favor of `projectBuilderInput`'s typed narrowing. This is the seam exercise-content consumes today.

- **Pre-fold legacy paths:** `src/services/capabilityContentService.ts`, `src/services/capabilityContentService.internal.ts`, `src/lib/exercises/builders/*`. These delete at PR-A merge.
