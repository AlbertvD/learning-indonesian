---
status: approved
title: Morphology nasalization cap-model fix — retire the per-pair allomorph cap
author_session: morphology linguist-authoring follow-on (grill-with-docs, 2026-06-17)
reviewed_by: [architect, data-architect]   # architect round-3 APPROVE; data-architect round-2 APPROVE (round-3 edits schema-neutral)
supersedes: []
relates_to:
  - docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md   # shipped; this corrects its cap model
  - docs/adr/0017-split-grammar-pattern-production-into-its-own-capability.md
  - docs/adr/0018-morphology-application-cap-cross-source-kind-prerequisites.md
---

# Morphology nasalization cap-model fix

> **Sequencing.** This is **step 1** of the morphology authoring rollout. It must ship
> **before** the authoring-capability build (the deterministic engine + `linguist-structurer`
> extension + 14-chapter ingest), so that new content lands on the corrected capability model
> instead of being re-derived later. The authoring-capability spec is a separate, follow-on
> document that depends on this one.

## 1. Operating-context re-derivation (build-stage)

Per CLAUDE.md Operating Context: single author/learner, **disposable data**, no live users, no
FSRS history worth preserving. This is load-bearing here — the fix is a **data-model change to
shipped, deployed phase-b**, and in a live system that would demand additive-then-subtractive
parity choreography. Here it does not: we **truncate the affected capability rows and re-publish**
the affected lessons. No backfill, no coexistence layer, no migration dance.

**There is no schema change.** `capability_type` is **bare `text not null` with no CHECK constraint**
(`scripts/migration.sql:1335`; the comment at `:1364` records this as a deliberate decision from the
naming rename). So retiring a capability type is **code + re-publish only** — there is no enum/CHECK to
edit. The retired type is prevented from ever being written again by the TypeScript `CapabilityType`
union (compile-time) + the pre-write validator + a live-DB health check (§8/§9), not by the DB schema.
The only `migration.sql` touch is a stale **column comment** (`:3481`).

## 2. The problem (a drift + a double-teaching)

Shipped phase-b mints **one `recognise_allomorph_from_root_cap` per affixed pair**
(`scripts/lib/pipeline/capability-stage/projectors/affixedCapabilities.ts:143-170`, gated on
`pair.allomorph_class != null`). For lesson 13's 14 hand-authored pairs this produces **14 such caps**,
including **four separate "mem-" caps** (`baca`, `beli`, `pukul`, `potong`) that all drill the *same*
phonological skill ("a p/b root takes **mem-**").

Two things are wrong with this:

1. **It is a documented drift.** `CONTEXT.md` already states a `word_form_pair_src` cap has **two**
   siblings (recognise-link + produce-form); the source comment at
   `scripts/lib/pipeline/capability-stage/projectors/morphology.ts:36-37` likewise says "2 per
   linguistic pair: recognition + recall". Phase-b silently added a *third*.
2. **It teaches nasalization in the wrong tier, per-word instead of per-rule** (see §3).

## 3. Pedagogical justification (why per-rule, not per-pair)

Grounded in `docs/research/2026-06-15-affix-morphology-module-research.md`:

- **Nasalization is the make-or-break sub-skill — and it is a RULE.** "Five nasal allomorphs
  (me-, mem-, men-, meny-, meng-, menge-) selected by root-initial phoneme, with p/t/k/s elision
  [10][1]. The #1 A2 BIPA error is omitting meN- and overgeneralizing -kan [2]" (research §14).
  "45% of A2 learners omit meN- — over-invest" (§78).
- **The literature models it ONE PER PHONOLOGICAL CONTEXT, not per word.** "Nasalization sub-rules
  are first-class capabilities (the failure point [2]); FSRS keeps p-drop scheduled long after
  vowel-meng retires" (§99); the recommended atomic unit is "one per phonological context class
  (p→m drop, t→n drop, k→ng drop, s→ny drop, vowel→meng, single-syllable→menge)" (§43).
- **The rule + worked-example split is the validated design** (§13, §40-44, §90): a per-affix/per-sub-rule
  **rule capability** carries generative knowledge; per-pair **application capabilities** carry
  retrieval fluency. The two settle on very different FSRS intervals.

