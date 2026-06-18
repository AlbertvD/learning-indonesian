---
status: shipped
implementation: PR #255
merged_at: 2026-06-18
implementation_paths:
  - src/lib/capabilities/affixDerivation.ts
  - scripts/generate-morphology-patterns.ts
  - scripts/data/staging/lesson-13/morphology-roots.ts
title: Morphology authoring capability — deterministic engine + lean roots file + linguist extension
author_session: morphology linguist-authoring follow-on (grill-with-docs, 2026-06-17/18)
reviewed_by: [architect, data-architect]   # round-2 APPROVE both (staff-engineer SOUND); fixes C1/C2/M1 + cross-check applied
depends_on:
  - docs/plans/2026-06-17-morphology-nasalization-cap-model-fix.md   # SHIPPED — the 2-cap model this builds on
relates_to:
  - docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md
  - docs/plans/2026-06-15-affix-trainer-capstone-design.md
  - docs/research/2026-06-15-affix-morphology-module-research.md
---

# Morphology authoring capability

> **Spec 2** of the morphology rollout. Spec 1 (the cap-model fix) has shipped — pairs now carry
> exactly two caps and nasalization lives at the rule tier. This spec builds the capability to **author**
> morphology content for an affix lesson, so we can re-author L9–16 and ingest book-2's 14 chapters
> without hand-writing every pair (as the L13 pilot was).

## 1. Operating-context re-derivation (build-stage)

Single author/learner, disposable data. The deliverable is an **authoring** capability — it changes how
`morphology-patterns.ts` is produced, not the DB shape. No schema change. The fixed goal: an affix lesson's
morphology content is authored from a **lean judgment-only input** + a **deterministic engine**, producing
the same `AffixedPairInput[]` the lesson stage already consumes — so the L13 pilot becomes reproducible and
14 chapters become tractable.

## 2. The problem

No agent emits `morphology-patterns.ts` in the phase-b shape; the L13 pilot was hand-authored. The file's
fields are of two natures (verified against the L13 pilot + Indonesian morphology):

- **Rule-governed** (deterministic from `root` + `affix`): `derived`, `allomorphClass`, `allomorphRule`,
  `affixType`, `affixGloss`, `productive`. meN-/peN- nasalization is a pure function of the root's initial
  phoneme; ber-/di-/-an are invariant concatenation.
- **Judgment** (authored): *which* roots to teach, *which* affix, and *which grammar category* each
  illustrates.

Hand-authoring the rule-governed fields re-introduces error classes (wrong allomorph, wrong slug — the old
L9 file's `lesson-9/pattern-men-active` bug). The fix splits the two: a deterministic engine fills the
rule-governed fields; the agent authors only the judgment.

## 3. Design

```
linguist-structurer ──writes──▶ scripts/data/staging/lesson-N/morphology-roots.ts   (LEAN, judgment-only)
                                              │
                          generate-morphology-patterns.ts  (deterministic: engine + catalog + slug mint + cross-check)
                                              │
                                              ▼
                        scripts/data/staging/lesson-N/morphology-patterns.ts  (COMMITTED snapshot, regenerable)
                                              │
                              lesson-stage (unchanged) ──▶ lesson_section_affixed_pairs ──▶ capability-stage
```

### 3.1 The deterministic engine — `src/lib/capabilities/affixDerivation.ts`

Lives in `lib/capabilities` (the sole pipeline↔runtime shared seam, target-architecture.md:1159; sibling to
the existing `affixCatalog.ts`, which it reads). Pure, no I/O.

```ts
export interface DerivedAffixedForm {
  derived: string
  allomorphClass: string | null   // non-null only for allomorphic (meN-/peN-) affixes
  allomorphRule: string           // the short Dutch rule note shown on link/produce exercises
  affixType: AffixType            // from the catalog
  affixGloss: string              // from the catalog (catalog.gloss)
  productive: boolean             // default true; exception table may override to false (frozen)
}

export function deriveAffixedForm(root: string, affix: string): DerivedAffixedForm
```

- **Allomorphic prefixes (meN-, peN-)** — compute the allomorph class from the root's initial phoneme
  (the 5-way nasalization + K/P/S/T elision; research §43). Class strings come from
  `affixCatalog.allomorphClasses`. Derived form = chosen prefix-spelling + (elided) root.
- **Invariant affixes (ber-, di-, -an)** — plain concatenation (prefix: `affix-base + root`; suffix:
  `root + affix-base`), `allomorphClass = null`. (ber- carries a tiny be-/bel- exception, see below.)
- **Confix / reduplication** — **NOT built this pass** (matches the deferred Task 6). `deriveAffixedForm`
  throws `UnsupportedAffixError` for `affixType ∈ {confix, reduplication}`; the generation script surfaces it
  as a clear "author confix pairs by hand until the book-2 confix chapter" error. Extend the engine when
  those chapters land.
- **Static exception table** (staff-engineer: a curated-root workflow needs no auto-suspicion heuristic —
  Spec 1 §irregular). A small `IRREGULAR: Record<string, Partial<DerivedAffixedForm>>` keyed by `${affix}:${root}`
  overrides the rule for known irregulars: `meN-:punya → mempunyai` (p kept), monosyllabic `meN-:bom → mengebom`
  (menge-), `ber-:ajar → belajar`, `ber-:kerja → bekerja`. Anything not in the table is rule-derived and trusted.
  (Revisit a detector only if the 14-chapter bulk authoring shows new irregulars slipping through silently.)
- **`allomorphRule` is engine-generated, not authored (data-architect C1: the column is `NOT NULL` and CS12
  rejects empty — there is no "optional" here).** The engine templates the Dutch rule note deterministically
  from the allomorph class + whether K/P/S/T elision occurred (the same determinism as the derived form;
  keeps the engine self-contained — no per-pair authoring). **Hard constraint (architect): the template MUST
  begin with the canonical affix label** (e.g. `meN- …`), because the lesson stage *derives* the stored
  `affix` from `allomorphRule`'s leading token (`projectSections.ts:142-148` `deriveAffix`, matched against
  `^([A-Za-z]+-)`), and HC31 checks **that** value against the catalog. A template not starting with the
  affix label silently fails HC31. (We do NOT add an explicit `affix` field to `AffixedPairInput` — that is a
  writer-contract change out of scope; the template + sourceRef both reduce to the catalog affix instead.)

