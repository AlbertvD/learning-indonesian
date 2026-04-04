#!/usr/bin/env bun
/**
 * extract-lesson-local.ts
 *
 * Mock textbook extraction for local testing (no API calls).
 * Generates realistic sample lesson data for the content pipeline.
 *
 * Usage:
 *   bun scripts/extract-lesson-local.ts <lesson-number>
 *   e.g.: bun scripts/extract-lesson-local.ts 4
 *
 * Writes:
 *   scripts/data/lesson-<N>.ts
 *   scripts/data/staging/lesson-<N>/
 *     ├── pages.ts
 *     ├── grammar-patterns.ts
 *     ├── candidates.ts
 *     └── index.ts
 */

import fs from 'fs'
import path from 'path'

const lessonNumber = parseInt(process.argv[2] || '4', 10)
const contentDir = path.join(process.cwd(), 'content/raw', `lesson-${lessonNumber}`)
const stagingDir = path.join(process.cwd(), 'scripts/data/staging', `lesson-${lessonNumber}`)

// ---------------------------------------------------------------------------
// Mock Data Generator
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

interface ExerciseCandidate {
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

function generateMockPages(): TextbookPage[] {
  return [
    {
      page_number: 1,
      textbook_source_id: `lesson-${lessonNumber}-page-1`,
      raw_text: `Pelajaran ${lessonNumber}: Memperkenalkan Diri

Nama saya adalah Ahmad. Saya tinggal di Jakarta. Saya bekerja sebagai guru.
Hobi saya adalah membaca dan bermain olahraga.

Kosakata baru:
- memperkenalkan = to introduce
- tinggal = to live
- bekerja = to work
- guru = teacher
- hobi = hobby
- membaca = to read
- bermain = to play
- olahraga = sports`,
      extracted_at: new Date().toISOString(),
    },
    {
      page_number: 2,
      textbook_source_id: `lesson-${lessonNumber}-page-2`,
      raw_text: `Percakapan:

A: Siapa nama Anda?
B: Nama saya Budi. Senang berkenalan dengan Anda.

A: Dari mana Anda?
B: Saya dari Surabaya. Anda berasal dari mana?

A: Saya berasal dari Bandung.
B: Apa pekerjaan Anda?

A: Saya adalah seorang insinyur.`,
      extracted_at: new Date().toISOString(),
    },
  ]
}

function generateMockGrammarPatterns(): GrammarPattern[] {
  return [
    {
      pattern_name: 'Present Tense: Saya + verb',
      description: 'Personal actions or states: "Saya bekerja", "Saya tinggal"',
      confusion_group: 'subject_verb_agreement',
      page_reference: 1,
    },
    {
      pattern_name: 'Question Formation: Dari mana?',
      description: 'Asking about origin or location',
      confusion_group: 'question_words',
      page_reference: 2,
    },
    {
      pattern_name: 'Professions: seorang + noun',
      description: 'Expressing occupation with indefinite article equivalent',
      confusion_group: 'noun_phrases',
      page_reference: 2,
    },
  ]
}

function generateMockCandidates(): ExerciseCandidate[] {
  return [
    {
      exercise_type: 'contrast_pair',
      page_reference: 1,
      grammar_pattern_id: 'subject_verb_agreement',
      source_text: 'Saya bekerja sebagai guru.',
      prompt_text_nl: 'Welke zin is correct voor "Ik werk als leraar"?',
      prompt_text_en: 'Which sentence is correct for "I work as a teacher"?',
      answer_key: ['0'],
      correctOptionId: '0',
      options: ['Saya bekerja sebagai guru.', 'Saya bekerja seperti guru.'],
      explanation_nl: 'Gebruik "sebagai" (als) voor beroepen, niet "seperti" (zoals)',
      explanation_en: 'Use "sebagai" (as) for professions, not "seperti" (like)',
      review_status: 'pending_review',
      created_at: new Date().toISOString(),
    },
    {
      exercise_type: 'sentence_transformation',
      page_reference: 2,
      grammar_pattern_id: 'question_words',
      source_text: 'Anda berasal dari mana?',
      transformationInstruction_nl: 'Zet om naar bewering: "Ik kom uit Jakarta"',
      transformationInstruction_en: 'Transform to statement: "I come from Jakarta"',
      expected_answer_nl: 'Saya berasal dari Jakarta',
      expected_answer_en: 'I come from Jakarta',
      answer_key: ['Saya berasal dari Jakarta', 'Saya berasal dari Jakarta.'],
      explanation_nl: 'Verander de vraag in een bewering door "Anda" (u) te vervangen door "Saya" (ik) en een locatie op te geven.',
      explanation_en: 'Change the question to a statement by replacing "Anda" (you) with "Saya" (I) and providing a location.',
      review_status: 'pending_review',
      created_at: new Date().toISOString(),
    },
    {
      exercise_type: 'constrained_translation',
      page_reference: 2,
      grammar_pattern_id: 'noun_phrases',
      source_text: 'I am an engineer.',
      prompt_text_nl: 'Vertaal: "Ik ben een ingenieur." (Gebruik: seorang, insinyur)',
      prompt_text_en: 'Translate: "I am an engineer." (Use: seorang, insinyur)',
      answer_key: ['Saya seorang insinyur', 'Saya adalah seorang insinyur'],
      requiredTargetPattern: 'seorang insinyur',
      explanation_nl: 'In het Indonesisch gebruiken beroepen "seorang" (een/a) + zelfstandig naamwoord. Je kunt "adalah" weglaten.',
      explanation_en: 'In Indonesian, professions use "seorang" (an/a) + noun. You can omit "adalah".',
      review_status: 'pending_review',
      created_at: new Date().toISOString(),
    },
    {
      exercise_type: 'speaking',
      page_reference: 1,
      source_text: 'Memperkenalkan diri',
      prompt_text_nl: 'Stel jezelf voor: naam, waar je vandaan komt en je beroep',
      prompt_text_en: 'Introduce yourself: name, where you are from, and your occupation',
      answer_key: ['Open-ended'],
      explanation_nl: 'Gebruik de patronen: "Nama saya...", "Saya dari...", "Saya seorang..."',
      explanation_en: 'Use the patterns: "Nama saya...", "Saya dari...", "Saya seorang..."',
      targetPatternOrScenario: 'Self-introduction with name, origin, and profession',
      review_status: 'pending_review',
      created_at: new Date().toISOString(),
    },
  ]
}

// ---------------------------------------------------------------------------
// File Writing
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writePagesFile(pages: TextbookPage[]) {
  const content = `// Auto-generated from lesson ${lessonNumber} extraction (local mock)
export const pages = ${JSON.stringify(pages, null, 2)} as const
`
  fs.writeFileSync(path.join(stagingDir, 'pages.ts'), content)
  console.log(`✓ Written: scripts/data/staging/lesson-${lessonNumber}/pages.ts`)
}

function writePatternsFile(patterns: GrammarPattern[]) {
  const content = `// Auto-generated from lesson ${lessonNumber} extraction (local mock)
export const grammarPatterns = ${JSON.stringify(patterns, null, 2)} as const
`
  fs.writeFileSync(path.join(stagingDir, 'grammar-patterns.ts'), content)
  console.log(`✓ Written: scripts/data/staging/lesson-${lessonNumber}/grammar-patterns.ts`)
}

function writeCandidatesFile(candidates: ExerciseCandidate[]) {
  const content = `// Auto-generated from lesson ${lessonNumber} extraction (local mock)
// Status: pending_review
export const candidates = ${JSON.stringify(candidates, null, 2)} as const
`
  fs.writeFileSync(path.join(stagingDir, 'candidates.ts'), content)
  console.log(`✓ Written: scripts/data/staging/lesson-${lessonNumber}/candidates.ts`)
}

function writeIndexFile() {
  const content = `export { pages } from './pages'
export { grammarPatterns } from './grammar-patterns'
export { candidates } from './candidates'
`
  fs.writeFileSync(path.join(stagingDir, 'index.ts'), content)
  console.log(`✓ Written: scripts/data/staging/lesson-${lessonNumber}/index.ts`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log(`\nExtracting lesson ${lessonNumber} (local mock, no API calls)\n`)

  // Verify content dir exists
  if (!fs.existsSync(contentDir)) {
    console.error(`✗ Error: ${contentDir} not found`)
    process.exit(1)
  }

  // Count images
  const files = fs.readdirSync(contentDir)
  const imageCount = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f)).length
  console.log(`Found ${imageCount} image(s)`)

  // Generate mock data
  const pages = generateMockPages()
  const patterns = generateMockGrammarPatterns()
  const candidates = generateMockCandidates()

  // Ensure staging dir
  ensureDir(stagingDir)

  // Write files
  writePagesFile(pages)
  writePatternsFile(patterns)
  writeCandidatesFile(candidates)
  writeIndexFile()

  console.log(`\n✓ Extraction complete (mock data)`)
  console.log(`\nNext steps:`)
  console.log(`1. Review: bun scripts/generate-exercise-candidates.ts ${lessonNumber}`)
  console.log(`2. Then: Review in tools/review/ UI`)
  console.log(`3. Finally: bun scripts/publish-approved-content.ts ${lessonNumber}`)
}

main()
