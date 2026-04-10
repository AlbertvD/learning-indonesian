/**
 * staging-utils.ts — shared utilities for staging file I/O
 *
 * Used by build-sections.ts, generate-exercises.ts, and other pipeline scripts.
 */

import fs from 'fs'
import path from 'path'

// ── .env.local loader ─────────────────────────────────────────────────────────

export function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const val = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
      process.env[match[1].trim()] = val
    }
  }
}

// ── Staging directory helpers ─────────────────────────────────────────────────

export function stagingDir(lessonNumber: number): string {
  return path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)
}

export function requireStagingDir(lessonNumber: number): string {
  const dir = stagingDir(lessonNumber)
  if (!fs.existsSync(dir)) {
    console.error(`Error: Staging directory not found: ${dir}`)
    console.error('Run first: bun scripts/generate-staging-files.ts ' + lessonNumber)
    process.exit(1)
  }
  return dir
}

// ── Dynamic import for .ts staging files ─────────────────────────────────────

/**
 * Import a staging TypeScript file and return the first exported value.
 * Returns null when the file is absent or has no exports.
 */
export async function readStagingFile(filePath: string): Promise<any> {
  if (!fs.existsSync(filePath)) return null
  const module = await import(`file://${filePath}`)
  const values = Object.values(module)
  return values.length > 0 ? values[0] : null
}

// ── Sections-catalog reader ───────────────────────────────────────────────────

export interface VocabItem { indonesian: string; dutch: string }
export interface DialogueLine { speaker: string; text: string }

export type SectionType =
  | 'vocabulary' | 'expressions' | 'numbers'
  | 'grammar' | 'exercises' | 'dialogue'
  | 'text' | 'pronunciation' | 'reference_table'

export interface CatalogSection {
  id: number
  type: SectionType
  title: string
  source_pages: number[]
  confidence: 'high' | 'medium' | 'low'
  items?: VocabItem[]
  lines?: DialogueLine[]
  paragraphs?: string[]
  raw_text?: string
}

export interface SectionsCatalog {
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

export function readCatalog(lessonNumber: number): SectionsCatalog {
  const dir = stagingDir(lessonNumber)
  const catalogPath = path.join(dir, 'sections-catalog.json')
  if (!fs.existsSync(catalogPath)) {
    console.error(`Error: sections-catalog.json not found at ${catalogPath}`)
    console.error('Run first: bun scripts/catalog-lesson-sections.ts ' + lessonNumber)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(catalogPath, 'utf-8')) as SectionsCatalog
}

// ── Lesson section types (as stored in lesson.ts) ────────────────────────────

export interface GrammarExample {
  indonesian: string
  dutch: string
}

export interface GrammarCategory {
  title: string
  rules?: string[]
  examples?: GrammarExample[]
  table?: string[][]
}

export interface GrammarSectionContent {
  type: 'grammar'
  categories: GrammarCategory[]
}

export interface ExerciseItem {
  prompt: string
  answer?: string
}

export interface ExerciseSection {
  title: string
  instruction: string
  type: 'grammar_drill' | 'fill_in' | 'translation' | 'open'
  items: ExerciseItem[]
}

export interface ExercisesSectionContent {
  type: 'exercises'
  sections: ExerciseSection[]
}

export interface RawSectionContent {
  type: SectionType
  body: string
}

export interface LessonSection {
  title: string
  order_index: number
  content: Record<string, unknown>
}

export interface LessonData {
  title: string
  description: string
  level: string
  module_id: string
  order_index: number
  sections: LessonSection[]
}

// ── Grammar pattern type ──────────────────────────────────────────────────────

export interface GrammarPattern {
  pattern_name: string
  description: string
  confusion_group: string | null
  page_reference: number
  slug: string
  complexity_score: number
}

// ── Candidate type ────────────────────────────────────────────────────────────

export type ExerciseType =
  | 'contrast_pair'
  | 'sentence_transformation'
  | 'constrained_translation'
  | 'cloze_mcq'

export interface Candidate {
  exercise_type: ExerciseType
  grammar_pattern_slug: string
  source_page: number
  review_status: 'pending_review' | 'approved' | 'rejected' | 'published'
  requiresManualApproval?: boolean
  payload: Record<string, unknown>
}

// ── Write helpers ─────────────────────────────────────────────────────────────

export function writeAlways(filePath: string, content: string, label: string) {
  fs.writeFileSync(filePath, content)
  console.log(`  WRITE: ${label}`)
}

export function writeIfAbsent(filePath: string, content: string, label: string) {
  if (fs.existsSync(filePath)) {
    console.log(`  SKIP (exists): ${label}`)
    return
  }
  fs.writeFileSync(filePath, content)
  console.log(`  SCAFFOLD: ${label}`)
}
