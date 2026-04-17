# POS-Aware Distractors — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver POS-aware distractor selection across three runtime MCQ builders (`makeRecognitionMCQ`, `makeCuedRecall`, `makeClozeMcq` runtime), backed by a new `pos` column on `indonesian.learning_items`, pipeline tagging for new content, one-shot backfill for existing content, and `SEMANTIC_GROUPS` expansion for abstract-concept coverage.

**Design doc:** `docs/plans/2026-04-17-pos-aware-distractors-design.md`

**Dependencies:** Spec 1 impl plan is independent; Specs 3 and 4 impl plans depend on the `pickDistractorCascade` helper introduced here.

**Tech stack:** React 19, TypeScript, Vitest, PostgreSQL + Supabase, Bun.

---

## Phase A — Schema & types

### Task A.1: Schema migration — add pos column + CHECK constraint

**Files:**
- Modify: `scripts/migration.sql` (append)

**Step 1: Append to `scripts/migration.sql`**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- POS (part of speech) for distractor filtering in MCQ exercises.
-- See docs/plans/2026-04-17-pos-aware-distractors-design.md for rationale.
-- ═══════════════════════════════════════════════════════════════════════════

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

**Step 2: Run migration**

```bash
make migrate
```

Expected: migration completes; PostgREST schema cache reloaded.

**Step 3: Commit**

```bash
git add scripts/migration.sql
git commit -m "$(cat <<'EOF'
feat: add pos column to learning_items with CHECK constraint

12-value POS taxonomy (UD-aligned where possible) for distractor
filtering in MCQ exercises. Nullable — existing rows stay unaffected
until the pipeline change (Phase B) and backfill (Phase C) populate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A.2: Extend health check

**Files:**
- Modify: `scripts/check-supabase-deep.ts`

**Step 1: Add column + constraint verification — READ-ONLY introspection only**

In `scripts/check-supabase-deep.ts`, add a new check block after the existing `learning_items` checks. **Do not use insert-and-expect-failure** — accidentally leaving residue in production is unacceptable; race conditions on CI runs are possible; and an incorrectly-shaped insert could trigger NOT NULL instead of CHECK, producing a false pass.

Preferred pattern (query the catalog directly via an existing `schema_health()` RPC if the script has one, else add a small read-only RPC):

```ts
// ── POS column ──────────────────────────────
// Use information_schema directly — read-only, no side effects.
const { data: posCol } = await supabase.schema('information_schema')
  .from('columns')
  .select('column_name, data_type')
  .eq('table_schema', 'indonesian')
  .eq('table_name', 'learning_items')
  .eq('column_name', 'pos')
  .maybeSingle()

if (!posCol) fail('learning_items.pos column missing')
else if (posCol.data_type !== 'text') fail(`learning_items.pos is ${posCol.data_type}, expected text`)
else pass('learning_items.pos column present (text)')

// ── CHECK constraint ──────────────────────────────
// Two acceptable approaches:
//
// (a) If the existing schema_health() RPC covers pg_constraint, extend it to
//     include the pos constraint. See the current check-supabase-deep.ts for
//     how existing constraints are verified — follow the same pattern.
//
// (b) If not, add a small read-only RPC:
//     CREATE OR REPLACE FUNCTION indonesian.check_pos_constraint()
//     RETURNS boolean LANGUAGE sql STABLE AS $$
//       SELECT EXISTS (
//         SELECT 1 FROM pg_constraint c
//         JOIN pg_class t ON c.conrelid = t.oid
//         JOIN pg_namespace n ON t.relnamespace = n.oid
//         WHERE n.nspname = 'indonesian' AND t.relname = 'learning_items'
//           AND c.conname = 'learning_items_pos_check'
//       );
//     $$;
//     GRANT EXECUTE ON FUNCTION indonesian.check_pos_constraint() TO authenticated;
//
// Prefer (a) — it keeps all schema introspection in one place and avoids
// adding one RPC per constraint.

// ── POS distribution (informational) ──────────────────────────────
const { data: distRows } = await supabase.schema('indonesian')
  .from('learning_items')
  .select('pos, item_type')
  .in('item_type', ['word', 'phrase'])

if (distRows) {
  const counts: Record<string, number> = {}
  for (const r of distRows) counts[r.pos ?? 'null'] = (counts[r.pos ?? 'null'] ?? 0) + 1
  console.log('  POS distribution (word/phrase):')
  for (const [pos, count] of Object.entries(counts).sort()) console.log(`    ${pos}: ${count}`)
}
```

**Never use insert-and-expect-failure.** It is unsafe in production (residue rows on unexpected behavior), slow (vs a pure read), and false-positive-prone (NOT NULL firing before CHECK). Use introspection only.

**Step 2: Run check**

```bash
make check-supabase-deep
```

Expected: POS column check passes; constraint check passes (or is at least informational if the RPC isn't available).

**Step 3: Commit**

```bash
git add scripts/check-supabase-deep.ts
git commit -m "$(cat <<'EOF'
feat: check-supabase-deep verifies learning_items.pos column + constraint

Adds verification that the POS column exists and the CHECK constraint
is enforced. Also reports per-POS distribution for backfill visibility.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A.3: Extend LearningItem TypeScript type

**Files:**
- Modify: `src/types/learning.ts`
- Modify: test fixtures that construct `LearningItem` inline (enumerated in Step 0)

**Step 0: Enumerate test fixtures that need `pos: null` added**

```bash
grep -rln "item_type: 'word'\|item_type: 'phrase'\|item_type: 'sentence'\|item_type: 'dialogue_chunk'" src/__tests__ src/**/*.test.ts src/**/*.test.tsx
```

Expected output: list of files that construct `LearningItem` fixtures inline. Known candidates from earlier review:
- `src/__tests__/sessionQueue.test.ts` (makeItem helper — one fix covers many tests)
- `src/__tests__/mcqWrongAnswer.test.tsx` (`learningItem` const at module scope)
- `src/__tests__/cuedRecallExercise.test.tsx` (inline literal)
- `src/__tests__/contrastPairExercise.test.ts` (inline literal)
- `src/__tests__/sentenceTransformationExercise.test.ts` (inline literal)
- `src/__tests__/constrainedTranslationExercise.test.ts` (inline literal)

Each fixture will need `pos: null` added to stay typeable after the interface change.

**Step 1: Add the POS type and extend LearningItem**

Find the `LearningItem` interface in `src/types/learning.ts` and add:

```ts
export type POS =
  | 'verb' | 'noun' | 'adjective' | 'adverb' | 'pronoun'
  | 'numeral' | 'classifier' | 'preposition' | 'conjunction'
  | 'particle' | 'question_word' | 'greeting'

export interface LearningItem {
  // ... existing fields ...
  pos: POS | null
}
```

If `LearningItem` uses `snake_case` in the DB column naming (likely, given it matches Supabase rows), the field is `pos: POS | null` — lowercase matches the column name directly.

**Step 2: Run typecheck**

```bash
bun run build
# or tsc --noEmit if a dedicated script exists
```

Expected: passes. If existing tests fabricate `LearningItem` instances without `pos`, they'll need `pos: null` added — fix those test fixtures.

**Step 3: Commit**

Stage the type change plus only the fixture files that actually needed `pos: null` from Step 0 — avoid a broad `src/__tests__/` glob that could stage unrelated WIP:

```bash
git add src/types/learning.ts
git add src/__tests__/sessionQueue.test.ts      # if touched
git add src/__tests__/mcqWrongAnswer.test.tsx   # if touched
git add src/__tests__/cuedRecallExercise.test.tsx   # if touched
git add src/__tests__/contrastPairExercise.test.ts  # if touched
git add src/__tests__/sentenceTransformationExercise.test.ts  # if touched
git add src/__tests__/constrainedTranslationExercise.test.ts  # if touched
# add others discovered by the Step 0 grep
git commit -m "$(cat <<'EOF'
feat: add POS type and LearningItem.pos field

Nullable pos column typed as a 12-value string literal union. Existing
fixtures updated to include pos: null where LearningItem is constructed
in tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Semantic-groups expansion and extraction

This phase is independent of Phase A and can land first. It also benefits `makeRecognitionMCQ` immediately without waiting for POS.

### Task B.1: Extract getSemanticGroup into its own module

**Files:**
- Create: `src/lib/semanticGroups.ts`
- Modify: `src/lib/sessionQueue.ts` (remove the SEMANTIC_GROUPS arrays and getSemanticGroup, re-export from new module for back-compat inside sessionQueue)

**Step 0: Verify no external importers**

```bash
grep -rln "SEMANTIC_GROUPS_NL\|SEMANTIC_GROUPS_EN\|getSemanticGroup" src scripts
```

Expected: only `src/lib/sessionQueue.ts` references these (they're module-private today). If the grep surfaces other files, update their imports in Step 1 alongside the move.

**Step 1: Move SEMANTIC_GROUPS_NL, SEMANTIC_GROUPS_EN, getSemanticGroup to a new module**

Create `src/lib/semanticGroups.ts` containing the three constants from `sessionQueue.ts:485–530`:

```ts
// src/lib/semanticGroups.ts
// Keyword-based semantic grouping for MCQ distractor selection.
// See docs/plans/2026-04-17-pos-aware-distractors-design.md for rationale
// and the scaling plan.

export const SEMANTIC_GROUPS_NL: Array<{ name: string; keywords: string[] }> = [
  // ... move the array verbatim from sessionQueue.ts:485–501 ...
]

export const SEMANTIC_GROUPS_EN: Array<{ name: string; keywords: string[] }> = [
  // ... move the array verbatim from sessionQueue.ts:503–519 ...
]

export function getSemanticGroup(translation: string, language: 'en' | 'nl'): string | null {
  const lower = translation.toLowerCase()
  const groups = language === 'nl' ? SEMANTIC_GROUPS_NL : SEMANTIC_GROUPS_EN
  for (const group of groups) {
    if (group.keywords.some(kw => lower.includes(kw))) {
      return group.name
    }
  }
  return null
}
```

In `src/lib/sessionQueue.ts`, replace the three moved definitions with a re-export at the top of the file (near other imports):

```ts
import { SEMANTIC_GROUPS_NL, SEMANTIC_GROUPS_EN, getSemanticGroup } from '@/lib/semanticGroups'
```

Keep the internal usage of `getSemanticGroup` unchanged (it's now the imported function).

**Step 2: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: all existing tests still pass — this is a pure refactor.

**Step 3: Commit**

```bash
git add src/lib/semanticGroups.ts src/lib/sessionQueue.ts
git commit -m "$(cat <<'EOF'
refactor: extract semantic groups into src/lib/semanticGroups.ts

Move SEMANTIC_GROUPS_NL/EN and getSemanticGroup into a dedicated module.
Pure refactor — no behavior change. Enables dedicated semanticGroups.test.ts
coverage and better file-by-responsibility structure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B.2: Add abstract-concept groups + regression test

**Files:**
- Modify: `src/lib/semanticGroups.ts`
- Create: `src/__tests__/semanticGroups.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/semanticGroups.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getSemanticGroup } from '@/lib/semanticGroups'

describe('getSemanticGroup — new abstract groups', () => {
  it('classifies "love" (EN) as emotions', () => {
    expect(getSemanticGroup('love', 'en')).toBe('emotions')
  })
  it('classifies "liefde" (NL) as emotions', () => {
    expect(getSemanticGroup('liefde', 'nl')).toBe('emotions')
  })
  it('classifies "think" (EN) as mental_states', () => {
    expect(getSemanticGroup('think', 'en')).toBe('mental_states')
  })
  it('classifies "denken" (NL) as mental_states', () => {
    expect(getSemanticGroup('denken', 'nl')).toBe('mental_states')
  })
  it('classifies "waarheid" (NL) as abstract_concepts', () => {
    expect(getSemanticGroup('waarheid', 'nl')).toBe('abstract_concepts')
  })
  it('classifies "freedom" (EN) as abstract_concepts', () => {
    expect(getSemanticGroup('freedom', 'en')).toBe('abstract_concepts')
  })
})

describe('getSemanticGroup — pre-existing behavior preserved', () => {
  it('food keywords still match food', () => {
    expect(getSemanticGroup('rijst', 'nl')).toBe('food')
    expect(getSemanticGroup('rice', 'en')).toBe('food')
  })
  it('concrete nouns do not match abstract groups', () => {
    expect(getSemanticGroup('huis', 'nl')).toBe('places')
    expect(getSemanticGroup('rice', 'en')).toBe('food')
    // neither should match emotions/mental_states/abstract_concepts
  })
})

describe('getSemanticGroup — known pre-existing bug (regression guard)', () => {
  it('"maandag" (NL) matches greetings due to .includes("dag") — pre-existing bug', () => {
    // The greetings group's "dag" keyword is a substring of weekday names.
    // This test asserts the buggy current behavior so a future fix is
    // intentional, not accidental. See
    // docs/plans/2026-04-17-pos-aware-distractors-design.md §Disambiguation note.
    expect(getSemanticGroup('maandag', 'nl')).toBe('greetings')
  })
})
```

