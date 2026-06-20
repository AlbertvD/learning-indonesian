---
status: shipped
merged_at: 2026-06-02
implementation: PR #130 (Fix 2 — paraphrase acceptance); PR #131 (Fix 1 — productive ceiling)
adr: docs/adr/0014-productive-ceiling-item-harvest-is-word-phrase-only.md
reviewed_by:
  - architect (PR #129, round 2 SIGN-OFF, 2026-06-02)
  - data-architect (PR #129, data-model pass, 2026-06-02 — M-1/M-2/M-3 + m-1/m-2 incorporated)
supersedes: []
---

# Productive Ceiling + Paraphrase Acceptance

Two independent fixes that emerged from a 2026-06 usage audit of the typed-recall
exercises (user `7eaacda5`, 769 review events). They ship together but are
severable.

- **Fix 1 — Productive ceiling.** Stop harvesting whole sentences / dialogue
  lines as `learning_items`, so they no longer mint verbatim `form_recall` /
  `dictation` capabilities. Decision recorded in **ADR 0014**.
- **Fix 2 — Paraphrase acceptance.** Honour the already-authored alternative
  answers (the grader ignores the `;` separator the data uses) and gate the
  separator convention so authoring and grading can never drift again.

## Architecture grounding (per CLAUDE.md plan-grounding rule)

- **`src/lib/answerNormalization.ts`** is the answer-comparison module —
  `normalizeAnswer` + `checkAnswer`, "pure functions, no React, no I/O", plugged
  into `useExerciseScoring` via `config.checkCorrect`
  (`docs/target-architecture.md:1071`). Fix 2's **grader change** (`checkAnswer`
  consuming the shared split) lands here. But the **shared `splitAlternatives`
  helper itself** lands in the shared `lib/capabilities/` module, NOT here —
  `answerNormalization.ts` is runtime-only and the pipeline `CS19` gate must import
  the same definition (target-arch §8; m-1 data-architect). `answerNormalization`
  imports the helper from `capabilities`.
- **`src/lib/capabilities/renderContracts.ts`** is the single source of truth for
  cap_type → exercise types + required artifacts (`capabilities.md:21`);
  `dialogue_line` already renders from the typed `dialogue_clozes` table with no
  artifacts (`capabilities.md:49`). Fix 1 does **not** change render contracts —
  it changes *which item caps are produced*, upstream in the Capability Stage.
- **`src/lib/session-builder/pedagogy.ts`** owns the receptive-before-productive
  phase gate = **ADR 0007** (`session-builder.md:191`). Fix 1 deliberately does
  **not** touch it (the rejected "Solution A"); the ceiling is cut at harvest,
  not at serve time — see ADR 0014 § Considered alternatives.
- **Capability Stage** (`scripts/lib/pipeline/capability-stage/`) owns
  `learning_items` generation per **ADR 0012**; the harvest rule and the new
  `CS19` gate land here. No target-architecture constraint folds this surface —
  it is a pipeline stage, not a `src/lib/<module>`.

## Fix 1 — Productive ceiling

### 1a. Harvest rule (Capability Stage)
Only `item_type` ∈ {`word`, `phrase`} is harvested as a `learning_item` and given
the item capability suite. `sentence` and `dialogue_chunk` produce **no item
capabilities**.

> **Terminology guard (the most-confusable point in this design).** Two things
> are colloquially "dialogue line": the **`dialogue_chunk` *item_type*** (the
> over-harvested item — KILLED) and the **`dialogue_line` *source_kind*** of the
> `contextual_cloze` cap (the per-line cloze — KEPT, CONTEXT.md:35). Everywhere
> below, the rule kills `dialogue_chunk` *items*; it never touches `dialogue_line`
> cloze caps.

- The new-path projector (`projectItemsFromTypedRows`) reads
  `lesson_section_item_rows`, which only holds `word`/`phrase` rows
  (`loadFromDb.ts:135` casts to `'word' | 'phrase'`) — so it needs **no change**.
  The over-harvested `sentence`/`dialogue_chunk` item caps flow exclusively
  through the **legacy bundle** from `staging.capabilities` (`runner.ts:441-475`).
- **The filter needs an `item_type` join (M1 — architect).** Staged cap rows
  carry **no** `item_type` (only `canonicalKey/sourceKind/sourceRef/capabilityType`,
  `runner.ts:441-452`); `item_type` lives on `staging.learningItems`
  (`runner.ts:329`). So the filter must: build a `slug → item_type` map from
  `staging.learningItems` (`slug = itemSlug(base_text)`), resolve each staged
  cap's `sourceRef` (`learning_items/<slug>`) against it, and exclude when
  `item_type ∈ {sentence, dialogue_chunk}`. A staged cap whose `sourceRef`
  resolves to **no** item row is **kept** (it is a non-item cap, e.g. audio);
  `validateItemSourceRefResolvability` (`runner.ts:487`) still runs afterward.
- **Length guard.** A `word`/`phrase` whose `base_text` is ≥ 6 tokens emits a
  **warning** finding ("likely mis-tagged sentence") — it does **not** block;
  kind is the gate, length is the smell (architect Q2: warn-only, no hard-error —
  long fixed expressions like `terima kasih kembali` are legitimate). Single
  named constant.
- **Keepers untouched:** `dialogue_line`-source `contextual_cloze` caps are not
  item caps and are unaffected; the `phrase` items extracted from a line and the
  `pattern` caps for the grammar are unaffected.
- **Reader-visibility safety net (M4 — architect).** When a
  `sentence`/`dialogue_chunk` is dropped, assert its text exists in the lesson's
  **typed content tables** — a `dialogue_chunk` line in `lesson_dialogue_lines`,
  a `sentence` in `lesson_section_item_rows` / the grammar-example rows — **not**
  the `lesson_sections.content` blob (post-PR-5/6 that is the round-trip snapshot,
  not the canonical render source; `loadFromDb.ts:114`). If absent, **warn**
  ("item text not found in typed lesson content"); never silently vaporise. Word
  it distinctly from the L5 cloze-projection bug (Out of scope) so the two
  warnings aren't conflated (architect N5).
- **Cap-less item rows — fast-follow, NOT this PR (architect Q1).** This PR
  suppresses the *caps*. Whether to also stop writing the `sentence`/`dialogue_chunk`
  `learning_items` *rows* (cleaner target-state — a cap-less item row is dead
  weight that still dedups into `normalized_text` space) is a separate change:
  the `contextual_cloze` anchor path resolves dialogue lines through the
  `dialogue_chunk` item row (`runner.ts:896` adds `item.id` to `dialogueItemIds`
  when `item_type === 'dialogue_chunk'`), so the item row cannot be removed blind.
  Ship cap-suppression now; open a fast-follow to retire the cap-less rows **after**
  auditing that anchor.

### 1b. Retire the 56 already-published over-harvested caps
- **Target set:** `learning_capabilities` rows with `source_kind='item'`,
  `retired_at IS NULL`, whose `source_ref` resolves to a `sentence` /
  `dialogue_chunk` (the 56 counted in the audit). Explicitly **excludes**
  `dialogue_line`-source cloze caps.
- **Action:** set `retired_at = now()` (soft-retire). This is a targeted
  DB-resident correction consistent with **ADR 0011** (not a destructive
  `--regenerate`). `learner_capability_state` rows are **left inert** — the
  session builder already filters retired catalog caps (`session-builder.md`
  candidate scoping); review history is kept.
- **Mechanism (both halves):** the Capability Stage retire-sweep
  (`retireOrphanedCapabilities`) cleans the over-harvest automatically on any
  future re-publish (once 1a stops emitting the caps, they become orphans); a
  **one-off backfill script** retires the existing 56 now so no mass re-publish
  is required.
- **Hard ordering (M3 — architect).** The adapter **un-retires** any cap that
  reappears in the emit set (`adapter.ts:143-145` flips `retired_at` back to
  NULL). So Fix 1a (stop emitting `sentence`/`dialogue_chunk` caps) **must be live
  before — or atomically with — the backfill**; otherwise the next publish of a
  lesson re-emits and un-retires its over-harvested caps. See § Deploy ordering.

## Fix 2 — Paraphrase acceptance (3-layer separator invariant)

Root cause (refined by data-architect review): the **live** item-meaning read
path is `learning_items.translation_nl` (Decision R / PR 1 — `byKind/item.ts:36`;
`item_meanings` is dead for item caps, dropped in PR 7), and the staging generator
`normaliseDutchTranslation` (`generate-staging-files.ts:171`) **already** converts
`;`→`/` for newly generated items. So the production `;`
(`"Het is goedkoop; de prijs is laag"`, `staging/lesson-1/learning-items.ts:292`)
lives in **legacy, hand-authored** `translation_nl` values that bypassed the
normaliser — and `checkAnswer`'s `splitAlternatives` (`answerNormalization.ts:76`)
splits only on `/` and `,`, never `;`. So the legacy alternative is one
unmatchable blob, AND comma is wrongly treated as a separator. **Canonical DB
separator = `/`** (the generator's output); `;` is an authoring convenience the
writer normalises away; comma is never a separator. Per
`memory/project_three_layer_invariant_gates`, this cross-module convention needs
all three gates in the same change — pointed at the **live** surface:

> **Answer-set source topology (M-3 — Rule #6).** Acceptable answers for an item
> cap can live in up to four places: (1) `learning_items.translation_nl` — **LIVE**
> read path; (2) `item_answer_variants` — **LIVE** (`byKind/item.ts:106`, read by
> `TypedRecall.tsx:44`); (3) `item_meanings` — DEAD for item caps (PR 7 drop);
> (4) `capability_artifacts` `meaning:l1`/`accepted_answers:id` — DEAD for item
> caps (skipped at `runner.ts:777`). The gate + health check must cover **both
> live paths (1 and 2)**; the dead paths need no work but are named so PR 7's
> `item_meanings` drop can confirm gate completeness.

### 2a. Shared helper + unit tests (the missing single definition)
Extract `splitAlternatives` to a **tree-neutral shared home** importable by both
the browser bundle and the pipeline script: **`src/lib/capabilities/separatorConvention.ts`**
(the existing shared module both `src/` and `scripts/` import — target-arch §8;
NOT `answerNormalization.ts`, which is runtime-only — m-1 data-architect, and the
architect-definition §8 rule). Canonical separator **`/`**; also splits `;`
defensively; **never** comma. Both consumers import it: the runtime grader
(`checkAnswer`) and the new `CS19` gate. Co-location in the shared module is the
anti-drift mechanism — a regex duplicated across the `src/`/`scripts/` boundary
would re-introduce exactly the drift this fixes.

### 2b. Grader (session engine)
`checkAnswer` consumes the shared helper; behaviour otherwise unchanged
(exact-then-single-typo fuzzy). It addresses the **in-string** multi-form
`translation_nl` (built into the synthesised `meanings[]` via `syntheticMeaning`,
`byKind/item.ts:36` → `MeaningRecall.tsx:30`) and the `item_answer_variants` live
path (`TypedRecall.tsx:44`); `form_recall`/`dictation` also route through
`checkAnswer` (`Dictation.tsx:37`). **Ordering invariant (N4):** the split MUST
run before `normalizeAnswer` (`answerNormalization.ts:13` strips non-word chars
including `;`/`/`), so the shared helper preserves the existing
split-then-normalize order (`answerNormalization.ts:93-104`).

### 2c. `CS19` pre-write gate (Capability Stage)
New validator in the capability-stage gate family (highest current is CS18,
`gate.ts:215`; pre-write family with CS4/CS4b at `gate.ts:134-139`). **Targets the
LIVE write surfaces (M-2 — data-architect): `learning_items.translation_nl`
(Dutch) and `item_answer_variants`** — NOT `item_meanings` / `capability_artifacts`
(dead paths for item caps; a gate there reports clean while the live column still
carries `;`). Refined per architect Q3 to avoid a verb-detection dependency (none
wired; item `pos` is null per CS14):
- **Error — `translation_nl` (Dutch):** flag a non-canonical separator — a value
  containing `;`, or one with **no** `/` that splits into ≥2 comma-segments each
  **≤3 tokens** (`"vader, meneer, u"`). A legitimate single Dutch translation with
  an internal comma is a longer clause (≥4 tokens in some segment). **No
  verb-detection.** Blocks publish.
- **Warn — Indonesian-side answers (`item_answer_variants`, `accepted_answers:id`):**
  warn-level only — Indonesian has verbless equative clauses (`dia guru` = "he is a
  teacher"), so short verbless comma-segments are normal and must never error.
- A short denylist exempts any known comma-bearing legitimate Dutch meaning.
Pairs with the generator's `normaliseDutchTranslation` (`;`→`/`,
`generate-staging-files.ts:171`), so CS19 mostly catches **legacy/hand-authored**
regressions — new generator output already lands canonical `/`.

### 2d. Health check (live DB)
New **HC24** (M-1 data-architect: HC numbers are in use through **HC23** — the
plan's earlier "HC21" collided with the PR-6 EN-coverage check at
`check-supabase-deep.ts:1114`; confirm the next free number at implementation)
scanning **`learning_items.translation_nl` and `item_answer_variants`** (the live
paths) for non-canonical separators (`;`, or comma-as-OR) still in the DB. The
`bapak`-style legacy meanings are the expected initial hits. Read-only; reported
by `check-supabase-deep`.

### 2e. Data re-author
Re-author the **legacy, hand-authored `learning_items.translation_nl`** values
that carry a non-canonical separator (`;` or comma-as-OR) → canonical `/` (the
form `normaliseDutchTranslation` already emits for new items). Scoped +
judgment-required (distinguish `,`-as-OR from `,`-as-punctuation); not a blanket
pass. Scope is the legacy backlog HC24 surfaces — new generator output is already
canonical, so this is finite.

## Deploy ordering (M2 + M3 — architect, mandatory)

Each fix has a hard ordering constraint; violating either is itself a
learner-facing regression of the class this plan fixes.

1. **Fix 2 comma-drop (M2).** Comma-as-OR is a *live* grader convention today
   (`answerNormalization.ts:73-86`). The moment the grader stops splitting on
   comma, every still-comma-authored answer becomes one unmatchable target. So:
   **(i)** re-author the legacy `;`/comma meanings in `translation_nl` → `/` (2e);
   **(ii)** confirm via HC24 (2d)
   that **zero** comma-as-separator artifacts remain in the live DB; **(iii)**
   only then ship the grader change (2a/2b) — or ship all three in one deploy with
   the re-author proven complete first. CS19 (2c) may ship any time (it only gates
   new writes).
2. **Fix 1 retire (M3).** Fix 1a (stop emitting `sentence`/`dialogue_chunk` caps)
   must be live **before — or atomically with** — the 1b backfill, because the
   adapter un-retires reappearing caps (`adapter.ts:143-145`).

The two fixes are otherwise independent and can ship in either order.

## Supabase Requirements

### Schema changes
- **None.** No new tables or columns. Fix 1b mutates existing rows
  (`learning_capabilities.retired_at`); Fix 2e mutates existing
  `item_meanings.translation_text` / `learning_items.translation_nl` values. The
  `accepted_answers:id` artifact slot already exists (CONTEXT.md → Typed
  Artifact).
- RLS / grants: unchanged — both are admin/service-key writes via the existing
  pipeline + one-off scripts; no new anon/authenticated access path.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (no new schema).
- [ ] Kong CORS — **N/A**.
- [ ] GoTrue — **N/A**.
- [ ] Storage — **N/A**.

### Health check additions
- `scripts/check-supabase.ts` (functional, anon) — **N/A**.
- `scripts/check-supabase-deep.ts` (structural, service key) — **new HC21**: no
  published answer-bearing artifact uses comma-as-separator (Fix 2d).

## Test plan
- **Fix 2a/2b:** unit tests on the shared `lib/capabilities/` helper + `checkAnswer`
  — `/`-split (and defensive `;`-split) accepts both clauses of a multi-form
  `translation_nl` ("het is goedkoop / de prijs is laag"); comma is *not* a
  separator; the user's real failed-but-correct paraphrases now pass.
- **Fix 2c/2d (live-surface, M-2):** CS19 + HC24 tests assert they scan
  `learning_items.translation_nl` + `item_answer_variants` (the live paths) and
  flag a legacy `;`/comma value there — NOT `item_meanings` (a clean
  `item_meanings` must not mask a dirty `translation_nl`).
- **Fix 1a:** capability-stage unit test — a `sentence`/`dialogue_chunk` item
  produces zero item caps; a `word`/`phrase` produces the full suite; a ≥6-token
  `phrase` emits the length-guard warning; `dialogue_line` cloze caps still emit.
- **Fix 1b:** idempotent retire script test (re-run is a no-op); the 56 target
  set excludes `dialogue_line` caps.
- **Fix 1b coupling (N6):** after retire + a re-publish **with Fix 1a active**,
  the 56 caps **stay retired** — they do not reappear in the emit set and get
  un-retired (`adapter.ts:143-145`). This is the test that proves M3.
- **Fix 2c:** `CS19` unit tests — errors on `meaning:l1` `"vader, meneer, u"`,
  passes on `"het is goedkoop; de prijs is laag"`, does NOT error on an Indonesian
  `accepted_answers:id` verbless segment, warns on a mixed/long comma case.
- **Fix 2 ordering (M2):** a grader test asserting that, with comma-split removed,
  a meaning still authored with comma-as-OR fails — guarding the requirement that
  2e/HC21 precede the grader change.

## Out of scope (named, not silently dropped)
- **B-2 synonym enrichment** — generating *additional* synonyms for items that
  store only one meaning (e.g. `murah` → also accept "laag"). Deferred to a
  quality follow-on measured by residual failure rate after this ships.
- **L5 dialogue-cloze projection bug** — L5 projects only 2 `dialogue_line` caps
  for 5 authored clozes (L7/8/10 project 1:1). Pre-existing, unrelated to this
  plan; its own ticket.

## Open questions — RESOLVED (architect review, PR #129, round 1)
1. **Seam.** Cut the *caps* at the legacy-bundle filter (right seam — the new
   path never carries `sentence`/`dialogue_chunk`). Stopping the `learning_items`
   *rows* too is a fast-follow gated on the dialogue-cloze anchor audit (§1a, last
   bullet — `runner.ts:896`). ✓
2. **Length guard.** Warn-only, no hard-error — long fixed expressions
   (`terima kasih kembali`) are legitimate lexical chunks (§1a). ✓
3. **CS19 heuristic.** Error scoped to `meaning:l1` only; drop verb-detection;
   warn-only on the Indonesian `accepted_answers:id` side (verbless equatives are
   normal) (§2c). ✓
