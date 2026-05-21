---
status: approved
---

# `lib/exercise-content/` fold — deepening capability resolution so source-kind variation hides inside one module

## Goal

Move `src/services/capabilityContentService.ts` + `capabilityContentService.internal.ts` into a deep module at `src/lib/exercise-content/`, restructure the resolver around source-kind bucketing in the adapter (one polymorphic dispatch), relocate the 12 exercise builders to `byType/<exerciseType>.ts`, and widen the resolver so adding a new capability source kind is a one-file addition (one new `byKind/<sourceKind>.ts` fetcher) instead of a parallel branch grafted onto the orchestrator. This is the architectural prerequisite the dialogue-line plan's 2026-05-21 pause note calls for (decision α, "Fold first" — `docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:111-139`).

After this lands, `supportedSourceKinds` widening (dialogue_line first, then `affixed_form_pair`, then podcasts) collapses to a one-file addition in `lib/exercise-content/adapter/byKind/` plus the existing contract widening in `lib/capabilities/renderContracts.ts`. Today the same change requires a parallel branch in the orchestrator's pass-1 loop + a parallel array + a parallel pass-2 loop + a new reason code in the service file — the smell that triggered the pause.

## Plan grounding

Per CLAUDE.md's plan-grounding rule (added 2026-05-21 at commit `b801751`): every `src/lib/<module>/` or `src/services/` path this plan would touch was checked against `docs/target-architecture.md` and the matching `docs/current-system/modules/<name>.md` spec.

- `lib/exercise-content/` — target arch §"`lib/exercise-content/`" (`docs/target-architecture.md:442-498`) defines the target shape. No current module spec — this plan creates the module, the first PR creates `docs/current-system/modules/exercise-content.md`.
- `lib/capabilities/` — `docs/current-system/modules/capabilities.md`. The fold does NOT move `renderContracts.ts`, `renderContext.ts`, or any other capabilities file. The capabilities spec at `:210` explicitly names the `capabilityContentService fold` as the legitimate widening path; this plan IS that fold.
- `lib/exercises/builders/` — no module spec; `docs/target-architecture.md:471-490` says the 12 builders move into `lib/exercise-content/byType/`. This plan executes that move.
- `lib/exercises/resolutionReasons.ts` — a leaf module created in PR #65 specifically to break a circular dependency between `renderContracts.ts` and the service (`src/lib/exercises/resolutionReasons.ts:1-5`). It stays at its current path; the fold does NOT move it. Moving it would re-introduce the cycle.
- `src/services/` — target arch §"Where things live" (`docs/target-architecture.md:96-101`): the `Service` suffix is reserved for `src/services/`; CRUD-shaped data adapters stay there. `capabilityContentService.ts` is the canonical example of "fold the service into the module" — it hides 8 fetcher functions, 3 diagnostic helpers, the bucketing orchestrator, and the canonical-key decode, none of which a caller could inline trivially.

**Already-deleted callouts in the target arch that this plan corrects:**
- Target arch line 491-492 mentions `availability.ts` folding `exerciseAvailabilityService` (~456 LOC). `src/services/exerciseAvailabilityService.ts` was **deleted at commit `1f430ac`** (chore(dead-code): delete exerciseAvailability surface — feature never wired). The fold does NOT create `availability.ts`.
- Target arch line 478 mentions `variantChoice.ts`. Variant choice today is a 3-line `Map.get` keyed on `(item_id, exercise_type)` at `capabilityContentService.ts:289-294`. Per Ousterhout depth rules (target arch §"Depth and width rules", `docs/target-architecture.md:130-137`), a one-line operation does not earn its own file. The fold does NOT create `variantChoice.ts`; the lookup stays in `adapter.ts`.
- Target arch line 479 mentions `flagState.ts` ("user's existing content_flag for this card, if any"). The runtime has no `content_flags` table or fetch today — verified by `grep -rn 'content_flag' src/services/capabilityContentService.ts` returning zero matches. The fold does NOT create `flagState.ts`; it's a future addition tracked as a follow-up if/when content flags ship.

## What's broken today (the snapshot)

**File-level concentration of concerns** — verified line counts via `wc -l`:

| File | LOC | Concern |
|---|---|---|
| `src/services/capabilityContentService.ts` | 375 | Factory + 8 fetcher functions + 3 diagnostic helpers + orchestrator (Pass 1 + Wave 1 + Wave 2 + Pass 2 + logging) + `defaultService` convenience |
| `src/services/capabilityContentService.internal.ts` | 53 | `decodeCanonicalKey` + `extractItemKey` |
| `src/lib/exercises/builders/` | 12 builders (Cloze 31, ClozeMcq 112, ContrastPair 48, CuedRecall 61, Dictation 20, ListeningMCQ 56, MeaningRecall 17, RecognitionMCQ 56, SentenceTransformation 39, Speaking 44, TypedRecall 19, ConstrainedTranslation 42) + `helpers.ts` (28) + `index.ts` (71) + `types.ts` (28). Plus `__tests__/builders.test.ts` (440). | Per-exercise-type packaging; dispatched by `buildForExerciseType` in `index.ts:56-71` |

**Source-kind gate at `capabilityContentService.ts:215-220`** — verified:
```ts
if (decoded.sourceKind !== 'item') {
  result.set(block.id, makeFailContext(block, 'unsupported_source_kind',
    `sourceKind '${decoded.sourceKind}' is out of PR-2 scope`,
    { sourceKind: decoded.sourceKind, sourceRef: decoded.sourceRef }))
  continue
}
```

**Concrete drift cost** — `docs/current-system/capability-runtime-data-model-gap.md` enumerates 105 of 4,005 capability rows that are inert in the live DB because of this gate. Distribution from `:42-60`: 94 pattern, 7 dialogue_line, 4 affixed_form_pair.

**Why parallel branches would shallow the file** — the dialogue_line plan's pause note (`docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:113-122`) shows the failure mode: PR 2 as drafted adds parallel branches inside the service — a parallel `dialogueBlocks` array, a parallel pass-2 loop, a new `extractDialogueLineRef` helper, two new `ResolutionReasonCode` values. When affixed_form_pair lands, it gets its own parallel branch; podcasts add two more. The file shallows (more code paths each tied to one source kind) instead of deepening (one polymorphic dispatch hiding source-kind variation). Ousterhout shallow-module drift, target arch §"Depth and width rules" `docs/target-architecture.md:130-137`.

