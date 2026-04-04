# Content Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local content pipeline that takes coursebook page photos and produces a fully playable lesson — content, vocabulary, grammar, exercises — with zero API calls.

**Architecture:** Six-step pipeline: HEIC→JPG conversion, local OCR, local parser, unified review UI (three-panel: image + OCR text + parsed structure), optional Claude Code gap-fill, Supabase publish. All intermediate artifacts preserved on disk.

**Tech Stack:** Bun scripts, Tesseract OCR (brew install), Vite + React + Mantine review UI, Express file server, existing Supabase schema.

**Design doc:** `docs/plans/2026-04-04-content-pipeline-design.md`

---

## Existing code to reuse or replace

| File | Status |
|------|--------|
| `scripts/convert-heic-to-jpg.ts` | Keep as-is (Step 1) |
| `scripts/extract-textbook-content.ts` | Replace with OCR script (Step 2) |
| `scripts/generate-exercise-candidates.ts` | Replace with local parser (Step 3) |
| `scripts/publish-approved-content.ts` | Refactor for new staging format (Step 6) |
| `tools/review/` | Rewrite UI for three-panel layout (Step 4) |

---

## Task 1: Schema — Add new ContextType values

**Files:**
- Modify: `src/types/learning.ts:7`
- Modify: `scripts/migration.sql:115`

**Step 1: Update TypeScript type**

In `src/types/learning.ts` line 7, change:

```typescript
export type ContextType = 'example_sentence' | 'dialogue' | 'cloze' | 'lesson_snippet' | 'vocabulary_list' | 'exercise_prompt'
```

**Step 2: Update SQL check constraint**

In `scripts/migration.sql`, find the `item_contexts` table's `context_type` check constraint and update to:

```sql
context_type text NOT NULL CHECK (context_type IN ('example_sentence', 'dialogue', 'cloze', 'lesson_snippet', 'vocabulary_list', 'exercise_prompt')),
```

**Step 3: Run build to verify types compile**

Run: `bun run build`
Expected: Build succeeds.

**Step 4: Run tests**

Run: `bun run test`
Expected: All tests pass (no runtime references to new values yet).

**Step 5: Commit**

```bash
git add src/types/learning.ts scripts/migration.sql
git commit -m "feat: add vocabulary_list and exercise_prompt context types"
```

---

## Task 2: Install Tesseract OCR

**Step 1: Install Tesseract with Dutch and Indonesian language packs**

Run: `brew install tesseract tesseract-lang`

**Step 2: Verify installation**

Run: `tesseract --version && tesseract --list-langs | grep -E 'nld|ind'`
Expected: Version printed, `nld` and `ind` listed.

**Step 3: Quick test with a lesson 4 page**

