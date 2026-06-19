---
status: shipped
implementation: PR #259
merged_at: 2026-06-19
reviewed_by: [staff-engineer, architect, data-architect]
supersedes: []
implementation_paths:
  - src/lib/capabilities/affixCatalog.ts
  - src/lib/capabilities/affixDerivation.ts
  - src/lib/exercise-content/byType/decomposeWord.ts
  - src/lib/exercise-content/byType/typedRecall.ts
  - scripts/data/staging/lesson-22/morphology-roots.ts
related:
  - docs/adr/0019-morphology-derivation-is-a-generalized-catalog-recipe-composer.md
  - docs/plans/2026-06-18-morphology-generalized-derivation-and-context.md
---

# L22 Reduplication Engine Extension — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in the MAIN THREAD (code-editing subagents are blocked by the read-before-edit hook — `project_subagent_edit_hook_transcript_fault`).

**Goal:** Teach the morphology engine the three *productive, rule-derivable* reduplication shapes of Lesson 22 (Bab 6, *Verdubbelingen*) — full (`anak-anak`), reduplication + `-an` (`sayur-sayuran`), and `ke-…-an` reduplication (`kebiru-biruan`) — and publish L22's morphology pairs live, gate-clean and render-verified.

**Architecture:** Reduplication becomes a **base modifier** in the existing catalog-recipe composer (ADR 0019, amended 2026-06-19): it doubles the root to form a base, then *optionally* applies the existing fixed-prefix / fixed-suffix slots. `circumfix_left/right` stay **null** on every reduplication row (the CS12/HC31 invariant is unchanged → **no migration, no gate code change**); the exercise builder re-derives wrap pieces from the catalog recipe at render. `decompose_word_ex` renders *wrapped* reduplication as `[left, root-root, right]` and *full* reduplication as `[root, root]` (so it never fails-loud → no ready-but-unrenderable cap). Asymmetric `root-meN(root)` (`sewa-menyewa`), sound-change, lexicalised, and fixed-adverb reduplications are **vocabulary, not morphology pairs**.

**Tech Stack:** TypeScript, Bun, Vitest + @testing-library/react. Pure-function engine in `src/lib/capabilities/`; deterministic generation script in `scripts/`; the 2-stage publish pipeline (`scripts/publish-approved-content.ts`).

**Review routing (do this BEFORE marking `approved`):** staff-engineer first (soundness/simplicity), then **architect + data-architect** (CLAUDE.md: a writer→reader contract is touched — `affixed_form_pairs.affix` gains reduplication-family values and `decompose_word_ex` changes its segmentation contract — so both sign-offs are required and the `plan-review-gate` enforces data-architect). Record all in `reviewed_by:`.

---

## Context the engineer needs (read once)

- **The pipeline & source-of-truth.** Lesson content re-derives from staging files; the DB is disposable (pre-launch, single learner). Truncate/rebuild freely. See `CLAUDE.md` → Operating Context.
- **The morphology data flow.** A human authors a LEAN judgment-only `scripts/data/staging/lesson-N/morphology-roots.ts` = `{ root, affix, illustratesCategory }[]`. `scripts/generate-morphology-patterns.ts` runs the deterministic engine `deriveAffixedForm(root, affix)`, fills the rule-governed fields, harvests a carrier sentence, mints the grammar-pattern slug, and emits the committed `morphology-patterns.ts` snapshot. The Lesson Stage writes the `lesson_section_affixed_pairs` rows; the Capability Stage projects the capability-side `affixed_form_pairs` rows + the two caps per pair (`recognise_word_form_link_cap`, `produce_derived_form_cap`, ADR 0018).
- **The catalog.** `src/lib/capabilities/affixCatalog.ts` is the controlled affix vocabulary. Every authored `affix` MUST be a catalog member (`isCatalogAffix`); CS12 (pre-write) + HC31 (live DB) assert it. Each entry carries a `composition` recipe `{ prefix?, suffix?, reduplicate? }` the engine reads.
- **The exercise resolver is dumb.** `src/lib/exercises/exerciseResolver.ts` picks the *first* compatible exercise type for a `capabilityType` (decompose before choose_form for `recognise_word_form_link_cap`); it never inspects the row. So whatever it picks MUST render — hence full reduplication must render in `decompose_word_ex`, not fail.
- **`?force_capability` is OFF in the prod build** — live-browser render-verify via that URL silently falls back. Render is verified by RTL against live data shapes + DB + gate (the L21 precedent).