**Test coverage today (verified):**
- `src/services/__tests__/capabilityContentService.test.ts` — 380+ LOC including the URL-budget guard that asserts every `.in()` call stays under Kong's 8 KB request-line buffer (`:19-36`).
- `src/services/__tests__/capabilityContentService.internal.test.ts` — covers `decodeCanonicalKey` + `extractItemKey`.
- `src/lib/exercises/builders/__tests__/builders.test.ts` — 440 LOC.
- `src/lib/capabilities/__tests__/renderContracts.test.ts:131-154` — three `supportsSourceKind` lock-in tests asserting the `['item']`-only ceiling.

## Module map (the target shape)

```
src/lib/exercise-content/
  index.ts                  Public barrel: resolveBlocks, resolveCapabilityBlocks,
                            createService (factory for tests), CapabilityRenderContext
                            (re-export from @/lib/capabilities/renderContext).
  resolver.ts               resolveBlocks orchestrator. ~90 LOC after extraction.
                            Decode + bucket-by-source-kind → adapter.loadBlockData →
                            per-block dispatch via buildForExerciseType. No SQL.
  adapter.ts                ~280 LOC. Source-kind-specific fetchers, bucketing,
                            canonical-key decode (absorbs internal.ts), diagnostic
                            helpers, logResolutionFailure, trimPayloadSnapshot.
                            One public function loadBlockData(blocks) +
                            createService(client). Sole SQL touchpoint of the module.
  byType/
    index.ts                Barrel: buildForExerciseType + BUILDERS registry.
                            (Folds today's lib/exercises/builders/index.ts.)
    recognitionMcq.ts       (folds builders/RecognitionMCQ.ts, 56 LOC)
    cuedRecall.ts           (folds builders/CuedRecall.ts, 61)
    typedRecall.ts          (folds builders/TypedRecall.ts, 19)
    meaningRecall.ts        (folds builders/MeaningRecall.ts, 17)
    listeningMcq.ts         (folds builders/ListeningMCQ.ts, 56)
    dictation.ts            (folds builders/Dictation.ts, 20)
    cloze.ts                (folds builders/Cloze.ts, 31)
    clozeMcq.ts             (folds builders/ClozeMcq.ts, 112)
    contrastPair.ts         (folds builders/ContrastPair.ts, 48)
    sentenceTransformation.ts (folds builders/SentenceTransformation.ts, 39)
    constrainedTranslation.ts (folds builders/ConstrainedTranslation.ts, 42)
    speaking.ts             (folds builders/Speaking.ts, 44)
    helpers.ts              (folds builders/helpers.ts, 28 — pickUserLangMeaning, shuffle)
    types.ts                (folds builders/types.ts, 28 — BuilderResult, re-export of
                             BuilderInputFor/RawProjectorInput from @/lib/capabilities)
  __tests__/
    resolver.test.ts        (relocates services/__tests__/capabilityContentService.test.ts)
    adapter.test.ts         (relocates services/__tests__/capabilityContentService.internal.test.ts;
                             absorbs adapter-level integration tests at fold time)
    byType.test.ts          (relocates lib/exercises/builders/__tests__/builders.test.ts, 440 LOC)
```

**Files that DO NOT move (verified):**
- `src/lib/capabilities/renderContracts.ts` (333 LOC). The render contract is owned by capabilities (declaration + projection); exercise-content consumes it. Moving it would invert the dependency arrow.
- `src/lib/capabilities/renderContext.ts` (27 LOC). The `CapabilityRenderContext` type is the output shape of resolution but shared with `validateCapability`'s diagnostic vocabulary. The capabilities barrel already exports it (`src/lib/capabilities/index.ts:39`); exercise-content's barrel re-exports it for ergonomic callers.
- `src/lib/exercises/resolutionReasons.ts` (22 LOC). The leaf module created in PR #65 specifically to break the circular dependency between `renderContracts.ts` and the service (`src/lib/exercises/resolutionReasons.ts:1-5`). Moving it back into either module re-introduces the cycle.

**Files that DELETE (the legacy paths):**
- `src/services/capabilityContentService.ts`
- `src/services/capabilityContentService.internal.ts`
- `src/services/__tests__/capabilityContentService.test.ts`
- `src/services/__tests__/capabilityContentService.internal.test.ts`
- `src/lib/exercises/builders/` (the whole folder + tests)

After the fold, `src/lib/exercises/` contains only `resolutionReasons.ts` (the leaf). Whether `lib/exercises/` survives as a one-file folder or `resolutionReasons.ts` becomes a single-file module under `src/lib/` root is an Open Question (below). The minimal-disruption answer: leave it where it is; `lib/exercises/resolutionReasons.ts` is a 22-LOC file whose stable callers (capabilities + exercise-content) already import from this path.

## Decisions

### D1 — Polymorphic dispatch shape

**Decision:** the resolver loops once over blocks to decode + bucket by source kind; the adapter exposes one public function `loadBlockData(buckets)` that runs source-kind-specific fetchers in parallel and returns `Map<blockId, BlockResolutionData>`; the resolver then runs a single Pass-2 loop dispatching via the existing `buildForExerciseType(et, raw)`.

**The current pass-1/pass-2 structure** (`capabilityContentService.ts:205-265`): one loop that decodes + filters to item-only + collects item keys; two waves of parallel SQL (items by key → meanings + contexts + answer variants + variants); a distractor-pool fetch derived from contexts' lesson ids; index construction; a Pass-2 loop building `RawProjectorInput` per block and dispatching.

**What replaces it (resolver.ts):**

```ts
async function resolveBlocks(blocks, options) {
  const result = new Map<string, CapabilityRenderContext>()
  if (blocks.length === 0) return result

  // Single decode + bucket pass. Malformed / unsupported source kinds get a
  // fail context here; everything else flows to the adapter.
  const { buckets, failures } = bucketByDecodedSourceKind(blocks)
  for (const f of failures) result.set(f.blockId, f.context)

  // Adapter handles every source-kind fetch path in parallel; returns
  // per-block RawProjectorInput | fail.
  const blockData = await adapter.loadBlockData(buckets)

  // Single dispatch loop. byType packagers are source-kind-agnostic.
  for (const [blockId, data] of blockData) {
    if (data.kind === 'fail') {
      result.set(blockId, makeFailContext(data.block, data.reasonCode, data.message, data.payloadSnapshot))
      continue
    }
    const built = buildForExerciseType(data.block.renderPlan.exerciseType, data.input)
    result.set(blockId, built.kind === 'ok'
      ? { blockId, capabilityId: data.block.capabilityId, exerciseItem: built.exerciseItem, audibleTexts: built.audibleTexts, diagnostic: null }
      : makeFailContext(data.block, built.reasonCode, built.message, built.payloadSnapshot))
  }

  for (const ctx of result.values()) if (ctx.diagnostic) void logResolutionFailure(ctx.diagnostic, options)
  return result
}
```

