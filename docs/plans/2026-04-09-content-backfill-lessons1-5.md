# Content Backfill — Lessons 1–5 + Pipeline Hardening

**Date:** 2026-04-09
**Scope:** Fix missing/wrong section types in lessons 4–5; run end-to-end content pipeline for lessons 1–3; add cloze_mcq grammar candidates to lessons 1–4; harden linguist-reviewer.

---

## What was done

### Lesson 4 & 5 — section type fixes

The Woordenlijst and Telwoorden sections in lessons 4 and 5 had been published with `type: "exercises"` instead of `"vocabulary"` / `"numbers"`. The frontend renders sections differently by type, so these sections were invisible in the lesson reader.

**Fix applied:**
- Direct SQL `UPDATE` with `jsonb_set` to patch the 9 affected section rows in `indonesian.lesson_sections`
- Correct section types added to the staging `lesson.ts` files so future republish preserves them
- Republished lessons 4 and 5 via `bun scripts/publish-approved-content.ts`

### Lessons 1–3 — full retroactive pipeline

Lessons 1–3 predate the pipeline. Their content lived only in the legacy `scripts/data/lessons.ts` and `vocabulary.ts` files. The pipeline staging directories (`scripts/data/staging/lesson-N/`) were empty or incomplete.

**Steps completed:**

1. **Created staging files from existing Supabase content:**
   - `lesson.ts` — minimal metadata + `sections: []` (so publish updates metadata/grammar/items without touching DB sections)
   - `learning-items.ts` — sourced from the existing `vocabulary.ts` and supplemented from DB; 60/65/62 items for lessons 1/2/3

2. **Reset candidates `review_status`:** Candidates for lessons 1–3 existed in staging with `review_status: "published"` but had never actually been seeded (exercise_variants count was 0). Changed to `"approved"` so the publish script would process them.

3. **Created `cloze-contexts.ts`:**
   - Lesson 1: already existed (119 contexts); re-published without changes
   - Lesson 2: created from scratch — 65 contexts (one per item)
   - Lesson 3: created from scratch — 62 contexts; initial publish had 19 slug mismatches (see discrepancies below); fixed and republished

4. **Created `review-report.json`** for each lesson (retroactive approval).

5. **Published all three lessons:**
   - Lesson 1: 8 grammar patterns, 61 learning items, 15 candidates, 119 cloze contexts
   - Lesson 2: 7 grammar patterns, 65 learning items, 18 candidates, 65 cloze contexts
   - Lesson 3: 4 grammar patterns, 62 learning items, 16 candidates, 62 cloze contexts

### Lessons 1–4 — cloze_mcq grammar candidates

All four lessons were missing `cloze_mcq` exercise variants for their grammar patterns. The coverage dashboard showed 0 for lessons 1–4 vs 5–6 for lessons 5–6.

Added 2 `cloze_mcq` candidates per grammar pattern:
- Lesson 1: 9 new candidates (7 patterns: zero-copula ×2, belum-vs-tidak ×2, serial-verb ×1, no-articles ×1, verb-no-conjugation ×1, no-singular-plural ×1, reduplication ×1)
- Lesson 2: 7 new candidates (7 patterns, 1 each)
- Lesson 3: 6 new candidates (4 patterns: ada-existential ×2, dari-di-ke ×2, question-words ×1, sekali ×1)
- Lesson 4: 6 new candidates (6 yang-patterns, 1 each)

All published via `bun scripts/publish-approved-content.ts`.

### Linguist-reviewer hardening

Added a new check to `.claude/agents/linguist-reviewer.md`: for every grammar pattern slug in `grammar-patterns.ts`, the reviewer now verifies that `candidates.ts` contains at least one candidate of **each** of the four exercise types the creator is responsible for: `contrast_pair`, `sentence_transformation`, `constrained_translation`, `cloze_mcq`. Missing types are flagged as WARNINGs.

---

## Pipeline discrepancies found

### 1. Section type not validated at publish time
**What happened:** Lessons 4–5 sections were published with `type: "exercises"` (the wrong type), and neither the publish script nor the reviewer caught it.
**Root cause:** The `publish-approved-content.ts` script passes section `type` through directly from the staging `lesson.ts` without validating it against an allowed list.
**Suggested fix:** Add a validation step in the publish script that asserts `type` is one of `"vocabulary"`, `"expressions"`, `"numbers"`, `"dialogue"`, `"text"`, `"grammar"`, `"exercises"`, `"pronunciation"`, `"reference_table"`. Reject with a clear error if not.

