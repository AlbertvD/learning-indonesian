# Content Pipeline

Scripts in `scripts/` — run via `make` targets.

---

## Overview

Content enters the system through two distinct paths:

1. **Vocabulary items** — seeded from `scripts/data/` TypeScript data files (lessons, vocabulary) and cloze contexts added by `extract-cloze-items.ts`.
2. **Grammar exercises** — authored in TypeScript staging files, reviewed manually, then published to `exercise_variants` by `publish-grammar-candidates.ts`.

Both paths write to the `indonesian` Postgres schema via the Supabase service-role key. Most scripts are upsert-safe; `seed-learning-items.ts` is an exception — it **deletes and re-inserts** child rows (`item_meanings`, `item_answer_variants`, `item_contexts`) on every run. This is safe because those tables have no learner FK dependencies, but it is not a pure upsert.

---

## Vocabulary path

### Source data

```
scripts/data/
├── lessons.ts       — lesson structure and sections
├── vocabulary.ts    — vocabulary per lesson
└── podcasts.ts      — podcast metadata and transcripts
```

These are version-controlled TypeScript data files. They are seeded with:

```bash
make seed-lessons SUPABASE_SERVICE_KEY=<key>         # lessons + lesson_sections
make seed-vocabulary SUPABASE_SERVICE_KEY=<key>      # vocabulary metadata (thin seed)
make seed-learning-items SUPABASE_SERVICE_KEY=<key>  # learning_items, item_meanings, item_answer_variants, item_contexts
```

`seed-learning-items.ts` is the main vocabulary seeder — it writes `item_answer_variants` (accepted spelling variants) in addition to `learning_items`, `item_meanings`, and `lesson_snippet` contexts.

### Cloze contexts

`extract-cloze-items.ts` / `make seed-sentences` adds `context_type: 'cloze'` rows to `item_contexts`. These are real sentences with `___` placeholders and translations in both EN and NL. Each cloze item creates:

1. A `learning_item` of `item_type: 'sentence'` with `base_text` = the full sentence (blank filled in).
2. Two `item_meanings` rows (EN, NL).
3. One `item_context` row with `context_type: 'cloze'`, `is_anchor_context: true`, `source_text` = the sentence with `___`, and `source_lesson_id` linking it to the lesson. Conflict key: `(learning_item_id, context_type)` — one cloze context per item.

### `lesson_snippet` contexts

Vocabulary items also get `lesson_snippet` contexts. These exist for one purpose only: to carry a `source_lesson_id` so the lesson-gating logic in `buildSessionQueue` can determine which lesson an item belongs to. Their `source_text` is the bare Indonesian word — not a real sentence. **They are never displayed to the user.** Do not use them as display content or assume they contain useful context sentences.

---

## Grammar exercise path

### Stage 1: Staging files

Grammar exercise candidates are authored in:

```
scripts/data/staging/lesson-<N>/
  candidates.ts         — exercise candidates (the main file)
  grammar-patterns.ts   — grammar pattern definitions to seed
  index.ts              — barrel export
  learning-items.ts     — (some lessons) pre-defined learning items
```

Each candidate in `candidates.ts` is a TypeScript object with:

```ts
{
  exercise_type: 'contrast_pair' | 'sentence_transformation' | 'constrained_translation',
  grammar_pattern_slug: string,   // must match a row in grammar_patterns table
  source_page: number,            // source textbook page reference
  requiresManualApproval: boolean,
  review_status: 'pending_review' | 'approved' | 'rejected' | 'published',
  payload: {
    // exercise-type-specific display fields
    // ALSO contains answer keys (correctOptionId, acceptableAnswers, etc.)
    // answer keys are stripped before writing to payload_json
  }
}
```

The review loop is manual: edit `review_status` in the staging file from `pending_review` to `approved` (or `rejected`). A small review UI lives in `tools/review/` and can be started with `make review`.

### Stage 2: Publishing

```bash
bun scripts/publish-grammar-candidates.ts <lesson-number> [--dry-run]
# or
make publish-content LESSON=<N> SUPABASE_SERVICE_KEY=<key>
```

The script processes only candidates with `review_status === 'approved'`. For each:

**Step 0:** Resolve grammar pattern UUIDs by slug from the `grammar_patterns` table. Fails hard if any slug is not found — the pattern must be seeded first.

