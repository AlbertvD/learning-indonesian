---
status: shipped
implementation: merged to main (53e2bcf), deployed + 11 lessons republished 2026-06-23
merged_at: 2026-06-23
implementation_paths:
  - src/lib/capabilities/affixCatalog.ts
  - scripts/lib/pipeline/capability-stage/projectors/affixedCapabilities.ts
  - scripts/lib/pipeline/capability-stage/projectors/morphology.ts
  - src/lib/capabilities/renderContracts.ts
  - src/lib/exercise-content/byKind/affixedFormPair.ts
  - src/lib/exercise-content/morphologyDistractors.ts
  - src/lib/exercise-content/byType/recognitionMcq.ts
  - src/lib/exercise-content/byType/cloze.ts
  - scripts/check-supabase-deep.ts
reviewed_by: [staff-engineer, architect, data-architect]
supersedes: []
note: >
  Tasks 1-2 (gloss pipeline) dropped at integration — origin/main already had the
  gloss substrate via PR #271 (original branch was built on a stale base). Only the
  routing fork + render path + gate + HC + Task-3 carrier-harvest expansion shipped.
  OpenBrain lessons 5b5aecc1 (stale-base) + 9e408eed (cutover).
relates_to:
  - docs/adr/0021-morphology-exercise-routing-by-form-regularity.md
  - docs/adr/0018-morphology-application-cap-cross-source-kind-prerequisites.md
  - docs/adr/0019-morphology-derivation-is-a-generalized-catalog-recipe-composer.md
  - docs/adr/0011-capability-content-is-db-authoritative-after-seeding.md
---

# Morphology Exercise Routing by Form-Regularity — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route a morphology pair's exercises by the affix's form-regularity — single invariant prefix/suffix affixes drill *meaning + usage* (reusing vocabulary cap types), while allomorphic/confix/reduplication affixes keep *formation* drilling — decided once at the capability stage and encoded in the capability type, with the runtime staying affix-blind.

**Architecture:** The fork lives in the capability-stage projector `projectAffixedCapabilities` (it already receives `pair.affix`). Transparent pairs emit the existing `recognise_meaning_from_text_cap` + (carrier-conditional) `produce_form_from_context_cap`; everything else keeps `recognise_word_form_link_cap` + `produce_derived_form_cap`. The render contracts for `choose_meaning_ex` + `type_missing_word_ex` widen to accept `word_form_pair_src`; the `byKind/affixedFormPair` reader fetches the derived gloss, the root's meaning, and sibling-family glosses; deterministic distractors are built in-builder. Two substrate fixes precede the republish: derived glosses become republish-safe (currently DB-only, wiped by delete-then-insert), and the carrier harvest is widened. No schema change. See **ADR 0021** for the full rationale and **CONTEXT.md → Affix → "Form-regularity routing"** for the domain rule.

**Tech Stack:** TypeScript, Bun, Vitest. Capability-stage pipeline (`scripts/lib/pipeline/capability-stage/`), runtime exercise-content (`src/lib/exercise-content/`), capability catalog (`src/lib/capabilities/`). Live DB reads use `SUPABASE_SERVICE_KEY` + `NODE_TLS_REJECT_UNAUTHORIZED=0`; for diagnosis prefer direct psql over SSH (PostgREST reads are flaky — `project_homelab_postgrest_flaky_reads_use_direct_psql`).

---

## Decisions resolved during staff-engineer review (2026-06-22)

These were drafted as open questions; the code answered them, so they are now decided (not deferred):

