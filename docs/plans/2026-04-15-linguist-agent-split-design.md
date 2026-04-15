# Linguist Agent Split — Design

## Problem

The current `linguist-creator` agent has a 432-line spec covering lesson structuring, grammar pattern extraction, web research, 4 exercise types with detailed quality rules, and cloze context generation. This causes:

- **Attention dilution** — exercise quality rules (the most violated part) are buried in a long spec
- **5-7 revision cycles per lesson** — first-pass quality is low because the agent can't internalize all rules simultaneously
- **No distractor authoring for vocab exercises** — recognition_mcq, cued_recall, and vocab cloze_mcq use random distractors at runtime, making exercises trivially easy

## Solution

Split the single creator into 4 focused agents. Add a new Vocab Exercise Creator for distractor authoring.

```
                    sections-catalog.json
                           │
                    ┌──────▼──────┐
                    │  Structurer  │
                    └──────┬──────┘
                           │
                    pattern-brief.json
                    lesson.ts
                    grammar-patterns.ts
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐ ┌────────────┐ ┌──────────┐
     │  Grammar   │ │   Vocab    │ │  Cloze   │
     │  Exercise  │ │  Exercise  │ │ Creator  │
     │  Creator   │ │  Creator   │ │          │
     └─────┬──────┘ └─────┬──────┘ └────┬─────┘
           │              │             │
     candidates.ts  vocab-enrichments.ts  cloze-contexts.ts
           │              │             │
           └──────────────┼─────────────┘
                          ▼
                   ┌────────────┐
                   │  Reviewer   │
                   └────────────┘
```

## Agents

### 1. Linguist Structurer

**Purpose:** Understand the lesson content, do web research, extract grammar patterns, structure lesson.ts.

**Input:**
- `sections-catalog.json` (mandatory)
- `learning-items.ts` (for vocab pool)
- Prior lesson vocabulary (SQL query)
- Web research (2+ searches per grammar pattern)

**Output:**
- `lesson.ts` — grammar/exercise sections structured into categories/sections arrays
- `grammar-patterns.ts` — all patterns with slug, complexity_score, confusion_group
- `pattern-brief.json` — new intermediate artifact containing:
  ```json
  {
    "lesson_number": 6,
    "cefr_level": "A1",
    "lesson_topic": "Jakarta",
    "grammar_patterns": [
      {
        "slug": "bukan-negation",
        "name": "BUKAN — Noun Negation",
        "description": "Negates nouns and noun phrases",
        "confusion_group": "negation",
        "key_contrast": "bukan (nouns) vs tidak (verbs)",
        "research_notes": "Common mistake for Dutch speakers: using tidak for everything. Sources: learnindonesian.info shows typical A1 errors include...",
        "example_sentences": [
          { "id": "Ini bukan rumah.", "nl": "Dit is geen huis." },
          { "id": "Itu bukan kantor saya.", "nl": "Dat is niet mijn kantoor." }
        ]
      }
    ],
    "vocabulary_pool": [
      { "base_text": "rumah", "translation_nl": "huis", "item_type": "word", "lesson": 1 },
      { "base_text": "murah", "translation_nl": "goedkoop", "item_type": "word", "lesson": 6 }
    ],
    "current_lesson_items": [
      { "base_text": "kantor", "translation_nl": "kantoor", "item_type": "word" }
    ]
  }
  ```

**Notes on pattern brief:**
- `vocabulary_pool` includes `item_type` for every entry (both prior-lesson and current-lesson items). This is required by the Vocab Exercise Creator for "same word class" distractor filtering.
- `example_sentences` per grammar pattern preserves the web research output in structured form so the Grammar Exercise Creator can draw on them directly without re-doing web research. The Structurer should include 3-5 example sentences per pattern.
- The Grammar Exercise Creator MAY do its own additional web searches if the research notes and examples are insufficient for generating 10 high-quality candidates per pattern. The brief is a starting point, not a hard ceiling.

**Spec focus (~150 lines):** Catalog parsing, reverse-engineered vs. standard handling, web research protocol, grammar pattern extraction, slug uniqueness. No exercise quality rules.

### 2. Grammar Exercise Creator

**Purpose:** Generate grammar exercise candidates. One focused job: high-quality exercises.

**Input:**
- `pattern-brief.json` (vocabulary pool, research notes + example sentences, pattern list)
- `grammar-patterns.ts` (slug reference)

**Output:**
- `candidates.ts` — 10 candidates per grammar pattern

**Exercise types (4):**

| Type | Count | Skill |
|---|---|---|
| `cloze_mcq` | 3 | Recognition |
| `contrast_pair` | 3 | Noticing |
| `sentence_transformation` | 2 | Guided production |
| `constrained_translation` | 2 | Free production |

**Spec focus (~200 lines):** Payload contracts per type, quality rules (no spoilers, genuine distractors, explanations that teach), SLA scaffolding, CEFR level matching. All the rules that get violated most often get the agent's full attention. The agent may do its own web research if the pattern brief's research notes and example sentences are insufficient for a specific pattern.

### 3. Vocab Exercise Creator

**Purpose:** Author curated distractor sets for vocabulary exercises, replacing the random distractors generated at runtime.