Run: `tesseract "content/raw/lesson-4/Lesson 4 - page 1.jpg" /tmp/ocr-test-page1 -l nld+ind 2>&1 && head -20 /tmp/ocr-test-page1.txt`
Expected: Some extracted text (may have errors — that's fine, review UI handles corrections).

---

## Task 3: OCR script (`ocr-pages.ts`)

Replaces `extract-textbook-content.ts`. Pure local OCR, no API calls.

**Files:**
- Create: `scripts/ocr-pages.ts`
- Modify: `Makefile` — update `extract-textbook` target

**Step 1: Write the OCR script**

```typescript
#!/usr/bin/env bun
/**
 * ocr-pages.ts — Step 2 of content pipeline
 *
 * Local OCR using Tesseract. No API calls.
 *
 * Usage:
 *   bun scripts/ocr-pages.ts <lesson-number>
 *
 * Reads:   content/raw/lesson-<N>/*.{jpg,jpeg,png}
 * Writes:  content/extracted/lesson-<N>/page-<N>.txt
 *
 * Idempotent — skips pages where .txt already exists.
 * To force re-extraction, delete the specific .txt file.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function getPageImages(lessonDir: string): string[] {
  if (!fs.existsSync(lessonDir)) {
    console.error(`Error: Directory not found: ${lessonDir}`)
    process.exit(1)
  }

  return fs.readdirSync(lessonDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()
    .map(f => path.join(lessonDir, f))
}

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/ocr-pages.ts <lesson-number>')
    process.exit(1)
  }

  const lessonDir = path.join(process.cwd(), 'content', 'raw', `lesson-${lessonNumber}`)
  const outputDir = path.join(process.cwd(), 'content', 'extracted', `lesson-${lessonNumber}`)
  fs.mkdirSync(outputDir, { recursive: true })

  const pageImages = getPageImages(lessonDir)
  console.log(`\nOCR extracting ${pageImages.length} page(s) for lesson ${lessonNumber}...`)

  let extracted = 0
  let skipped = 0

  for (let i = 0; i < pageImages.length; i++) {
    const imagePath = pageImages[i]
    const pageNum = i + 1
    const outputPath = path.join(outputDir, `page-${pageNum}.txt`)

    if (fs.existsSync(outputPath)) {
      console.log(`[${pageNum}/${pageImages.length}] Skipping ${path.basename(imagePath)} — already extracted`)
      skipped++
      continue
    }

    console.log(`[${pageNum}/${pageImages.length}] OCR ${path.basename(imagePath)}...`)

    try {
      // Tesseract writes to <output>.txt, so strip .txt from path
      const outputBase = outputPath.replace(/\.txt$/, '')
      execSync(`tesseract "${imagePath}" "${outputBase}" -l nld+ind`, { stdio: 'pipe' })

      const text = fs.readFileSync(outputPath, 'utf-8').trim()
      console.log(`✓ Page ${pageNum}: ${text.length} chars`)
      extracted++
    } catch (err) {
      console.error(`✗ Page ${pageNum}: OCR failed`)
      console.error(err)
    }
  }

  console.log(`\nDone. ${extracted} extracted, ${skipped} skipped.`)
  console.log(`Output: ${outputDir}/`)
  console.log(`\nNext step: bun scripts/parse-lesson-content.ts ${lessonNumber}`)
}

main()
```

**Step 2: Update Makefile**

Replace the `extract-textbook` target:

```makefile
.PHONY: ocr-pages
ocr-pages: ## OCR textbook pages to text (requires LESSON, requires tesseract)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make ocr-pages LESSON=<N>"; exit 1; }
	@which tesseract > /dev/null || { echo "Error: tesseract not found. Run: brew install tesseract tesseract-lang"; exit 1; }
	bun scripts/ocr-pages.ts $(LESSON)
```

**Step 3: Test with lesson 4**

Run: `make ocr-pages LESSON=4`
Expected: 6 `.txt` files created in `content/extracted/lesson-4/`.

**Step 4: Verify idempotency**

Run: `make ocr-pages LESSON=4`
Expected: All 6 pages skipped ("already extracted").

**Step 5: Commit**

```bash
git add scripts/ocr-pages.ts Makefile
git commit -m "feat: add local OCR script using Tesseract (replaces API extraction)"
```

---

## Task 4: Lesson parser (`parse-lesson-content.ts`)

Replaces `generate-exercise-candidates.ts`. Reads OCR text, pattern-matches into structured staging files.

**Files:**
- Create: `scripts/parse-lesson-content.ts`
- Modify: `Makefile` — add `parse-lesson` target

**Step 1: Write the parser**

The parser reads all `page-N.txt` files for a lesson, concatenates them, then pattern-matches sections. It outputs staging files matching the app's content types.

```typescript
#!/usr/bin/env bun
/**
 * parse-lesson-content.ts — Step 3 of content pipeline
 *
 * Reads OCR text files and pattern-matches into structured lesson content.
 * Best-effort — the review UI is where corrections happen.
 *
 * Usage:
 *   bun scripts/parse-lesson-content.ts <lesson-number>
 *
 * Reads:   content/extracted/lesson-<N>/page-<N>.txt
 * Writes:  scripts/data/staging/lesson-<N>/
 *            lesson.ts, learning-items.ts, grammar-patterns.ts, candidates.ts, index.ts
 */

import fs from 'fs'
import path from 'path'

// --- Types matching the app's content model ---

interface LessonSection {
  title: string
  content: Record<string, unknown>
  order_index: number
}

interface LearningItemStaging {
  base_text: string
  item_type: 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
  context_type: 'vocabulary_list' | 'example_sentence' | 'dialogue' | 'exercise_prompt'
  translation_nl: string
  translation_en: string
  source_page: number
  review_status: 'pending_review' | 'approved' | 'rejected'
}

interface GrammarPatternStaging {
  pattern_name: string
  description: string
  confusion_group: string | null
  page_reference: number
}

interface ExerciseCandidateStaging {
  exercise_type: string
  source_text: string
  prompt_text: string
  answer_key: string[]
  explanation: string
  review_status: 'pending_review' | 'approved' | 'rejected'
  reviewer_notes: string
}

// --- Pattern matchers ---

/** Matches lines like "word = translation" or "word: translation" */
function parseVocabularyLines(text: string, pageNum: number): LearningItemStaging[] {
  const items: LearningItemStaging[] = []
  const vocabRegex = /^([A-Za-z\s'-]+(?:\([^)]*\))?)\s*[=:]\s*(.+)$/gm
  let match: RegExpExecArray | null

  while ((match = vocabRegex.exec(text)) !== null) {
    const indonesian = match[1].trim()
    const dutch = match[2].trim()

    // Skip if either side is too long (probably not a vocab entry)
    if (indonesian.length > 50 || dutch.length > 80) continue
    // Skip if indonesian side has no letters
    if (!/[a-zA-Z]/.test(indonesian)) continue

    items.push({
      base_text: indonesian,
      item_type: 'word',
      context_type: 'vocabulary_list',
      translation_nl: dutch,
      translation_en: '', // filled in review or by Claude Code
      source_page: pageNum,
      review_status: 'pending_review',
    })
  }

  return items
}

/** Matches dialogue patterns like "A: text" or "Speaker: text" */
function parseDialogueLines(text: string, pageNum: number): { section: LessonSection | null; items: LearningItemStaging[] } {
  const items: LearningItemStaging[] = []
  const lines: { speaker: string; text: string; translation: string }[] = []
  const dialogueRegex = /^([A-Z][a-zA-Z]*)\s*:\s*(.+)$/gm
  let match: RegExpExecArray | null

  while ((match = dialogueRegex.exec(text)) !== null) {
    const speaker = match[1].trim()
    const lineText = match[2].trim()

    lines.push({ speaker, text: lineText, translation: '' })

    // If the line contains Indonesian text, make it a learning item
    items.push({
      base_text: lineText,
      item_type: 'dialogue_chunk',
      context_type: 'dialogue',
      translation_nl: '',
      translation_en: '',
      source_page: pageNum,
      review_status: 'pending_review',
    })
  }

  const section: LessonSection | null = lines.length >= 2
    ? { title: `Dialoog (pagina ${pageNum})`, content: { type: 'dialogue', lines }, order_index: 0 }
    : null

  return { section, items }
}

/** Matches Indonesian/Dutch sentence pairs (line by line) */
function parseSentencePairs(text: string, pageNum: number): LearningItemStaging[] {
  const items: LearningItemStaging[] = []
  const pairRegex = /^(.+?)\s*[-–—]\s*(.+)$/gm
  let match: RegExpExecArray | null

  while ((match = pairRegex.exec(text)) !== null) {
    const left = match[1].trim()
    const right = match[2].trim()

    // Heuristic: Indonesian text tends to have certain common words
    const looksIndonesian = /\b(saya|anda|yang|dan|di|ke|dari|ini|itu|tidak|ada|untuk|dengan)\b/i.test(left)

    if (looksIndonesian && left.length > 5 && left.length < 150) {
      items.push({
        base_text: left,
        item_type: 'sentence',
        context_type: 'example_sentence',
        translation_nl: right,
        translation_en: '',
        source_page: pageNum,
        review_status: 'pending_review',
      })
    }
  }

  return items
}

// --- Main ---

function loadPageTexts(lessonNumber: number): { pageNum: number; text: string }[] {
  const extractedDir = path.join(process.cwd(), 'content', 'extracted', `lesson-${lessonNumber}`)

  if (!fs.existsSync(extractedDir)) {
    console.error(`Error: No extracted text found at ${extractedDir}`)
    console.error(`Run 'make ocr-pages LESSON=${lessonNumber}' first.`)
    process.exit(1)
  }

  return fs.readdirSync(extractedDir)
    .filter(f => /^page-\d+\.txt$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)![0], 10)
      const numB = parseInt(b.match(/\d+/)![0], 10)
      return numA - numB
    })
    .map(f => ({
      pageNum: parseInt(f.match(/\d+/)![0], 10),
      text: fs.readFileSync(path.join(extractedDir, f), 'utf-8'),
    }))
}

function writeStaging(lessonNumber: number, data: {
  sections: LessonSection[]
  items: LearningItemStaging[]
  patterns: GrammarPatternStaging[]
  candidates: ExerciseCandidateStaging[]
}) {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)
  fs.mkdirSync(stagingDir, { recursive: true })

  const lessonTs = `// Auto-generated by parse-lesson-content.ts — edit in review UI
export const lesson = {
  title: 'Les ${lessonNumber}',
  description: '',
  level: 'A1',
  module_id: 'module-1',
  order_index: ${lessonNumber},
  sections: ${JSON.stringify(data.sections, null, 2)}
}
`
  fs.writeFileSync(path.join(stagingDir, 'lesson.ts'), lessonTs)

  const itemsTs = `// Auto-generated by parse-lesson-content.ts — edit in review UI
export const learningItems = ${JSON.stringify(data.items, null, 2)}
`
  fs.writeFileSync(path.join(stagingDir, 'learning-items.ts'), itemsTs)

  const patternsTs = `// Auto-generated by parse-lesson-content.ts — edit in review UI
export const grammarPatterns = ${JSON.stringify(data.patterns, null, 2)}
`
  fs.writeFileSync(path.join(stagingDir, 'grammar-patterns.ts'), patternsTs)

  const candidatesTs = `// Auto-generated by parse-lesson-content.ts — edit in review UI
export const candidates = ${JSON.stringify(data.candidates, null, 2)}
`
  fs.writeFileSync(path.join(stagingDir, 'candidates.ts'), candidatesTs)

  const indexTs = `export { lesson } from './lesson'
export { learningItems } from './learning-items'
export { grammarPatterns } from './grammar-patterns'
export { candidates } from './candidates'
`
  fs.writeFileSync(path.join(stagingDir, 'index.ts'), indexTs)

  console.log(`\n✓ Wrote staging files to ${stagingDir}`)
  console.log(`  - lesson.ts (${data.sections.length} sections)`)
  console.log(`  - learning-items.ts (${data.items.length} items)`)
  console.log(`  - grammar-patterns.ts (${data.patterns.length} patterns)`)
  console.log(`  - candidates.ts (${data.candidates.length} candidates)`)
}

function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/parse-lesson-content.ts <lesson-number>')
    process.exit(1)
  }

  const pages = loadPageTexts(lessonNumber)
  console.log(`\nParsing ${pages.length} page(s) for lesson ${lessonNumber}...`)

  const allSections: LessonSection[] = []
  const allItems: LearningItemStaging[] = []
  const allPatterns: GrammarPatternStaging[] = []
  const allCandidates: ExerciseCandidateStaging[] = []

  for (const { pageNum, text } of pages) {
    console.log(`[Page ${pageNum}] ${text.length} chars`)

    // Extract vocabulary
    const vocabItems = parseVocabularyLines(text, pageNum)
    allItems.push(...vocabItems)
    if (vocabItems.length > 0) {
      console.log(`  → ${vocabItems.length} vocabulary items`)
    }

    // Extract dialogues
    const { section: dialogueSection, items: dialogueItems } = parseDialogueLines(text, pageNum)
    if (dialogueSection) {
      dialogueSection.order_index = allSections.length
      allSections.push(dialogueSection)
      allItems.push(...dialogueItems)
      console.log(`  → dialogue section (${dialogueItems.length} lines)`)
    }

    // Extract sentence pairs
    const sentenceItems = parseSentencePairs(text, pageNum)
    allItems.push(...sentenceItems)
    if (sentenceItems.length > 0) {
      console.log(`  → ${sentenceItems.length} sentence pairs`)
    }

    // Add page as a text section if no structured content was found
    if (vocabItems.length === 0 && !dialogueSection && sentenceItems.length === 0) {
      allSections.push({
        title: `Pagina ${pageNum}`,
        content: { type: 'text', paragraphs: text.split('\n\n').filter(p => p.trim()) },
        order_index: allSections.length,
      })
      console.log(`  → unstructured text section`)
    }
  }

  writeStaging(lessonNumber, {
    sections: allSections,
    items: allItems,
    patterns: allPatterns,
    candidates: allCandidates,
  })

  console.log(`\nNext step: make review LESSON=${lessonNumber}`)
}

main()
```

**Step 2: Add Makefile target**

```makefile
.PHONY: parse-lesson
parse-lesson: ## Parse OCR text into structured staging files (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make parse-lesson LESSON=<N>"; exit 1; }
	bun scripts/parse-lesson-content.ts $(LESSON)
```

**Step 3: Test with lesson 4**

Run: `make ocr-pages LESSON=4 && make parse-lesson LESSON=4`
Expected: Staging files created with best-effort parsed content.

**Step 4: Commit**

```bash
git add scripts/parse-lesson-content.ts Makefile
git commit -m "feat: add local lesson parser (vocabulary, dialogues, sentences)"
```

---

## Task 5: Review UI — Server rewrite

Rewrite the Express server to support three-panel review: page images, OCR text, and staging data.

**Files:**
- Rewrite: `tools/review/server.ts`

**Step 1: Write the new server**

```typescript
#!/usr/bin/env tsx
/**
 * Review UI server — reads/writes OCR text and staging files.
 * Also serves page images from content/raw/.
 */

import express from 'express'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const app = express()
const PORT = 3001

app.use(express.json({ limit: '10mb' }))

// CORS for local Vite dev server
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT')
  next()
})

function getRepoRoot(): string {
  if (process.cwd().includes('tools/review')) {
    return path.join(process.cwd(), '..', '..')
  }
  return process.cwd()
}

// GET /api/lessons — List available lessons (from content/raw/)
app.get('/api/lessons', (_req, res) => {
  const rawDir = path.join(getRepoRoot(), 'content', 'raw')
  if (!fs.existsSync(rawDir)) return res.json([])

  const lessons = fs.readdirSync(rawDir)
    .filter(f => f.startsWith('lesson-') && fs.statSync(path.join(rawDir, f)).isDirectory())
    .map(f => parseInt(f.replace('lesson-', ''), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b)

  res.json(lessons)
})

// GET /api/pages/:lesson — List pages with OCR text and image paths
app.get('/api/pages/:lesson', (req, res) => {
  const { lesson } = req.params
  const root = getRepoRoot()
  const rawDir = path.join(root, 'content', 'raw', `lesson-${lesson}`)
  const extractedDir = path.join(root, 'content', 'extracted', `lesson-${lesson}`)

  if (!fs.existsSync(rawDir)) return res.status(404).json({ error: 'Lesson not found' })

  const images = fs.readdirSync(rawDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()

  const pages = images.map((img, i) => {
    const pageNum = i + 1
    const ocrPath = path.join(extractedDir, `page-${pageNum}.txt`)
    const ocrText = fs.existsSync(ocrPath) ? fs.readFileSync(ocrPath, 'utf-8') : ''

    return {
      page_number: pageNum,
      image_filename: img,
      image_url: `/api/images/${lesson}/${encodeURIComponent(img)}`,
      ocr_text: ocrText,
      has_ocr: fs.existsSync(ocrPath),
    }
  })

  res.json(pages)
})

// GET /api/images/:lesson/:filename — Serve page images
app.get('/api/images/:lesson/:filename', (req, res) => {
  const { lesson, filename } = req.params
  const imagePath = path.join(getRepoRoot(), 'content', 'raw', `lesson-${lesson}`, decodeURIComponent(filename))

  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'Image not found' })

  res.sendFile(imagePath)
})

// POST /api/pages/:lesson/:page — Save corrected OCR text
app.post('/api/pages/:lesson/:page', (req, res) => {
  const { lesson, page } = req.params
  const { text } = req.body
  if (typeof text !== 'string') return res.status(400).json({ error: 'text required' })

  const extractedDir = path.join(getRepoRoot(), 'content', 'extracted', `lesson-${lesson}`)
  fs.mkdirSync(extractedDir, { recursive: true })
  fs.writeFileSync(path.join(extractedDir, `page-${page}.txt`), text)

  res.json({ success: true })
})

// POST /api/pages/:lesson/reparse — Re-run parser after OCR corrections
app.post('/api/pages/:lesson/reparse', (req, res) => {
  const { lesson } = req.params
  try {
    execSync(`bun scripts/parse-lesson-content.ts ${lesson}`, {
      cwd: getRepoRoot(),
      stdio: 'pipe',
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Parser failed' })
  }
})

// GET /api/staging/:lesson — Load all staging files
app.get('/api/staging/:lesson', (req, res) => {
  const { lesson } = req.params
  const stagingDir = path.join(getRepoRoot(), 'scripts', 'data', 'staging', `lesson-${lesson}`)

  if (!fs.existsSync(stagingDir)) return res.json({ lesson: null, learningItems: [], grammarPatterns: [], candidates: [] })

  const readJson = (filename: string): any => {
    const filePath = path.join(stagingDir, filename)
    if (!fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath, 'utf-8')
    // Extract the JSON/object from the TS file (after the = sign)
    const match = content.match(/=\s*([\s\S]*?)(?:\nexport|$)/)
    if (!match) return null
    try {
      return JSON.parse(match[1].trim().replace(/;$/, ''))
    } catch {
      // Try evaluating as JS object literal
      try {
        return new Function(`return ${match[1].trim().replace(/;$/, '')}`)()
      } catch {
        return null
      }
    }
  }

  res.json({
    lesson: readJson('lesson.ts'),
    learningItems: readJson('learning-items.ts') || [],
    grammarPatterns: readJson('grammar-patterns.ts') || [],
    candidates: readJson('candidates.ts') || [],
  })
})

// POST /api/staging/:lesson — Save staging data
app.post('/api/staging/:lesson', (req, res) => {
  const { lesson } = req.params
  const { lesson: lessonData, learningItems, grammarPatterns, candidates } = req.body
  const stagingDir = path.join(getRepoRoot(), 'scripts', 'data', 'staging', `lesson-${lesson}`)
  fs.mkdirSync(stagingDir, { recursive: true })

  if (lessonData) {
    fs.writeFileSync(
      path.join(stagingDir, 'lesson.ts'),
      `// Edited via review UI\nexport const lesson = ${JSON.stringify(lessonData, null, 2)}\n`
    )
  }
  if (learningItems) {
    fs.writeFileSync(
      path.join(stagingDir, 'learning-items.ts'),
      `// Edited via review UI\nexport const learningItems = ${JSON.stringify(learningItems, null, 2)}\n`
    )
  }
  if (grammarPatterns) {
    fs.writeFileSync(
      path.join(stagingDir, 'grammar-patterns.ts'),
      `// Edited via review UI\nexport const grammarPatterns = ${JSON.stringify(grammarPatterns, null, 2)}\n`
    )
  }
  if (candidates) {
    fs.writeFileSync(
      path.join(stagingDir, 'candidates.ts'),
      `// Edited via review UI\nexport const candidates = ${JSON.stringify(candidates, null, 2)}\n`
    )
  }

  res.json({ success: true })
})