The app **already implements** the per-context rule tier: lesson 13's grammar patterns
`l13-a1-…` (me-, no change), `l13-a2-…` (mem-/men-/meng-, no drop), `l13-b-…` (K/P/S/T drop) each
generate a **recognise → contrast → produce** capability ladder (ADR 0017). These *are* the
"first-class, per-phonological-context nasalization capabilities" the research prescribes.

The per-pair `recognise_allomorph_from_root_cap` is therefore the **per-word duplication the research
explicitly argues against** (§43), layered on top of a rule tier that already covers the skill.

> **Honest boundary.** The research dictates the *granularity* (per sound-context, first-class) and
> *emphasis* (over-invest in nasalization). Realizing that tier as the existing `grammar_pattern_src`
> capabilities — rather than a separate dedicated cap type — is an **engineering decision** (the
> lower-mechanism option), consistent with but not prescribed by the research. The "over-invest"
> finding is satisfied by keeping the **rule** capability densely scheduled (the recognise/contrast/produce
> ladder does this), not by multiplying near-identical per-word cards.

## 4. The fix

**Retire `recognise_allomorph_from_root_cap` entirely.** The nasalization rule stays at the rule tier
(`grammar_pattern_src` recognise/contrast/produce caps — already present). Each `word_form_pair_src`
then carries **exactly two** capabilities — `recognise_word_form_link_cap` + `produce_derived_form_cap` —
restoring the contract `CONTEXT.md` already documents. The worked-example pairs become pure *evidence*
for the rule, not a second place the rule is taught.

### 4.1 Deletion surgery (exhaustive; grep-verified 2026-06-17)

Acceptance — **two gates, because there are two compiler cascades**:
1. `grep -rn "recognise_allomorph_from_root_cap" src/ scripts/ docs/` returns **zero** code/contract hits
   (only this spec + the ADR-0018 amendment may name it historically); AND
2. `tsc --noEmit` is **clean** + the full test suite green. `tsc` is the gate that catches the *field-removal*
   cascade — a grep for the type name will NOT find the sites that break when
   `AffixedFormPairInput.allomorphClass` is removed (they reference the field, not the type). Also
   `grep -rn "allomorphClass" src/lib/exercise-content/` to confirm no render-path reference survives.

**Surgery order — TWO compiler cascades, run in order:**
- **Cascade 1 — remove the `CapabilityType` union member first** (`capabilityTypes.ts:45`). The compiler
  then fails every exhaustive consumer (`deriveSkillTypeFromCapabilityType:248`; `masteryModel.ts:163` case →
  the `:171` `never`-guard; `labels.ts:79` `satisfies Record<CapabilityType,...>`; `pedagogy.ts:228`;
  `renderContracts.ts:75`).
- **Cascade 2 — then remove the `AffixedFormPairInput.allomorphClass` render-input field**
  (`renderContracts.ts:329-330`). The compiler then fails its assignment + consumption sites:
  `affixedFormPair.ts:127` (`allomorphClass: row.allomorph_class` — a real **assignment**, not a comment),
  `cuedRecall.ts:26` (destructured name), and the `byType.test.ts` fixtures below.
Both cascades are compiler-driven — `tsc --noEmit` green ⇒ no silent miss.