**Acceptance test (golden fixture):** `deriveAffixedForm` reproduces **every one of L13's 14 hand-authored
pairs**: assert **`derived` + `allomorphClass` exact-match** and that the pair, run through
`projectSections.deriveAffix`, yields the **catalog affix** (`meN-`) — i.e. the template's leading token is
catalog-valid. Do **NOT** assert byte-exact `allomorphRule` prose (staff-engineer: "equivalent" is undefined
and would rot); the rule note's *correctness* is covered by the leading-token + class assertions. The pilot
is the spec's proof.

### 3.2 The lean authored file — `scripts/data/staging/lesson-N/morphology-roots.ts`

Judgment-only, hand-authored by the linguist (the ONLY morphology file a human/agent writes):

```ts
export const morphologyRoots: MorphologyRoot[] = [
  { root: 'masak', affix: 'meN-', illustratesCategory: 'A1. ME- zonder verandering (me-)' },
  { root: 'tukar', affix: 'meN-', illustratesCategory: 'B. ME- met verandering van de eerste klank (K, P, S, T)' },
  // …
]
// MorphologyRoot = { root: string; affix: string; illustratesCategory: string }
```

`illustratesCategory` is the **exact title** of a grammar category the structurer authored in this lesson's
`lesson.ts` `content.categories`. The generation script mints the slug from it — the agent **never writes a
raw slug**.

### 3.3 The generation script — `scripts/generate-morphology-patterns.ts`

Deterministic. Run as an authoring step (after the structurer, before publish), the same way the other
derived staging files are regenerated. Per lesson N:

1. Read `morphology-roots.ts` + the lesson's `content.categories` titles from `lesson.ts`.
2. **Author-time validation** (fail loud, no DB write):
   - `affix ∈ AFFIX_SET` (catalog membership).
   - `root` resolves to a live `learning_items` row via `itemSlug` (the ADR-0018 root-vocab prereq must be
     satisfiable; HC31 backstops at publish). Query the DB (service key) for the lesson's + prior vocab.
   - `illustratesCategory` matches a real category title in this lesson's `lesson.ts`.
