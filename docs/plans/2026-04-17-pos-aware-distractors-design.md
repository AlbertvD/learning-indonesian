# POS-Aware Distractors — Design

## Overview

Improve distractor quality in the three runtime-generated MCQ exercise types (`cued_recall`, `cloze_mcq` runtime variant, and `recognition_mcq`) so that all options share part-of-speech with the target. This closes a category-cue leak documented in the 2026-04-17 exercise-type review: the learner can currently eliminate obvious-wrong-POS options without actually retrieving the target's meaning.

The work also adds a smaller orthogonal improvement — expanding `SEMANTIC_GROUPS` with three abstract-concept classes — so that abstract-meaning targets stop pulling concrete-noun distractors (the "concreteness leak").

Both changes plug into the existing 4-tier cascade pattern in `makeRecognitionMCQ`. `makeCuedRecall` and `makeClozeMcq` (runtime) get the cascade for the first time — they currently use a single-tier same-level random shuffle, which is the root of the problem.

## Scope

### In scope

1. Add a `pos` column to `indonesian.learning_items` with a 12-value fixed taxonomy.
2. Extend `catalog-lesson-sections.ts` (Step 3 of the content pipeline) so Claude tags each item's POS at the catalog stage; the downstream staging and publishing scripts propagate it unchanged.
3. One-shot backfill script for existing items (`scripts/backfill-pos.ts`).
4. Expand `SEMANTIC_GROUPS_NL` and `SEMANTIC_GROUPS_EN` with three new abstract classes (`emotions`, `mental_states`, `abstract_concepts`).
5. Replace `makeCuedRecall`'s single-tier distractor selection with a 6-tier cascade, keyed off `base_text` as the option but filtering on POS + translation-derived semantic group.
6. Same cascade in `makeClozeMcq` (runtime variant only; grammar-authored `cloze_mcq` is untouched).
7. Augment `makeRecognitionMCQ` with a new Tier 0 (POS + semantic group) at the top of its existing cascade. POS filtering layered through the remaining tiers.
8. Tests covering the distractor-pool invariants, POS-column presence, and cascade fallback behavior.

### Non-goals

- **Concreteness as a separate field.** Rejected — see "Decision log" below; handled via semantic-group expansion instead.
- **Enum vs text column.** Decision below favours text with a CHECK constraint for ergonomics under taxonomy evolution.
- **Automated POS tagging via Stanza/UDPipe.** The tagging pipeline uses Claude (already in the pipeline). External NLP tooling is a future option the UD-aligned naming preserves.
- **POS-matched distractors for grammar-authored exercises.** Authored exercises (`contrast_pair`, `sentence_transformation`, `constrained_translation`, `cloze_mcq` grammar variant) are curated by the linguist pipeline and have deliberately confusable options; automated POS filtering is unnecessary.
- **Semantic-group grammar (beyond adding 3 classes).** The keyword-list design is kept. A more principled embeddings-based approach is deferred.
- **Cued_recall prompt-side changes.** Out of scope — only distractors change.

## Problem statement

`makeCuedRecall` (`src/lib/sessionQueue.ts:635–671`) selects 3 distractors by filtering same-level items and shuffling. `makeClozeMcq` (runtime variant, `src/lib/sessionQueue.ts:674–710`) uses the same single-tier shuffle. This allows:

- **POS leakage**: a verb target with 3 noun distractors is solvable by elimination. Example — target `makan` (to eat), distractors `rumah` (house), `anjing` (dog), `nasi` (rice); the learner doesn't need to know `makan`, only that the prompt "to eat" wants a verb.
- **Concreteness leakage**: an abstract target with 3 concrete distractors is solvable by elimination. Example — target `cinta` (love), distractors `meja` (table), `buku` (book), `ayam` (chicken); the learner targets "an abstract concept" and the three concrete nouns fall out.

`makeRecognitionMCQ` (line 551) is partially protected against this today via its 4-tier cascade with semantic-group matching. But semantic groups are keyword-based and cover only concrete semantic fields (food, family, body, places, etc.); abstract targets often match no group and fall to same-level. POS filtering adds an orthogonal protection layer.

The literature — Haladyna, Downing & Rodriguez (2002); Read (2000); Laufer & Nation (1999); Goodrich (1977) — consistently supports same-POS distractors for L2 vocabulary MCQs. Rodriguez (2005) meta-analysis argues coarse POS is sufficient; fine splits don't help. This design adopts coarse POS. Full citations in the "References" section below.

## POS taxonomy

**12 values, names aligned with Universal Dependencies** where that alignment doesn't lose beginner-pedagogy-relevant distinctions. Values:

| Value | UD tag | Indonesian examples | Notes |
|---|---|---|---|
| `verb` | VERB | makan, minum, tidur, membaca, datang, pergi | Includes stative verbs |
| `noun` | NOUN | rumah, buku, meja, kucing, air, cinta | Flat — no concrete/abstract split (handled via semantic groups) |
| `adjective` | ADJ | besar, kecil, panas, dingin, bagus, sulit | |
| `adverb` | ADV | sangat, sekali, cepat, sering, sudah | Distinct from particle even where UD might merge |
| `pronoun` | PRON + DET | saya, kamu, dia, kami, kalian, mereka, ini, itu | Includes demonstratives (ini, itu) per Alwi et al. 2003 |
| `numeral` | NUM | satu, dua, tiga, lima, sepuluh, seratus | |
| `classifier` | — (Indonesian-specific) | orang, ekor, buah, batang, helai | Own word class in Alwi et al. 2003; confusable with nouns early |
| `preposition` | ADP | di, ke, dari, pada, untuk, dengan | Indonesian has only prepositions (not postpositions) |
| `conjunction` | CCONJ + SCONJ | dan, atau, tetapi, karena, jika, kalau | Flat — coordinating / subordinating not split |
| `particle` | PART | sudah, belum, akan, sedang, juga, saja, pun, kah, lah | Aspect markers + discourse particles |
| `question_word` | — (hybrid PRON/DET/ADV) | apa, siapa, mana, kapan, bagaimana, mengapa, berapa | Closed beginner-central class; its own tag deliberately |
| `greeting` | — (INTJ subset) | halo, selamat pagi, terima kasih, permisi, maaf, sampai jumpa | Closed set; often multi-word phrases |

### Resolving ambiguity

Some Indonesian words are used across classes. Rules for which POS to record:

- **Primary translation POS wins.** If `makan` is being taught with translation "to eat" (verb), POS is `verb`. If the same form were taught elsewhere with translation "meal" (noun), that would be a separate learning item with POS `noun`. The decision is per learning item, not per Indonesian word.
- **Multi-sense items use the primary meaning.** An item with multiple meanings in `item_meanings` uses the POS of `is_primary = true`.
- **Phrase-type items**: use the head-word POS. `selamat pagi` → `greeting`; `buah jeruk` → `noun` (jeruk is the head). Head-word detection is LLM-driven at backfill time, which is imperfect for phrases with non-obvious heads (idiomatic constructions, classifier+noun phrases, verb+object compounds). Acceptable accuracy at current scale (phrase items are <15% of all items); correctable via Supabase Studio or the Content Review override path when the latter lands.
- **Sentence-type items** (`item_type IN ('sentence', 'dialogue_chunk')`): `pos` is `NULL`. POS is a word-level property; sentences are filtered by structural shape at an earlier step of the cascade and never share POS slots with word items.

### Evolution policy

If a later lesson introduces a word class not in the taxonomy (e.g. a dedicated INTJ class distinct from greetings, or separate coordinating/subordinating conjunctions), the migration updates the CHECK constraint and backfills items that would move. Adding a value is cheap; removing or renaming is expensive (requires data migration). The 12-value set is deliberately chosen to cover A1–B1 beginner Indonesian; review before expanding to advanced lexicon.

**Known near-term gap — non-greeting interjections.** Indonesian has interjections outside the greeting set: `wah`, `aduh`, `astaga`, `ya`, `oh`, `eh`. These don't map cleanly to `greeting`. Current beginner corpus (lessons 1–8) contains some of these in dialogue sections. Backfill behavior: the LLM may tag these as `greeting` (nearest available) or leave them NULL. Both are acceptable temporarily; neither disables the exercise. If lesson 9+ introduces enough of them to matter for distractor pools, add `interjection` to the taxonomy in a follow-up migration.

## Semantic-group expansion

Three new keyword-based groups added to both `SEMANTIC_GROUPS_NL` and `SEMANTIC_GROUPS_EN` at `src/lib/sessionQueue.ts:485–519`.

### `emotions`

**NL keywords**: liefde, haat, blij, verdrietig, bang, boos, zorg, hoop, jaloers, gelukkig, ongelukkig, woede, angst, vreugde

**EN keywords**: love, hate, happy, sad, fear, afraid, anger, angry, worry, hope, jealous, joyful, sorrow, pleasure

### `mental_states`

**NL keywords**: denken, herinneren, vergeten, weten, begrijpen, geloven, overwegen, menen, besluiten, twijfel

**EN keywords**: think, remember, forget, know, understand, believe, consider, decide, doubt, opinion

### `abstract_concepts`

**NL keywords**: vrijheid, waarheid, probleem, idee, reden, betekenis, mening, gedachte, recht, plicht

**EN keywords**: freedom, truth, problem, idea, reason, meaning, opinion, thought, right, duty

### Disambiguation note

The existing `getSemanticGroup` function (line 521) returns the first matching group via `keyword.includes(lower)`. Order in the array determines precedence. New groups are appended to the end, so existing concrete-noun matches (food, body, family, etc.) remain stable.