**Step 1: Upsert `learning_item`**
```sql
INSERT INTO indonesian.learning_items (item_type, base_text, normalized_text, ...)
ON CONFLICT (normalized_text, item_type) DO UPDATE ...
```
`base_text` is derived from the payload:
- `sentence_transformation`: `sourceSentence`
- `constrained_translation`: first `acceptableAnswers` entry when `sourceLanguageSentence` is present (duck-typed field check, not a type check); falls back to `sourceLanguageSentence` if `acceptableAnswers` is absent
- `contrast_pair`: `promptText`

**Step 2: Upsert `item_context`**
```sql
INSERT INTO indonesian.item_contexts (learning_item_id, context_type='exercise_prompt', source_text, ...)
ON CONFLICT (learning_item_id, source_text) DO UPDATE ...
```

**Step 3: Upsert `item_context_grammar_patterns` link**
Links the context to the grammar pattern. This is what `applyGrammarAwareInterleaving` reads to find the `confusion_group`.

**Step 4: Insert `exercise_variants`**

Answer keys are split from the payload before writing:

```ts
function buildAnswerKeyJson(candidate): Record<string, unknown> {
  // contrast_pair: { correctOptionId }
  // sentence_transformation: { acceptableAnswers }
  // constrained_translation: { acceptableAnswers, disallowedShortcutForms }
}

function buildPayloadJson(candidate): Record<string, unknown> {
  // Strips: acceptableAnswers, correctOptionId, disallowedShortcutForms
  // Keeps: everything else (prompts, instructions, explanations, option labels)
}
```

The split is intentional: `payload_json` is safe to send to the client as display-only content. `answer_key_json` is correctness data read only by `makePublishedExercise` during session building.

**Step 5: Mark as published**

The script rewrites the staging file, changing `review_status: 'approved'` to `review_status: 'published'` for all successfully published candidates. This makes the staging file the source of truth for publish state.

---

## Grammar pattern prerequisites

Grammar patterns must exist in the `grammar_patterns` table before publishing exercises that reference them. Each lesson's staging directory contains a `grammar-patterns.ts` file with the pattern definitions. These are seeded via per-lesson scripts (e.g. `scripts/seed-lesson4-grammar-exercises.ts`). There is no unified cross-lesson grammar pattern seeder — each lesson's patterns must be seeded individually before publishing that lesson's candidates.

**Note:** `scripts/publish-approved-content.ts` is a separate publishing script (distinct from `publish-grammar-candidates.ts`) for a different content format. Its exact scope is documented within the script itself.

The `grammar_patterns` table has two fields relevant to session behavior:
- `slug` — used by staging files to reference patterns
- `confusion_group` — identifies confusable forms; items sharing a group are interleaved by `applyGrammarAwareInterleaving`

---

## Textbook import pipeline (content pipeline features)

A separate pipeline handles importing new lessons from photographed textbook pages:

```bash
make convert-heic LESSON=<N>    # 1. Convert HEIC photos to JPG
make ocr-pages LESSON=<N>       # 2. OCR pages with tesseract
make parse-lesson LESSON=<N>    # 3. AI-parse into structured staging files
# or in one step:
make pipeline LESSON=<N>
```

This pipeline requires `VITE_FEATURE_TEXTBOOK_IMPORT=true` and `VITE_FEATURE_AI_GENERATION=true` to be enabled. `isContentPipelineEnabled()` checks both.

---

## Storage buckets

Audio files are managed separately from text content:

| Bucket | Script | Content |
|---|---|---|
| `indonesian-lessons` | `make seed-lesson-audio` | Lesson audio MP3s from `content/lessons/` |
| `indonesian-podcasts` | `make seed-podcasts` | NotebookLM-generated podcast audio from `content/podcasts/` |

Both buckets are public-read. Audio files are not in the git repo (`content/` is gitignored).

---

## Full content seed order

For a fresh database:

```bash
make migrate                                       # schema
make seed-lessons SUPABASE_SERVICE_KEY=<key>
make seed-vocabulary SUPABASE_SERVICE_KEY=<key>
make seed-learning-items SUPABASE_SERVICE_KEY=<key>
make seed-sentences SUPABASE_SERVICE_KEY=<key>     # cloze contexts
# per lesson, after authoring grammar exercises:
bun scripts/seed-lesson4-grammar-exercises.ts      # seed grammar_patterns first
make publish-content LESSON=4 SUPABASE_SERVICE_KEY=<key>
```
