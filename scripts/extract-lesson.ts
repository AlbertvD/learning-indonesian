#!/usr/bin/env bun
/**
 * extract-lesson.ts
 *
 * Extracts lesson content from coursebook page photos using the Claude vision API.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=<key> bun scripts/extract-lesson.ts <lesson-number>
 *   e.g.: ANTHROPIC_API_KEY=sk-ant-... bun scripts/extract-lesson.ts 4
 *
 * Reads:   content/raw/lesson-<N>/*.{jpg,jpeg,png}
 * Writes:
 *   content/extracted/lesson-<N>.json       — intermediate extraction (gitignored)
 *   content/extracted/lesson-<N>-text.txt   — plain text for NotebookLM (gitignored)
 *   scripts/data/lesson-<N>.ts              — TypeScript data file (version-controlled)
 */

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VocabularyItem {
  indonesian: string
  english: string
  partOfSpeech?: string
  notes?: string
}

interface LessonSection {
  title: string
  content: string
  audioFile?: string
}

interface ExtractedLesson {
  lessonNumber: number
  title: string
  description: string
  sections: LessonSection[]
  vocabulary: VocabularyItem[]
  grammarNotes: string[]
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
    .sort() // natural sort — name files 01.jpg, 02.jpg, etc. for correct order
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
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert at extracting structured educational content from Indonesian language coursebook pages.

Extract all content accurately, preserving the exact Indonesian text. For vocabulary items, include every word/phrase taught in the lesson. For grammar notes, extract explanations in English. Sections should follow the order they appear in the book.`

const EXTRACTION_PROMPT = `Extract the complete lesson content from these coursebook pages. Return a JSON object matching this exact structure:

{
  "lessonNumber": <number>,
  "title": "<lesson title in Indonesian and/or English>",
  "description": "<1-2 sentence summary of what this lesson teaches>",
  "sections": [
    {
      "title": "<section heading>",
      "content": "<full text content of this section, preserving Indonesian text exactly>"
    }
  ],
  "vocabulary": [
    {
      "indonesian": "<Indonesian word or phrase>",
      "english": "<English translation>",
      "partOfSpeech": "<noun|verb|adjective|adverb|phrase|etc — optional>",
      "notes": "<usage notes or example sentence — optional>"
    }
  ],
  "grammarNotes": [
    "<grammar rule or explanation as a complete sentence>"
  ]
}

Important:
- Preserve all Indonesian text exactly as written, including diacritics
- Include every vocabulary item from the lesson, not just a selection
- Extract grammar explanations in clear English
- If pages include dialogues or example sentences, include them in the relevant section content
- lessonNumber should be inferred from the lesson title/heading`

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const lessonArg = process.argv[2]
  if (!lessonArg || isNaN(Number(lessonArg))) {
    console.error('Usage: bun scripts/extract-lesson.ts <lesson-number>')
    console.error('Example: bun scripts/extract-lesson.ts 4')
    process.exit(1)
  }

  const lessonNumber = parseInt(lessonArg, 10)
  const rawDir = `content/raw/lesson-${lessonNumber}`
  const extractedDir = 'content/extracted'
  const extractedJsonPath = `${extractedDir}/lesson-${lessonNumber}.json`
  const extractedTextPath = `${extractedDir}/lesson-${lessonNumber}-text.txt`
  const dataFilePath = `scripts/data/lesson-${lessonNumber}.ts`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required')
    process.exit(1)
  }

  console.log(`\nExtracting lesson ${lessonNumber} from ${rawDir}`)

  // Load page images
  const imagePaths = getPageImages(rawDir)
  console.log(`Found ${imagePaths.length} page image(s)`)

  // Build image content blocks
  const imageBlocks: Anthropic.ImageBlockParam[] = imagePaths.map(imgPath => {
    const { data, mediaType } = readImageAsBase64(imgPath)
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    }
  })

  // Call Claude API
  const client = new Anthropic({ apiKey })

  console.log('Sending to Claude API...')

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
  })

  // Extract JSON from response
  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    console.error('Error: No text response from Claude')
    process.exit(1)
  }

  // Parse JSON — strip markdown code fences if present
  let jsonText = textBlock.text.trim()
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fenceMatch) jsonText = fenceMatch[1]

  let extracted: ExtractedLesson
  try {
    extracted = JSON.parse(jsonText)
  } catch {
    console.error('Error: Claude returned invalid JSON. Raw response:')
    console.error(textBlock.text)
    process.exit(1)
  }

  // Override lesson number with the one passed as argument
  extracted.lessonNumber = lessonNumber

  // Ensure output directories exist
  ensureDir(extractedDir)
  ensureDir('scripts/data')

  // Write intermediate JSON
  fs.writeFileSync(extractedJsonPath, JSON.stringify(extracted, null, 2))
  console.log(`\nIntermediate JSON → ${extractedJsonPath}`)

  // Write plain text for NotebookLM
  const plainText = buildPlainText(extracted)
  fs.writeFileSync(extractedTextPath, plainText)
  console.log(`Plain text for NotebookLM → ${extractedTextPath}`)

  // Write TypeScript data file
  const tsContent = buildTypeScriptFile(extracted)
  fs.writeFileSync(dataFilePath, tsContent)
  console.log(`TypeScript data file → ${dataFilePath}`)

  console.log(`\nDone! Review ${dataFilePath} for any extraction errors.`)
  console.log(`\nNext steps:`)
  console.log(`  1. Review and fix ${dataFilePath}`)
  console.log(`  2. Upload ${extractedTextPath} to NotebookLM and generate podcast audio`)
  console.log(`  3. Save the generated audio as content/podcasts/lesson-${lessonNumber}.mp3`)
  console.log(`  4. Run: make seed-lessons SUPABASE_SERVICE_KEY=<key>`)
  console.log(`  5. Run: make seed-podcasts SUPABASE_SERVICE_KEY=<key>`)
}

// ---------------------------------------------------------------------------
// Output builders
// ---------------------------------------------------------------------------

function buildPlainText(lesson: ExtractedLesson): string {
  const lines: string[] = [
    `Lesson ${lesson.lessonNumber}: ${lesson.title}`,
    '',
    lesson.description,
    '',
  ]

  for (const section of lesson.sections) {
    lines.push(`## ${section.title}`)
    lines.push('')
    lines.push(section.content)
    lines.push('')
  }

  if (lesson.grammarNotes.length > 0) {
    lines.push('## Grammar Notes')
    lines.push('')
    for (const note of lesson.grammarNotes) {
      lines.push(`- ${note}`)
    }
    lines.push('')
  }

  if (lesson.vocabulary.length > 0) {
    lines.push('## Vocabulary')
    lines.push('')
    for (const item of lesson.vocabulary) {
      const note = item.notes ? ` (${item.notes})` : ''
      lines.push(`- ${item.indonesian}: ${item.english}${note}`)
    }
  }

  return lines.join('\n')
}

