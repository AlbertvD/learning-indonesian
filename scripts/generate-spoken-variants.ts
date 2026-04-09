#!/usr/bin/env bun
/**
 * generate-spoken-variants.ts — Stage 40 of content pipeline
 *
 * Reads a verified transcript and produces two spoken variant tracks:
 *   - learner_spoken: simplified, consistent (saya, tidak, high-freq vocab, short sentences)
 *   - natural_spoken: native-like (aku/kamu, nggak, discourse markers like sih/dong/kan)
 *
 * Both tracks maintain 1:1 line alignment with the source transcript.
 *
 * Usage:
 *   bun scripts/generate-spoken-variants.ts <lesson-number>
 *   bun scripts/generate-spoken-variants.ts <lesson-number> --input path/to/transcript.txt
 *   bun scripts/generate-spoken-variants.ts <lesson-number> --dry-run
 *
 * Default input:  content/30_reviewed/lesson-<N>/transcript_verified.txt
 * Output:         content/40_spoken/lesson-<N>/learner_spoken.txt
 *                 content/40_spoken/lesson-<N>/natural_spoken.txt
 *                 content/40_spoken/lesson-<N>/style_decisions.json
 *                 content/40_spoken/lesson-<N>/status.json
 *
 * Options:
 *   --input <path>   Override input file path
 *   --dry-run        Print output to stdout without writing files
 *   --help           Show this help message
 */

import fs from 'fs'
import path from 'path'
import { parseTranscript, generateSpokenVariants } from './spoken-variant-generator/transform.js'
import type { StageStatus } from './spoken-variant-generator/types.js'

// ── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2)

if (args.includes('--help') || args.length === 0) {
  console.log(`
Usage: bun scripts/generate-spoken-variants.ts <lesson-number> [options]

Reads a verified transcript and produces two spoken variant tracks:
  - learner_spoken.txt  (simplified, consistent saya/tidak, short sentences)
  - natural_spoken.txt  (native-like aku/kamu, nggak, discourse markers)

Options:
  --input <path>   Override input file path (default: content/30_reviewed/lesson-<N>/transcript_verified.txt)
  --dry-run        Print output to stdout without writing files
  --help           Show this help message

Output (written to content/40_spoken/lesson-<N>/):
  learner_spoken.txt     Learner-friendly spoken variant
  natural_spoken.txt     Natural/native spoken variant
  style_decisions.json   Every transformation decision with rule + line number
  status.json            Stage completion status
  `)
  process.exit(args.includes('--help') ? 0 : 1)
}

const lessonNumber = parseInt(args[0], 10)
if (isNaN(lessonNumber) || lessonNumber < 1) {
  console.error('Error: first argument must be a positive lesson number.')
  process.exit(1)
}

const dryRun = args.includes('--dry-run')

const inputIdx = args.indexOf('--input')
const inputOverride = inputIdx !== -1 ? args[inputIdx + 1] : null

// ── Paths ────────────────────────────────────────────────────────────────────

const projectRoot = path.resolve(import.meta.dir, '..')
const defaultInput = path.join(
  projectRoot,
  'content',
  '30_reviewed',
  `lesson-${lessonNumber}`,
  'transcript_verified.txt'
)
const inputPath = inputOverride
  ? path.resolve(inputOverride)
  : defaultInput

const outputDir = path.join(
  projectRoot,
  'content',
  '40_spoken',
  `lesson-${lessonNumber}`
)

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Read input
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: input file not found: ${inputPath}`)
    console.error(
      `\nTo create a sample input, place a verified transcript at:\n  ${defaultInput}`
    )
    process.exit(1)
  }

  const transcriptText = fs.readFileSync(inputPath, 'utf-8')
  const lines = parseTranscript(transcriptText)

  console.log(`Reading ${lines.length} lines from ${path.relative(projectRoot, inputPath)}`)

  // Transform
  const output = generateSpokenVariants(lines)

  const stats = {
    totalLines: lines.length,
    transformedLines: output.styleDecisions.length,
    learnerTransformations: output.styleDecisions.reduce(
      (sum, d) => sum + d.transformations.filter(t => t.track === 'learner' || t.track === 'both').length,
      0
    ),
    naturalTransformations: output.styleDecisions.reduce(
      (sum, d) => sum + d.transformations.filter(t => t.track === 'natural' || t.track === 'both').length,
      0
    ),
  }

  console.log(`Transformations: ${stats.transformedLines} lines affected`)
  console.log(`  Learner track: ${stats.learnerTransformations} changes`)
  console.log(`  Natural track: ${stats.naturalTransformations} changes`)

  if (dryRun) {
    console.log('\n--- LEARNER SPOKEN ---')
    console.log(output.learnerSpoken.join('\n'))
    console.log('\n--- NATURAL SPOKEN ---')
    console.log(output.naturalSpoken.join('\n'))
    console.log('\n--- STYLE DECISIONS ---')
    console.log(JSON.stringify(output.styleDecisions, null, 2))
    console.log('\n(dry run — no files written)')
    return
  }

  // Write output
  fs.mkdirSync(outputDir, { recursive: true })

  const learnerPath = path.join(outputDir, 'learner_spoken.txt')
  const naturalPath = path.join(outputDir, 'natural_spoken.txt')
  const decisionsPath = path.join(outputDir, 'style_decisions.json')
  const statusPath = path.join(outputDir, 'status.json')

  fs.writeFileSync(learnerPath, output.learnerSpoken.join('\n'), 'utf-8')
  fs.writeFileSync(naturalPath, output.naturalSpoken.join('\n'), 'utf-8')
  fs.writeFileSync(
    decisionsPath,
    JSON.stringify(output.styleDecisions, null, 2),
    'utf-8'
  )

  const status: StageStatus = {
    stage: '40_spoken',
    status: 'complete',
    timestamp: new Date().toISOString(),
    sourceFile: path.relative(projectRoot, inputPath),
    outputFiles: [
      path.relative(projectRoot, learnerPath),
      path.relative(projectRoot, naturalPath),
      path.relative(projectRoot, decisionsPath),
      path.relative(projectRoot, statusPath),
    ],
    stats,
  }

  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf-8')

  console.log(`\nOutput written to ${path.relative(projectRoot, outputDir)}/`)
  console.log('  learner_spoken.txt')
  console.log('  natural_spoken.txt')
  console.log('  style_decisions.json')
  console.log('  status.json')
}

main()