**Pre-existing bug not fixed here**: the `greetings` NL keyword `'dag'` is a substring of `'maandag'`, `'dinsdag'`, ..., `'zondag'` — so weekday translations falsely match `greetings` before they can match `time`. This is an orthogonal bug dating from before this spec. Fixing it requires switching `.includes()` to word-boundary matching or reordering groups. Out of scope for Spec 2; flagged for a separate fix. The semantic-group test (`semanticGroups.test.ts`) will include a *regression* case asserting the buggy behavior so we notice when it's fixed rather than silently break.

### Cross-dimension interaction with POS

The semantic groups key on the translation text, not on POS. Some translations can be both noun and verb ("love" in EN; "denken" as verb but nominalisable in NL). The POS filter on the *item*, not the translation, disambiguates at cascade-tier level: a target with `pos='verb'` and semantic group `emotions` only admits candidates whose item-level `pos='verb'`. An item whose translation matches the group keywords but whose `pos` differs is filtered out at Tiers 0–2. This cleanly handles "love" (verb) vs "love" (noun) even though both translations hit the `emotions` keyword list.

## Data model

### Schema migration

Append to `scripts/migration.sql`:

```sql
-- POS (part of speech) for distractor filtering in MCQ exercises.
-- Values correspond to beginner Indonesian word classes. See
-- docs/plans/2026-04-17-pos-aware-distractors-design.md for rationale.
ALTER TABLE indonesian.learning_items
  ADD COLUMN IF NOT EXISTS pos text;

ALTER TABLE indonesian.learning_items
  DROP CONSTRAINT IF EXISTS learning_items_pos_check;
ALTER TABLE indonesian.learning_items
  ADD CONSTRAINT learning_items_pos_check CHECK (
    pos IS NULL OR pos IN (
      'verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
      'classifier', 'preposition', 'conjunction', 'particle',
      'question_word', 'greeting'
    )
  );
```

### Why text + CHECK, not enum

Postgres enums have known pain: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction, schema migrations for additions are awkward, and cross-schema enum grants are fiddly. A `text` column with a CHECK constraint is easier to extend: updating the constraint is a single ALTER that runs in a transaction.

### Index

No index is added. The cascade runs in-app against the already-in-memory `allItems` list; there's no SQL query filtering by `pos`. An index would be dead weight.

### RLS

`learning_items` already has RLS enabled (public read for authenticated users; admin write). The new column inherits the existing policies — no new policies needed.

### Grants

Existing `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA indonesian TO service_role` (migration.sql line ~369) and the `GRANT SELECT ... TO authenticated` on `learning_items` cover the new column.

## Pipeline changes

### `catalog-lesson-sections.ts` (Step 3)

`scripts/catalog-lesson-sections.ts` is the LLM-driven cataloguer that outputs `sections-catalog.json`. Its prompt currently asks Claude to produce item-level metadata including `item_type`. Update the prompt to additionally produce `pos` per item, from the 12-value taxonomy.

- Prompt additions: the taxonomy table, resolution rules for ambiguous items, examples.
- Output schema: add `pos: "verb" | "noun" | ...` to each item in `sections-catalog.json`.
- Backward compatibility: the schema validation in `generate-staging-files.ts` (Step 4) tolerates an absent `pos` (e.g. from older catalogs re-run post-change) by leaving the field unset on the resulting `learning-items.ts`. New catalogs always include it.

### `generate-staging-files.ts` (Step 4)

Deterministic propagation:
- If `sections-catalog.json` includes `pos`, write it as a plain property on the item object in `learning-items.ts`.
- **No shared TypeScript interface to update.** Staging `learning-items.ts` files are untyped raw JSON-literal object arrays (`export const learningItems = [{ ... }]`) — see the "Pipeline integration" section below for the verified shape. Adding `pos` is a new object property, not a type edit.
- Sentence/dialogue_chunk items: pass through as `null` or omit; either is acceptable because publication defaults a missing field to NULL in the DB.

### `publish-approved-content.ts`

Extend the `learning_items` upsert path to include `pos`. The existing upsert already handles nullable columns; adding `pos: item.pos ?? null` to the insert payload is sufficient.

### Linguist pipeline agents

No behavior change needed beyond the prompt update to `catalog-lesson-sections.ts`. The `linguist-structurer`, `linguist-creator`, and `linguist-reviewer` agents do not touch `pos` — it flows through from the catalog.

## Backfill

### Script: `scripts/backfill-pos.ts`