3. For each root: `deriveAffixedForm(root, affix)` → the rule-governed fields.
4. **Slug mint + RESOLVABILITY guard (data-architect C2):** mint `patternSourceRef = \`l${N}-${stableSlug(illustratesCategory)}\``
   using the **same `stableSlug`** the grammar projector uses — `scripts/lib/content-pipeline-output.ts`
   (NOT a re-implementation; `projectors/grammar.ts:27` imports it from there). **But the grammar projector
   appends a `-${display_order}` disambiguation suffix when two categories share a base slug**
   (`projectors/grammar.ts:99-108`), so a naive mint can produce an unresolvable slug. The generation script
   MUST therefore **verify each minted slug against the lesson's actual category-slug set** (the same set the
   grammar projector produces) and **fail loud** if it isn't present — never emit a slug that won't resolve to
   a `grammar_pattern_id` (else CS12 aborts publish at `morphology.ts:134`). Precondition documented:
   `patternSourceRef = l{N}-stableSlug(title)` is valid only when category titles are pairwise-distinct under
   `stableSlug` (true for L13–16; the guard catches any future collision). This guard **subsumes** the old
   "does the category exist" check.
   **Class cross-check (set-membership, not equality — staff-engineer):** if the category is allomorph-keyed,
   a category may legitimately span several classes (L13's "A2" covers `mem`/`men`/`meng`). So assert the
   engine-computed `allomorphClass` is **within the set of classes that category covers**, not equal to one —
   flag a root whose class falls outside (catches `masak`=`me` filed under the KPST category). Semantic
   categories (L14 word-class) skip the class check.
5. Emit the committed `morphology-patterns.ts` as `export const affixedFormPairs: AffixedPairInput[]`
   (same `prefix()`-helper style as the L13 pilot). `sourceRef` minted as
   `\`lesson-${N}/morphology/${affix}-${root}-${derived}\`` (the full path CS12 enforces via
   `^lesson-\d+/morphology/.+$`, `validators/affixedFormPairs.ts:69`). (The pilots carry a vestigial `id`
   field — `AffixedPairInput` has no `id` and `projectSections` never reads it; emit it for parity if you
   like, but it is cosmetic, not load-bearing.)

   **This file is a regenerable SOURCE input, not a publish-time derived file (architect).** It sits with
   `learning-items.ts` / `grammar-patterns.ts` — **regenerated at AUTHORING time by
   generate-morphology-patterns.ts and committed; hand-edits overwritten on the next run.** It is NOT the
   runner-derived-at-publish category (`content-units.ts` / `capabilities.ts`, which the capability-stage
   runner regenerates and the staging index excludes). Document it under the CLAUDE.md "Derived staging
   files" note with that distinction explicit, so it is not folded into the runner's publish-time set.

The emitted shape is exactly `AffixedPairInput` (`projectSections.ts:73-89`): `sourceRef`, `patternSourceRef`,
`root`, `derived`, `allomorphRule`, `affixType`, `affixGloss`, `allomorphClass`, `productive` (always
`true`/`false`, never null — HC31 rejects null; the exception table overrides to `false`) (+ confix fields
null this pass). The lesson stage + capability stage are **unchanged**.

### 3.4 `linguist-structurer` extension

Add a step (and tools note — it has Read/Write/Glob, no Bash, so it writes the lean file, not the engine):

- After authoring the lesson's grammar categories, if the lesson is a **systematic-affix lesson**
  (meN-/peN-/ber-/di-/-an per the scope in `project_morphology_module_design`), author `morphology-roots.ts`.
- **Curation rules (research-grounded):** ~8–15 high-frequency, high-transparency roots per affix
  (research §105); cover **each allomorph class** the lesson's categories teach (≥1 me-, mem-, men-, meng-…
  example for meN-); every `root` must already exist as a `learning_item` (prior or current lesson vocab —
  the structurer already builds this pool in Step 1). Tag each root with the `illustratesCategory` it
  demonstrates.
- It does **not** author derived forms / allomorph classes / slugs — the engine does.

### 3.5 `linguist-reviewer` extension

Validate the lean file: affix∈catalog, root∈learning_items, `illustratesCategory` exists, coverage of the
taught allomorph classes, and adjudicate any generation-script class/category mismatch flag.

## 4. Distribution + cutover

- A pair lives in the lesson whose grammar teaches it (forced by per-lesson slug resolution + `lesson_id`
  stamping). **L13 anchors meN-**; L14 may author its own pairs for meN- on non-verb roots; L15 decomposition
  waits for the deferred `decompose_word_ex`.