**Input:**
- `learning-items.ts` (current lesson vocabulary)
- `pattern-brief.json` (vocabulary pool from prior lessons — for sourcing distractors, with `item_type` for word class filtering)

**Output:**
- `vocab-enrichments.ts` — one entry per vocabulary item

**Format:**
```typescript
export const vocabEnrichments = [
  {
    learning_item_slug: 'murah',
    // Dutch distractors for recognition MCQ
    // (learner sees Indonesian word, picks the correct Dutch meaning)
    recognition_distractors_nl: ['duur', 'gratis', 'betaalbaar'],
    // Indonesian distractors for cued recall
    // (learner sees Dutch meaning, picks the correct Indonesian word)
    cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
    // Indonesian distractors for vocab cloze MCQ
    // (learner fills blank in Indonesian sentence)
    cloze_distractors_id: ['mahal', 'besar', 'jauh'],
  },
  // ...
]
```

**Distractor quality rules:**

For `recognition_distractors_nl` (Dutch):
- Same part of speech as the correct answer
- Semantic near-misses: same semantic field, near-synonyms, or antonyms
- At least one distractor that a learner might confuse with the correct meaning
- Never identical to the correct answer
- Prioritize words from the current and prior lesson vocabulary pool

For `cued_recall_distractors_id` (Indonesian):
- Phonetically or orthographically similar to the correct Indonesian word when possible (e.g. `beli` / `beri`, `murah` / `marah`, `baru` / `biru`)
- Same word class (noun distractors for noun targets, verb for verb) — use `item_type` from the vocabulary pool
- From the same or prior lessons (familiar to the learner)
- Never morphological variants of the correct answer (no `membeli` / `dibeli` when answer is `beli`)

For `cloze_distractors_id` (Indonesian):
- Words that could plausibly fit the cloze sentence grammatically but are semantically wrong
- Same word class as the target — use `item_type` from the vocabulary pool
- Prefer same semantic field: `murah` ↔ `mahal`, `makan` ↔ `minum`
- From the lesson vocabulary pool

**Spec focus (~100 lines):** Distractor sourcing rules, vocabulary pool usage, quality criteria per distractor type. Tight and focused.

### 4. Cloze Creator

**Purpose:** Generate cloze context sentences for vocabulary items.

**Input:**
- `learning-items.ts` (item slugs to cover)
- `sections-catalog.json` (for dialogue item filtering — needed to distinguish individual words/phrases from full dialogue turns)
- `pattern-brief.json` (vocabulary pool for naturalistic sentences)

**Output:**
- `cloze-contexts.ts` — 1-2 cloze contexts per vocabulary item

**Dialogue item filtering rules (carried over from current creator spec):**
- Dialogue items that are individual words or short phrases: YES — get cloze contexts like any vocabulary item
- Full dialogue sentences (entire turns like "Selamat pagi, apa kabar?"): NO — display-only, no cloze contexts
- The Cloze Creator must read `sections-catalog.json` dialogue sections to identify which items are full turns vs. individual words

**Additional rules:**
- `source_text` must contain exactly one `___`
- Sentence must be naturalistic — something a native speaker would say
- Do NOT use the item itself as the entire sentence
- Difficulty should match lesson CEFR level
- For items containing `=` (e.g. `Monas = Monumen Nasional`): write the cloze for the short form only (blank = `Monas`)
- Discourse particles (`deh`, `sih`, `lah` standalone) and isolated punctuation items may be skipped — but ONLY if a naturalistic sentence cannot be constructed

**Spec focus (~100 lines):** Naturalistic sentence rules, `___` placement, difficulty matching, topic tags, dialogue filtering, skip rules for discourse particles.

## Reviewer Changes

The `linguist-reviewer` gains three new check sections:

### New check: pattern-brief.json integrity
- All grammar pattern slugs in the brief match `grammar-patterns.ts`
- Vocabulary pool is non-empty
- Every vocabulary pool entry has `item_type` set
- Research notes exist for every pattern
- `example_sentences` array exists and has at least 2 entries per pattern

### New check: vocab-enrichments.ts
- Every item in `learning-items.ts` has an entry in `vocab-enrichments.ts`
- Each entry has all 3 distractor arrays
- Each distractor array has exactly 3 items
- No distractor equals the correct answer
- No duplicate distractors within an array
- All distractors exist in the vocabulary pool (current + prior lessons via SQL query) or in the `indonesian.learning_items` / `indonesian.item_meanings` tables. Flag as WARNING if a distractor cannot be found in any known source.
- `cued_recall_distractors_id` does not contain morphological variants of the correct answer (WARNING)

**Severity:**
- Missing enrichment entry for a vocabulary item → CRITICAL
- Distractor equals correct answer → CRITICAL
- Wrong array length → CRITICAL
- Vocabulary pool entry missing `item_type` → CRITICAL
- Morphological-variant-only distractors → WARNING
- Distractor not found in vocabulary pool or DB → WARNING

### Existing check updates
- Cloze coverage check must verify dialogue item filtering: full dialogue turns must NOT have cloze contexts, individual words/phrases from dialogue sections MUST have them