> **No pre-existing reduplication rows (verified 2026-06-19).** Only L13/18/20/21 have `morphology-patterns.ts`, and none emit `affixType: 'reduplication'`. So `morphemePieces`'s current lack of a reduplication branch is *latent* — never reached by a published row. Task 1 (adds the catalog entries) and Task 3 (adds the branch) ship in the **same PR**, so no reduplication cap ever lands unrenderable. This closes the data-architect's C1 (the bare-prefix fallthrough is closed before the first reduplication row is ever authored).

### Invariants this plan must NOT break

- `affix_type === 'reduplication'` ⇒ `circumfix_left/right` are null (CS12 `affixedFormPairs.ts:43-45`, HC31 `check-supabase-deep.ts:1042`). **Keep this true** — do not store wrap pieces.
- A carrier must contain `derived_text` as a whole word (CS12:48, `blankDerivedInCarrier`). Already reduplication-safe (internal hyphens kept).
- Every authored `affix` ∈ catalog (CS12:32). New entries added in Task 1 satisfy this.

---

## Phase 1 — Engine + catalog (derivation)

### Task 1: Add the two new reduplication catalog entries

**Files:**
- Modify: `src/lib/capabilities/affixCatalog.ts` (the `AFFIX_CATALOG` array, the reduplication section near line 103-104)
- Test: `src/lib/capabilities/__tests__/affixCatalog.test.ts` (create if absent; otherwise add cases)

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { isCatalogAffix, affixCatalogEntry } from '../affixCatalog'

describe('reduplication-family catalog entries (L22)', () => {
  it('reduplication-an is a catalog affix with a redup+suffix recipe', () => {
    expect(isCatalogAffix('reduplication-an')).toBe(true)
    const e = affixCatalogEntry('reduplication-an')!
    expect(e.affixType).toBe('reduplication')
    expect(e.composition).toEqual({ reduplicate: true, suffix: 'an' })
  })
  it('ke-…-an-reduplication is a catalog affix with a fixed-prefix + redup + suffix recipe', () => {
    expect(isCatalogAffix('ke-…-an-reduplication')).toBe(true)
    const e = affixCatalogEntry('ke-…-an-reduplication')!
    expect(e.affixType).toBe('reduplication')
    expect(e.composition).toEqual({ prefix: { fixed: 'ke' }, reduplicate: true, suffix: 'an' })
  })
})
```

**Step 2: Run to verify it fails**

Run: `bun run test src/lib/capabilities/__tests__/affixCatalog.test.ts`
Expected: FAIL (`isCatalogAffix` returns false).

**Step 3: Implement** — in `AFFIX_CATALOG`, under the `// ── Reduplication ──` comment, add after the existing `reduplication` entry:

```ts
  { affix: 'reduplication-an', affixType: 'reduplication', gloss: 'collective/variety reduplication + -an', composition: { reduplicate: true, suffix: 'an' } },
  { affix: 'ke-…-an-reduplication', affixType: 'reduplication', gloss: 'approximative ("-ish") colour reduplication', composition: { prefix: { fixed: 'ke' }, reduplicate: true, suffix: 'an' } },
```

> Note the `…` is U+2026 (the same char as the confix `ke-…-an`), so `ke-…-an-reduplication` cannot collide with the confix `ke-…-an` in the 1:1 `BY_AFFIX` map.

**Step 4: Run to verify it passes** — Run: `bun run test src/lib/capabilities/__tests__/affixCatalog.test.ts` → PASS.

**Step 5: Commit**

```bash
git add src/lib/capabilities/affixCatalog.ts src/lib/capabilities/__tests__/affixCatalog.test.ts
git commit -m "feat(morphology): add L22 reduplication-family catalog entries (redup+-an, ke-…-an-redup)"
```

---

