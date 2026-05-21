# ADR 0010: Wire Grammar Exercises Via Pattern Capabilities

## Status

Proposed (2026-05-21). Pending architect review of `docs/plans/2026-05-21-data-model-target.md`.

## Context

The investigation (`docs/plans/2026-05-21-data-model-investigation.md` §3.3) reveals a routing gap:

- **716 rows of authored grammar exercises** exist in `indonesian.exercise_variants` (4 exercise types: `sentence_transformation` 189, `constrained_translation` 240, `contrast_pair` 141, `cloze_mcq` 146).
- **All 716 rows are `grammar_pattern_id`-keyed**: zero `learning_item_id`, zero `context_id`.
- **94 `learning_capabilities` rows have `source_kind='pattern'`** (47 patterns × 2 capability types: `pattern_recognition`, `pattern_contrast`).
- **The runtime fetcher** at `src/lib/exercise-content/byKind/item.ts:77-86` queries `exercise_variants WHERE learning_item_id IN (...) AND is_active=true`. No row in the DB matches.
- **The render contracts** at `src/lib/capabilities/renderContracts.ts:109-127` declare `capabilityTypes: []` for `contrast_pair`, `sentence_transformation`, `constrained_translation`, `speaking`. No capability_type routes to these exercises.
- **The `pattern_recognition` and `pattern_contrast` capability types** appear in NO exercise contract's `capabilityTypes` array. No exercise serves them.

