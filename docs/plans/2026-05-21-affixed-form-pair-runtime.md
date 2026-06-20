---
status: shipped
implementation: PR #94
merged_at: 2026-05-23
---

# Affixed-form-pair runtime — the third source kind reaches learners

## Goal

Make `affixed_form_pair:root_derived_*` capabilities visible to learners as `typed_recall` exercises. This is the third source-kind pilot in the `lib/exercise-content/` deep module, following item (always-shipped) and dialogue_line (shipped 2026-05-21 via PR-B/PR-C of the fold plan `docs/plans/2026-05-21-lib-exercise-content-fold.md`).

`cued_recall` for affixed_form_pair is intentionally deferred (D3/D4 below — distractor strategy needs separate design + content authoring). `typed_recall` is the smallest valid end-to-end slice that locks in the new architectural seam: a non-item source kind whose **artifact set is completely disjoint from the item path**, requiring `RenderContract.requiredArtifacts` to become source-kind-aware.

## Plan grounding

Per `CLAUDE.md` plan-grounding rule, here is the audit against the target architecture + per-module specs for every surface this plan touches:

| Surface | Target arch reference | Module spec reference | Plan target lands at the right seam? |
|---|---|---|---|
| `src/lib/exercise-content/adapter.ts` | `docs/target-architecture.md:442-498` (lib/exercise-content fold) | `docs/current-system/modules/exercise-content.md` §3 (bucketing dispatch), §6 "Adapter split deferred" | Yes — adds a 3rd per-kind fetcher; this is exactly the trigger §6 names for the `byKind/` split. |
| `src/lib/exercise-content/byType/typedRecall.ts` | `docs/target-architecture.md:478-489` (byType/ packagers) | `docs/current-system/modules/exercise-content.md` §4 invariant "byType packagers are source-kind-agnostic" | Yes — packager branches on which populated field to read, not on source_kind directly. Mirrors `byType/cloze.ts` dialogue branch (PR-B). |
| `src/lib/capabilities/renderContracts.ts` | `docs/target-architecture.md:442-498` consumed by exercise-content | `docs/current-system/modules/capabilities.md` §2 + §4 ("`supportedSourceKinds: ['item']` is the current ceiling") + §6 ("supported SourceKinds ceiling") | Yes — widens cloze-style. Adds source-kind-keyed `requiredArtifacts` (new decision D2). |
| `src/lib/capabilities/capabilityContracts.ts` | n/a (not in target arch surface list) | `docs/current-system/modules/capabilities.md` §3.1 (the validateCapability flow) | Yes — the union semantics named at §3.1:120 breaks when source kinds diverge in their artifact sets; this plan addresses that with source-kind-keyed `requiredArtifacts`. |
| `src/components/exercises/implementations/TypedRecall.tsx` | n/a (UI; outside lib/) | `docs/current-system/modules/experience.md` (see "What this spec does NOT cover" at exercise-content §7) | Yes — UI branch parallels the `Cloze.tsx` speaker-prefix pattern (PR-C). |
| `src/lib/session-builder/pedagogy.ts` (no change expected) | `docs/target-architecture.md` (session-builder section) | `docs/current-system/modules/session-builder.md` | The staging-gate carve-out at `pedagogy.ts:289-290` already names `affixed_form_pair` as exempt (since the dialogue_line PR-C). No edit. |
| `scripts/lib/pipeline/capability-stage/projectors/morphology.ts` (no change expected) | n/a (publish pipeline) | none — file is a 33-LOC slug-set helper | The artifact emission already runs through `scripts/lib/content-pipeline-output.ts:430-441` (`root_derived_pair` + `allomorph_rule` payload builders). Both artifacts are already in the live DB (verified in §"What's broken today"). No publish-side change. |
| `scripts/check-supabase-deep.ts` | n/a (health checks) | none | New HC12 mirrors HC11's pattern. |

Result: every touched module is covered by the target architecture and an up-to-date module spec, and the plan's surfaces map to the same seams those specs already name. The `lib/exercise-content` fold is shipped (`docs/plans/2026-05-21-lib-exercise-content-fold.md` status: shipped) so this plan lands on the new structure, not the deleted legacy `src/services/capabilityContentService.ts`.

## Why affixed_form_pair next

- **Vertical slice across the same eight modules as dialogue_line** (publish pipeline → contracts → adapter → builder → UI → session-builder → progress → health) — the third pilot tests whether the lib/exercise-content seams are stable enough for non-trivial reuse.
- **Artifact path is already live.** Unlike dialogue_line (where PR 1 wrote a new artifact emitter), the morphology artifacts are already in the DB: `scripts/lib/content-pipeline-output.ts:430-441` already emits `root_derived_pair` and `allomorph_rule` payloads, and a live-DB snapshot (§ below) confirms all four caps have both artifacts approved. So no publish-pipeline code change; only a re-publish to flip readiness.
- **Surfaces the source-kind-keyed `requiredArtifacts` decision.** Dialogue_line dodged the question because cloze's contract artifacts happened to equal contextual_cloze's cap artifacts (both `[cloze_context, cloze_answer, translation:l1]`). For affixed_form_pair, the contract artifacts (`[base_text, meaning:l1, accepted_answers:id]` for typed_recall) and the cap artifacts (`[root_derived_pair, allomorph_rule]` for root_derived_recall) are fully disjoint — the contract layer must learn source kinds.
- **Real pedagogical value.** Morphology exercises ("the meN- prefix of `baca` is _") drill a productive grammar fact that vocabulary cloze cannot teach. The four L9 caps are the smallest non-trivial unit (one prefix pattern, two root words, two directions).

## What's broken today (the snapshot)

Live DB query (executed 2026-05-21, the day this plan was drafted):

```sql
select source_kind, capability_type, count(*) from indonesian.learning_capabilities
 where source_kind = 'affixed_form_pair' group by 1, 2;
-- root_derived_recognition: 2
-- root_derived_recall: 2
```

All four caps are on L9 (`lesson_id = 93c54586-3542-47ec-9a60-26a97c8c5a3d`). Snapshot per cap (also live):

| capability_type | direction | source_ref | required artifacts | artifact rows in DB |
|---|---|---|---|---|
| `root_derived_recall` | `root_to_derived` | `lesson-9/morphology/meN-baca-membaca` | `[root_derived_pair, allomorph_rule]` | both present, both `quality_status='approved'` |
| `root_derived_recognition` | `derived_to_root` | `lesson-9/morphology/meN-baca-membaca` | `[root_derived_pair, allomorph_rule]` | both present, both `quality_status='approved'` |
| `root_derived_recall` | `root_to_derived` | `lesson-9/morphology/meN-tulis-menulis` | `[root_derived_pair, allomorph_rule]` | both present, both `quality_status='approved'` |
| `root_derived_recognition` | `derived_to_root` | `lesson-9/morphology/meN-tulis-menulis` | `[root_derived_pair, allomorph_rule]` | both present, both `quality_status='approved'` |

Artifact payload shapes (verified via DB sample):

- `root_derived_pair.artifact_json` = `{ root: "baca", derived: "membaca" }` (for the first pair).
- `allomorph_rule.artifact_json` = `{ rule: "meN- becomes mem- before roots beginning with b: baca -> membaca." }`.

These payloads are written by `scripts/lib/content-pipeline-output.ts:430-441`:

```ts
case 'root_derived_pair': {
  const pair = requireAffixedFormPair(capability, ctx, kind)
  return { root: pair.root, derived: pair.derived }
}
case 'allomorph_rule': {
  const pair = requireAffixedFormPair(capability, ctx, kind)
  if (!pair.allomorphRule) { throw new Error(...) }
  return { rule: pair.allomorphRule }
}
```

Why they don't render today:

1. **Bucketing rejects the source kind.** `src/lib/exercise-content/adapter.ts:154-160` (the `bucketByDecodedSourceKind` else-branch) routes any source kind that isn't `item` or `dialogue_line` to a `unsupported_source_kind` fail context — including `affixed_form_pair`.
2. **No `cued_recall` or `typed_recall` contract supports the source kind.** `src/lib/capabilities/renderContracts.ts:53` declares `cued_recall.supportedSourceKinds: ['item']`; line 58 the same for `typed_recall`. Both name `root_derived_recognition` + `root_derived_recall` in their `capabilityTypes` arrays (lines 52, 57) but the source-kind filter immediately rejects the four caps in `capabilityContracts.ts:73`.
3. **The validator's artifact-union breaks.** `src/lib/capabilities/capabilityContracts.ts:100-106` unions `contract.requiredArtifacts` with `cap.requiredArtifacts`. For an `affixed_form_pair:root_derived_recall` cap routed to `typed_recall`, the union would be `{base_text, meaning:l1, accepted_answers:id, root_derived_pair, allomorph_rule}` — but the cap only has `root_derived_pair` + `allomorph_rule`. The contract layer must learn that `typed_recall` requires **different** artifacts under the `affixed_form_pair` source kind.
4. **The projector's universal `learningItem`-required guard.** `renderContracts.ts:269-275` (`projectBuilderInput`) fails any input with a null `learningItem` unless the exercise is `cloze` (the dialogue_line carve-out). Needs widening to also accept `typed_recall` + (if shipped) `cued_recall` when `affixedFormPair` is populated.
5. **`ContractInputShapes.typed_recall` requires a non-null `LearningItem` + `ItemMeaning`.** `renderContracts.ts:225` — needs to be made honestly nullable, with a new optional `affixedFormPair` field, mirroring how `cloze` was made nullable in PR-B (`renderContracts.ts:229`).
6. **The `typed_recall` builder reads `input.learningItem.base_text` directly.** `byType/typedRecall.ts:11-19` produces an `ExerciseItem` that carries the `learningItem` itself; `TypedRecall.tsx:21` derefs `item!` and reads `learningItem.base_text` (line 31). Needs to branch on `input.affixedFormPair != null`.
7. **`TypedRecall.tsx` reads `meanings`/`answerVariants` for the prompt + accepted variants.** For affixed_form_pair caps, none of these exist. The UI must either receive a new pre-packaged `affixedFormPairData` slot on the exerciseItem, or read fields from the builder via the existing slots after branching.
8. **`readiness_status='unknown'` and `publication_status='draft'` in DB.** All four caps. The session-builder filters at `src/lib/session-builder/adapter.ts:268-269` on `.eq('readiness_status', 'ready').eq('publication_status', 'published')`, so even if the resolver opened the door, the session-builder would never see them. Re-publishing L9 after the contract widening flips them via the promotion step at `scripts/lib/pipeline/capability-stage/runner.ts:617-642` (`validateCapability` then returns `ready`, then `applyPromotionPlan` sets both columns).

## Deep modules that participate

| # | Module | Where | What changes here |
|---|---|---|---|
| 1 | Render contracts + projector | `src/lib/capabilities/renderContracts.ts` | Widen `typed_recall.supportedSourceKinds` to `['item', 'affixed_form_pair']`. Add `AffixedFormPairInput`. Add `affixedFormPair` to `RawProjectorInput`. Make `ContractInputShapes.typed_recall` honestly nullable. Extend `projectBuilderInput`'s `acceptsDialogueLine` carve-out into a generic source-kind acceptance check. Adopt source-kind-keyed `requiredArtifacts` for the two entries that span source kinds (decision D2). |
| 2 | Capability validator | `src/lib/capabilities/capabilityContracts.ts` | Validator pulls per-source-kind artifact list from the contract (decision D2). |
| 3 | Capability runtime adapter | `src/lib/exercise-content/adapter.ts` | Extend `BucketingResult.buckets` with `affixed_form_pair`. Extend `bucketByDecodedSourceKind` with an affixed-form-pair branch (validates the `lesson-N/morphology/<slug>` sourceRef shape). Add `fetchForAffixedFormPairBlocks` (artifacts-only, no `learning_items` join — same shape as `fetchForDialogueLineBlocks`). Add the new fetcher to the `loadBlockData` Promise.all. |
| 4 | Resolution reasons | `src/lib/exercises/resolutionReasons.ts` | Add `affixed_form_pair_ref_unparseable` and `affixed_form_pair_artifact_missing`. |
| 5 | typed_recall builder | `src/lib/exercise-content/byType/typedRecall.ts` | Branch on `input.affixedFormPair != null`. The dialogue-line branch in `byType/cloze.ts` (post-PR-B) is the precedent. The exerciseItem grows an optional `affixedFormPairData` slot for the UI to read. |
| 6 | ExerciseItem shape | `src/types/learning.ts` | Add `affixedFormPairData?: { promptText, acceptedAnswer, direction, allomorphRule, root, derived }` alongside `clozeContext`, `cuedRecallData`, etc. |
| 7 | UI | `src/components/exercises/implementations/TypedRecall.tsx` | Branch on `exerciseItem.affixedFormPairData`. If present, render the morphology prompt instead of the item meaning; check the typed answer against `acceptedAnswer` directly. |
| 8 | Design-lab fixture | (none in PR 1) | Dropped per round-2 architect review — the dialogue-cloze.ts fixture has no DesignLab caller; creating a second unwired fixture file is dead surface. A future plan that actually wires DesignLab.tsx creates both fixture files in scope. |
| 9 | Session-builder eligibility | `src/lib/session-builder/pedagogy.ts` (no edit) | The staging-gate carve-out at `pedagogy.ts:289-290` already exempts `affixed_form_pair`. `isPattern` at `pedagogy.ts:98-104` already classifies affixed_form_pair caps as patterns. The `loadBudget.maxNewPatterns` slot governs them. **Verification only.** |
| 10 | Reviews / FSRS | `src/lib/reviews/capabilityReviewProcessor.ts` (no edit) | Verified source-kind-agnostic during the dialogue_line plan (per `docs/plans/2026-05-21-dialogue-line-contextual-cloze.md` §"Open questions"). Reads `capabilityId` / `canonicalKeySnapshot` / `schedulerSnapshot` / `activationState` only. **Verification only.** |
| 11 | Health checks | `scripts/check-supabase-deep.ts` | Add HC12: for every `affixed_form_pair` cap, both `root_derived_pair` and `allomorph_rule` artifacts exist with `quality_status='approved'`, and each artifact's payload has the required fields populated. Mirrors HC11. |

## Decisions

### D1 — Per-exercise prompt shape for typed_recall on affixed_form_pair

The cap carries a `direction` field (`'root_to_derived'` for recall caps; `'derived_to_root'` for recognition caps — verified via DB snapshot above), and the artifacts give `root`, `derived`, `rule`. What does the learner see and what do they type?

- **(a) Direction-driven prompt with rule as a hint.** For `root_to_derived`: prompt is `"Form the meN- form of:\n**baca**\nRule: meN- + b → mem-"`, learner types `membaca`. For `derived_to_root`: prompt is `"What is the root of:\n**membaca**"`, learner types `baca`. The allomorph rule is shown only on the recall (productive) side because it scaffolds the production; the recognition (receptive) side hides it to test learned association.
- **(b) Direction-driven prompt without rule.** Same as (a) but no rule shown anywhere. Pure form-pair drill. Allomorph rule shows only in the Doorgaan / explanation screen (per the existing wrong-answer flow — see `feedback_exercise_answer_screen.md`).
- **(c) Show both root + derived with one side blanked.** Cloze-shaped prompt (`"baca → _"` for recall; `"_ ← membaca"` for recognition). Visually consistent with cloze.

**Recommendation: (b).** Two reasons. First, the allomorph rule is doctrinally an *explanation* of why the answer is what it is; per the existing wrong-answer flow this belongs on the Doorgaan screen, not on the prompt. Surfacing it pre-answer leaks the answer for transparent rules (`meN- + b → mem-` literally spells out the answer for `baca`). Second, (b) keeps the prompt minimal — the surface area for the first pilot stays a single string + single input, matching the existing item-typed-recall UX without divergent affordances. (c) introduces a non-trivial new UI shape that doesn't pay for itself in a 4-cap pilot. Open question for D5 on the explanation-screen wiring.