- **Delete the stale `scripts/data/staging/lesson-9/morphology-patterns.ts`** — L9 teaches no meN- grammar
  (live DB), it references a non-existent pattern, and it is not in the live DB. (Spec 1 already deleted the
  dead `MORPHOLOGY_PATTERN_SLUGS`; this removes the stale data file.) **In the SAME change, remove the
  re-export `export { affixedFormPairs } from './morphology-patterns'` from
  `scripts/data/staging/lesson-9/index.ts:4`** (data-architect M1) — else `tsc` breaks on the dangling
  import. After removal L9 has no morphology file; the lesson-stage `readStagingExport` returns `null → []`.
- Re-author L13 through the new path as the **first real exercise** of the pipeline; assert the generated
  `morphology-patterns.ts` matches the hand-authored pilot (the §3.1 golden test at file scope).

## 5. Scope (this pass) / deferred

- **This pass:** the engine for meN-/peN- (nasalization) + ber-/di-/-an (concat + tiny exceptions); the lean
  file; the generation script; the two agent extensions; re-author L9–16's affix lessons.
- **Deferred (with their book-2 chapters):** confix (ke-…-an, pe-…-an, per-…-an, memper-) and reduplication
  derivation; the `decompose_word_ex` / `build_confix_ex` exercise types (already deferred Task 6).

## 6. Supabase Requirements

### Schema changes
- **None.** No new tables/columns; no enum/CHECK change. The engine + generation script produce the existing
  `AffixedPairInput` shape; `lesson_section_affixed_pairs` / `affixed_form_pairs` are unchanged.
- RLS / Grants: **N/A** — no surface change.

### homelab-configs changes
- [ ] PostgREST / Kong / GoTrue / Storage — **N/A** (no schema/API change).

### Health check additions
- **None new.** Existing gates backstop the authored output: CS12 (unresolved slug), **HC31** (payload
  invariant incl. root-vocab satisfiability + affix∈catalog), HC17 (1 row/cap), HC32 (2-cap contract). The
  generation script's author-time validation (§3.3.2) is a *fail-fast convenience* that mirrors HC31 earlier;
  HC31 remains the authoritative live gate.

## 7. Three-layer gate for this change

1. **Shared helper + unit tests** — `deriveAffixedForm` unit tests, with **L13's 14 pairs as the golden
   fixture** (§3.1); the generation script's slug-mint + class/category cross-check tested on fixtures.
2. **Pipeline pre-write validator** — the generation script's author-time validation (affix∈catalog,
   root∈learning_items, category exists) fails the authoring step before publish.
3. **Live-DB health check** — HC31 (already live) backstops every authored pair at publish.

## 8. Resolved details + remaining open points

**Resolved (were open in draft, fixed per review):**
- **`allomorphRule` is engine-templated, not authored** (data-architect C1 — the column is `NOT NULL`/CS12,
  so it cannot be optional). The template is keyed on the allomorph class + K/P/S/T-elision and **must begin
  with the canonical affix label** so `deriveAffix` (`projectSections.ts:142-148`) recovers a catalog-valid
  `affix`. See §3.1. The golden test asserts `derived` + `allomorphClass` + the projected catalog affix —
  not the byte-exact Dutch prose.
- **Slug resolvability** is guarded against the `-{display_order}` collision-disambiguation (data-architect
  C2) — see §3.3 step 4.
- **`stableSlug` provenance**: import the SAME function the grammar projector uses,
  `scripts/lib/content-pipeline-output.ts` (a scripts/-resident generation script may import it; it is not in
  `lib/capabilities`).

**Remaining for the implementing engineer:**
- Confirm `itemSlug` (`src/lib/capabilities/itemSlug.ts`) is importable into the generation script so the
  root-vocab check uses the SAME normalization HC31 uses (`check-supabase-deep.ts` HC31) — they must agree.
- Wire the generation script into the authoring flow (`content-pipeline.md`) — after the structurer authors
  `morphology-roots.ts` + the grammar categories, before `publish-approved-content`. Document it as an
  authoring-time regeneration step (§3.3 step 5), distinct from the runner's publish-time derived files.
- **Test hygiene (both reviewers):** `deriveAffix` (`projectSections.ts:142-148`) has a *fallback* that
  recovers the affix from the `sourceRef`'s `morphology/<affix>-` segment when `allomorphRule` lacks a leading
  affix token. Keep the engine's own unit test asserting the templated `allomorphRule`'s leading token
  **independently**, so a malformed template can't be masked by the sourceRef fallback. (The §3.1 golden test
  routes through `deriveAffix` with the real minted sourceRef, so the live contract is safe regardless.)