Net effect: the authored exercises (~weeks of pipeline work) are orphan data; the projected pattern capabilities (~ADR 0001's promise) are orphan rows. `capability_review_events` confirms zero learners have ever reviewed any of these (`docs/plans/2026-05-21-data-model-investigation.md` §1.4 — only 6 item-sourced cap types have ever rendered).

The memory `feedback_answer_log_check.md` documents this exact failure mode discovered on 2026-05-21: data existence ≠ feature works. The user's preference is "structurally sound" — dead data paths are smells, not invisible.

Three options:

- **(a) Retire the 716 rows and the authoring path.** Aggressive; the authored exercises have linguistic value and the authoring agent is a working component.
- **(b) Leave as dead data, document the inertness.** Status quo; violates the "structurally sound" preference.
- **(c) Wire the routing.** Capability types route to the exercises; the exercises become live.

## Decision

Wire `pattern_recognition` and `pattern_contrast` capability types to the four grammar exercise types, with the four `exercise_variants` rows split into typed tables (per ADR 0009).

### Routing map

| Exercise type (new typed table) | Capability types it serves | Source kinds it accepts |
|---|---|---|
| `contrast_pair_exercises` | `pattern_contrast` | `pattern` |
| `sentence_transformation_exercises` | `pattern_recognition` | `pattern` |
| `constrained_translation_exercises` | `pattern_recognition` | `pattern` |
| `cloze_mcq_exercises` | `pattern_recognition` (NEW) + `contextual_cloze` (existing) | `pattern` (NEW) + `item` (existing) |

### Implementation

Two code-side changes:

1. **`renderContracts.ts:43-127`** updates the `capabilityTypes` arrays for the 4 grammar exercises and widens `supportedSourceKinds` to include `'pattern'`. Per `as const satisfies Record<ExerciseType, RenderContract>` (the existing exhaustiveness check), the contract surface remains exhaustive.

2. **`src/lib/exercise-content/byKind/pattern.ts`** (new file) implements `fetchForPatternBlocks` — analogous to the item / dialogue_line / affixed_form_pair fetchers. It reads the corresponding typed exercise table by `grammar_pattern_id` (decoded from `source_ref = 'lesson-N/pattern-<slug>'` via `canonicalKey.ts`).

3. **`src/lib/exercise-content/adapter.ts`** adds the `pattern` bucket and wires `fetchForPatternBlocks` into the per-bucket Promise.all (today line ~331-335). `bucketByDecodedSourceKind` already classifies `pattern` rows (it would today emit `unsupported_source_kind` failures — see `capability_resolution_failure_events` having 33 such rows).

### Authoring path

The grammar-exercise-creator agent (`.claude/agents/grammar-exercise-creator.md`) is updated to emit typed-table rows instead of `exercise_variants` rows. The pipeline (`scripts/publish-grammar-candidates.ts`) writes to the 4 new tables. `scripts/lib/pipeline/capability-stage/projectors/grammar.ts` continues to emit `pattern_recognition` + `pattern_contrast` cap rows — those caps already exist; this ADR just makes them renderable.

### Pedagogical implications

Pattern caps have prerequisites today (`pattern_contrast.prerequisiteKeys = [pattern_recognition.canonicalKey]` per `capabilityCatalog.ts:147-162`). Once wired, the staging gate in `pedagogy.ts` (ADR 0007) applies: pattern caps cannot enter productive practice until their prereqs are met. This is correct by construction; no extra work needed.

Phase-taxonomy mapping (ADR 0007):

- `pattern_recognition` is Phase 4 (productive recall) per current taxonomy.
- `pattern_contrast` is Phase 3 (productive recognition) per current taxonomy.

Both stay "productive" — they would never become available to a learner before the staging gate's per-source-ref siblings are met. **Note:** the existing taxonomy may need refinement once these caps actually render: a `pattern_recognition` cap doesn't necessarily share a `source_ref` with any receptive sibling (it's pattern-scoped, not item-scoped). If the staging gate orphans them in practice, ADR 0007's carve-out for `affixed_form_pair` may need to extend to `pattern` as well.

## Consequences

- **716 exercise rows become live.** Learners practising patterns will see them across the 4 exercise types.
- **94 pattern capabilities become renderable.** From "always blocked" to "ready when their `grammar_pattern_examples` + exercise rows exist."
- **`capability_resolution_failure_events.reason_code='unsupported_source_kind'`** count drops to zero for `sourceKind='pattern'`.
- **Schema cost = 4 new typed tables** (per ADR 0009): `contrast_pair_exercises`, `sentence_transformation_exercises`, `constrained_translation_exercises`, `cloze_mcq_exercises`. The retired `exercise_variants` table goes away.
- **Authoring agent prompt update needed** — the agent emits typed rows. Mechanical; the agent's shape vocabulary is already typed (`payload_json` has 4 known shapes).
- **Pre-deploy live-session smoke test required.** Per `feedback_answer_log_check.md`: claim shipping only after a real review event lands in `capability_review_events` for a pattern cap.
- **Pedagogical taxonomy may need refinement.** If the staging gate over-restricts pattern caps in practice (no receptive sibling on the same source_ref), update ADR 0007 to add a `pattern` carve-out parallel to the `affixed_form_pair` one.
- **The 7 `dialogue_line:contextual_cloze` caps continue rendering via typed `cloze`** (post 2026-05-21 PR-B); this ADR does not change that path. The new `cloze_mcq_exercises` table is grammar-pattern-only initially.
- **`speaking` exercise type stays orphan-routed.** It has `capabilityTypes: []` today and this ADR doesn't change that — there's no capability type that produces speaking exercises and the feature isn't built. Leaving as future work; the exercise type can be retired entirely or wired later.

## Related

- [ADR 0001: capability-based learning core](./0001-capability-based-learning-core.md)
- [ADR 0007: receptive-before-productive staging](./0007-receptive-before-productive-staging.md) — taxonomy interaction noted above.
- [ADR 0008: retire generic capability_artifacts abstraction](./0008-retire-generic-capability-artifacts-abstraction.md) — peer schema change.
- [ADR 0009: typed-table-per-content-concept storage pattern](./0009-typed-table-per-content-concept-storage.md) — this ADR is one application.
- [Data model investigation](../plans/2026-05-21-data-model-investigation.md) §3.3 — evidence of the orphan-routing gap.
- [Data model target proposal](../plans/2026-05-21-data-model-target.md) §Decision G — table-level shape.
- [Memory `feedback_answer_log_check.md`](../../../.claude/projects/-Users-albert-home-learning-indonesian/memory/feedback_answer_log_check.md) — the rule this ADR satisfies.
