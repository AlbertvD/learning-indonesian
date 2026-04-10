#!/usr/bin/env bun
/**
 * generate-exercises.ts — Step 5b of content pipeline (linguist-creator)
 *
 * Reads grammar patterns and lesson vocabulary/dialogue from staging files and uses
 * Claude to generate exercise candidates for each grammar pattern. Writes (or merges
 * into) candidates.ts.
 *
 * Generated exercise types per grammar pattern:
 *   - contrast_pair           — choose between two confusable forms
 *   - sentence_transformation — rewrite a sentence using a grammar rule
 *   - constrained_translation — translate using a required grammar target
 *   - cloze_mcq               — fill-in-the-blank multiple choice (4 options)
 *
 * Usage:
 *   bun scripts/generate-exercises.ts <lesson-number> [options]
 *
 * Options:
 *   --pattern <slug>   Only generate for a specific grammar pattern slug
 *   --types <list>     Comma-separated list of exercise types to generate
 *                      (default: contrast_pair,sentence_transformation,constrained_translation,cloze_mcq)
 *   --force            Overwrite existing candidates for the same pattern (skip if published)
 *   --dry-run          Print generated candidates without writing candidates.ts
 *
 * Reads:   scripts/data/staging/lesson-<N>/grammar-patterns.ts
 *          scripts/data/staging/lesson-<N>/lesson.ts     (vocabulary context)
 *          scripts/data/staging/lesson-<N>/candidates.ts (existing, to merge)
 *
 * Writes:  scripts/data/staging/lesson-<N>/candidates.ts
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
  type GrammarPattern,
  type LessonData,
  type Candidate,
  type ExerciseType,
} from './lib/staging-utils'

// ── Default exercise types ────────────────────────────────────────────────────

const ALL_TYPES: ExerciseType[] = [
  'contrast_pair',
  'sentence_transformation',
  'constrained_translation',
  'cloze_mcq',
]

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildSystemPrompt(exerciseTypes: ExerciseType[]): string {
  const typeDescriptions: Record<ExerciseType, string> = {
    contrast_pair: `contrast_pair: Learner must choose between two confusable Indonesian forms.
    Required payload fields:
    - promptText: Dutch instruction ("Pilih yang benar: ...")
    - targetMeaning: what the correct form means in Dutch
    - options: array of exactly 2 { "id": "...", "text": "..." } options
    - correctOptionId: the id of the correct option
    - explanationText: Dutch explanation of WHY the correct form is right`,

    sentence_transformation: `sentence_transformation: Learner rewrites a source sentence using the target grammar rule.
    Required payload fields:
    - sourceSentence: the Dutch or Indonesian sentence to transform
    - transformationInstruction: Dutch instruction ("Schrijf de zin opnieuw met ...")
    - acceptableAnswers: array of valid Indonesian answer strings (include natural variants)
    - hintText: optional Dutch hint (may be null)
    - explanationText: Dutch explanation of the transformation`,

    constrained_translation: `constrained_translation: Learner translates a Dutch sentence into Indonesian using a required grammar pattern.
    Required payload fields:
    - sourceLanguageSentence: the Dutch sentence to translate
    - requiredTargetPattern: short Dutch label for the required pattern (e.g. "gebruik yang")
    - acceptableAnswers: array of valid Indonesian translations (include natural variants)
    - disallowedShortcutForms: optional array of Indonesian forms that bypass the grammar target (may be null)
    - explanationText: Dutch explanation`,

    cloze_mcq: `cloze_mcq: Learner fills a blank in an Indonesian sentence by choosing from 4 options.
    Required payload fields:
    - sentence: Indonesian sentence with ___ or (___) for the blank
    - translation: Dutch translation of the full sentence
    - options: array of exactly 4 option strings
    - correctOptionId: the exact string matching the correct option
    - explanationText: Dutch explanation of why the correct option is right`,
  }

  const typeBlocks = exerciseTypes.map(t => typeDescriptions[t]).join('\n\n')

  return `You are a Dutch-Indonesian linguist creating exercises for a language learning app. The learner is a Dutch speaker learning Indonesian (CEFR A1-A2).

Your task: given a grammar pattern, generate exactly one exercise of each requested type. Use natural, pedagogically sound Indonesian sentences relevant to the grammar pattern.

Exercise type requirements:
${typeBlocks}

Rules:
1. All prompts and explanations are in Dutch (the learner's L1)
2. Indonesian sentences should be at A1-A2 level — short, clear, using common vocabulary
3. For contrast_pair: the two options must represent genuinely confusable patterns, not arbitrary choices
4. For sentence_transformation and constrained_translation: provide 2–4 acceptable answers to account for natural variation
5. option ids for contrast_pair must be unique within the exercise (e.g. "cp-a", "cp-b")
6. cloze_mcq distractors should be plausible alternatives that a learner might confuse
7. Use vocabulary from the lesson context when provided

Respond with ONLY a valid JSON array of exercise objects — one per requested type — no prose, no markdown fences.

Schema per exercise object:
{
  "exercise_type": "<type>",
  "payload": { <type-specific fields> }
}`
}

// ── Generate exercises for a single pattern ───────────────────────────────────

interface GeneratedExercise {
  exercise_type: ExerciseType
  payload: Record<string, unknown>
}

async function generateForPattern(
  client: Anthropic,
  pattern: GrammarPattern,
  exerciseTypes: ExerciseType[],
  vocabularyContext: string,
): Promise<GeneratedExercise[]> {
  const userMessage = `Grammar pattern: ${pattern.pattern_name}
Slug: ${pattern.slug}
Description: ${pattern.description}
Confusion group: ${pattern.confusion_group ?? 'none'}
Complexity score: ${pattern.complexity_score} (1=simple, 10=complex)
Source page: ${pattern.page_reference}

${vocabularyContext ? `Lesson vocabulary context (use these words in exercises where natural):\n${vocabularyContext}\n` : ''}

Generate one exercise of each of these types: ${exerciseTypes.join(', ')}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: buildSystemPrompt(exerciseTypes),
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = message.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error(`No text response from Claude for pattern: ${pattern.slug}`)
  }

  const cleaned = block.text
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim()

  let exercises: GeneratedExercise[]
  try {
    exercises = JSON.parse(cleaned)
    if (!Array.isArray(exercises)) {
      throw new Error('Response is not an array')
    }
  } catch (err) {
    throw new Error(
      `Invalid JSON from Claude for pattern "${pattern.slug}": ${err instanceof Error ? err.message : err}\nRaw: ${block.text.slice(0, 400)}`
    )
  }

  // Validate structure
  for (const ex of exercises) {
    if (!ex.exercise_type || !ex.payload) {
      throw new Error(`Exercise missing exercise_type or payload for pattern "${pattern.slug}"`)
    }
    if (!exerciseTypes.includes(ex.exercise_type)) {
      throw new Error(`Unknown exercise_type "${ex.exercise_type}" for pattern "${pattern.slug}"`)
    }
  }

  return exercises
}

// ── Extract vocabulary context from lesson.ts ─────────────────────────────────

function extractVocabularyContext(lesson: LessonData | null): string {
  if (!lesson) return ''

  const items: string[] = []
  for (const section of lesson.sections) {
    const content = section.content as Record<string, unknown>
    if (
      (content.type === 'vocabulary' || content.type === 'expressions') &&
      Array.isArray(content.items)
    ) {
      for (const item of content.items as Array<{ indonesian: string; dutch: string }>) {
        if (item.indonesian && item.dutch) {
          items.push(`${item.indonesian} = ${item.dutch}`)
        }
      }
    }
  }

  // Limit context to avoid token overflow (150 items ~= ~3000 chars)
  return items.slice(0, 150).join('\n')
}

// ── Merge candidates ──────────────────────────────────────────────────────────

/**
 * Merge newly generated candidates into existing ones.
 * - Never overwrite published candidates
 * - In force mode, replace pending_review/approved candidates for the same slug+type
 * - In non-force mode, skip patterns that already have any candidates
 */