### Task 2: Make reduplication a base modifier in the engine

**Files:**
- Modify: `src/lib/capabilities/affixDerivation.ts` (`deriveReduplication` → `deriveReduplicated`; the composer dispatch at lines 251-266)
- Test: `src/lib/capabilities/__tests__/affixDerivation.test.ts`

**Step 1: Write the failing tests**

```ts
import { deriveAffixedForm, UnsupportedAffixError } from '../affixDerivation'

describe('reduplication as a base modifier (ADR 0019 amended, L22)', () => {
  it('full reduplication doubles the root, no circumfix', () => {
    const d = deriveAffixedForm('anak', 'reduplication')
    expect(d.derived).toBe('anak-anak')
    expect(d.affixType).toBe('reduplication')
    expect(d.circumfixLeft).toBeNull()
    expect(d.circumfixRight).toBeNull()
  })
  it('reduplication + -an appends the suffix to the doubled base', () => {
    expect(deriveAffixedForm('sayur', 'reduplication-an').derived).toBe('sayur-sayuran')
    expect(deriveAffixedForm('daun', 'reduplication-an').derived).toBe('daun-daunan')
    const d = deriveAffixedForm('sayur', 'reduplication-an')
    expect(d.circumfixLeft).toBeNull()
    expect(d.circumfixRight).toBeNull()
  })
  it('ke-…-an reduplication wraps the doubled base, still null circumfix', () => {
    expect(deriveAffixedForm('biru', 'ke-…-an-reduplication').derived).toBe('kebiru-biruan')
    expect(deriveAffixedForm('hitam', 'ke-…-an-reduplication').derived).toBe('kehitam-hitaman')
    const d = deriveAffixedForm('biru', 'ke-…-an-reduplication')
    expect(d.circumfixLeft).toBeNull()
    expect(d.circumfixRight).toBeNull()
    expect(d.allomorphRule).toContain('kebiru-biruan')
  })
})
```

**Step 2: Run to verify it fails** — Run: `bun run test src/lib/capabilities/__tests__/affixDerivation.test.ts` → FAIL (`reduplication-an`/`ke-…-an-reduplication` derive wrong / `deriveReduplication` ignores prefix+suffix).

**Step 3: Implement.** Replace `deriveReduplication` (lines 197-206) with a recipe-aware `deriveReduplicated`, and update the composer dispatch.

Replace the function:

```ts
// ── Reduplication (the one non-concatenative base) ──────────────────────────
// Reduplication forms the base by doubling the root, then OPTIONALLY applies the
// recipe's FIXED prefix / FIXED suffix slots (ADR 0019, amended L22): full
// (anak-anak), redup+-an (sayur-sayuran), ke-…-an redup (kebiru-biruan).
// circumfix_left/right stay NULL — the invariant is "reduplication carries no
// circumfix"; decompose_word_ex re-derives the wrap pieces from the catalog recipe.
function deriveReduplicated(root: string, affix: string, recipe: AffixComposition): ConfixCore {
  if (recipe.prefix && 'nasal' in recipe.prefix) {
    // No book example nasalises a reduplicated base; fail loud rather than guess.
    throw new UnsupportedAffixError(affix, 'nasalising prefix over a reduplicated base is not supported')
  }
  const base = `${root}-${root}`
  const left = recipe.prefix && 'fixed' in recipe.prefix ? recipe.prefix.fixed : ''
  const right = recipe.suffix ?? ''
  const derived = left + base + right

  let allomorphRule: string
  if (left && right) {
    allomorphRule = `${left}-…-${right} om de verdubbeling: ${root} → ${derived}.`
  } else if (right) {
    allomorphRule = `Verdubbeling + achtervoegsel -${right}: ${root} → ${derived}.`
  } else {
    allomorphRule = `Verdubbeling: ${root} → ${derived}.`
  }
  return { derived, allomorphClass: null, allomorphRule, circumfixLeft: null, circumfixRight: null }
}
```

Then in `deriveAffixedForm`, change the first dispatch branch (line 252):

```ts
  if (recipe.reduplicate) {
    core = deriveReduplicated(root, affix, recipe)
  } else if (recipe.prefix && recipe.suffix !== undefined) {
```

