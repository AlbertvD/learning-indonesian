# ADR 0008: Retire The Generic `capability_artifacts` Abstraction

## Status

Proposed (2026-05-21). Pending architect review of `docs/plans/2026-05-21-data-model-target.md`.

## Context

ADR 0001 made capabilities the schedulable unit and gave them "typed artifacts." The implementation realised "typed artifacts" as a single table `indonesian.capability_artifacts` with rows keyed by `(capability_id, artifact_kind, artifact_fingerprint)` carrying a `jsonb` payload whose shape varies per `artifact_kind`.

The live data (catalogued in `docs/plans/2026-05-21-data-model-investigation.md` §3.2) reveals:

- 12 `artifact_kind` values are actively written (out of 22 declared in code).
- 7 of those 12 kinds collapse to `{value: string}` — a JSON wrapper around a single string.
- 2 kinds use `{values: string[]}` — a JSON wrapper around a string array.
- 3 kinds are genuinely structured: `audio_clip` (path + voice), `root_derived_pair` (two strings), `cloze_context` (4 fields).
- 1 kind (`allomorph_rule`) uses a third single-string-wrapper shape with key `rule` — naming inconsistency within the same abstraction.

Of the 12 actively-used kinds, **9 are denormalisations of canonical data living in other tables**: `base_text` ↔ `learning_items.base_text`; `meaning:l1` ↔ `item_meanings.translation_text`; `accepted_answers:id/l1` ↔ `item_answer_variants.variant_text`; `pattern_explanation:l1` ↔ `grammar_patterns.short_explanation`. The runtime reader (`src/lib/exercise-content/byKind/item.ts`) fetches both the upstream table AND the denormalised artifact rows — the same string in two places.

The abstraction was intended to let capabilities declare what they need without coupling to the upstream content shape. In practice the runtime's `byType/*.ts` packagers do unpack per-kind (`artifactsByKind.get('audio_clip')?.value.storagePath`), undoing the abstraction at the read side. The net effect is generic storage with consumer-side dispatching — exactly the pattern `docs/target-architecture.md` Rule #3 warns against.

The user's stated preference for this codebase is "deep modules with one job each, not generic blob storage with consumer-side dispatching" (this session).

## Decision

Retire `indonesian.capability_artifacts`. Replace it with:

1. **No new table** for the 9 denormalised kinds — read from the canonical upstream table at runtime via JOIN.
2. **Three typed satellites** for the structurally-distinct kinds:
   - `indonesian.dialogue_clozes` (one row replaces 3 artifact rows: `cloze_context` + `cloze_answer` + `translation:l1`).
   - `indonesian.affixed_form_pairs` (one row replaces 2 artifact rows: `root_derived_pair` + `allomorph_rule`).
   - `indonesian.grammar_pattern_examples` (one row replaces 1 artifact row of kind `pattern_example`).
3. **`audio_clip` artifacts retire** — the existing `indonesian.audio_clips` table is the canonical store; the cap-side reference moves to a new join table `capability_audio_refs(capability_id, audio_clip_id, voice_id)`. See migration plan PR 8.5. Direct re-derivation from `learning_items.normalized_text` ↔ `audio_clips.text_content` was considered and rejected (couples audio resolution to slug equality; brittle if base_text changes).

Readiness checking moves from "do all required `capability_artifacts` rows of the required kinds exist + are approved" to "does the upstream typed-table query return the required rows" — codified in a `ReadinessAdapter` interface in `src/lib/capabilities/`.

The contract layer in `src/lib/capabilities/renderContracts.ts` continues to declare *what* each exercise needs (`requiredArtifacts` field); but `RENDER_CONTRACTS[et].requiredArtifacts[sk]` becomes a logical list of upstream-existence-checks rather than artifact-kind-keyed lookups in the `ArtifactIndex`.

The `quality_status` field on `capability_artifacts` is retired with the table. CLAUDE.md already documents that publishing always emits `quality_status: 'approved'` — the manual approval gate is dead. Verified against the live DB 2026-05-21: all 9,312 `capability_artifacts` rows have `quality_status='approved'`, no exceptions. The runtime's `.eq('quality_status', 'approved')` filter at `src/lib/exercise-content/adapter.ts:300` is a no-op against the current data; retiring the field changes no row's visibility.

## Consequences

- **9,312 artifact rows go away.** The 4,005 capabilities still exist; their readiness now derives from `(learning_items.is_active, item_meanings.is_primary, audio_clips, ...)` rather than from a parallel `capability_artifacts` projection.
- **Three new typed tables ship**: `dialogue_clozes`, `affixed_form_pairs`, `grammar_pattern_examples`. Each has a single, typed shape — no JSON discriminator.
- **Runtime queries simplify.** Per-block content fetch becomes a typed JOIN instead of "fetch artifacts bag, then unpack per kind." `src/lib/exercise-content/byKind/*.ts` files shrink.
- **Pipeline writes simplify.** `scripts/lib/pipeline/capability-stage/projectors/*.ts` write typed rows directly instead of building artifact rows with per-kind JSON shapes.
- **The single source of truth rule is satisfied** (target-architecture.md §6). Each fact about a capability lives in exactly one row.
- **`ArtifactKind` type union is retired** (or trimmed to the meaningful kinds — likely just `audio_clip` for FK semantics; possibly removed entirely).
- **The `ArtifactIndex` + `hasApprovedArtifact` + `artifactRegistry.ts` surface retires.**
- **`learning_capabilities.metadata_json.requiredArtifacts` and `.artifact_fingerprint` retire** (ADR 0006's lesson_id is unaffected; this is a separate field).
- **Validating readiness becomes async** (was sync once `ArtifactIndex` was loaded). The pipeline's per-cap validation does an extra DB call per capability — for ~4,005 caps × N kinds, this adds bounded latency to `materialize-capabilities.ts`. Acceptable; tuneable via batched joins.
- **The "approval gate" affordance is closed.** Today `quality_status='blocked'` could suppress a capability without retiring it. Going forward, blocking requires deleting / un-publishing the upstream row, or marking `learning_capabilities.publication_status='retired'`. No live use case exercises the artifact-quality-status path; closing it eliminates a divergence surface.

## Related

- [ADR 0001: capability-based learning core](./0001-capability-based-learning-core.md) — the abstraction this ADR concretises.
- [ADR 0006: every lesson-derived capability has an introducing lesson](./0006-extend-lesson-id-to-all-capabilities.md) — the `lesson_id` column survives; this ADR doesn't touch it.
- [ADR 0009: typed-table-per-content-concept storage pattern](./0009-typed-table-per-content-concept-storage.md) — the principle this ADR instantiates.
- [Data model target proposal](../plans/2026-05-21-data-model-target.md) §Decision A — the full breakdown.
- [Data model investigation](../plans/2026-05-21-data-model-investigation.md) §3.2 — the evidence base.