**Why bucket by source kind rather than by exercise type:** source-kind variation determines which DB tables to read (items + contexts + variants vs artifacts-only vs root_derived_pair). Exercise type determines which packager builds the `exerciseItem` shape — but that dispatch already exists at `buildForExerciseType` (`src/lib/exercises/builders/index.ts:56-71`) and is unchanged. The two axes stay separate: adapter dispatches on source kind, builder registry dispatches on exercise type.

**Why this is "one polymorphic dispatch" and not "parallel branches":** every source kind adds exactly one file — `adapter/byKind/<kind>.ts` (when adapter.ts itself grows past ~300 LOC) or one fetcher inside `adapter.ts` (until then) — plus one entry in the bucketing dispatch. There is no parallel array in the resolver, no parallel pass-2 loop, no source-kind-specific helpers leaking into the orchestrator. The orchestrator's complexity is constant in the number of source kinds.

### D2 — `byType/<exerciseType>.ts` per-packager input shape

**Decision:** packagers receive `BuilderInputFor<T>` exactly as today. They are **source-kind-agnostic**. Source-kind variation is hidden in (a) the adapter's per-kind fetchers (decide what to fetch) and (b) the projector at `renderContracts.ts:206-333` (decide what fields are required + which fail-codes to emit per exercise type).

**The two-layer narrowing already exists** in PR #65 (2026-05-18) — `projectBuilderInput(exerciseType, raw)` consumes a `RawProjectorInput` with honestly-nullable fields (`learningItem: LearningItem | null` per `renderContracts.ts:137`) and returns `BuilderInputFor<T>` with the fields required by that exercise type narrowed to non-null. The dialogue-line plan D3 (`docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:64-72`) extends this pattern: `RawProjectorInput` gains a `dialogueLine: DialogueLineInput | null` field; per-exercise narrowing in the projector enforces "exactly one of `learningItem` or `dialogueLine` is non-null" for cloze/cloze_mcq; for every other exercise type, `learningItem` stays required and `dialogueLine` is irrelevant.

**Why per-packager-input narrowing belongs in `renderContracts.ts`, not in the byType files:** the projector is the SOLE runtime gate for builder input shape (capabilities spec §4 "Invariants", `docs/current-system/modules/capabilities.md:176`). Putting source-kind branching in byType files would re-introduce the per-builder runtime guards PR #65 explicitly retired. The dialogue-line plan PR 4 already encodes this: `byType/cloze.ts` branches on `input.learningItem != null` to pick `targetWord` from either `learningItem.base_text` or `input.dialogueLine.targetWord`, but the **invariant guard** (exactly one is non-null) lives in the projector. The byType file branches only on which populated field to read; it does NOT re-check nullness.