### D2 — Source-kind-keyed `requiredArtifacts` in `RenderContract`

Today `RenderContract.requiredArtifacts: readonly ArtifactKind[]` is one flat list (`renderContracts.ts:42-43`). The validator at `capabilityContracts.ts:100-106` unions it with `cap.requiredArtifacts` and checks every kind is approved. This works for source kinds whose artifact sets match the item path's (dialogue_line accidentally matched). It does **not** work for affixed_form_pair — the contract requires `[base_text, meaning:l1, accepted_answers:id]` but the cap requires `[root_derived_pair, allomorph_rule]`. Union → false negative → blocked.

- **(a) Source-kind-keyed `requiredArtifacts`.** Change `RenderContract.requiredArtifacts` from `readonly ArtifactKind[]` to `Record<CapabilitySourceKind, readonly ArtifactKind[]>`. Validator looks up the entry for the cap's source kind. Type-level enforcement: every entry in `supportedSourceKinds` must have an artifact list (asserted with a type-level helper similar to the existing `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK`).
- **(b) Side-channel `requiredArtifactsBySourceKindOverride`.** Keep the flat `requiredArtifacts` (item-only default); add an optional `requiredArtifactsBySourceKindOverride?: Partial<Record<CapabilitySourceKind, readonly ArtifactKind[]>>` on the contract. Validator falls back to the flat list when no override is set.
- **(c) Drop `contract.requiredArtifacts` entirely; trust `cap.requiredArtifacts`.** Removes the contract-level safety net (catches builder/cap drift), but the cap's requiredArtifacts is already the authoritative declaration per `capabilityContracts.ts:86-92`'s comment.

**Recommendation: (a).** The data already says contracts ARE per-source-kind — DB snapshot above shows form_recall caps have `[meaning:l1, base_text, accepted_answers:id]` and root_derived_recall caps have `[root_derived_pair, allomorph_rule]`; same exercise serves both with disjoint artifact sets. The flat-list shape was always a special case (item-only). Making it source-kind-keyed makes the contract honest about what it always was. The exhaustiveness check (every entry in `supportedSourceKinds` has an artifact list) catches mismatches at compile time. (b) is a workaround that ships the source-kind drift it would eventually need to model anyway. (c) loses the type-level reconciliation between "what the builder reads" and "what the cap declares it has," which the validator's current comment names as load-bearing.

**Migration: shipped as part of PR 1.** Every contract entry gets its flat list converted into the source-kind-keyed map. Exactly one entry (cloze) already lists two source kinds today and so gets two keys; one entry (typed_recall) gains a new key in this PR; every other entry gets one key. **Total PR 1 scope:**

- **10 entries × single key `{ item: [...] }`** — recognition_mcq, cued_recall, meaning_recall, listening_mcq, dictation, cloze_mcq, contrast_pair, sentence_transformation, constrained_translation, speaking.
- **1 entry × two keys `{ item: [...], dialogue_line: [...] }` (same artifact list)** — cloze, mirroring its pre-existing `supportedSourceKinds: ['item', 'dialogue_line']` widening from PR-B.
- **1 entry × two keys `{ item: [...], affixed_form_pair: [root_derived_pair, allomorph_rule] }` (different artifact lists per key)** — typed_recall, the actual widening this plan introduces.

Net total: **12 contract entries containing 14 `ArtifactKind` lists** (10 entries × 1 single-key list + 2 entries × 2 dual-key lists = 10 + 4 = 14 lists across 12 entries). cued_recall stays at single-key `{ item: [...] }` per D4 — its affixed_form_pair extension lands in the cued_recall follow-up plan, which is a 2-line contract diff once the source-kind-keyed shape exists.

The dead-capability_types entries (`contrast_pair`, `sentence_transformation`, `constrained_translation`, `speaking` — all with `capabilityTypes: []`) get the same `{ item: [...] }` re-wrap to satisfy the type-level exhaustiveness check; their wrappers carry no semantic load but are required by the `Partial<Record<...>>` shape.

### D3 — Distractor pool for cued_recall on affixed_form_pair

`cued_recall` shows the learner the meaning + 4 options where they pick the matching word. For an affixed_form_pair root→derived cap, the "options" are derived forms; for derived→root, the options are root forms. Distractors must be plausibly wrong derived/root forms.

- **(a) Author distractors in staging.** Extend `morphology-patterns.ts` per-pair with `distractors?: { rootDirection: string[], derivedDirection: string[] }`. The artifact emitter writes them into a new `root_derived_distractors` artifact (or extends `root_derived_pair.payload_json`). Runtime reads from the artifact.
- **(b) Generate runtime distractors from sibling affixed_form_pair caps.** Pull other affixed_form_pair derived/root forms from the lesson. For L9: 2 caps total, so 1 distractor max per direction. Insufficient.
- **(c) Generate runtime distractors from rule-based perturbations.** A small ruleset (swap prefix variants: `mem` vs `men` vs `meng`; insert/drop initial consonants) produces plausibly wrong forms. Fragile + Indonesian-specific; not generalizable.
- **(d) Defer cued_recall entirely for this pilot.** Ship only typed_recall (no distractor pool needed). Author distractors + ship cued_recall in a follow-up plan.

**Recommendation: (d) for this plan, with (a) named as the path forward.** Three reasons. First, typed_recall is the smallest valid end-to-end slice that proves the architectural seam (source-kind-keyed contracts + adapter bucket + UI branching); cued_recall multiplies the surface without proving anything new about that seam. Second, (a) requires content-authoring work that's qualitatively different from runtime wiring — agent spec update + per-pair distractor authoring for every morphology pattern. That's a content-pipeline plan, not a runtime plan. Third, the dialogue_line plan made an analogous (not identical) trade-off: cloze typed shipped in PR-B; cloze_mcq deferred. The dialogue_line `cloze_mcq` deferral was a **runtime/fetcher gap** (the lesson-anchored distractor data exists; the fetcher to pull it from dialogue_line lessons doesn't). The affixed_form_pair `cued_recall` deferral is a **content-authoring gap** (the distractor data itself doesn't exist for affixed_form_pair caps). Both deferrals are correct, but this plan establishes a broader precedent than the dialogue_line one: defer when the content layer needs to do work before the runtime can wire it. Track this as a new pattern in the exercise-content module spec §6 once PR 1 ships.

### D4 — typed_recall + cued_recall in one PR, or staged?

Per D3(d): staged. **typed_recall in PR 1. cued_recall in a future plan after distractor authoring lands.**

PR 1 widens `typed_recall.supportedSourceKinds` to `['item', 'affixed_form_pair']` and `typed_recall.requiredArtifacts` to `{ item: [...], affixed_form_pair: [root_derived_pair, allomorph_rule] }`. `cued_recall` stays at `['item']` / `{ item: [...] }`. When the future plan ships cued_recall, the same source-kind-keyed pattern from D2 makes the cued_recall extension a 2-line contract change + a builder branch — the costly part is the distractor authoring.

The session-builder dispatches one exercise type per cap per cycle (via `exerciseResolver` consulting `validateCapability.allowedExercises`). Today a `root_derived_*` cap would map to `[cued_recall, typed_recall]`-shaped allowedExercises if both contracts supported it. With typed_recall-only, the cap maps to `[typed_recall]`. The user sees the same cap as typed_recall every cycle — fine for the pilot. When cued_recall lands, the resolver's preference order (defined elsewhere — `exerciseResolver.ts`'s first-match logic) decides which one wins on any given cycle.

### D5 — UI surfaces: extending exerciseItem or branching on dataKind?

`TypedRecall.tsx:21` does `const learningItem = item!` and derefs `.base_text` at line 31. For an affixed_form_pair cap, `learningItem` is null. Two options:

- **(a) Add `affixedFormPairData?: { promptText, acceptedAnswer, direction, allomorphRule, root, derived }` to `ExerciseItem`.** Mirrors how `clozeContext.speaker` was added in PR-C — an optional slot the UI checks. The builder populates it; the UI branches on `exerciseItem.affixedFormPairData != null`. Item-sourced path is unaffected (continues to deref `learningItem`).
- **(b) Refactor TypedRecall.tsx to read a generic `acceptedAnswer: string + promptText: string` field set on every exerciseItem.** Bigger UI refactor; touches the item path. Out of scope for the pilot.

**Recommendation: (a).** Same pattern as `clozeContext.speaker`. Minimal blast radius. The builder owns the prompt-text composition; the rule-as-Doorgaan-explanation per D1(b) surfaces via the wrong-answer feedback mapping in `feedbackMapping.ts` (see PR 1 step 10 for the exact seam at `feedbackMapping.ts:79`).

**Field shape proposed:**

```ts
affixedFormPairData?: {
  promptText: string            // "Form the meN- form of: baca" or "What is the root of: membaca"
  acceptedAnswer: string        // "membaca" or "baca"
  direction: 'root_to_derived' | 'derived_to_root'
  allomorphRule: string         // surfaced on the Doorgaan/explanation screen per D1(b)
  root: string                  // raw fields for the explanation/feedback layer
  derived: string
}
```

Allomorph rule is carried for the wrong-answer feedback screen (per `feedback_exercise_answer_screen.md` memory: wrong answers show Doorgaan with correct answer + explanation). `feedbackMapping.ts:79` (the head of `case 'typed_recall':`) is the natural seam — it already extracts prompt + correct fields per exerciseType; a sub-branch on `exerciseItem.affixedFormPairData != null` extracts from there and joins the rule as the explanation.

### D6 — Pattern caps (94 inert) in the same plan or separate?

Per `docs/current-system/capability-runtime-data-model-gap.md:85`: *"The 94 pattern-sourced capabilities can probably be removed entirely — grammar exercises are wired through the authored-variants path, not the projection-capability path."*

**Recommendation: separate plan.** Three reasons. First, it's a deletion not a widening — opposite work. Second, before deletion, the projector that emits them (`projectors/grammar.ts`) must be checked for downstream consumers + a cleanup migration drafted + the readiness/progress UI verified not to reference pattern source kinds — that's its own grounding pass. Third, mixing widening + deletion in one plan makes both reviews harder. Track as a future plan; this plan touches pattern caps zero.

### D7 — Adapter file structure: split into `byKind/` directory, or keep single-file?

`src/lib/exercise-content/adapter.ts` is 588 LOC today (verified via `wc -l`). The fold plan's D5 (`docs/plans/2026-05-21-lib-exercise-content-fold.md`) said to split into `adapter/byKind/<sourceKind>.ts` when LOC crosses ~300, "likely with affixed_form_pair, the third bucket." The exercise-content module spec §6 ("Adapter split deferred") repeats this trigger.

- **(a) Split in this plan, as PR 0 (pre-pilot refactor).** Pure mechanical relocation. `adapter.ts` retains bucketing + diagnostic + factory + the `loadBlockData` wiring; `byKind/item.ts` gets `fetchForItemBlocks`; `byKind/dialogueLine.ts` gets `fetchForDialogueLineBlocks`; `byKind/affixedFormPair.ts` is the new file. No behavior change; test baseline preserved.
- **(b) Keep single-file; add affixed-form-pair fetcher inline.** Defer the split to a follow-up. adapter.ts grows to ~700+ LOC.
- **(c) Split in PR 1, alongside the affixed-form-pair work.** Couples a refactor with a feature; harder to review.

**Recommendation: (a).** The trigger has fired exactly as the spec named. PR 0 is a pure refactor with zero behavior change — tests stay green, no contract changes, no runtime regressions. Doing it before PR 1 means the affixed-form-pair fetcher lands in a clean new file (`byKind/affixedFormPair.ts`) instead of growing a single-file monolith. Naming follows camelCase + source-kind convention: `byKind/item.ts`, `byKind/dialogueLine.ts`, `byKind/affixedFormPair.ts`.

