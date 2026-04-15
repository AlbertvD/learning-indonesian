#!/usr/bin/env bun
/**
 * build-sections.ts — Step 5 of content pipeline (linguist-structurer)
 *
 * Reads raw grammar/exercise body text from lesson.ts and uses Claude to structure it
 * into typed section content (grammar categories + exercise sections). Also reads
 * grammar-patterns.ts and learning-items.ts to ground the grammar explanation in real
 * vocabulary.
 *
 * Only grammar and exercises sections with a `body` field (unstructured raw text) are
 * processed. All other section types (vocabulary, dialogue, text, etc.) are passed
 * through unchanged.
 *
 * Usage:
 *   bun scripts/build-sections.ts <lesson-number> [--force] [--dry-run]
 *
 * Options:
 *   --force      Overwrite already-structured sections (re-runs Claude on all raw sections)
 *   --dry-run    Print what would be written but do not modify lesson.ts
 *
 * Reads:   scripts/data/staging/lesson-<N>/lesson.ts
 *          scripts/data/staging/lesson-<N>/grammar-patterns.ts
 *          scripts/data/staging/lesson-<N>/learning-items.ts
 *
 * Writes:  scripts/data/staging/lesson-<N>/lesson.ts
 *
 * Requires: ANTHROPIC_API_KEY in environment or .env.local
 */

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

import {
  loadEnv,
  requireStagingDir,
  readStagingFile,
  type LessonData,
  type LessonSection,
  type GrammarPattern,
} from './lib/staging-utils'

// ── Prompts ───────────────────────────────────────────────────────────────────

const GRAMMAR_SYSTEM_PROMPT = `You are a Dutch-Indonesian linguist. Your task is to structure raw grammar notes from a 1980s Indonesian language coursebook (written in Dutch) into a JSON array of categories for display in a language learning app.

Each category should have:
- "title": a clear Dutch heading for this grammar rule or usage
- "rules": array of concise Dutch explanation strings (1–4 per category)
- "examples": array of { "indonesian": "...", "dutch": "..." } pairs (2–5 per category)
- Optional: "table": array of [indonesian, dutch] row pairs — use ONLY for reference tables like days/months/numbers, not for grammar rules

Guidelines:
- Split compound grammar explanations into separate logical categories
- Preserve all example sentences from the raw text — they are the most valuable teaching content
- Deduplicate examples that appear more than once
- Rules should be actionable guidance, not vague summaries
- Do NOT include the word "Grammatica" or the section title in the categories themselves
- Grammar patterns to emphasize are provided as context — make sure each pattern slug appears in at least one category

Respond with ONLY a valid JSON array — no prose, no markdown fences.

Example:
[
  {
    "title": "Yang als betrekkelijk voornaamwoord (die/dat)",
    "rules": [
      "Yang koppelt als betrekkelijk voornaamwoord een bijzin aan het voorgaande zelfstandig naamwoord.",
      "Yang staat altijd direct na het woord of de woordgroep waarnaar verwezen wordt."
    ],
    "examples": [
      { "indonesian": "Pisang yang terlalu tua tidak enak", "dutch": "Een banaan die te oud is, is niet lekker" }
    ]
  }
]`

const EXERCISES_SYSTEM_PROMPT = `You are a Dutch-Indonesian linguist. Your task is to structure raw exercise content from a 1980s Indonesian language coursebook (written in Dutch) into a JSON array of exercise sections.

Each exercise section should have:
- "title": the exercise label, e.g. "Oefening I" or "Oefening 2"
- "instruction": the Dutch instruction text for the exercise
- "type": one of "grammar_drill", "fill_in", "translation", "open"
  - grammar_drill: translate or produce Indonesian using a specific grammar pattern
  - fill_in: complete sentences or fill in blanks
  - translation: translate between Dutch and Indonesian
  - open: free-form production or composition exercises
- "items": array of { "prompt": "...", "answer": "..." } pairs
  - For translation and grammar_drill exercises, "answer" should be the target language output
  - For fill_in exercises, "answer" is the correct completion
  - For open exercises, "answer" may be empty or a model answer

Guidelines:
- Preserve ALL exercise items exactly as they appear — do not drop items
- The instruction often appears before the numbered list, or as a header like "Vertaal:" or "Maak zinnen met..."
- If multiple exercises are mixed in the raw text, split them into separate sections
- Infer the exercise type from the instruction and item content

Respond with ONLY a valid JSON array — no prose, no markdown fences.

Example:
[
  {
    "title": "Oefening I",
    "instruction": "Vertaal en gebruik in elke zin yang.",
    "type": "grammar_drill",
    "items": [
      { "prompt": "Het huis van Jan dat groot is, is mooi", "answer": "Rumah Jan yang besar bagus" }
    ]
  }
]`