**Step 2: Run test, confirm new-group tests fail**

```bash
bun run test src/__tests__/semanticGroups.test.ts
```

Expected: the six new-group tests fail (groups don't exist yet). Pre-existing-behavior tests and the regression-guard pass.

**Step 3: Add the three new groups**

Append to `SEMANTIC_GROUPS_NL` in `src/lib/semanticGroups.ts`:

```ts
{ name: 'emotions', keywords: ['liefde', 'haat', 'blij', 'verdrietig', 'bang', 'boos', 'zorg', 'hoop', 'jaloers', 'gelukkig', 'ongelukkig', 'woede', 'angst', 'vreugde'] },
{ name: 'mental_states', keywords: ['denken', 'herinneren', 'vergeten', 'weten', 'begrijpen', 'geloven', 'overwegen', 'menen', 'besluiten', 'twijfel'] },
{ name: 'abstract_concepts', keywords: ['vrijheid', 'waarheid', 'probleem', 'idee', 'reden', 'betekenis', 'mening', 'gedachte', 'recht', 'plicht'] },
```

Append to `SEMANTIC_GROUPS_EN`:

```ts
{ name: 'emotions', keywords: ['love', 'hate', 'happy', 'sad', 'fear', 'afraid', 'anger', 'angry', 'worry', 'hope', 'jealous', 'joyful', 'sorrow', 'pleasure'] },
{ name: 'mental_states', keywords: ['think', 'remember', 'forget', 'know', 'understand', 'believe', 'consider', 'decide', 'doubt', 'opinion'] },
{ name: 'abstract_concepts', keywords: ['freedom', 'truth', 'problem', 'idea', 'reason', 'meaning', 'opinion', 'thought', 'right', 'duty'] },
```

Order matters: append to the end so existing concrete-noun keyword matches remain stable (first-match-wins).

**Step 4: Run tests**

```bash
bun run test src/__tests__/semanticGroups.test.ts
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/lib/semanticGroups.ts src/__tests__/semanticGroups.test.ts
git commit -m "$(cat <<'EOF'
feat: add emotions, mental_states, abstract_concepts semantic groups

Extend SEMANTIC_GROUPS_NL and SEMANTIC_GROUPS_EN with three abstract
classes. Existing recognition_mcq cascade benefits immediately: abstract
targets now match these groups in Tier 1 instead of falling to same-level
random (which historically mixed concrete nouns into abstract distractors).

Also regression-guards the pre-existing "maandag matches greetings" bug
so a future fix is deliberate rather than silent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Cascade helper extraction

Pure refactor. The new helper is dead code until Phase F wires it up.

### Task C.1: Extract pickDistractorCascade helper

**Files:**
- Modify: `src/lib/sessionQueue.ts` (add the helper; leave `makeRecognitionMCQ`'s inline cascade in place — Phase F replaces it)

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
import { pickDistractorCascade } from '@/lib/sessionQueue'
import type { DistractorCandidate } from '@/lib/sessionQueue'

describe('pickDistractorCascade — tier behavior', () => {
  const target = { itemType: 'word', pos: 'verb' as const, level: 'A1', semanticGroup: 'mental_states' as const }

  it('Tier 0 hit — all 3 matches come from same POS + same group', () => {
    const pool: DistractorCandidate[] = [
      { id: 'a', option: 'ingat',   itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' },
      { id: 'b', option: 'lupa',    itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' },
      { id: 'c', option: 'tahu',    itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' },
      { id: 'd', option: 'nasi',    itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: 'food' },
    ]
    const result = pickDistractorCascade(target, pool, 3)
    expect(result).toHaveLength(3)
    expect(result).toEqual(expect.arrayContaining(['ingat', 'lupa', 'tahu']))
    expect(result).not.toContain('nasi')
  })

  it('POS-null target falls through Tiers 0–2, starts at Tier 3', () => {
    const nullTarget = { ...target, pos: null }
    const pool: DistractorCandidate[] = [
      { id: 'a', option: 'x', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' },
      { id: 'b', option: 'y', itemType: 'word', pos: 'noun', level: 'A1', semanticGroup: 'mental_states' },
      { id: 'c', option: 'z', itemType: 'word', pos: null,   level: 'A1', semanticGroup: 'mental_states' },
    ]
    const result = pickDistractorCascade(nullTarget, pool, 3)
    expect(result).toHaveLength(3)  // all 3 hit Tier 3 (same shape + same group)
  })

  it('candidate with pos=null never appears in Tiers 0–2 when target has POS', () => {
    const sparsePool: DistractorCandidate[] = [
      { id: 'a', option: 'pos-null', itemType: 'word', pos: null,   level: 'A1', semanticGroup: 'mental_states' },
      { id: 'b', option: 'pos-verb', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' },
    ]
    const result = pickDistractorCascade(target, sparsePool, 2)
    // pos-verb must come first (Tier 0); pos-null only reachable via Tiers 3+
    expect(result[0]).toBe('pos-verb')
  })

  it('structural-shape filter honored — sentence target never gets word distractor', () => {
    const sentenceTarget = { itemType: 'sentence', pos: null, level: 'A1', semanticGroup: null }
    const pool: DistractorCandidate[] = [
      { id: 'w', option: 'word-only', itemType: 'word', pos: null, level: 'A1', semanticGroup: null },
    ]
    const result = pickDistractorCascade(sentenceTarget, pool, 3)
    expect(result).toHaveLength(0)  // no structurally similar candidate
  })

  it('dedupe — candidate matching multiple tiers only appears once', () => {
    const pool: DistractorCandidate[] = [
      // Matches Tier 0 AND would also match Tier 1.
      { id: 'a', option: 'x', itemType: 'word', pos: 'verb', level: 'A1', semanticGroup: 'mental_states' },
    ]
    const result = pickDistractorCascade(target, pool, 3)
    expect(result).toEqual(['x'])  // not ['x', 'x']
  })
})
```

**Step 2: Run tests, confirm failure**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: all new tests fail — `pickDistractorCascade` doesn't exist.

**Step 3: Implement the helper**

In `src/lib/sessionQueue.ts`, add after the `STRUCTURALLY_SIMILAR_TYPES` constant (around line 549):

```ts
export interface DistractorCandidate {
  id: string
  option: string
  itemType: string
  pos: string | null
  level: string
  semanticGroup: string | null
}

/** @internal exported for tests */
export function pickDistractorCascade(
  target: { itemType: string; pos: string | null; level: string; semanticGroup: string | null },
  pool: DistractorCandidate[],
  count: number,
): string[] {
  const allowedTypes = STRUCTURALLY_SIMILAR_TYPES[target.itemType] ?? [target.itemType]
  const structuralPool = pool.filter(c => allowedTypes.includes(c.itemType))

  const selected = new Map<string, string>()  // id → option, for dedupe by id
  const selectedOptions = new Set<string>()    // also dedupe by option text

  const addFromTier = (candidates: DistractorCandidate[]) => {
    for (const c of shuffle([...candidates])) {
      if (selected.size >= count) return
      if (selected.has(c.id)) continue
      if (selectedOptions.has(c.option)) continue
      selected.set(c.id, c.option)
      selectedOptions.add(c.option)
    }
  }

  const tier0 = target.pos && target.semanticGroup
    ? structuralPool.filter(c => c.pos === target.pos && c.semanticGroup === target.semanticGroup)
    : []
  const tier1 = target.pos
    ? structuralPool.filter(c => c.pos === target.pos && c.level === target.level)
    : []
  const tier2 = target.pos
    ? structuralPool.filter(c => c.pos === target.pos)
    : []
  const tier3 = target.semanticGroup
    ? structuralPool.filter(c => c.semanticGroup === target.semanticGroup)
    : []
  const tier4 = structuralPool.filter(c => c.level === target.level)
  const tier5 = pool  // full pool fallback, ignores structural filter

  addFromTier(tier0)
  addFromTier(tier1)
  addFromTier(tier2)
  addFromTier(tier3)
  addFromTier(tier4)
  addFromTier(tier5)

  return [...selected.values()]
}
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: all new tests pass; existing tests still pass.

**Step 5: Commit**

```bash
git add src/lib/sessionQueue.ts src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: extract pickDistractorCascade helper

Shared distractor-selection cascade used by runtime MCQ builders.
Six-tier fallback: POS+group → POS+level → POS → group → level → full pool.
Honors STRUCTURALLY_SIMILAR_TYPES across all tiers except the full-pool
fallback. Dedupes by candidate id and option text.

Dead code until Phase F wires the three make* functions to use it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Pipeline changes

Must land before lesson 9 publishes; see design doc §Backfill sequencing.

### Task D.1: Update catalog-lesson-sections.ts to tag POS

**Files:**
- Modify: `scripts/catalog-lesson-sections.ts`

**Step 1: Read the existing prompt structure**

```bash
less scripts/catalog-lesson-sections.ts
```

Locate the LLM prompt (usually a large template string near the top) and the per-item output schema description.

**Step 2: Extend the prompt**

Add to the item-level schema instructions in the prompt:

```
For every vocabulary, expression, or number item you extract, include a "pos"
field with one of these 12 values:

  verb, noun, adjective, adverb, pronoun, numeral, classifier,
  preposition, conjunction, particle, question_word, greeting

Rules for choosing POS:
- Use the POS of the primary translation's meaning. If "makan" is taught as
  "to eat" (verb), pos is "verb". If the same form were taught as "meal"
  (noun), pos would be "noun" — POS is per-item, not per-word.
- For phrase items, use the head-word's POS (e.g. "selamat pagi" → "greeting"
  because it's an idiomatic greeting; "buah jeruk" → "noun" because jeruk
  is the head).
- For sentence and dialogue_chunk items, set pos to null — POS is a
  word-level property.
- Classifiers (orang, ekor, buah used as counters) are a distinct class.
- Question words (apa, siapa, mana, kapan, bagaimana, berapa) are a
  distinct class even though they grammatically function as pronouns/adverbs.
```

**Step 3: Add a post-response validator**

After the LLM response is parsed, iterate items and check the `pos` field is in the allowed set. If not, log a warning and set `pos` to `null`:

```ts
const VALID_POS = new Set([
  'verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
  'classifier', 'preposition', 'conjunction', 'particle',
  'question_word', 'greeting',
])

for (const section of catalog.sections ?? []) {
  for (const item of section.items ?? []) {
    if (item.pos != null && !VALID_POS.has(item.pos)) {
      console.warn(`Invalid POS "${item.pos}" on item "${item.base_text}" — setting to null`)
      item.pos = null
    }
  }
}
```

**Step 4: Test against a known lesson**

```bash
bun scripts/catalog-lesson-sections.ts 8 --force
```

Expected: `sections-catalog.json` for lesson 8 now includes `pos` on vocabulary/expression/number items; sentence/dialogue items have `pos: null` or no field.

**Step 5: Commit**

```bash
git add scripts/catalog-lesson-sections.ts
git commit -m "$(cat <<'EOF'
feat: catalog-lesson-sections.ts tags POS per item

LLM prompt extended with 12-value POS taxonomy and per-item rules.
Post-response validator rejects invalid values (set to null, warn to
stdout). Sentence/dialogue items always null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D.2: Update generate-staging-files.ts to propagate POS

**Files:**
- Modify: `scripts/generate-staging-files.ts`

**Step 1: Locate the item-copy loop**

Find where the script iterates catalog items and writes `learning-items.ts`. The existing code copies fields like `base_text`, `item_type`, `translation_nl`, etc. into each staging object.

**Step 2: Add pos to the copy**

For each item added to the `learningItems` array that gets written to `learning-items.ts`, include `pos` from the catalog item:

```ts
const stagingItem: Record<string, unknown> = {
  base_text: catalogItem.base_text,
  item_type: catalogItem.item_type,
  // ... existing fields ...
  review_status: catalogItem.review_status ?? 'published',
}
if (catalogItem.pos) stagingItem.pos = catalogItem.pos  // omit if null to keep staging files clean
```

Omitting when null keeps the staging JSON tidy (sentence items don't get a dangling `pos: null` line). The publish script treats missing field as null.

**Step 3: Regenerate staging for lesson 8**

```bash
bun scripts/generate-staging-files.ts 8
```

Inspect `scripts/data/staging/lesson-8/learning-items.ts` — word/phrase items should now have `pos` fields; sentence items should not.

**Step 4: Commit**

```bash
git add scripts/generate-staging-files.ts
git commit -m "$(cat <<'EOF'
feat: generate-staging-files.ts propagates pos from catalog to staging

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D.3: Add publish-approved-content.ts quality gates

**Files:**
- Modify: `scripts/publish-approved-content.ts`
- Create: `scripts/lib/validate-pos.ts` (extracted pure helper for unit testing)
- Create: `scripts/__tests__/validate-pos.test.ts` (unit tests on the helper)

**Step 0: Extract the gate logic into a pure helper**

So the gate logic is unit-testable without invoking the full publish flow, extract to `scripts/lib/validate-pos.ts`:

```ts
// scripts/lib/validate-pos.ts
export const VALID_POS = new Set([
  'verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
  'classifier', 'preposition', 'conjunction', 'particle',
  'question_word', 'greeting',
])

export interface POSValidationResult {
  warnings: string[]    // WARNING messages — non-blocking
  criticalErrors: string[]  // CRITICAL — abort publish
  coverage: Record<string, number>  // per-POS count for word/phrase items
}

export interface StagingItem {
  base_text: string
  item_type: string
  pos?: string | null
}

export function validatePOS(items: StagingItem[]): POSValidationResult {
  const warnings: string[] = []
  const criticalErrors: string[] = []
  const coverage: Record<string, number> = {}

  for (const item of items) {
    // Gate 1: missing POS on word/phrase → WARNING
    if ((item.item_type === 'word' || item.item_type === 'phrase') && !item.pos) {
      warnings.push(`[POS-missing] Item "${item.base_text}" (${item.item_type}) has no POS`)
    }
    // Gate 2: invalid POS value → CRITICAL
    if (item.pos != null && !VALID_POS.has(item.pos)) {
      criticalErrors.push(`[POS-invalid] Item "${item.base_text}" has invalid pos="${item.pos}"`)
    }
    // Gate 3: coverage counts
    if (item.item_type === 'word' || item.item_type === 'phrase') {
      const key = item.pos ?? 'null'
      coverage[key] = (coverage[key] ?? 0) + 1
    }
  }

  return { warnings, criticalErrors, coverage }
}
```

**Step 1: Unit tests**

`scripts/__tests__/validate-pos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validatePOS } from '../lib/validate-pos'

describe('validatePOS', () => {
  it('emits WARNING for word/phrase without pos', () => {
    const result = validatePOS([{ base_text: 'makan', item_type: 'word' }])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('makan')
  })

  it('emits CRITICAL for invalid pos value', () => {
    const result = validatePOS([{ base_text: 'x', item_type: 'word', pos: 'not_a_pos' }])
    expect(result.criticalErrors).toHaveLength(1)
  })

  it('accepts all 12 taxonomy values', () => {
    const all = ['verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
      'classifier', 'preposition', 'conjunction', 'particle',
      'question_word', 'greeting']
    for (const pos of all) {
      const result = validatePOS([{ base_text: 'x', item_type: 'word', pos }])
      expect(result.criticalErrors).toHaveLength(0)
    }
  })

  it('omits sentence/dialogue_chunk items from warnings', () => {
    const result = validatePOS([{ base_text: 'S', item_type: 'sentence' }])
    expect(result.warnings).toHaveLength(0)
  })

  it('aggregates coverage by pos', () => {
    const result = validatePOS([
      { base_text: 'a', item_type: 'word', pos: 'verb' },
      { base_text: 'b', item_type: 'word', pos: 'verb' },
      { base_text: 'c', item_type: 'word', pos: 'noun' },
      { base_text: 'd', item_type: 'word' },
    ])
    expect(result.coverage).toEqual({ verb: 2, noun: 1, null: 1 })
  })
})
```

**Step 2: Use the helper in publish-approved-content.ts**

**Step 1: Locate the learning_items insert/upsert**

Find the block that iterates `learningItems` and calls Supabase upsert.

**Step 2: Use the helper in publish-approved-content.ts**

```ts
import { validatePOS } from './lib/validate-pos'

// ... inside the publish flow, before the upsert:
const { warnings, criticalErrors, coverage } = validatePOS(learningItems)

for (const w of warnings) console.warn(w)
if (criticalErrors.length > 0) {
  for (const e of criticalErrors) console.error(e)
  console.error('Aborting publish due to invalid POS values.')
  process.exit(1)
}

// ... after the upsert:
console.log(`[POS-coverage] Lesson ${lessonNumber} word/phrase items by POS:`)
for (const [pos, count] of Object.entries(coverage).sort()) {
  console.log(`  ${pos}: ${count}`)
}
```

**Step 3: Dry-run against lesson 8**

```bash
bun scripts/publish-approved-content.ts 8 --dry-run
```

Expected: WARNINGs for any current lesson-8 items without POS (there are many — none are tagged yet); no CRITICAL because no invalid values are present; coverage report at end.

**Step 4: Commit**

```bash
git add scripts/publish-approved-content.ts
git commit -m "$(cat <<'EOF'
feat: publish-approved-content.ts enforces POS quality gates

Three gates on the learning_items path:
1. WARNING for word/phrase items without pos (non-blocking)
2. CRITICAL (exit non-zero) for invalid pos values outside the 12-value set
3. Post-publish per-POS coverage report

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D.4: Update linguist-reviewer agent

**Files:**
- Modify: `.claude/agents/linguist-reviewer.md`

**Step 1: Read the current agent config**

```bash
cat .claude/agents/linguist-reviewer.md
```

Locate the checks section for staging file validation.

**Step 2: Add POS checks**

Append to the agent's checklist:

```
### POS validation on learning-items.ts

- **WARNING**: any item with `item_type` in (`word`, `phrase`) that has no
  `pos` field or has `pos: null`. Degrades distractor quality. Non-blocking.
- **CRITICAL**: any item with `pos` value outside the 12-value taxonomy
  {verb, noun, adjective, adverb, pronoun, numeral, classifier, preposition,
  conjunction, particle, question_word, greeting}. Blocks publishing.
```

**Step 3: Manually invoke the reviewer on lesson 8**

Run the reviewer and inspect its `review-report.json`. Expected: WARNINGs on all word/phrase items (none are tagged yet — intentional pre-backfill state).

**Step 4: Commit**

```bash
git add .claude/agents/linguist-reviewer.md
git commit -m "$(cat <<'EOF'
chore: linguist-reviewer validates POS on learning-items.ts

WARNING for missing pos on word/phrase items; CRITICAL for invalid values.
Matches the publish-approved-content.ts quality gates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D.5: Update CLAUDE.md pipeline documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the "Content Management" section**

Three updates:

1. In the "Adding a new lesson (lessons 4+)" Step 3 description (LLM section catalog), add: "Items now include a `pos` field tagged from the 12-value taxonomy. Sentence/dialogue items have `pos: null`."

2. In the "Staging files reference" table, `learning-items.ts` row: update the description to mention `pos` per word/phrase item.

3. In the `content-seeder` failure-mapping bullet list, add:
   - `Invalid POS value in staging → linguist-structurer (re-run catalog)`

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: CLAUDE.md documents POS in the content pipeline

Covers catalog tagging, staging propagation, and the new content-seeder
routing rule for invalid POS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Backfill

### Task E.1: Author scripts/backfill-pos.ts

**Files:**
- Create: `scripts/backfill-pos.ts`
- Create (optional): `.backfill-pos-progress.json` (gitignored — a runtime checkpoint file)

**Step 1: Implement the script**

The script follows the existing pattern in `scripts/publish-approved-content.ts`:
- `createClient` with `SUPABASE_SERVICE_KEY`
- `NODE_TLS_REJECT_UNAUTHORIZED=0` for homelab internal CA
- Flags: `--dry-run`, `--csv <path>`, `--max-items <N>` (safety cap), `--resume` (use checkpoint file)

**Safety guardrails required:**
1. **Max-items cap**: a `--max-items` flag; if unset, default to 200 (forces explicit opt-in to large runs). Prevents a runaway script from classifying the whole 1,200-item corpus accidentally.
2. **Checkpoint file**: write `/tmp/pos-backfill-progress.json` after each batch completes with `{ lastCompletedBatchIndex: N, processedIds: [...] }`. On re-run with `--resume`, skip already-processed IDs. Resumable after a network blip.
3. **Retry on parse failure**: if `parseBatchResponse` fails, retry the batch once with a stricter reprompt ("JSON only, no prose"). If it fails again, log the batch IDs and skip — don't drop silently.
4. **Interactive confirmation between dry-run and live**: no automatic escalation. The operator must re-run without `--dry-run` after reviewing the CSV; the script does not prompt y/n itself (simpler, matches other homelab scripts).
5. **Model slug**: verify `claude-sonnet-4-6` against the project's other Anthropic SDK usage (`grep -rn "claude-" scripts src`). Use the same slug the rest of the codebase uses at the time of implementation. If the slug has changed, use the current one.

Script structure:

```ts
// scripts/backfill-pos.ts
// Tag learning_items.pos for existing word/phrase items via Claude classification.
// See docs/plans/2026-04-17-pos-aware-distractors-design.md §Backfill.

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'fs'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const VALID_POS = [
  'verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
  'classifier', 'preposition', 'conjunction', 'particle',
  'question_word', 'greeting',
] as const

const BATCH_SIZE = 40
const DRY_RUN = process.argv.includes('--dry-run')
const CSV_PATH = (() => {
  const i = process.argv.indexOf('--csv')
  return i > -1 ? process.argv[i + 1] : null
})()

async function main() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // 1. Query eligible items
  const { data: items } = await supabase.schema('indonesian')
    .from('learning_items')
    .select('id, base_text, item_type')
    .is('pos', null)
    .in('item_type', ['word', 'phrase'])
    .limit(10000)
  if (!items || items.length === 0) {
    console.log('No items to backfill.')
    return
  }

  // 2. Fetch primary meanings for each item
  const itemIds = items.map(i => i.id)
  const { data: meanings } = await supabase.schema('indonesian')
    .from('item_meanings')
    .select('learning_item_id, translation_text, translation_language, is_primary')
    .in('learning_item_id', itemIds)
  const primaryMeaning = (itemId: string, lang: 'en' | 'nl'): string => {
    const itemMeanings = (meanings ?? []).filter(m => m.learning_item_id === itemId)
    const primary = itemMeanings.find(m => m.translation_language === lang && m.is_primary)
    return primary?.translation_text ?? itemMeanings.find(m => m.translation_language === lang)?.translation_text ?? ''
  }

  // 3. Batch and classify
  const results: Array<{ id: string; base_text: string; pos: string | null }> = []
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const prompt = buildPrompt(batch.map(it => ({
      id: it.id,
      base_text: it.base_text,
      item_type: it.item_type,
      translation_nl: primaryMeaning(it.id, 'nl'),
      translation_en: primaryMeaning(it.id, 'en'),
    })))

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = response.content[0]
    if (content.type !== 'text') {
      console.error('Unexpected response shape, skipping batch')
      continue
    }
    const parsed = parseBatchResponse(content.text, batch)  // returns Array<{id, pos}>
    for (const r of parsed) {
      const valid = r.pos && (VALID_POS as readonly string[]).includes(r.pos)
      const finalPos = valid ? r.pos : null
      const item = batch.find(b => b.id === r.id)!
      results.push({ id: r.id, base_text: item.base_text, pos: finalPos })
    }
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} items classified`)
  }

  // 4. Output CSV if requested
  if (CSV_PATH) {
    const rows = ['id,base_text,pos', ...results.map(r => `${r.id},"${r.base_text.replace(/"/g, '""')}",${r.pos ?? ''}`)]
    writeFileSync(CSV_PATH, rows.join('\n'))
    console.log(`Wrote ${results.length} rows to ${CSV_PATH}`)
  }

  // 5. Write to DB unless dry-run
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would update ${results.filter(r => r.pos).length} items`)
  } else {
    for (const r of results) {
      if (!r.pos) continue
      await supabase.schema('indonesian').from('learning_items').update({ pos: r.pos }).eq('id', r.id)
    }
    console.log(`Updated ${results.filter(r => r.pos).length} items`)
  }

  // 6. Coverage summary
  const counts: Record<string, number> = {}
  for (const r of results) counts[r.pos ?? 'null'] = (counts[r.pos ?? 'null'] ?? 0) + 1
  console.log('Coverage:')
  for (const [pos, count] of Object.entries(counts).sort()) console.log(`  ${pos}: ${count}`)
}

// Helpers — buildPrompt, parseBatchResponse — inline or in scripts/lib/
// ... (spec the implementer fills in; prompt should describe the 12-value
//      taxonomy and ask for a strict JSON array response of {id, pos})

main().catch(e => { console.error(e); process.exit(1) })
```

