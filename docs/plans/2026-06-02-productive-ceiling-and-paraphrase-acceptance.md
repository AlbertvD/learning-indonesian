---
status: approved
adr: docs/adr/0014-productive-ceiling-item-harvest-is-word-phrase-only.md
reviewed_by: architect (PR #129, round 2 SIGN-OFF, 2026-06-02)
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
  (`docs/target-architecture.md:1071`). Fix 2's separator change + the shared
  helper land here; the target architecture keeps this file as the answer-side
  string-policy owner, so we extend it in place rather than relocating.
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

Root cause: meanings are authored with `;` ("het is goedkoop; de prijs is laag")
but `checkAnswer`'s `splitAlternatives` (`answerNormalization.ts:75`) splits only
on `/` and `,` — so the stored alternatives are inert, and comma is wrongly
treated as a separator. Per `memory/project_three_layer_invariant_gates`, a
cross-module convention needs all three gates in the same change:

### 2a. Shared helper + unit tests (the missing single definition)
Extract `splitAlternatives` into a single exported helper with the canonical
separators **`;` and `/`** (drop `,`). Both consumers import it: the runtime
grader (`checkAnswer`) **and** the new `CS19` gate. This is the fix that prevents
recurrence — grader and authoring can no longer disagree.

### 2b. Grader (session engine)
`checkAnswer` consumes the shared helper; behaviour otherwise unchanged
(exact-then-single-typo fuzzy). The fix addresses the **in-string** `;`-separated
case (`"het is goedkoop; de prijs is laag"`); *separate* `item_meanings` rows
already work today (`MeaningRecall.tsx:31-33` builds `acceptedVariants` from
them). `form_recall`/`dictation`/typed-recall also route through `checkAnswer`
(`TypedRecall.tsx:44`, `Dictation.tsx:37`), so they benefit too. **Ordering
invariant (N4):** the split MUST run before `normalizeAnswer` —
`normalizeAnswer` (`answerNormalization.ts:13`) strips all non-word chars
including `;`, so splitting after normalization would silently break the fix; the
shared helper preserves the existing split-then-normalize order
(`answerNormalization.ts:93-104`).

### 2c. `CS19` pre-write gate (Capability Stage)
New validator in the capability-stage gate family (highest current is CS18,
`gate.ts:215`; pre-write family with CS4/CS4b at `gate.ts:134-139`). Refined per
architect Q3 to avoid a Dutch/Indonesian verb-detection dependency (none is
wired; item `pos` is null per CS14):
- **Error — `meaning:l1` (L1 / Dutch) only:** flag when the value contains **no**
  `;`/`/` separator AND splits into ≥2 comma-segments that are **each ≤3 tokens**
  → almost certainly comma-as-OR (`"vader, meneer, u"`). A legitimate single Dutch
  translation with an internal comma is a longer clause (≥4 tokens in some
  segment) or carries subordinate structure. **No verb-detection.** Blocks publish.
- **Warn — `accepted_answers:id` (Indonesian) side:** run only the **warn** level
  there — Indonesian has verbless equative clauses (`dia guru` = "he is a
  teacher"), so short verbless segments are normal and must never error.
- A short denylist exempts any known comma-bearing legitimate Dutch meaning.
Pairs with instructing the authoring agent to emit `;`/`/`, so CS19 mostly
catches regressions (the comma case is historically rare — L3 meanings use `/`
exclusively, e.g. `"spullen/bagage"`).

### 2d. Health check (live DB)
New **HC21** (highest current is HC20, `check-supabase-deep.ts:1005`;
style-sibling to HC15 which scans published answer artifacts at
`check-supabase-deep.ts:861`) scanning published `meaning:l1` / `accepted_answers`
for comma-as-separator mis-encodings still in the DB (e.g. the historical
comma-authored `bapak` meanings). Read-only; reported by `check-supabase-deep`.

### 2e. Data re-author
Re-author the handful of comma-authored meanings → `;`. Scoped, judgment-required
(distinguish `,`-as-OR from `,`-as-punctuation); not a blanket pass.

## Deploy ordering (M2 + M3 — architect, mandatory)

Each fix has a hard ordering constraint; violating either is itself a
learner-facing regression of the class this plan fixes.

1. **Fix 2 comma-drop (M2).** Comma-as-OR is a *live* grader convention today
   (`answerNormalization.ts:73-86`). The moment the grader stops splitting on
   comma, every still-comma-authored answer becomes one unmatchable target. So:
   **(i)** re-author the comma meanings → `;` (2e); **(ii)** confirm via HC21 (2d)
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
- **Fix 2a/2b:** unit tests on the shared helper + `checkAnswer` — `;`-split
  accepts both clauses of "het is goedkoop; de prijs is laag"; comma is *not* a
  separator; the user's real failed-but-correct paraphrases now pass.
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
