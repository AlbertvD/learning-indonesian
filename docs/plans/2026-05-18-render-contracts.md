---
status: implementing
implementation: PR #66
supersedes: []
---

# Shared Render Contract Between Capabilities Deep Module and Exercise Builders Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to drive this task-by-task.

**Goal:** Introduce a single `RENDER_CONTRACTS` table inside `src/lib/capabilities/` that becomes the source of truth for (a) which exercise types a capability is ready for, (b) which builder the resolver dispatches to, and (c) what inputs each builder is guaranteed to receive — so TypeScript catches the cloze-pattern bug class at compile time and the runtime `if (!input.X) return fail` guards in builders become unreachable and are deleted.

**Architecture:** Two parallel declarations live in `src/lib/capabilities/renderContracts.ts`, both keyed by `ExerciseType` with `satisfies` exhaustiveness checks. The runtime `RENDER_CONTRACTS: Record<ExerciseType, RenderContract>` map declares per-exercise `capabilityTypes[]`, `supportedSourceKinds[]`, `requiredArtifacts[]`. The compile-time `ContractInputShapes` interface declares the typed input shape per exercise. Both are wired together by a single `projectBuilderInput<T>()` function that performs all runtime guards once and returns a narrowed `BuilderInputFor<T>`. `validateCapability` derives `allowedExercises` from the contract via an inverted lookup; the duplicate `compatibleExercisesByCapability` map in `exerciseResolver.ts` disappears; each of the 12 builders takes `BuilderInputFor<'cloze'>` etc. as its input and TS guarantees the previously hand-checked fields are present.

**Tech Stack:** TypeScript, Vitest. Pure code refactor — no schema changes, no homelab redeploy needed mid-PR.

---

## Issue resolved

GitHub issue #65 — *Shared render contract between capabilities deep module and exercise builders*.

The bug surfaced as standard-mode sessions being 2-short of `preferredSessionSize`. Diagnosis (re-verified during plan-write):

1. `validateCapability` (`src/lib/capabilities/capabilityContracts.ts:73-118`) consults `exerciseByCapability[capabilityType]` (`capabilityContracts.ts:48-61`). For `pattern_recognition` this returns `['cloze']`. Combined with `requiredArtifactsFor` returning `['pattern_explanation:l1', 'pattern_example']` for pattern caps (lines 67-69), pattern_recognition capabilities with those artifacts present pass validation as `ready` with `allowedExercises: ['cloze']`.
2. Session builder includes these blocks in `SessionPlan.blocks`.
3. `capabilityContentService.resolveBlocks` (`src/services/capabilityContentService.ts:230-254`) decodes the canonical key. Pattern caps have `sourceKind === 'pattern'`. Line 240 rejects everything other than `'item'` with `reasonCode: 'unsupported_source_kind'` — the block never reaches `buildForExerciseType`.
4. Even if it did, `buildCloze` (`src/lib/exercises/builders/Cloze.ts:8`) would have rejected it via its `if (!input.learningItem)` guard.
5. `ExperiencePlayer.renderableBlocks` (`src/components/experience/ExperiencePlayer.tsx:71-80`) filters blocks whose `exerciseItem` is null — silently shortening the displayed session.

The bug class is **two layers disagreeing about a contract surface that lives in neither**:

- The deep module declares "pattern_recognition + pattern_explanation:l1 + pattern_example → ready for cloze".
- The runtime service (capabilityContentService) declares "I only render `item` source kinds today".
- The builder (Cloze) declares "I only accept inputs with a learningItem".

All three are correct in isolation. No layer can see the conflict because the contract surface is split. This PR collapses the three into one declaration in the deep module.

Same family as #59 (two callers disagreeing on slug shape — fixed by extracting `itemSlug`) and #61 (two writers disagreeing on column shape — fixed by dropping the denormalized column). Third instance of the "code agreement on a surface, hidden second contract that diverges" pattern.

**Evidence linking pattern caps to the user-visible "2-short session" symptom.** The diagnosis chain above proves the *mechanism* by which pattern caps drop. The *quantity* of caps that drop (and therefore the size of the shortness) is asserted in the issue but not independently verified here — the Task 1 Step 3 baseline queries quantify this against the live DB. The 2-short symptom may also include contributions from contextual_cloze and morphology caps (verified via the source-kind decision matrix above — all three populations are currently silently dropping at the same `capabilityContentService.ts:240` gate). The PR description's before/after table closes the loop by reporting actual flip counts.

## Required reading (executor must read before starting)

1. `gh issue view 65 -R AlbertvD/learning-indonesian` — the issue, including diagnosis chain, scope, and acceptance criteria.
2. **`src/lib/capabilities/capabilityContracts.ts`** (entire file, especially `exerciseByCapability` at lines 48-61, `requiredArtifactsFor` at lines 63-71, `validateCapability` at lines 73-118). The two contract surfaces being replaced.
3. **`src/lib/exercises/exerciseResolver.ts`** (entire file, 100 LOC). The duplicate `compatibleExercisesByCapability` map at lines 29-42 disappears after this refactor.
4. **`src/lib/exercises/builders/Cloze.ts`** (entire file, 43 LOC). Canonical example of an unstated input requirement. Same pattern in every other file under `src/lib/exercises/builders/`.
5. **`src/lib/exercises/builders/index.ts`** and **`src/lib/exercises/builders/types.ts`**. The `BUILDERS` registry and the shared `BuilderInput` type. The registry signature changes from `Record<ExerciseType, (input: BuilderInput) => BuilderResult>` to a per-exercise mapped type after the refactor.
6. **All 11 remaining builders** under `src/lib/exercises/builders/` (RecognitionMCQ, CuedRecall, TypedRecall, MeaningRecall, ListeningMCQ, Dictation, ClozeMcq, ContrastPair, SentenceTransformation, ConstrainedTranslation, Speaking). Each has its own runtime guard set. The per-builder matrix in §"Per-builder input requirements" below summarises them so the executor doesn't have to re-derive it.
7. **`src/services/capabilityContentService.ts:225-385`**. The sole caller of `buildForExerciseType`. Lines 332-376 are the dispatch point; the new `projectBuilderInput<T>()` projector slots in immediately before line 362.
8. **`src/components/experience/ExperiencePlayer.tsx:67-99`**. The filter that hides resolution failures. After this PR, blocks whose capability passed `validateCapability` should not be dropped here. The `registryMissCount` log path stays — it's a defensive net for ExerciseType vs. exercise-registry mismatches (different bug class).
9. **`src/lib/capabilities/capabilityTypes.ts`**. Declares `CapabilityType`, `CapabilitySourceKind`, `ArtifactKind` unions used by every contract entry.
10. **`docs/current-system/modules/session-builder.md`**. Spec for the sibling module that consumes `validateCapability`'s output via the adapter. Adjacent context; no edit needed.
11. **PR #63's plan** (`docs/plans/2026-05-17-drop-capability-key-refs.md`, status: shipped). Same author voice, similar scope, template for this PR's structure.
12. **CLAUDE.md** — module-spec freshness rule (need to create a new `capabilities` module spec as part of this PR — see Task 8); plan-status awareness; Supabase Requirements rule (N/A here, see §Supabase Requirements); the "Quality Over Speed" anti-shortcut block (read code before describing it, cite file:line).
13. **`src/__tests__/capabilityContracts.test.ts`** (entire file). Direct tests for `validateCapability`; will need updates because some current "ready" outcomes become "blocked" under the new contract (specifically pattern_recognition, pattern_contrast).
14. **`src/__tests__/morphologyCapabilityProjection.test.ts`** and **`src/__tests__/podcastCapabilityProjection.test.ts`**. Integration tests that exercise validateCapability through projection — verify each still passes after the rewrite or update the affected assertions.

## Pre-flight verification (run before starting)

```bash
# 1. Latest main, PR #63 (drop-capability-key-refs) merged
git log --oneline origin/main | head -5
# Should show: 3cdcc92 chore(agents): infrastructure update or later

# 2. HC8 + HC9 green
make check-supabase-deep 2>&1 | grep -E "HC8|HC9"

# 3. Full test suite green pre-refactor
bun run test 2>&1 | tail -5
# Expected: all green or only the known pre-existing audio-coverage failures
```

If anything is red, stop and investigate before starting the refactor — we want a clean baseline to compare against.

## Per-builder input requirements (matrix)

Derived from a full read of every file under `src/lib/exercises/builders/` (re-verified during architect review 2026-05-18). This matrix drives the `ContractInputShapes` interface and the `requiredArtifacts` column of `RENDER_CONTRACTS` in Task 2.

| Exercise type | learningItem | primaryMeaning (user lang) | clozeContext | activeVariant | distractors (≥3) | answerVariants | requiredArtifacts (matches builder reads) |
|---|---|---|---|---|---|---|---|
| `recognition_mcq` | required | required | — | — | required | — | `['base_text', 'meaning:l1']` |
| `cued_recall` | required | required | — | — | required | — | `['base_text', 'meaning:l1']` |
| `typed_recall` | required | required | — | — | — | optional (fuzzy match) | `['base_text', 'meaning:l1', 'accepted_answers:id']` |
| `meaning_recall` | required | required | — | — | — | — | `['meaning:l1', 'accepted_answers:l1']` |
| `listening_mcq` | required | required | — | — | required | — | `['audio_clip', 'meaning:l1']` |
| `dictation` | required | — | — | — | — | optional | `['audio_clip', 'base_text', 'accepted_answers:id']` |
| `cloze` | required | — | required | — | — | — | `['cloze_context', 'cloze_answer', 'translation:l1']` |
| `cloze_mcq` | required | optional (cascade degrades if absent) | required (runtime path only) — **nullable** | optional | required (runtime path only) | — | `['cloze_context', 'cloze_answer', 'translation:l1']` |
| `contrast_pair` | required | — | — | required (exercise_type must match) | — | — | `['exercise_variant']` |
| `sentence_transformation` | required | — | — | required | — | — | `['exercise_variant']` |
| `constrained_translation` | required | — | — | required | — | — | `['exercise_variant']` |
| `speaking` | required | — | — | optional (authored OR item-anchored fallback) | — | — | `['base_text']` |

**Observation 1 — all 12 builders require `learningItem`.** No builder accepts `learningItem === null`. This is the original bug surface: source kinds without a `learning_item` (`pattern`, `dialogue_line`, `affixed_form_pair`) cannot be rendered by any current builder.

**Observation 2 — per-entry `requiredArtifacts` audit against `src/lib/capabilities/capabilityCatalog.ts:46-217` and `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:160-189`.** Each row's `requiredArtifacts` list above is the union of (a) what the builder *actually reads* and (b) what the catalog *currently emits* for capabilities that route to this exercise. Specifically verified:
- `text_recognition` → `recognition_mcq`: catalog emits `['base_text', 'meaning:l1']` (line 64). Contract matches.
- `meaning_recall`: catalog emits `['meaning:l1', 'accepted_answers:l1']` (line 52). Contract matches.
- `l1_to_id_choice` + `form_recall` → `cued_recall`/`typed_recall`: catalog emits `['meaning:l1', 'base_text', 'accepted_answers:id']` for `form_recall` (line 54). Contract for `typed_recall` matches; `cued_recall` is the looser variant.
- `audio_recognition` → `listening_mcq`: catalog emits `['audio_clip', 'meaning:l1']` (line 115). Contract matches.
- `dictation`: catalog emits `['audio_clip', 'base_text', 'accepted_answers:id']` (line 127). Contract matches. **No silent weakening** — the contract preserves every artifact the catalog declares for this cap_type.
- `contextual_cloze` → `cloze`/`cloze_mcq`: vocab projector emits `['cloze_context', 'cloze_answer', 'translation:l1']` (line 188). Contract matches.
- `pattern_recognition`/`pattern_contrast`: catalog emits `['pattern_explanation:l1', 'pattern_example']` (lines 144, 159). No exercise routes to these — see §"Pattern decision" below. The catalog-declared artifacts are documented but unused by any contract row.
- `root_derived_recognition`/`root_derived_recall`: catalog emits `['root_derived_pair', 'allomorph_rule']` or `['root_derived_pair']` (lines 178-180). The old contract routed these to `typed_recall`/`cued_recall`; the new contract continues to do so, but with `supportedSourceKinds: ['item']` these caps become `blocked` at validateCapability (see "Source kind decision" below).