Helper functions `buildPrompt` and `parseBatchResponse` are left as scaffolding — implementer fills in. The prompt should:
- State the 12-value taxonomy with brief definitions
- Provide 2–3 tagged examples (e.g. "makan (to eat) → verb", "rumah (house) → noun")
- Instruct Claude to return JSON array only, no prose: `[{"id": "...", "pos": "..."}]`
- `parseBatchResponse` attempts JSON.parse; on failure, log and return empty array for that batch.

**Step 2: Dry-run**

```bash
bun scripts/backfill-pos.ts --dry-run --csv /tmp/pos-backfill.csv
```

Expected: CSV written; per-POS counts printed; no DB writes.

**Step 3: Spot-check the CSV**

Manually review `/tmp/pos-backfill.csv` — scan for obvious errors. Common concerns: classifier words (orang, ekor, buah) tagged as noun instead of classifier; question words (apa, siapa) tagged as pronoun.

If errors are frequent, tune the prompt and re-run dry-run.

**Step 4: Live run**

```bash
bun scripts/backfill-pos.ts
```

**Step 5: Verify**

```bash
make check-supabase-deep
```

Expected: POS distribution shows non-zero counts in major categories (verb, noun, adjective).

**Step 6: Commit**

```bash
git add scripts/backfill-pos.ts
git commit -m "$(cat <<'EOF'
feat: backfill-pos.ts tags existing learning_items via Claude

One-shot script to populate learning_items.pos for word/phrase items that
currently have pos=null. Batches of 40 sent to Claude Sonnet; response
validated against the 12-value taxonomy; invalid values logged and skipped.
Dry-run and CSV-export modes for pre-write review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — Runtime selection changes

Behavior-changing phase. All three `make*` functions get rewired to use `pickDistractorCascade`.

### Task F.1: Rewire makeRecognitionMCQ

**Files:**
- Modify: `src/lib/sessionQueue.ts:551–601`

**Step 1: Write the failing tests**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
it('makeRecognitionMCQ uses POS filter when pos is set — Tier 0 hit', () => {
  // Construct allItems with: target verb (pos='verb', semantic group matches),
  // 3 same-POS same-group candidates, 3 different-POS same-group candidates.
  // Run buildSessionQueue; assert the selected distractors are all from the
  // same-POS pool.
})

it('makeRecognitionMCQ preserves structural filter — word target never gets sentence distractor', () => {
  // Construct allItems with: target word, pool containing both word and
  // sentence items at the same level. Regression guard on
  // STRUCTURALLY_SIMILAR_TYPES behavior — the cascade helper from Phase C
  // honors it, but this test asserts the wiring didn't accidentally bypass it.
})
```

