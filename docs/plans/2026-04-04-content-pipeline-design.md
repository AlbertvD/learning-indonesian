# Content Pipeline Design

**Date:** 2026-04-04
**Status:** Design complete
**Goal:** Take coursebook page photos and produce a fully playable lesson in the app — content sections, vocabulary, grammar, exercises — with zero API calls.

---

## Pipeline Overview

```
Step 1: convert-heic-to-jpg.ts              (local)
        *.HEIC → *.jpg

Step 2: ocr-pages.ts                        (local, Tesseract or macOS Vision)
        *.jpg → content/extracted/lesson-N/page-N.txt
        Idempotent — skips pages where .txt already exists.

Step 3: parse-lesson-content.ts             (local, no API)
        Reads page-N.txt files
        Pattern-matches vocabulary lists, dialogues, exercises, grammar
        Writes first-pass staging files (best effort)

Step 4: Review UI                            (tools/review/)
        Three-panel view:
          Left: page image
          Middle: editable OCR text
          Right: editable parsed structure
        Fix OCR errors and edit structure in one pass
        Re-run parser after OCR corrections, or edit structure directly
        Approve/reject exercise candidates

Step 5: Claude Code fills gaps               (conversation, if needed)
        Only for content the parser couldn't handle
        May not be needed for straightforward lessons

Step 6: publish-approved-content.ts          (Supabase)
        Reads approved staging files
        Upserts lesson, vocabulary, learning items, exercises
```

### Key properties

- No API calls anywhere in the pipeline
- No intermediate artifacts are ever deleted
- Each step reads from the previous step's output
- Steps 1-3 are idempotent (skip if output exists)
- All content is editable before publishing
- The parser handles mechanical extraction; Claude Code only needed for ambiguous content

---

## File Layout

### Input (gitignored)

```
content/
├── raw/lesson-N/              *.HEIC and *.jpg page photos
└── extracted/lesson-N/        page-N.txt OCR output (corrected via review UI)
```

### Staging (version-controlled)

```
scripts/data/staging/lesson-N/
├── lesson.ts                  lesson metadata + sections
├── learning-items.ts          all extractable items (words, sentences, phrases)
├── grammar-patterns.ts        grammar rules with confusion groups
├── candidates.ts              exercise candidates (pending review)
└── index.ts                   re-exports
```

### Published data (version-controlled)

```
scripts/data/
├── lessons.ts                 all lessons (append lesson N)
└── vocabulary.ts              all vocabulary (append lesson N items)
```

---

## Parser (Step 3)

`parse-lesson-content.ts` reads OCR text and pattern-matches common textbook structures into staging files. Best-effort — the review UI is where corrections happen.

### Patterns recognized

| Pattern | How detected | Output |
|---------|-------------|--------|
| Vocabulary list | Lines matching `indonesian = dutch` or `indonesian: dutch` | `learning-items.ts` entries with `context_type: vocabulary_list` |
| Dialogue | Lines starting with speaker labels (`A:`, `B:`, name + `:`) | Lesson section `type: dialogue` + learning items with `context_type: dialogue` |
| Grammar rules | Section headers like "Grammatica", followed by numbered rules or tables | Lesson section `type: grammar` + `grammar-patterns.ts` entries |
| Exercise sections | Headers like "Oefening", "Vertaal", followed by numbered items | Lesson section `type: exercises` + learning items with `context_type: exercise_prompt` |
| Pronunciation | Headers like "Uitspraak", letter/rule/example patterns | Lesson section `type: pronunciation` |
| Cultural text | Dutch paragraphs without Indonesian content | Lesson section `type: text` (no learning items extracted) |
| Simple sentences | Indonesian/Dutch sentence pairs | Learning items with `context_type: example_sentence` |

### What the parser does NOT do

- Translate (Dutch ↔ English) — English translations added in review or by Claude Code
- Generate exercise candidates — candidates come from the review UI or Claude Code
- Resolve ambiguous structure — flagged for review

---

## What Gets Extracted as Learning Items

Every piece of Indonesian content from the lesson is captured. Cultural text (Dutch background sections) is stored as lesson content for display but does NOT produce learning items.

| Source | `ItemType` | `ContextType` | Extract? |
|--------|-----------|---------------|----------|
| Vocabulary list word | `word` | `vocabulary_list` | Yes |
| Grammar example sentence | `sentence` | `example_sentence` | Yes |
| Dialogue line | `sentence` / `dialogue_chunk` | `dialogue` | Yes |
| Exercise sentence | `sentence` | `exercise_prompt` | Yes |
| Cultural text (Dutch) | — | — | No (stored as lesson section only) |
| Pronunciation rules | — | — | No (stored as lesson section only) |