**Observation 3 — `supportedSourceKinds: ['item']` is the chosen contract for every entry.** This is **Option B from the architect-reviewed source-kind decision**: codify the current `capabilityContentService.ts:240-244` runtime restriction at the contract layer, with the result that capabilities whose source kind is not `'item'` are marked `blocked` by `validateCapability` instead of passing as `ready` and then silently dropping at the player. See "Source kind decision" below for the affected populations and follow-up tracking.

### Source kind decision (verified against code, 2026-05-18)

Verified by reading `src/lib/capabilities/capabilityCatalog.ts:46-217` and `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:160-189`:

| Capability type | Source kind emitted | Today's runtime path | Post-PR validator status |
|---|---|---|---|
| `text_recognition`, `meaning_recall`, `l1_to_id_choice`, `form_recall`, `audio_recognition`, `dictation` | `item` | ready → resolver → service → builder | unchanged (still ready) |
| `contextual_cloze` | `dialogue_line` | ready → resolver → service REJECTS at `:240` → dropped at player | **blocked** at validateCapability with `reason: 'no_compatible_exercise_for_capability_type'` |
| `pattern_recognition`, `pattern_contrast` | `pattern` | ready → resolver → service REJECTS at `:240` → dropped at player | **blocked** at validateCapability |
| `root_derived_recognition`, `root_derived_recall` | `affixed_form_pair` | ready → resolver → service REJECTS at `:240` → dropped at player | **blocked** at validateCapability |
| `podcast_gist` | `podcast_segment` | exposure_only short-circuits in `isExposureOnly` BEFORE source-kind check | unchanged (still exposure_only) |

The new contract collapses the three-layer disagreement into one declaration. The price: capabilities that were silently failing post-validation now correctly fail AT validation. The benefit: ExperiencePlayer's `renderableBlocks` filter has zero work to do for blocks that passed validation; "Oefening 1 van Y" matches `plan.blocks.length` exactly.

**Affected baseline counts (must be captured during Task 1 pre-flight via the snapshot files):**
- contextual_cloze caps with all artifacts: count via `select count(*) from indonesian.learning_capabilities where capability_type = 'contextual_cloze' and readiness_status = 'ready';`
- root_derived_* caps with all artifacts: same query for the two morphology cap_types.
- pattern_recognition + pattern_contrast caps: same.

Sum of these is the expected `ready → blocked` flip count. Record in PR description.

**Follow-up issues (filed in Task 11):**
- Build pattern-cloze + pattern-contrast renderers from pattern artifacts (covers `pattern_recognition` + `pattern_contrast`).
- Expand `capabilityContentService` to handle `dialogue_line` source kind (covers `contextual_cloze`).
- Expand `capabilityContentService` to handle `affixed_form_pair` source kind (covers `root_derived_*`).

The first two follow-ups are independent slices of the future `lib/exercise-content/` fold per `docs/target-architecture.md`.

### Tests that flip under the new contract

Enumerated against the current test suite (verified by reading each cited file):

| File | Line(s) | Pre-refactor expectation | Post-refactor expectation | Reason |
|---|---|---|---|---|
| `src/__tests__/capabilityContracts.test.ts` | (various assertions on contextual_cloze + morphology + pattern) | `status: 'ready'` for source kinds other than `item` | `status: 'blocked'`, `reason: 'no_compatible_exercise_for_capability_type'` | Source kind decision |
| `src/__tests__/morphologyCapabilityProjection.test.ts` | 69-83 | `validateCapability(root_derived_recall) = { status: 'ready', allowedExercises: ['typed_recall'] }` | `validateCapability(root_derived_recall) = { status: 'blocked', ... }` | sourceKind `affixed_form_pair` no longer supported |
| `src/__tests__/exerciseResolver.test.ts` | 146-168 | `resolveExercise` resolves podcast + morphology caps with synthetic ready readiness | **No change** — resolver does NOT filter by sourceKind (trusts the `readiness.allowedExercises` it receives) | See Task 4 design note |
| `src/__tests__/podcastCapabilityProjection.test.ts` | 46-95 | `exposure_only` (via `isExposureOnly`) | unchanged | exposure_only short-circuits before source-kind filter |

The resolver explicitly does NOT replicate the validator's source-kind filtering — see Task 4 Step 2 rationale. This decision (a) keeps existing resolver tests green, (b) avoids duplicating the contract gate at two layers (the very anti-pattern this PR exists to close), (c) makes the validator the sole runtime gate for cap → exercise eligibility.

### Cloze_mcq nullable clozeContext

The cloze_mcq builder has two paths (`src/lib/exercises/builders/ClozeMcq.ts`):
- **Authored path** (line 22): if a variant of `exercise_type === 'cloze_mcq'` exists, the builder reads `variant.payload_json.sentence` and ignores `input.contexts`. Returns ok without ever touching `clozeContext`.
- **Runtime path** (line 54): no variant → builder reads `contexts.find(c => c.context_type === 'cloze')`. Requires a cloze-typed context to be present.

**Contract**: `ContractInputShapes.cloze_mcq.clozeContext: ItemContext | null`. The projector populates it iff a cloze-typed context is found; both paths then work with the same typed input. The builder retains a runtime guard for the runtime path: `if (!input.variant && !input.clozeContext) return fail(malformed_cloze)`. The contract type DOES NOT lie — the field is honestly nullable. The projector's correctness invariant is: at least ONE of `variant` (with matching exercise_type) OR `clozeContext` is non-null, and the projector fails the input early if both are absent.

Also: cloze_mcq's runtime path calls `pickUserLangMeaning(input.meanings, ...)` for the distractor cascade's semantic-group filter (line 64). If absent, the cascade gracefully degrades. The contract does NOT mark `primaryMeaning` as required for cloze_mcq — the matrix above shows "optional (cascade degrades if absent)". The projector does not compute primaryMeaning for cloze_mcq.

### Pattern decision (Option D) — reversibility note

Option D blocks `pattern_recognition` + `pattern_contrast` at validateCapability by simply not listing them in any contract entry's `capabilityTypes[]`. Reversal — adding pattern renderers later — is **only easy if the follow-up adds NEW ExerciseTypes** (e.g. `pattern_cloze`, `pattern_contrast_pair`) whose contract entry declares `capabilityTypes: ['pattern_recognition']` and a new `BuilderInputFor<'pattern_cloze'>` shape consuming `pattern_explanation:l1` + `pattern_example` artifacts.

If a future PR instead **widens existing builders** (`cloze`, `contrast_pair`) to accept pattern-source caps, the `learningItem: LearningItem` non-nullness invariant in `BuilderInputFor<'cloze'>` breaks and the projector needs a discriminated-union rewrite. That widening is more work than introducing new ExerciseTypes; the follow-up issue should be filed against the "new ExerciseType" approach.

## Scope

### In scope

1. **New file `src/lib/capabilities/renderContracts.ts`** declaring:
   - The `RenderContract` interface (capability types served, source kinds supported, required artifacts).
   - `RENDER_CONTRACTS: Record<ExerciseType, RenderContract>` with one entry per `ExerciseType` (12 entries), wired with `satisfies` so adding an ExerciseType is a compile error until a contract is supplied.
   - The `ContractInputShapes` interface map declaring the typed input shape per exercise type.
   - `BuilderInputFor<T extends ExerciseType>` mapped type.
   - `projectBuilderInput<T>()` projector function: takes a "raw" input (the current `BuilderInput` shape) plus the target `ExerciseType`, validates against the contract, returns `{ ok: true; input: BuilderInputFor<T> }` or `{ ok: false; reasonCode; message; payloadSnapshot? }`.
   - Helper exports: `exerciseTypesForCapability(capabilityType): readonly ExerciseType[]` (inverted lookup for `validateCapability`), `requiredArtifactsFor(exerciseType): readonly ArtifactKind[]`, `supportsSourceKind(exerciseType, sourceKind): boolean`.

2. **Rewrite `validateCapability`** in `src/lib/capabilities/capabilityContracts.ts`:
   - `allowedExercises` derives from `exerciseTypesForCapability(capability.capabilityType)`, then filtered by `supportsSourceKind(et, capability.sourceKind)`.
   - Required artifacts come from the union of `requiredArtifactsFor(et)` for each allowed exercise (or, equivalently, the intersection if we want the looser policy; pick union — readiness gates on "any one exercise type can render this").
   - Delete `exerciseByCapability` (lines 48-61) and `requiredArtifactsFor` (lines 63-71). Move the union/intersection logic into the validator body or a tiny helper.

3. **Rewrite `exerciseResolver.ts`**:
   - Delete `compatibleExercisesByCapability` (lines 29-42).
   - `firstCompatibleExercise` calls `exerciseTypesForCapability(...).find(...)` against `input.readiness.allowedExercises`.
   - `requiredArtifacts` filter (lines 61-66) uses `requiredArtifactsFor(exerciseType)` instead of `input.capability.requiredArtifacts`.

4. **Migrate each builder** under `src/lib/exercises/builders/`:
   - Signature changes from `(input: BuilderInput) => BuilderResult` to `(input: BuilderInputFor<'<exerciseType>'>) => BuilderResult`.
   - Runtime guards for fields the contract guarantees are deleted (e.g. `if (!input.learningItem)`, `if (!primary)` for primary-meaning-required exercises, `if (!clozeContext)` for cloze).
   - Runtime guards for fields the contract does NOT guarantee stay (e.g. malformed-payload checks on `activeVariant.payload_json` shape — the contract guarantees the variant is present and of the right type, but not that the payload is well-formed).
   - `audibleTextFieldsOf` calls keep working unchanged.

5. **Migrate the dispatch site** in `src/services/capabilityContentService.ts:332-376`:
   - Build the raw input as today.
   - Call `projectBuilderInput(block.renderPlan.exerciseType, raw)`.
   - If `{ ok: false }`, propagate as a resolution failure with the projector's `reasonCode`.
   - If `{ ok: true }`, dispatch via the new strongly-typed `buildForExerciseType<K>(exerciseType, input)`.
   - The existing `'unsupported_source_kind'` rejection at line 240 stays — it's the same gate as `supportedSourceKinds` in the contract, but at the right layer for slug decoding.

6. **Pattern_recognition + pattern_contrast decision (Option D)**: declared at runtime via the contract — no exercise entry names `pattern_recognition` or `pattern_contrast` in its `capabilityTypes[]`. `validateCapability` therefore returns:
   - `{ status: 'blocked', missingArtifacts: [], reason: 'no_compatible_exercise_for_capability_type' }` for both.
   - Session builder filters these out (only `ready` capabilities enter the plan).
   - ExperiencePlayer's `renderableBlocks` filter has zero work to do for blocks that passed validation — the player drop is now a true defensive net for ExerciseType/registry mismatches, not a routine occurrence.
   - Filed as **follow-up issue**: "Build pattern-cloze + pattern-contrast renderers consuming `pattern_explanation:l1` / `pattern_example` / `minimal_pair` artifacts". Out of scope here.