1. **Gloss authoring home = a separate committed `morphology-glosses.ts` per lesson** (`source_ref → {nl, en}`), NOT `morphology-roots.ts`. The proposer rewrites every roots entry wholesale on `--write` (`propose-morphology-roots.ts:283,287` re-emit `{ root, affix, illustratesCategory }`), so a gloss field on a roots entry is clobbered on the next proposer run. A decoupled glosses file survives both the proposer and `generate-morphology-patterns` (which merges by `source_ref`). ADR 0021 updated to match. **Data-architect still confirms** this is the right source-of-truth shape, but the proposer-clobber fact rules out the roots-file alternative.
2. **The staging fork (`capabilityCatalog.projectCapabilities` affixed loop, `capabilityCatalog.ts:193-223`) is health/parity-only, not a live writer.** The live runner seeds via `projectAffixedCapabilities` (`runner.ts:279`); `materialize-capabilities.ts` + `check-capability-health.ts` are the only other callers. Task 7 confirms they do not re-seed in a live publish and pins this with a code comment — no fork mirror is built unless that confirmation fails.
3. **A Layer-2 validator gate IS built** (`morphology_meaning_gloss_missing`): a transparent pair whose `affixed_form_pairs` row lacks `derived_gloss_<nl|en>` fails the stage, mirroring the NOT-NULL guarantee the form path enjoys (HC31 habit, `project_three_layer_invariant_gates`). Folded into Task 6/8 — not an open question.

## Reviewer-facing open questions (genuine judgment calls for review)

- **Data-architect:** confirm the `morphology-glosses.ts` source-of-truth shape + the `recognise_meaning_from_text_cap` / `produce_form_from_context_cap` canonical-key tuples pinned in Task 5 are the right reuse (no analytics/skill-mode leak; canonical-key collision-free).
- **Architect:** confirm reusing the two vocab cap types on `word_form_pair_src` (vs. minting morphology types) sits correctly at the `lib/exercise-content` + capability-stage seams.

---

## Phase 1 — Substrate durability (MUST precede the republish)

