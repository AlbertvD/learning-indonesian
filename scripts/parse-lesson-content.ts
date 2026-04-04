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

/** Matches vocabulary lines with explicit separators (=, :, -) or from Woordenlijst sections */
function parseVocabularyLines(text: string, pageNum: number): LearningItemStaging[] {
  const items: LearningItemStaging[] = []
  const lines = text.split('\n')

  // Detect if we're in a vocabulary list section (after "Woordenlijst" header)
  let afterVocabListHeader = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Mark vocabulary list sections
    if (/Woordenlijst|Telwoorden/i.test(trimmed)) {
      afterVocabListHeader = true
      continue
    }

    // Exit vocabulary list on section headers or empty lines followed by headers
    if (/^(CULTUUR|GRAMMATICA|OEFENINGEN|Dialoog|DI HOTEL|YANG)/i.test(trimmed)) {
      afterVocabListHeader = false
      continue
    }

    if (!trimmed) continue

    // Process vocabulary from dash-prefixed lines (explicit format)
    if (line.startsWith('-')) {
      const content = line.replace(/^-\s*/, '').trim()
      const { indonesian, dutch } = parseVocabPair(content)
      if (indonesian && dutch) {
        if (isValidVocabEntry(indonesian, dutch)) {
          items.push(createVocabItem(indonesian, dutch, pageNum))
        }
      }
    }
    // Process vocabulary from Woordenlijst sections (space-separated pairs)
    // Only accept if it looks like two words separated by space
    else if (afterVocabListHeader && /^[a-z][a-zÀ-ÿ\s'-]*\s+[a-z]/i.test(trimmed)) {
      const parts = trimmed.split(/\s{2,}|\s+(?=[a-z]{3,})/i)
      if (parts.length === 2) {
        const indonesian = parts[0].trim()
        const dutch = parts[1].trim()
        if (isValidVocabEntry(indonesian, dutch)) {
          items.push(createVocabItem(indonesian, dutch, pageNum))
        }
      }
    }
  }

  return items
}

function parseVocabPair(content: string): { indonesian: string; dutch: string } {
  // Try explicit separator first (=, :, -)
  const separatorMatch = content.match(/^([A-Za-zÀ-ÿ\s'-]+(?:\([^)]*\))?)\s*[-=:]\s*(.+)$/)
  if (separatorMatch) {
    return { indonesian: separatorMatch[1].trim(), dutch: separatorMatch[2].trim() }
  }
  return { indonesian: '', dutch: '' }
}

function isValidVocabEntry(indonesian: string, dutch: string): boolean {
  if (indonesian.includes(':') || /^(CULTUUR|GRAMMATICA|OEFENINGEN|Woordenlijst|Dialoog|DI HOTEL|YANG|Telwoorden)/i.test(indonesian)) {
    return false
  }
  if (/^[A-Z][a-z\s]+$/.test(indonesian) && indonesian.length < 20) {
    return false
  }
  if (indonesian.length > 50 || dutch.length > 80) return false
  if (!/[a-zA-ZÀ-ÿ]/.test(indonesian)) return false
  if (/^(Tips|Contoh|Schematisch|Bij|Aantal|Noten|Pagina|\d+\.)/.test(indonesian)) return false
  return true
}

function createVocabItem(indonesian: string, dutch: string, pageNum: number): LearningItemStaging {
  return {
    base_text: indonesian,
    item_type: 'word',
    context_type: 'vocabulary_list',
    translation_nl: dutch,
    translation_en: '',
    source_page: pageNum,
    review_status: 'pending_review',
  }
}

/** Matches dialogue patterns like "A: text", "Speaker: text", or "Multi Word Speaker: text" */
function parseDialogueLines(text: string, pageNum: number): { section: LessonSection | null; items: LearningItemStaging[] } {
  const items: LearningItemStaging[] = []
  const lines: { speaker: string; text: string; translation: string }[] = []
  // Updated regex to handle multi-word speaker names (e.g., "Pak Ahmad:", "Ibu Dewi:", "A:", "Speaker:")
  const dialogueRegex = /^([A-Z][a-zA-ZÀ-ÿ\s]*?)\s*:\s*(.+)$/gm
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

  const lessonData = {
    title: `Les ${lessonNumber}`,
    description: '',
    level: 'A1',
    module_id: 'module-1',
    order_index: lessonNumber,
    sections: data.sections,
  }
  const lessonTs = `// Auto-generated by parse-lesson-content.ts — edit in review UI
export const lesson = ${JSON.stringify(lessonData, null, 2)}
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

/** Detect grammar sections (GRAMMATICA, OEFENINGEN, etc.) */
function detectGrammarSection(text: string): { isGrammar: boolean; sectionType: string; content: string } {
  // Check for section headers
  if (/^GRAMMATICA|^OEFENINGEN|^YANG\s*-/m.test(text)) {
    if (/^GRAMMATICA/m.test(text)) {
      return { isGrammar: true, sectionType: 'grammar', content: text }
    } else if (/^OEFENINGEN|^Oefening/m.test(text)) {
      return { isGrammar: true, sectionType: 'exercises', content: text }
    } else if (/^YANG\s*-/m.test(text)) {
      return { isGrammar: true, sectionType: 'grammar', content: text }
    }
  }
  return { isGrammar: false, sectionType: '', content: text }
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

    // Check for grammar/exercises sections first
    const { isGrammar, sectionType } = detectGrammarSection(text)
    let hasStructuredContent = false

    if (isGrammar) {
      allSections.push({
        title: sectionType === 'grammar' ? `Grammatica (pagina ${pageNum})` : `Oefeningen (pagina ${pageNum})`,
        content: { type: sectionType, body: text },
        order_index: allSections.length,
      })
      console.log(`  → ${sectionType} section`)
      hasStructuredContent = true
    }

    // Extract vocabulary (skip if contains dialogue markers)
    const hasDialogue = /^[A-Z][a-z\s]+\s*:\s+/m.test(text)
    const vocabItems = !hasDialogue && !isGrammar ? parseVocabularyLines(text, pageNum) : []
    allItems.push(...vocabItems)
    if (vocabItems.length > 0) {
      console.log(`  → ${vocabItems.length} vocabulary items`)
      hasStructuredContent = true
    }

    // Extract dialogues (always check, even on grammar pages)
    const { section: dialogueSection, items: dialogueItems } = parseDialogueLines(text, pageNum)
    if (dialogueSection) {
      dialogueSection.order_index = allSections.length
      allSections.push(dialogueSection)
      allItems.push(...dialogueItems)
      console.log(`  → dialogue section (${dialogueItems.length} lines)`)
      hasStructuredContent = true
    }

    // Extract sentence pairs
    const sentenceItems = parseSentencePairs(text, pageNum)
    allItems.push(...sentenceItems)
    if (sentenceItems.length > 0) {
      console.log(`  → ${sentenceItems.length} sentence pairs`)
      hasStructuredContent = true
    }

    // Add page as a text section if no structured content was found
    if (!hasStructuredContent) {
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
