---
status: implementing
implementation: PR 0 + PR 1 merged via a4cd381 + 1467cae; PR 2 + PR 3 + PR 4 absorbed into the lib/exercise-content fold's PR-B; PR 5 + PR 6 + PR 7 + capstone pending
---

# Dialogue-line contextual cloze — first non-item source kind reaches the runtime

> **2026-05-21 update:** PR 2 + PR 3 + PR 4 shipped as one cohesive change inside the lib/exercise-content fold's PR-B (which absorbed the runtime widening per the pause-note decision α). The shape that lands is narrower than the original plan: `cloze` (typed) accepts dialogue_line but `cloze_mcq` stays item-only — the cloze_mcq runtime path needs a lesson-anchored distractor pool that fetchForDialogueLineBlocks doesn't populate yet (follow-up). PR 5 (session-builder verification), PR 6 (UI surfaces), PR 7 (HC11 health check), and the capstone are still pending. See `docs/current-system/modules/exercise-content.md` §8 for the PR-B commit list.

## Goal

Make `dialogue_line:contextual_cloze` capabilities visible to learners as cloze exercises. This is the pilot for "non-item source kinds become renderable." The work is structured as a vertical slice across every deep module the capability stack touches; each module's seam is locked in by an integration test before the next module ships.

The general pattern this plan establishes is the template for later capability folds (`affixed_form_pair:root_derived_*` next, then podcasts).

## Why dialogue cloze first

- **Existing UI.** `src/components/exercises/implementations/Cloze.tsx` and `ClozeMcq.tsx` already render item-sourced clozes. The work is widening their input contract, not designing a new exercise type.
- **Smallest end-to-end slice.** Every deep module participates: publish pipeline → resolver → contracts → builder → UI → progress. No module is skipped, none is overbuilt.
- **Real pedagogical value.** Dialogue clozes test comprehension of full sentences in context — qualitatively different from carrier-sentence vocabulary cloze.
- **The capability projection already runs.** `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:163-203` (Decision 5b) emits `dialogue_line:contextual_cloze` caps today; L9 has 7 in the live DB. The data plumbing for cap rows is done; only the **artifacts** and the **runtime fold** are missing.

## What's broken today (the snapshot)

- 7 `dialogue_line:contextual_cloze` rows exist in `learning_capabilities` (all on L9). Zero of them have `capability_artifacts` rows.
- `src/services/capabilityContentService.ts:215-220` rejects any block whose decoded `sourceKind !== 'item'` with `unsupported_source_kind`.
- `src/lib/capabilities/renderContracts.ts:73-82` — `cloze` and `cloze_mcq` declare `supportedSourceKinds: ['item']`.
- `src/lib/capabilities/__tests__/renderContracts.test.ts:144-148` locks in the dialogue_line restriction with an explicit "yet" test.
- `ContractInputShapes.cloze` at `renderContracts.ts:177` requires `{ learningItem: LearningItem; clozeContext: ItemContext }` — both non-null. A dialogue-line cap has neither a learning item nor an `item_contexts` row.
- `scripts/lib/content-pipeline-output.ts:476-481` (`buildPayloadForKind`) throws on unknown `artifact_kind`. It supports `base_text`, `accepted_answers:id`, `accepted_answers:l1`, `meaning:l1`, `audio_clip`, `root_derived_pair`, `allomorph_rule`, `pattern_explanation:l1`, `pattern_example` — not `cloze_context`, `cloze_answer`, `translation:l1`. The reason no error fires today is that the artifact builder iterates only over the shared-catalog projection (line 625); the runner's added dialogue_line caps (vocab.ts:163-203) bypass this loop entirely, so the missing kinds are never requested. PR 1 (below) explicitly does **not** route the new dialogue artifacts through `buildPayloadForKind` — it adds a separate helper that calls `upsertCapabilityArtifacts` directly, so `buildPayloadForKind` need not learn the three new kinds.

## Deep modules that participate