app.listen(PORT, () => {
  console.log(`Review server running on http://localhost:${PORT}`)
  console.log(`Frontend: http://localhost:5173`)
})
```

**Step 2: Test server starts**

Run: `cd tools/review && bun run server`
Expected: "Review server running on http://localhost:3001"

**Step 3: Test endpoints with curl**

Run: `curl http://localhost:3001/api/lessons`
Expected: JSON array with lesson numbers.

Run: `curl http://localhost:3001/api/pages/4`
Expected: JSON array with page data including OCR text.

**Step 4: Commit**

```bash
git add tools/review/server.ts
git commit -m "feat: rewrite review server for three-panel layout (images, OCR, staging)"
```

---

## Task 6: Review UI — Frontend rewrite

Three-panel layout: page image, editable OCR text, editable parsed structure.

**Files:**
- Rewrite: `tools/review/src/App.tsx`

**Step 1: Write the new App component**

This is a large component. Key features:
- Lesson selector at top
- Page navigator (prev/next)
- Three panels: image (left), OCR text (middle), structured content (right)
- Save OCR button saves text and optionally re-runs parser
- Structured content is editable inline (learning items, candidates, sections)
- Approve/reject per candidate and learning item
- Save all button writes everything back to staging files

The full component code is too large for this plan. Implement it following these guidelines:

**Layout (using Mantine Grid):**
```
┌─────────────────────────────────────────────────┐
│ Lesson: [dropdown]  Page: [◀ 1/6 ▶]  [Save All]│
├───────────┬────────────────┬────────────────────┤
│           │                │                    │
│  Page     │  OCR Text      │  Parsed Content    │
│  Image    │  (editable     │  (editable         │
│           │   textarea)    │   structured data)  │
│           │                │                    │
│           │  [Save OCR]    │  [Re-parse]        │
│           │  [Re-parse]    │                    │
├───────────┴────────────────┴────────────────────┤
│ Tabs: [Learning Items] [Candidates] [Sections]  │
│ ... editable list with approve/reject ...       │
└─────────────────────────────────────────────────┘
```

**State:**
- `selectedLesson: number | null`
- `pages: Page[]` (from `/api/pages/:lesson`)
- `currentPage: number`
- `ocrText: string` (editable, per page)
- `staging: { lesson, learningItems, grammarPatterns, candidates }` (from `/api/staging/:lesson`)
- `activeTab: 'items' | 'candidates' | 'sections'`

**API calls:**
- On lesson select: `GET /api/pages/:lesson` + `GET /api/staging/:lesson`
- Save OCR: `POST /api/pages/:lesson/:page` with `{ text }`
- Re-parse: `POST /api/pages/:lesson/reparse`, then reload staging
- Save all: `POST /api/staging/:lesson` with full staging data