**Step 4: Run to verify it passes** — Run: `bun run test src/lib/capabilities/__tests__/affixDerivation.test.ts` → PASS. Then `bun run test src/lib/capabilities` (the L13 golden fixture must still pass — this change touches only the reduplication branch).

**Step 5: Commit**

```bash
git add src/lib/capabilities/affixDerivation.ts src/lib/capabilities/__tests__/affixDerivation.test.ts
git commit -m "feat(morphology): reduplication composes as a base modifier (full / +-an / ke-…-an)"
```

---

## Phase 2 — Exercise rendering

### Task 3: Segment reduplication in `decompose_word_ex`

**Files:**
- Modify: `src/lib/exercise-content/byType/decomposeWord.ts` (`morphemePieces`, add the import + a reduplication branch)
- Test: `src/lib/exercise-content/__tests__/byType.test.ts` (the `decompose_word_ex` block near line 734)

**Step 1: Write the failing tests** (use the existing `decomposeInput(...)` helper in that file; pass a reduplication row — `affix` set, `circumfixLeft/Right` null):

```ts
it('decompose full reduplication → [root, root]', () => {
  const r = buildForExerciseType('decompose_word_ex', decomposeInput({
    affixedFormPair: { root: 'anak', derived: 'anak-anak', affix: 'reduplication',
      circumfixLeft: null, circumfixRight: null, allomorphRule: 'Verdubbeling: anak → anak-anak.' },
  }))
  expect(r.kind).toBe('ok')
  expect(r.exerciseItem.decomposeData!.correctOptionId).toBe('anak + anak')
  expect(r.exerciseItem.decomposeData!.options.length).toBeGreaterThanOrEqual(2)
})

it('decompose wrapped reduplication → [left, root-root, right]', () => {
  const r = buildForExerciseType('decompose_word_ex', decomposeInput({
    affixedFormPair: { root: 'biru', derived: 'kebiru-biruan', affix: 'ke-…-an-reduplication',
      circumfixLeft: null, circumfixRight: null, allomorphRule: 'ke-…-an om de verdubbeling: biru → kebiru-biruan.' },
  }))
  expect(r.kind).toBe('ok')
  expect(r.exerciseItem.decomposeData!.correctOptionId).toBe('ke + biru-biru + an')
})
```

**Step 2: Run to verify it fails** — Run: `bun run test src/lib/exercise-content/__tests__/byType.test.ts -t reduplication` → FAIL (full redup falls through to the prefix branch / fails `options.length < 2`).

**Step 3: Implement.** Add the import and a reduplication branch at the TOP of `morphemePieces` (before the `circumfixLeft && circumfixRight` check):

```ts
import { allomorphClassesFor, affixCatalogEntry } from '@/lib/capabilities/affixCatalog'
```

```ts
function morphemePieces(
  root: string,
  affix: string | null,
  circumfixLeft: string | null,
  circumfixRight: string | null,
): { prefix: string | null; root: string; suffix: string | null } {
  // Reduplication: circumfix pieces are NOT stored (ADR 0019) — re-derive the
  // segmentation from the catalog recipe. Full → [root, root]; wrapped → [left, root-root, right].
  const recipe = affix ? affixCatalogEntry(affix)?.composition : undefined
  if (recipe?.reduplicate) {
    const left = recipe.prefix && 'fixed' in recipe.prefix ? recipe.prefix.fixed : null
    const right = recipe.suffix ?? null
    if (left || right) return { prefix: left, root: `${root}-${root}`, suffix: right }
    return { prefix: root, root, suffix: null } // full reduplication → two root pieces
  }
  // Confix: both pieces stored on the row.
  if (circumfixLeft && circumfixRight) return { prefix: circumfixLeft, root, suffix: circumfixRight }
  // ... rest unchanged ...
```

**Step 4: Run to verify it passes** — Run: `bun run test src/lib/exercise-content/__tests__/byType.test.ts` → PASS (all decompose cases).

**Step 5: Commit**

