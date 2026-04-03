#!/usr/bin/env bun
/**
 * extract-textbook-content.ts
 *
 * Extracts textbook content from coursebook page photos using Claude vision API.
 * Targets staging types for the content pipeline.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=<key> bun scripts/extract-textbook-content.ts <lesson-number>
 *   e.g.: ANTHROPIC_API_KEY=sk-ant-... bun scripts/extract-textbook-content.ts 4
 *
 * Reads:   content/raw/lesson-<N>/*.{jpg,jpeg,png}
 * Writes:
 *   scripts/data/staging/lesson-<N>/
 *   ├── pages.ts              — page metadata + extracted text
 *   ├── grammar-patterns.ts   — grammar patterns
 *   ├── candidates.ts         — exercise candidates (pending review)
 *   └── index.ts              — re-exports
 */

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TextbookPage {
  page_number: number
  textbook_source_id: string
  raw_text: string
  extracted_at: string
}

interface GrammarPattern {
  pattern_name: string
  description: string
  confusion_group?: string
  page_reference: number
}

interface GeneratedExerciseCandidate {
  exercise_type: 'contrast_pair' | 'sentence_transformation' | 'constrained_translation' | 'speaking'
  page_reference: number
  grammar_pattern_id?: string
  source_text: string
  prompt_text: string
  answer_key: string[]
  explanation: string
  target_pattern?: string
  review_status: 'pending_review'
  created_at: string
}