**Concrete: the packager file shape after dialogue_line lands** (PR-B in this plan's rollout):

```ts
// byType/cloze.ts
export function buildCloze(input: BuilderInputFor<'cloze'>): BuilderResult {
  // Projector guarantees exactly one of learningItem / dialogueLine is non-null.
  const targetWord = input.learningItem?.base_text ?? input.dialogueLine!.targetWord
  const sentence = input.dialogueLine?.text ?? input.clozeContext!.source_text
  const translation = input.dialogueLine?.translation ?? input.clozeContext!.translation_text
  // … rest of the builder unchanged
}
```

The packager has **one polymorphic body**, not two parallel branches.

### D3 — `adapter.ts` source-kind-specific fetching

**Decision:** adapter exposes one public function `loadBlockData(buckets: Record<CapabilitySourceKind, SessionBlock[]>): Promise<Map<string, BlockResolutionData>>` where `BlockResolutionData = { kind: 'ok'; block; input: RawProjectorInput } | { kind: 'fail'; block; reasonCode; message; payloadSnapshot }`. Internally, the adapter runs source-kind-specific private fetchers in parallel via `Promise.all`.

**Private fetcher surface (item bucket, transplanted verbatim from today):**
- `fetchForItemBlocks(blocks)`: today's wave-1 + wave-2 + distractor-pool + index-construction logic. Returns one `BlockResolutionData` per block (the item-not-found / item-inactive failure modes preserved).

**Private fetcher surface (future buckets, named here so the fold lands on a stable shape):**
- `fetchForDialogueLineBlocks(blocks)`: ships with PR-B (dialogue_line plan PR 2 absorbed). Skips item joins; calls `fetchArtifacts(capabilityIds)`; reads `cloze_context.payload_json.line_text`, `cloze_answer.payload_json.value`, `translation:l1.payload_json.value` per block; builds a `RawProjectorInput` with `learningItem: null` and `dialogueLine: { text, speaker, sourceRef, targetWord, translation }`.
- `fetchForAffixedFormPairBlocks(blocks)`: future. Fetches both root + derived items + their meanings + the `root_derived_pair` + `allomorph_rule` artifacts. Specifics deferred to the affixed_form_pair plan.

**The bucketing dispatch:**

```ts
async function loadBlockData(buckets) {
  const results = await Promise.all([
    buckets.item.length ? fetchForItemBlocks(buckets.item) : EMPTY,
    buckets.dialogue_line.length ? fetchForDialogueLineBlocks(buckets.dialogue_line) : EMPTY,
    buckets.affixed_form_pair.length ? fetchForAffixedFormPairBlocks(buckets.affixed_form_pair) : EMPTY,
    // … (one row per supported source kind)
  ])
  return mergeMaps(results)
}
```

**Source kinds not yet supported** are caught at decode time (in resolver.ts, before bucketing) with `unsupported_source_kind` — preserving today's `capabilityContentService.ts:215-220` behavior for pattern / podcast_segment / podcast_phrase until those buckets get fetchers.

**Why one public function, not one per kind:** callers should not know which source kinds exist. The adapter's job is to take a list of blocks and produce per-block data; the public surface stays narrow (target arch §"`adapter.ts` is the abstraction-translation seam", `docs/target-architecture.md:119-122` — "It is not a thin wrapper around `supabase.from(...)`").

### D4 — Caller migration (every importer of the existing service)

Grep-verified callers as of 2026-05-21.

**Production callers (5 files):**
| File:line | Imports |
|---|---|
| `src/pages/Session.tsx:22` | `resolveCapabilityBlocks` (value), `CapabilityRenderContext` (type) — imports from `@/services/capabilityContentService` |
| `src/components/experience/ExperiencePlayer.tsx:14` | `CapabilityRenderContext` (type-only) — imports from `@/services/capabilityContentService` |
| `src/components/experience/buildFeedbackInput.ts:4` | `CapabilityRenderContext` (type-only) — imports from `@/services/capabilityContentService` |
| `src/components/experience/CapabilityExerciseFrame.tsx:20` | `CapabilityRenderContext` (type-only) — imports from `@/services/capabilityContentService` |
| `src/lib/session-builder/audibleTexts.ts:13` | `CapabilityRenderContext` (type-only) — already imports from `@/lib/capabilities` (no path change needed; only the file-header comment at `:6` mentions `src/services/capabilityContentService.ts`) |

**Test callers (5 files):**
| File | What it imports |
|---|---|
| `src/services/__tests__/capabilityContentService.test.ts` | `createCapabilityContentService`, `CapabilityContentService` — relocates to `src/lib/exercise-content/__tests__/resolver.test.ts` |
| `src/services/__tests__/capabilityContentService.internal.test.ts` | `decodeCanonicalKey`, `extractItemKey` — relocates to `src/lib/exercise-content/__tests__/adapter.test.ts` |
| `src/__tests__/SessionDryingAlert.test.tsx:27-28` | `vi.mock('@/services/capabilityContentService', () => ({ resolveCapabilityBlocks: vi.fn(...) }))` — update mock path |
| `src/__tests__/ExperiencePlayer.test.tsx:12` | `CapabilityRenderContext` (type) — update path |
| `src/components/experience/__tests__/buildFeedbackInput.test.ts:4` | `CapabilityRenderContext` (type) — update path |

**Post-fold imports:**
- `resolveCapabilityBlocks` → `import { resolveCapabilityBlocks } from '@/lib/exercise-content'`.
- `CapabilityRenderContext` type → recommend importing from `@/lib/capabilities` directly (where the type already lives at `renderContext.ts` and is already exported by the barrel at `index.ts:39`), since the type is shared between capabilities (validator's diagnostic shape) and exercise-content (resolver's output shape). The exercise-content barrel re-exports for ergonomic callers but it's an alias.

**Doc-only header references (comments only, no imports — these are cosmetic touch-ups in the fold commit; behavior unaffected if missed):**
- `src/lib/exercises/builders/helpers.ts:1` — "Shared helpers for capabilityContentService builders"
- `src/lib/exercises/builders/index.ts:1` — "Type-specific builders for capabilityContentService"
- `src/lib/exercises/builders/types.ts:1,4` — "Shared types for capabilityContentService builders"
- `src/lib/exercises/resolutionReasons.ts:3,5` — "(validator, resolver, projector, builder, capabilityContentService)"
- `src/lib/distractors/index.ts:4`, `semanticGroups.ts:6` — "capabilityContentService spec"
- `src/lib/semanticGroups.ts:3` — "capabilityContentService spec"
- `src/lib/session-builder/audibleTexts.ts:6` — "Capability path (src/services/capabilityContentService.ts)" (the import at `:13` is already at `@/lib/capabilities` — see production callers table above)
- `src/__tests__/morphologyCapabilityProjection.test.ts:65,69` — references inside a long comment

The fold updates these to point at the new path. None affects behavior; missing one is a documentation papercut, not a regression.

**Vi.mock path note:** `src/__tests__/SessionDryingAlert.test.tsx:27-28` mocks `@/services/capabilityContentService`. After the fold, this mock target stops existing; if the test isn't updated, vi.mock against the missing path silently no-ops and the test runs against the real adapter (no behavior change because Session never calls resolveCapabilityBlocks in this test's flow). Still: the fold commit updates the mock target to `@/lib/exercise-content` so future regressions surface correctly.

### D5 — Adapter shape inside the new module

**Decision:** one `adapter.ts` file at fold time. Split into `adapter/byKind/<kind>.ts` is a future internal refactor when LOC exceeds ~300 and at least two source-kind fetchers exist.

**Sizing math** (verified line counts via `wc -l`; the +1 trailing-newline difference is consistent across files):
- `capabilityContentService.ts` = 375 LOC (376 by `wc -l`). After extracting the orchestrator (~90 LOC) to `resolver.ts` and the per-block dispatch body into byType packagers (which already live in `lib/exercises/builders/`), the remaining adapter body is ~205 LOC. The breakdown by role inside `adapter.ts`: pure-SQL fetcher cores (~70) — these are the bodies of `fetchLearningItemsByKey`, `fetchMeanings`, `fetchContexts`, `fetchAnswerVariants`, `fetchActiveVariants`, `fetchArtifacts`, `fetchDistractorPool`, plus `chunkedIn` orchestration; bucketing wrapper + `loadBlockData` orchestration (~25); diagnostic helpers (~40) — `makeFailContext`, `logResolutionFailure`, `trimPayloadSnapshot`; `createService` factory + factory glue (~20); absorbed `internal.ts` decode/extract helpers (~50). The bucketing wrapper is the only new code; the rest is transplanted.
- This sits comfortably under the "single file becomes a smell" threshold (target arch §"Depth and width rules", `docs/target-architecture.md:130-137`).
- Adding `fetchForDialogueLineBlocks` (estimated ~60 LOC per dialogue_line plan PR 2) takes the file to ~265 LOC — still under threshold; no split needed at PR-B.
- The split trigger lands later: when a third source kind ships (affixed_form_pair or podcast) and the file crosses ~300 LOC. At that point, `adapter.ts` keeps the bucketing + diagnostic helpers and the per-kind fetchers move into `adapter/byKind/<kind>.ts`.