**Input**: all `learning_items` rows where `pos IS NULL` and `item_type IN ('word', 'phrase')`. Sentence/dialogue_chunk items are excluded (they don't have POS).

**Process**:
1. Query Supabase for eligible items, pulling `id`, `base_text`, `item_type`, plus the primary NL + EN meaning from `item_meanings`.
2. Batch into groups of 40 items.
3. For each batch, call Anthropic API with a structured prompt: the 12-value taxonomy, resolution rules, examples, and the batch of items.
4. Parse the JSON response: `{ id: string, pos: string }[]`.
5. Validate each POS value against the taxonomy; reject invalid values (log and leave NULL).
6. Upsert `learning_items.pos` for valid values.

**Output**: stdout summary — tagged count, skipped count, invalid-value count, per-POS distribution.

**Safety**:
- Dry-run flag (`--dry-run`) prints the proposed mapping without writing.
- **CSV export of the proposed mapping** (`--dry-run --csv pos-backfill.csv`) so a human can spot-check before committing. Expected workflow: one admin skims the CSV, flags obvious errors, then runs live.
- Idempotent — re-running only fills NULL values; already-tagged items are not touched.
- No retries on API errors beyond standard transient-error retry at the Anthropic SDK layer; failed batches are logged and can be re-run.

**Known residual risk — mistaggings**: at 95% accuracy over 1,200 items, ~60 items will be mistagged. A mistag causes a distractor-quality regression on the affected item (wrong-POS distractors re-introduced). The Content Review page (separate spec, TBD) will support per-item POS override as a formal correction path; until then, corrections happen via Supabase Studio. Live content carries these mistaggings silently — no crash, just reduced distractor quality for the affected items. Tracked as acceptable technical debt: the backfill improves average quality even if the tail contains errors.

**Expected scale**: ~1,200 word+phrase items today across lessons 1–8. At 40 items/batch that's ~30 API calls. Cost dominated by model choice; Claude Sonnet is sufficient for this classification task.

**When to run**: after the schema migration has landed and `check-supabase-deep` confirms the column exists.

### Out-of-band regeneration for corrections

If a POS value is mis-tagged in review:
- Admins can fix via the Content Review page (Spec TBD — not in scope here) or directly in Supabase Studio.
- Changing `learning_items.pos` is a simple UPDATE; no cascade implications.

## Runtime selection changes

### `makeCuedRecall` (`sessionQueue.ts:635`)

Replace the single-tier shuffle with a 6-tier cascade mirroring `makeRecognitionMCQ`'s pattern but keyed on `base_text` as the option.

**New signature**: adds `meaningsByItem: Record<string, ItemMeaning[]>` (already threaded to `makeRecognitionMCQ`).

**Call sites requiring signature update** — every caller in `selectExercises` must pass `meaningsByItem`:
- `sessionQueue.ts:411` (anchoring, hasAnchorContext, roll < 0.25)
- `sessionQueue.ts:421` (anchoring, no anchor context, roll < 0.30)
- `sessionQueue.ts:473` (productive/maintenance rotation, roll < 0.80)

**Pool construction** — for each candidate `i` in `allItems`:
- `base_text`: used as the distractor option
- `item_type`: used for structural-similarity filter via `STRUCTURALLY_SIMILAR_TYPES`
- `pos`: used for POS filter (falls through when NULL)
- `level`: used for level filter
- `translation`: the candidate's primary user-language translation, used for `getSemanticGroup`

**Cascade**:

| Tier | Filter | Purpose |
|---|---|---|
| 0 | same structural shape + same POS + same semantic group | Strictest — pedagogically tightest |
| 1 | same structural shape + same POS + same level | Strong — preserves POS when group doesn't match |
| 2 | same structural shape + same POS (any level) | Keeps POS homogeneity as primary goal |
| 3 | same structural shape + same semantic group (POS relaxed) | Backup when pool too thin |
| 4 | same structural shape + same level | Current behavior preserved as fallback |
| 5 | same structural shape (any level) | Last resort before full pool |

Each tier accumulates distractors; the combined list is sliced to 3. `null` POS on the target or a candidate causes that candidate to contribute to POS-relaxed tiers (3–5) only — never to Tiers 0–2. This handles the backfill-in-progress state and sentence/dialogue_chunk items gracefully.

### `makeClozeMcq` (runtime variant) (`sessionQueue.ts:674`)

Same cascade as `makeCuedRecall`. Only the runtime-built `cloze_mcq` changes — the grammar-authored path in `makeGrammarExercise` (line 279) and `makePublishedExercise` (line 762) is untouched; its distractors come from the linguist pipeline.

**New signature**: adds `meaningsByItem: Record<string, ItemMeaning[]>`, same as `makeCuedRecall`.

**Call sites requiring signature update**:
- `sessionQueue.ts:415` (anchoring, hasAnchorContext, roll < 0.70)
- `sessionQueue.ts:434` (retrieving, isSentenceType, roll < 0.6)
- `sessionQueue.ts:439` (retrieving, word with hasAnchorContext, roll < 0.40)

When called on an item with no `context_type === 'cloze'` context, `makeClozeMcq` currently returns `clozeMcqData: undefined` (see Spec 1 Fix 3 for why the `is_anchor_context` fallback is being removed). The new cascade must not crash on this path: the distractor computation still runs but the returned `ExerciseItem` carries `clozeMcqData: undefined` and the component renders its error state. Test plan below covers this explicitly.

### `makeRecognitionMCQ` (`sessionQueue.ts:551`)

**Existing cascade** (lines 577–590):
1. Same structural shape + same semantic group
2. Same structural shape + same level
3. Same structural shape, any level
4. Full pool fallback

**New cascade**:

| Tier | Filter | Change |
|---|---|---|
| 0 | same structural shape + same POS + same semantic group | NEW — strictest |
| 1 | same structural shape + same POS + same level | NEW |
| 2 | same structural shape + same semantic group | Existing Tier 1 |
| 3 | same structural shape + same level | Existing Tier 2 |
| 4 | same structural shape, any level | Existing Tier 3 |
| 5 | full pool fallback | Existing Tier 4 |

`null` POS handling identical to `makeCuedRecall`.

**No call-site signature change** — `makeRecognitionMCQ` already receives `meaningsByItem`. Callers at lines 391, 417, 425, 429, 451, 475 are unchanged.

### Helper extraction

The cascade is replicated across three `make*` functions. Extract a shared `pickDistractorCascade` helper that accepts a candidate pool and returns up to N distractors following the tier logic. Each `make*` calls this with its specific pool shape and option projection (translation for `recognition_mcq`, `base_text` for the two others). This reduces duplication and makes the cascade logic testable in isolation.

**Signature**:
```ts
interface DistractorCandidate {
  id: string
  option: string          // the displayed option (translation or base_text)
  itemType: string
  pos: string | null
  level: string
  semanticGroup: string | null
}

function pickDistractorCascade(
  target: { itemType: string; pos: string | null; level: string; semanticGroup: string | null },
  pool: DistractorCandidate[],
  count: number,
): string[]
```

**Dedupe contract**: the helper tracks already-selected candidates across tiers. A candidate that contributes at Tier 0 must not re-appear at Tier 1+ (same item id). Returned `string[]` contains no duplicate option texts either — two distinct `id`s with identical `option` text (rare but possible for translations) are deduped on option text before returning. This matches the existing `makeRecognitionMCQ` cascade's behavior at lines 584–588 where `!sameGroup.includes(d.translation)` etc. prevent duplicates.

**Order within a tier**: Fisher-Yates shuffle, preserving existing randomization behavior.

## Types

Add to `src/types/learning.ts`:

```ts
export type POS =
  | 'verb' | 'noun' | 'adjective' | 'adverb' | 'pronoun'
  | 'numeral' | 'classifier' | 'preposition' | 'conjunction'
  | 'particle' | 'question_word' | 'greeting'

// LearningItem gains:
pos: POS | null
```

Existing `LearningItem` type extensions are trivial — nullable `pos: POS | null`.

## Tests

### Files touched

| Path | Status | Purpose |
|---|---|---|
| `src/__tests__/sessionQueue.test.ts` | Extend (existing) | Cascade-invariant tests for `makeCuedRecall`, `makeClozeMcq`, `makeRecognitionMCQ`, `pickDistractorCascade` |
| `src/__tests__/semanticGroups.test.ts` | New | `getSemanticGroup` positive/negative/regression cases; requires the getSemanticGroup export described below |
| `scripts/check-supabase-deep.ts` | Extend (existing) | Verify `pos` column, CHECK constraint, per-POS counts |

### Unit tests (new / extended)

`src/__tests__/sessionQueue.test.ts` additions:

- `pickDistractorCascade` — extracted helper:
  - Tier 0 hit: target has `pos='verb'` + `semanticGroup='mental_states'`; pool has 3 candidates with same POS + same group → all 3 returned from Tier 0.
  - Tier 0 partial + Tier 1 fill: 1 Tier-0 match + 2 same-POS same-level → total 3 across tiers 0 and 1.
  - POS-null fallthrough: target `pos=null` → Tiers 0–2 skipped, starts at Tier 3.
  - Candidate with `pos=null` never appears in Tiers 0–2 of a target with known POS.
  - No matches at any tier except full pool → 3 items from Tier 5.
  - `STRUCTURALLY_SIMILAR_TYPES` honored across all tiers (a sentence target never gets a word distractor).

- `makeCuedRecall` end-to-end with pool fixtures:
  - Target verb + 10 candidates (3 same-POS-same-group, 2 same-POS-same-level, 5 noise) → 3 distractors all verbs from first two tiers.
  - Target with `pos=null` → falls back to legacy-equivalent behavior (same-level random).

- `makeClozeMcq` runtime-variant:
  - Same invariants as `makeCuedRecall` for the cascade tiers.
  - **No-cloze-context edge case**: called on an item whose `contexts` array contains no `context_type === 'cloze'` entry (after Spec 1 Fix 3 lands), the function must not crash. Test asserts the returned `ExerciseItem` has `clozeMcqData: undefined` and does not throw. The cascade may run harmlessly to completion; the distractor list is discarded because no `clozeMcqData` is constructed.

- `makeRecognitionMCQ`: existing tests preserved; add one case verifying Tier 0 fires when POS+group match exists.

### Integration tests (new)

`src/__tests__/semanticGroups.test.ts` (new):
- `getSemanticGroup('love', 'en')` returns `'emotions'`.
- `getSemanticGroup('liefde', 'nl')` returns `'emotions'`.
- `getSemanticGroup('think', 'en')` returns `'mental_states'`.
- `getSemanticGroup('waarheid', 'nl')` returns `'abstract_concepts'`.
- Regression-guard the **pre-existing `dag` bug**: `getSemanticGroup('maandag', 'nl')` returns `'greetings'` today (because `.includes('dag')` matches). This test asserts the current buggy behavior so a future fix is intentional, not accidental. Comment in the test names the bug and links to this spec.
- Verify no false positives: concrete nouns ("rijst", "huis") don't match abstract groups.

**Export requirement**: `getSemanticGroup` is currently module-private in `sessionQueue.ts:521`. To make it testable, either (a) export it from `sessionQueue.ts`, or (b) move it and the `SEMANTIC_GROUPS_*` constants to a new `src/lib/semanticGroups.ts` module and re-export from `sessionQueue.ts` for backward compatibility. Option (b) is preferred because it also improves the file-by-responsibility structure. Spec picks (b).

### Schema tests

`scripts/check-supabase-deep.ts`:
- Verify `indonesian.learning_items.pos` column exists with type `text` (via `information_schema.columns`).
- Verify the CHECK constraint exists on the `pos` column by querying `pg_constraint` for a row where `conrelid` resolves to `indonesian.learning_items` and `conname = 'learning_items_pos_check'`. Reading by name is acceptable because the migration creates with a fixed name; if the constraint is dropped via `DROP CONSTRAINT IF EXISTS` without being recreated, this check catches it.
- Report per-POS counts via `SELECT pos, COUNT(*) FROM indonesian.learning_items WHERE item_type IN ('word', 'phrase') GROUP BY pos` (sanity check for backfill completion and distribution spot-check).

### Backfill validation

Post-backfill manual check (not a test): query `SELECT pos, COUNT(*) FROM indonesian.learning_items WHERE item_type IN ('word', 'phrase') GROUP BY pos`. Expected shape at current scale (1,200 items): `verb` ~300, `noun` ~500, `adjective` ~80, `adverb` ~40, `pronoun` ~30, `numeral` ~80 (lesson 2 numbers), `classifier` ~10, `preposition` ~20, `conjunction` ~15, `particle` ~30, `question_word` ~10, `greeting` ~30, `null` 0. Tolerances are loose; the exercise is to spot zero-coverage values (likely a taxonomy gap) or gross imbalances (likely tagging bias).

## Data Model Impact

- `indonesian.learning_items` gains one nullable `text` column with a CHECK constraint.
- No new tables, no new indexes, no new RLS policies.
- Existing tests covering `learning_items` serialization are unaffected (new column is optional).
- `LearningItem` TypeScript type gains one optional field.

---

## Pipeline integration

The POS column participates in the full content pipeline end-to-end. Each step below gets a concrete change.

### Naming disambiguation

The name `pos` already appears in `scripts/data/lessons.ts` (legacy lesson-5 content) as an ad-hoc field in positive/negative adjective-pair objects (`{ pos: 'baru', pos_dutch: 'nieuw', neg: 'lama', ... }`). This is unrelated — there it means "positive". The new DB column `learning_items.pos` means "part of speech" and lives in a different context; there is no conflict at the DB or staging level. No renames needed. Noted here so reviewers don't conflate the two.

### `catalog-lesson-sections.ts` (Step 3)

Prompt extension covered in the main spec above. Output schema additions:
- Each vocabulary/expression/number item in `sections-catalog.json` gains `pos: string | null`.
- Sentence / dialogue_chunk items receive `pos: null` (POS doesn't apply to multi-word structures at the item level).
- Claude is instructed to emit one of the 12 valid values or `null` — no free-form strings.
- Add a short validator in `catalog-lesson-sections.ts` after LLM response: reject any POS value not in the 12-value set, treating as `null` and logging the catalog item that produced it.

### `generate-staging-files.ts` (Step 4)

The staging `learning-items.ts` files are written as **untyped JSON-literal object arrays**, not through a shared TypeScript interface (verified: `scripts/data/staging/lesson-N/learning-items.ts` exports a raw `learningItems` array without a type annotation). So adding `pos` is a new property on each object; no shared type definition file to update.

Changes to `generate-staging-files.ts`:
- When copying each item from `sections-catalog.json` to `learning-items.ts`, include `pos` if present.
- For item types where `pos` doesn't apply (`sentence`, `dialogue_chunk`), omit the field (equivalently, set `null`). Publishing will default missing to `NULL`.

### `publish-approved-content.ts` quality gates

Three gates to add. Order matters — earlier gates block later ones.

1. **Pre-insert validation.** Before the `learning_items` upsert, iterate staging items. For each `item_type IN ('word', 'phrase')`, if `pos` is missing or null, log a WARNING. Do not block publish (matches the pattern from Spec 1: missing optional metadata → warn, don't reject).
2. **Value-set validation.** For each item with a non-null `pos`, verify the value is in the 12-value set. On mismatch, fail hard (exit non-zero) — a bad POS value would violate the CHECK constraint anyway, and failing early gives a better error than a Postgres CHECK violation mid-transaction. **Note**: this gate is intentionally redundant with the `linguist-reviewer` CRITICAL check below — the reviewer catches bad values during authoring review, the publisher catches them unconditionally at publish. Both exist on purpose as defense-in-depth; do not delete one under the assumption the other covers it.
3. **Coverage report.** After publish, print per-POS counts for the lesson's new items so the operator can spot-check distribution.

### `content-seeder` failure mapping

CLAUDE.md's "Common failure → agent mappings" table gains:
- `Invalid POS value in staging → linguist-structurer (re-run catalog)` — structurer owns the catalog-regeneration path.
- Missing POS on word/phrase items is a WARNING (not a failure), so no routing change for that case.

### `linguist-reviewer` changes

The reviewer agent's `review-report.json` gains two checks:
- **WARNING**: any `item_type IN ('word', 'phrase')` item in `learning-items.ts` with `pos` unset. Actionable post-review but non-blocking.
- **CRITICAL**: any item with a `pos` value not in the 12-value set. Blocks publishing until `linguist-structurer` re-runs.

The reviewer's existing check list in `.claude/agents/linguist-reviewer.md` (or the equivalent config) needs this addition. Implementation: the reviewer reads the current staging files, applies the new check inline, records findings in its output.

### CLAUDE.md documentation update

Update the "Content Management → Adding a new lesson (lessons 4+) — full pipeline" section:
- In Step 3 (LLM section catalog) description, note that the LLM now tags part-of-speech per item.
- In Step 7 (Publish) description, note the new quality gates.
- In the "Staging files reference" table, the `learning-items.ts` description gains: "includes `pos` per word/phrase item".
- In the `content-seeder` failure-mapping bullet list, add the two new mappings.

### Backfill sequencing

The spec's Rollout section already notes "the pipeline change must land before the first lesson 9 publication." Re-stating the sequencing constraints explicitly here so this section is self-contained:
- **Blocking**: catalog-lesson-sections.ts prompt update + publish-approved-content.ts gates must both ship before any new lesson (≥ lesson 9) publishes. Otherwise the new lesson lands with `pos = NULL` for every item and requires a second backfill pass.
- **Blocking**: schema migration (Rollout step 1) must land before the backfill script (Rollout step 4) runs, obviously.
- **Order relative to Rollout steps**: Rollout step 3 (pipeline change) ships before step 4 (backfill). Backfill only touches already-NULL items, so if a new lesson publishes between step 3 and step 4 it still lands with `pos` populated by the pipeline, and the backfill naturally skips its items (they're already non-NULL).
- **Non-blocking**: the runtime cascade changes (Rollout steps 6–7) can lag the pipeline changes; items without `pos` fall through the cascade gracefully.

### Seed data

No seed-table changes. `exercise_type_availability` unchanged (no new exercise types in Spec 2).

## Supabase Requirements

### Schema changes
- `ALTER TABLE indonesian.learning_items ADD COLUMN pos text`
- `ALTER TABLE indonesian.learning_items ADD CONSTRAINT learning_items_pos_check CHECK (...)` (12-value set)
- No new tables, indexes, or triggers.

### RLS policies
- None new — inherits existing `learning_items` RLS.

### Grants
- Covered by existing `GRANT SELECT ... TO authenticated` and `GRANT ALL ... TO service_role` at the table level.

### homelab-configs changes
- [ ] PostgREST: N/A — no new schema exposure; column is on an already-exposed table
- [ ] Kong: N/A — no new CORS origins or headers
- [ ] GoTrue: N/A
- [ ] Storage: N/A — no new buckets

### Health check additions
- `scripts/check-supabase-deep.ts`: verify `pos` column exists; verify CHECK constraint exists; report per-value counts for sanity.
- `scripts/check-supabase.ts`: N/A — functional health already covers `learning_items` table reads.

## Rollout

Ordered to keep the system functional at every step:

1. **Schema migration** — add `pos` column + constraint. Run `make migrate`. Existing rows have `pos = NULL`; all callers tolerate NULL. No visible change yet.
2. **Health check update** — add the column + constraint verification to `check-supabase-deep.ts`.
3. **Pipeline change** — update `catalog-lesson-sections.ts` prompt and the staging/publishing propagation. New lessons from this point onwards ship with POS.
4. **Backfill script** — author `scripts/backfill-pos.ts`, dry-run first, then live-run. Verify per-POS counts.
5. **Semantic group expansion** — append the three new groups to `SEMANTIC_GROUPS_NL/EN`. Existing `makeRecognitionMCQ` benefits immediately even before the POS cascade changes.
6. **Cascade helper + types** — extract `pickDistractorCascade`, add `POS` type, update `LearningItem`. **Clarification**: this step only *adds* the helper and types; it does not change any `make*` function. `makeRecognitionMCQ`, `makeCuedRecall`, and `makeClozeMcq` retain their current inline logic. This keeps step 6 a pure additive refactor with zero behavior change — the cascade helper is dead code until step 7.
7. **Runtime selection changes** — update `makeCuedRecall`, `makeClozeMcq` runtime, and `makeRecognitionMCQ` to use `pickDistractorCascade`. Behavior changes here: (a) `makeRecognitionMCQ` gains two new tiers at the top (POS+group, POS+level); (b) `makeCuedRecall` and `makeClozeMcq` gain the full 6-tier cascade. All three functions must get their tests updated in the same commit to catch any parity drift from the old logic.
8. **Tests** — land alongside each code change.

Each step is an independent commit. Revertibility:
- Steps 1–2 can run without 3+ (NULL column is benign).
- Step 3 without 4 means new lessons tagged but old ones untagged — still benign (cascade falls through POS tiers for NULL).
- Step 5 is independent and can ship first.
- Step 6 is a pure additive refactor (dead code until step 7). Safe to land standalone.
- Step 7 is the only behavior-changing step. If a regression surfaces, revert commit 7 alone; the helper from step 6 remains but unused.

## Decision log

### Rejected: concreteness as a separate field

Considered adding `concreteness: 'concrete' | 'abstract' | null`. Rejected because:
- Concreteness is inherently a spectrum (Brysbaert et al. 2014 use a 1–5 rating scale); binary tags are lossy and arbitrary at the boundary.
- The same discrimination problem — abstract targets pulling concrete distractors — is solved more cheaply by expanding `SEMANTIC_GROUPS` with abstract classes.
- Adds a second authoring burden (two tags instead of one) without proportional benefit.
- The literature does not treat concreteness as part of POS taxonomy; it lives in semantic space.

### Rejected: splitting `noun` into `noun_concrete` / `noun_abstract`

Same reasoning as above, plus: Rodriguez (2005) meta-analysis shows fine POS splits don't meaningfully improve MCQ discrimination. Flat `noun` + semantic groups is cheaper and pedagogically equivalent.

### Rejected: strict POS gating (no fallback)

Considered requiring same-POS distractors always, falling back to "exercise not scheduled" when pool too thin. Rejected because this creates dead-ends in early lessons where POS pools are small (e.g., only 3 adjectives exist in lesson 2). The tiered fallback preserves learner flow while still preferring POS homogeneity when the pool supports it.

### Rejected: Universal Dependencies tag names verbatim

Considered using `VERB`, `NOUN`, `ADJ`, `ADV`, `PRON`, `NUM`, `ADP`, `CCONJ`, `SCONJ`, etc. as value names. Partially adopted — the taxonomy is UD-compatible in spirit (names map 1:1 to UD tags with three exceptions: `classifier`, `question_word`, `greeting` are Indonesian-specific classes without UD counterparts). Lowercase names chosen for readability and consistency with the existing `item_type` convention.

### Accepted: backfill via Claude rather than Stanza/UDPipe

Claude is already in the pipeline. Adding an external NLP dependency (Stanza, UDPipe) adds operational complexity without meaningful accuracy gain at beginner scale. If later lessons expand into ambiguous lexicon where automated POS tools outperform LLM classification, the UD-aligned taxonomy allows swapping in an external tagger without schema changes.

## Open questions

None at design time. All resolved decisions recorded above.

## References

- Haladyna, Downing & Rodriguez (2002), *Applied Measurement in Education* — revised MCQ item-writing guidelines
- Rodriguez (2005), *Educational Measurement: Issues and Practice* — meta-analysis on distractor count + quality
- Read (2000), *Assessing Vocabulary* (Cambridge) — authoritative L2 vocabulary assessment text
- Laufer & Nation (1999) — Vocabulary Levels Test, the field-standard instrument
- Goodrich (1977), *Foreign Language Annals* — POS-matched distractors in FL testing
- Alwi et al. (2003), *Tata Bahasa Baku Bahasa Indonesia* — the reference grammar of standard Indonesian
- Brysbaert et al. (2014), *Behavior Research Methods* — concreteness ratings for 40k English words (context for rejection of separate concreteness field)
- Memory `research_audio_sla.md` — SLA review cited earlier in this project's research trail
- Universal Dependencies project: https://universaldependencies.org — POS tag reference
