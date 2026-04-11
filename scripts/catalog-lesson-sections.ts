#!/usr/bin/env bun
/**
 * catalog-lesson-sections.ts — Step 3 of content pipeline
 *
 * Uses Claude to read extracted OCR pages and classify content into typed sections.
 * Structured sections (vocabulary/expressions/numbers/dialogue/text) are fully parsed.
 * Grammar, exercises, pronunciation, reference_table are captured as raw_text for the linguist.
 *
 * Usage:
 *   bun scripts/catalog-lesson-sections.ts <lesson-number> [options]
 *
 * Options:
 *   --level A1|A2|B1|B2   CEFR level (default: A1)
 *   --module <id>          module_id (default: module-1)
 *   --force                overwrite existing catalog
 *
 * Reads:    content/extracted/lesson-<N>/page-<N>.txt
 * Writes:   scripts/data/staging/lesson-<N>/sections-catalog.json
 *
 * Requires: ANTHROPIC_API_KEY in environment or .env.local
 */

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionType =
  | 'vocabulary'
  | 'expressions'
  | 'numbers'
  | 'grammar'
  | 'exercises'
  | 'dialogue'
  | 'text'
  | 'pronunciation'
  | 'reference_table'

interface VocabItem {
  indonesian: string
  dutch: string
}

interface DialogueLine {
  speaker: string
  text: string
}

interface CatalogSection {
  id: number
  type: SectionType
  title: string
  source_pages: number[]
  confidence: 'high' | 'medium' | 'low'
  items?: VocabItem[]           // vocabulary, expressions, numbers
  lines?: DialogueLine[]        // dialogue
  paragraphs?: string[]         // text
  raw_text?: string             // grammar, exercises, pronunciation, reference_table
}

interface SectionsCatalog {
  lesson: number
  generatedAt: string
  sourcePages: number
  lessonMeta: {
    title: string
    level: string
    module_id: string
    order_index: number
  }
  sections: CatalogSection[]
  flags: string[]
}

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      // Strip surrounding single or double quotes from values
      const val = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
      process.env[match[1].trim()] = val
    }
  }
}

// ── Read extracted pages ──────────────────────────────────────────────────────

function readExtractedPages(lessonNumber: number): Array<{ page: number; text: string }> {
  const dir = path.join(process.cwd(), 'content', 'extracted', `lesson-${lessonNumber}`)
  if (!fs.existsSync(dir)) {
    console.error(`Error: No extracted pages found at ${dir}`)
    console.error('Run: bun scripts/ocr-pages.ts ' + lessonNumber)
    process.exit(1)
  }

  const files = fs.readdirSync(dir)
    .filter(f => /^page-\d+\.txt$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)![0])
      const nb = parseInt(b.match(/\d+/)![0])
      return na - nb
    })

  if (files.length === 0) {
    console.error(`Error: No page-N.txt files found in ${dir}`)
    process.exit(1)
  }

  return files.map(f => ({
    page: parseInt(f.match(/\d+/)![0]),
    text: fs.readFileSync(path.join(dir, f), 'utf-8').trim(),
  }))
}

// ── Read raw page images ──────────────────────────────────────────────────────

import { execSync } from 'child_process'
import os from 'os'

interface RawImage {
  filename: string
  data: string   // base64
  mediaType: 'image/jpeg' | 'image/png'
}

/**
 * Resize an image to max 1200px on the longest side using macOS sips.
 * Returns base64 of the resized image, or the original if sips fails.
 */