**Step 2: Run test, confirm failure (the current code ignores POS entirely)**

**Step 3: Rewrite makeRecognitionMCQ**

Replace the inline cascade in `sessionQueue.ts:577–600` with a call to `pickDistractorCascade`:

```ts
function makeRecognitionMCQ(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = primaryMeaning?.translation_text ?? ''

  // Build candidate pool with POS + semantic group per candidate
  const pool: DistractorCandidate[] = allItems
    .filter(i => i.id !== item.id)
    .flatMap(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      if (!t || t === correctAnswer) return []
      return [{
        id: i.id,
        option: t,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: getSemanticGroup(t, userLanguage),
      }]
    })

  const target = {
    itemType: item.item_type,
    pos: item.pos ?? null,
    level: item.level,
    semanticGroup: getSemanticGroup(correctAnswer, userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3)

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'recognition_mcq',
    distractors,
  }
}
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

Expected: all tests pass (old cascade tests for recognition_mcq + new Tier 0 test).

**Step 5: Commit**

```bash
git add src/lib/sessionQueue.ts src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: makeRecognitionMCQ uses pickDistractorCascade with POS filter

Inline 4-tier cascade replaced with the shared 6-tier helper from Phase C.
Adds Tier 0 (same POS + same semantic group) and Tier 1 (same POS + same
level) above the existing tiers. Null POS falls through gracefully.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task F.2: Rewire makeCuedRecall