```bash
git add src/lib/exercise-content/byType/decomposeWord.ts src/lib/exercise-content/__tests__/byType.test.ts
git commit -m "feat(morphology): decompose_word_ex segments reduplication (full → [root,root], wrapped → [left,root-root,right])"
```

---

### Task 3b: Dutch produce-prompt label for reduplication

**Why:** `type_form_ex` builds the produce prompt as `Geef de ${affixLabel}-vorm van: ${root}` (`typedRecall.ts:32-36`), where `affixLabel = affix.replace(/-+$/, '')`. For reduplication affixes that renders the English dev string in a Dutch learner prompt — *"Geef de reduplication-an-vorm van: sayur"*. Reduplication's Dutch name is **verdubbeling**. (The isolated prompt is the fallback; ADR 0019 option B prefers the carrier-blanked sentence when one was harvested — but the isolated path must still read as Dutch.)

**Files:**
- Modify: `src/lib/exercise-content/byType/typedRecall.ts:28-36`
- Test: `src/lib/exercise-content/__tests__/byType.test.ts`

**Step 1: Write the failing test**

```ts
it('type_form_ex reduplication produce prompt is Dutch (no English "reduplication")', () => {
  const r = buildForExerciseType('type_form_ex', affixedInput({
    affixedFormPair: { root: 'sayur', derived: 'sayur-sayuran', affix: 'reduplication-an',
      direction: 'root_to_derived', carrierText: null, allomorphRule: 'Verdubbeling + achtervoegsel -an: sayur → sayur-sayuran.' },
  }))
  expect(r.kind).toBe('ok')
  const prompt = r.exerciseItem.affixedFormPairData!.promptText
  expect(prompt).not.toMatch(/reduplication/i)
  expect(prompt).toContain('verdubbelde vorm')
  expect(prompt).toContain('sayur')
})
```

**Step 2: Run to verify it fails** — Run: `bun run test src/lib/exercise-content/__tests__/byType.test.ts -t "reduplication produce prompt"` → FAIL (prompt contains "reduplication-an").

**Step 3: Implement** — add the import and a reduplication branch in the prompt construction:

```ts
import { affixCatalogEntry } from '@/lib/capabilities/affixCatalog'
```

```ts
    const isRedup = affix ? affixCatalogEntry(affix)?.affixType === 'reduplication' : false
    const affixLabel = affix ? affix.replace(/-+$/, '') : null
    const promptText = isRootToDerived
      ? isRedup
        ? `Geef de verdubbelde vorm van: ${root}`
        : affixLabel
          ? `Geef de ${affixLabel}-vorm van: ${root}`
          : `Geef de afgeleide vorm van: ${root}`
      : `Wat is het basiswoord van: ${derived}`
```

> The generic "verdubbelde vorm" covers full / +-an / ke-…-an; the carrier-blanked sentence (when present) disambiguates the exact target, and the rule note on the Doorgaan screen names the precise shape. Acceptance is still the exact `derived` only.

**Step 4: Run to verify it passes** — Run: `bun run test src/lib/exercise-content/__tests__/byType.test.ts` → PASS.

**Step 5: Commit**

```bash
git add src/lib/exercise-content/byType/typedRecall.ts src/lib/exercise-content/__tests__/byType.test.ts
git commit -m "fix(morphology): Dutch verdubbeling produce-prompt for reduplication (no English label leak)"
```

---

### Task 4: Full-suite gate (compile + lint + all tests)

**Step 1:** Run `bun run test && bun run lint && bunx tsc -b --noEmit`
Expected: all green. (No `ProjectedCapability`/resolver/migration changes were made, so nothing else should move.)

**Step 2: Commit** only if a lint/format fixup was needed; otherwise skip.

---

## Phase 3 — Author L22, publish, verify

### Task 5: Author `staging/lesson-22/morphology-roots.ts`

**Files:**
- Create: `scripts/data/staging/lesson-22/morphology-roots.ts`

**Step 1: Author the judgment-only pairs.** `illustratesCategory` MUST be the EXACT category title from `scripts/data/staging/lesson-22/lesson.ts` `content.categories`. Only *productive, compositional* forms (research §25/§106) — leave `jalan-jalan`, `hati-hati`, `kura-kura`, `sayur-mayur`, `warna-warni`, `sewa-menyewa` as vocabulary. Author candidates per shape; the generate script (Task 6) prunes any root that is not a `learning_item`.