// ── Claude calls ──────────────────────────────────────────────────────────────

async function structureGrammarSection(
  client: Anthropic,
  sectionTitle: string,
  rawBody: string,
  grammarPatterns: GrammarPattern[],
): Promise<Record<string, unknown>> {
  const patternContext = grammarPatterns.length > 0
    ? `\nGrammar patterns for this lesson:\n${grammarPatterns.map(p =>
        `- ${p.slug}: ${p.pattern_name} — ${p.description.slice(0, 120)}`
      ).join('\n')}\n`
    : ''

  const userMessage = `Section title: "${sectionTitle}"${patternContext}\nRaw grammar text:\n\n${rawBody}\n\nStructure this into a JSON array of grammar categories.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: GRAMMAR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = message.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error(`No text response from Claude for grammar section: ${sectionTitle}`)
  }

  const cleaned = block.text
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim()

  let categories: unknown
  try {
    categories = JSON.parse(cleaned)
  } catch {
    throw new Error(
      `Claude returned invalid JSON for grammar section "${sectionTitle}".\nRaw response:\n${block.text.slice(0, 300)}`
    )
  }

  return { type: 'grammar', categories }
}

async function structureExercisesSection(
  client: Anthropic,
  sectionTitle: string,
  rawBody: string,
): Promise<Record<string, unknown>> {
  const userMessage = `Section title: "${sectionTitle}"\n\nRaw exercises text:\n\n${rawBody}\n\nStructure this into a JSON array of exercise sections.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: EXERCISES_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = message.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error(`No text response from Claude for exercises section: ${sectionTitle}`)
  }

  const cleaned = block.text
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim()

  let sections: unknown
  try {
    sections = JSON.parse(cleaned)
  } catch {
    throw new Error(
      `Claude returned invalid JSON for exercises section "${sectionTitle}".\nRaw response:\n${block.text.slice(0, 300)}`
    )
  }

  return { type: 'exercises', sections }
}

// ── Section filtering ─────────────────────────────────────────────────────────

/**
 * Returns true if a section content block is still raw (has `body` field, not yet structured).
 */
function isRawSection(content: Record<string, unknown>): boolean {
  return typeof content.body === 'string' && content.body.trim().length > 0
}

function isGrammarSection(content: Record<string, unknown>): boolean {
  return content.type === 'grammar' || content.type === 'reference_table'
}