**The split, when it happens:**
```
adapter.ts                    Bucketing + loadBlockData + diagnostic helpers (~120 LOC)
adapter/byKind/item.ts        fetchForItemBlocks + the 8 item-specific fetchers (~225 LOC)
adapter/byKind/dialogueLine.ts fetchForDialogueLineBlocks (~60 LOC)
```

**Why not split at fold time:** premature. Today there's exactly one source kind. Splitting before the second kind exists is a form of speculation the target arch's promotion criterion (target arch §1 "Module shape", `docs/target-architecture.md:31-34`) warns against. The fold's job is to relocate + name the seams; the polymorphism that earns the split lands with PR-B.

**The canonical-key decode (today's internal.ts):** absorbs into adapter.ts. `decodeCanonicalKey` and `extractItemKey` are private helpers — they have one external caller (the service body) and two test callers (the internal.test.ts unit tests, which relocate to `__tests__/adapter.test.ts`). Per Ousterhout: a 53-LOC sibling file with one production caller fails the depth-floor test (`docs/target-architecture.md:130-137`). Folding eliminates the cross-file hop. The `__tests__/adapter.test.ts` continues to test these symbols by importing the adapter module directly.

### D6 — Rollout sequence

**Decision:** three PRs, each independently reviewable, each green at `bun run lint && bun run test && bun run build && make check-supabase-deep`.

**PR-A (the fold itself, no behavior change)** — relocates files, restructures the resolver around source-kind bucketing, but keeps the source-kind universe at `['item']`. Every existing test continues to pass; URL-budget guards in the resolver test continue to fire; the 1193-test baseline stays at 1193.

**PR-B (polymorphic adapter for dialogue_line)** — absorbs the dialogue-line plan's PR 2 + PR 3 + PR 4 (`docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:182-235`) into the new structure. Note: PR-B touches THREE physical locations (`lib/exercise-content/adapter.ts`, `lib/capabilities/renderContracts.ts`, `lib/exercise-content/byType/cloze.ts` + `byType/clozeMcq.ts`). This is a multi-file diff, but each file is on a different axis of the change — contract, fetcher, packager — and each constrains the others (the contract's nullability must match the projector's narrowing must match the packager's branch read). Authoring them in separate PRs would create three half-broken intermediate states; landing them together is a coherent vertical slice through the read-path for one source kind. This is different from the "parallel branches in one file" smell the fold was extracted to avoid — that smell was *one file* accumulating shallow per-kind code paths. Here, each file deepens its job (adapter gains a per-kind fetcher; contract gains a per-field nullability; packager gains a per-field branch).

Steps inside PR-B:
1. Add `fetchForDialogueLineBlocks` to adapter.ts (split into `adapter/byKind/` if LOC crosses 300).
2. Widen `cloze` + `cloze_mcq` `supportedSourceKinds` to `['item', 'dialogue_line']` in `lib/capabilities/renderContracts.ts:73-82`.
3. Widen `ContractInputShapes.cloze` + `cloze_mcq` with `dialogueLine: DialogueLineInput | null` per dialogue_line plan D3.
4. Relax the universal `learningItem`-required guard at `renderContracts.ts:212-218` per dialogue_line plan PR 3.
5. Update `byType/cloze.ts` + `byType/clozeMcq.ts` to branch on populated field per dialogue_line plan PR 4.
6. Add `dialogue_line_ref_unparseable` + `dialogue_line_artifact_missing` to `src/lib/exercises/resolutionReasons.ts:7-22` per dialogue_line plan PR 2.
7. **Delete** the dialogue_line lock-in assertion at `src/lib/capabilities/__tests__/renderContracts.test.ts:144-148` ("no exercise supports dialogue_line source kind yet") and replace with an inverted assertion: `cloze` and `cloze_mcq` now support `dialogue_line` AND every other exercise type still does not. (The affixed_form_pair lock-in at `:150-154` stays; PR-B does not touch that source kind.)

**Splitting alternative considered (and rejected):** PR-B1 = renderContracts widening alone (additive type change, no behavior); PR-B2 = adapter + byType + reason codes (behavior change). PR-B1 would type-check on its own because the new `dialogueLine` field is nullable, but every existing test exercises only the item path so PR-B1 would ship a contract widening with zero coverage on the new shape. PR-B2 would then need to land within the same merge window or PR-B1's widened contract becomes a footgun. The merge-window coupling defeats the split. Recommendation: keep PR-B as one PR; the file-axis-coherence argument above carries the review burden.

**PR-C (UI + health-check)** — unchanged from dialogue-line plan PRs 5, 6, 7, capstone (`docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:237-286`).

**Test gates at each PR boundary:**
- PR-A: `bun run test` produces same 1193-passing count (every relocated test continues to pass; no new tests added). `bun run build` produces a clean type-check. `make check-supabase-deep` produces an identical HC1-HC10 report. **User-visible-behavior verification step (required before merge):** run `bun run dev`, log in, start a session that picks up at least one item-sourced cloze + one item-sourced recognition_mcq + one item-sourced dictation, exercise all three to completion, confirm the exerciseItem shape rendered to each component is byte-identical to a pre-fold baseline session log captured before starting PR-A. The fold is a pure relocation + internal restructuring; if any block resolves differently after PR-A, the fold has introduced behavior drift. **Reproducibility caveat:** session-builder picks next-due capabilities from `learner_capability_state` (FSRS state per user). Do NOT record any reviews between the baseline run and the post-fold run, OR restore the `learner_capability_state` snapshot before the verification run. Otherwise the SessionBlock list itself will differ and the diff will be noisy in ways unrelated to the fold.
- PR-B: tests grow by ~10 (new dialogue_line unit tests in resolver + adapter + projector + byType). `make check-supabase-deep` HC11 (added in dialogue-line plan PR 7) turns green for L9's 7 caps once L9 is re-published.
- PR-C: capstone integration test added (~1 LOC of net test growth, but the test is the locked-in seam contract).

**The order assumption:** PR-A merges first (the fold). PR-B then merges (dialogue_line widening lands in the new structure). PR-C merges last (UI + health check). PR-A and PR-B can be authored in sequence in the same session; PR-C can be authored in parallel after PR-B's renderContracts changes land.

**Why not a single mega-PR:** a fold without a behavior change is a high-confidence merge — relocation is easy to audit (a `git mv` matrix). Adding the dialogue_line widening on top of a behavior-changed fold creates a diff that's hard to review (move-and-modify mixed). Splitting buys clean review at the cost of two merges; the dialogue_line plan's pause was triggered by exactly the "scope of change inside one diff" concern.