**Step 2: Test the full UI**

Run: `cd tools/review && bun run dev`
Open: `http://localhost:5173`
Expected: Three-panel view loads, shows lesson 4 pages with images and OCR text.

**Step 3: Commit**

```bash
git add tools/review/src/App.tsx
git commit -m "feat: three-panel review UI (image + OCR + structured content)"
```

---

## Task 7: Update Makefile and clean up old scripts

**Files:**
- Modify: `Makefile`
- Delete: `scripts/extract-textbook-content.ts`
- Delete: `scripts/generate-exercise-candidates.ts`
- Delete: `scripts/extract-lesson-local.ts`

**Step 1: Update Makefile with full pipeline commands**

Replace the old `extract-textbook`, `generate-candidates` targets. Add:

```makefile
# ============================================================================
# CONTENT PIPELINE
# ============================================================================

.PHONY: convert-heic
convert-heic: ## Convert HEIC photos to JPG (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make convert-heic LESSON=<N>"; exit 1; }
	bun scripts/convert-heic-to-jpg.ts $(LESSON)

.PHONY: ocr-pages
ocr-pages: ## OCR textbook pages to text (requires LESSON, requires tesseract)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make ocr-pages LESSON=<N>"; exit 1; }
	@which tesseract > /dev/null || { echo "Error: tesseract not found. Run: brew install tesseract tesseract-lang"; exit 1; }
	bun scripts/ocr-pages.ts $(LESSON)

.PHONY: parse-lesson
parse-lesson: ## Parse OCR text into structured staging files (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make parse-lesson LESSON=<N>"; exit 1; }
	bun scripts/parse-lesson-content.ts $(LESSON)

.PHONY: review
review: ## Start the review UI (tools/review/)
	cd tools/review && bun run dev

.PHONY: pipeline
pipeline: convert-heic ocr-pages parse-lesson ## Run full pipeline steps 1-3 (requires LESSON)
	@echo "\n✓ Pipeline complete. Run 'make review' to review and edit content."

.PHONY: publish-content
publish-content: ## Publish approved content to Supabase (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make publish-content LESSON=<N>"; exit 1; }
	SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/publish-approved-content.ts $(LESSON)
```