**Location of `byKind/`.** The exercise-content module spec at §6 names the target shape as `adapter/byKind/<sourceKind>.ts` (subdirectory inside an `adapter/` folder), which would require renaming `adapter.ts` to `adapter/index.ts` — a larger structural change than the split itself warrants. This plan instead lands `byKind/` as a **sibling of `adapter.ts`** (path: `src/lib/exercise-content/byKind/<sourceKind>.ts`), keeping `adapter.ts` as a single file. Functionally equivalent (the spec's intent — split per-kind fetchers into their own files — is preserved); divergent only on directory layout. The module spec's §6 wording should be updated alongside PR 0 to reflect the chosen layout. Architect to ratify or pick the spec-literal `adapter/index.ts` variant.

## PR sequence

Two PRs total. PR 0 is a pre-pilot refactor (pure relocation, no behavior change); PR 1 is the actual pilot (contracts + adapter fetcher + builder + UI + health check + capstone, vertical-sliced).

### PR 0 — Split `adapter.ts` into `adapter/byKind/<sourceKind>.ts` (refactor)

**Scope:**
- New directory `src/lib/exercise-content/byKind/` (sibling of `adapter.ts`; rationale in D7).
- `byKind/item.ts` — moves `fetchForItemBlocks` + its item-specific helper functions (`fetchLearningItemsByKey`, `fetchLearningItemsById`, `fetchMeanings`, `fetchContexts`, `fetchAnswerVariants`, `fetchActiveVariants`, `fetchDistractorPool`) from `adapter.ts`. Imports `fetchArtifacts` + `makeFailContext` + the shared types from `adapter.ts`.
- `byKind/dialogueLine.ts` — moves `fetchForDialogueLineBlocks` from `adapter.ts`. Same import contract.
- `byKind/types.ts` (optional, only if a circular-import shows up) — shared `CapabilityArtifactRow` + `SupabaseSchemaClient` types. If unused, omit; types stay in `adapter.ts`.
- `adapter.ts` — keeps `decodeCanonicalKey`, `extractItemKey`, `bucketByDecodedSourceKind`, `makeFailContext`, `trimPayloadSnapshot`, the `Adapter` interface, `createAdapter` factory, `loadBlockData` (now importing the two per-kind fetchers from `byKind/`), `logResolutionFailure`, the per-block-data types, **and `fetchArtifacts`** (shared by every per-kind fetcher that reads `capability_artifacts`). `CapabilityArtifactRow` + `SupabaseSchemaClient` types stay here too unless the optional `byKind/types.ts` file is created.
- Test file `__tests__/adapter.test.ts` stays as-is — exercises `decodeCanonicalKey`, `extractItemKey`, `bucketByDecodedSourceKind` which all remain in `adapter.ts`. No new test scaffolding required for PR 0; the resolver + byType tests cover the per-kind fetchers end-to-end.

**Test gate:**
- Run `bun run test` — 1212 passing, 0 lint errors, 4 pre-existing warnings, build clean.
- No new tests required; the existing tests cover the relocated logic at the same call sites.

**Risk:** Very low. Pure relocation. No type changes, no behavior changes. If renamed exports break an importer, TS catches it.

**Rollback:** Single `git revert`.

### PR 1 — Wire `affixed_form_pair:root_derived_*` through to `typed_recall`

**Scope.** The steps below are listed in narrative order (resolution reasons → contracts → adapter → byKind → builder → types → audibleTexts → UI → fixtures → feedback → health → tests). The actual edit order for the implementer should land **types/learning.ts (step 7) before byType/typedRecall.ts (step 6) and before audibleTexts.ts (step 8)**, because both consume the new `affixedFormPairData` slot. All twelve production steps and the tests land in a single PR — the dependency ordering is a within-PR concern, not a PR-sequencing concern.

1. **`src/lib/exercises/resolutionReasons.ts`** — add two reason codes:
   ```ts
   | 'affixed_form_pair_ref_unparseable'
   | 'affixed_form_pair_artifact_missing'
   ```

2. **`src/lib/capabilities/renderContracts.ts`** —
   - Change `RenderContract.requiredArtifacts` from `readonly ArtifactKind[]` to `Partial<Record<CapabilitySourceKind, readonly ArtifactKind[]>>`. Invariant: every entry in `supportedSourceKinds` must have a non-undefined entry in `requiredArtifacts`. Enforced via **a runtime exhaustiveness assertion at module load time** (per Open Question 4 resolution — see §"Open questions"): on import, iterate every `RENDER_CONTRACTS[et].supportedSourceKinds` and assert the matching `requiredArtifacts[sourceKind]` is non-undefined; throw with the offending exerciseType + sourceKind if not. Cheap (runs once per process), surfaces config errors at startup, and replaces the type-level conditional-type enforcement that would otherwise be load-bearing here. The existing `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK` at line 239 (compile-time check that every ExerciseType has an entry in `ContractInputShapes`) is unchanged — it operates on the orthogonal axis (every ExerciseType has any shape) vs. this new check (every supported source kind has an artifact list).
   - Rewrite every contract entry from `requiredArtifacts: [...]` to `requiredArtifacts: { item: [...] }`. Mechanical for 11 of 12 entries (the 12th is cloze, which currently lists both source kinds — its entry becomes `{ item: [cloze_context, cloze_answer, translation:l1], dialogue_line: [cloze_context, cloze_answer, translation:l1] }`).
   - Widen `typed_recall.supportedSourceKinds` to `['item', 'affixed_form_pair']` and add `affixed_form_pair: ['root_derived_pair', 'allomorph_rule']` to its `requiredArtifacts`.
   - Add `AffixedFormPairInput` type next to `DialogueLineInput`:
     ```ts
     export interface AffixedFormPairInput {
       root: string             // from root_derived_pair.payload_json.root
       derived: string          // from root_derived_pair.payload_json.derived
       direction: 'root_to_derived' | 'derived_to_root'  // from cap row
       allomorphRule: string    // from allomorph_rule.payload_json.rule
       sourceRef: string        // shape: lesson-N/morphology/<slug>, carried for audit
     }
     ```
   - Add `affixedFormPair: AffixedFormPairInput | null` to `RawProjectorInput`.
   - Make `ContractInputShapes.typed_recall` honestly nullable: `BuilderBase & { learningItem: LearningItem | null; primaryMeaning: ItemMeaning | null; affixedFormPair: AffixedFormPairInput | null }`.
   - Update `requiredArtifactsFor` helper: signature becomes `requiredArtifactsFor(exerciseType, sourceKind): readonly ArtifactKind[]`. The validator calls it with the cap's source kind.
   - Extend `projectBuilderInput`:
     - Replace the special-case `acceptsDialogueLine = exerciseType === 'cloze'` with a generic acceptance check: build a `SOURCE_KIND_ACCEPTORS: Record<ExerciseType, Set<CapabilitySourceKind>>` table derived from `RENDER_CONTRACTS.supportedSourceKinds`. The universal `learningItem`-required guard at line 269-275 then checks `if (!raw.learningItem && !alternativeSourceKindPopulated(exerciseType, raw))` where `alternativeSourceKindPopulated` returns true if the exerciseType accepts any non-item source kind AND the matching raw field is set.
     - Add a `typed_recall` projector branch: when `raw.affixedFormPair != null` and `raw.learningItem == null`, emit `{ ...base, learningItem: null, primaryMeaning: null, affixedFormPair: raw.affixedFormPair }`. Skip the `needsPrimaryMeaning` lookup for this case (mirrors how cloze's dialogue path skips the cloze-context lookup).
     - Add a bucketing-invariant check: for typed_recall, at most one of `learningItem` / `affixedFormPair` is set (mirrors the cloze invariant at lines 277-286).

3. **`src/lib/capabilities/capabilityContracts.ts`** —
   - Update validator (`validateCapability`) to call `requiredArtifactsFor(et, capability.sourceKind)` instead of `artifactsForExercise(et)`. The union with `cap.requiredArtifacts` is preserved (it's defense in depth — the cap's declared requireds catch cap-vs-contract drift; the contract's declared requireds catch builder-vs-cap drift).

4. **`src/lib/exercise-content/adapter.ts`** —
   - Extend `BucketingResult.buckets` type with `affixed_form_pair: AffixedFormPairBucketEntry[]`.
   - Define `AffixedFormPairBucketEntry = { block: SessionBlock; sourceRef: string }`.
   - Extend `bucketByDecodedSourceKind`:
     - Add `AFFIXED_FORM_PAIR_REF_RE = /^lesson-\d+\/morphology\/.+$/u` (the live DB shows `source_ref` shape `lesson-9/morphology/meN-baca-membaca`).
     - Add a branch `if (decoded.sourceKind === 'affixed_form_pair')` that validates the ref shape (fail with `affixed_form_pair_ref_unparseable` on mismatch) and pushes to `buckets.affixed_form_pair`.
   - Add `loadBlockData` to invoke the new fetcher in `Promise.all`.

5. **`src/lib/exercise-content/byKind/affixedFormPair.ts`** (new file, lands in the PR-0-split structure) — artifacts-only fetcher, structurally parallel to `byKind/dialogueLine.ts`:
   - For each bucket entry, fetch `capability_artifacts` for the cap ids (using the shared `fetchArtifacts` helper, same as the dialogue_line fetcher).
   - Expect `root_derived_pair` + `allomorph_rule` artifacts. Missing → `affixed_form_pair_artifact_missing` fail.
   - Parse the payloads: `pairPayload.root`, `pairPayload.derived`, `rulePayload.rule`. Empty strings → `affixed_form_pair_artifact_missing` (mirrors the dialogue-line empty-payload check at adapter.ts:522-538).
   - Read the cap's `direction` from `block.canonicalKeySnapshot` (which encodes it). Actually — wait, the canonical-key snapshot does NOT include direction; verify by reading `src/lib/capabilities/canonicalKey.ts`. **Open question — see "Open questions" §**. If direction is not on the block, fetch it from the `learning_capabilities` row alongside the artifacts. If it IS on the block (e.g. via `block.renderPlan` or a per-cap metadata field), use that. The cleanest path is to add `direction` to `SessionBlock` if it isn't there — but that depends on session-builder shape.
   - Build the `RawProjectorInput` with `affixedFormPair: { root, derived, direction, allomorphRule, sourceRef }`, `learningItem: null`, all item fields empty.

6. **`src/lib/exercise-content/byType/typedRecall.ts`** — branch on `input.affixedFormPair != null`:
   ```ts
   if (input.affixedFormPair) {
     const { root, derived, direction, allomorphRule } = input.affixedFormPair
     const isRootToDerived = direction === 'root_to_derived'
     const promptText = isRootToDerived
       ? `Form the meN- form of: ${root}`     // exact wording subject to D1 review
       : `What is the root of: ${derived}`
     const acceptedAnswer = isRootToDerived ? derived : root
     const exerciseItem: ExerciseItem = {
       learningItem: null,
       meanings: [], contexts: [], answerVariants: [],
       skillType: isRootToDerived ? 'form_recall' : 'recognition',
       exerciseType: 'typed_recall',
       affixedFormPairData: { promptText, acceptedAnswer, direction, allomorphRule, root, derived },
     }
     return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
   }
   // Existing item path stays unchanged.
   ```
   Item path produces `learningItem`-shaped exerciseItem as before.

   **`skillType` choice is intentional and matches existing convention.** `capabilityCatalog.ts` already uses `skillType: 'recognition'` for receptive cap types and `skillType: 'form_recall'` for productive ones (`capabilityCatalog.ts:60, 72, 85, 97, 111, 123, 140, 155, 185, 198`). The `root_to_derived` direction is productive (the learner produces the affixed form); `derived_to_root` is receptive (the learner recognizes/produces the root from the derived form). Per a grep of `exerciseItem.skillType` / `PlannerCapability.skillType` consumers in `src/`:
   - `src/services/learnerStateService.ts:83` — passes `skillType` as an RPC argument (no branching).
   - `src/lib/session-builder/adapter.ts:134, 170` — metadata read + projection passthrough (no branching).
   - `src/lib/exercises/exerciseResolver.ts:97` — passthrough (no branching).
   - `src/lib/session-builder/pedagogy.ts:16` — the `PlannerCapability.skillType` field declaration (no branching consumer in pedagogy.ts itself).

   None branch on the value, so adopting `'recognition'` on root_derived_recognition + `'form_recall'` on root_derived_recall is safe. Verification step (PR 1, ~5 min): re-run the grep to confirm no new branching consumer landed between this plan's writing and PR 1's implementation.

   **Add `import { audibleTextFieldsOf } from '@/lib/session-builder'`** if not already present (the existing builder already imports it). Note the new fields the builder populates must also be read by `audibleTextFieldsOf` — see step 7.

7. **`src/types/learning.ts`** — add the `affixedFormPairData` slot:
   ```ts
   affixedFormPairData?: {
     promptText: string
     acceptedAnswer: string
     direction: 'root_to_derived' | 'derived_to_root'
     allomorphRule: string
     root: string
     derived: string
   }
   ```

8. **`src/lib/session-builder/audibleTexts.ts`** — extend `audibleTextFieldsOf` to harvest the Indonesian-language fields from `affixedFormPairData`. Mirror the existing per-slot branches (line 31-89). Add:
   ```ts
   // Affixed-form-pair (typed_recall on morphology caps): root + derived are
   // both Indonesian; promptText/allomorphRule are explanatory English/Dutch
   // and excluded per the convention at the top of this file.
   if (item.affixedFormPairData) {
     add(item.affixedFormPairData.root)
     add(item.affixedFormPairData.derived)
   }
   ```
   Without this edit, `audibleTextFieldsOf(exerciseItem)` returns `[]` for affixed_form_pair caps and no TTS prefetch happens — the Listen affordance on the prompt + Doorgaan screen would be silently broken. Update the docstring comment block at lines 22-29 to also enumerate the new "excluded" fields (`affixedFormPairData.promptText`, `.allomorphRule` — both meta-text in user language).

   Unit test addition (in `__tests__/audibleTexts.test.ts` or wherever the existing tests live): given an exerciseItem with `affixedFormPairData: { root: 'baca', derived: 'membaca', ... }`, asserts the result contains both `baca` and `membaca` normalized.

9. **`src/components/exercises/implementations/TypedRecall.tsx`** — branch on `exerciseItem.affixedFormPairData`:
   ```tsx
   const affixData = exerciseItem.affixedFormPairData
   const promptText = affixData ? affixData.promptText : translationFromMeanings
   const acceptedAnswer = affixData ? affixData.acceptedAnswer : item!.base_text
   const acceptedVariants: string[] = affixData ? [] : (answerVariants ?? []).map(v => v.variant_text)

   const scoring = useExerciseScoring<string>({
     mode: 'typed',
     checkCorrect: (response) => {
       const r = checkAnswer(response, acceptedAnswer, acceptedVariants)
       return { isCorrect: r.isCorrect, isFuzzy: r.isFuzzy }
     },
     // ... rest unchanged
   })
   ```
   **Answer normalization is via the shared `checkAnswer(response, acceptedAnswer, variants)` (`src/lib/answerNormalization.ts`)** so case + diacritics + whitespace + fuzzy matching behave identically to the item path. For affixed_form_pair the `variants` list is empty (no fuzzy alternatives — the answer is the exact morphological form). "Baca" vs "baca" is normalized by `checkAnswer`; "menulis" vs "Menulis" is normalized. The two branches share the primitive chrome; only the prompt source + `acceptedAnswer`/`variants` differ. Refactor opportunity (extract a `TypedRecallCore` that takes `{ promptText, acceptedAnswer, variants }` and call it from both branches) is welcome but not required for the PR.

10. **(Removed.)** Per round-2 architect review: do NOT create `src/components/exercises/primitives/fixtures/affixed-form-pair.ts` in PR 1. Rationale: the existing `dialogue-cloze.ts` fixture file (created by the dialogue_line PR-C) has zero callers in `src/` — verified via grep. Creating a second unwired fixture file doubles the dead-surface without a consumer. When a future plan wires `/admin/design-lab` to render source-kind-variant fixtures (either of dialogue or morphology), it creates both fixture files in scope together. PR 1 ships the runtime + the capstone integration test as the locked-in surface; visual confirmation in `/admin/design-lab` is a separate later concern.

11. **`src/components/exercises/feedbackMapping.ts`** — add an `affixed_form_pair`-aware sub-branch inside the existing `case 'typed_recall':` at **line 79**. When `item.affixedFormPairData != null`, return:
    ```ts
    return {
      outcome,
      layout: 'grammar-reveal',   // NOT 'vocab-pair' — see explanation gap below
      direction: 'L1→ID',
      promptShown: { text: affixData.promptText, lang: 'ID', role: 'shown' },
      correctAnswer: { text: affixData.acceptedAnswer, lang: 'ID', role: 'target' },
      userAnswer: response ? { text: response, lang: 'ID', role: 'typed' } : undefined,
      acceptedVariants: [],
      explanation: affixData.allomorphRule,
      commitFailed,
    }
    ```
    **Layout choice is load-bearing.** `ExerciseFeedback.tsx:274` only renders the `explanation` field when `layout === 'grammar-reveal'`. The item-path typed_recall today returns `layout: 'vocab-pair'`; if the affixed sub-branch did the same, the allomorph rule from D1(b) would be silently dropped by the primitive. Returning `layout: 'grammar-reveal'` opts into the explanation-card render path that the primitive already supports (used elsewhere for grammar exercises). Morphology IS grammar-shaped, so this is the correct semantic match. Visual implication: the Doorgaan screen renders the morphology pair in the grammar-reveal layout (meaning line + explanation card) instead of the vocab-pair layout (paired word cells). Acceptable for the pilot; if visual review wants vocab-pair layout with explanation, the follow-up is to widen ExerciseFeedback.tsx:274 to render `explanation` under both layouts. Approximately 12-line addition; structurally mirrors the existing item-path extraction at lines 79-92 but uses different layout + explanation slot.

12. **`scripts/check-supabase-deep.ts`** — add HC12 (mirrors HC11's structure at lines 724-823):
    - For every `affixed_form_pair` cap, fetch artifacts.
    - Assert `root_derived_pair` + `allomorph_rule` both present with `quality_status='approved'`.
    - Assert `root_derived_pair.artifact_json` has non-empty `root` + `derived` strings.
    - Assert `allomorph_rule.artifact_json` has a non-empty `rule` string.
    - Mark `EXPECTED RED` until the affected lesson re-publishes with PR 1's contract change in place (publish flips `readiness_status='ready'` + `publication_status='published'` via the promotion step at `runner.ts:617-642`).
    - Vacuously green if zero affixed_form_pair caps exist.

13. **Tests** — new unit coverage, mirroring PR-B of dialogue_line:
    - `renderContracts.test.ts` — projector accepts a typed_recall input with `affixedFormPair: {...}` + `learningItem: null`; rejects a typed_recall input with neither populated; rejects a `dictation` input with `affixedFormPair: {...}` (the relaxation is scoped to typed_recall only — same shape as cloze's dialogue carve-out).
    - `adapter.test.ts` — bucketing routes an affixed_form_pair cap to the new bucket; malformed source_ref fails with `affixed_form_pair_ref_unparseable`.
    - `byType.test.ts` — typedRecall builder produces the expected exerciseItem for both directions; missing-artifact path fails cleanly.
    - `audibleTexts.test.ts` (new file — no existing test file for `audibleTexts.ts` today, verified via Glob) — `audibleTextFieldsOf` includes both `root` and `derived` for an affixed_form_pair exerciseItem, normalized via `normalizeTtsText`. While the test file is new, the function being tested is not — so include 2-3 sanity assertions against the existing slots (item base_text, clozeContext, clozeMcqData) to make the new test file a proper unit of coverage for the helper.
    - `TypedRecall.test.tsx` — fixture-driven renders for both directions; typing the correct answer fires `onAnswer({ wasCorrect: true })`; typing the wrong answer fires `onAnswer({ wasCorrect: false })`; case/diacritic normalization (e.g. "Membaca" → correct) verified.
    - **Capstone** — `affixedFormPairCapstone.test.tsx` in `src/__tests__/` mirroring the shape of `dialogueLineCapstone.test.tsx` (which renders `<Cloze>` directly via the resolver output and stops at `onAnswer`). The dialogue precedent does NOT reach `commitCapabilityAnswerReport` — that's a Session-layer call. Matching that precedent, the affixed capstone asserts:
      1. Mocked Supabase returns the cap row + its two artifacts; `resolveCapabilityBlocks` yields a non-null exerciseItem with `affixedFormPairData` populated and `learningItem === null`.
      2. `<TypedRecall exerciseItem={result.exerciseItem} ...>` renders the prompt text (matching the configured direction).
      3. Typing the correct answer + clicking submit fires the test's `onAnswer` spy with `wasCorrect: true`, `isFuzzy: false`, and the typed string as `rawResponse`.
      4. The audibleTexts harvest (`audibleTextFieldsOf(result.exerciseItem)`) includes both `root` and `derived` strings (normalized).
      5. Typing an incorrect answer fires `onAnswer` with `wasCorrect: false`; this exercises the wrong-answer Doorgaan-screen path's input (the actual ExerciseFeedback render is unit-tested separately in `ExerciseFeedback.test.tsx`).

      Reaching `commitCapabilityAnswerReport` would require wrapping the test in a Session host — out of scope for the capstone, deferred to a future end-to-end test if needed. Failure of any one assertion above is a regression in the corresponding deep module's interface.

**Test gate (PR 1):**
- All new unit tests pass.
- Existing 1212 passing tests stay green.
- `bun run lint` — 0 errors, 4 pre-existing warnings (unchanged).
- `bun run build` — clean.
- `make check-supabase-deep` — HC12 expected RED until the live-DB re-publish below; every other check green.

**Live-DB rollout (post-PR-1, manual):**
- Re-publish L9: `bun scripts/publish-approved-content.ts 9`. The runner's promotion step (`runner.ts:617-642`) calls `validateCapability` against the new contracts; the four affixed_form_pair caps now have `candidateExercises = ['typed_recall']` with matching `requiredArtifacts: ['root_derived_pair', 'allomorph_rule']` (the cap's own list); both artifacts approved → `ready` → promoted. `readiness_status` flips `unknown → ready`, `publication_status` flips `draft → published`.
- Re-run `make check-supabase-deep` — HC12 turns green.
- Manual smoke in dev: `bun run dev`, log in as test user, activate L9, advance to a session, verify a `typed_recall` exercise renders against an affixed_form_pair cap.

**Risk (PR 1):** Medium. Source-kind-keyed `requiredArtifacts` is a structural change to `RenderContract` that touches every contract entry. Mitigation: the **runtime exhaustiveness assertion** (step 2, per Open Question 4) throws at module load if any contract entry's `supportedSourceKinds` is not fully covered by its `requiredArtifacts` map — so a forgotten entry surfaces immediately at startup, not after a learner hits an empty-bucket failure. Test gate validates the assertion fires for a contrived missing-entry case. The only behavior change for existing item-sourced caps is the validator picks the artifact list under the `item` key instead of from the flat field — semantically identical for caps that today have a flat list.

**Rollback (PR 1):** Single `git revert` for the contract change (`renderContracts.ts` + `capabilityContracts.ts`). The adapter / builder / UI changes are additive (new fields, new branches) and remain dormant when the contract widening is reverted. The HC12 health check is additive — revert removes it.

## What's deliberately NOT in this plan

- **`cued_recall` for affixed_form_pair.** Deferred per D3/D4 — needs distractor authoring. Will be a follow-up plan (tentatively named `docs/plans/<date>-affixed-form-pair-cued-recall.md` after PR 1 ships; not pre-named here to avoid stale forward references).
- **Pattern-sourced caps (94 rows) retirement.** Per D6 — separate plan. Touches the projector emitting them + a cleanup migration; not blocked by this work.
- **Podcast source kinds.** Larger scope — no projector emits them yet. Future.
- **`l1_to_id_choice` for affixed_form_pair.** cued_recall's `capabilityTypes` array includes `l1_to_id_choice` but no projector emits an affixed-form-pair cap of type `l1_to_id_choice`. Out of scope.
- **Adapter `byKind/` for podcasts.** PR 0 sets up the structure for two existing kinds (item, dialogueLine) + adds the affixed_form_pair file. Future source kinds plug in as additional `byKind/<kind>.ts` files without further structural change.
- **Re-publishing L9's reader content.** PR 1 is runtime-only; the L9 lesson reader is unaffected. The re-publish gated above is the capability-stage re-publish (Stage B per `docs/process/content-pipeline.md`) — it does not regenerate page-blocks.

## Sizing + parallelism

| PR | Estimate | Risk | Depends on |
|---|---|---|---|
| 0 — adapter split | small (½–1 day) | very low — pure refactor | — |
| 1 — full vertical slice + HC12 + capstone | medium (3.5–5 days) | medium — source-kind-keyed contracts + UI branch + audibleTexts | PR 0 |

**Total:** roughly 4–6 days end-to-end. PR 1 touches **11 production files** (resolutionReasons, renderContracts, capabilityContracts, adapter, byKind/affixedFormPair, byType/typedRecall, types/learning, audibleTexts, TypedRecall, feedbackMapping, check-supabase-deep) + 5 test files (renderContracts.test.ts, adapter.test.ts, byType.test.ts, audibleTexts.test.ts, TypedRecall.test.tsx) + 1 capstone (affixedFormPairCapstone.test.tsx). Source-kind-keyed contracts (D2) is a structural change that touches every contract entry but the bulk of each edit is a mechanical re-wrap. The expensive parts: (a) writing the projector test scenarios for source-kind-keyed contracts; (b) the capstone integration test (~1 day in the dialogue_line precedent). Both have direct templates from the dialogue_line PR-B/PR-C work. DesignLab fixture wiring removed per round-2 architect review.

No parallelism opportunity — PR 1 strictly depends on PR 0's structure.

## Rollback story

- **PR 0** — single `git revert`. Pure refactor; no DB state involved.
- **PR 1** — single `git revert` for the contract change is the load-bearing rollback. The adapter / builder / UI / fixture additions are additive (new optional fields, new branches) and become inert when the contract widening is reverted. The HC12 health check is additive — revert removes it.
- **Live-DB state after PR 1 re-publish.** If the re-published L9 caps render incorrectly (bad data, wrong direction inference, etc.), a same-day fix-and-republish corrects them via the runner's idempotent upsert (`scripts/lib/pipeline/capability-stage/adapter.ts:221` — the pipeline-side adapter, not the runtime-side `src/lib/exercise-content/adapter.ts` — `onConflict: 'capability_id,artifact_kind,artifact_fingerprint'`). If the contracts themselves are wrong, revert PR 1; the promotion step on next publish would set the caps back to `blocked` (and `applyPromotionPlan` reverses the `readiness_status` flip), so the four caps go inert again.

## Observability

PR 1 introduces two new `ResolutionReasonCode` values logged via the existing `logResolutionFailure` path at `adapter.ts:571-586`, writing to `capability_resolution_failure_events`:

- `affixed_form_pair_ref_unparseable` — `source_ref` doesn't match `lesson-N/morphology/<slug>`.
- `affixed_form_pair_artifact_missing` — one or both of `root_derived_pair` / `allomorph_rule` is absent or has `quality_status != 'approved'`, or a payload field is empty.

Both surface in the Supabase dashboard alongside the dialogue_line codes.

HC12 surfaces the same condition at the live-DB level on every `make check-supabase-deep` run (and is wired into `make pre-deploy`).

## Validation strategy

After PR 0:
- `bun run test` + `bun run lint` + `bun run build` — all green; same baseline as session start.

After PR 1, before the L9 re-publish:
- `bun run test` + `bun run lint` + `bun run build` — green plus the new unit + capstone tests.
- **Pre-republish learner-state safety check.** Query for any existing FSRS state rows on the 4 target caps:
  ```sql
  select count(*) from indonesian.learner_capability_state
   where capability_id in (
     select id from indonesian.learning_capabilities where source_kind = 'affixed_form_pair'
   );
  -- Expected: 0 (caps have been publication_status='draft', so no learner has
  -- ever scheduled them). If non-zero, the 4 caps have orphan FSRS state from
  -- a previous publication cycle — decide on cleanup (DELETE the rows) or
  -- accept continuity (the learner sees the cap as a continuing review from
  -- 'unknown' readiness). Likely safe to delete; the cap was never user-facing.
  ```

After the L9 re-publish:
- Re-publish L9: `bun scripts/publish-approved-content.ts 9`. Confirm console output reports 4 affixed_form_pair caps promoted.
- `make check-supabase-deep` — HC12 turns green.
- Live DB query:
  ```sql
  select capability_type, direction, readiness_status, publication_status
    from indonesian.learning_capabilities
   where source_kind = 'affixed_form_pair';
  -- Expected: 4 rows, all readiness=ready, all publication=published.
  ```
- Manual smoke in dev: log in as `testuser@duin.home`, activate L9, advance to a session, verify a `typed_recall` exercise prompts with either "Form the meN- form of: baca" or "What is the root of: membaca" depending on which of the 4 caps lands. Verify wrong-answer Doorgaan screen surfaces the allomorph rule as the explanation text. Verify the Listen affordance on the prompt produces audio for the Indonesian text (both root and derived TTS-prefetched).

## Supabase Requirements

### Schema changes

None. The four target caps already exist in `learning_capabilities` with their artifacts in `capability_artifacts` (verified live 2026-05-21). The `direction` column on `learning_capabilities` is already populated (`root_to_derived` / `derived_to_root`). No DDL.

### homelab-configs changes

None.

### Health check additions

- HC12 (PR 1): `scripts/check-supabase-deep.ts` — for every `affixed_form_pair` cap, assert both `root_derived_pair` and `allomorph_rule` artifacts exist with `quality_status='approved'` and non-empty payload fields. Vacuously green if no affixed_form_pair caps exist. **Stale-since runbook:** HC12 is EXPECTED RED at PR 1 merge time until the L9 re-publish flips readiness/publication. If HC12 remains red >7 days post-merge, the re-publish has failed for an unrelated reason — investigate via `bun scripts/publish-approved-content.ts 9 --dry-run` and either fix the blocker or revert PR 1 to remove the dark health-check signal.

## Open questions (to resolve before approval)

1. **D1 — exact prompt wording for the two directions.** "Form the meN- form of: baca" is one option; "Form the derived form of: baca (rule: meN-)" is another. Pure-English prompts vs Dutch-localized prompts (per `userLanguage`). Recommend leaving prompt template selection to the builder + a small i18n surface (`translations[userLanguage].session.affixedFormPair.recallPrompt` / `recognitionPrompt`), defaulting to a minimal English template for the pilot and pulling localization into the follow-up. Architect to ratify or pick a wording.
2. **`SessionBlock.direction` availability.** The byKind/affixedFormPair fetcher needs the cap's `direction` field to decide which side is the prompt and which is the answer. The block's `canonicalKeySnapshot` encodes the direction as part of the canonical-key tail (e.g. `:root_to_derived:` per the staging data `lesson-9/capabilities.ts:50`); the adapter's `decodeCanonicalKey` at `adapter.ts:49-62` parses only the first 4 components. Either: (a) extend `decodeCanonicalKey` to also return the direction (and modality/learner_language) tail components; (b) fetch the `direction` column alongside artifacts in `fetchForAffixedFormPairBlocks` via a `learning_capabilities` query; (c) plumb `direction` into `SessionBlock` upstream in the session-builder so the adapter receives it. (a) is the minimum-touch option; (b) costs a small extra round-trip; (c) is the cleanest but touches another module. Recommend (a) — extend `decodeCanonicalKey`'s return type to include the `tail: { capabilityType, direction, modality, learnerLanguage }` parsed pieces; the affixedFormPair fetcher reads `tail.direction`. **Caller-impact grep done:** `decodeCanonicalKey` is called only at `src/lib/exercise-content/adapter.ts:123` (the bucketing function in the same file) and from `src/lib/exercise-content/__tests__/adapter.test.ts` (the unit tests). No external destructure or serialization use. Adding a new `tail` field to the ok-variant of `DecodedKey` is a non-breaking extension; the bucketing function reads it; the existing tests are extended to assert the new tail shape.
3. **`feedbackMapping.ts` shape for affixed_form_pair.** The wrong-answer screen extracts prompt + correct + explanation per exerciseType. For typed_recall with `affixedFormPairData`, the extractor reads from there instead of from `learningItem`. The PR 1 spec names the seam (`feedbackMapping.ts:79`, head of `case 'typed_recall':`) but doesn't pin the exact field names. Architect to ratify the field set the feedback layer surfaces.
4. **Type-level enforcement of source-kind-keyed `requiredArtifacts`.** "Every entry in `supportedSourceKinds` must have a non-undefined entry in `requiredArtifacts`" is a runtime invariant. Encoding it in the type system requires a conditional type that maps `supportedSourceKinds` (a tuple-literal type) to required keys in `requiredArtifacts`. Doable but non-trivial. **Resolved (round 2 of architect review): runtime assertion only.** PR 1 ships a startup-time assertion in `renderContracts.ts` that throws on mismatch (cheap, runs once per process). Type-level conditional-type enforcement is over-engineering for a 12-entry table; the runtime assertion catches the same misconfiguration class at process start. PR 1 step 2 is updated to specify the runtime path; PR 1 risk-mitigation note references the assertion as the backstop.
5. **Should we ship cued_recall in this plan with a single hardcoded fallback distractor list per pattern?** Resolved: **NO.** Hardcoded distractors are fragile and dilute the "distractor authoring is a content-pipeline plan" framing of D3. cued_recall stays out of this plan; the follow-up plan owns it.
6. **L9 re-publish: side effects on other L9 content?** Stage B re-publish regenerates capability rows + artifacts + content_units + lesson_page_blocks. The other L9 caps (item-sourced + dialogue_line) are unaffected — their fingerprints don't change. But the runner runs every CS gate; if any latent issue exists on L9, re-publish surfaces it. Architect to verify no known-pending L9 issues block the re-publish.

## See also

- `docs/plans/2026-05-21-lib-exercise-content-fold.md` (status: shipped) — the architectural prerequisite; this plan lands inside its `byType/` + `byKind/` structure.
- `docs/plans/2026-05-21-dialogue-line-contextual-cloze.md` (status: shipped) — the immediate precedent; the same vertical-slice template + the source-kind widening pattern.
- `docs/current-system/modules/exercise-content.md` §6 "Adapter split deferred" — names this pilot as the trigger for the byKind split.
- `docs/current-system/modules/capabilities.md` §6 "supportedSourceKinds: ['item'] is the current ceiling" — names this pilot as the next widening.
- `docs/current-system/capability-runtime-data-model-gap.md` §"What's in the live database" — frames the 4 inert affixed_form_pair caps.
- `docs/adr/0006-every-lesson-derived-capability-has-an-introducing-lesson.md` — the lesson_id invariant; preserved by this work (the 4 caps already carry the L9 `lesson_id`).
- `scripts/lib/content-pipeline-output.ts:430-441` — the existing artifact emitter for `root_derived_pair` + `allomorph_rule`. Unchanged by this plan.