### D7 — How does the fold interact with the dialogue-line plan's paused PRs?

The dialogue-line plan's pause note (`docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:111-139`) names three options: (α) fold first, (β) fold + dialogue_line as one wave, (γ) accept the drift. This plan implements (α): a separate fold PR (PR-A above) followed by a re-anchored dialogue_line landing (PR-B + PR-C above). Each dialogue-line PR's status under (α):

| dialogue-line plan PR | Status under the fold | Effect on the diff |
|---|---|---|
| PR 0 — cloze-creator agent spec | UNCHANGED, already merged at `a4cd381` | n/a |
| PR 1 — artifact emitter | UNCHANGED, already merged at `1467cae` | Pipeline-side; doesn't touch `capabilityContentService.ts`. No fold dependency. |
| PR 1a — author L5/L7/L8 cloze entries | UNCHANGED | Content-only; doesn't touch any module file. |
| **PR 2** — resolver front door | **COLLAPSES** | Today's draft adds parallel branches inside the service (parallel `dialogueBlocks` array, parallel pass-2 loop, parallel helper). Under the fold, this becomes one `byKind/dialogueLine.ts` fetcher + one new entry in the bucketing dispatch. No parallel arrays in the resolver. |
| **PR 3** — renderContracts widening | UNCHANGED | The renderContracts widening lives at `src/lib/capabilities/renderContracts.ts` — outside the fold target. The diff (widen `supportedSourceKinds`, add `dialogueLine` to `ContractInputShapes`, relax universal `learningItem`-required guard, add `DialogueLineInput` type) is byte-for-byte the same. |
| **PR 4** — builder branch | RELOCATES | Same diff, but applied to `src/lib/exercise-content/byType/cloze.ts` + `clozeMcq.ts` (PR-A moved them from `src/lib/exercises/builders/`). Polymorphic packager body per D2 (one branch on `input.learningItem != null` to choose which populated field to read). |
| PR 5 — session-builder verification | UNCHANGED | Pure verification, no code changes expected. |
| PR 6 — UI surfaces | UNCHANGED | Touches React components in `src/components/exercises/implementations/` — outside the fold. |
| PR 7 — HC11 health check | UNCHANGED | Touches `scripts/check-supabase-deep.ts` — outside the fold. |
| Capstone | UNCHANGED | Integration test in `src/__tests__/` — outside the fold. |

**Under PR-B in this plan, the dialogue-line plan's PR 2 + PR 3 + PR 4 land as one cohesive change** (because their dependencies cross: PR 2 needs the new `dialogue_line_*` reason codes; PR 3 widens the contract that PR 2's adapter consumes; PR 4 reads from the contract PR 3 widens). PR-B still touches three different physical locations (the adapter inside `lib/exercise-content/`, the contract inside `lib/capabilities/`, the packagers inside `lib/exercise-content/byType/`). What changes under the fold is that PR 2's drift — a parallel array + parallel pass-2 loop + parallel helper grafted onto a single file — no longer exists: each location deepens its own job rather than accumulating per-kind code paths. The justification for landing PR 2 + PR 3 + PR 4 as one PR-B (rather than three) is interface coupling: the contract's nullability must match the projector's narrowing must match the packager's branch read; landing them apart creates half-broken intermediate states. See PR-B's splitting-alternative discussion in D6 for the full reasoning.

**The dialogue-line plan's status field:** stays `approved`. The "paused after PR 1" sequencing the plan documents at `:111-139` is preserved — PR 0 + PR 1 + PR 1a remain shipped/in-flight as today; PRs 2-7 + capstone now land under this fold plan's PR-B + PR-C.

## Migration plan

**Step 1: scaffold the new module (single commit, no behavior change).**

Files created:
- `src/lib/exercise-content/index.ts` — barrel exporting `resolveBlocks`, `resolveCapabilityBlocks`, `createService`, `CapabilityRenderContext` (re-export), `ResolutionDiagnostic` (re-export). 12-symbol barrel — within target arch width rule (`docs/target-architecture.md:136`).
- `src/lib/exercise-content/resolver.ts` — `resolveBlocks` orchestrator (~90 LOC), `resolveCapabilityBlocks` convenience (~5 LOC). Extracted from `capabilityContentService.ts:198-365`.
- `src/lib/exercise-content/adapter.ts` — `createService(client)`, `loadBlockData(buckets)`, 8 fetcher helpers (transplanted), 3 diagnostic helpers (transplanted), `decodeCanonicalKey`, `extractItemKey` (absorbed from internal.ts). Single source-kind bucket today: `fetchForItemBlocks`.
- `src/lib/exercise-content/byType/index.ts` — `buildForExerciseType` dispatch (transplanted from `lib/exercises/builders/index.ts`).
- `src/lib/exercise-content/byType/<exerciseType>.ts` — 12 files, one per exercise type, transplanted verbatim from `lib/exercises/builders/<Type>.ts` with rename to camelCase per target arch §"Naming rules" `docs/target-architecture.md:125-128`.
- `src/lib/exercise-content/byType/helpers.ts` — transplanted from `lib/exercises/builders/helpers.ts`.
- `src/lib/exercise-content/byType/types.ts` — transplanted from `lib/exercises/builders/types.ts`.
- `src/lib/exercise-content/__tests__/resolver.test.ts` — transplanted from `services/__tests__/capabilityContentService.test.ts`. The URL-budget guard, mock client, and 12 test cases all transplant verbatim.
- `src/lib/exercise-content/__tests__/adapter.test.ts` — transplanted from `services/__tests__/capabilityContentService.internal.test.ts`.
- `src/lib/exercise-content/__tests__/byType.test.ts` — transplanted from `lib/exercises/builders/__tests__/builders.test.ts`.

Files updated (4 production + 5 test = 9 import-path updates):
- `src/pages/Session.tsx:22` — change import.
- `src/components/experience/ExperiencePlayer.tsx:14` — change import.
- `src/components/experience/buildFeedbackInput.ts:4` — change import.
- `src/components/experience/CapabilityExerciseFrame.tsx:20` — change import.
- `src/__tests__/SessionDryingAlert.test.tsx:27-28` — update vi.mock target.
- `src/__tests__/ExperiencePlayer.test.tsx:12` — update import.
- `src/components/experience/__tests__/buildFeedbackInput.test.ts:4` — update import.
- `src/lib/session-builder/audibleTexts.ts:6,13` — header comment + the `CapabilityRenderContext` import (already at `@/lib/capabilities`, just update header).
- Plus 6 cosmetic header-comment touches (no behavior).