interface ExtractionResult {
  pages: TextbookPage[]
  grammarPatterns: GrammarPattern[]
  candidates: GeneratedExerciseCandidate[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readImageAsBase64(filePath: string): { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' } {
  const data = fs.readFileSync(filePath).toString('base64')
  const ext = path.extname(filePath).toLowerCase()
  const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg'
  return { data, mediaType }
}

function getPageImages(lessonDir: string): string[] {
  if (!fs.existsSync(lessonDir)) {
    console.error(`Error: Directory not found: ${lessonDir}`)
    console.error(`Place lesson page photos in ${lessonDir} before running this script.`)
    process.exit(1)
  }

  const files = fs.readdirSync(lessonDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()
    .map(f => path.join(lessonDir, f))

  if (files.length === 0) {
    console.error(`Error: No .jpg/.jpeg/.png files found in ${lessonDir}`)
    process.exit(1)
  }

  return files
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true })
}

// ---------------------------------------------------------------------------
// Claude API Call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert at extracting structured educational content from Indonesian language textbooks.

Extract pages, grammar patterns, and exercise candidates with precision. Preserve exact Indonesian text. Generate exercise candidates targeting contrast_pair, sentence_transformation, constrained_translation, and speaking exercise types.`

const EXTRACTION_PROMPT = `Extract complete textbook content from these pages. Return a JSON object:

{
  "pages": [
    {
      "page_number": <number>,
      "textbook_source_id": "textbook-1",
      "raw_text": "<all text extracted from page>"
    }
  ],
  "grammarPatterns": [
    {
      "pattern_name": "<grammar rule name>",
      "description": "<explanation>",
      "confusion_group": "<optional: group name for confusable forms>",
      "page_reference": <number>
    }
  ],
  "candidates": [
    {
      "exercise_type": "contrast_pair|sentence_transformation|constrained_translation|speaking",
      "page_reference": <number>,
      "grammar_pattern_id": "<optional>",
      "source_text": "<source sentence>",
      "prompt_text": "<exercise prompt>",
      "answer_key": ["<answer1>", "<answer2>"],
      "explanation": "<why this is correct>",
      "target_pattern": "<optional: grammar target>"
    }
  ]
}

For contrast_pair: two confusable forms with explanation.
For sentence_transformation: source sentence + transformation instruction + acceptable answers.
For constrained_translation: source language sentence + target pattern requirement + acceptable answers.
For speaking: prompt text + target scenario/pattern.`

async function extractContent(lessonNumber: number): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set')
    process.exit(1)
  }

  const client = new Anthropic({ apiKey })
  const lessonDir = path.join(process.cwd(), 'content', 'raw', `lesson-${lessonNumber}`)
  const pageImages = getPageImages(lessonDir)

  console.log(`\nExtracting content from ${pageImages.length} page(s) for lesson ${lessonNumber}...`)

  // Build message content with vision blocks
  const contentBlocks: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: EXTRACTION_PROMPT,
    },
  ]

  for (const imagePath of pageImages) {
    const { data, mediaType } = readImageAsBase64(imagePath)
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data,
      },
    } as Anthropic.ContentBlockParam)
  }

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: contentBlocks,
      },
    ],
  })

  // Parse response
  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  // Extract JSON from response
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Could not find JSON in response')
  }

  const extracted = JSON.parse(jsonMatch[0])
  const now = new Date().toISOString()

  return {
    pages: (extracted.pages || []).map((p: any, idx: number) => ({
      page_number: p.page_number || idx + 1,
      textbook_source_id: 'textbook-1',
      raw_text: p.raw_text || '',
      extracted_at: now,
    })),
    grammarPatterns: (extracted.grammarPatterns || []).map((g: any) => ({
      pattern_name: g.pattern_name || '',
      description: g.description || '',
      confusion_group: g.confusion_group,
      page_reference: g.page_reference || 1,
    })),
    candidates: (extracted.candidates || []).map((c: any) => ({
      exercise_type: c.exercise_type,
      page_reference: c.page_reference || 1,
      grammar_pattern_id: c.grammar_pattern_id,
      source_text: c.source_text || '',
      prompt_text: c.prompt_text || '',
      answer_key: c.answer_key || [],
      explanation: c.explanation || '',
      target_pattern: c.target_pattern,
      review_status: 'pending_review' as const,
      created_at: now,
    })),
  }
}

// ---------------------------------------------------------------------------
// Write Output Files
// ---------------------------------------------------------------------------

function writeOutputFiles(lessonNumber: number, result: ExtractionResult) {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)
  ensureDir(stagingDir)

  // pages.ts
  const pagesTs = `// Auto-generated by extract-textbook-content.ts
// Do not edit manually

import type { TextbookPage } from '@/types/contentGeneration'

export const pages: TextbookPage[] = ${JSON.stringify(result.pages, null, 2)}
`
  fs.writeFileSync(path.join(stagingDir, 'pages.ts'), pagesTs)

  // grammar-patterns.ts
  const patternsTs = `// Auto-generated by extract-textbook-content.ts
// Do not edit manually

import type { GrammarPattern } from '@/types/contentGeneration'

export const grammarPatterns: GrammarPattern[] = ${JSON.stringify(result.grammarPatterns, null, 2)}
`
  fs.writeFileSync(path.join(stagingDir, 'grammar-patterns.ts'), patternsTs)

  // candidates.ts
  const candidatesTs = `// Auto-generated by extract-textbook-content.ts
// Do not edit manually

import type { GeneratedExerciseCandidate } from '@/types/contentGeneration'

export const candidates: GeneratedExerciseCandidate[] = ${JSON.stringify(result.candidates, null, 2)}
`
  fs.writeFileSync(path.join(stagingDir, 'candidates.ts'), candidatesTs)

  // index.ts
  const indexTs = `// Re-exports from staging data
export { pages } from './pages'
export { grammarPatterns } from './grammar-patterns'
export { candidates } from './candidates'
`
  fs.writeFileSync(path.join(stagingDir, 'index.ts'), indexTs)

  console.log(`\n✓ Wrote staging files to ${stagingDir}`)
  console.log(`  - pages.ts (${result.pages.length} pages)`)
  console.log(`  - grammar-patterns.ts (${result.grammarPatterns.length} patterns)`)
  console.log(`  - candidates.ts (${result.candidates.length} candidates)`)
  console.log(`  - index.ts (re-exports)`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/extract-textbook-content.ts <lesson-number>')
    process.exit(1)
  }

  try {
    const result = await extractContent(lessonNumber)
    writeOutputFiles(lessonNumber, result)
  } catch (err) {
    console.error('Extraction failed:', err)
    process.exit(1)
  }
}

main()
