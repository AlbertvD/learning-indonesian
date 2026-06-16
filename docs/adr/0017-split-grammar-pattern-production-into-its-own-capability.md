# ADR 0017: Split Grammar-Pattern Production Into Its Own Capability

## Status

Accepted (2026-06-16). `architect` + `data-architect` both APPROVED `docs/plans/2026-06-16-grammar-produce-capability-split.md` (the implementation plan; `status: approved`). Not yet implemented — see that plan.

## Context

Each grammar pattern currently emits **two** scheduled capabilities (`scripts/lib/pipeline/capability-stage/projectors/grammar.ts:135-162`):

- `recognise_grammar_pattern_cap` (`recognise` mode)
- `contrast_grammar_pattern_cap` (`recognise` mode; `prerequisiteKeys = [recognise]`)

But **four** authored grammar exercise types exist, and the render contracts route them like this today (`src/lib/capabilities/renderContracts.ts:119-150`):

| Exercise type | Tests | Currently routed to |
|---|---|---|
| `choose_missing_word_ex` (cloze MCQ) | recognise the rule in context | `recognise_grammar_pattern_cap` |
| `choose_correct_form_ex` | distinguish from a lookalike | `contrast_grammar_pattern_cap` |
| `transform_sentence_ex` | **produce** — rewrite a sentence by the rule | `recognise_grammar_pattern_cap` |
| `translate_sentence_ex` | **produce** — constrained translation forcing the rule | `recognise_grammar_pattern_cap` |

So `recognise_grammar_pattern_cap` is rendered by two **production-level** exercises (`transform`/`translate`). This is a **level-impurity bug**: the scheduled unit is labelled "recognise," but the learner is asked to *produce*. It violates the project's settled principle that **cognitive level belongs to the capability, not the exercise** — an exercise may vary surface format only *within* a level and must never shift it (`docs/current-system/capability-and-exercise-model.md` §7 box, "Settled 2026-06-06"; transfer-appropriate processing, Morris/Bransford/Franks 1977; receptive≠productive knowledge, Laufer & Goldstein 2004).

**ADR 0010 explicitly flagged this exact mismatch** as future work in its §"Pedagogical implications" and Consequences: *"`pattern_recognition` (recognition) rendered as `sentence_transformation`/`constrained_translation` (production) … split the capability or restrict the render so level is never shifted."* This ADR resolves that open question.