**Files:**
- Modify: `src/lib/sessionQueue.ts:635–671`
- Modify: `src/lib/sessionQueue.ts:411, 421, 473` (call sites)

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
it('makeCuedRecall filters distractors by POS when pos is set', () => {
  // Construct allItems with: target verb, 3 same-POS candidates, 3 noun candidates.
  // Drive buildSessionQueue to route through makeCuedRecall (anchoring stage, roll < 0.25).
  // Assert distractors are all verbs.
})
```

**Step 2: Rewrite makeCuedRecall signature and body**

Update the signature to take `meaningsByItem`:

```ts
function makeCuedRecall(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const promptMeaningText = primaryMeaning?.translation_text ?? ''

  const pool: DistractorCandidate[] = allItems
    .filter(i => i.id !== item.id && i.base_text)
    .map(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      return {
        id: i.id,
        option: i.base_text,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: t ? getSemanticGroup(t, userLanguage) : null,
      }
    })

  const correctTranslation = primaryMeaning?.translation_text ?? ''
  const target = {
    itemType: item.item_type,
    pos: item.pos ?? null,
    level: item.level,
    semanticGroup: getSemanticGroup(correctTranslation, userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3)

  const options = shuffle([item.base_text, ...distractors])

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'meaning_recall',
    exerciseType: 'cued_recall',
    cuedRecallData: {
      promptMeaningText,
      options,
      correctOptionId: item.base_text,
    },
  }
}
```

**Step 3: Update call sites**

At `sessionQueue.ts:411`, `:421`, `:473`, pass `meaningsByItem`:

Before:
```ts
exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems))
```

After:
```ts
exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
```

`meaningsByItem` is already in scope at these call sites (it's a parameter of `selectExercises`).

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/sessionQueue.ts src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: makeCuedRecall uses pickDistractorCascade

Replaces the single-tier same-level random shuffle with the 6-tier
cascade. Distractors now filter by POS + semantic group when available,
falling back to level and full pool for small-pool cases. Signature gains
meaningsByItem so candidate translations can be looked up for semantic
grouping.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task F.3: Rewire makeClozeMcq (runtime)

**Files:**
- Modify: `src/lib/sessionQueue.ts:674–710`
- Modify: `src/lib/sessionQueue.ts:415, 434, 439` (call sites)

**Dependency on Spec 1 Fix 3**: The rewritten function body below omits the `?? contexts.find(c => c.is_anchor_context)` fallback on the cloze-context lookup. That fallback removal is Spec 1 Fix 3 (`docs/plans/2026-04-17-exercise-flow-fixes-impl.md` Task 3.1).

- **If Spec 1 Fix 3 has already landed**: use the body as written below (no fallback).
- **If Spec 1 Fix 3 has not yet landed**: preserve the fallback in this task (keep `?? contexts.find(c => c.is_anchor_context)`). Leave the fallback removal to Spec 1 as originally planned. Each spec stays self-contained and revertible.

The recommended execution order (Spec 1 → Spec 2 → Spec 3 → Spec 4) lands Spec 1 Fix 3 before Spec 2 Phase F, so the body as written is correct. This note exists for the case where order changes.

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
it('makeClozeMcq (runtime) filters distractors by POS when pos is set', () => {
  // Similar to F.2 — construct allItems, drive buildSessionQueue to retrieving
  // stage with anchor context, assert cloze_mcq options are all same-POS.
})

it('makeClozeMcq still returns clozeMcqData: undefined when no cloze context exists', () => {
  // Ensure Phase C helper usage doesn't break the Spec 1 Fix 3 behavior.
})
```