**Step 2: Remove old scripts**

```bash
rm scripts/extract-textbook-content.ts
rm scripts/generate-exercise-candidates.ts
rm scripts/extract-lesson-local.ts
```

**Step 3: Remove old Makefile targets**

Remove `extract-lesson`, `extract-textbook`, `generate-candidates` targets.

**Step 4: Test pipeline shortcut**

Run: `make pipeline LESSON=4`
Expected: Runs convert → OCR → parse in sequence.

**Step 5: Commit**

```bash
git add Makefile
git rm scripts/extract-textbook-content.ts scripts/generate-exercise-candidates.ts scripts/extract-lesson-local.ts
git commit -m "feat: update Makefile for local content pipeline, remove API-based scripts"
```

---

## Task 8: Refactor publish script for new staging format

The existing `publish-approved-content.ts` expects the old staging format. Update it to read the new format (learning-items.ts, lesson.ts, etc.).

**Files:**
- Rewrite: `scripts/publish-approved-content.ts`

**Step 1: Update to read new staging files**

The publish script should:
1. Read `staging/lesson-N/lesson.ts` → upsert `lessons` + `lesson_sections`
2. Read `staging/lesson-N/learning-items.ts` → upsert `learning_items` + `item_meanings` + `item_contexts`
3. Read `staging/lesson-N/grammar-patterns.ts` → upsert `grammar_patterns`
4. Read `staging/lesson-N/candidates.ts` → insert approved `exercise_variants`
5. Only publish items with `review_status: 'approved'`
6. Mark published items as `'published'` in staging file