| # | Module | Where | What changes here |
|---|---|---|---|
| 1 | Publish pipeline — artifact emitter | `scripts/lib/pipeline/capability-stage/` + `scripts/lib/content-pipeline-output.ts` | Emit `cloze_context`, `cloze_answer`, `translation:l1` artifact rows per dialogue_line cap, sourced from `cloze-contexts.ts` + `lesson_sections` |
| 2 | Capability runtime resolver | `src/services/capabilityContentService.ts` | Open the front-door check for `dialogue_line` source kind; add a parallel fetch path that loads the dialogue line text + artifacts rather than an item row |
| 3 | Render contracts + builder input shape | `src/lib/capabilities/renderContracts.ts` | Widen `cloze`/`cloze_mcq` `supportedSourceKinds`; redefine `ContractInputShapes.cloze`/`cloze_mcq` so `learningItem` is nullable when the cap is dialogue_line; update `projectBuilderInput` |
| 4 | Builder | `src/lib/exercises/builders/Cloze.ts` + `ClozeMcq.ts` | Pull `targetWord` from a `cloze_answer` artifact when there is no learning item; pull `sentence` from the dialogue line text or `cloze_context` artifact |
| 5 | Session builder eligibility | `src/lib/session-builder/` (`pedagogy.ts:107-114` already classifies `contextual_cloze` as `isNewProductionTask`) | Confirm dialogue_line caps survive eligibility filtering; add tests |
| 6 | UI | `src/components/exercises/implementations/Cloze.tsx` + `ClozeMcq.tsx` | Render the dialogue line with `___` blank. May need a "speaker" affordance ("[Titin]: …"). Visual confirmation in `/admin/design-lab`. |
| 7 | Progress / mastery / reviews | `src/lib/mastery/`, `src/lib/reviews/` | Confirm `dimensionForCapability` covers `contextual_cloze` (it should already). **FSRS processor verified source-kind-agnostic** — `src/lib/reviews/capabilityReviewProcessor.ts` operates on `capabilityId` / `canonicalKeySnapshot` / `schedulerSnapshot` / `activationState` only; no reference to learning items. No code change needed. |
| 8 | Health checks | `scripts/check-supabase-deep.ts` | Add HC11: every `dialogue_line:contextual_cloze` cap has all three required artifacts |

## Decisions to make before coding

These are the open architectural questions; each PR depends on the chosen answer. **Address them in the spec, not in code.**

### D1 — Where does the dialogue line text come from at render time?

Two options:
- **(a) From `lesson_sections.content.lines[idx]`.** The cap's `source_ref` is `lesson-N/section-M/line-K`; the runtime parses this and reads the line out of the already-loaded lesson section. No new artifact storage. Couples the runtime to the source-ref shape.
- **(b) From a `cloze_context` artifact.** The publish pipeline writes the full line text into a `cloze_context` artifact's `payload_json`. The runtime reads it from `capability_artifacts` like every other artifact. No coupling to source_ref shape, but duplicates data already in `lesson_sections`.

**Recommendation:** (b). Treats dialogue_line as a fully-projected source kind whose artifacts are self-contained, matching how item-sourced caps work. Source_ref parsing stays a publish-time concern, not a runtime one. **Artifact payload shape under D1(b):** `cloze_context.payload_json = { source_text: '<line with ___>', line_text: '<full line, unblanked>', speaker: '<speaker name>|null', source_ref: 'lesson-N/section-M/line-K' }`. The unblanked `line_text` and `speaker` are needed by the UI (PR 6) without forcing a parallel read of `lesson_sections` at render time.

### D2 — Where does the cloze target word come from at render time?

For item-sourced cloze today: `targetWord = input.learningItem.base_text` (builder Cloze.ts:26). For dialogue_line there is no learning item.

Two options:
- **(a) Write the blanked word into a `cloze_answer` artifact.** Publish-time decision (made by the cloze-creator agent + the projector). Runtime reads `cloze_answer.value`.
- **(b) Diff `cloze_context.source_text` against the dialogue line.** Runtime-side derivation. Fragile (multiple `___` placements, capitalization edge cases).

**Recommendation:** (a). Same pattern as item-sourced: one artifact per fact. The cloze-creator agent already knows which word is blanked; persist that decision rather than re-deriving it.

### D3 — How does the builder receive a "non-item" cloze?

`ContractInputShapes.cloze` currently demands `{ learningItem: LearningItem; clozeContext: ItemContext }`. For dialogue_line, neither exists in their current form.

Two options:
- **(a) Make `learningItem` nullable, add `dialogueLine` field.** `ContractInputShapes.cloze` becomes `BuilderBase & { learningItem: LearningItem | null; clozeContext: ItemContext | null; dialogueLine: { text: string; speaker: string | null; sourceRef: string } | null }` with the projector invariant: exactly one of `learningItem` or `dialogueLine` is non-null.
- **(b) Two separate exercise types: `cloze` (item) + `dialogue_cloze` (dialogue_line).** Higher surface (new registry entry, new exercise type enum, double primitives), but clear shape per type.

