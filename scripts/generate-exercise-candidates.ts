#!/usr/bin/env bun
/**
 * generate-exercise-candidates.ts
 *
 * Generates exercise-specific candidates from extracted textbook content.
 * Reads pages and grammar patterns from staging files and creates candidates
 * using exercise-specific prompt templates.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=<key> bun scripts/generate-exercise-candidates.ts <lesson-number>
 *
 * Reads:   scripts/data/staging/lesson-<N>/pages.ts, grammar-patterns.ts
 * Writes:  scripts/data/staging/lesson-<N>/candidates.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Load Staging Data
// ---------------------------------------------------------------------------

function loadStagingData(lessonNumber: number): {
  pages: TextbookPage[]
  grammarPatterns: GrammarPattern[]
} {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)

  if (!fs.existsSync(stagingDir)) {
    console.error(`Error: Staging directory not found: ${stagingDir}`)
    console.error(`Run 'make extract-textbook LESSON=${lessonNumber}' first.`)
    process.exit(1)
  }

  // Dynamically load and evaluate TypeScript files
  let pages: TextbookPage[] = []
  let grammarPatterns: GrammarPattern[] = []

  try {
    // Read pages.ts
    const pagesPath = path.join(stagingDir, 'pages.ts')
    if (fs.existsSync(pagesPath)) {
      const pagesContent = fs.readFileSync(pagesPath, 'utf-8')
      const jsonMatch = pagesContent.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (jsonMatch) {
        pages = JSON.parse(jsonMatch[0])
      }
    }

    // Read grammar-patterns.ts
    const patternsPath = path.join(stagingDir, 'grammar-patterns.ts')
    if (fs.existsSync(patternsPath)) {
      const patternsContent = fs.readFileSync(patternsPath, 'utf-8')
      const jsonMatch = patternsContent.match(/\[\s*(?:\{[\s\S]*?\}(?:,\s*)?)*\]/)
      if (jsonMatch) {
        grammarPatterns = JSON.parse(jsonMatch[0])
      }
    }
  } catch (err) {
    console.error('Failed to load staging data:', err)
    process.exit(1)
  }

  return { pages, grammarPatterns }
}

// ---------------------------------------------------------------------------
// Claude API Calls
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert at generating language learning exercises from textbook content.

Generate high-quality exercise candidates that target specific grammar patterns and sentence structures. Ensure exercises are pedagogically sound and focused on pattern recognition and productive usage.`

async function generateCandidates(lessonNumber: number, pages: TextbookPage[], patterns: GrammarPattern[]): Promise<GeneratedExerciseCandidate[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set')
    process.exit(1)
  }

  const client = new Anthropic({ apiKey })
  const candidates: GeneratedExerciseCandidate[] = []
  const now = new Date().toISOString()

  const pageText = pages.map(p => `[Page ${p.page_number}]\n${p.raw_text}`).join('\n\n')
  const patternList = patterns
    .map(
      p =>
        `- ${p.pattern_name}: ${p.description}${p.confusion_group ? ` (confusion group: ${p.confusion_group})` : ''}`,
    )
    .join('\n')

  const prompt = `Generate exercise candidates from this textbook content.

TEXTBOOK CONTENT:
${pageText}

GRAMMAR PATTERNS:
${patternList}

Generate a JSON array of exercise candidates. Each candidate should target one of these types:
- contrast_pair: Two confusable forms (minimal pair). Return { exercise_type: "contrast_pair", source_text: "<target phrase>", prompt_text: "<presentation>", answer_key: ["<form1>", "<form2>"], explanation: "<why distinct>" }
- sentence_transformation: Transform a sentence per instruction. Return { exercise_type: "sentence_transformation", source_text: "<original>", prompt_text: "<instruction>", answer_key: ["<transformed>"], explanation: "<rule>" }
- constrained_translation: Translate with a grammar pattern requirement. Return { exercise_type: "constrained_translation", source_text: "<source language>", prompt_text: "<translation prompt>", target_pattern: "<required pattern>", answer_key: ["<translation>"], explanation: "<why pattern required>" }
- speaking: Prompt for spoken response. Return { exercise_type: "speaking", source_text: "<scenario>", prompt_text: "<prompt>", answer_key: ["<example response>"], explanation: "<learning goal>" }

Return only a valid JSON array with at least 5 candidates. Each must have all fields.`

  console.log(`\nGenerating exercise candidates from lesson ${lessonNumber}...`)

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Parse response
  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('Could not find JSON array in response')
  }

  const extracted = JSON.parse(jsonMatch[0])

  // Map to our candidate format
  for (const item of extracted) {
    if (['contrast_pair', 'sentence_transformation', 'constrained_translation', 'speaking'].includes(item.exercise_type)) {
      candidates.push({
        exercise_type: item.exercise_type,
        page_reference: 1,
        grammar_pattern_id: item.grammar_pattern_id,
        source_text: item.source_text || '',
        prompt_text: item.prompt_text || '',
        answer_key: item.answer_key || [],
        explanation: item.explanation || '',
        target_pattern: item.target_pattern,
        review_status: 'pending_review',
        created_at: now,
      })
    }
  }

  return candidates
}

// ---------------------------------------------------------------------------
// Write Output
// ---------------------------------------------------------------------------

function writeCandidates(lessonNumber: number, candidates: GeneratedExerciseCandidate[]) {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)

  const candidatesTs = `// Auto-generated by generate-exercise-candidates.ts
// Do not edit manually

import type { GeneratedExerciseCandidate } from '@/types/contentGeneration'

export const candidates: GeneratedExerciseCandidate[] = ${JSON.stringify(candidates, null, 2)}
`

  fs.writeFileSync(path.join(stagingDir, 'candidates.ts'), candidatesTs)

  console.log(`\n✓ Generated ${candidates.length} exercise candidates`)
  console.log(`  - contrast_pair: ${candidates.filter(c => c.exercise_type === 'contrast_pair').length}`)
  console.log(`  - sentence_transformation: ${candidates.filter(c => c.exercise_type === 'sentence_transformation').length}`)
  console.log(`  - constrained_translation: ${candidates.filter(c => c.exercise_type === 'constrained_translation').length}`)
  console.log(`  - speaking: ${candidates.filter(c => c.exercise_type === 'speaking').length}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/generate-exercise-candidates.ts <lesson-number>')
    process.exit(1)
  }

  try {
    const { pages, grammarPatterns } = loadStagingData(lessonNumber)
    const candidates = await generateCandidates(lessonNumber, pages, grammarPatterns)
    writeCandidates(lessonNumber, candidates)
  } catch (err) {
    console.error('Generation failed:', err)
    process.exit(1)
  }
}

main()
