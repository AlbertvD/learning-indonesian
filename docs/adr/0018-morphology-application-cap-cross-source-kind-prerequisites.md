# ADR 0018: Morphology Application Capabilities Gate On Two Cross-Source-Kind Prerequisites

## Status

Accepted

Amends the morphology carve-out in [ADR 0007](./0007-receptive-before-productive-staging.md) §"Morphology carve-out" (the staging-gate exemption stands; this ADR adds the prerequisites that replace the within-pair chain as the sequencing mechanism). Implements the §7 obligation of `docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md`.

**Amended 2026-06-17** (`docs/plans/2026-06-17-morphology-nasalization-cap-model-fix.md`): the per-pair `recognise_allomorph_from_root_cap` named below was **retired**. The application tier is now **two** capabilities per pair (`recognise_word_form_link_cap` + `produce_derived_form_cap`). Nasalization recognition lives at the **rule tier** (`grammar_pattern_src` recognise/contrast/produce, ADR 0017), not per word-form pair. The cross-source-kind prerequisites below are unchanged — they attach to both surviving caps; the retired cap was a leaf in the prerequisite graph, so nothing depended on it.

## Context

The morphology **application tier** — `word_form_pair_src` capabilities (`recognise_word_form_link_cap` and `produce_derived_form_cap`; the per-pair `recognise_allomorph_from_root_cap` was retired 2026-06-17, see Status) — drills a learner on *affixed forms* (e.g. *menulis* from root *tulis* + meN-).

ADR 0007's receptive-before-productive **staging gate** (Mechanism A) is **carved out** for `word_form_pair_src` (`pedagogy.ts:366-375`): all its cap types are productive (Phase ≥ 3), so there is no Phase 1/2 sibling at the same `source_ref` to unlock them, and applying the gate would permanently orphan-suppress every morphology cap. ADR 0007:44 named the within-pair `prerequisiteKeys` chain (recognise → produce) as the remaining sequencing mechanism.

That within-pair chain is **insufficient for morphology learning-order**. Two dependencies it cannot express:

1. **Rule before application.** A learner should not be drilled to recognise/produce an affixed form before the affix's *rule* is met. ADR 0006's introducing-lesson gate governs *activation* (the cap can't schedule before its lesson is activated) but not *mastery of the rule* — the rule's `grammar_pattern` cap can still be dormant while the application caps schedule.
2. **Root before derived.** A learner should not drill *menulis* before the root *tulis* is known — you cannot learn the derivation without the base. The root is a `vocabulary_src` item; its recognition cap lives at a *different* `source_ref` and a *different* `source_kind` than the pair.

Both are **cross-source-kind** dependencies. Critically, because the staging gate is carved out, the root→derived prerequisite is the **sole** enforcement of morphology learning-order — there is no other mechanism behind it.

## Decision

Each morphology **application** capability emits **two hard-block prerequisites**, both cross-source-kind, in its `prerequisiteKeys`:

- **(i) Rule → application.** The affix's `grammar_pattern_src` capability `canonical_key`, resolved from the pair's `grammar_pattern_id` FK (the rule the lesson teaches). *"Don't drill the forms before the rule is met."*
- **(ii) Root → application** (the load-bearing one). The derived form's **root vocabulary** recognition cap `canonical_key` — `vocabulary_src` / `recognise_meaning_from_text_cap` — built deterministically (no DB query) via `buildCanonicalKey` with **all six** args matching the live vocab recognition cap exactly: `sourceKind='vocabulary_src'`, `sourceRef=sourceRefForLearningItem(root_text)` (applies `itemSlug`), `capabilityType='recognise_meaning_from_text_cap'`, `direction='id_to_l1'`, `modality='text'`, `learnerLanguage='nl'` (mirroring `vocab.ts:149-158`). *"Don't drill *menulis* before *tulis* is known."*

**"Hard-block"** is expressed through the existing `satisfiedKeys` mechanism (`pedagogy.ts:524-526`): a key is *satisfied* only when its cap is `active` AND `successfulReviewCount > 0`. So an application cap stays in the dormant pool until **both** the rule cap and the root-vocab cap are learned — not merely activated.

### Why no planner change is required

The prerequisite test is mechanical and source-kind-agnostic:

- `pedagogy.ts:326` — `capability.prerequisiteKeys.some(key => !ctx.satisfiedKeys.has(key))` suppresses `missing_prerequisite` for any unsatisfied key, regardless of which `source_kind` minted it.
- `satisfiedKeys` (`pedagogy.ts:524-526`) is a flat `Set<canonical_key>` over all of the learner's states — it spans every source kind.

The chain was *previously* only populated within a pair, but the resolver was never pair-scoped. So only the **projector-emit** changes (`projectAffixedCapabilities` adds the two keys to every application cap's `prerequisiteKeys`); the planner and the satisfied-set construction are untouched.

## Consequences

- **An unsatisfiable prerequisite permanently orphan-suppresses the drill** — a content defect, not a feature. Two ways it can arise: the pair's root is not a `learning_item` (key (ii) never enters `satisfiedKeys`), or the pair has no `grammar_pattern_id` (key (i) can't be built). The phase-b §6 three-layer gate forbids both reaching the DB: the Layer-2 pre-write validator and the Layer-3 health check assert every pair resolves to a live `grammar_pattern_id` **and** every `root_text` resolves to a live `learning_items` row (via `itemSlug`).
- **The root-vocab key couples to the all-NL corpus.** `learnerLanguage='nl'` is hardcoded to match the live vocab recognition cap (`vocab.ts:149/157`). A mismatch in any of the six `buildCanonicalKey` args yields a key that is silently never satisfied. This is asserted by tests against `vocab.ts`'s emitter, not just read from the spec.
- **ADR 0007's staging-gate exemption is unchanged.** Morphology still bypasses Mechanism A — it genuinely has no Phase 1/2 sibling. What changes is only that the within-pair recognise→produce chain is no longer the *sole* sequencing mechanism: two cross-source-kind prerequisites now sit in front of every application cap, and (ii) carries the root-before-derived order the staging gate cannot.
- **`productive=false` (lexicalised) pairs** emit only `recognise_word_form_link_cap` (no produce cap); both prerequisites still apply to the recognition cap.
- **Determinism and additivity preserved.** Both keys are pure functions of already-projected data (the `grammar_pattern_id` FK + the root text). No schema change for the planner, no projection-version bump (`capability-v3` stands), no new DB writes beyond the additional `prerequisiteKeys` array entries already carried on every cap row.

## Related

- [ADR 0006: every lesson-derived capability has an introducing lesson](./0006-extend-lesson-id-to-all-capabilities.md) — governs *activation*; this ADR governs *mastery-ordering* on top of it.
- [ADR 0007: receptive-before-productive staging](./0007-receptive-before-productive-staging.md) — the staging gate this amends; morphology's exemption from it is why prerequisite (ii) is load-bearing.
- [ADR 0011: capability content is DB-authoritative after seeding](./0011-capability-content-is-db-authoritative-after-seeding.md) — the projector-emit that populates these keys runs in the Capability Stage.
- `docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md` §7 — the implementation obligation; §6 — the three-layer gate that makes both prerequisites satisfiable.