Full implementation depends on the final staging file format from the review UI. Write the skeleton with clear TODOs for each upsert step.

**Step 2: Test dry-run**

Add a `--dry-run` flag that logs what would be published without touching Supabase.

Run: `bun scripts/publish-approved-content.ts 4 --dry-run`
Expected: Lists what would be upserted.

**Step 3: Commit**

```bash
git add scripts/publish-approved-content.ts
git commit -m "feat: refactor publish script for new staging format"
```

---

## Task 9: End-to-end test with lesson 4

Run the full pipeline on lesson 4 to validate everything works together.

**Step 1: Run pipeline**

```bash
make pipeline LESSON=4
```

**Step 2: Start review UI**

```bash
make review
```

Open `http://localhost:5173`, select lesson 4. Verify:
- Page images display in left panel
- OCR text appears in middle panel (may have errors)
- Parsed content appears in right panel
- Can edit OCR text and save
- Can re-parse after OCR corrections
- Can edit structured content (learning items, sections)
- Can approve/reject items and candidates
- Save all writes back to staging files

**Step 3: Check staging files**

Verify `scripts/data/staging/lesson-4/` contains reasonable data:
- `lesson.ts` has sections matching app content types
- `learning-items.ts` has vocabulary + sentences with translations
- Files are valid TypeScript

**Step 4: Dry-run publish**

```bash
bun scripts/publish-approved-content.ts 4 --dry-run
```

Verify output lists the correct upserts.

**Step 5: Commit**

```bash
git add scripts/data/staging/lesson-4/
git commit -m "feat: lesson 4 content via local pipeline (end-to-end validation)"
```

---

## Execution Order

All tasks are sequential:

1. Task 1 — Schema (ContextType values)
2. Task 2 — Install Tesseract
3. Task 3 — OCR script
4. Task 4 — Lesson parser
5. Task 5 — Review server
6. Task 6 — Review UI frontend
7. Task 7 — Makefile + cleanup
8. Task 8 — Publish script refactor
9. Task 9 — E2E test with lesson 4

---

## Verification Checklist

After each task:
1. Run `bun run test` if types or app code changed
2. Run `bun run build` if types changed

After all tasks:
1. `make pipeline LESSON=4` — full pipeline runs without errors
2. `make review` — review UI loads and works
3. `bun run test` — all existing tests pass
4. `bun run build` — production build succeeds