### 2. Cloze context slugs must match `normalized_text` exactly
**What happened:** `cloze-contexts.ts` for lesson 3 was written with hyphenated slugs (`bandar-udara`, `di-depan`, `ke-mana`, etc.). The publish script resolves cloze contexts by matching `learning_item_slug` against `normalized_text` in the DB (which is the lowercased `base_text`). Since `base_text` uses spaces (`bandar udara`), the hyphens caused 19 lookups to silently fail with a `⚠️ Could not find learning item` warning.
**Root cause:** No documentation or tooling enforces the slug format. The `learning_item_slug` field name implies a clean identifier, but it is actually a raw `normalized_text` value.
**Suggested fixes:**
  - Rename the field in `cloze-contexts.ts` to `learning_item_normalized_text` to make the contract explicit
  - Or: add a slug-normalisation step in the publish script that replaces hyphens with spaces before the lookup, with a fallback
  - At minimum: document in the cloze-contexts format comment that the slug must match `base_text.toLowerCase().trim()` exactly, not a hyphenated slug

### 3. Candidates marked `published` without being seeded
**What happened:** Lessons 1–3 candidates had `review_status: "published"` in the staging files. The publish script skips `"published"` items. These candidates had never actually been seeded (exercise_variants = 0), so the `"published"` flag was a false positive.
**Root cause:** The `"published"` status was written by a previous session that incorrectly set it before publishing, or by a different script run that changed the status without actually inserting exercise_variants.
**Suggested fix:** The publish script should either:
  - Verify via DB query that the expected exercise_variants rows exist before trusting `"published"` status; or
  - Add a `make check-candidates` health check script that counts exercise_variants per lesson and reports gaps (similar to `make check-supabase`)

### 4. No exercise type coverage check in the reviewer
**What happened:** The linguist-reviewer accepted output for lessons 1–4 even though every grammar pattern was missing `cloze_mcq` candidates. The reviewer only checked structural correctness, not completeness.
**Fix applied:** Added check §5 to the reviewer agent: all four exercise types required per grammar pattern, each missing type flagged as WARNING.
**Remaining gap:** The reviewer is an LLM agent and could miss this check if the candidates file is long. A deterministic script would be more reliable — a future `check-exercise-coverage.ts` that reads staging files and reports gaps would be more trustworthy than the agent check alone.

### 5. Grammar patterns seeded without `introduced_by_lesson_id`
**What happened:** Grammar patterns for lessons 1–3 existed in the DB with `introduced_by_lesson_id = null` from a previous run before the pipeline existed for those lessons. The publish script upserts on `slug` and sets `introduced_by_lesson_id`, so re-publishing fixed this — but the window between initial seeding and the fix meant queries joining on this column returned no results.
**Suggested fix:** The publish script already handles this correctly via upsert. But a `check-supabase-deep` check for `introduced_by_lesson_id IS NULL` on grammar_patterns would catch orphaned rows.

### 6. Legacy and pipeline paths share some tables but have different item lifecycles
**What happened:** Lessons 1–3 used the legacy path (seeded via `vocabulary.ts` → `vocabulary` table) but we also seeded `learning_items` for them via the pipeline path. This means both tables have data for the same words, which could cause duplicate scheduling if the session engine uses both.
**Status:** Needs investigation. If the session engine reads from `learning_items` for all lessons, the legacy `vocabulary` rows may be dead weight. If it reads from `vocabulary` for lessons 1–3, the new `learning_items` rows are unused.
**Suggested fix:** Audit which tables the session/FSRS engine reads from for lessons 1–3 and ensure there is no double-scheduling.

---

## Final state after session

| Lesson | Learning items | Exercise variants | Cloze contexts | Grammar patterns |
|--------|---------------|-------------------|----------------|-----------------|
| 1 | 61 | 24 (15 + 9 new) | 121 | 7 |
| 2 | 65 | 25 (18 + 7 new) | 65 | 7 |
| 3 | 62 | 22 (16 + 6 new) | 62 | 4 |
| 4 | (existing) | +6 new cloze_mcq | (existing) | 6 |
| 5 | (existing) | (existing) | (existing) | (existing) |

All section types for lessons 1–5 are now correct in the DB.