| Site | Action |
|---|---|
| `src/lib/capabilities/capabilityTypes.ts:45` | remove from `CapabilityType` union (**do this first**) |
| `…capabilityTypes.ts:61` | remove from the runtime `CAPABILITY_TYPES` array |
| `…capabilityTypes.ts:248` | remove the `case` in `deriveSkillTypeFromCapabilityType` |
| `src/lib/capabilities/renderContracts.ts:75` | drop from `choose_form_ex.capabilityTypes`; update comments `:69,:74` |
| `src/lib/capabilities/renderContracts.ts:329` | remove `AffixedFormPairInput.allomorphClass` (only the deleted allomorph-cap MCQ consumed it — confirm via m1 below) |
| `src/lib/capabilities/affixCatalog.ts:22` | **comment only** — drop the "drives recognise_allomorph_from_root_cap" cite (keep `allomorphClasses`; still feeds the rule note + catalog HC) |
| `src/lib/session-builder/pedagogy.ts:228,231-234` | remove the allomorph-cap reference + its Phase-4-grouping explanatory comment |
| `src/lib/session-builder/labels.ts:79` | remove the allomorph-cap label entry |
| `src/lib/exercise-content/byType/cuedRecall.ts:26,8-14,45-55` | remove the destructured `allomorphClass` (`:26`), the `root_to_derived` allomorph-cap MCQ branch (`:45-55`), and its header-comment block (`:8-14`). After removal the builder has only the `derived_to_root` link-cap path — **replace the `if/else` with the link-cap path guarded by a fail-loud assert for the now-impossible `root_to_derived` direction** (defensible shape; the only remaining `root_to_derived` cap, `produce_derived_form_cap`, renders via `type_form_ex`, never `choose_form_ex`) |
| `src/lib/exercise-content/byKind/affixedFormPair.ts:127` | **code** — remove the `allomorphClass: row.allomorph_class` assignment into the render input (excess-property error once the field is gone); also update the `:20-24` header comment that names the retired cap |
| `src/lib/analytics/mastery/masteryModel.ts:163` | remove the `case` (the `:171` `never`-guard then enforces exhaustiveness) |
| `scripts/lib/pipeline/capability-stage/projectors/affixedCapabilities.ts:143-170` | **remove the 3rd-cap emission block** — the sole per-pair allomorph-cap emitter (`capabilityCatalog.ts` staging-path emits only 2; no second site) |
| `scripts/migration.sql:3481` | **comment only** — update `COMMENT ON COLUMN affixed_form_pairs.allomorph_class` to drop the retired-cap cite. **This is the only migration.sql edit** (no CHECK exists — see §1/§8) |
| `docs/current-system/capability-and-exercise-model.md:216,218,246` | retire the "3rd cap / morphology application tier" prose to the 2-cap contract |
| **DELETE** test `scripts/lib/pipeline/capability-stage/__tests__/projectors/affixedCapabilities.test.ts:192` | the "emits a 3rd cap when allomorph_class present" / `toHaveLength(3)` case — replace `:187`+`:192` with one "always exactly 2 caps regardless of allomorph_class" assertion |
| **DELETE** test `src/__tests__/renderContractsValidatorMatrix.test.ts:127-133` | the allomorph-cap matrix row |
| **DELETE** test `src/lib/exercise-content/__tests__/byType.test.ts:667-685` | the `choose_form_ex allomorph MCQ (root→derived)` test — it exercises the deleted `root_to_derived` branch |
| `src/lib/exercise-content/__tests__/byType.test.ts:691` | drop the `allomorphClass: 'mem'` fixture line from the surviving link-MCQ test (excess-property error once the field is gone) |
| `CONTEXT.md` | no change — `:60-61,:110` already document the 2-sibling contract (this fix *restores* it) |

> **Keep** `affixed_form_pairs.allomorph_class` / `allomorph_rule` **columns** — the engine still computes
> them and the reader still renders the rule note on link/produce exercises. We delete a *capability type*
> and the now-unused `AffixedFormPairInput.allomorphClass` *render-input field*, not the morphology payload.

### 4.2 Delete dead code: `MORPHOLOGY_PATTERN_SLUGS` / `lessonIntroducesMorphology`

`scripts/lib/pipeline/capability-stage/projectors/morphology.ts:20-32` defines `MORPHOLOGY_PATTERN_SLUGS`
+ `lessonIntroducesMorphology`. **Both reviewers verified this is dead code** — no production caller; only
`__tests__/projectors/morphology.test.ts` consumes it. `lesson_id` is stamped **unconditionally** by the
runner (`affixedCapabilities.ts:112,137,166` sets `lessonId: input.lessonId` on every emitted cap), never
consulting the slug set. Live DB confirms: all 42 L13 `word_form_pair_src` caps carry the L13 `lesson_id`
even though the set contains no `l13-*` slug.

The stale-slug observation was real, but reconciling a function nothing calls would be *adding mechanism to
make dead code "correct"* — the opposite of Minimum Mechanism. **Action: delete `MORPHOLOGY_PATTERN_SLUGS`,
`lessonIntroducesMorphology`, and the gate tests in `morphology.test.ts`.** (My earlier "must reconcile or
the rollout mis-stamps" framing was wrong — the stamp path does not use this function. Recorded as the
correction it is.)

## 5. Re-derive lesson 13

After the surgery, **re-publish lesson 13** (`--regenerate` the morphology unit) so its live capability
set drops the 14 allomorph caps and conforms to the 2-cap contract. Build-stage: truncate the L13
`word_form_pair_src` allomorph caps, re-seed. Verify live: each L13 pair has exactly 2 caps; the L13
grammar-pattern caps (`l13-a1/a2/b` → recognise/contrast/produce) are intact and carry the nasalization
rule.