Files created spec:
- `docs/current-system/modules/exercise-content.md` — new module spec, the canonical example for next folds, mirroring `docs/current-system/modules/capabilities.md`.

Files deleted:
- `src/services/capabilityContentService.ts`
- `src/services/capabilityContentService.internal.ts`
- `src/services/__tests__/capabilityContentService.test.ts`
- `src/services/__tests__/capabilityContentService.internal.test.ts`
- `src/lib/exercises/builders/` (full folder, all 14 .ts files + __tests__/builders.test.ts)

**Step 2: extract the bucketing seam (single commit, no behavior change).**

The transplanted `resolveBlocks` is still item-only inside. Refactor: extract `bucketByDecodedSourceKind(blocks)` to a private helper; extract `loadBlockData(buckets)` to adapter; rewrite `resolveBlocks` to the shape shown in D1. The adapter today has one bucket fetcher (`fetchForItemBlocks`); the others are not yet created. The dispatch matrix accepts `unsupported_source_kind` failures the same way the legacy code did.

This step happens in PR-A as a separate commit to keep the diff reviewable. After step 2, the resolver is polymorphic-by-shape (bucketing dispatch exists) but polymorphic-by-data (one bucket fetcher).

**Step 3: dialogue_line lands (PR-B, behavior change).**

Absorbs dialogue-line plan PRs 2, 3, 4. See D7 above for the matrix.

**Step 4: UI + health check (PR-C, behavior change).**

Unchanged from dialogue-line plan PRs 5, 6, 7, capstone.

## Sizing + parallelism

| PR | Step | Estimate | Risk | Depends on |
|---|---|---|---|---|
| PR-A | Step 1: scaffold + relocate | medium (1–2 days) | low — pure relocation + import-path rewrites; no behavior change | — |
| PR-A | Step 2: extract bucketing seam | small (½ day) | low — internal refactor; same tests gate it | step 1 |
| PR-A | Module spec write-up | small (½ day) | low — doc, follows the capabilities.md template | step 2 |
| PR-B | Adapter: `fetchForDialogueLineBlocks` | small (1 day) | medium — first source-kind extension; the LOC-300 split decision happens here | PR-A merged |
| PR-B | renderContracts widening (dialogue-line plan PR 3 re-anchored) | small (1 day) | low — additive type change, exhaustiveness check guards the seam | PR-A merged |
| PR-B | byType branch (dialogue-line plan PR 4 re-anchored) | trivial (½ day) | low — packager body branch | renderContracts widened |
| PR-B | new ResolutionReasonCode entries | trivial (½ day) | very low | — |
| PR-B | lock-in test update at `renderContracts.test.ts:144-148` | trivial (½ day) | very low | — |
| PR-C | UI surfaces (dialogue-line plan PR 6) | small (1 day) | low | PR-B merged |
| PR-C | session-builder verification (PR 5) | trivial (½ day) | very low | PR-B merged |
| PR-C | HC11 + capstone (PR 7 + capstone) | small (1 day) | low | PR-B merged + L9 re-published |

**Total:** PR-A ~2–3 days. PR-B ~3 days. PR-C ~2 days. End-to-end ~7–8 days (in line with dialogue-line plan's pre-pause 7–10 days estimate, since the fold absorbs PR 2's complexity rather than adding to it).

**Parallelism inside PR-A:** the file relocations are independent of the import-path rewrites — both can be authored in parallel, merged into one commit. The bucketing-seam extraction (step 2) gates on step 1 and runs serially.

**Parallelism inside PR-B:** the adapter fetcher, the renderContracts widening, and the byType branch can be authored in parallel (each touches a different file) and merged as one PR. The lock-in test update gates on the widening.

**Parallelism inside PR-C:** PR 5 verification + HC11 + the capstone can run in parallel; the UI surfaces gate on PR-B's builder output shape (which is unchanged — the exerciseItem shape is identical for item-sourced and dialogue-line clozes).

## Rollback story