function buildTypeScriptFile(lesson: ExtractedLesson): string {
  const sections = lesson.sections
    .map(s => {
      const audioFile = s.audioFile ? `\n    audioFile: '${s.audioFile}',` : ''
      return `  {
    title: ${JSON.stringify(s.title)},
    content: ${JSON.stringify(s.content)},${audioFile}
  }`
    })
    .join(',\n')

  const vocabulary = lesson.vocabulary
    .map(v => {
      const pos = v.partOfSpeech ? `\n    partOfSpeech: ${JSON.stringify(v.partOfSpeech)},` : ''
      const notes = v.notes ? `\n    notes: ${JSON.stringify(v.notes)},` : ''
      return `  {
    indonesian: ${JSON.stringify(v.indonesian)},
    english: ${JSON.stringify(v.english)},${pos}${notes}
  }`
    })
    .join(',\n')

  const grammarNotes = lesson.grammarNotes
    .map(n => `  ${JSON.stringify(n)}`)
    .join(',\n')

  return `// Lesson ${lesson.lessonNumber}: ${lesson.title}
// Auto-extracted from coursebook pages. Review and correct before committing.

export interface VocabularyItem {
  indonesian: string
  english: string
  partOfSpeech?: string
  notes?: string
}

export interface LessonSection {
  title: string
  content: string
  audioFile?: string
}

export const lesson${lesson.lessonNumber} = {
  lessonNumber: ${lesson.lessonNumber},
  title: ${JSON.stringify(lesson.title)},
  description: ${JSON.stringify(lesson.description)},
  sections: [
${sections}
  ] as LessonSection[],
  vocabulary: [
${vocabulary}
  ] as VocabularyItem[],
  grammarNotes: [
${grammarNotes}
  ],
}
`
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
