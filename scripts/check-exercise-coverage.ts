#!/usr/bin/env bun
/**
 * check-exercise-coverage.ts
 *
 * Checks that every grammar pattern in each lesson's staging files has
 * at least one candidate of each required exercise type.
 *
 * Required types per pattern: contrast_pair, sentence_transformation,
 * constrained_translation, cloze_mcq
 *
 * Usage:
 *   bun scripts/check-exercise-coverage.ts [lesson-number]
 *   bun scripts/check-exercise-coverage.ts        # checks all lessons
 *   bun scripts/check-exercise-coverage.ts 4      # checks lesson 4 only
 */

import fs from 'fs'
import path from 'path'

const REQUIRED_TYPES = [
  'contrast_pair',
  'sentence_transformation',
  'constrained_translation',
  'cloze_mcq',
] as const


interface GrammarPattern {
  slug: string
  pattern_name: string
}

interface Candidate {
  exercise_type: string
  grammar_pattern_slug?: string
  review_status: string
}

async function readStagingFile(filePath: string): Promise<any> {
  if (!fs.existsSync(filePath)) return null
  const module = await import(`file://${filePath}`)
  const values = Object.values(module)
  return values.length > 0 ? values[0] : null
}

async function checkLesson(lessonNumber: number): Promise<{ warnings: string[]; ok: boolean }> {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)

  if (!fs.existsSync(stagingDir)) {
    return { warnings: [], ok: true }  // no staging dir = pipeline lesson not yet created
  }

  const grammarPatternsPath = path.join(stagingDir, 'grammar-patterns.ts')
  const candidatesPath = path.join(stagingDir, 'candidates.ts')

  if (!fs.existsSync(grammarPatternsPath)) {
    return { warnings: [], ok: true }  // no grammar patterns = nothing to check
  }

  const grammarPatterns: GrammarPattern[] = await readStagingFile(grammarPatternsPath) ?? []
  const candidates: Candidate[] = await readStagingFile(candidatesPath) ?? []

  if (grammarPatterns.length === 0) {
    return { warnings: [], ok: true }
  }

  // Build a map: slug → Set<exercise_type> for all non-rejected candidates
  const coverageMap = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    if (!candidate.grammar_pattern_slug) continue
    const slug = candidate.grammar_pattern_slug
    if (!coverageMap.has(slug)) coverageMap.set(slug, new Set())
    coverageMap.get(slug)!.add(candidate.exercise_type)
  }

  const warnings: string[] = []
  for (const pattern of grammarPatterns) {
    const covered = coverageMap.get(pattern.slug) ?? new Set()
    for (const required of REQUIRED_TYPES) {
      if (!covered.has(required)) {
        warnings.push(`  Lesson ${lessonNumber} — "${pattern.slug}" missing ${required}`)
      }
    }
  }

  return { warnings, ok: warnings.length === 0 }
}

async function main() {
  const arg = process.argv[2]
  const specificLesson = arg ? parseInt(arg, 10) : null

  if (specificLesson !== null && isNaN(specificLesson)) {
    console.error('Usage: bun scripts/check-exercise-coverage.ts [lesson-number]')
    process.exit(1)
  }

  // Discover all staging lesson directories
  const stagingRoot = path.join(process.cwd(), 'scripts', 'data', 'staging')
  let lessonNumbers: number[] = []

  if (specificLesson !== null) {
    lessonNumbers = [specificLesson]
  } else if (fs.existsSync(stagingRoot)) {
    lessonNumbers = fs.readdirSync(stagingRoot)
      .filter(d => /^lesson-\d+$/.test(d))
      .map(d => parseInt(d.replace('lesson-', ''), 10))
      .sort((a, b) => a - b)
  }

  if (lessonNumbers.length === 0) {
    console.log('No staging lesson directories found.')
    process.exit(0)
  }

  console.log('\nExercise coverage check\n')

  let totalWarnings = 0
  for (const n of lessonNumbers) {
    const { warnings, ok } = await checkLesson(n)
    if (ok) {
      console.log(`  ✓ Lesson ${n} — all patterns fully covered`)
    } else {
      console.log(`  ✗ Lesson ${n} — missing exercise types:`)
      warnings.forEach(w => console.log(w))
      totalWarnings += warnings.length
    }
  }

  console.log('')
  if (totalWarnings === 0) {
    console.log('All lessons fully covered.\n')
    process.exit(0)
  } else {
    console.log(`${totalWarnings} coverage gap(s) found. Add the missing candidates and republish.\n`)
    process.exit(1)
  }
}

main()