```ts
// Lesson 22 (Bab 6, Pesta Pernikahan / Verdubbelingen) — reduplication application tier.
// Judgment-only authoring (ADR 0019 amended; this plan). The engine + generate script
// fill the rule-governed fields. Only PRODUCTIVE, compositional reduplications are pairs;
// frozen / sound-change / lexicalised / fixed-adverb / asymmetric ME-redup forms are vocab.
import type { MorphologyRoot } from '@/lib/capabilities'

const NOUN = '2. Verdubbeling van het zelfstandig naamwoord — meervoud mét diversiteit'
const NOUN_AN = 'Verdubbeling van het zelfstandig naamwoord plus -AN'
const COLOR = 'Kleurnuances — muda/tua, vruchtvergelijkingen en de ke-...-an "-achtig" verdubbeling'

export const morphologyRoots: MorphologyRoot[] = [
  // Full noun reduplication (plurality-with-diversity)
  { root: 'kota', affix: 'reduplication', illustratesCategory: NOUN },   // kota-kota
  { root: 'anak', affix: 'reduplication', illustratesCategory: NOUN },   // anak-anak

  // Reduplication + -an (collective)
  { root: 'sayur', affix: 'reduplication-an', illustratesCategory: NOUN_AN }, // sayur-sayuran
  { root: 'daun',  affix: 'reduplication-an', illustratesCategory: NOUN_AN }, // daun-daunan
  { root: 'buah',  affix: 'reduplication-an', illustratesCategory: NOUN_AN }, // buah-buahan

  // ke-…-an colour reduplication ("-ish")
  { root: 'biru',   affix: 'ke-…-an-reduplication', illustratesCategory: COLOR }, // kebiru-biruan
  { root: 'hitam',  affix: 'ke-…-an-reduplication', illustratesCategory: COLOR }, // kehitam-hitaman
  { root: 'kuning', affix: 'ke-…-an-reduplication', illustratesCategory: COLOR }, // kekuning-kuningan
]
```