**PR-A (fold) rollback:**
- `git revert` the fold commit reverts the file moves. Production callers go back to importing from `@/services/capabilityContentService`. The deleted-then-restored files come back via revert.
- Risk: forgotten import path updates leak through. Mitigation: TypeScript fails the build at any forgotten import (`@/services/capabilityContentService` won't resolve after the fold). `bun run build` is the gate — CI cannot reach the homelab so the local `make pre-deploy` is mandatory (CLAUDE.md "Health checks (quick reference)").
- No DB state involved; no migration to roll back.

**PR-B (dialogue_line widening) rollback:**
- Per dialogue-line plan §"Rollback story" (`docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:321-327`): the dialogue-line surface ships behind `VITE_DIALOGUE_LINE_CAPS_ENABLED` (off by default for the merge window). A bad release rolls back via env-var change, no code revert needed. The flag wraps the `dialogue_line` bucket dispatch in `adapter.ts`: when off, the bucket flow goes through the unsupported_source_kind branch.
- Remove the flag after one stable release.

**PR-C (UI + HC) rollback:**
- UI: git revert of the React-component changes; no schema state.
- HC11: idempotent read-only check; remove the block to disable.

**The pre-deploy gate:** `make pre-deploy` (CLAUDE.md "Health checks (quick reference)") MUST be green locally before each PR merge. This is the documented gate; CI cannot reach the homelab. After PR-A merges, run `bun run test` (1193 → 1193) + `bun run lint` (0 errors, 4 pre-existing warnings) + `bun run build` + `make check-supabase` + `make check-supabase-deep` (HC1–HC10 all green).

## Supabase Requirements

### Schema changes

None. The fold touches no DDL. PR-B (dialogue_line widening) inherits the dialogue-line plan's "no schema changes" finding (`docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:346-347`): `capability_artifacts.artifact_kind` is `text` with no enum constraint, so the three new artifact kinds (`cloze_context`, `cloze_answer`, `translation:l1` — already shipped in PR 1 at commit `1467cae`) work without DDL.

### homelab-configs changes

None. The fold introduces no new schemas (PostgREST), no new origins (Kong), no new buckets (Storage), no new auth config (GoTrue). The Supabase surface the new module touches is identical to today's: `learning_capabilities`, `learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`, `exercise_variants`, `capability_artifacts`, `capability_resolution_failure_events`.

### Health check additions

None added by PR-A (the fold). PR-B inherits HC11 from the dialogue-line plan (`docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:268-275`).

PR-A's success criterion is that `make check-supabase` + `make check-supabase-deep` produce **identical** output before and after the merge — no health-check regressions, no policy/grant changes, no schema-cache reloads needed.

## Module spec deliverable

PR-A includes a new file `docs/current-system/modules/exercise-content.md` with frontmatter `status: stable` and `last_verified_against_code: 2026-05-21` (or merge date), mirroring `docs/current-system/modules/capabilities.md`. The spec documents:

1. Surface (the inbound port `index.ts` + 12-symbol public API).
2. Public interface (`resolveBlocks`, `resolveCapabilityBlocks`, `createService`, types).
3. Internal flow (decode → bucket → adapter.loadBlockData → dispatch via byType).
4. Invariants (canonical-key decode is the sole entry filter; byType packagers are source-kind-agnostic; the projector is the sole runtime gate per `capabilities.md:176`).
5. Seams (upstream: `lib/capabilities/` for `RawProjectorInput`/`projectBuilderInput`/`RenderContract`; downstream: `pages/Session.tsx` + the experience components; sibling: `lib/distractors/` for cascade picking, `lib/audio` for TTS URL resolution).
6. Known limitations (no `flagState.ts` yet; one source kind supported at fold time, `dialogue_line` lands in PR-B).
7. What this spec does NOT cover (scheduling, planning, rendering JSX, the capability projection itself).

Per CLAUDE.md §"Before refactoring a module": writing this spec FIRST gives PR-A a diff target — the spec is the acceptance criterion. The pre-fold version captures today's service shape (the seams it has, the assumptions it makes); the post-fold version captures the new module's shape. A fold without this discipline produces code no easier to understand than what it replaced.

## Open questions

**OQ1 — Single `adapter.ts` vs. `adapter/byKind/` split at fold time?** D5 recommends single-file at fold time + split when LOC exceeds 300 (which happens with PR-B's dialogue-line fetcher). The alternative is to land the split structure at fold time even though item is the only kind. Cost: a one-file folder is a target-arch smell (`docs/target-architecture.md:135` — "Single-file folders are a smell"). Recommendation stands; document the LOC threshold trigger in the module spec so future contributors know when to split.

**OQ2 — Does `src/lib/exercises/` survive as a one-file folder containing only `resolutionReasons.ts`?** After PR-A moves the builders out, `src/lib/exercises/` contains exactly one 22-LOC file. By the same depth-floor argument (target-arch §"Depth and width rules"), this is a smell. The alternative: move `resolutionReasons.ts` to `src/lib/` root as `src/lib/resolutionReasons.ts`. Cost: 6 importers to update (capabilities x3, exercise-content x2, services-legacy x0 after PR-A, test files x1). Benefit: kills the empty folder. Recommendation: defer; the folder houses one cross-cutting leaf that breaks a circular import, and re-organizing the leaf is a separate small refactor. Track as a follow-up; not part of this fold.

**OQ3 — Should `CapabilityRenderContext` move from `lib/capabilities/renderContext.ts` to `lib/exercise-content/model.ts`?** Pro-move: exercise-content produces these values; the resolver's output shape is conceptually its model. Pro-stay: the type is shared between capabilities (validator's diagnostic vocabulary) and exercise-content (resolver's output shape) — `src/lib/capabilities/index.ts:39` already exports it; `src/lib/session-builder/audibleTexts.ts:13` consumes it from capabilities. Moving it inverts the dependency. Recommendation: stays at `lib/capabilities/renderContext.ts`. The exercise-content barrel re-exports it as a convenience. Verify with architect.

**OQ4 — Naming: `byType/` vs `byExerciseType/`?** Target arch uses `byType/` (line 478). Pro-`byType/`: shorter, matches the target arch literally. Pro-`byExerciseType/`: explicit, avoids confusion with `byKind/` (which is source-kind). Recommendation: follow the target arch — `byType/`. The `byKind/` split (if/when it lands) is a sibling, and the naming asymmetry (`byType/<exerciseType>.ts` + `byKind/<sourceKind>.ts`) reads cleanly inside the adapter that consumes both.

**OQ5 — Should the fold relocate the URL-budget guard pattern from the resolver test into a shared test helper?** The guard at `services/__tests__/capabilityContentService.test.ts:19-36` is the test-side enforcement of Kong's 8 KB request-line buffer; it's specific to this resolver but generalizable. Recommendation: keep it inline at the relocated `__tests__/resolver.test.ts` — generalizing now is premature. Track as a follow-up if a second resolver test adopts the same pattern.

**OQ6 — Target architecture roster staleness.** The roster table at `docs/target-architecture.md:185` still lists `services/exerciseAvailabilityService` as `LOCKED (stays — no module)`, but the file was deleted at commit `1f430ac` (chore(dead-code): delete exerciseAvailability surface — feature never wired). Not this plan's job to update the roster, but coordinate target-arch updates with this plan's merge: when PR-A lands, the same commit window can update the roster to drop the stale row + the stale `availability.ts` line in §"`lib/exercise-content/`" at `:491-492`.

## See also

- `docs/target-architecture.md:442-498` — the canonical `lib/exercise-content/` shape this plan operationalizes.
- `docs/current-system/modules/capabilities.md:210` — the spec that names this fold as the legitimate widening path.
- `docs/current-system/capability-runtime-data-model-gap.md` — the gap this fold closes structurally (105 inert capabilities of 4,005 = 2.6% drift).
- `docs/plans/2026-05-21-dialogue-line-contextual-cloze.md:111-139` — the pause note that triggered this plan; the (α) "Fold first" branch this plan implements.
- `docs/adr/0006-every-lesson-derived-capability-has-an-introducing-lesson.md` — `lesson_id` invariant; preserved (the fold touches no scheduler / projection / FSRS code).
- `src/lib/capabilities/renderContracts.ts:1-104` — the contract surface the new module consumes; not moved.
- `src/lib/exercises/resolutionReasons.ts` — the cycle-breaking leaf; not moved.
