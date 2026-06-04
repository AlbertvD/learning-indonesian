---
module: capabilities
surface: src/lib/capabilities/
last_verified_against_code: 2026-06-04
inbound_port: src/lib/capabilities/index.ts
status: stable
---

# Capabilities deep module

**Surface:** `src/lib/capabilities/`. Inbound port: `index.ts` — all `src/` production callers import from `@/lib/capabilities`. Internal files remain importable from their paths for tests and for sibling files inside the module.

**Files (9):**

| File | LOC | Role |
|---|---|---|
| `index.ts` | — | Barrel — re-exports the public surface (every externally-consumed symbol). The inbound port per target-architecture.md §2. |
| `capabilityTypes.ts` | 251 | Types only — `CapabilityType`, `CapabilitySourceKind`, `ArtifactKind`, `ProjectedCapability`, `CapabilityProjection`, `CurrentContentSnapshot`, the `CAPABILITY_PROJECTION_VERSION` stamp, and the closed-mapping helper `deriveSkillTypeFromCapabilityType(capabilityType): SkillType` used at read-time after metadata_json retirement. |
| `capabilityCatalog.ts` | 196 | `projectCapabilities(snapshot)` — derives every `ProjectedCapability` from raw catalog content (learning items, grammar patterns, affixed-form pairs). Source-of-truth for which cap_types each content kind emits + what each cap_type's `requiredArtifacts` is. Podcast caps are emitted by a separate projector at `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts` per Decision 4; contextual_cloze caps live in `scripts/lib/pipeline/capability-stage/projectors/vocab.ts` per Decision 5b. |
| `capabilityContracts.ts` | 107 | `validateCapability(input)` — derives `CapabilityReadiness` purely from `RENDER_CONTRACTS` routing (which exercise types serve this cap_type AND support its source kind). Slice 4b (#102) removed the artifact-bag dependency — readiness no longer reads `required_artifacts` or `capability_artifacts`. `isExposureOnly(cap)` for podcast caps. `validateCapabilities` for aggregate health. |
| **`renderContracts.ts`** | 333 | **The shared render contract** — `RENDER_CONTRACTS`, `ContractInputShapes`, `BuilderInputFor<T>`, `projectBuilderInput<T>()`, plus inverted-lookup helpers (`exerciseTypesForCapability`, `requiredArtifactsFor`, `supportsSourceKind`). Sole source of truth for (a) which exercise types each cap_type is ready for, (b) which builder the resolver dispatches to, (c) what inputs each builder is guaranteed to receive. |
| `artifactRegistry.ts` | 26 | The exhaustive `ARTIFACT_KINDS` array (`as const satisfies readonly ArtifactKind[]`) — retained only for the Slice-5-owned (#147) legacy staging regeneration. Slice 4b (#102) removed `hasApprovedArtifact` / `ArtifactIndex` / `CapabilityArtifact` (the readiness machinery) when the `capability_artifacts` table was dropped. |
| `canonicalKey.ts` | 40 | `buildCanonicalKey(input)` — encodes a `ProjectedCapability` into its stable canonical key. `normalizeLessonSourceRef` for legacy lesson-source-ref shapes. |
| `itemSlug.ts` | 25 | `itemSlug(base_text)` — canonical slug derivation extracted in PR #59 to fix the silent slug-divergence bug class (~113 multi-word items unreachable). |
| `separatorConvention.ts` | 86 | The single alternative-answer separator definition (CONTEXT.md → Typed Artifact). `splitAlternatives(value)` — split on canonical `/` + defensive `;`, never comma — consumed by the runtime grader (`src/lib/answerNormalization.checkAnswer`). `classifyDutchSeparator` / `classifyIndonesianSeparator` — the non-canonical-separator detector shared by the pipeline `CS19` gate + `HC24` health check. Tree-neutral so both the browser bundle and the `scripts/` pipeline import one definition (PR #129; anti-drift across the `src/`↔`scripts/` boundary). |

**Consumers (production):** all `src/` callers import from `@/lib/capabilities` (the barrel). Scripts continue to use relative paths into specific files until they are migrated.

- `src/lib/session-builder/adapter.ts` — calls `validateCapability` per row to project readiness; pulls most projection types.
- `src/lib/session-builder/builder.ts` — pulls `CapabilityReadiness`, `ProjectedCapability`.
- `src/lib/session-builder/pedagogy.ts`, `labels.ts` — pull `CapabilityType` / `CapabilitySourceKind` for planner + display labels.
- `src/lib/mastery/masteryModel.ts` — pulls cap_type / source_kind for the mastery-labelling rules (the artifact-completeness arm was retired in Slice 4b, #102).
- `src/lib/exercise-content/byType/index.ts` — calls `projectBuilderInput` to narrow raw input before dispatching to typed builders. (Was `src/lib/exercises/builders/index.ts` pre-2026-05-21 fold.)
- `src/lib/exercise-content/byType/types.ts` — re-exports `BuilderInputFor<T>` + `RawProjectorInput` for the 12 per-type packagers.
- `src/lib/exercises/exerciseResolver.ts` — calls `exerciseTypesForCapability` for compatibility lookup; consumes `CapabilityReadiness`, `ProjectedCapability`. (The `ArtifactIndex`/`hasApprovedArtifact` re-check was removed in Slice 4b, #102.)
- `src/lib/exercises/exerciseRenderPlan.ts` — consumes `ProjectedCapability` for the render-plan shape.
- `src/lib/exercise-content/resolver.ts` — orchestrates the per-block dispatch; imports `CapabilityRenderContext`, `ResolutionDiagnostic`. (Was `src/services/capabilityContentService.ts` pre-2026-05-21 fold.)
- `src/lib/exercise-content/adapter.ts` — imports `CapabilitySourceKind`, `CAPABILITY_SOURCE_KINDS` for the source-kind bucketing + canonical-key decoding + per-bucket fetchers. (Absorbed the former `capabilityContentService.internal.ts`.)
- `src/services/capabilityService.ts` — consumes the cap_type / direction / modality / language enums for the DB row shape.
- `scripts/promote-capabilities.ts` — calls `validateCapability` for promotion decisions.
- `scripts/check-capability-health.ts` — calls `validateCapability` + `validateCapabilities` for health-report generation; also pulls `CapabilityHealthReport`, `ExerciseAvailabilityIndex`.
- `scripts/materialize-capabilities.ts`, `scripts/lib/content-pipeline-output.ts`, `scripts/data/staging/podcast-warung-market/capabilities.ts` — call `projectCapabilities`.
- `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts`, `scripts/lib/pipeline/capability-stage/projectors/vocab.ts` — call `buildCanonicalKey` + the `CAPABILITY_PROJECTION_VERSION` stamp.
- `scripts/lib/pipeline/capability-stage/{adapter,lint/duplicateItems,projectors/vocab,validators/itemSourceRefResolvability}.ts`, plus `scripts/seed-cloze-contexts.ts`, `scripts/repair-item-meanings.ts`, `scripts/reactivate-dialogue-chunks.ts`, `scripts/cleanup-annotations.ts` — call `itemSlug` for canonical slug derivation. (`scripts/publish-grammar-candidates.ts` was retired in Slice 2 Task 9 — grammar exercises are generated in-stage to the 4 typed tables; it was the sole writer of `item_context_grammar_patterns`, now a legacy-only junction read by coverageService Path A.)

**Status (2026-05-22):** stable. PR #65 introduced `renderContracts.ts` and rewrote `validateCapability` to consume it. The contract surface that previously lived as three divergent declarations (validator's `exerciseByCapability`, resolver's `compatibleExercisesByCapability`, builders' inline guards) now lives in one table. Inbound-port barrel (`index.ts`) added 2026-05-18; all `src/` production callers now route through it.

**2026-05-22 — typed-column projection (PR 0 of the data-model migration).** `ProjectedCapability` slimmed: `difficultyLevel`, `goalTags`, `sourceFingerprint`, `artifactFingerprint` dropped (no runtime consumers, or derivable, or destination-column-going-away). `skillType` retained but read-time-derived from `capability_type` via `deriveSkillTypeFromCapabilityType` instead of stored in metadata_json. `requiredArtifacts` and `prerequisiteKeys` are now backed by two typed `learning_capabilities` columns (`required_artifacts text[]`, `prerequisite_keys text[]`) added in scripts/migration.sql; the legacy `metadata_json` jsonb column survives until a follow-up cleanup PR drops it but is no longer read or written. `required_artifacts` stays as a column (not derivable from capability_type alone) because affixed_form_pair caps have conditional artifacts (±allomorph_rule per capabilityCatalog.ts:178-180).

**2026-06-02 — shared separator convention (PR #129).** `separatorConvention.ts` added to the barrel: `splitAlternatives` (canonical `/`, defensive `;`, never comma) + `classifyDutchSeparator`/`classifyIndonesianSeparator`. New cross-boundary consumers: `src/lib/answerNormalization.ts` (the grader) imports `splitAlternatives`; `scripts/lib/pipeline/capability-stage/validators/itemSeparatorConvention.ts` (CS19) and `scripts/check-supabase-deep.ts` (HC24) import the classifiers. This is the one definition that prevents the runtime/pipeline drift that left legacy `;`/comma `translation_nl` values unmatchable (ADR-less fix; plan `docs/plans/2026-06-02-productive-ceiling-and-paraphrase-acceptance.md` §2).

**2026-05-23 — dialogue_line readiness off artifacts; promoter de-staled (#92).** `renderContracts` now declares `dialogue_line` requires no artifacts (`[]`), mirroring `item`: dialogue_line caps render from the typed `dialogue_clozes` table, so `validateCapability` no longer gates them on `capability_artifacts`. `scripts/promote-capabilities.ts` was still projecting caps from `metadata_json` (contradicting the 2026-05-22 entry's "no longer read" claim); it now projects from the typed columns + `deriveSkillTypeFromCapabilityType`, matching the runtime adapter. That stale read had silently blocked promotion for *every* source_kind — it is why L9's dialogue caps sat `unknown`/`draft`. HC11 (legacy three-artifact check) retired in favour of HC15 (every dialogue_line cap has a `dialogue_clozes` row).

---

## 1. Purpose

Three responsibilities:

1. **Project the catalog into capabilities.** `projectCapabilities(snapshot)` turns raw content (learning items, grammar patterns, affixed-form pairs) into the full set of `ProjectedCapability` rows, each with a canonical key, source kind, capability type, and declared `requiredArtifacts`.

2. **Decide readiness.** `validateCapability` consults `RENDER_CONTRACTS` (which exercise types serve this cap_type AND support its source kind) and returns a `CapabilityReadiness` — `ready` | `blocked` | `exposure_only` | `deprecated` | `unknown`. Slice 4b (#102): `blocked` now means only "no compatible exercise for this cap_type × source_kind"; the artifact-bag check is gone.

3. **Govern rendering.** `RENDER_CONTRACTS` declares per-exercise: which cap_types it serves, which source kinds it accepts, what artifacts it needs. `projectBuilderInput<T>()` narrows a `RawProjectorInput` into the per-builder typed input, performing every runtime guard the 12 builders used to re-implement. After projection, each builder is statically guaranteed every field its contract requires is non-null.

---

## 2. Public interface

**Catalog projection:**
- `projectCapabilities(input: CurrentContentSnapshot): CapabilityProjection` — `capabilityCatalog.ts:46`.

**Readiness:**
- `validateCapability(input: CapabilityValidationInput): CapabilityReadiness` — `capabilityContracts.ts:52`.
- `validateCapabilities(input: { projection }): CapabilityHealthReport` — `capabilityContracts.ts`.
- `isExposureOnly(capability: Pick<ProjectedCapability, 'sourceKind'>): boolean` — `capabilityContracts.ts:17`. True for `podcast_segment` / `podcast_phrase`.
- Types: `CapabilityReadiness`, `CapabilityHealthReport`, `CapabilityValidationInput`.

**Render contract:**
- `RENDER_CONTRACTS: Record<ExerciseType, RenderContract>` — `renderContracts.ts:43-103`. The runtime table.
- `ContractInputShapes` — `renderContracts.ts:147-167`. The compile-time per-exercise input shape map.
- `BuilderInputFor<T extends ExerciseType> = ContractInputShapes[T]` — `renderContracts.ts:171`.
- `RawProjectorInput` — `renderContracts.ts:120-131`. The shared input shape the dispatcher constructs.
- `projectBuilderInput<T>(exerciseType, raw): { ok: true; input: BuilderInputFor<T> } | { ok: false; reasonCode; ... }` — `renderContracts.ts:182`. The projector.
- `exerciseTypesForCapability(capabilityType): readonly ExerciseType[]` — `renderContracts.ts:107`. Inverted lookup.
- `requiredArtifactsFor(exerciseType): readonly ArtifactKind[]` — `renderContracts.ts:113`.
- `supportsSourceKind(exerciseType, sourceKind): boolean` — `renderContracts.ts:117`.

**Artifact registry (Slice 4b: reduced to the kind vocabulary):**
- `ARTIFACT_KINDS` — `artifactRegistry.ts`. Exhaustive constant array, retained only for the Slice-5-owned (#147) legacy staging regeneration. `hasApprovedArtifact` + the `CapabilityArtifact`/`ArtifactIndex`/`ArtifactQualityStatus` types were removed when `capability_artifacts` was dropped.

**Canonical key + slug:**
- `buildCanonicalKey(input: CanonicalKeyInput): string` — `canonicalKey.ts:29`.
- `normalizeLessonSourceRef(sourceRef: string): string` — `canonicalKey.ts:22`.
- `itemSlug(baseText: string): string` — `itemSlug.ts:23`. Single source of truth for slug derivation (PR #59).

**Type unions (re-exported via `capabilityTypes.ts`):**
- `CapabilityType`, `CapabilitySourceKind`, `ArtifactKind`, `CapabilityDirection`, `CapabilityModality`, `LearnerLanguage`.
- `ProjectedCapability`, `CapabilityProjection`, `CapabilityAlias`, `ProjectionDiagnostic`.
- `CAPABILITY_PROJECTION_VERSION` (`capability-v3`), `CAPABILITY_TYPES`, `CAPABILITY_SOURCE_KINDS`.

---

## 3. Internal flow

### 3.1 The contract flow (read by every consumer)

```
RENDER_CONTRACTS table  (renderContracts.ts:43)
        │
        │  exerciseTypesForCapability(cap_type)
        │       — which exercise types name this cap_type?
        │  supportsSourceKind(et, sourceKind)
        │       — does this exercise accept this source kind?
        │  requiredArtifactsFor(et)
        │       — what artifacts does this exercise's builder read?
        ▼
validateCapability(cap, artifacts)  (capabilityContracts.ts:52)
        │
        │  1. Short-circuit on exposure_only / readinessOverride.
        │  2. candidateExercises = exerciseTypesForCapability(cap.capabilityType)
        │                              .filter(supportsSourceKind(et, cap.sourceKind))
        │  3. If empty → blocked with `no_compatible_exercise_for_capability_type`.
        │  4. readyExercises = candidateExercises.filter(et => UNION(
        │       contract.requiredArtifacts, cap.requiredArtifacts
        │     ).every(approved))
        │  5. If empty → blocked with missing artifacts.
        │  6. Apply exerciseAvailability override.
        │  7. Return ready / blocked.
        ▼
CapabilityReadiness  →  resolveExercise  →  ExerciseRenderPlan
                            │
                            │  picks first ready exercise from
                            │  allowedExercises ∩ exerciseTypesForCapability;
                            │  defence-in-depth artifact re-check uses
                            │  cap.requiredArtifacts (not the contract's).
                            ▼
                       SessionBlock.renderPlan
```

### 3.2 The render flow (builder dispatch)

```
RawProjectorInput          (constructed inside src/lib/exercise-content/adapter.ts per-bucket fetchers)
        │
        │  projectBuilderInput(exerciseType, raw)   (renderContracts.ts:182)
        │
        │  Single source of runtime gating:
        │   - learningItem present?      → 'item_not_found'
        │   - primaryMeaning needed?     → 'no_meaning_in_lang'
        │   - clozeContext for cloze?    → 'malformed_cloze'
        │   - matching variant for X?    → 'no_active_variant'
        │   - cloze_mcq invariant:       at least one of (matching variant)
        │                                or (clozeContext) is non-null
        ▼
BuilderInputFor<T>  (narrowed; learningItem etc. are non-null by TS)
        │
        │  BUILDERS[exerciseType](narrowedInput)
        ▼
BuilderResult  ({ kind: 'ok', exerciseItem, audibleTexts } | fail)
```

### 3.3 The catalog projection (one-shot, called by pipeline + tests)

`projectCapabilities(snapshot)` walks every `learningItem`, every `grammarPattern`, every `affixedFormPair` in the snapshot and emits the appropriate cap rows. The mapping from content shape → cap_type rows is hardcoded in `capabilityCatalog.ts:46-217`. Podcast caps are NOT emitted here — they live in `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts` per Decision 4. Contextual_cloze caps are NOT emitted here either — they live in `scripts/lib/pipeline/capability-stage/projectors/vocab.ts` per Decision 5b.

---

## 4. Invariants

- **`RENDER_CONTRACTS` exhaustiveness.** Every `ExerciseType` must have an entry. Enforced by `as const satisfies Record<ExerciseType, RenderContract>` at `renderContracts.ts:103`. A new ExerciseType added to `@/types/learning` without a contract entry is a compile error.

- **`ContractInputShapes` exhaustiveness.** Every `ExerciseType` must have an input-shape entry. Enforced by the `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK` assertion at `renderContracts.ts:169-170`.

- **Pattern caps are blocked at validateCapability.** `pattern_recognition` + `pattern_contrast` are intentionally absent from every `capabilityTypes` array (per PR #65 Option D — `renderContracts.ts:43-103`). `validateCapability` returns `blocked` with reason `no_compatible_exercise_for_capability_type`. Resolved by a future follow-up that introduces dedicated `pattern_cloze` / `pattern_contrast_pair` ExerciseTypes with contract entries consuming `pattern_explanation:l1` + `pattern_example` artifacts.

- **`supportedSourceKinds` is `['item']` for every contract except `cloze`.** Codifies the runtime restriction at the contract layer. The 2026-05-21 lib/exercise-content fold widened `cloze.supportedSourceKinds` to `['item', 'dialogue_line']` (PR-B), so contextual_cloze caps with `sourceKind=dialogue_line` render through typed cloze. `cloze_mcq` stays item-only (its distractor pool is lesson-anchored; tracked as a follow-up). Caps with sourceKind in `{affixed_form_pair, pattern, podcast_*}` still cannot render through any current builder — adding source kinds is a one-file addition to `lib/exercise-content/adapter.ts`'s per-bucket dispatch plus a `supportedSourceKinds` widening here.

- **Exposure-only caps never enter spaced practice.** `isExposureOnly` returns true for `podcast_segment` / `podcast_phrase`; `validateCapability` short-circuits at line 53 before any source-kind / artifact checks.

- **The projector is the sole runtime gate for builder input shape.** Builders trust their inputs — no more `if (!input.X) return fail` guards for fields the contract guarantees. The single exception is content-quality guards (cloze-context `___` marker, payload-shape validation in authored variants, distractor cascade min count) — those remain in the builder bodies because they're not contract-provable.

- **`CAPABILITY_PROJECTION_VERSION` is fixed at `'capability-v3'`.** Bumped to v3 by Decision 3b (PR-1, ADR 0006). Bumping would invalidate every cached projection.

- **`itemSlug` is the SOLE slug derivation function.** Per PR #59. Divergent local implementations historically caused ~113 multi-word items to become unreachable.

- **Soft-retired caps are invisible at runtime (PR 1.5, 2026-05-22).** `learning_capabilities.retired_at` is a soft-deletion timestamp set by the capability-stage runner when a re-publish's emit set no longer contains a previously-active canonical_key. Every runtime read site filters `retired_at IS NULL` — verified at the DB layer by HC14 in `scripts/check-supabase-deep.ts` (a scheduler row with `next_due_at <= now()` pointing at a retired cap = bug). The retired row's `learner_capability_state` and `capability_review_events` children survive untouched, so re-emission of the same canonical_key (which sets `retired_at = NULL` via `upsertCapabilities`) restores FSRS state intact. See `scripts/lib/pipeline/capability-stage/adapter.ts:retireOrphanedCapabilities`.

---

## 5. Seams (to other modules)

### Upstream (data feeds the module)

- `learning_capabilities` table — capability catalog rows (~thousands when projected).
- `capability_artifacts` table — per-capability content blobs. Indexed into `ArtifactIndex` and consumed by `hasApprovedArtifact`.
- `learner_capability_state` table — per-learner FSRS state (ADR 0001). Read-only here; written server-side by the review processor.

### Downstream (the module feeds these)

- **`lib/session-builder/`** — `adapter.ts:299` calls `validateCapability` per row. `builder.ts:197` consumes the resulting `CapabilityReadiness` via `resolveCandidate`. See `docs/current-system/modules/session-builder.md`.
- **`lib/exercises/exerciseResolver.ts`** — calls `exerciseTypesForCapability` for the cap → exercise dispatch lookup. Trusts the validator's `readiness.allowedExercises`; does NOT replicate source-kind filtering.
- **`lib/exercises/builders/`** — 12 builders consume `BuilderInputFor<T>` types; the dispatcher at `builders/index.ts:50` runs `projectBuilderInput<T>()` before invoking each.
- **`lib/exercise-content/`** — sole runtime caller of `buildForExerciseType`. `resolver.ts` orchestrates; `adapter.ts` constructs `RawProjectorInput` inside `fetchForItemBlocks` (item bucket) and `fetchForDialogueLineBlocks` (dialogue_line bucket). See `docs/current-system/modules/exercise-content.md`.
- **`scripts/promote-capabilities.ts`, `scripts/check-capability-health.ts`** — call `validateCapability` for promotion + health-report generation.

### Sibling

- **`lib/exercises/resolutionReasons.ts`** — leaf module owning `ResolutionReasonCode`. Created in PR #65 to break what would otherwise be a circular import between `renderContracts.ts` and the runtime resolver. Re-exported from `lib/exercise-content/resolver.ts` for back-compat with `byType/types.ts`. PR-B of the 2026-05-21 fold added `dialogue_line_ref_unparseable` and `dialogue_line_artifact_missing` codes.

---

## 6. Known limitations and follow-ups

- **Pattern renderers missing.** `pattern_recognition` + `pattern_contrast` capabilities are blocked at validateCapability pending the introduction of `pattern_cloze` / `pattern_contrast_pair` ExerciseTypes with their own builders. Follow-up issue tracks this.

- **`affixed_form_pair` source kind not yet renderable.** `root_derived_*` capabilities (sourceKind `affixed_form_pair`) are correctly marked `blocked` at validateCapability because no current builder can render their source-kind. The next source-kind pilot will widen `cued_recall` + `typed_recall` to accept `affixed_form_pair` and add `fetchForAffixedFormPairBlocks` in `lib/exercise-content/adapter.ts`. The dialogue_line widening (2026-05-21 fold PR-B) is the template.

- **`cloze_mcq` is item-only.** Even though `contextual_cloze:dialogue_line` caps render via typed cloze, `cloze_mcq` stays `supportedSourceKinds: ['item']` because its distractor pool is lesson-anchored via `item_contexts.source_lesson_id`, and `fetchForDialogueLineBlocks` doesn't populate `poolItems`. Extending it requires either a lesson-anchored pool fetcher in the dialogue_line path or an authored-variant distractor route. Follow-up.

- **Legacy projection for lessons 1-3.** Documented in `capabilityTypes.ts:96` (the comment at the top of `CurrentContentSnapshot`). Lessons 1-3 still use a legacy bridge; lessons 4+ use the pipeline. Separate cleanup, not owned here.

- **Artifact-payload schema seam not contractualised.** The `hasConcreteArtifactPayload` per-kind shape requirements (used by `check-capability-health.ts`) live outside `RENDER_CONTRACTS`. Same shared-contract pattern applies; documented as a follow-up.

---

## 7. What this spec does NOT cover

- **Per-card rendering / React components.** Owned by `src/components/exercises/implementations/` (the 12 per-type renderers). See `docs/current-system/modules/experience.md` for the player's contract.

- **FSRS scheduling math.** Server-side, ADR 0003. Browser never computes FSRS; it reads `next_due_at` from `learner_capability_state`. The due-row filter that consumes that field lives in `src/lib/session-builder/dueFilter.ts` — see the session-builder module spec.

- **Answer commits.** Server-side Edge Function (`supabase/functions/commit-capability-answer-report/index.ts`), ADR 0004 (atomic review commits).

- **Lesson reader content.** Owned by `lib/lessons/`, see `docs/current-system/modules/lesson-renderer.md`.

- **The publish pipeline.** Stage A (lesson-stage) + Stage B (capability-stage) write the rows this module reads. See `docs/process/content-pipeline.md` and the stage-specific module specs.

- **Session orchestration.** Owned by `lib/session-builder/`. See `docs/current-system/modules/session-builder.md` for the planner/composer/budget flow.