function resizeImageForApi(srcPath: string): string {
  const tmpPath = path.join(os.tmpdir(), `lesson-img-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)
  try {
    execSync(`sips -Z 1200 "${srcPath}" --out "${tmpPath}" -s format jpeg`, { stdio: 'ignore' })
    const data = fs.readFileSync(tmpPath).toString('base64')
    fs.unlinkSync(tmpPath)
    return data
  } catch {
    // Fall back to original if sips unavailable
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    return fs.readFileSync(srcPath).toString('base64')
  }
}

function readRawImages(lessonNumber: number): RawImage[] {
  const dir = path.join(process.cwd(), 'content', 'raw', `lesson-${lessonNumber}`)
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()

  if (files.length > 0) {
    console.log(`  Resizing ${files.length} images to max 1200px for API...`)
  }

  return files.map(f => {
    const srcPath = path.join(dir, f)
    return {
      filename: f,
      data: resizeImageForApi(srcPath),
      mediaType: 'image/jpeg' as const,
    }
  })
}

// ── Build message content ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are analyzing pages from a Dutch-Indonesian language coursebook (circa 1980s). Each lesson contains vocabulary lists, grammar explanations, exercises, and sometimes a dialogue and a culture text.

You are given two sources for each lesson:
1. OCR-extracted text — primary source, but may have gaps, garbled characters, or missed columns
2. Raw page images — use these to recover content the OCR missed or got wrong

Your task: identify every section, classify it by type, and extract content according to the rules below. When OCR text is incomplete or garbled for a section, read the image directly to fill in the gaps.

## Section types

### Fully structured (parse content into items/lines/paragraphs)

**vocabulary** — Header: "Woordenlijst"
Items follow the pattern: indonesian_word = dutch_translation
Also accepts: word : translation or word – translation
Extract every pair. Include compound words and words in parentheses as written.
Use images to recover vocabulary items the OCR missed.
Items array: [{ "indonesian": "...", "dutch": "..." }]

**expressions** — Header: "Uitdrukkingen"
Same format as vocabulary. Multi-word phrases.
Items array: [{ "indonesian": "...", "dutch": "..." }]

**numbers** — Header: "Telwoorden" or "Getallen"
May appear as: dutch_number = indonesian OR dutch_number indonesian (no equals)
Examples: "100 = seratus", "2.000 dua ribu", "1.000.000 sejuta, satu juta"
Always extract as: { "indonesian": indonesian_number_word, "dutch": dutch_number }
Items array: [{ "indonesian": "...", "dutch": "..." }]

**Multiple Dutch translations:** When a word has more than one Dutch equivalent, always separate them with " / " (space-slash-space). Never use commas, semicolons, or "of" as separators.
Examples: { "dutch": "meneer / vader" }, { "dutch": "bakken / braden" }, { "dutch": "kunnen / mogen" }

**dialogue** — Identified by "Speaker: text" or "Speaker : text" patterns
Speaker names are Indonesian names or family terms (Titin, Nanang, Pembantu, Ibu, Bapak, Mas, etc.)
Any narrative scene-setting text before dialogue lines → { "speaker": "narrator", "text": "..." }
Lines array: [{ "speaker": "...", "text": "..." }]

**text** — Header: "CULTUUR" or "Tekst" or lesson culture sections (Dutch prose)
Split on blank lines to get paragraphs. Title: include subsection if present ("Cultuur - Accommodatie").
Paragraphs array: ["..."]

### Raw text capture (do NOT parse — linguist handles these)

**grammar** — Header: "GRAMMATICA", "Grammatica", "Toelichting", or topical grammar headers like "Persoonlijk voornaamwoord", "Bezittelijk voornaamwoord", "YANG - constructie", etc.
Capture verbatim including Indonesian examples. Use images to recover tables and diagrams as text.

**exercises** — Header: "OEFENINGEN" or individual exercise labels "Oefening I.", "Oefening 1.", etc.
Capture all exercise items verbatim.

**pronunciation** — Header: "Uitspraakoefening", "Uitspraak"
Capture verbatim.

**reference_table** — Tabular layout (rows of related forms, paradigm tables).
Reconstruct the table from the image if OCR mangled the column alignment.
Capture as a readable text table.

## Rules

1. One section per distinct topic — do not merge "Persoonlijk voornaamwoord" and "Bezittelijk voornaamwoord" into one section
2. If a page contains multiple sections (e.g., Woordenlijst then Telwoorden), split them correctly
3. If vocabulary items appear without a "Woordenlijst" header, set confidence: "medium" and add a flag
4. source_pages: list all page numbers (from the OCR page markers) that contributed to this section
5. Title: use the exact header text. For text sections with a subtitle, use "Cultuur - Subtitle"
6. Lesson title: look for "Les N" at the top of the first page; combine with the lesson theme if identifiable
7. If images show content not present in any OCR page, add it to the appropriate section and note it in flags

## Output

Respond with ONLY valid JSON — no prose, no markdown fences:

{
  "lessonTitle": "Les N - Theme",
  "sections": [
    {
      "id": 0,
      "type": "text",
      "title": "Cultuur - Accommodatie",
      "source_pages": [1, 2],
      "confidence": "high",
      "paragraphs": ["First paragraph...", "Second paragraph..."]
    },
    {
      "id": 1,
      "type": "vocabulary",
      "title": "Woordenlijst",
      "source_pages": [4],
      "confidence": "high",
      "items": [
        { "indonesian": "mengantar", "dutch": "begeleiden" },
        { "indonesian": "air", "dutch": "water" }
      ]
    },
    {
      "id": 2,
      "type": "numbers",
      "title": "Telwoorden",
      "source_pages": [4, 5],
      "confidence": "high",
      "items": [
        { "indonesian": "seratus", "dutch": "100" },
        { "indonesian": "dua ratus", "dutch": "200" }
      ]
    },
    {
      "id": 3,
      "type": "grammar",
      "title": "Grammatica - YANG Constructie",
      "source_pages": [5, 6],
      "confidence": "high",
      "raw_text": "Full verbatim grammar text..."
    }
  ],
  "flags": ["Image page 3: 4 vocabulary items recovered from image not present in OCR text"]
}`

function buildMessageContent(
  pages: Array<{ page: number; text: string }>,
  images: RawImage[],
): Anthropic.MessageParam['content'] {
  const content: Anthropic.MessageParam['content'] = []

  // OCR text block
  const ocrText = pages.map(p => `=== OCR PAGE ${p.page} ===\n${p.text}`).join('\n\n')
  content.push({
    type: 'text',
    text: `Below are the OCR-extracted text pages followed by the raw page images.\n\n## OCR Text\n\n${ocrText}\n\n## Raw Page Images\n\nUse the images below to verify and supplement the OCR text. Recover anything the OCR missed.`,
  })

  // Raw images
  for (const img of images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType,
        data: img.data,
      },
    })
    content.push({
      type: 'text',
      text: `(Image file: ${img.filename})`,
    })
  }

  content.push({
    type: 'text',
    text: 'Now produce the JSON catalog as specified in the system prompt.',
  })

  return content
}