7. **Tests**:
   - Unit-test `projectBuilderInput` for all 12 exercise types — happy path + each fail path (missing learningItem fails with `'item_not_found'`; missing cloze context fails with `'malformed_cloze'`; etc.). Goal: every old per-builder runtime guard is now exercised by a projector test.
   - Regression test for `validateCapability`: build a fixture for every `CapabilityType` (12 entries) and assert the readiness output matches the pre-refactor behaviour, with the documented exceptions (pattern_recognition + pattern_contrast become `blocked`; listening_mcq + dictation may flip to `blocked` for caps missing `audio_clip` — quantify in PR description).
   - Existing builder tests at `src/lib/exercises/builders/__tests__/builders.test.ts` (448 LOC) need adapting because the per-builder signatures change. Most tests build a fixture and pass it as `BuilderInput`; they'll need to construct `BuilderInputFor<'<type>'>` instead. This is mechanical.
   - Add one end-to-end test: take a fake `ProjectedCapability` with `sourceKind: 'pattern'` + `capabilityType: 'pattern_recognition'` + all artifacts present, run it through `validateCapability`, assert `{ status: 'blocked', reason: 'no_compatible_exercise_for_capability_type' }`.

8. **Module-spec creation**: there is no current module spec for `src/lib/capabilities/`. Per CLAUDE.md ("Any new top-level folder under `src/lib/` is a deep module — write its spec when the second non-trivial file lands"), this folder has been a deep module for some time. Create `docs/current-system/modules/capabilities.md` describing the public interface (`validateCapability`, `RENDER_CONTRACTS`, `getDueCapabilities`, `isExposureOnly`, `projectBuilderInput`, the artifact registry, the canonical-key encoder), internal flow, invariants, seams (upstream Supabase tables; downstream session-builder + capabilityContentService), and limitations. Use `docs/current-system/modules/session-builder.md` as the structural template. Mark `last_verified_against_code: 2026-05-18`, `status: stable`.

### Out of scope