function mergeCandidates(
  existing: Candidate[],
  generated: Candidate[],
  force: boolean,
): { merged: Candidate[]; added: number; skipped: number } {
  const result: Candidate[] = [...existing]
  let added = 0
  let skipped = 0

  for (const candidate of generated) {
    const { grammar_pattern_slug, exercise_type } = candidate

    // Never touch published candidates
    const publishedExists = existing.some(
      e => e.grammar_pattern_slug === grammar_pattern_slug &&
           e.exercise_type === exercise_type &&
           e.review_status === 'published'
    )
    if (publishedExists) {
      console.log(`    SKIP (published): ${grammar_pattern_slug} / ${exercise_type}`)
      skipped++
      continue
    }

    if (force) {
      // Remove existing non-published candidates for this slug+type
      const idx = result.findIndex(
        e => e.grammar_pattern_slug === grammar_pattern_slug &&
             e.exercise_type === exercise_type &&
             e.review_status !== 'published'
      )
      if (idx !== -1) {
        result.splice(idx, 1, candidate)
      } else {
        result.push(candidate)
      }
    } else {
      // Skip if any non-published candidate already exists
      const existsAlready = existing.some(
        e => e.grammar_pattern_slug === grammar_pattern_slug &&
             e.exercise_type === exercise_type
      )
      if (existsAlready) {
        console.log(`    SKIP (exists): ${grammar_pattern_slug} / ${exercise_type}`)
        skipped++
        continue
      }
      result.push(candidate)
    }

    added++
  }

  return { merged: result, added, skipped }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const args = process.argv.slice(2)
  const lessonNumber = parseInt(args[0], 10)
  if (isNaN(lessonNumber)) {
    console.error(
      'Usage: bun scripts/generate-exercises.ts <lesson-number> [--pattern <slug>] [--types <list>] [--force] [--dry-run]'
    )
    process.exit(1)
  }

  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')

  const patternIdx = args.indexOf('--pattern')
  const filterSlug = patternIdx !== -1 ? args[patternIdx + 1] : null

  const typesIdx = args.indexOf('--types')
  let exerciseTypes: ExerciseType[] = ALL_TYPES
  if (typesIdx !== -1) {
    const raw = args[typesIdx + 1]
    exerciseTypes = raw.split(',').map(t => t.trim() as ExerciseType)
    for (const t of exerciseTypes) {
      if (!ALL_TYPES.includes(t)) {
        console.error(`Unknown exercise type: "${t}". Valid types: ${ALL_TYPES.join(', ')}`)
        process.exit(1)
      }
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set in environment or .env.local')
    process.exit(1)
  }

  const dir = requireStagingDir(lessonNumber)

  // Load grammar patterns
  const grammarPatternsPath = path.join(dir, 'grammar-patterns.ts')
  if (!fs.existsSync(grammarPatternsPath)) {
    console.error(`Error: grammar-patterns.ts not found at ${grammarPatternsPath}`)
    console.error('Run first: bun scripts/build-sections.ts ' + lessonNumber)
    process.exit(1)
  }

  let grammarPatterns: GrammarPattern[] = await readStagingFile(grammarPatternsPath) ?? []

  if (grammarPatterns.length === 0) {
    console.log(`Lesson ${lessonNumber}: no grammar patterns found — nothing to generate.`)
    process.exit(0)
  }

  // Apply pattern filter
  if (filterSlug) {
    grammarPatterns = grammarPatterns.filter(p => p.slug === filterSlug)
    if (grammarPatterns.length === 0) {
      console.error(`No grammar pattern with slug "${filterSlug}" found in lesson ${lessonNumber}`)
      process.exit(1)
    }
  }

  // Load lesson vocabulary for context
  const lessonPath = path.join(dir, 'lesson.ts')
  const lesson: LessonData | null = await readStagingFile(lessonPath)
  const vocabularyContext = extractVocabularyContext(lesson)

  // Load existing candidates
  const candidatesPath = path.join(dir, 'candidates.ts')
  const existingCandidates: Candidate[] = (await readStagingFile(candidatesPath)) ?? []

  console.log(`\nGenerating exercises for lesson ${lessonNumber}...`)
  console.log(`  Grammar patterns: ${grammarPatterns.length}`)
  console.log(`  Exercise types: ${exerciseTypes.join(', ')}`)
  console.log(`  Existing candidates: ${existingCandidates.length}`)
  if (dryRun) console.log('  [DRY RUN] — candidates.ts will not be modified')
  console.log()

  const client = new Anthropic({ apiKey })
  const allGenerated: Candidate[] = []

  for (const pattern of grammarPatterns) {
    console.log(`  Pattern: ${pattern.slug}`)

    try {
      const exercises = await generateForPattern(
        client,
        pattern,
        exerciseTypes,
        vocabularyContext,
      )

      for (const ex of exercises) {
        const candidate: Candidate = {
          exercise_type: ex.exercise_type as ExerciseType,
          grammar_pattern_slug: pattern.slug,
          source_page: pattern.page_reference,
          review_status: 'pending_review',
          requiresManualApproval: true,
          payload: ex.payload,
        }
        allGenerated.push(candidate)
        console.log(`    + ${ex.exercise_type}`)
      }
    } catch (err) {
      console.error(`  ERROR for pattern "${pattern.slug}":`, err instanceof Error ? err.message : err)
    }
  }

  if (allGenerated.length === 0) {
    console.log('\nNo new candidates generated.')
    process.exit(0)
  }

  // Merge with existing
  const { merged, added, skipped } = mergeCandidates(existingCandidates, allGenerated, force)

  console.log(`\nSummary:`)
  console.log(`  Generated: ${allGenerated.length}`)
  console.log(`  Added to candidates: ${added}`)
  console.log(`  Skipped (exists/published): ${skipped}`)

  if (dryRun) {
    console.log('\n[DRY RUN] Generated candidates (not written):')
    for (const c of allGenerated) {
      console.log(`  ${c.exercise_type} / ${c.grammar_pattern_slug}`)
    }
    process.exit(0)
  }

  if (added === 0) {
    console.log('\nNo new candidates to write (all already exist or are published).')
    console.log('Use --force to regenerate existing pending_review candidates.')
    process.exit(0)
  }

  // Write updated candidates.ts
  const output = `// Exercise candidates for lesson ${lessonNumber}
// Generated by generate-exercises.ts. Review before publishing.
// review_status 'pending_review' — publish via: bun scripts/publish-approved-content.ts ${lessonNumber}
export const candidates = ${JSON.stringify(merged, null, 2)}
`
  fs.writeFileSync(candidatesPath, output)
  console.log(`\n  WRITE: candidates.ts (${merged.length} total candidates)`)

  console.log('\nNext steps:')
  console.log(`  1. Review generated candidates in scripts/data/staging/lesson-${lessonNumber}/candidates.ts`)
  console.log(`  2. Adjust any candidates that need editing (change review_status to 'approved' when ready)`)
  console.log(`  3. bun scripts/publish-approved-content.ts ${lessonNumber}`)
  console.log(`     All pending_review and approved candidates publish immediately.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