## 6. ADR impact

- **ADR 0018** (morphology application cap cross-source-kind prerequisites) — the *application* caps
  (`recognise_word_form_link_cap`, `produce_derived_form_cap`) keep their cross-source-kind prereq on the
  rule pattern + the root-vocab prereq (both reviewers confirmed these still resolve; the allomorph cap was
  a leaf in the prereq graph). **Vehicle: an inline amendment to ADR 0018** (matching repo convention — 0018
  itself amends 0007 inline; a new ADR is heavier than warranted). Edit 0018's **§Context (line 11)**, which
  enumerates `recognise_allomorph_from_root_cap` as one of three application-tier types, down to the 2-cap
  tier, and its **§Consequences** prose, recording that nasalization recognition now lives at the ADR-0017
  rule tier.
- **ADR 0017** (grammar-pattern recognise/contrast/produce split) — unchanged; this fix *leans on* it.

## 7. The load-bearing claim reviewers must confirm

**Deleting the per-pair allomorph recognition leg loses no coverage the rule tier doesn't already provide.**
The deleted leg (`cuedRecall.ts:45-50`) is a per-word recognition MCQ ("for *pukul*, pick *memukul*"). The
claim: rule-level recognition is carried by `recognise_grammar_pattern_cap` on `l13-a1/a2/b`, and the
per-word version was the redundancy. **Data-architect / architect: confirm no exercise type, reader, render
contract, or mastery surface silently depends on the allomorph cap existing** beyond the enumerated sites in
§4.1 (staff-engineer verified the cuedRecall leg is the only render leg and that it is absorbed by the
rule-tier recognise/produce caps).

## 8. Supabase Requirements

### Schema changes
- **No schema change.** `capability_type` is **bare `text not null` with no CHECK** (`migration.sql:1335`;
  decision recorded at `:1364`). There is no enum/constraint to edit — both reviewers verified that a
  "drop from the CHECK" DDL would match nothing, pass `make migrate-idempotent-check` silently, and enforce
  nothing. The retirement is **code + re-publish only**.
- The **only** `migration.sql` edit is a stale **column comment**: `COMMENT ON COLUMN
  affixed_form_pairs.allomorph_class` at `:3481` currently cites the retired drill — drop that cite.
- Enforcement that the retired type is never re-written comes from three layers (§9), **not** the DB:
  the TS `CapabilityType` union (compile-time) + `validateAffixedFormPairs` (pre-write) + a live-DB HC.
- RLS policies: **N/A** — no new table; existing `learning_capabilities` policies unchanged.
- Grants: **N/A** — no surface change.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (no new schema/table).
- [ ] Kong CORS — **N/A**.
- [ ] GoTrue — **N/A**.
- [ ] Storage — **N/A**.

### Health check additions
- `check-supabase-deep.ts`: a new HC asserting **(a)** zero live `learning_capabilities` rows of the
  retired type, and **(b)** **≤ 2 capabilities per `word_form_pair_src` `source_ref`** (the restored
  2-sibling invariant; "siblings" = caps sharing a `source_ref`). HC17 (`check-supabase-deep.ts:932-979`,
  one `affixed_form_pairs` row per cap) is **unaffected** and stays.

## 9. Three-layer gate for this change

Reconciled against the fact that the TS union already prevents emitting the retired type:

1. **Layer 1 — type system + unit tests.** Removing the `CapabilityType` union member makes the retired
   type *unwritable at compile time*; the 2-cap contract is pinned by the updated tests
   (`affixedCapabilities.test.ts` "always exactly 2 caps", `renderContractsValidatorMatrix.test.ts`).
2. **Layer 2 — pipeline pre-write validator.** `validateAffixedFormPairs` asserts the **count** invariant
   (≤2 caps per `source_ref`). It does not "reject the retired type" — once the union member is gone the
   type cannot be constructed, so the validator's job is the count, not guarding a non-existent value.
3. **Layer 3 — live-DB health check** — the HC in §8 (no retired type live; ≤2 caps per `source_ref`).

## 10. Out of scope (follow-on authoring spec)

The deterministic `deriveAffixedForm` engine, the `linguist-structurer` extension + lean
`morphology-roots.ts`, the generation-script snapshot + class↔category cross-check, the static
irregular exception table, and the L9-16 + 14-chapter authoring all live in the **separate
authoring-capability spec**, which assumes this fix has shipped.