- **Pattern-cloze + pattern-contrast renderers.** Tracked as a follow-up issue. Filed in Task 12.
- **Expanding `capabilityContentService` to handle non-item source kinds.** The contract codifies the current `supportedSourceKinds: ['item']` restriction; future fold work expands it.
- **The artifact-payload schema seam** — `hasConcreteArtifactPayload`'s per-kind shape requirements. Separate contract surface; same pattern applies in a follow-up.
- **Cross-stage write-ordering seams** (the publish pipeline's Stage A/B handoff from #61). Different bug class.
- **Refactoring the React exercise components** at `src/components/exercises/implementations/`. Downstream of the builder output; their typing tightens automatically as builder result types narrow.
- **No schema changes.** Pure TypeScript refactor.
- **No homelab redeploy mid-PR.** Only after merge.

### Deploy ordering

Pure frontend code change. Container rebuilds via GitHub Actions on merge to main. Manual container recreate on homelab per `docs/process/deploy.md`. No coordination with `make migrate` needed.

## Supabase Requirements

### Schema changes

- **N/A** — pure TypeScript refactor. No new tables, columns, RLS policies, or grants.

### homelab-configs changes

- [ ] PostgREST: N/A — no schema exposure changes.
- [ ] Kong: N/A — no CORS or origin changes.
- [ ] GoTrue: N/A — auth unchanged.
- [ ] Storage: N/A — no bucket changes.

### Health check additions

- **N/A** — no new schema invariants to assert. Existing HC8 (lesson_id non-null) and HC9 (capability ↔ item join) remain the relevant guards.
- After the refactor lands and the live container is rebuilt, run `make check-supabase-deep` and note how many caps are now `blocked` that were previously `ready` (specifically: pattern_recognition + pattern_contrast capabilities, plus any listening_mcq/dictation caps that lack `audio_clip` artifacts). Record the count in the PR description as a baseline for the pattern-rendering follow-up issue.

---

## Task 1 — Setup verification

**Step 1: Run pre-flight checks** per the pre-flight verification block above. Confirm HC8 + HC9 green and the full test suite green pre-refactor.

**Step 2: Confirm worktree.** This plan must execute on a `chore/render-contracts` branch in an isolated worktree (use `superpowers:using-git-worktrees`). Verify with `git branch --show-current`.

**Step 3: Snapshot current behaviour.**

Capture three reference outputs before any code change, for comparison after the refactor:

```bash
# 1. Tier-2 deep health (ready / blocked / exposure-only capability counts).
make check-supabase-deep 2>&1 | tee /tmp/render-contracts-baseline-deep.txt

# 2. validateCapability tests verbose output.
bun run test src/__tests__/capabilityContracts.test.ts -- --reporter=verbose 2>&1 | tee /tmp/render-contracts-baseline-validator.txt

# 3. Counts of caps that the new contract will flip from ready→blocked.
#    Run these against the live DB (openbrain MCP execute_sql or psql).
```

```sql
-- 3a. contextual_cloze caps currently ready (will flip to blocked)
SELECT count(*) FROM indonesian.learning_capabilities
WHERE capability_type = 'contextual_cloze' AND readiness_status = 'ready';

-- 3b. morphology caps currently ready (will flip to blocked)
SELECT capability_type, count(*) FROM indonesian.learning_capabilities
WHERE capability_type IN ('root_derived_recognition', 'root_derived_recall') AND readiness_status = 'ready'
GROUP BY capability_type;

-- 3c. pattern caps currently ready (will flip to blocked)
SELECT capability_type, count(*) FROM indonesian.learning_capabilities
WHERE capability_type IN ('pattern_recognition', 'pattern_contrast') AND readiness_status = 'ready'
GROUP BY capability_type;
```

Sum the three counts. Record in PR description as "Expected `ready → blocked` flip after PR" — these are the silently-failing caps that the new contract correctly surfaces as blocked.

**Step 4: Confirm legacy `BuilderInput` caller inventory.** Grep-verified 16 files:

```bash
grep -rln "BuilderInput[^F]" src/
```

Expected 16 files (verified 2026-05-18):
- `src/lib/exercises/builders/types.ts` (declaration)
- `src/lib/exercises/builders/index.ts` (registry + export)
- `src/lib/exercises/builders/__tests__/builders.test.ts`
- All 12 builders under `src/lib/exercises/builders/`
- `src/services/capabilityContentService.ts` (sole external consumer at line 15)

If grep returns 17+ files, stop and investigate the new caller — the migration scope assumes exactly these 16.

---

## Task 1.5 — Extract `ResolutionReasonCode` to a leaf module

**Why first**: Task 2's `renderContracts.ts` needs to import `ResolutionReasonCode` for the projector's fail-shape. The current declaration lives in `src/services/capabilityContentService.ts:20-34`. After Task 5, `capabilityContentService.ts` will import `projectBuilderInput` from `renderContracts.ts`. Without this extraction, we introduce a circular runtime-effective import (`type` imports erase but the dependency graph still tangles, and `dependency-cruiser`/`madge` flag it).

**Files:**
- Create: `src/lib/exercises/resolutionReasons.ts` (~20 LOC)
- Modify: `src/services/capabilityContentService.ts:20-34` — import `ResolutionReasonCode` from the leaf instead of declaring it locally; re-export it for back-compat with existing callers.

**Step 1: Create the leaf module.**

```typescript
// src/lib/exercises/resolutionReasons.ts
// Reason codes for capability → exercise resolution failures. Owned by the
// exercises module because every layer that participates in resolution
// (validator, resolver, projector, builder, capabilityContentService)
// imports them. Living at the leaf breaks the otherwise-circular import
// graph between renderContracts and capabilityContentService.

export type ResolutionReasonCode =
  // Source-ref / capability-shape problems
  | 'unsupported_source_kind'
  | 'sourceref_unparseable'
  | 'item_not_found'
  | 'item_inactive'
  // Content-data gaps
  | 'no_active_variant'
  | 'no_meaning_in_lang'
  | 'malformed_cloze'
  | 'malformed_payload'
  | 'no_distractor_candidates'
  | 'missing_required_artifact'
  // Defensive
  | 'unsupported_exercise_type'
  | 'block_failed_db_fetch'
```

**Step 2: Update `capabilityContentService.ts`.**

```typescript
// At top of file, replace the local declaration with:
export { type ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'
import type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'
```

The re-export preserves the public API so existing imports of `ResolutionReasonCode` from `@/services/capabilityContentService` keep working.

**Step 3: Run tests to confirm no breakage.**

```bash
bun run test src/services/__tests__/capabilityContentService.test.ts
bun run lint
```

Expected: both PASS — this is a pure refactor.

**Step 4: Commit.**

```bash
git add src/lib/exercises/resolutionReasons.ts src/services/capabilityContentService.ts
git commit -m "refactor(exercises): extract ResolutionReasonCode to leaf module (#65)"
```

---

## Task 2 — Create `src/lib/capabilities/renderContracts.ts`

**Files:**
- Create: `src/lib/capabilities/renderContracts.ts` (~250 LOC)
- Test: `src/lib/capabilities/__tests__/renderContracts.test.ts` (~250 LOC)

**Step 1: Write the failing test file first** (TDD).

```typescript
// src/lib/capabilities/__tests__/renderContracts.test.ts
import { describe, it, expect } from 'vitest'
import {
  RENDER_CONTRACTS,
  exerciseTypesForCapability,
  requiredArtifactsFor,
  supportsSourceKind,
  projectBuilderInput,
} from '../renderContracts'

describe('RENDER_CONTRACTS table', () => {
  it('has an entry for every ExerciseType', () => {
    // Exhaustiveness enforced via `satisfies Record<ExerciseType, RenderContract>`
    // in the source. This test asserts the runtime count matches.
    expect(Object.keys(RENDER_CONTRACTS)).toHaveLength(12)
  })

  it('every entry declares `supportedSourceKinds` non-empty', () => {
    for (const [et, contract] of Object.entries(RENDER_CONTRACTS)) {
      expect(contract.supportedSourceKinds.length).toBeGreaterThan(0)
    }
  })

  it('pattern_recognition is not named in any contract entry', () => {
    for (const contract of Object.values(RENDER_CONTRACTS)) {
      expect(contract.capabilityTypes).not.toContain('pattern_recognition')
    }
  })

  it('pattern_contrast is not named in any contract entry', () => {
    for (const contract of Object.values(RENDER_CONTRACTS)) {
      expect(contract.capabilityTypes).not.toContain('pattern_contrast')
    }
  })
})

describe('exerciseTypesForCapability', () => {
  it('returns ["recognition_mcq"] for text_recognition', () => {
    expect(exerciseTypesForCapability('text_recognition')).toEqual(['recognition_mcq'])
  })

  it('returns [] for pattern_recognition', () => {
    expect(exerciseTypesForCapability('pattern_recognition')).toEqual([])
  })

  it('returns [] for pattern_contrast', () => {
    expect(exerciseTypesForCapability('pattern_contrast')).toEqual([])
  })

  it('returns ["cloze", "cloze_mcq"] for contextual_cloze', () => {
    expect(exerciseTypesForCapability('contextual_cloze')).toEqual(
      expect.arrayContaining(['cloze', 'cloze_mcq']),
    )
  })
})

describe('supportsSourceKind', () => {
  it('cloze does not support source kind pattern', () => {
    expect(supportsSourceKind('cloze', 'pattern')).toBe(false)
  })

  it('every exercise supports source kind item', () => {
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      expect(supportsSourceKind(et, 'item')).toBe(true)
    }
  })
})

describe('requiredArtifactsFor', () => {
  it('cloze requires cloze_context + cloze_answer + translation:l1', () => {
    expect(requiredArtifactsFor('cloze')).toEqual(
      expect.arrayContaining(['cloze_context', 'cloze_answer', 'translation:l1']),
    )
  })

  it('listening_mcq requires audio_clip (latent bug fix)', () => {
    expect(requiredArtifactsFor('listening_mcq')).toContain('audio_clip')
  })

  it('dictation requires audio_clip (latent bug fix)', () => {
    expect(requiredArtifactsFor('dictation')).toContain('audio_clip')
  })
})

describe('projectBuilderInput', () => {
  // Detailed projector tests follow in Task 4. The minimal smoke test here
  // verifies the function exists and returns the right discriminant.
  it('fails closed when learningItem is null for cloze', () => {
    const raw = makeRawInput({ learningItem: null })
    const result = projectBuilderInput('cloze', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('item_not_found')
    }
  })

  it('succeeds for cloze when learningItem and cloze context are present', () => {
    const raw = makeRawInput({
      learningItem: { id: 'i1', base_text: 'makan', /* ... */ } as any,
      contexts: [{ id: 'c1', context_type: 'cloze', source_text: 'Saya ___ nasi', translation_text: 'I eat rice', learning_item_id: 'i1' } as any],
    })
    const result = projectBuilderInput('cloze', raw)
    expect(result.ok).toBe(true)
  })
})

// Shared test fixture builder
function makeRawInput(overrides: Partial<import('../renderContracts').RawProjectorInput> = {}): import('../renderContracts').RawProjectorInput {
  return {
    learningItem: null,
    meanings: [],
    contexts: [],
    answerVariants: [],
    variant: null,
    artifactsByKind: new Map(),
    poolItems: [],
    poolMeaningsByItem: new Map(),
    userLanguage: 'nl',
    ...overrides,
  }
}
```

**Step 2: Run the test to verify it fails.**

```bash
bun run test src/lib/capabilities/__tests__/renderContracts.test.ts
```

Expected: FAIL — `renderContracts` module not found.

**Step 3: Write the minimum implementation to make the tests pass.**

Create `src/lib/capabilities/renderContracts.ts`:

```typescript
// Shared render contract between the capabilities deep module and the
// exercise builders. This file is the SOLE source of truth for:
//   (a) Which exercise types each capability type is ready for.
//   (b) Which builder the resolver dispatches to.
//   (c) What inputs each builder is guaranteed to receive.
//
// See docs/plans/2026-05-18-render-contracts.md and
// docs/current-system/modules/capabilities.md.

import type { ExerciseType, LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant } from '@/types/learning'
import type { ArtifactKind, CapabilityType, CapabilitySourceKind } from './capabilityTypes'
import type { CapabilityArtifact } from './artifactRegistry'
// ResolutionReasonCode lives in @/lib/exercises/resolutionReasons (a leaf
// module created in Task 1.5) — importing from @/services/capabilityContent
// Service here would close a circular dependency, since the service will
// import projectBuilderInput from this file in Task 5.
import type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'
import type { SessionBlock } from '@/lib/session-builder'

// ─── Runtime contract ──────────────────────────────────────────────────────

/**
 * A render contract declares the agreement between a capability projection
 * and an exercise builder for one ExerciseType. validateCapability consults
 * this to decide readiness; the resolver consults it to dispatch; the
 * projector consults it to narrow the typed input handed to the builder.
 */
export interface RenderContract {
  /** Which capability types this exercise serves. */
  capabilityTypes: readonly CapabilityType[]
  /** Which source kinds the exercise can render from. Today every entry is
   *  ['item'] because capabilityContentService only handles item source
   *  kinds (see src/services/capabilityContentService.ts:240). Future fold
   *  work expands this. */
  supportedSourceKinds: readonly CapabilitySourceKind[]
  /** Artifacts that must be present + approved for the exercise to render. */
  requiredArtifacts: readonly ArtifactKind[]
}

export const RENDER_CONTRACTS = {
  recognition_mcq: {
    capabilityTypes: ['text_recognition'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['base_text', 'meaning:l1'],
  },
  cued_recall: {
    capabilityTypes: ['l1_to_id_choice', 'form_recall', 'root_derived_recognition', 'root_derived_recall'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['base_text', 'meaning:l1'],
  },
  typed_recall: {
    capabilityTypes: ['form_recall', 'root_derived_recognition', 'root_derived_recall'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['base_text', 'meaning:l1', 'accepted_answers:id'],
  },
  meaning_recall: {
    capabilityTypes: ['meaning_recall'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
  },
  listening_mcq: {
    capabilityTypes: ['audio_recognition', 'podcast_gist'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['audio_clip', 'meaning:l1'],
  },
  dictation: {
    capabilityTypes: ['dictation'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['audio_clip', 'base_text', 'accepted_answers:id'],
  },
  cloze: {
    capabilityTypes: ['contextual_cloze'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
  },
  cloze_mcq: {
    capabilityTypes: ['contextual_cloze'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
  },
  contrast_pair: {
    // pattern_contrast is intentionally absent — see plan §"Pattern decision".
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['exercise_variant'],
  },
  sentence_transformation: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['exercise_variant'],
  },
  constrained_translation: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['exercise_variant'],
  },
  speaking: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['base_text'],
  },
} as const satisfies Record<ExerciseType, RenderContract>

// ─── Inverted-lookup helpers (consumed by validateCapability + resolver) ───

export function exerciseTypesForCapability(capabilityType: CapabilityType): readonly ExerciseType[] {
  return (Object.entries(RENDER_CONTRACTS) as Array<[ExerciseType, RenderContract]>)
    .filter(([, c]) => c.capabilityTypes.includes(capabilityType))
    .map(([et]) => et)
}

export function requiredArtifactsFor(exerciseType: ExerciseType): readonly ArtifactKind[] {
  return RENDER_CONTRACTS[exerciseType].requiredArtifacts
}

export function supportsSourceKind(exerciseType: ExerciseType, sourceKind: CapabilitySourceKind): boolean {
  return RENDER_CONTRACTS[exerciseType].supportedSourceKinds.includes(sourceKind)
}

// ─── Compile-time builder input shapes ─────────────────────────────────────

/**
 * The raw input the dispatcher (capabilityContentService) constructs before
 * projection. The projector narrows this to BuilderInputFor<K> for a
 * specific exercise type, or returns a fail.
 *
 * Shape is intentionally identical to the legacy BuilderInput type so the
 * dispatch site remains a single object construction.
 */
export interface RawProjectorInput {
  block?: SessionBlock
  learningItem: LearningItem | null
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  variant: ExerciseVariant | null
  artifactsByKind: Map<ArtifactKind, CapabilityArtifact>
  poolItems: LearningItem[]
  poolMeaningsByItem: Map<string, ItemMeaning[]>
  userLanguage: 'nl' | 'en'
}

/** Common-base fields every builder receives. */
interface BuilderBase {
  block?: SessionBlock
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  artifactsByKind: Map<ArtifactKind, CapabilityArtifact>
  poolItems: LearningItem[]
  poolMeaningsByItem: Map<string, ItemMeaning[]>
  userLanguage: 'nl' | 'en'
}

/**
 * Per-exercise input shape. Adding an ExerciseType without a corresponding
 * entry here is a compile error (enforced by `satisfies` on the value
 * `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK` below).
 */
export interface ContractInputShapes {
  recognition_mcq: BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  cued_recall:     BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  typed_recall:    BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  meaning_recall:  BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  listening_mcq:   BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  dictation:       BuilderBase & { learningItem: LearningItem }
  cloze:           BuilderBase & { learningItem: LearningItem; clozeContext: ItemContext }
  // cloze_mcq has two paths; the contract is honest about the nullable cloze context.
  // Authored path: variant.exercise_type === 'cloze_mcq' → builder reads variant.payload_json.
  // Runtime path: variant absent or different type → builder reads clozeContext (must be non-null).
  // Projector invariant: at least one of `variant (matching type)` OR `clozeContext` is non-null.
  cloze_mcq:       BuilderBase & { learningItem: LearningItem; clozeContext: ItemContext | null; variant: ExerciseVariant | null }
  contrast_pair:   BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
  sentence_transformation: BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
  constrained_translation: BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
  speaking:        BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant | null }
}

// Exhaustiveness check: this line fails compilation if a new ExerciseType is
// added without a corresponding ContractInputShapes entry.
const _CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK = {} as ContractInputShapes satisfies Record<ExerciseType, unknown>

export type BuilderInputFor<T extends ExerciseType> = ContractInputShapes[T]

// ─── Projector ─────────────────────────────────────────────────────────────

/** Discriminated-union result from projectBuilderInput. */
export type ProjectorResult<T extends ExerciseType> =
  | { ok: true; input: BuilderInputFor<T> }
  | { ok: false; reasonCode: ResolutionReasonCode; message: string; payloadSnapshot?: unknown }

/**
 * Validate a raw projector input against the contract for `exerciseType` and
 * return a narrowed BuilderInputFor<T>. Performs every runtime guard that
 * used to live in individual builders' bodies (`if (!input.learningItem)`,
 * `if (!primary)`, etc.). After this returns ok, the builder is statically
 * guaranteed that every field it needs is non-null.
 */
export function projectBuilderInput<T extends ExerciseType>(
  exerciseType: T,
  raw: RawProjectorInput,
): ProjectorResult<T> {
  // Every builder requires a learningItem (matrix verified 2026-05-18).
  if (!raw.learningItem) {
    return {
      ok: false,
      reasonCode: 'item_not_found',
      message: `${exerciseType} requires a learningItem`,
    }
  }

  const learningItem = raw.learningItem

  // Builders that need a user-language meaning.
  const needsPrimaryMeaning: ReadonlySet<ExerciseType> = new Set([
    'recognition_mcq', 'cued_recall', 'typed_recall', 'meaning_recall', 'listening_mcq',
  ])
  let primaryMeaning: ItemMeaning | undefined
  if (needsPrimaryMeaning.has(exerciseType)) {
    primaryMeaning = raw.meanings.find(m => m.translation_language === raw.userLanguage && m.is_primary)
      ?? raw.meanings.find(m => m.translation_language === raw.userLanguage)
    if (!primaryMeaning) {
      return {
        ok: false,
        reasonCode: 'no_meaning_in_lang',
        message: `no ${raw.userLanguage} meaning for item ${learningItem.id}`,
        payloadSnapshot: { learningItemId: learningItem.id, userLanguage: raw.userLanguage },
      }
    }
  }

  // Builders that need a cloze-typed context.
  //   cloze: hard-required (no fallback path).
  //   cloze_mcq: at least ONE of clozeContext OR a matching authored variant is required;
  //              the field is nullable in the typed shape and the builder branches.
  let clozeContext: ItemContext | null = null
  if (exerciseType === 'cloze') {
    clozeContext = raw.contexts.find(c => c.context_type === 'cloze') ?? null
    if (!clozeContext) {
      return {
        ok: false,
        reasonCode: 'malformed_cloze',
        message: `no cloze context for item ${learningItem.id}`,
        payloadSnapshot: { learningItemId: learningItem.id, contextCount: raw.contexts.length },
      }
    }
  }
  if (exerciseType === 'cloze_mcq') {
    clozeContext = raw.contexts.find(c => c.context_type === 'cloze') ?? null
    const hasAuthoredVariant = raw.variant != null && raw.variant.exercise_type === 'cloze_mcq'
    if (!clozeContext && !hasAuthoredVariant) {
      return {
        ok: false,
        reasonCode: 'malformed_cloze',
        message: `no cloze context and no authored cloze_mcq variant for item ${learningItem.id}`,
        payloadSnapshot: { learningItemId: learningItem.id, contextCount: raw.contexts.length, hasVariant: raw.variant != null },
      }
    }
  }

  // Builders that require an exact-match active variant.
  const needsActiveVariant: ReadonlySet<ExerciseType> = new Set([
    'contrast_pair', 'sentence_transformation', 'constrained_translation',
  ])
  if (needsActiveVariant.has(exerciseType)) {
    if (!raw.variant || raw.variant.exercise_type !== exerciseType) {
      return {
        ok: false,
        reasonCode: 'no_active_variant',
        message: `no active ${exerciseType} variant for item ${learningItem.id}`,
        payloadSnapshot: { learningItemId: learningItem.id },
      }
    }
  }

  const base = {
    block: raw.block,
    meanings: raw.meanings,
    contexts: raw.contexts,
    answerVariants: raw.answerVariants,
    artifactsByKind: raw.artifactsByKind,
    poolItems: raw.poolItems,
    poolMeaningsByItem: raw.poolMeaningsByItem,
    userLanguage: raw.userLanguage,
    learningItem,
  }
  // Per-exercise narrowing.
  switch (exerciseType) {
    case 'cloze':
      return { ok: true, input: { ...base, clozeContext: clozeContext! } as BuilderInputFor<T> }
    case 'cloze_mcq':
      // clozeContext is honestly nullable here — the projector has already
      // proven that either it OR the variant is present.
      return { ok: true, input: { ...base, clozeContext, variant: raw.variant } as BuilderInputFor<T> }
    case 'contrast_pair':
    case 'sentence_transformation':
    case 'constrained_translation':
      return { ok: true, input: { ...base, variant: raw.variant! } as BuilderInputFor<T> }
    case 'speaking':
      return { ok: true, input: { ...base, variant: raw.variant } as BuilderInputFor<T> }
    case 'recognition_mcq':
    case 'cued_recall':
    case 'typed_recall':
    case 'meaning_recall':
    case 'listening_mcq':
      return { ok: true, input: { ...base, primaryMeaning: primaryMeaning! } as BuilderInputFor<T> }
    case 'dictation':
      return { ok: true, input: base as BuilderInputFor<T> }
    default: {
      // Exhaustiveness check
      const _exhaustive: never = exerciseType
      return _exhaustive
    }
  }
}
```

**Step 4: Run the test to verify it passes.**

```bash
bun run test src/lib/capabilities/__tests__/renderContracts.test.ts
```

Expected: PASS for all the tests in Step 1.

**Step 5: Commit.**

```bash
git add src/lib/capabilities/renderContracts.ts src/lib/capabilities/__tests__/renderContracts.test.ts
git commit -m "feat(capabilities): introduce RENDER_CONTRACTS shared contract (#65)"
```

---

## Task 3 — Rewrite `validateCapability` to consume `RENDER_CONTRACTS`

**Files:**
- Modify: `src/lib/capabilities/capabilityContracts.ts` — delete `exerciseByCapability` (lines 48-61), delete `requiredArtifactsFor` (lines 63-71), rewrite `validateCapability` (lines 73-118) to use `exerciseTypesForCapability` + `requiredArtifactsFor` + `supportsSourceKind`.
- Modify: `src/__tests__/capabilityContracts.test.ts` — update test fixtures that asserted pattern_recognition/pattern_contrast were ready; add new assertions for the blocked-with-reason output.

**Step 1: Build the per-cap-type fixture matrix** (the regression target).

The 12 `CapabilityType` values × the source kinds the catalog actually emits → post-refactor expected readiness. Use this matrix to (a) update the existing capabilityContracts tests, (b) author the new "regression" suite that anchors validateCapability behaviour for every cap_type. Source-of-truth for each row is the matching catalog line, cited.

| capabilityType | sourceKind (catalog) | catalog requiredArtifacts | All artifacts approved? | Post-refactor readiness |
|---|---|---|---|---|
| `text_recognition` | `item` (capabilityCatalog.ts:57) | `['base_text', 'meaning:l1']` (line 51) | yes | `ready`, allowedExercises: `['recognition_mcq']` |
| `text_recognition` | `item` | same | no (missing meaning:l1) | `blocked`, missingArtifacts: `['meaning:l1']` |
| `l1_to_id_choice` | `item` (line 69) | `['meaning:l1', 'base_text']` (line 53) | yes | `ready`, allowedExercises: `['cued_recall']` |
| `meaning_recall` | `item` (line 82) | `['meaning:l1', 'accepted_answers:l1']` (line 52) | yes | `ready`, allowedExercises: `['meaning_recall']` |
| `form_recall` | `item` (line 94) | `['meaning:l1', 'base_text', 'accepted_answers:id']` (line 54) | yes | `ready`, allowedExercises: `['cued_recall', 'typed_recall']` |
| `audio_recognition` | `item` (line 108) | `['audio_clip', 'meaning:l1']` (line 115) | yes | `ready`, allowedExercises: `['listening_mcq']` |
| `dictation` | `item` (line 120) | `['audio_clip', 'base_text', 'accepted_answers:id']` (line 127) | yes | `ready`, allowedExercises: `['dictation']` |
| `pattern_recognition` | `pattern` (line 137) | `['pattern_explanation:l1', 'pattern_example']` (line 144) | yes | **`blocked`**, reason: `'no_compatible_exercise_for_capability_type'` |
| `pattern_contrast` | `pattern` (line 152) | same (line 159) | yes | **`blocked`**, same reason |
| `contextual_cloze` | `dialogue_line` (vocab.ts:171) | `['cloze_context', 'cloze_answer', 'translation:l1']` (vocab.ts:188) | yes | **`blocked`**, reason: `'no_compatible_exercise_for_capability_type'` |
| `podcast_gist` | `podcast_segment` | (podcast-stage projector) | n/a | `exposure_only` (short-circuit in `isExposureOnly`) |
| `root_derived_recognition` | `affixed_form_pair` (line 182) | `['root_derived_pair', 'allomorph_rule']` (line 178) | yes | **`blocked`**, reason: `'no_compatible_exercise_for_capability_type'` |
| `root_derived_recall` | `affixed_form_pair` (line 195) | same | yes | **`blocked`**, reason: same |

The rows in **bold** are behavior changes vs. pre-refactor — capabilities that used to validate as `ready` and then silently fail downstream now correctly fail at the validator.

**Step 2: Update existing tests in `src/__tests__/capabilityContracts.test.ts`** to match the new expected readiness for the bold rows. Use the matrix above as the assertion source.

For tests whose pre-refactor expectation was `ready` for a now-bold cap_type, update to:

```typescript
expect(result.status).toBe('blocked')
if (result.status === 'blocked') {
  expect(result.reason).toMatch(/no_compatible_exercise_for_capability_type/)
  expect(result.missingArtifacts).toEqual([])
}
```

**Step 3: Update `src/__tests__/morphologyCapabilityProjection.test.ts:63-83`** (the full test body, both assertions).

The current test has the structure:
```typescript
const readiness = validateCapability({ capability: recall, artifacts: artifactIndex })
expect(readiness).toEqual({ status: 'ready', allowedExercises: ['typed_recall'] })
expect(resolveExercise({ capability: recall, readiness, artifactIndex })).toEqual(expect.objectContaining({
  status: 'resolved',
  plan: expect.objectContaining({ exerciseType: 'typed_recall', capabilityType: 'root_derived_recall' }),
}))
```

After the refactor, `readiness.status === 'blocked'` for morphology caps (sourceKind `affixed_form_pair` not in any contract's supportedSourceKinds). `resolveExercise` therefore returns `{ status: 'failed', reason: 'capability_not_ready' }`. Both assertions must be rewritten — the test as a whole shifts from "morphology is fully scheduleable" to "morphology is correctly gated pending renderer support":

```typescript
it('blocks morphology readiness until a renderer for affixed_form_pair source kinds ships', () => {
  const recall = projectCapabilities(snapshot).capabilities.find(capability => capability.capabilityType === 'root_derived_recall')!
  const artifactIndex = {
    root_derived_pair: [{ qualityStatus: 'approved' as const, sourceRef: pairSourceRef }],
    allomorph_rule: [{ qualityStatus: 'approved' as const, sourceRef: pairSourceRef }],
  }
  const readiness = validateCapability({ capability: recall, artifacts: artifactIndex })
  expect(readiness.status).toBe('blocked')
  if (readiness.status === 'blocked') {
    expect(readiness.reason).toMatch(/no_compatible_exercise_for_capability_type/)
  }
  // resolveExercise with a blocked readiness returns capability_not_ready —
  // the test's prior assertion that morphology resolves to typed_recall has
  // been retired as part of the source-kind gating decision (see plan §"Source
  // kind decision"). When a future PR ships the affixed_form_pair renderer,
  // restore the resolved-plan assertion against the new contract entry.
  const resolution = resolveExercise({ capability: recall, readiness, artifactIndex })
  expect(resolution).toEqual({
    status: 'failed',
    reason: 'capability_not_ready',
    details: 'Capability readiness is blocked',
  })
})
```

Rename the test (`'keeps morphology readiness artifact-based and exercise-resolvable'` → `'blocks morphology readiness until a renderer for affixed_form_pair source kinds ships'`) so the test title doesn't lie about what's being asserted.

**Step 4: Verify `src/__tests__/podcastCapabilityProjection.test.ts` is unaffected.**

```bash
bun run test src/__tests__/podcastCapabilityProjection.test.ts
```

Expected: PASS unchanged — podcast caps short-circuit via `isExposureOnly` before the source-kind check.

**Step 5: Verify `src/__tests__/exerciseResolver.test.ts:146-168` is unaffected.**

```bash
bun run test src/__tests__/exerciseResolver.test.ts
```

Expected: PASS unchanged — the resolver does NOT filter by sourceKind (see Task 4 design note); the tests pass synthetic `allowedExercises` directly and the resolver picks correctly.

**Step 6: Add a new regression-suite file** that walks the matrix above and asserts every cap_type produces the expected readiness. Place at `src/__tests__/renderContractsValidatorMatrix.test.ts` (~200 LOC). The matrix iteration ensures any future ExerciseType / CapabilityType addition fails loudly if its readiness expectation isn't authored.

**Note on the contextual_cloze test fixture** at `src/__tests__/capabilityContracts.test.ts:70-88`: this fixture uses `sourceKind: 'item'` (inherited from a `baseCapability` constant). Under the new contract, `cloze` and `cloze_mcq` both list `'item'` in `supportedSourceKinds`, so this specific fixture stays valid — its readiness only depends on artifact presence (`cloze_context`, `cloze_answer`, `translation:l1`). It is NOT one of the bold rows in the matrix; leave its assertion as-is unless it specifically tests artifact-missing behavior. Production `contextual_cloze` capabilities have `sourceKind: 'dialogue_line'` per `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:171` — those are the ones that flip to `blocked`, not this synthetic test fixture.

Add new tests:

```typescript
it('marks pattern_recognition as blocked (no compatible exercise)', () => {
  const result = validateCapability({
    capability: makePatternRecognitionCapability(),  // helper: sourceKind=pattern, all artifacts present
    artifacts: makeAllArtifacts(),
  })
  expect(result.status).toBe('blocked')
  if (result.status === 'blocked') {
    expect(result.reason).toMatch(/no_compatible_exercise_for_capability_type/)
  }
})

it('marks pattern_contrast as blocked (no compatible exercise)', () => {
  const result = validateCapability({
    capability: makePatternContrastCapability(),
    artifacts: makeAllArtifacts(),
  })
  expect(result.status).toBe('blocked')
})

it('filters allowedExercises by supportedSourceKinds', () => {
  // A text_recognition cap with sourceKind=dialogue_line should be blocked
  // because no exercise's supportedSourceKinds today includes dialogue_line.
  const result = validateCapability({
    capability: { ...makeTextRecognitionCapability(), sourceKind: 'dialogue_line' },
    artifacts: makeAllArtifacts(),
  })
  expect(result.status).toBe('blocked')
})
```

**Step 7: Run tests to verify the matrix assertions fail** (against the pre-rewrite validator).

```bash
bun run test src/__tests__/capabilityContracts.test.ts src/__tests__/renderContractsValidatorMatrix.test.ts src/__tests__/morphologyCapabilityProjection.test.ts
```

Expected: every new "blocked" assertion FAILS because `validateCapability` still consults the deleted `exerciseByCapability` map.

**Step 8: Rewrite `validateCapability` body.**

Edit `src/lib/capabilities/capabilityContracts.ts`:

```typescript
import {
  exerciseTypesForCapability,
  requiredArtifactsFor as artifactsForExercise,
  supportsSourceKind,
} from './renderContracts'

// Delete: const exerciseByCapability = {...}
// Delete: function requiredArtifactsFor(capability) {...}

export function validateCapability(input: CapabilityValidationInput): CapabilityReadiness {
  if (isExposureOnly(input.capability)) {
    return { status: 'exposure_only', reason: 'Capability is exposure-only and cannot be scheduled for review.' }
  }
  if (input.readinessOverride === 'exposure_only') {
    return { status: 'exposure_only', reason: 'Capability is exposure-only and cannot be scheduled for review.' }
  }
  if (input.readinessOverride === 'deprecated') {
    return { status: 'deprecated', replacementKey: input.replacementKey }
  }
  if (input.readinessOverride === 'unknown') {
    return { status: 'unknown', reason: 'Capability readiness is unknown and fails closed.' }
  }

  // Inverted lookup: which exercise types serve this capability type AND
  // support its source kind?
  const candidateExercises = exerciseTypesForCapability(input.capability.capabilityType)
    .filter(et => supportsSourceKind(et, input.capability.sourceKind))

  if (candidateExercises.length === 0) {
    return {
      status: 'blocked',
      missingArtifacts: [],
      reason: 'no_compatible_exercise_for_capability_type',
    }
  }

  // An exercise is render-ready if the union of (a) its contract-declared
  // required artifacts and (b) the capability's catalog-declared required
  // artifacts are all approved.
  //
  // Why both: the contract declares what the BUILDER reads; the catalog
  // declares what the CAP_TYPE needs (which may be stricter for certain
  // cap_types served by a looser builder — e.g. typed_recall serves both
  // form_recall (needs accepted_answers:id) and root_derived_recall (needs
  // root_derived_pair). The contract holds the builder's strict minimum;
  // capability.requiredArtifacts holds the cap-type's additional asks.
  const checkArtifact = (kind: ArtifactKind) => hasApprovedArtifact({
    index: input.artifacts,
    kind,
    capabilityKey: input.capability.canonicalKey,
    sourceRef: input.capability.sourceRef,
  })

  const readyExercises = candidateExercises.filter(et => {
    const required = new Set<ArtifactKind>([
      ...artifactsForExercise(et),
      ...input.capability.requiredArtifacts,
    ])
    return [...required].every(checkArtifact)
  })

  if (readyExercises.length === 0) {
    // Report the union of missing artifacts across all candidate exercises;
    // gives downstream visibility into the gap.
    const missing = new Set<ArtifactKind>()
    for (const et of candidateExercises) {
      const required = new Set<ArtifactKind>([
        ...artifactsForExercise(et),
        ...input.capability.requiredArtifacts,
      ])
      for (const kind of required) if (!checkArtifact(kind)) missing.add(kind)
    }
    return {
      status: 'blocked',
      missingArtifacts: Array.from(missing),
      reason: `Missing approved artifacts: ${Array.from(missing).join(', ')}`,
    }
  }

  const availableExercises = readyExercises.filter(kind => input.exerciseAvailability?.[kind] !== false)
  if (availableExercises.length === 0) {
    return {
      status: 'blocked',
      missingArtifacts: [],
      reason: 'No available exercise family for ready capability',
    }
  }

  return {
    status: 'ready',
    allowedExercises: availableExercises,
  }
}
```

**Step 9: Run tests to verify they pass.**

```bash
bun run test src/__tests__/capabilityContracts.test.ts
bun run test src/__tests__/renderContractsValidatorMatrix.test.ts
bun run test src/__tests__/morphologyCapabilityProjection.test.ts
bun run test src/__tests__/podcastCapabilityProjection.test.ts
```

Expected: all PASS.

**Step 10: Commit.**

```bash
git add src/lib/capabilities/capabilityContracts.ts src/__tests__/capabilityContracts.test.ts src/__tests__/renderContractsValidatorMatrix.test.ts src/__tests__/morphologyCapabilityProjection.test.ts
git commit -m "feat(capabilities): rewrite validateCapability to consume RENDER_CONTRACTS (#65)"
```

---

## Task 4 — Rewrite `exerciseResolver.ts` to consume `RENDER_CONTRACTS`

**Files:**
- Modify: `src/lib/exercises/exerciseResolver.ts` — delete `compatibleExercisesByCapability` (lines 29-42); rewrite `firstCompatibleExercise` (lines 44-50); rewrite the artifact-filter loop (lines 61-66) to use `requiredArtifactsFor`.

**Design note: resolver does NOT filter by sourceKind.** This is deliberate. The validator (Task 3) is the *sole* runtime gate for "capability is eligible for an exercise." The resolver trusts the `readiness.allowedExercises` array it receives — that array already reflects the source-kind filtering done at the validator layer. If a future caller passes a hand-built `readiness` object with `allowedExercises` that contradict the contract, the resolver's job is to pick from what it was given, not to second-guess the validator.

This avoids the very anti-pattern this PR exists to close (two layers gating on the same thing, then disagreeing). It also keeps the existing `src/__tests__/exerciseResolver.test.ts:146-168` green — those tests pass synthetic `allowedExercises` directly to bypass the validator and assert that the resolver picks correctly.

**Step 1: Read the existing resolver tests** to confirm their existing behavior is preserved.

```bash
grep -rn "resolveExercise\|firstCompatibleExercise" src/ --include="*.test.*" | head -10
bun run test src/__tests__/exerciseResolver.test.ts
```

Capture baseline output. Should be all green pre-refactor.

**Step 2: Rewrite the resolver.**

```typescript
// src/lib/exercises/exerciseResolver.ts (after rewrite)
import type { ArtifactKind, ProjectedCapability } from '../capabilities/capabilityTypes'
import { hasApprovedArtifact, type ArtifactIndex } from '../capabilities/artifactRegistry'
import type { CapabilityReadiness } from '../capabilities/capabilityContracts'
import { exerciseTypesForCapability } from '../capabilities/renderContracts'
import type { ExerciseRenderPlan } from './exerciseRenderPlan'
import type { ExerciseType } from '../../types/learning'

export type ExerciseResolutionFailureReason =
  | 'capability_not_ready'
  | 'missing_required_artifact'
  | 'no_supported_exercise_family'
  | 'fallback_blocked'
  | 'device_constraints_blocked'

export type ExerciseResolutionResult =
  | { status: 'resolved'; plan: ExerciseRenderPlan }
  | {
      status: 'failed'
      reason: ExerciseResolutionFailureReason
      details: string
      missingArtifacts?: ArtifactKind[]
    }

export interface ExerciseResolutionInput {
  capability: ProjectedCapability
  readiness: CapabilityReadiness
  artifactIndex: ArtifactIndex
}

function firstCompatibleExercise(input: {
  capability: ProjectedCapability
  allowedExercises: ExerciseType[]
}): ExerciseType | null {
  // No sourceKind filter here — see Task 4 design note. The resolver trusts
  // the validator's allowedExercises and picks the intersection with what
  // the contract says about this cap_type.
  const compatible = exerciseTypesForCapability(input.capability.capabilityType)
  return input.allowedExercises.find(exercise => compatible.includes(exercise)) ?? null
}

export function resolveExercise(input: ExerciseResolutionInput): ExerciseResolutionResult {
  if (input.readiness.status !== 'ready') {
    return {
      status: 'failed',
      reason: 'capability_not_ready',
      details: `Capability readiness is ${input.readiness.status}`,
    }
  }

  const exerciseType = firstCompatibleExercise({
    capability: input.capability,
    allowedExercises: input.readiness.allowedExercises,
  })
  if (!exerciseType) {
    return {
      status: 'failed',
      reason: 'no_supported_exercise_family',
      details: `No supported exercise family is available for ${input.capability.capabilityType}.`,
    }
  }

  // Re-verify required artifacts as defence-in-depth (validateCapability
  // already gates the union of contract + capability artifacts upstream).
  // Use the capability's declared requiredArtifacts here — same as the old
  // resolver behavior at exerciseResolver.ts:61. Switching to the contract's
  // list here would (a) break existing exerciseResolver.test.ts:146-168
  // assertions that pass synthetic readiness objects with cap-specific
  // artifacts, and (b) over-gate scenarios where the cap declares strictly
  // less than the contract requires (which is itself a catalog bug to surface
  // via the validator, not silently fix at the resolver).
  const missingArtifacts = input.capability.requiredArtifacts.filter(artifactKind => !hasApprovedArtifact({
    index: input.artifactIndex,
    kind: artifactKind,
    capabilityKey: input.capability.canonicalKey,
    sourceRef: input.capability.sourceRef,
  }))
  if (missingArtifacts.length > 0) {
    return {
      status: 'failed',
      reason: 'missing_required_artifact',
      details: `Missing approved artifacts: ${missingArtifacts.join(', ')}`,
      missingArtifacts,
    }
  }

  return {
    status: 'resolved',
    plan: {
      capabilityKey: input.capability.canonicalKey,
      sourceRef: input.capability.sourceRef,
      exerciseType,
      capabilityType: input.capability.capabilityType,
      skillType: input.capability.skillType,
      requiredArtifacts: input.capability.requiredArtifacts,
    },
  }
}
```

**Step 3: Run tests.**

```bash
bun run test src/lib/exercises src/__tests__/exerciseResolver.test.ts src/__tests__/capabilityContracts.test.ts src/__tests__/morphologyCapabilityProjection.test.ts
```

Expected: all PASS. The resolver tests at `src/__tests__/exerciseResolver.test.ts:146-168` (podcast + morphology with synthetic ready readiness) should still pass — the resolver trusts the readiness object.

The validator-driven tests (capabilityContracts, morphologyCapabilityProjection) will see the new behavior — morphology + dialogue-cloze + pattern caps now `blocked` — and need updated assertions per Task 3.

**Step 4: Commit.**

```bash
git add src/lib/exercises/exerciseResolver.ts
git commit -m "feat(exercises): exerciseResolver consumes RENDER_CONTRACTS, deletes compatibleExercisesByCapability (#65)"
```

---

## Task 5 — Migrate the 12 builders to typed inputs

This is the largest task. Each builder gets:
1. Signature change: `(input: BuilderInput)` → `(input: BuilderInputFor<'<type>'>)`.
2. Runtime guards for contract-guaranteed fields deleted.
3. Runtime guards for payload-shape / cascade-quality remain.

The `BUILDERS` registry type changes from `Record<ExerciseType, (input: BuilderInput) => BuilderResult>` to a per-type mapped registry. `buildForExerciseType` becomes generic.

**Files:**
- Modify: every file under `src/lib/exercises/builders/` (12 builders + `index.ts` + `types.ts`).
- Test: `src/lib/exercises/builders/__tests__/builders.test.ts` (448 LOC) — adapt fixture construction.

**Step 1: Update `src/lib/exercises/builders/types.ts`.**

```typescript
// src/lib/exercises/builders/types.ts
import type { ExerciseItem } from '@/types/learning'
// Import from the leaf module (created in Task 1.5) rather than the service
// re-export — keeps the dependency graph acyclic. The service still
// re-exports for back-compat with any external consumer that hasn't migrated.
import type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'

export type { BuilderInputFor, RawProjectorInput } from '@/lib/capabilities/renderContracts'

export type BuilderResult =
  | { kind: 'ok'; exerciseItem: ExerciseItem; audibleTexts: string[] }
  | { kind: 'fail'; reasonCode: ResolutionReasonCode; message: string; payloadSnapshot?: unknown }
```

Delete the legacy `BuilderInput` interface — it's superseded by `BuilderInputFor<T>` per-builder and `RawProjectorInput` at the dispatch site.

**Step 2: Update `src/lib/exercises/builders/index.ts`.**

```typescript
// src/lib/exercises/builders/index.ts
import type { ExerciseType } from '@/types/learning'
import type { BuilderInputFor, BuilderResult } from './types'
import { projectBuilderInput, type RawProjectorInput } from '@/lib/capabilities/renderContracts'

import { buildRecognitionMCQ } from './RecognitionMCQ'
import { buildCuedRecall } from './CuedRecall'
import { buildTypedRecall } from './TypedRecall'
import { buildMeaningRecall } from './MeaningRecall'
import { buildListeningMCQ } from './ListeningMCQ'
import { buildDictation } from './Dictation'
import { buildCloze } from './Cloze'
import { buildClozeMcq } from './ClozeMcq'
import { buildContrastPair } from './ContrastPair'
import { buildSentenceTransformation } from './SentenceTransformation'
import { buildConstrainedTranslation } from './ConstrainedTranslation'
import { buildSpeaking } from './Speaking'

export type { BuilderResult, BuilderInputFor } from './types'
export type { RawProjectorInput } from '@/lib/capabilities/renderContracts'

type BuilderRegistry = {
  [K in ExerciseType]: (input: BuilderInputFor<K>) => BuilderResult
}

const BUILDERS: BuilderRegistry = {
  recognition_mcq:         buildRecognitionMCQ,
  cued_recall:             buildCuedRecall,
  typed_recall:            buildTypedRecall,
  meaning_recall:          buildMeaningRecall,
  listening_mcq:           buildListeningMCQ,
  dictation:               buildDictation,
  cloze:                   buildCloze,
  cloze_mcq:               buildClozeMcq,
  contrast_pair:           buildContrastPair,
  sentence_transformation: buildSentenceTransformation,
  constrained_translation: buildConstrainedTranslation,
  speaking:                buildSpeaking,
}

/**
 * Dispatch a raw input to the right builder, via the projector. The projector
 * narrows the input type and performs all runtime guards that used to live
 * inside each builder. After it returns ok, the builder is statically
 * guaranteed every required field is present.
 */
export function buildForExerciseType<K extends ExerciseType>(
  exerciseType: K,
  raw: RawProjectorInput,
): BuilderResult {
  const projected = projectBuilderInput(exerciseType, raw)
  if (!projected.ok) {
    return {
      kind: 'fail',
      reasonCode: projected.reasonCode,
      message: projected.message,
      payloadSnapshot: projected.payloadSnapshot,
    }
  }
  const builder = BUILDERS[exerciseType] as (input: BuilderInputFor<K>) => BuilderResult
  return builder(projected.input)
}
```

**Step 3: Migrate `Cloze.ts`** (worked example for the pattern; apply analogously to every other builder).

```typescript
// src/lib/exercises/builders/Cloze.ts (after rewrite)
import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildCloze(input: BuilderInputFor<'cloze'>): BuilderResult {
  // learningItem and clozeContext are non-null by contract (projector narrows).
  if (!input.clozeContext.source_text.includes('___')) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_cloze',
      message: `cloze context missing '___' marker (item ${input.learningItem.id})`,
      payloadSnapshot: { contextId: input.clozeContext.id, sourceTextSample: input.clozeContext.source_text.slice(0, 200) },
    }
  }
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'form_recall' as const,
    exerciseType: 'cloze' as const,
    clozeContext: {
      sentence: input.clozeContext.source_text,
      targetWord: input.learningItem.base_text,
      translation: input.clozeContext.translation_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
```

Note what was deleted: the `if (!input.learningItem)` guard (now guaranteed by contract) and the `const clozeContext = input.contexts.find(...)` + `if (!clozeContext)` block (the projector picks the cloze context and narrows the type).

**Step 4: Apply the same pattern to each builder.** For each, delete:
- `if (!input.learningItem)` (now guaranteed)
- `const primary = pickUserLangMeaning(...)` + `if (!primary)` (becomes `const primary = input.primaryMeaning`)
- For cloze: `const clozeContext = input.contexts.find(...)` + guard (becomes `input.clozeContext`)
- For variant-required builders: `if (!input.variant || input.variant.exercise_type !== '<type>')` (now guaranteed)

For `ClozeMcq.ts` specifically, also rewrite the authored-path fallback at line 25:

```typescript
// BEFORE:
const sentence = (payload.sentence as string) || (input.contexts.find(c => c.context_type === 'cloze')?.source_text) || ''
// AFTER:
const sentence = (payload.sentence as string) || input.clozeContext?.source_text || ''
```

The contract guarantees `input.clozeContext: ItemContext | null` for cloze_mcq; in the authored path it may be null (variant payload supplies the sentence), so `?.` chains correctly.

Keep:
- Payload-shape guards (`if (!sourceSentence || acceptable.length === 0)`)
- Distractor-cascade guards (`if (distractors.length < 3)`)
- Authored-vs-runtime branching in cloze_mcq (the projector lets either path through, the builder still chooses which to execute)

For cloze_mcq specifically, the typed input is `BuilderInputFor<'cloze_mcq'> = BuilderBase & { learningItem: LearningItem; clozeContext: ItemContext | null; variant: ExerciseVariant | null }`. The projector enforces the invariant `clozeContext != null OR variant matches type` but cannot pick the path for the builder. So the cloze_mcq builder retains its branching logic but with stricter inputs:

```typescript
export function buildClozeMcq(input: BuilderInputFor<'cloze_mcq'>): BuilderResult {
  // Authored path
  if (input.variant && input.variant.exercise_type === 'cloze_mcq') {
    // ...consume input.variant.payload_json — same as today...
  }
  // Runtime path — by projector invariant, clozeContext is non-null here.
  if (!input.clozeContext) {
    // Defensive: projector should have caught this. Treat as a contract bug.
    return { kind: 'fail', reasonCode: 'malformed_cloze', message: 'projector invariant violated: clozeContext null with no matching authored variant' }
  }
  // ...consume input.clozeContext — same as today, with input.clozeContext replacing the contexts.find(...) lookup...
}
```

The runtime-path guard remains as a defensive net for projector regressions, but its `payloadSnapshot` carries a "contract invariant violated" message so future debugging surfaces the right layer.

For cloze_mcq's distractor cascade (`ClozeMcq.ts:64`), the builder calls `pickUserLangMeaning(input.meanings, input.userLanguage)` and tolerates null (cascade degrades gracefully). The contract does NOT mark `primaryMeaning` as required for cloze_mcq — see matrix above. No change to that codepath.

For speaking, the projector lets `variant: null` through (item-anchored fallback). The builder branches on `if (input.variant && input.variant.exercise_type === 'speaking')`.

**Step 5: Update `src/services/capabilityContentService.ts:332-376`.**

The dispatch site already constructs a `BuilderInput`. Rename it to `RawProjectorInput` (or just leave the local variable typed as `RawProjectorInput`):

```typescript
const rawInput: RawProjectorInput = {
  block,
  learningItem,
  meanings: meaningsByItem.get(itemUuid) ?? [],
  contexts: contextsByItem.get(itemUuid) ?? [],
  answerVariants: answerVariantsByItem.get(itemUuid) ?? [],
  variant: variantByItemAndType.get(`${itemUuid}:${block.renderPlan.exerciseType}`) ?? null,
  artifactsByKind: artifactsByCapability.get(block.capabilityId) ?? new Map(),
  poolItems: pool.items,
  poolMeaningsByItem,
  userLanguage: options.userLanguage,
}

const built = buildForExerciseType(block.renderPlan.exerciseType, rawInput)
```

The import line at the top changes:

```typescript
import { buildForExerciseType, type RawProjectorInput } from '@/lib/exercises/builders'
```

(Drop the `BuilderInput` import.)

**Step 6: Update `src/lib/exercises/builders/__tests__/builders.test.ts`.**

The test file builds fixtures and passes them to each builder. Two changes per test:
- Replace `BuilderInput` type annotations with `BuilderInputFor<'<exercise>'>`.
- Add the per-exercise extra fields the new shape requires (e.g. for cloze, the test fixture must now have `clozeContext: <ItemContext>` directly, instead of relying on the builder to fish it out of `contexts: [...]`).

Mechanical work. Aim to keep each test's semantics identical — they were testing the same behaviour pre-refactor; they should test the same behaviour post-refactor, just with input narrowed.

**Step 7: Run the full test suite.**

```bash
bun run test
```

Expected: GREEN. Fix any straggler test fixtures.

**Step 8: Commit.**

Suggested split (smaller commits per file are also fine):

```bash
git add src/lib/exercises/builders/ src/lib/exercises/builders/__tests__/
git commit -m "feat(exercises): migrate 12 builders to BuilderInputFor<T> via projector (#65)"

git add src/services/capabilityContentService.ts
git commit -m "feat(service): dispatch via projector + typed builder registry (#65)"
```

---

## Task 6 — Verify ExperiencePlayer's `renderableBlocks` filter is now a no-op for valid blocks

**Step 1: Add a small assertion to `ExperiencePlayer.tsx`** (optional, defensive):

The `registryMissCount` log path already captures the "block resolved but ExerciseType not in registry" case. Add a sibling log for the "block resolved as null because the projector failed" case — but only if the block's capability passed `validateCapability` as ready. This catches future contract drift.

Actually — `renderableBlocks` filters on `!ctx?.exerciseItem`. A null exerciseItem post-Task 5 always corresponds to a `ctx.diagnostic` (the projector failed or the builder hit a kept guard like `no_distractor_candidates`). Don't add new instrumentation; the existing `logResolutionFailure` call in `capabilityContentService.ts:380` already covers this surface.

Skip this task's "Step 1" — no code change needed. Move to Step 2.

**Step 2: Smoke-test the live session count.**

After Task 5 lands locally:
1. `bun run dev`.
2. Open `localhost:5173`, log in as albert@duin.home.
3. Profile → confirm `preferred_session_size` is 25 (or set it to something easily-checkable).
4. Start a Standard session.
5. Observe the "Oefening 1 van Y" counter. Y should equal `preferred_session_size` exactly (modulo legitimate due-queue shape).

If Y is short, inspect the React-fiber tree at `<ExperiencePlayer>` and check `plan.blocks.length` vs. `renderableBlocks.length`. Any divergence means the projector is failing for a block that validateCapability passed — which would be a contract bug to fix before merge.

**Step 3: Take a screenshot of the session counter showing Y == preferred_session_size.**

Save to `render-contracts-session-counter.png` at repo root (gitignored). Include in PR description.

---

## Task 7 — Run the full pre-deploy gate

**Step 1: Lint, type-check, unit tests.**

```bash
bun run lint
bun run test
bun run build
```

All three should be green. Any TS error here means a builder's signature is wrong or the projector's narrowing isn't producing the contract-promised shape — investigate before continuing.

**Step 2: Tier 1 + Tier 2 Supabase health.**

```bash
make check-supabase
make check-supabase-deep
```

Both should be green. New baselines for `blocked` counts (specifically pattern_recognition + pattern_contrast + any newly-audio-required listening_mcq/dictation caps) are expected and acceptable — record them in the PR description.

**Step 3: Idempotency check** (only relevant if `scripts/migration.sql` was touched — for this PR it isn't, so skip).

**Step 4: Full pre-deploy.**

```bash
make pre-deploy
```

Expected: all green except known pre-existing failures (audio coverage cluster).

---

## Task 8 — Create `docs/current-system/modules/capabilities.md`

There is no current module spec for `src/lib/capabilities/`. Per CLAUDE.md ("Any new top-level folder under `src/lib/` is a deep module — write its spec when the second non-trivial file lands"), this is overdue. Create it as part of this PR.

**Note on commit timing (CLAUDE.md "same commit as the code change"):** CLAUDE.md requires module-spec updates to land in the same commit as the code change. This PR creates the spec for the first time; rather than authoring it incrementally across Tasks 2-7 (and rewriting most of it in this final commit anyway), the spec lands here as a single coherent document describing the post-refactor end state. The deviation is intentional: the spec is born from the final shape, not from any intermediate state. Cite this rationale in the commit message.

**Files:**
- Create: `docs/current-system/modules/capabilities.md`

**Step 1: Use `docs/current-system/modules/session-builder.md` as the structural template.** Sections required: frontmatter (module, surface, last_verified_against_code, status), §1 Purpose, §2 Public interface, §3 Internal flow, §4 Invariants, §5 Seams, §6 Known limitations and follow-ups, §7 What this spec does NOT cover.

**Step 2: Frontmatter.**

```yaml
---
module: capabilities
surface: src/lib/capabilities/
last_verified_against_code: 2026-05-18
status: stable
---
```

**Step 3: §1 Purpose.** 2-3 sentences. The capabilities deep module owns the projection from raw catalog content to schedulable capabilities, the readiness contract between capability and exercise, and the runtime/compile-time contract that governs how capabilities become exercises (RENDER_CONTRACTS).

**Step 4: §2 Public interface.** Exports:
- `validateCapability` (the entry point for adapter + scheduler + promote-capabilities + check-capability-health)
- `RENDER_CONTRACTS`, `BuilderInputFor<T>`, `projectBuilderInput<T>()`, `exerciseTypesForCapability`, `requiredArtifactsFor`, `supportsSourceKind`
- `isExposureOnly`
- `getDueCapabilities` / `getDueCapabilitiesFromRows`
- `hasApprovedArtifact`, `ARTIFACT_KINDS`, `CapabilityArtifact`, `ArtifactIndex`
- `itemSlug` (canonical-key helper, retained from #59)
- Type unions: `CapabilityType`, `CapabilitySourceKind`, `ArtifactKind`, `ProjectedCapability`, `CapabilityProjection`

Each entry: one line on signature + one-line purpose. Reference file:line for the export.

**Step 5: §3 Internal flow.** Two flow paragraphs:
- The contract flow: RENDER_CONTRACTS → validateCapability → CapabilityReadiness → resolver → ExerciseRenderPlan.
- The artifact registry flow: capability_artifacts table → ArtifactIndex → hasApprovedArtifact → validateCapability.

**Step 6: §4 Invariants.** At minimum:
- RENDER_CONTRACTS exhaustiveness (every ExerciseType has an entry, enforced by `satisfies`).
- ContractInputShapes exhaustiveness (same, enforced by `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK`).
- pattern_recognition + pattern_contrast capabilities are blocked at validateCapability until pattern-rendering exercises ship (follow-up issue).
- exposure_only caps (podcast source kinds) never enter spaced practice.
- The projector is the sole runtime gate for builder input shape — builders trust their inputs.

**Step 7: §5 Seams.** Upstream: Supabase tables (`learning_capabilities`, `capability_artifacts`, `learner_capability_state`). Downstream: `lib/session-builder`, `services/capabilityContentService`, `lib/exercises/exerciseResolver`, `lib/exercises/builders`, the publish pipeline's `scripts/lib/pipeline/capability-stage/`. Sibling: none currently.

**Step 8: §6 Known limitations.**
- pattern_recognition + pattern_contrast are blocked pending the pattern-renderer follow-up.
- `supportedSourceKinds: ['item']` for every contract entry today; expanding to dialogue_line + affixed_form_pair is owned by the future capabilityContentService fold.
- `listening_mcq` and `dictation` now correctly require `audio_clip` — caps without it will be re-marked `blocked` on next deploy.

**Step 9: §7 What this spec does NOT cover.**
- Per-card rendering (owned by `lib/exercise-content/` target module, currently scattered across `services/capabilityContentService` + `lib/exercises/builders`).
- FSRS scheduling (server-side, ADR 0003).
- Answer commits (server-side Edge Function).
- Lesson reader content (owned by `lib/lessons/`, see `docs/current-system/modules/lesson-renderer.md`).

**Step 10: Commit.**

```bash
git add docs/current-system/modules/capabilities.md
git commit -m "docs(capabilities): create module spec for src/lib/capabilities/ (#65)"
```

---

## Task 9 — Update session-builder spec freshness date

**Files:**
- Modify: `docs/current-system/modules/session-builder.md` frontmatter — bump `last_verified_against_code` to today; the spec already mentions `lib/capabilities/capabilityContracts.ts` (line 302) and the adapter's use of `validateCapability` (line 138). Add a one-line callout near line 302 that the contract surface is now declared in `renderContracts.ts` per ADR / module spec at `docs/current-system/modules/capabilities.md`.

**Step 1: Frontmatter bump.**

```yaml
last_verified_against_code: 2026-05-18
```

**Step 2: Inline callout** at the cite of `capabilityContracts.ts`:

> `lib/capabilities/capabilityContracts.ts` — provides `validateCapability` for readiness. After PR #65, readiness derives from the shared `RENDER_CONTRACTS` table in `lib/capabilities/renderContracts.ts`; see `docs/current-system/modules/capabilities.md`.

**Step 3: Commit.**

```bash
git add docs/current-system/modules/session-builder.md
git commit -m "docs(session-builder): refresh seam callout for renderContracts (#65)"
```

---

## Task 10 — Open PR, flip plan status

**Step 1: Push and PR.**

```bash
git push -u origin chore/render-contracts
gh pr create --title "feat(capabilities): RENDER_CONTRACTS shared render contract (#65)" --body "$(cat <<'EOF'
Closes #65.

## Summary
- New `src/lib/capabilities/renderContracts.ts` declares the runtime `RENDER_CONTRACTS` table and the compile-time `ContractInputShapes` map; both keyed by `ExerciseType` with `satisfies` exhaustiveness.
- `projectBuilderInput<T>()` is the single runtime gate for builder input shape; the 12 builders' `if (!input.X) return fail` guards for contract-guaranteed fields are deleted.
- `validateCapability` + `exerciseResolver` consume the new contract via `exerciseTypesForCapability`, `requiredArtifactsFor`, `supportsSourceKind`. The duplicate maps in both files are gone.
- pattern_recognition + pattern_contrast capabilities are now `blocked` at validateCapability — they have no compatible exercise. Follow-up issue tracks building real pattern renderers.
- Latent bug fix: `listening_mcq` and `dictation` now correctly require `audio_clip` artifacts.
- New module spec at `docs/current-system/modules/capabilities.md`.

## Before / after
| | Before | After |
|---|---|---|
| Capabilities `blocked` (pattern_recognition) | 0 (incorrectly `ready`) | N (record from check-supabase-deep) |
| Capabilities `blocked` (pattern_contrast) | 0 | N |
| Capabilities `blocked` (listening_mcq missing audio) | 0 (silently failing at builder) | N |
| Albert's standard session size | Y_old (short by 2) | 25 of 25 |

## Test plan
- [x] `bun run test` green
- [x] `make pre-deploy` green except known audio failures
- [x] Live smoke as albert@duin.home: session counter shows 25 of 25
- [x] HC8 + HC9 still green

## Follow-ups
- File issue: build pattern-cloze + pattern-contrast renderers from pattern artifacts.
- Apply the same shared-contract pattern to `hasConcreteArtifactPayload` (artifact-content seam).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 2: Flip the plan frontmatter from `draft` → `implementing`.**

```yaml
---
status: implementing
implementation: PR #<NN>
---
```

Commit as part of the same branch:

```bash
git add docs/plans/2026-05-18-render-contracts.md
git commit -m "docs(plans): mark render-contracts plan implementing (PR #<NN>)"
git push
```

**Step 3: After merge** — flip to `shipped`, record `merged_at: 2026-05-18`, list `implementation_paths`:

```yaml
---
status: shipped
implementation: PR #<NN>
merged_at: 2026-05-18
implementation_paths:
  - src/lib/capabilities/renderContracts.ts
  - src/lib/capabilities/capabilityContracts.ts
  - src/lib/exercises/exerciseResolver.ts
  - src/lib/exercises/builders/
  - src/services/capabilityContentService.ts
  - docs/current-system/modules/capabilities.md
  - docs/current-system/modules/session-builder.md
---
```

Commit + push as a docs follow-up to main.

---

## Task 11 — Post-merge verification + follow-up issue

**Step 1: Verify HC8 + HC9 stay green for 24 hours.**

```bash
make check-supabase-deep 2>&1 | grep -E "HC8|HC9"
```

**Step 2: Confirm a session for albert** (or any user with `preferred_session_size > 1`) shows exactly preferred_session_size blocks.

If short — record the discrepancy and file as a follow-up issue. The contract is incomplete.

**Step 3: File the pattern-renderer follow-up issue.**

Issue title: *"Build pattern-cloze + pattern-contrast renderers consuming pattern artifacts"*.
Body: link to this PR; describe the current `blocked` state of pattern_recognition + pattern_contrast caps; outline the design space (new ExerciseType vs. extending cloze to accept pattern artifacts); estimate effort; tag as `enhancement`.

---

## Rollback strategy

**Pre-merge:** all changes are in source control on `chore/render-contracts`. Discard the branch.

**Post-merge, pre-deploy:** revert the merge commit, push. No DB state to undo.

**Post-deploy:** the rebuild of the container reverts the frontend. The DB is unchanged across this PR (no schema delta), so a container roll-back to the prior tag fully reverts. Pattern caps that were `ready` pre-PR become `blocked` post-PR — this is the intended fix, not a regression to roll back from. Rolling back would re-introduce the silent session-short bug.

**Worst-case:** container roll-back via `docker pull <prev-tag> + docker recreate` per `docs/process/deploy.md`.

---

## Estimated diff size

| Surface | Lines |
|---|---|
| Plan doc | ~700 (this file) |
| `renderContracts.ts` (new) | ~250 |
| `renderContracts.test.ts` (new) | ~250 |
| `capabilityContracts.ts` (rewrite) | -40 / +30 |
| `exerciseResolver.ts` (rewrite) | -30 / +20 |
| `builders/types.ts` (rewrite) | -40 / +10 |
| `builders/index.ts` (rewrite) | -10 / +25 |
| Each of 12 builders | avg -10 / +0 (mostly deletions) |
| `capabilityContentService.ts:332-376` | -5 / +5 (rename `BuilderInput` → `RawProjectorInput`) |
| `builders/__tests__/builders.test.ts` | +50 / -20 (fixture shape adapt) |
| `capabilityContracts.test.ts` | +30 / -10 (new pattern assertions) |
| `docs/current-system/modules/capabilities.md` (new) | ~250 |
| `docs/current-system/modules/session-builder.md` | +2 |

**Total committed: ~1800 LOC including this plan, ~1100 LOC excluding plan + new spec; net code delta is roughly flat (deletions in builders offset by additions in renderContracts.ts + projector tests).**