**Step 2: Commit** (staging is in the user's untracked WIP zone; commit if the rest of lesson-22 staging is tracked, otherwise leave per the L20/L21 precedent — confirm with `git status`).

---

### Task 6: Generate `morphology-patterns.ts` and assert the invariant

**Files:**
- Generates: `scripts/data/staging/lesson-22/morphology-patterns.ts`

**Step 1: Run the generator** — Run: `bun scripts/generate-morphology-patterns.ts 22`
Expected: pairs emitted for every root that resolves to a `learning_item`; a loud error listing any root that does NOT (prune those from `morphology-roots.ts` and re-run, OR add the missing word to L22 vocab if it legitimately belongs).

**Step 2: Assert circumfix is null on every reduplication row** — Run:
`grep -c 'circumfixLeft' scripts/data/staging/lesson-22/morphology-patterns.ts`
Expected: `0` (the generate script only emits `circumfixLeft/Right` when non-null, and the engine returns null for reduplication — Option A holds with no special-casing). If non-zero, STOP — the engine returned a circumfix for a reduplication row (a Task-2 regression).

**Step 3: Spot-check derived forms** — confirm `kota-kota`, `sayur-sayuran`, `daun-daunan`, `buah-buahan`, `kebiru-biruan`, `kehitam-hitaman`, `kekuning-kuningan`, `anak-anak` appear with `affixType: "reduplication"`.

**Step 4: Commit** the generated snapshot alongside Task 5's roots.

---

### Task 7: Publish L22 (Stage A + B) and pass the capability gate

> L22 has not been capability-published before (per `project_morphology_linguist_authoring_followon`), so this is a FULL new-lesson publish: vocab caps + grammar caps + the new reduplication morphology pairs. The pairs hard-block on their root-vocab caps + the FORMATION grammar-pattern cap (ADR 0018), so the full publish is required, not morphology-only.

**Step 1:** Use the `lesson-pipeline` skill (or the L21 playbook) — Run: `bun scripts/publish-approved-content.ts 22`
Expected: exit 0. **Do NOT query the DB or run `--gate` mid-publish** — grammar caps land draft first, vocab + promotion land last; a mid-run check reports false "0 vocab / stuck-draft" (`project_morphology_linguist_authoring_followon`, GOTCHA 1).

**Step 2: Run the capability gate AFTER publish completes** — confirm `capability-report-22.json` `ok: true`, 0 stuck-draft.

---

### Task 8: DB ground-truth verification

**Step 1:** With service key (`NODE_TLS_REJECT_UNAUTHORIZED=0`, service role), confirm in `indonesian.affixed_form_pairs` for lesson 22:
- reduplication pairs present (one row per authored productive pair that resolved);
- `affix_type = 'reduplication'` and `circumfix_left IS NULL AND circumfix_right IS NULL` for ALL of them;
- `grammar_pattern_id` non-null (resolved to the FORMATION category pattern);
- two caps per pair (`recognise_word_form_link_cap` + `produce_derived_form_cap`).

**Step 2:** Run `make check-supabase-deep` — confirm **HC17** (every active word_form_pair_src cap has a row) and **HC31** (payload invariant) are green. (HC19/20/30 may fail on the known pre-existing upstream grammar_patterns 502 — unrelated; confirm it fails in the pre-publish snapshot too before dismissing.)

---

### Task 9: RTL render-verify (data ≠ renders — `feedback_answer_log_check`)

**Files:**
- Test: `src/components/exercises/__tests__/reduplicationRender.test.tsx` (model on the existing `affixedFormPairCapstone.test.tsx` — real components, live data shapes)

**Step 1: Write render tests** that mount the real exercise components for:
- a **full** reduplication `decompose_word_ex` (`anak-anak` → options include `anak + anak`, renders, selectable);
- a **wrapped** reduplication `decompose_word_ex` (`kebiru-biruan` → options include `ke + biru-biru + an`);
- a reduplication `type_form_ex` (root `sayur` + rule → learner types `sayur-sayuran`; carrier-blanked if a carrier was harvested, else isolated).

**Step 2: Run** — `bun run test src/components/exercises/__tests__/reduplicationRender.test.tsx` → PASS.

**Step 3: Commit**

```bash
git add src/components/exercises/__tests__/reduplicationRender.test.tsx
git commit -m "test(morphology): render-verify reduplication decompose (full + wrapped) + type_form on live shapes"
```

---

## Phase 4 — Docs & finish

### Task 10: Update module spec + mark plan shipped

**Files:**
- Modify: **`docs/current-system/modules/exercise-content.md`** (architect-required, same PR). Its §6 predates `affixed_form_pair`/`decompose_word_ex` landing and §3/§4 don't describe `morphemePieces`. Add the `decompose_word_ex` builder + its reduplication branch, the reduplication `type_form_ex` prompt, and refresh `last_verified_against_code`.
- Modify: this plan's frontmatter → `status: shipped`, `implementation: PR #NNN`, `merged_at:`, `implementation_paths:`.

CONTEXT.md and ADR 0019 are ALREADY amended (the grill session of 2026-06-19) — do not re-edit; just confirm they match the shipped code.

**Step:** Use superpowers:finishing-a-development-branch to merge.

---

## What is explicitly NOT in scope (omission test)

- **No migration, no CS12/HC31 code change** — Option A keeps the reduplication-null-circumfix invariant; the only catalog-membership additions are code constants.
- **No `ProjectedCapability` / resolver / `allowedExercises` change** — full reduplication renders in `decompose_word_ex` (Option B), so the resolver never needs row-awareness.
- **No `choose_form_ex` change** — it stays the unreached secondary for `recognise_word_form_link_cap`.
- **No asymmetric `root-meN(root)` engine path** — `sewa-menyewa` / `surat-menyurat` are vocab (research §106).
- **No `ber-…-an` (L12) / `se-…-nya` (L8) catalog entries or pairs** — the engine already generalises to them; their entries + pairs land when those chapters are (re)authored (ADR 0019 "content stays per-chapter"). L12 ber-…-an backfill is a separate follow-on note.