The meaning card reads `derived_gloss_nl/_en`; today they are DB-only (PR #271 backfill) and `replaceAffixedFormPairs` does delete-then-insert without them, so any republish NULLs them. The usage card needs a carrier; only 61/267 pairs have one because the harvest is lossy. Fix both before any cap-type change forces a republish.

### Task 1: Extract the 267 existing DB glosses into committed source

**Files:**
- Create: `scripts/extract-morphology-glosses.ts` (one-time extraction tool)
- Create (output): `scripts/data/staging/lesson-<N>/morphology-glosses.ts` (one per lesson that has pairs)

**Step 1:** Write `scripts/extract-morphology-glosses.ts`: for each lesson dir under `scripts/data/staging/` with a `morphology-patterns.ts`, query `affixed_form_pairs` (join on `lesson_id`) for `source_ref, derived_gloss_nl, derived_gloss_en` where either gloss is non-null, and serialize to `morphology-glosses.ts` as:

```ts
// AUTHORED morphology meaning glosses, keyed by pair source_ref.
// Hand-authored substrate for the meaning card (ADR 0021). Survives proposer +
// generate-morphology-patterns regeneration. Migrated from the PR #271 DB backfill.
export const derivedGlosses: Record<string, { nl: string; en: string }> = {
  "lesson-11/morphology/ber-jalan-berjalan": { nl: "lopen / wandelen", en: "to walk" },
  // …
}
```

**Step 2:** Run it (`SUPABASE_SERVICE_KEY=… NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/extract-morphology-glosses.ts`). Expected: one `morphology-glosses.ts` per lesson; total entries == live non-null gloss count (cross-check with `select count(*) from indonesian.affixed_form_pairs where derived_gloss_nl is not null` via psql — flaky-reads memory).

**Step 3:** Commit.

```bash
git add scripts/extract-morphology-glosses.ts scripts/data/staging/lesson-*/morphology-glosses.ts
git commit -m "feat(morphology): extract derived glosses to committed staging source"
```

### Task 2: Thread the gloss through generation → projector → insert

**Files:**
- Modify: `scripts/generate-morphology-patterns.ts` (read `morphology-glosses.ts`, merge onto pairs, serialize the two fields; `GeneratedPair` gets `derivedGlossNl?/derivedGlossEn?`)
- Modify: `scripts/data/staging/lesson-*/morphology-patterns.ts` (regenerate — adds the gloss fields)
- Modify: `scripts/lib/pipeline/capability-stage/loadFromDb.ts:825-845` (`TypedAffixedPair` gains `derived_gloss_nl/_en`; select them at `:881`)
- Modify: `scripts/lib/pipeline/capability-stage/projectors/morphology.ts:148-164` (`rows.push` includes `derived_gloss_nl/_en`)
- Modify: `scripts/lib/pipeline/capability-stage/adapter.ts:486-504` (`replaceAffixedFormPairs` insert payload includes the two columns)
- Test: `scripts/generate-morphology-patterns.test.ts` (gloss merge), `scripts/lib/pipeline/capability-stage/__tests__/loadFromDbDialogueAffixed.test.ts` (select shape)

**Step 1: Write the failing test** — `generate-morphology-patterns` merges glosses by `sourceRef`:

```ts
it('merges authored derived glosses onto generated pairs by sourceRef', () => {
  const { pairs } = generateMorphologyPatterns({
    lessonNumber: 11, roots: [{ root: 'jalan', affix: 'ber-', illustratesCategory: '…' }],
    categories, knownItemSlugs, carrierTiers: [],
    derivedGlosses: { 'lesson-11/morphology/ber-jalan-berjalan': { nl: 'lopen', en: 'to walk' } },
  })
  expect(pairs[0]).toMatchObject({ derivedGlossNl: 'lopen', derivedGlossEn: 'to walk' })
})
```

**Step 2:** Run → FAIL (`derivedGlosses` not a param). **Step 3:** Add `derivedGlosses?: Record<string,{nl;en}>` to `GenerateInput`, merge in the `pairs.push` (`generate-morphology-patterns.ts:205-222`) by `sourceRef`; add the two serialize lines (`serializePairs:246-250`, emit only when present); have the CLI `main` read `morphology-glosses.ts` via `readExport`. **Step 4:** Run → PASS.

**Step 5:** Thread through the DB path: add `derived_gloss_nl/_en` to `TypedAffixedPair` + the `:881` select + the `morphology.ts` row + the `replaceAffixedFormPairs` insert. Add a projector unit test asserting the row carries the gloss. Run the affixed projector + loadFromDb tests → PASS.

**Step 6:** Regenerate all morphology lessons: `bun scripts/generate-morphology-patterns.ts 11 13 18 20 21 22 23 25 26 27 29` (+ any others). Confirm `git diff` shows only added `derivedGlossNl/En` lines.

**Step 7:** Commit.

```bash
git add scripts/generate-morphology-patterns.ts scripts/data/staging/lesson-*/morphology-patterns.ts scripts/lib/pipeline/capability-stage/{loadFromDb.ts,adapter.ts,projectors/morphology.ts} scripts/**/__tests__/*
git commit -m "feat(morphology): make derived glosses republish-safe through the pipeline"
```

### Task 3: Widen the carrier harvest (arrow RHS + prompt + dialogue tiers)

**Files:**
- Modify: `scripts/generate-morphology-patterns.ts:129-134` (`extractSentences` — stop dropping arrow lines; split on `→`/`->` and keep each side as a candidate), `:296-320` (`carrierTiersFromLesson` — add an exercise-prompt tier and a dialogue-line tier)
- Test: `scripts/generate-morphology-patterns.test.ts`

**Step 1: Write failing tests:**

```ts
it('harvests the RHS of an arrow grammar example', () => {
  // "Saya jalan → Saya berjalan ke pasar" should yield the carrier "Saya berjalan ke pasar"
  expect(harvestCarrier('berjalan', [['Saya jalan → Saya berjalan ke pasar']])).toBe('Saya berjalan ke pasar')
})
it('harvests from a dialogue line', () => {
  expect(harvestCarrier('berjalan', [[], [], [], ['Titin: Saya berjalan ke sekolah.']])).toBe('Saya berjalan ke sekolah')
})
```

**Step 2:** Run → FAIL (arrow line currently dropped; no dialogue tier). **Step 3:** In `extractSentences`, replace the arrow-drop filter: split each raw string on `→|->` first, then on sentence punctuation, dropping only the genuinely-too-short (<3 words) fragments — so the affixed side of `root → derived` survives. In `carrierTiersFromLesson`, add (a) exercise *prompt/question/sentence* strings (not just `obj.answer`) to the exercise tier, and (b) a new dialogue tier collecting `lesson_dialogue_lines`-shaped `text` from sections of `content.type==='dialogue'`. Keep tier priority `[grammar, story, exercise, dialogue]`. **Step 4:** Run → PASS.

**Step 5:** Regenerate all morphology lessons; `git diff` should show *added* `carrierText` lines (coverage rises from 61). Log the new coverage count in the commit body — **never silently**; if a lesson stays at 0, note it.

**Step 6:** Commit.

```bash
git add scripts/generate-morphology-patterns.ts scripts/data/staging/lesson-*/morphology-patterns.ts scripts/generate-morphology-patterns.test.ts
git commit -m "feat(morphology): widen carrier harvest (arrow RHS + prompt + dialogue tiers)"
```

---

## Phase 2 — The routing fork (capability stage)

### Task 4: The form-regularity signal helper

**Files:**
- Modify: `src/lib/capabilities/affixCatalog.ts` (add `routesToMeaningUsage(affix): boolean`)
- Modify: `src/lib/capabilities/index.ts` (export it)
- Test: `src/lib/capabilities/__tests__/affixCatalog.test.ts`

**Step 1: Write failing tests:**

```ts
it('routes single invariant prefix/suffix affixes to meaning/usage', () => {
  for (const a of ['ber-', 'di-', 'ter-', 'se-', 'memper-', '-an', '-kan', '-i']) {
    expect(routesToMeaningUsage(a)).toBe(true)
  }
})
it('keeps allomorphic, confix, and reduplication affixes on formation', () => {
  for (const a of ['meN-', 'peN-', 'ke-…-an', 'meN-…-kan', 'pe-…-an', 'reduplication', 'reduplication-an']) {
    expect(routesToMeaningUsage(a)).toBe(false)
  }
})
it('returns false for an unknown affix (fail safe to formation)', () => {
  expect(routesToMeaningUsage('zz-')).toBe(false)
})
```

**Step 2:** Run → FAIL. **Step 3:** Implement:

```ts
/** ADR 0021: a pair drills meaning/usage iff its affix is a SINGLE INVARIANT
 *  prefix or suffix — one trivial prepend/append. Allomorphic prefixes, confixes,
 *  and reduplication keep formation drilling (their form is the hard skill). */
export function routesToMeaningUsage(affix: string): boolean {
  const entry = BY_AFFIX.get(affix)
  if (!entry) return false
  return (entry.affixType === 'prefix' || entry.affixType === 'suffix')
    && (entry.allomorphClasses?.length ?? 0) === 0
}
```

**Step 4:** Run → PASS. **Step 5:** Commit.

### Task 5: Fork `projectAffixedCapabilities` by the signal

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/projectors/affixedCapabilities.ts` (the per-pair loop)
- Test: `scripts/lib/pipeline/capability-stage/projectors/__tests__/affixedCapabilities.test.ts`

**Step 1: Write failing tests** (one transparent pair, one allomorphic, one transparent-without-carrier):

```ts
it('emits meaning + usage caps for a transparent pair WITH a carrier', () => {
  const caps = projectAffixedCapabilities({ pairs: [berPairWithCarrier], lessonId, ruleCapKeyBySlug })
  expect(caps.map(c => c.capabilityType).sort()).toEqual(
    ['produce_form_from_context_cap', 'recognise_meaning_from_text_cap'])
  const produce = caps.find(c => c.capabilityType === 'produce_form_from_context_cap')!
  expect(produce.prerequisiteKeys).toContain(caps.find(c => c.capabilityType === 'recognise_meaning_from_text_cap')!.canonicalKey)
})
it('emits meaning-only for a transparent pair WITHOUT a carrier', () => {
  const caps = projectAffixedCapabilities({ pairs: [berPairNoCarrier], lessonId, ruleCapKeyBySlug })
  expect(caps.map(c => c.capabilityType)).toEqual(['recognise_meaning_from_text_cap'])
})
it('keeps form caps for an allomorphic pair (unchanged)', () => {
  const caps = projectAffixedCapabilities({ pairs: [meNPair], lessonId, ruleCapKeyBySlug })
  expect(caps.map(c => c.capabilityType).sort()).toEqual(
    ['produce_derived_form_cap', 'recognise_word_form_link_cap'])
})
```

**Step 2:** Run → FAIL. **Step 3:** In the loop, branch on `routesToMeaningUsage(pair.affix)`:

- **Transparent branch:** emit `recognise_meaning_from_text_cap` with the **pinned tuple** `{ sourceKind:'word_form_pair_src', sourceRef, capabilityType:'recognise_meaning_from_text_cap', direction:'id_to_l1', modality:'text', learnerLanguage:'nl' }` — identical to the established `recognise_meaning_from_text_cap` convention (`vocab.ts:155-157` + the `rootVocabPrereqKey` precedent in this same file), differing only in `sourceKind`+`sourceRef`, so it is collision-free. Carry `crossPrereqs`. If `pair.carrier_text` is non-empty AND `pair.productive !== false`, also emit `produce_form_from_context_cap` with the **pinned tuple** `{ sourceKind:'word_form_pair_src', sourceRef, capabilityType:'produce_form_from_context_cap', direction:'id_to_l1', modality:'text', learnerLanguage:'none' }` — copied verbatim from the only live `produce_form_from_context_cap` emitter (`dialogueCloze.ts:51-53`); the form-production-in-context skill is language-agnostic, so `'none'` (NOT `'nl'`) is correct and matches that convention. `prerequisiteKeys = [meaningKey, ...crossPrereqs]`.
- **Else branch:** the existing `recognise_word_form_link_cap` + `produce_derived_form_cap` block, unchanged.
- **Projector comment (architect note):** add a one-line note that the transparent recognise cap is the *first* `word_form_pair_src` cap to carry `learnerLanguage:'nl'` (the existing morphology caps use `'none'`, `affixedCapabilities.ts:99,110,135`) — it matches the vocab meaning-recall convention and is deliberate, so a future reader does not "fix" it back to `'none'`.

> **Why the pinned tuples are safe + the test that locks them:** `deriveSkillTypeFromCapabilityType` + `funnelBucket` key on `capabilityType`/`sourceKind`, never on `direction`, so `direction` does not affect mode/bucket. The reader's direction-decode (`affixedFormPair.ts:111-116`) is on the *form* path only; the new meaning/usage reader branch (Task 9) does not decode direction. **Each of the four emitted-cap tests (Step 1) MUST assert the full `canonicalKey` byte-string, not just `capabilityType`** — a silent key drift between projector and reader has no other gate catching it (data-architect M1).

**Step 4:** Run → PASS. **Step 5:** Commit.

### Task 6: Count-parity, gloss-presence gate & projector adjustments

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/verify/countParity.ts` (the affixed-cap count expectation is now per-pair-variable: 1 (meaning-only), 2 (meaning+usage), or 2 (form) — not a fixed 2×pairs)
- Modify: `scripts/lib/pipeline/capability-stage/projectors/morphology.ts` (CS12 still requires an `affixed_form_pairs` row per word_form_pair_src cap — confirm a meaning-only transparent pair still gets exactly one row keyed by its recognise cap; the produce cap, when absent, must not orphan-expect a row. **Add gate `morphology_meaning_gloss_missing`:** a transparent pair (`routesToMeaningUsage(affix)`) whose row would carry empty `derived_gloss_nl`/`derived_gloss_en` is a `severity:'error'` finding — the meaning card's substrate must be present, mirroring the NOT-NULL guarantee the form path's `root/derived/rule` enjoy.)
- Test: the countParity test + the morphology projector test (incl. a transparent-pair-missing-gloss → error case)

**Step 1:** Write failing tests: (a) count parity holds for a mixed lesson (transparent-with-carrier, transparent-without, allomorphic); (b) a transparent pair with no gloss raises `morphology_meaning_gloss_missing`. **Step 2:** Run → FAIL. **Step 3:** Extract a shared `expectedCapCountForPair(pair)` helper (used by both the projector and the gate so they cannot drift — `project_three_layer_invariant_gates`); add the gloss-presence check. **Step 4:** Run → PASS. **Step 5:** Commit.

### Task 7: Reconcile or retire the staging fork

**Files:**
- Modify (decision-dependent): `src/lib/capabilities/capabilityCatalog.ts:193-223` and/or `scripts/materialize-capabilities.ts`, `scripts/check-capability-health.ts`

**Verified (no live parity gate — architect W3):** there is **no** cross-emitter set-equality gate comparing `projectAffixedCapabilities` against `capabilityCatalog.projectCapabilities` in the publish path. CS7 (`verify/countParity.ts`) is a `>=` DB-presence check ("are the rows I declared present?"), not a cross-emitter parity assertion, and it is satisfied by Task 6's count adjustment. The Slice-5b set-equality check the `affixedCapabilities.ts:11` docstring mentions died with the retired staging-derived bundle (`runner.ts:355`). So forking only the live emitter does **not** trip a gate at republish.

**Step 1:** Confirm `materialize-capabilities.ts` + `check-capability-health.ts` (the only non-test callers of `projectCapabilities`) are health/reporting tools that do not seed `learning_capabilities` in a live publish. **Step 2:** Add a code comment at `capabilityCatalog.ts:193` pinning "health/parity-only; the live writer is `projectAffixedCapabilities` — do NOT treat this loop as the routing source of truth," and leave the loop unforked. (If Step 1 surprisingly shows either tool *seeds*, fall back to mirroring the Task-5 fork via a shared helper.) **Step 3:** Commit.

---

## Phase 3 — The render path (runtime, affix-blind)

### Task 8: Widen the render contracts

**Files:**
- Modify: `src/lib/capabilities/renderContracts.ts`:
  - `choose_meaning_ex.supportedSourceKinds` += `'word_form_pair_src'` (+ `requiredArtifacts.word_form_pair_src: []`); `capabilityTypes` unchanged (already serves `recognise_meaning_from_text_cap`).
  - `type_missing_word_ex.supportedSourceKinds` += `'word_form_pair_src'` (+ `requiredArtifacts.word_form_pair_src: []`); `capabilityTypes` unchanged (already serves `produce_form_from_context_cap`).
  - `ContractInputShapes['choose_meaning_ex']` (`:444`) — add `affixedFormPair: AffixedFormPairInput | null` (and relax `learningItem`/`primaryMeaning` to nullable, mirroring `choose_form_ex` at `:445`).
  - **`ContractInputShapes['type_missing_word_ex']` (`:451`) — add `affixedFormPair: AffixedFormPairInput | null`** (data-architect M2).
  - **`projectBuilderInput` `type_missing_word_ex` branch (`:580-594`)** — the current `if (raw.dialogueLine) {…} else {cloze-context lookup, fails malformed_cloze when contexts empty}` would fire the `else` for a `word_form_pair_src` cap (affixedFormPair set, contexts empty) and return `malformed_cloze` → the usage cap is **permanently, silently unrenderable**. Add an **`else if (raw.affixedFormPair)` guard** at `:580` that skips the cloze-context lookup (same shape as the `dialogueLine` guard at `:581`), and thread `affixedFormPair` into the `:637` return. (data-architect M2)
  - `choose_meaning_ex` narrowing (`:667-670`) — accept the `word_form_pair_src` bucket (mirror `choose_form_ex` at `:648-666`), passing `affixedFormPair` through.
- Test: `src/lib/capabilities/__tests__/renderContracts.test.ts`

**Step 1:** Write failing tests: (a) `validateCapability` for `recognise_meaning_from_text_cap` on `word_form_pair_src` returns `ready` with `choose_meaning_ex` allowed; (b) same for `produce_form_from_context_cap` → `type_missing_word_ex`; (c) **`projectBuilderInput('type_missing_word_ex', rawWithAffixedPair)` returns `{ok:true}`** (the M2 regression guard) and `projectBuilderInput('choose_meaning_ex', rawWithAffixedPair)` returns `{ok:true}`; (d) the module-load `assertRequiredArtifactsComplete` + `assertCapabilityTypesRenderable` IIFEs still pass. **Step 2:** Run → FAIL. **Step 3:** Make the contract + ContractInputShapes + projector edits above. **Step 4:** Run → PASS. **Step 5:** Commit.

> The resolver needs **no** change — `src/lib/exercises/exerciseResolver.ts:28-39` (`firstCompatibleExercise`) already picks first-compatible from `allowedExercises`, and these caps now resolve to `choose_meaning_ex` / `type_missing_word_ex` purely via the contract. (Note the path: it is `src/lib/exercises/exerciseResolver.ts`, NOT `src/lib/exercise-content/resolver.ts` — architect W1.) This is the affix-blind-runtime payoff.

### Task 9: Extend the `affixedFormPair` reader to fetch meaning substrate

**Files:**
- Modify: `src/lib/exercise-content/byKind/affixedFormPair.ts` (select `derived_gloss_nl, derived_gloss_en`; for caps that resolve to the meaning/usage exercises, also fetch the root's user-language meaning + sibling-family glosses for distractors)
- Modify: `src/lib/capabilities/renderContracts.ts` `AffixedFormPairInput` (+ `derivedGlossNl/En`, `rootMeaning`, `siblingGlosses: string[]`)
- Test: `src/lib/exercise-content/byKind/__tests__/affixedFormPair.test.ts`

**Step 1:** Write a failing test: a transparent recognise cap's resolved input carries `derivedGlossNl`, a non-empty `rootMeaning`, and `siblingGlosses`. **Step 2:** Run → FAIL. **Step 3:** Extend the select at `:62`; add a second query for the root's meaning (join `learning_items` on `normalized_text == itemSlug(root_text)` → `item_meanings`/`translation_{nl,en}`, user-language) and the sibling glosses (other `affixed_form_pairs` with the same `root_text`, their `derived_gloss_{lang}`); populate the new `AffixedFormPairInput` fields. Keep the existing fail-loud behavior. **Step 4:** Run → PASS. **Step 5:** Commit.

> **`rootMeaning` is guaranteed non-empty, not best-effort.** The ADR-0018 root-vocab prerequisite means every pair's root IS a `learning_items` row — `generate-morphology-patterns.ts:167-170` hard-fails authoring if it isn't. So the root-meaning join always resolves; the staff-engineer's "root not a vocab item → empty distractors" edge cannot occur. Task 10's POS-pool backfill remains as belt-and-braces for thin families, not for a missing root meaning.

> **Gloss + carrier live on EVERY row of the pair (architect W2).** `projectors/morphology.ts` writes one `affixed_form_pairs` row *per capability* (keyed by `capability_id`), and all per-row fields come from the pair (`pairsBySourceRef`), so a transparent pair's two caps (meaning + usage) produce two rows with *identical* pair-level data — both carry the same `derived_gloss_*` and `carrier_text`. The reader's per-`capability_id` fetch therefore always finds the gloss (meaning card) and the carrier (usage card) regardless of which cap is rendering; there is no "which row carries it" ambiguity. The `morphology_meaning_gloss_missing` gate (Task 6) checks any transparent-pair row.

> **Fail-loud parity:** a transparent recognise cap whose row has a NULL `derived_gloss_<lang>` must surface a `affixed_form_pair_meaning_gloss_missing` fail context (not render an empty MCQ) — mirrors the existing `affixed_form_pair_typed_row_missing`. Phase 1 makes this empty in practice, but the runtime must not silently degrade.

### Task 10: Deterministic meaning distractors

**Files:**
- Create: `src/lib/exercise-content/morphologyDistractors.ts` (pure: `pickMeaningDistractors({ correctGloss, rootMeaning, siblingGlosses, affixPoolGlosses, posPoolGlosses }): string[]`)
- Test: `src/lib/exercise-content/__tests__/morphologyDistractors.test.ts`

**Step 1: Write failing tests:**

```ts
it('prefers root meaning + family siblings, excludes the answer, guarantees 3', () => {
  const d = pickMeaningDistractors({
    correctGloss: 'to walk', rootMeaning: 'road',
    siblingGlosses: ['journey', 'streets'], affixPoolGlosses: ['to run'], posPoolGlosses: ['to eat','to sleep'],
  })
  expect(d).toHaveLength(3)
  expect(d).not.toContain('to walk')
  expect(d).toContain('road')            // root-meaning distractor drills the shift
})
it('never returns a near-duplicate of the answer or a dupe', () => { /* … */ })
it('backfills from the pos pool when the family is too small', () => { /* … */ })
it('throws/returns <3 only when the global pool is exhausted (caller fails loud)', () => { /* … */ })
```

**Step 2:** Run → FAIL. **Step 3:** Implement the priority cascade: `[rootMeaning, ...siblingGlosses, ...affixPoolGlosses, ...posPoolGlosses]`, normalized-dedup, drop any equal/near-equal to `correctGloss` (reuse the normalization the distractor module already uses), take 3. **Step 4:** Run → PASS. **Step 5:** Commit.

### Task 11: Builder branches (meaning MCQ + usage cloze)

**Files:**
- Modify: `src/lib/exercise-content/byType/recognitionMcq.ts` (a `word_form_pair_src` branch at the top: prompt = `derived`, correct = `derivedGloss<Lang>`, distractors via `pickMeaningDistractors`)
- Modify: `src/lib/exercise-content/byType/cloze.ts` (a `word_form_pair_src` branch: `sentence` = `blankDerivedInCarrier(carrierText, derived)`, `targetWord` = `derived`, `translation` = the carrier's translation if available else the derived gloss)
- Test: the two builders' test files

**Step 1:** Write failing tests: `buildRecognitionMCQ` with an `affixedFormPair` input renders prompt=`berjalan`, 4 options incl. `to walk`, no learningItem; `buildCloze` with an `affixedFormPair` + carrier renders a `___`-blanked sentence with `targetWord='berjalan'`. **Add a direction-agnostic assertion** (data-architect minor): the meaning MCQ output is identical for `direction:'id_to_l1'`, `'root_to_derived'`, and `'derived_to_root'` — the meaning/usage builders must never read `affixedFormPair.direction` (the reader silently normalizes unexpected values at `affixedFormPair.ts:115-116`; this test pins that the new branches don't depend on it). **Step 2:** Run → FAIL. **Step 3:** Add the branches (mirror `cuedRecall.ts`'s `affixedFormPair` branch shape: `learningItem: null`, populate the exercise-item meaning/cloze data). Reuse `blankDerivedInCarrier` (the same whole-word matcher the harvest used, so the blank lands). Fail loud if the carrier no longer contains the derived form. **Step 4:** Run → PASS. **Step 5:** Commit.

---

## Phase 4 — Verify, publish, deploy

### Task 12: Health checks + analytics spot-check

**Files:**
- Modify: `scripts/check-supabase-deep.ts` (add an HC: every `word_form_pair_src` `recognise_meaning_from_text_cap` has a `derived_gloss_<nl|en>`-bearing `affixed_form_pairs` row; and the existing morphology HCs still pass)
- Verify (no code): `funnelBucket` already maps `word_form_pair_src → morphology` and the vocab skill profile fences to `vocabulary_src` (`masteryModel.ts:405-408,646`) — confirm by a unit test that a `recognise_meaning_from_text_cap` on `word_form_pair_src` counts in the morphology funnel and NOT in the vocabulary skill profile.

**Step 1:** Write the analytics unit test → it should already pass (assert current behavior is correct); if not, that is a real bug to fix. **Step 2:** Add the HC + its test. **Step 3:** Commit.

### Task 13: Republish + live verification

**Steps (no new code):**
1. `make migrate` is **not** needed (no schema change). Confirm `git diff scripts/migration.sql` is empty.
2. Republish each morphology lesson with `--regenerate` so the cap types swap and the glosses/carriers land: per-lesson capability-stage run (use the `capability-stage` skill, which monitors gate-by-gate). Verify on each: HC green, and a ground-truth psql count of `recognise_meaning_from_text_cap` rows on `word_form_pair_src`.
3. e2e: open the Affix Trainer for a `ber-` affix, "Practise ber-", confirm the recognise card is now "what does *berjalan* mean?" (not decompose) and, where a carrier exists, a usage cloze appears. Confirm an allomorphic affix (`meN-`) still shows decompose + type-form.
4. Query `capability_review_events` after a session to confirm the new caps land review rows (`feedback_answer_log_check`).
5. Build the image + recreate the homelab container (`docs/process/deploy.md`); verify Running + healthy.

**Step 6:** Update **ADR 0021** frontmatter to `Accepted`/implemented note, set this plan's `status: shipped` + `implementation_paths`, and update the resume-memory. Commit.

---

## Out of scope (documented, deliberate)

- **Meaning card for ALL affixes** (the allomorphic/confix/reduplication track also getting a meaning card *alongside* form) — additive follow-on, gated on the vocab-overlap check (ADR 0021 Consequences). Not v1.
- **`choose_form_ex` `word_form_pair_src` dead branch** cleanup — separate.
- **Synthetic carrier generation** — rejected for v1; harvest-expansion only.