// ── Call Claude ───────────────────────────────────────────────────────────────

async function callClaude(
  pages: Array<{ page: number; text: string }>,
  images: RawImage[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set in environment or .env.local')
    process.exit(1)
  }

  const client = new Anthropic({ apiKey })

  console.log(`Calling Claude (${pages.length} OCR pages + ${images.length} raw images)...`)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: buildMessageContent(pages, images),
    }],
  })

  const block = message.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') {
    console.error('Error: No text response from Claude')
    process.exit(1)
  }

  return block.text
}

// ── Parse Claude response ─────────────────────────────────────────────────────

function parseResponse(raw: string, lessonNumber: number, level: string, moduleId: string): SectionsCatalog {
  // Strip markdown fences if present
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim()

  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('Error: Claude response was not valid JSON')
    console.error('Raw response:\n', raw.slice(0, 500))
    process.exit(1)
  }

  const sections: CatalogSection[] = (parsed.sections || []).map((s: any, i: number) => {
    const section: CatalogSection = {
      id: i,
      type: s.type,
      title: s.title || s.type,
      source_pages: s.source_pages || [],
      confidence: s.confidence || 'medium',
    }
    if (s.items) section.items = s.items
    if (s.lines) section.lines = s.lines
    if (s.paragraphs) section.paragraphs = s.paragraphs
    if (s.raw_text) section.raw_text = s.raw_text
    return section
  })

  return {
    lesson: lessonNumber,
    generatedAt: new Date().toISOString(),
    sourcePages: 0, // filled in by caller
    lessonMeta: {
      title: parsed.lessonTitle || `Les ${lessonNumber}`,
      level,
      module_id: moduleId,
      order_index: lessonNumber,
    },
    sections,
    flags: parsed.flags || [],
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateCatalog(catalog: SectionsCatalog): { errors: string[], warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  for (const section of catalog.sections) {
    const loc = `Section "${section.title}" (${section.type})`

    if (['vocabulary', 'expressions', 'numbers'].includes(section.type)) {
      const items = section.items ?? []
      if (items.length === 0) {
        errors.push(`${loc}: no items extracted`)
      }
      for (const item of items) {
        if (!item.indonesian?.trim()) errors.push(`${loc}: item missing indonesian text`)
        if (!item.dutch?.trim())      errors.push(`${loc}: item missing dutch translation`)
      }
    }

    if (section.type === 'dialogue') {
      const lines = section.lines ?? []
      if (lines.length === 0) {
        errors.push(`${loc}: no dialogue lines extracted`)
      }
      for (const line of lines) {
        if (!line.speaker?.trim()) errors.push(`${loc}: dialogue line missing speaker`)
        if (!line.text?.trim())    errors.push(`${loc}: dialogue line missing text`)
      }
    }

    if (section.confidence === 'low') {
      warnings.push(`${loc}: low-confidence extraction — review manually before publishing`)
    }
  }

  return { errors, warnings }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const args = process.argv.slice(2)
  const lessonNumber = parseInt(args[0], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/catalog-lesson-sections.ts <lesson-number> [--level A1] [--module module-1] [--force]')
    process.exit(1)
  }

  const force = args.includes('--force')
  const levelIdx = args.indexOf('--level')
  const level = levelIdx !== -1 ? args[levelIdx + 1] : 'A1'
  const moduleIdx = args.indexOf('--module')
  const moduleId = moduleIdx !== -1 ? args[moduleIdx + 1] : 'module-1'

  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)
  const catalogPath = path.join(stagingDir, 'sections-catalog.json')

  if (fs.existsSync(catalogPath) && !force) {
    console.log(`Catalog already exists: ${catalogPath}`)
    console.log('Use --force to overwrite.')
    process.exit(0)
  }

  // Read pages and images
  const pages = readExtractedPages(lessonNumber)
  const images = readRawImages(lessonNumber)
  console.log(`Read ${pages.length} OCR pages + ${images.length} raw images for lesson ${lessonNumber}`)
  if (images.length === 0) {
    console.warn('  Warning: no raw images found — OCR text only. Add photos to content/raw/lesson-' + lessonNumber + '/ for better results.')
  }

  // Call Claude with OCR text + images
  const rawResponse = await callClaude(pages, images)

  // Parse response
  const catalog = parseResponse(rawResponse, lessonNumber, level, moduleId)
  catalog.sourcePages = pages.length
  ;(catalog as any).sourceImages = images.length

  const { errors: catalogErrors, warnings: catalogWarnings } = validateCatalog(catalog)
  catalogWarnings.forEach(w => console.warn(`  ⚠️  ${w}`))
  if (catalogErrors.length > 0) {
    console.error(`\n✗ Catalog validation failed — ${catalogErrors.length} error(s):`)
    catalogErrors.forEach(e => console.error(`  ✗ ${e}`))
    console.error('\nFix the extraction issues above before proceeding to generate-staging-files.ts.')
    process.exit(1)
  }
  console.log(`\n✓ Catalog validated (${catalog.sections.length} sections, ${catalogWarnings.length} warnings)`)

  // Ensure staging dir exists
  fs.mkdirSync(stagingDir, { recursive: true })

  // Write catalog
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2))
  console.log(`\nWrote: ${catalogPath}`)

  // Report
  const counts: Record<string, number> = {}
  let totalItems = 0
  for (const s of catalog.sections) {
    counts[s.type] = (counts[s.type] || 0) + 1
    if (s.items) totalItems += s.items.length
    if (s.lines) totalItems += s.lines.length
  }

  console.log('\nSections identified:')
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`)
  }
  console.log(`  Total items (vocab/numbers/dialogue): ${totalItems}`)

  if (catalog.flags.length > 0) {
    console.log('\nFlags for review:')
    catalog.flags.forEach(f => console.log(`  ⚠️  ${f}`))
  }

  const lowConfidence = catalog.sections.filter(s => s.confidence === 'low')
  if (lowConfidence.length > 0) {
    console.log('\nLow-confidence sections (review recommended):')
    lowConfidence.forEach(s => console.log(`  ⚠️  ${s.title} (${s.type})`))
  }

  console.log('\nNext step: bun scripts/generate-staging-files.ts ' + lessonNumber)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
