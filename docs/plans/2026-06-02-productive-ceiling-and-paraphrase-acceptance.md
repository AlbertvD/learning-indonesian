---
status: draft
adr: docs/adr/0014-productive-ceiling-item-harvest-is-word-phrase-only.md
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

- Today the `word`/`phrase` item caps are emitted by
  `projectors/vocab.ts:363-430`; the `sentence`/`dialogue_chunk` item caps flow
  through the **legacy bundle** from `staging.capabilities`
  (`runner.ts:440-475`, the `.filter(...)` that excludes only new-path keys).
  The rule is enforced by **excluding `sentence`/`dialogue_chunk` item caps from
  that bundle** (filter on the item's `item_type`), so they are never written.
- **Length guard.** A `word`/`phrase` whose `base_text` is ≥ 6 tokens emits a
  **warning** finding ("likely mis-tagged sentence") — it does not block; kind is
  the gate, length is the smell. Threshold is a single named constant.
- **Keepers untouched:** `dialogue_line`-source `contextual_cloze` caps are not
  item caps and are unaffected. The `phrase` items extracted from a line, and the
  `pattern` caps for the grammar, are unaffected.
- **Reader-visibility safety net.** When a `sentence`/`dialogue_chunk` is dropped
  from harvest, assert its text appears in the lesson's rendered content
  (`lesson_sections.content` blob); if absent, emit a warning (reader gap or
  spurious harvest) — never silently vaporise (ADR 0014 § Decision).

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
(exact-then-single-typo fuzzy). `meaning_recall` etc. already pass
`acceptedVariants` (`MeaningRecall.tsx:31`), so this immediately honours the
`;`-authored alternatives already in the DB.

### 2c. `CS19` pre-write gate (Capability Stage)
New validator in the capability-stage gate family. For each answer-bearing
artifact (`meaning:l1`, `accepted_answers`):
- **Error** when *every* comma-separated segment is a standalone short answer
  (≤ ~3 tokens, no verb) → almost certainly a comma-as-separator mis-encoding
  (`"vader, meneer, u"`). Blocks the publish like other CS errors.
- **Warn** on mixed/longer cases → surfaces for review without blocking.
Pairs with instructing the authoring agent to emit `;`/`/`, so CS19 mostly
catches regressions.

### 2d. Health check (live DB)
New `HC` (sibling to HC15) scanning published `meaning:l1` / `accepted_answers`
for comma-as-separator mis-encodings still in the DB (e.g. the historical
comma-authored `bapak` meanings). Read-only; reported by `check-supabase-deep`.

### 2e. Data re-author
Re-author the handful of comma-authored meanings → `;`. Scoped, judgment-required
(distinguish `,`-as-OR from `,`-as-punctuation); not a blanket pass.

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
- `scripts/check-supabase-deep.ts` (structural, service key) — **new HC**: no
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
- **Fix 2c:** `CS19` unit tests — errors on `"vader, meneer, u"`, passes on
  `"het is goedkoop; de prijs is laag"`, warns on a mixed/long comma case.

## Out of scope (named, not silently dropped)
- **B-2 synonym enrichment** — generating *additional* synonyms for items that
  store only one meaning (e.g. `murah` → also accept "laag"). Deferred to a
  quality follow-on measured by residual failure rate after this ships.
- **L5 dialogue-cloze projection bug** — L5 projects only 2 `dialogue_line` caps
  for 5 authored clozes (L7/8/10 project 1:1). Pre-existing, unrelated to this
  plan; its own ticket.

## Open questions for the architect
1. Is excluding `sentence`/`dialogue_chunk` at the **legacy-bundle filter**
   (`runner.ts:456`) the right seam, or should harvest be cut earlier — at the
   `learning_items` write itself, so the over-long rows never become items at
   all (not just cap-less items)?
2. The length-guard threshold (6 tokens) — warning only, or should an
   egregiously long `word`/`phrase` (≥ ~10 tokens) hard-error as a mis-tag?
3. `CS19` comma-heuristic: is "every segment ≤3 tokens, no verb" → error the
   right line, or too aggressive given Indonesian has verbless equative clauses?