function isExercisesSection(content: Record<string, unknown>): boolean {
  return content.type === 'exercises'
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const args = process.argv.slice(2)
  const lessonNumber = parseInt(args[0], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/build-sections.ts <lesson-number> [--force] [--dry-run]')
    process.exit(1)
  }

  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set in environment or .env.local')
    process.exit(1)
  }

  const dir = requireStagingDir(lessonNumber)
  const lessonPath = path.join(dir, 'lesson.ts')

  if (!fs.existsSync(lessonPath)) {
    console.error(`Error: lesson.ts not found at ${lessonPath}`)
    console.error('Run first: bun scripts/generate-staging-files.ts ' + lessonNumber)
    process.exit(1)
  }

  // Load lesson data
  const lessonData: LessonData = await readStagingFile(lessonPath)
  if (!lessonData) {
    console.error('Error: Could not read lesson data from lesson.ts')
    process.exit(1)
  }

  // Load grammar patterns for grounding
  const grammarPatternsPath = path.join(dir, 'grammar-patterns.ts')
  const grammarPatterns: GrammarPattern[] = (await readStagingFile(grammarPatternsPath)) ?? []

  // Find sections that need structuring
  const rawSections = lessonData.sections.filter((section: LessonSection) => {
    const content = section.content as Record<string, unknown>
    if (!isRawSection(content)) return false
    if (!isGrammarSection(content) && !isExercisesSection(content)) return false
    return true
  })

  const alreadyStructured = lessonData.sections.filter((section: LessonSection) => {
    const content = section.content as Record<string, unknown>
    if (!isGrammarSection(content) && !isExercisesSection(content)) return false
    return !isRawSection(content) && (content.categories || content.sections)
  })

  if (rawSections.length === 0 && !force) {
    if (alreadyStructured.length > 0) {
      console.log(`Lesson ${lessonNumber}: all grammar/exercise sections already structured (${alreadyStructured.length} found).`)
      console.log('Use --force to re-run Claude on already-structured sections.')
    } else {
      console.log(`Lesson ${lessonNumber}: no grammar or exercise sections found.`)
    }
    process.exit(0)
  }

  // If force mode, re-run on already-structured sections too
  const sectionsToProcess = force
    ? lessonData.sections.filter((section: LessonSection) => {
        const content = section.content as Record<string, unknown>
        return isGrammarSection(content) || isExercisesSection(content)
      })
    : rawSections

  console.log(`\nBuilding sections for lesson ${lessonNumber} (${lessonData.title})...`)
  console.log(`  Sections to structure: ${sectionsToProcess.length}`)
  console.log(`  Grammar patterns loaded: ${grammarPatterns.length}`)
  if (dryRun) console.log('  [DRY RUN] — lesson.ts will not be modified')
  console.log()

  const client = new Anthropic({ apiKey })

  const updatedSections: LessonSection[] = [...lessonData.sections]
  let processed = 0
  let skipped = 0

  for (const section of sectionsToProcess) {
    const content = section.content as Record<string, unknown>
    const sectionIdx = updatedSections.findIndex(s => s.order_index === section.order_index)
    if (sectionIdx === -1) continue

    // Determine the raw body — either from `body` field (raw) or reconstruct from existing structure
    let rawBody = ''
    if (typeof content.body === 'string') {
      rawBody = content.body.trim()
    } else if (force) {
      // In force mode, reconstruct a text summary from existing structure so Claude can re-process
      if (Array.isArray(content.categories)) {
        rawBody = (content.categories as any[]).map(c =>
          `${c.title}\n${(c.rules ?? []).join('\n')}\n${(c.examples ?? []).map((e: any) => `${e.indonesian} = ${e.dutch}`).join('\n')}`
        ).join('\n\n')
      } else if (Array.isArray(content.sections)) {
        rawBody = (content.sections as any[]).map(s =>
          `${s.title}\n${s.instruction}\n${(s.items ?? []).map((i: any) => `- ${i.prompt} → ${i.answer}`).join('\n')}`
        ).join('\n\n')
      }
    }

    if (!rawBody) {
      console.log(`  SKIP (no body): ${section.title}`)
      skipped++
      continue
    }

    console.log(`  Processing: ${section.title} (${content.type})...`)

    try {
      let structuredContent: Record<string, unknown>

      if (isGrammarSection(content)) {
        // Filter grammar patterns relevant to this section by matching page_reference ranges
        const sectionPatterns = grammarPatterns.length > 0 ? grammarPatterns : []
        structuredContent = await structureGrammarSection(
          client,
          section.title,
          rawBody,
          sectionPatterns,
        )
      } else {
        structuredContent = await structureExercisesSection(client, section.title, rawBody)
      }

      if (dryRun) {
        const preview = JSON.stringify(structuredContent).slice(0, 200)
        console.log(`    [DRY RUN] Would write: ${preview}...`)
      } else {
        updatedSections[sectionIdx] = {
          ...section,
          content: structuredContent,
        }
      }

      processed++
    } catch (err) {
      console.error(`  ERROR processing "${section.title}":`, err instanceof Error ? err.message : err)
      skipped++
    }
  }

  if (!dryRun && processed > 0) {
    // Reconstruct lesson.ts with updated sections
    const updatedLesson = { ...lessonData, sections: updatedSections }
    const output = `// Generated by generate-staging-files.ts from sections-catalog.json
// Grammar and exercise sections structured by build-sections.ts (linguist-structurer).
export const lesson = ${JSON.stringify(updatedLesson, null, 2)}
`
    fs.writeFileSync(lessonPath, output)
    console.log(`\n  WRITE: lesson.ts (${processed} sections structured)`)
  }

  console.log(`\nSummary:`)
  console.log(`  Structured: ${processed}`)
  console.log(`  Skipped: ${skipped}`)

  if (!dryRun && processed > 0) {
    console.log('\nNext steps:')
    console.log(`  1. Review the structured sections in scripts/data/staging/lesson-${lessonNumber}/lesson.ts`)
    console.log(`  2. bun scripts/generate-exercises.ts ${lessonNumber}`)
    console.log(`  3. bun scripts/publish-approved-content.ts ${lessonNumber}`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