**Grammar is a live, practised surface — not dead data.** A 2026-06-16 live-DB check found 97 patterns, 194 pattern caps, and 1,471 authored grammar exercise rows (`contrast_pair_exercises` 305, `sentence_transformation_exercises` 388, `constrained_translation_exercises` 485, `cloze_mcq_exercises` 293). The author confirmed practising grammar. (Earlier code comments and ADR 0010's "0 review events" snapshot are stale: the 2026-06-16 capability-rename cutover truncated `capability_review_events`/`learner_capability_state`, so current low counts are wipe residue, not evidence the feature is unused.)

Two options to fix the level shift (ADR 0010's framing):

- **(a) Restrict the render** — forbid `recognise_grammar_pattern_cap` from rendering `transform`/`translate`, leaving those two exercise types (873 authored rows) unrouted / dead.
- **(b) Split the capability** — mint a productive capability that owns the two production exercises, so the authored rows stay live and production becomes its own scheduled skill.

## Decision

Take **(b): split.** Mint a new productive capability `produce_grammar_pattern_cap` (`produce_mode`). Every grammar pattern now emits **three** capabilities — recognise / contrast / produce — with a strict difficulty ladder.

### Routing (render contracts)

| Capability | Renders | Mode |
|---|---|---|
| `recognise_grammar_pattern_cap` | `choose_missing_word_ex` **only** | recognise |
| `contrast_grammar_pattern_cap` | `choose_correct_form_ex` | recognise |
| `produce_grammar_pattern_cap` (**new**) | `transform_sentence_ex` + `translate_sentence_ex` | produce |

The 1,471 authored exercise rows are **repointed by routing, not moved**: the typed exercise tables are keyed by `grammar_pattern_id`, not `capability_id` (`src/lib/exercise-content/byKind/pattern.ts`), and that fetcher keys off `block.renderPlan.exerciseType` — so it needs no change. The cap→exercise routing lives entirely in `renderContracts.ts`.

### Prerequisite chain — linear

`recognise → contrast → produce`. The projector emits `produce` with `prerequisiteKeys = [contrastKey]` (contrast already carries `[recognitionKey]`). Production therefore unlocks one stabilised step *after* contrast, honouring receptive-before-productive staging (ADR 0007).

This is the **only** sequencing mechanism for grammar: `grammar_pattern_src` caps are exempt from ADR 0007's *stability* staging gate (the carve-out at `src/lib/session-builder/pedagogy.ts:362-364`), but the prerequisite-suppression rule (`pedagogy.ts:321`) still runs. A prerequisite is "satisfied" at `activationState === 'active' && successfulReviewCount > 0` (`pedagogy.ts:519-521`) — i.e. answered correctly once, not mastered — so the chain is gentle, not over-gating. The same chain already works for `contrast` today, so there is no stuck-cap path.

### Phase taxonomy (coherence only)

`capabilityPhase` (`pedagogy.ts:208`) is exhaustive, so `produce_grammar_pattern_cap` must be assigned: **Phase 4** (productive recall). The pre-existing `recognise_grammar_pattern_cap = Phase 4` is corrected to **Phase 3** (it now renders only an MCQ — a "choose from options" task). These values are **inert for grammar** (read only inside the staging gate that the carve-out skips); the change is for switch coherence, not behaviour.

### Renderability invariant — one predicate, narrowed + extended

`scripts/lib/pipeline/capability-stage/satellitePresence.ts` is the **single shared definition** of "is this pattern cap renderable?", feeding both the pipeline reconciliation soft-retire (`reconcileArtifactPresence`) and the live-DB health checks (HC19/HC20). Today its `recognise` arm passes on the **union** of (cloze ∪ transform ∪ translate) (`satellitePresence.ts:119,126-127`). That union becomes **unsafe** after the split: a `recognise` cap whose pattern has a `transform` row but no `cloze` row would pass the union yet be unrenderable (recognise now renders cloze only) — the "ready-but-unrenderable cap → session always N−2" failure class.

The single predicate (`findPatternCapsMissing`, `satellitePresence.ts:100-132`) is updated in place with three arms:

- `contrast` → needs a `choose_correct_form_ex` row (unchanged)
- `recognise` → needs a `choose_missing_word_ex` (cloze) row — **narrowed from the union**
- `produce` (**new**) → needs ≥1 row in (`transform_sentence_ex` ∪ `translate_sentence_ex`)

Because all three arms read the one predicate, reconciliation and the health checks cannot drift to three definitions of "renderable" (the property `project_three_layer_invariant_gates` exists to preserve). The live health check in `check-supabase-deep.ts` keeps its existing per-capability-type reporting (HC19 contrast, HC20 recognise) and gains a per-type `produce` report line — reports off the one predicate, not a second definition.

### Progress visibility — chip, no new mastery dimension

Grammar production gets a third **"Produceren"** chip per pattern in `src/components/progress/GrammarPatternList.tsx`, beside the existing *Herkennen* + *Onderscheiden* chips. The per-pattern chips are built by filtering caps **by `capability_type` directly** (`src/lib/analytics/mastery/masteryModel.ts` grammar rung), so the chip needs **no new `MasteryDimension`**: `dimensionForCapability` folds `produce_grammar_pattern_cap` into the existing `pattern_use` dimension (`masteryModel.ts:155-156`) for the generic summaries. This is the honest indicator without a dedicated meter for a presently-lightly-practised skill.

The Vaardigheden skill-mode card (`SkillModeGapsCard`) is **not** touched: it is vocabulary-only by design (`masteryModel.ts:634-635` skips non-`vocabulary_src` caps) because it counts *words*, and grammar production is rule application over open content, not lexical recall — the two are not commensurable.

### Cutover — additive, no migration, no truncate

`capability_type` is bare `text` with no CHECK (`scripts/migration.sql:1335,1364`), so **no migration**. The cap writer is `upsertCapabilitiesSkipIfExists` (by `canonical_key`), so re-publishing each grammar lesson **adds** the new `produce` cap while leaving the existing two untouched; the per-pattern seeded-check (`patternSeeding.ts`) sees all four exercise types present and **skips regeneration**, preserving all 1,471 rows. No `--regenerate`. Acceptable in build-stage per Operating Context; learner FSRS state is disposable test data.

## Consequences

- **The two production exercise types (873 rows) become correctly schedulable** under a productive capability instead of mislabelling a recognition skill.
- **Each pattern's overall mastery reads lower until production is reached.** The weakest-wins pattern rung now spans three facets, so a pattern is not "mastered" until the learner can *produce* it. This is the split being truthful, not a regression.
- **The grammar mastery funnel counts rise.** Going 2→3 caps per pattern raises the grammar funnel's `introduced/learning/strengthening/mastered` tallies, and a pattern's "mastered" bucket now also requires its produce cap. Correct behaviour (more to master), but an explicit consequence pinned by a funnel-count test (plan Task 8).
- **One new hidden consumer must be updated:** `src/components/experience/buildFeedbackInput.ts:7` (`GRAMMAR_CAPABILITY_TYPES = new Set([...])`) — a string `Set` the type-checker will **not** flag. `produce_grammar_pattern_cap` must be added (with a test) or the feedback flow wrong-paths silently.
- **Forced mechanical touch-points** (load-time guardrails / exhaustive switches make these compile-enforced, not gold-plating): `capabilityTypes.ts` (union + array + `deriveSkillTypeFromCapabilityType → produce_mode`), `renderContracts.ts`, `projectors/grammar.ts`, `capabilityCatalog.ts`, `labels.ts` (Dutch label authored), `masteryModel.ts` (`dimensionForCapability` arm).
- **No schema change, no live-system safety machinery** — additive seed only.
- **Liveness is the done-bar, not data existence** (`feedback_answer_log_check`): claim shipped only after a real `capability_review_events` row lands for a `produce_grammar_pattern_cap` in the running app, and after HC19/HC20/produce-arm are green with all 97 patterns confirmed to carry a `cloze_mcq_exercises` row (else `recognise` caps soft-retire).
- **Option (a) rejected:** it would orphan 873 authored rows and leave production untestable — the opposite of the goal.

## Related

- [ADR 0007: receptive-before-productive staging](./0007-receptive-before-productive-staging.md) — the prerequisite/staging machinery this chain plugs into; the `grammar_pattern_src` carve-out.
- [ADR 0009: typed-table-per-content-concept storage](./0009-typed-table-per-content-concept-storage.md) — the typed grammar-exercise tables (keyed by `grammar_pattern_id`) that make the cutover render-only.
- [ADR 0010: wire grammar exercises via pattern capabilities](./0010-wire-grammar-exercises-via-pattern-capabilities.md) — flagged this exact level mismatch as future work; this ADR resolves it.
- `docs/current-system/capability-and-exercise-model.md` §7.6 (the open question) + §8 (`produce_grammar_pattern_cap` named in the `_cap` table).
- `docs/plans/2026-06-16-grammar-produce-capability-split.md` — the implementation spec (to be written).
- Memory `project_capability_naming_rename_phaseA` — records this split as the post-rename follow-up slice.