### Each learning item includes

- `base_text` — Indonesian text
- `ItemMeaning` — Dutch translation (primary) + English translation
- `ItemContext` — where it appears in the lesson, with source text
- `ItemAnswerVariant` — alternative accepted answers where applicable

---

## Cloze Generation

Any sentence-level learning item that contains a vocabulary word is a cloze source. No new sentences need to be authored — the textbook provides them in context.

**Example:** Dialogue line `Saya tinggal di Jakarta` + vocabulary word `tinggal` produces:

> `Saya _____ di Jakarta` → answer: `tinggal`

The link is through `item_contexts`: a sentence-level item references the lesson, and the vocabulary word is a separate learning item. The session engine can match them to generate cloze exercises at runtime.

---

## Schema Changes

### New `ContextType` values

Add `vocabulary_list` and `exercise_prompt` to the `ContextType` union:

```typescript
export type ContextType = 'example_sentence' | 'dialogue' | 'cloze' | 'lesson_snippet' | 'vocabulary_list' | 'exercise_prompt'
```

Update the corresponding check constraint in `scripts/migration.sql`.

---

## Lesson Section Content Types

The app's Lesson page renders 6 section content types. The parser and review UI must produce sections matching these exactly:

| Type | Fields | Used for |
|------|--------|----------|
| `text` | `intro`, `paragraphs`, `examples`, `spelling`, `sentences` | Cultural text, intro paragraphs, simple sentences |
| `grammar` | `intro`, `categories` (each with `title`, `rules`, `table`) | Grammar explanations |
| `dialogue` | `setup`, `lines` (each with `speaker`, `text`, `translation`) | Conversations |
| `pronunciation` | `letters` (each with `letter`, `rule`, `examples`) | Pronunciation rules |
| `exercises` | `items` or `sections` (each with `title`, `instruction`, `items`) | Practice exercises |

---

## Review UI

Single app at `tools/review/` built with Vite + React + Mantine. One unified view combining OCR correction and content review.

### Layout

Three-panel view:

- **Left panel** — page image (JPG from `content/raw/lesson-N/`)
- **Middle panel** — editable OCR text (from `content/extracted/lesson-N/page-N.txt`)
- **Right panel** — editable parsed structure (from `scripts/data/staging/lesson-N/`)

### Workflow

1. Select lesson → see all pages
2. For each page: compare image with OCR text, fix errors in middle panel
3. Save OCR corrections → optionally re-run parser to update right panel
4. Edit structured content directly in right panel (fix translations, section types, etc.)
5. Approve/reject exercise candidates with reviewer notes
6. Save all changes back to staging files

### Server

Express server at `localhost:3001`:
- `GET /api/lessons` — list available lessons
- `GET /api/pages/:lesson` — load page images and OCR text
- `POST /api/pages/:lesson/:page` — save corrected OCR text
- `POST /api/pages/:lesson/reparse` — re-run parser after OCR corrections
- `GET /api/staging/:lesson` — load staging files
- `POST /api/staging/:lesson` — save staging changes
- Static file serving for page images from `content/raw/`

---

## Publish Script

`scripts/publish-approved-content.ts` reads approved staging files and upserts to Supabase:

1. Upsert `lessons` row + `lesson_sections` rows
2. Upsert `learning_items` for each extracted item
3. Upsert `item_meanings` (Dutch + English per item)
4. Upsert `item_contexts` linking items to lesson sections
5. Upsert `item_answer_variants` where applicable
6. Insert `exercise_variants` for approved candidates
7. Upsert `grammar_patterns`
8. Mark candidates as `published` in staging file

---

## Backfill

Lessons 1-3 were manually authored. They should be reprocessed through this pipeline to:

1. Extract all sentence-level learning items (currently only ~60 vocabulary words per lesson)
2. Add `vocabulary_list` and `exercise_prompt` context types
3. Generate cloze sources from existing sentences

This is a separate task — not blocking the pipeline for lesson 4+.

---

## Out of Scope

- Audio generation (NotebookLM podcast step — separate workflow)
- Automated publishing without review
- Speaking exercise enablement (contracts exist, `session_enabled = false`)
- Real-time exercise generation (all content is pre-authored)
- API calls of any kind