**Recommendation:** (a). The UI behaviour is identical (sentence with one blank). The projector enforces the invariant, the builder branches once on which input is present. **Precedent:** the projector-enforced-invariant pattern is already in use for `cloze_mcq` — its `clozeContext: ItemContext | null` field at `renderContracts.ts:178` is honestly nullable, with the projector enforcing "at least one of `clozeContext` OR a matching authored variant is present" at `renderContracts.ts:257-272`. D3(a) extends the same pattern to the new dialogue-line dimension.

### D4 — Where do the cloze artifacts get emitted in the pipeline?

`buildArtifactsForCapability` (`content-pipeline-output.ts:484`) runs over the shared catalog's projection. Dialogue_line caps are added downstream by `projectors/vocab.ts` (Decision 5b), so they currently bypass the builder.

Two options:
- **(a) Move dialogue_line emission upstream into the shared catalog.** Larger change; couples the catalog to staging clozeContexts.
- **(b) Add a parallel artifact builder pass for dialogue_line caps inside the capability-stage runner.** Smaller, keeps Decision 5b's split. Runner walks `vocab.contextualClozeCapabilities` + matching `clozeContexts` and emits artifacts via the same `upsertCapabilityArtifacts` path used at runner.ts:447.

**Recommendation:** (b). Preserves the Decision 5b layering. Add a `projectDialogueArtifacts` helper next to projectVocab; runner calls it after step 7 (capability_artifacts). The helper imports `input.sections` (the same source `collectDialogueLineSourceRefsByText` at `vocab.ts:208-229` already uses to build its line map) so each dialogue line's full text and `speaker` are accessible without a separate lesson lookup.

### D5 — What does `cloze-contexts.ts` need to look like for dialogue clozes?

Today's vocabulary cloze entry:
```ts
{ learning_item_slug: 'apa', source_text: 'Hari ini ___ kabar?', translation_text: '…' }
```