**Step 2: Rewrite makeClozeMcq signature and body**

Same signature change as makeCuedRecall (add `userLanguage` and `meaningsByItem` if not already present; check current signature). Replace the same-level random shuffle with `pickDistractorCascade`:

```ts
function makeClozeMcq(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const clozeContext = contexts.find(c => c.context_type === 'cloze')  // Spec 1 Fix 3

  const pool: DistractorCandidate[] = allItems
    .filter(i => i.id !== item.id && i.base_text)
    .map(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      return {
        id: i.id,
        option: i.base_text,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: t ? getSemanticGroup(t, userLanguage) : null,
      }
    })

  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctTranslation = primaryMeaning?.translation_text ?? ''
  const target = {
    itemType: item.item_type,
    pos: item.pos ?? null,
    level: item.level,
    semanticGroup: getSemanticGroup(correctTranslation, userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3)
  const options = shuffle([item.base_text, ...distractors])

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'cloze_mcq',
    clozeMcqData: clozeContext ? {
      sentence: clozeContext.source_text,
      translation: clozeContext.translation_text,
      options,
      correctOptionId: item.base_text,
    } : undefined,
  }
}
```

**Step 3: Update call sites**

At `sessionQueue.ts:415`, `:434`, `:439`, pass `userLanguage` and `meaningsByItem`:

Before:
```ts
exercises.push(makeClozeMcq(item, meanings, contexts, variants, allItems))
```

After:
```ts
exercises.push(makeClozeMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

**Step 5: Run the full suite as a regression gate**

```bash
bun run test
```

**Step 6: Commit**

```bash
git add src/lib/sessionQueue.ts src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: makeClozeMcq runtime variant uses pickDistractorCascade

Same treatment as makeCuedRecall: the single-tier shuffle is replaced
with the 6-tier POS-aware cascade. Grammar-authored cloze_mcq
(makeGrammarExercise / makePublishedExercise) is untouched — distractors
there come from the linguist pipeline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification

After all phases are committed:

```bash
bun run test                 # full suite green
bun run lint                 # no new lint errors
bun run build                # production build succeeds
make check-supabase-deep     # POS column + constraint + distribution
```

Manual smoke test:
- Dev server: `bun run dev`
- Log in, start a session, observe distractor quality on `cued_recall` and `recognition_mcq` exercises.
- Verify a verb target gets verb distractors, a noun gets nouns, etc.
- Trigger an anchoring-stage cued_recall for a known-tagged item and confirm options share POS.

---

## Summary

| Task | Phase | Description | Commit | Dependencies |
|---|---|---|---|---|
| A.1 | Schema | Add pos column + CHECK | feat: add pos column to learning_items with CHECK constraint | None |
| A.2 | Schema | Health check verification | feat: check-supabase-deep verifies learning_items.pos column + constraint | A.1 |
| A.3 | Schema | LearningItem TypeScript type | feat: add POS type and LearningItem.pos field | A.1 |
| B.1 | Groups | Extract semanticGroups module | refactor: extract semantic groups into src/lib/semanticGroups.ts | None |
| B.2 | Groups | Add 3 abstract groups | feat: add emotions, mental_states, abstract_concepts semantic groups | B.1 |
| C.1 | Helper | Extract pickDistractorCascade | feat: extract pickDistractorCascade helper | A.3, B.1 |
| D.1 | Pipeline | Catalog POS tagging | feat: catalog-lesson-sections.ts tags POS per item | A.1 |
| D.2 | Pipeline | Staging propagation | feat: generate-staging-files.ts propagates pos from catalog to staging | D.1 |
| D.3 | Pipeline | Publish gates | feat: publish-approved-content.ts enforces POS quality gates | A.1 |
| D.4 | Pipeline | Reviewer agent | chore: linguist-reviewer validates POS on learning-items.ts | None |
| D.5 | Pipeline | CLAUDE.md | docs: CLAUDE.md documents POS in the content pipeline | None |
| E.1 | Backfill | Backfill script + run | feat: backfill-pos.ts tags existing learning_items via Claude | A.1, D.3 |
| F.1 | Runtime | Rewire recognition_mcq | feat: makeRecognitionMCQ uses pickDistractorCascade with POS filter | C.1 |
| F.2 | Runtime | Rewire cued_recall | feat: makeCuedRecall uses pickDistractorCascade | C.1 |
| F.3 | Runtime | Rewire cloze_mcq runtime | feat: makeClozeMcq runtime variant uses pickDistractorCascade | C.1 |

### Ordering constraints

- **Phase A blocks Phase E** (backfill) — column must exist.
- **Phase A.3 blocks Phase C.1** — `LearningItem.pos` type must exist before the helper can accept it.
- **Phase B is independent** of A / C / D / E — can land first for immediate `recognition_mcq` benefit.
- **Phase D.1 must land before any new lesson ≥ 9 publishes** — otherwise the new lesson lands untagged.
- **Phase D.3 must land before Phase F** if you want the publish-time safety net active when runtime cascades assume tagged data. Soft dependency — cascade gracefully degrades.
- **Phase F commits** should land one after another in the same session (F.1 → F.2 → F.3), not interleaved with other work, so regressions are localized.

### Estimated session count

- Session 1: Phase A + Phase B (small, independent)
- Session 2: Phase C (single helper) + Phase F (three rewires using the helper)
- Session 3: Phase D (pipeline changes) + Phase E (backfill)

Three sessions total; the ordering above is one defensible sequence.