## Runtime Integration

### New table: `indonesian.item_exercise_enrichments`

```sql
CREATE TABLE indonesian.item_exercise_enrichments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  learning_item_id UUID NOT NULL REFERENCES indonesian.learning_items(id),
  recognition_distractors_nl TEXT[] NOT NULL DEFAULT '{}',
  cued_recall_distractors_id TEXT[] NOT NULL DEFAULT '{}',
  cloze_distractors_id TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(learning_item_id)
);

-- Auto-update updated_at on upsert (reusable trigger function)
CREATE OR REPLACE FUNCTION indonesian.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enrichments_updated_at
  BEFORE UPDATE ON indonesian.item_exercise_enrichments
  FOR EACH ROW EXECUTE FUNCTION indonesian.set_updated_at();

-- RLS
ALTER TABLE indonesian.item_exercise_enrichments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrichments_read" ON indonesian.item_exercise_enrichments
  FOR SELECT TO authenticated USING (true);

-- Grants (authenticated only — content tables are not public)
GRANT SELECT ON indonesian.item_exercise_enrichments TO authenticated;
GRANT ALL ON indonesian.item_exercise_enrichments TO service_role;
```

### Publish script changes

`publish-approved-content.ts` gains a step to upsert `vocab-enrichments.ts` entries into `item_exercise_enrichments`:

1. **Optional file** — if `vocab-enrichments.ts` does not exist in the staging directory, skip this step silently. This ensures backward compatibility for existing lessons (1-7) that don't have enrichments yet.
2. **Ordering dependency** — the enrichments upsert must run AFTER the learning items upsert, because it needs to resolve `learning_item_slug` → `learning_item_id` via a lookup query. The publish script already upserts learning items first, so the enrichments step goes at the end.
3. **loadStagingData extension** — the `loadStagingData` function must be extended to optionally read `vocab-enrichments.ts` (try/catch with null fallback).

### Staging file scaffold changes

`generate-staging-files.ts` must scaffold an empty `vocab-enrichments.ts` alongside the other files:
```typescript
export const vocabEnrichments: any[] = []
```

`index.ts` barrel export must include the new file:
```typescript
export { vocabEnrichments } from './vocab-enrichments'
```

### Session queue changes

`sessionQueue.ts` changes to `selectExercises`:

1. Load enrichments for all items in the session (batch query via `chunkedIn`, same pattern as other services)
2. In `makeRecognitionMCQ`: if enrichment exists with non-empty `recognition_distractors_nl`, use those instead of random distractors
3. In `makeCuedRecall`: if enrichment exists with non-empty `cued_recall_distractors_id`, use those instead of random distractors
4. In `makeClozeMcq` (vocab): if enrichment exists with non-empty `cloze_distractors_id`, use those instead of random distractors
5. Fall back to random generation if no enrichment exists (backward compatible)

## Pipeline Orchestration

The updated pipeline for a new lesson:

```bash
# Step 1-4: unchanged (OCR, catalog, staging files)

# Step 5: Linguist Structurer (was part of linguist-creator)
# Reads sections-catalog.json, does web research
# Outputs: lesson.ts, grammar-patterns.ts, pattern-brief.json

# Step 6: Three creators run (can be parallelized)
# Grammar Exercise Creator → candidates.ts
# Vocab Exercise Creator → vocab-enrichments.ts
# Cloze Creator → cloze-contexts.ts

# Step 7: Reviewer (validates all 6 output files)
# lesson.ts, grammar-patterns.ts, pattern-brief.json,
# candidates.ts, vocab-enrichments.ts, cloze-contexts.ts

# Step 8: Publish (unchanged + new enrichments upsert at end)
```

Step 6's three creators are independent — they read the same inputs but write different files. They can run as parallel subagents.

## Migration

**Existing lessons (1-7):** Vocab enrichments don't exist yet. The runtime falls back to random distractors, which is the current behavior. Run the Vocab Exercise Creator for each lesson when ready — no urgency, it's purely additive.

**New lessons (8+):** Full pipeline with all 4 agents.

## Supabase Requirements

### Schema changes
- New table `indonesian.item_exercise_enrichments` (see SQL above)
- New trigger function `indonesian.update_enrichments_timestamp()`
- Add to `scripts/migration.sql`

### RLS policies
- `enrichments_read` — SELECT for authenticated users (same pattern as other content tables)

### Grants
- `authenticated` + `anon`: SELECT
- `service_role`: ALL

### homelab-configs changes
- [ ] PostgREST: no change needed — `indonesian` schema already exposed
- [ ] Kong: no change needed — no new CORS requirements
- [ ] GoTrue: no change needed
- [ ] Storage: no change needed

### Health check additions
- `scripts/check-supabase-deep.ts`: add check for `item_exercise_enrichments` table existence
- `scripts/check-supabase-deep.ts`: add check for RLS policy on the new table

## What This Does NOT Change

- Exercise types in the app — no new components needed
- Session queue structure — same `SessionQueueItem` type
- FSRS scheduling — unchanged
- Review handler — unchanged
- The 4 grammar exercise types — same payloads, same quality rules, just in a focused agent spec