For dialogue cloze, the slug must match `itemSlug(line.text)` (the projector's `dialogueLineSourceRefs` map key in `projectors/vocab.ts:208-229`). It must also identify which word in the line is blanked. Today nothing reads the blanked answer from staging — the cloze_contexts table row created at `runner.ts:524-535` stores `source_text` (the sentence with `___`) but no separate answer field; the item-sourced flow recovers the answer at render time from `learning_item.base_text` (`Cloze.ts:26`). For a dialogue_line entry there is no learning item, so the answer must be persisted explicitly.

**Required addition:** a new optional field `cloze_answer: string` that the cloze-creator agent writes — the word that fills `___`. The projector reads it into the artifact's payload_json.

**Backwards compat:** existing vocab cloze entries without `cloze_answer` keep working — the item path continues to use `learning_item.base_text`. The field is required only for dialogue-line entries.

**Existing data migration:** L9's current `cloze-contexts.ts` dialogue entries already have slugs equal to `itemSlug(line.text)` (the slug convention they need). They lack `cloze_answer`. PR 1's agent-spec update + a one-time re-author of L9's dialogue entries (small — 5 lines) bring them current. L5/L7/L8 don't have dialogue cloze entries today; they're authored fresh under PR 1a (see "PR sequence" below).

### D6 — The L5 chunks-vs-lines content issue

`scripts/data/staging/lesson-5/learning-items.ts` has `dialogue_chunk` items whose `base_text` is a sub-string of the corresponding `line.text` in `lesson.ts` (long lines broken into shorter chunks). L9's convention is `chunk.base_text === line.text` exactly.

This is **out of scope for the runtime fold**, but in scope for "L5 ships dialogue cloze." Two options:
- **(a) Realign L5's chunks to match lines.** Edit `learning-items.ts`. The next publish creates new full-line dialogue_chunks; the old sub-string chunks become orphans (separate cleanup).
- **(b) Decouple dialogue cloze from `dialogue_chunk` items entirely.** The projector keys on `lesson_sections.content.lines[].text` directly; dialogue_chunks are independent vocabulary items in their own right. L5 ships dialogue cloze without touching learning-items.ts; the chunks continue to drive `item:text_recognition` exercises on the chunk text.

**Recommendation:** (b). The cleaner data model is: dialogue line text → dialogue_cloze. dialogue_chunk → item-sourced exercises (text_recognition, dictation, etc.). Two parallel reuses of the dialogue content. The cloze-creator agent's spec (`.claude/agents/cloze-creator.md:91`) needs updating to use `line.text` from `lesson.ts` rather than `chunk.base_text` from `learning-items.ts`.

**Non-effect on existing learner state:** D6(b) does not touch existing `item:text_recognition` / `item:audio_recognition` / `item:dictation` etc. caps that point at L5's dialogue_chunk items. Their source_refs (`learning_items/<chunk_text>`) keep resolving, the chunks keep ticking through FSRS review, and existing `learner_capability_state` rows are preserved. The change is additive: dialogue-line caps gain renderability without removing anything from the item-sourced path.

## ⚠ 2026-05-21 update — fold-decision pause point between PR 1 and PR 2

A post-approval architectural review surfaced a target-architecture concern that scopes how the rest of this plan should land. **PR 0 and PR 1 are unaffected and can ship.** Pause before PR 2 to make a decision.

**The concern.** PRs 2 and 3 as drafted add **parallel branches inside `src/services/capabilityContentService.ts`** — a parallel `dialogueBlocks` array, a parallel pass-2 loop, a new `extractDialogueLineRef` helper, new `ResolutionReasonCode` values, and a widening of `supportedSourceKinds` in the per-exercise render contracts. Each addition is small but they don't compose: when affixed_form_pair lands, it gets its own parallel branch; podcasts add two more. The file shallows over time (more code paths each tied to one source kind) instead of deepening (one polymorphic dispatch hiding source-kind variation).

This drift is explicit in the docs:

- `docs/target-architecture.md:442-498` defines a planned `lib/exercise-content/` deep module that **folds `capabilityContentService.ts`** (~456 LOC) into a `resolver.ts` + `byType/<exerciseType>.ts` polymorphic structure.
- `docs/current-system/modules/capabilities.md:210` states: *"`supportedSourceKinds: ['item']` is the current ceiling. ... The capabilityContentService fold (per `docs/target-architecture.md`) widens this."* — naming the fold as the legitimate path.

**What this means concretely.**

| PR | Status | Why |
|---|---|---|
| PR 0 — agent spec | proceed | doc-only, no module surface |
| PR 1 — artifact emitter | proceed | publish-pipeline-side; doesn't touch `capabilityContentService.ts`; no shallow-module concern |
| PR 1a — L5/L7/L8 content | proceed | content authoring; runs after PR 0 |
| PRs 2–7 + capstone | **paused** | need a fold-decision before landing |

**The decision to make.**

- **(α) Fold first.** Plan and ship `lib/exercise-content/` per the target architecture, then re-attempt PRs 2–7 against the new structure. PRs 2 and 3 likely collapse into one `byType/cloze.ts` + one `byType/clozeMcq.ts` extension; PRs 4–7 simplify or merge in. Architectural integrity preserved. Cost: fold is a separate plan (~1–2 weeks).
- **(β) Fold + dialogue_line as one wave.** Single combined plan whose fold IS the vehicle for the source-kind widening. ~2.5 weeks but produces a coherent narrative.
- **(γ) Accept the scaffold drift.** Ship PRs 2–7 as drafted, knowing the parallel branches will be ripped out at the fold. Fastest in the short term; deliberate technical debt; requires a tracking note pinning the cleanup to whoever owns the fold.

**D1–D6 remain valid** regardless of the fold decision. The decisions about artifact shape, builder input nullability, speaker handling, agent spec, and content authoring all stand. What changes is the seams those decisions land at.

**Action before PR 2 starts:** a separate planning session drafts `docs/plans/<date>-lib-exercise-content-fold.md` grounded in `docs/target-architecture.md:442-498` and `docs/current-system/modules/capabilities.md`. Architect-review that plan, then choose (α), (β), or (γ).

---

## PR sequence

One PR per deep module, in dependency order. Each PR's diff is independently reviewable and has a green test gate the next PR can depend on.

### PR 0 — Cloze-creator agent spec update (prerequisite)

**Scope:** edit `.claude/agents/cloze-creator.md` to:
- Use `line.text` from `lesson.ts` as the slug for dialogue cloze entries (D6); update the `:91` spec section accordingly.
- Emit a new `cloze_answer: string` field on dialogue cloze entries — the word that fills the `___` blank (D5).

This must land **before** PR 1, otherwise the next agent run produces entries that PR 1's artifact emitter can't consume. Run the agent-spec through its own review-loop sign-off (per the feedback memory `feedback_spec_review_loop.md`).

**Test gate:** N/A (doc-only); manual confirmation that a fresh `cloze-creator` invocation on a sample lesson produces a `cloze_answer` field.

### PR 1 — Artifact emitter in the capability-stage runner

**Scope:**
- New helper `scripts/lib/pipeline/capability-stage/projectors/dialogueArtifacts.ts`. Takes `(contextualClozeCapabilities, clozeContexts, sections)`, returns `CapabilityArtifactInput[]` with three entries per cap: `cloze_context`, `cloze_answer`, `translation:l1`. The helper does **not** route through `buildPayloadForKind` — it builds payloads directly so `content-pipeline-output.ts:476-481`'s throw-on-unknown-kind logic is unaffected.
- Payload shapes:
  - `cloze_context.payload_json` = `{ source_text, line_text, speaker, source_ref }` (per D1).
  - `cloze_answer.payload_json` = `{ value: '<the blanked word>' }`.
  - `translation:l1.payload_json` = `{ value: '<NL translation>' }` (from `cloze-contexts.ts` entry's `translation_text`).
- Extend the cloze-contexts staging schema in `projectors/vocab.ts` (`VocabStagingClozeContext`) with optional `cloze_answer`.
- One-time data migration: re-author L9's 7 existing dialogue cloze entries in `scripts/data/staging/lesson-9/cloze-contexts.ts` to add the new `cloze_answer` field. Five-line touch per entry.
- Wire the new artifacts into runner.ts step 7 (or a new step 7b) so they get upserted alongside the existing exerciseAssets-driven artifacts, using the same `upsertCapabilityArtifacts` adapter call as runner.ts:447 (NOT the `buildPayloadForKind` path).

**Test gate:**
- Unit: `dialogueArtifacts.test.ts` — given mock `clozeContexts` + `sections`, returns the expected three artifacts per matching dialogue line; skips entries with no matching line; skips entries with no `cloze_answer` and emits a CRITICAL finding for those.
- Live verification: re-publish L9 and assert `select count(*) from capability_artifacts where capability_id in (select id from learning_capabilities where source_kind='dialogue_line' and lesson_id=<L9>) = 21` (3 artifacts × 7 caps).

**Risk:** changes the publish pipeline. Mitigation: idempotent upsert keyed on `(capability_id, artifact_kind, artifact_fingerprint)` (the existing convention at adapter.ts:221). **Rollback:** if PR 1 ships bad artifacts (wrong `cloze_answer`, malformed `source_text`), correct the cloze-contexts entries and re-publish; the upsert overwrites by fingerprint, so rollback is a same-PR-shape edit.

### PR 1a — Author dialogue cloze entries for L5/L7/L8 (content task, can run in parallel with PR 1)

**Scope:** dispatch `cloze-creator` (with PR 0's updated spec) on L5, L7, L8 to produce dialogue cloze entries in their `cloze-contexts.ts`. Sized at ~5 entries for L5, ~11 for L7, ~17 for L8 (after the eligibility gate — items <6 tokens are skipped). The agent's output is reviewed before re-publishing.

**Test gate:** lint passes (`bun scripts/lint-staging.ts <N>`); manual review of authored entries.

**Note:** L5/L7/L8 won't show dialogue clozes to users until PRs 2–6 land. This PR is content prep, not a release event.

### PR 2 — Open the runtime front door for dialogue_line

**Scope:**
- `src/services/capabilityContentService.ts:215-220` — change the guard to accept `'item'` and `'dialogue_line'`.
- **Resolution structure choice:** add a parallel `dialogueBlocks` array alongside the existing `itemBlocks` array, with its own pass-2 loop. The item resolution path stays untouched (lower regression risk); dialogue_line gets a clearly-named branch.
- Pass-2 for dialogue blocks:
  - Skip `fetchLearningItemsByKey` for these blocks.
  - Still call `fetchArtifacts(capabilityIds)` — the dialogue artifacts written by PR 1 are read here.
  - Build the `RawProjectorInput` from the artifact payloads: `dialogueLine = { text: cloze_context.line_text, speaker: cloze_context.speaker, sourceRef: cloze_context.source_ref, targetWord: cloze_answer.value }`. No `lesson_sections` read needed at runtime.
- New helper `extractDialogueLineRef(sourceRef: string): { lessonSlug, sectionIndex, lineIndex } | null` in `capabilityContentService.internal.ts` next to existing `extractItemKey`. Parses `lesson-N/section-M/line-K`; returns null on malformed refs.
- New `ResolutionReasonCode` values in `@/lib/exercises/resolutionReasons`: `dialogue_line_ref_unparseable` and `dialogue_line_artifact_missing`. Logged via existing `logResolutionFailure` (capabilityContentService.ts:155-173) → `capability_resolution_failure_events` table.

**Test gate:**
- Unit: a `dialogue_line:contextual_cloze` block resolves to a non-null context with `dialogueLine.text` populated and the three artifacts available. No `learningItem` is fetched. No `unsupported_source_kind` failure.
- Unit: a block with malformed `source_ref` (e.g. `lesson-9/section-1`, no `line-K`) fails with `dialogue_line_ref_unparseable`.
- Unit: a block where one of the three artifacts is missing fails with `dialogue_line_artifact_missing`.
- Integration: a SessionBlock for an L9 dialogue cloze, resolved through `loadCapabilitySessionPlanForUser`, yields a render-ready row.

**Risk:** the resolver was carefully scoped to items. Mitigation: dialogue_line goes through a parallel array + branch; item code path unchanged.

### PR 3 — Widen render contracts + builder input shape

**Scope:**
- `renderContracts.ts:73-82`: `cloze`/`cloze_mcq` get `supportedSourceKinds: ['item', 'dialogue_line']`.
- `ContractInputShapes.cloze` becomes `BuilderBase & { learningItem: LearningItem | null; clozeContext: ItemContext | null; dialogueLine: DialogueLineInput | null }` where `DialogueLineInput = { text: string; speaker: string | null; sourceRef: string; targetWord: string }`. Same shape addition for `cloze_mcq` (still preserving its variant-vs-clozeContext nullability).
- Define a new `DialogueLineInput` type next to `BuilderBase`.
- `projectBuilderInput` (renderContracts.ts:206-333):
  - **Relax the universal `learningItem`-required guard at `renderContracts.ts:212-218`.** Today it short-circuits any input with a null `learningItem` to `item_not_found`. Replace with per-exercise narrowing: for `cloze`/`cloze_mcq`, accept null `learningItem` if `dialogueLine` is non-null; for every other exercise type, keep the existing `item_not_found` fail.
  - Add a new branch for dialogue_line caps: enforces the invariant "exactly one of `learningItem` or `dialogueLine` is non-null"; returns the narrowed shape.
- Update `RawProjectorInput` (renderContracts.ts:135-146) to include `dialogueLine: DialogueLineInput | null`.
- Remove the lock-in test at `renderContracts.test.ts:144-148`; replace with a test that asserts `cloze` and `cloze_mcq` support `dialogue_line` AND every other exercise type still does not.

**Test gate:**
- Unit: `projectBuilderInput('cloze', { learningItem: null, dialogueLine: {...}, ... })` returns ok with the dialogue line in the output. `projectBuilderInput('cloze', { learningItem: null, dialogueLine: null, ... })` returns fail with a clear reasonCode.
- Unit: `projectBuilderInput('dictation', { learningItem: null, dialogueLine: {...}, ... })` still fails with `item_not_found` (relaxation is scoped to cloze/cloze_mcq).
- Exhaustiveness check (compile-time) stays green via `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK`.

**Risk:** ContractInputShapes changes touch every builder via its `BuilderInputFor<T>` type. Mitigation: the change is additive (new nullable field) so existing item-cloze builders compile unchanged.

### PR 4 — Builder handles dialogue_line input

**Scope:**
- `src/lib/exercises/builders/Cloze.ts` — branch on `input.learningItem != null`:
  - Item path (current): `targetWord = input.learningItem.base_text; sentence = input.clozeContext.source_text; translation = input.clozeContext.translation_text`.
  - Dialogue path: `targetWord = input.dialogueLine.targetWord; sentence = <artifact: cloze_context.value>; translation = <artifact: translation:l1.value>`. The artifacts are in `input.artifactsByKind`.
- Same change in `ClozeMcq.ts`.
- The `exerciseItem` shape stays identical — the UI doesn't need to know which source kind drove it.

**Test gate:**
- Unit: `buildCloze({learningItem: null, dialogueLine: {...}, artifactsByKind: <mock with 3 kinds>, ...})` returns the expected `exerciseItem` with sentence, targetWord, translation populated.
- Unit: same call with missing `cloze_context` artifact returns a `malformed_cloze` fail (same reasonCode the item path uses).

**Risk:** low. The builder is a pure projection; new branch parallels existing.

### PR 5 — Session-builder eligibility

**Scope:** Confirm `pedagogy.ts:107-114` already classifies `contextual_cloze` as `isNewProductionTask` — yes, it does. The block scheduler doesn't filter on source kind today (it filters on capability type), so dialogue_line caps should flow through automatically once the resolver accepts them. **This PR is verification + tests, not new code.**

Files PR 5's verification step reads end-to-end (no edits expected):
- `src/lib/session-builder/pedagogy.ts` — eligibility classification, `isPattern` / `isNewProductionTask` / `isHiddenAudioTask` source-kind handling.
- `src/lib/session-builder/loadBudget.ts` — pacing + budget rules; check for any `sourceKind === 'item'` filter.
- `src/lib/session-builder/model.ts` — block selection model shape; confirm no source-kind assumption.
- `src/lib/session-builder/adapter.ts` (if present) — DB → planner shape transformation.

If any of these files has an `item`-only filter, escalate to a PR 5b code-change scope.

**Test gate:**
- Unit: a planner run with one item cloze + one dialogue_line cloze cap returns a session containing both, with the dialogue_line cap correctly weighted as a production task.
- Integration: end-to-end (publish → load → schedule) yields a SessionBlock list containing the dialogue cloze.

### PR 6 — UI surfaces the dialogue cloze

**Scope:**
- `src/components/exercises/implementations/Cloze.tsx` already renders `clozeContext.sentence` with `___` replaced by an input. For dialogue cloze, this works as-is because PR 4 makes the builder produce the same `exerciseItem.clozeContext` shape.
- Extend the exerciseItem shape with optional `speaker: string | null` and have Cloze.tsx render it as a prefix (e.g. *Titin:* Aku tidak ___ tinggal di rumah terus.). Context aids comprehension and aligns with how the lesson reader presents dialogues.
- New fixture file `src/components/exercises/primitives/fixtures/dialogue-cloze.ts` so the design-lab page can render the dialogue-line variant alongside the vocab one without inline data.
- Visual confirmation in `/admin/design-lab` — Cloze primitive renders a dialogue-line example next to a vocab example, both fixtures pulled from the new file.
- `src/components/exercises/implementations/ClozeMcq.tsx` — same treatment.

**Test gate:**
- Component test: `<Cloze exerciseItem={dialogueClozeFixture} />` renders the sentence, the input, and the speaker prefix.
- Component test: `<Cloze exerciseItem={vocabClozeFixture} />` (existing path) still renders with no speaker prefix (null `speaker` → no element).
- Visual: `/admin/design-lab` shows both flavours side by side.

### PR 7 — Live-DB health check

**Scope:** `scripts/check-supabase-deep.ts` HC11 — for every `dialogue_line:contextual_cloze` cap:
- All three required artifacts exist (`cloze_context`, `cloze_answer`, `translation:l1`) with `quality_status='approved'`.
- The `cloze_context.payload_json.source_text` contains the literal `___` marker (mirrors the runtime guard at `Cloze.ts:9`; catches malformed artifacts before they reach a learner).

Mirrors HC9/HC10 pattern.

**Test gate:** the check runs locally; turns green after L9 is re-published with PR 1's artifact emitter.

### Capstone — end-to-end

**Scope:** test in `src/__tests__/` that:
1. Mocks Supabase with one lesson having one dialogue section + one dialogue cloze artifact set (all three artifacts populated).
2. Loads the session via the production code path.
3. Asserts the Cloze component renders the dialogue line (with speaker prefix).
4. Simulates a correct answer.
5. Asserts the mocked `deps.service.commitCapabilityAnswerReport` was called with the dialogue_line cap's `capabilityId`.

**Why this matters:** locks in that all six deep modules cooperate. Catches regressions in any single module's interface.

## What's deliberately NOT in this plan

- **`affixed_form_pair:root_derived_*` renderable.** Next pilot, after dialogue_line ships. Uses the same module map; the open question for it is "what is the new exercise UI?" since no current exercise serves paired-form recognition.
- **Pattern-sourced caps (94 rows) renderable.** These probably shouldn't be renderable from the projection-capability path — grammar exercises already work via `exercise_variants`. Either delete the pattern projector or refactor grammar exercises to consume capability-projected caps. Separate strategic decision; not blocked by this plan.
- **Podcast capabilities.** Larger; the projection pipeline doesn't emit podcast caps yet.
- **Cleanup of 13 stale inactive dialogue_chunks on L4** and the **45 ghost learning_items from the legacy seeder** — separate one-shot migrations, tracked in `~/.claude/projects/.../memory/project_pipeline_followup_bugs.md`.

## Open questions (to resolve before approval)

- D1–D6 above — each has a recommendation but needs human sign-off.
- ~~The cloze-creator agent's prompt needs revising.~~ **Resolved:** scheduled as PR 0 (prerequisite to PR 1).
- Per the runtime check at `capabilityContentService.ts:217`'s comment about "out of PR-2 scope" (a stale reference to the original 2026-05-02 capability-runtime spec, **not** PR 2 of this plan), there may be additional gates in the resolver downstream that assume `learningItem` is non-null. PR 2's verification step should walk that file end-to-end.
- ~~Does the FSRS review processor at `src/lib/reviews/capabilityReviewProcessor.ts` have any code path that assumes the capability's referenced item is a learning_item?~~ **Resolved:** verified source-kind-agnostic — the processor operates on `capabilityId` / `canonicalKeySnapshot` / `schedulerSnapshot` / `activationState` only. No 9th module needed.
- Schema verification (PR 2 or PR 5 test gate): confirm `capability_review_events` table has no NOT NULL `learning_item_id` column that would block dialogue_line reviews. Read the DDL at `scripts/migration.sql` for the table definition.
- Should the `cloze_context` artifact also carry the unblanked line text separately (D1's recommended payload includes `line_text` to address this), or rely on the consumer to reconstruct from the source_text by removing `___`? The recommended payload chooses the former — confirm.

## Sizing + parallelism

| PR | Estimate | Risk | Depends on |
|---|---|---|---|
| 0 — agent-spec update | trivial (½ day) | very low — doc only | — |
| 1 — artifact emitter | medium (2–3 days) | medium — pipeline change | PR 0 |
| 1a — author L5/L7/L8 cloze entries | small (1 day) | low — content task | PR 0 (can run parallel to PR 1) |
| 2 — resolver front door | medium (1–2 days) | medium — touches the resolver | PR 1 |
| 3 — contracts + projector | small (1 day) | low — additive type change | — (can land before PR 2) |
| 4 — builder | trivial (½ day) | low — pure function | PR 3 |
| 5 — session-builder verification | trivial (½ day) | very low — tests only | PR 3 (parallel to PR 4) |
| 6 — UI | small (1 day) | low — additive | PR 4 |
| 7 — HC11 | trivial (½ day) | very low | PR 1 |
| Capstone | small (1 day) | low | PR 6 |

**Total:** roughly 7–10 days end-to-end. Parallel-eligible: PR 1a alongside PR 1; PR 3 alongside PR 1/2; PR 4 + PR 5 after PR 3; PR 7 after PR 1.

## Rollback story

- **PR 1 (artifact emitter)** — idempotent upsert at `adapter.ts:221` (`onConflict: 'capability_id,artifact_kind,artifact_fingerprint'`). If a publish produces bad artifacts, correct the cloze-contexts entry and re-publish the lesson; the upsert overwrites in place. No DDL rollback needed.
- **PR 1a (authored content)** — git revert of the `cloze-contexts.ts` edits + re-publish the affected lesson.
- **PR 2 (resolver)** — feature-flag the dialogue_line branch behind `VITE_DIALOGUE_LINE_CAPS_ENABLED` (off by default for the merge window) so a bad release can be rolled back via env-var change without code rollback. Remove the flag after one stable release.
- **PRs 3–6 (type + builder + UI)** — straightforward git revert; no DB or schema state involved.
- **PR 7 (HC11)** — health checks are idempotent reads; remove the block to disable.

## Observability

PR 2 introduces two new `ResolutionReasonCode` values that get logged via the existing `logResolutionFailure` path at `capabilityContentService.ts:155-173`, writing rows to `capability_resolution_failure_events`:

- `dialogue_line_ref_unparseable` — `source_ref` doesn't match `lesson-N/section-M/line-K`.
- `dialogue_line_artifact_missing` — one or more of the three required artifacts is absent or has `quality_status != 'approved'`.

Both are queryable via the same Supabase dashboard the existing failure codes use. No new logging infrastructure.

## Validation strategy

- After every PR, run `bun run test` + `bun run lint` + `make check-supabase-deep` (the live-DB checks).
- After PR 1, re-publish L9 and confirm HC11 turns green for L9's 7 caps (PR 7 lands later but the artifact set should be present).
- After PR 6, manually test L9 dialogue cloze in dev (`bun run dev`) — pick the exercise, type an answer, verify scoring.

## Supabase Requirements

### Schema changes
None. The capability + capability_artifacts tables already accommodate dialogue_line; the migration column at `scripts/migration.sql` for `capability_artifacts.artifact_kind` is `text` with no enum constraint, so the three new artifact kinds (`cloze_context`, `cloze_answer`, `translation:l1`) work without DDL.

### homelab-configs changes
None.

### Health check additions
- HC11 (PR 7): `scripts/check-supabase-deep.ts` — for every `dialogue_line:contextual_cloze` cap, assert `cloze_context`, `cloze_answer`, and `translation:l1` artifacts exist with `quality_status='approved'`.

## See also

- `docs/current-system/capability-runtime-data-model-gap.md` — the data-model-vs-runtime gap this plan begins closing.
- `docs/adr/0006-every-lesson-derived-capability-has-an-introducing-lesson.md` — `lesson_id` invariant; preserved by this work.
- `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:163-203` — Decision 5b, the existing projection of `dialogue_line:contextual_cloze` caps.
- `.claude/agents/cloze-creator.md:83-103` — the cloze-creator agent's dialogue-cloze mode (to be updated under PR 1).
