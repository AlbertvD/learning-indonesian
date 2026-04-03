#!/usr/bin/env bun
/**
 * publish-approved-content.ts
 *
 * Publishes approved exercise candidates from staging to Supabase.
 *
 * Flow:
 * 1. Load approved candidates from staging/lesson-<N>/candidates.ts
 * 2. For each approved candidate:
 *    - Resolve or create canonical learning_item
 *    - Upsert item_contexts row
 *    - Upsert item_context_grammar_patterns (if applicable)
 *    - Insert exercise_variants row with live payload
 *    - Mark as 'published' in staging file
 * 3. Seed textbook_sources, textbook_pages, grammar_patterns, exercise_type_availability
 *
 * Usage:
 *   bun scripts/publish-approved-content.ts <lesson-number>
 *   Requires SUPABASE_SERVICE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedExerciseCandidate {
  exercise_type: string
  page_reference: number
  grammar_pattern_id?: string
  source_text: string
  prompt_text: string
  answer_key: string[]
  explanation: string
  target_pattern?: string
  review_status: string
  created_at: string
  reviewer_notes?: string
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
// Supabase Client
// ---------------------------------------------------------------------------

function createSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY environment variable not set')
    console.error('Add it to .env.local: SUPABASE_SERVICE_KEY=<your-key>')
    process.exit(1)
  }

  return createClient(url, serviceKey)
}

// ---------------------------------------------------------------------------
// Load Staging Data
// ---------------------------------------------------------------------------

function loadStagingData(lessonNumber: number) {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)

  if (!fs.existsSync(stagingDir)) {
    console.error(`Error: Staging directory not found: ${stagingDir}`)
    process.exit(1)
  }

  let candidates: GeneratedExerciseCandidate[] = []
  let pages: TextbookPage[] = []
  let grammarPatterns: GrammarPattern[] = []

  try {
    // Load candidates
    const candidatesPath = path.join(stagingDir, 'candidates.ts')
    if (fs.existsSync(candidatesPath)) {
      const content = fs.readFileSync(candidatesPath, 'utf-8')
      const jsonMatch = content.match(/\[\s*(?:\{[\s\S]*?\}(?:,\s*)?)*\]/)
      if (jsonMatch) {
        candidates = JSON.parse(jsonMatch[0])
      }
    }

    // Load pages
    const pagesPath = path.join(stagingDir, 'pages.ts')
    if (fs.existsSync(pagesPath)) {
      const content = fs.readFileSync(pagesPath, 'utf-8')
      const jsonMatch = content.match(/\[\s*(?:\{[\s\S]*?\}(?:,\s*)?)*\]/)
      if (jsonMatch) {
        pages = JSON.parse(jsonMatch[0])
      }
    }

    // Load grammar patterns
    const patternsPath = path.join(stagingDir, 'grammar-patterns.ts')
    if (fs.existsSync(patternsPath)) {
      const content = fs.readFileSync(patternsPath, 'utf-8')
      const jsonMatch = content.match(/\[\s*(?:\{[\s\S]*?\}(?:,\s*)?)*\]/)
      if (jsonMatch) {
        grammarPatterns = JSON.parse(jsonMatch[0])
      }
    }
  } catch (err) {
    console.error('Failed to load staging data:', err)
    process.exit(1)
  }

  return { candidates, pages, grammarPatterns }
}

// ---------------------------------------------------------------------------
// Publishing Logic
// ---------------------------------------------------------------------------

async function publishApprovedContent(lessonNumber: number) {
  const supabase = createSupabaseClient()
  const { candidates, pages, grammarPatterns } = loadStagingData(lessonNumber)

  // Filter to approved candidates only
  const approvedCandidates = candidates.filter(c => c.review_status === 'approved')

  if (approvedCandidates.length === 0) {
    console.log('No approved candidates to publish')
    return
  }

  console.log(`\nPublishing ${approvedCandidates.length} approved candidate(s) from lesson ${lessonNumber}...`)

  try {
    // 1. Ensure textbook_sources exists
    console.log('\n1. Seeding textbook_sources...')
    const { data: textbookSource } = await supabase
      .from('textbook_sources')
      .schema('indonesian')
      .upsert(
        {
          id: 'textbook-1',
          title: `Textbook Lesson ${lessonNumber}`,
          language: 'id',
          is_active: true,
        },
        { onConflict: 'id' },
      )
      .select()

    if (!textbookSource || textbookSource.length === 0) {
      throw new Error('Failed to upsert textbook_sources')
    }

    console.log(`   ✓ Textbook source: ${textbookSource[0].id}`)

    // 2. Seed textbook_pages
    console.log('\n2. Seeding textbook_pages...')
    const pageInserts = pages.map(p => ({
      textbook_source_id: 'textbook-1',
      page_number: p.page_number,
      raw_text: p.raw_text,
      extracted_at: p.extracted_at,
    }))

    for (const pageData of pageInserts) {
      await supabase
        .from('textbook_pages')
        .schema('indonesian')
        .upsert(pageData, { onConflict: 'textbook_source_id,page_number' })
        .select()
    }

    console.log(`   ✓ Seeded ${pages.length} page(s)`)

    // 3. Seed grammar_patterns
    console.log('\n3. Seeding grammar_patterns...')
    const patternInserts = grammarPatterns.map(p => ({
      pattern_name: p.pattern_name,
      description: p.description,
      confusion_group: p.confusion_group || null,
      is_active: true,
    }))

    const patternMap: Record<string, string> = {}
    for (const patternData of patternInserts) {
      const { data: inserted } = await supabase
        .from('grammar_patterns')
        .schema('indonesian')
        .upsert(patternData, { onConflict: 'pattern_name' })
        .select('id')

      if (inserted && inserted.length > 0) {
        patternMap[patternData.pattern_name] = inserted[0].id
      }
    }

    console.log(`   ✓ Seeded ${Object.keys(patternMap).length} grammar pattern(s)`)

    // 4. Seed exercise_type_availability (once)
    console.log('\n4. Seeding exercise_type_availability...')
    const exerciseAvailability = [
      { exercise_type: 'recognition_mcq', session_enabled: true, authoring_enabled: true, requires_approved_content: false, rollout_phase: 'full' },
      { exercise_type: 'cued_recall', session_enabled: true, authoring_enabled: true, requires_approved_content: false, rollout_phase: 'full' },
      { exercise_type: 'typed_recall', session_enabled: true, authoring_enabled: true, requires_approved_content: false, rollout_phase: 'full' },
      { exercise_type: 'cloze', session_enabled: true, authoring_enabled: true, requires_approved_content: false, rollout_phase: 'full' },
      { exercise_type: 'contrast_pair', session_enabled: true, authoring_enabled: true, requires_approved_content: true, rollout_phase: 'beta' },
      { exercise_type: 'sentence_transformation', session_enabled: true, authoring_enabled: true, requires_approved_content: true, rollout_phase: 'beta' },
      { exercise_type: 'constrained_translation', session_enabled: true, authoring_enabled: true, requires_approved_content: true, rollout_phase: 'beta' },
      { exercise_type: 'speaking', session_enabled: false, authoring_enabled: true, requires_approved_content: true, rollout_phase: 'alpha' },
    ]

    for (const availability of exerciseAvailability) {
      await supabase
        .from('exercise_type_availability')
        .schema('indonesian')
        .upsert(availability, { onConflict: 'exercise_type' })
    }

    console.log(`   ✓ Seeded exercise availability (8 types)`)

    // 5. Publish each approved candidate
    console.log('\n5. Publishing approved candidates...')

    for (let idx = 0; idx < approvedCandidates.length; idx++) {
      const candidate = approvedCandidates[idx]
      console.log(`\n   Candidate ${idx + 1}/${approvedCandidates.length} (${candidate.exercise_type})...`)

      // Find or create learning_item (use source_text as base_text for now)
      const { data: existingItems } = await supabase
        .from('learning_items')
        .schema('indonesian')
        .select('id')
        .eq('base_text', candidate.source_text)
        .limit(1)

      let itemId: string
      if (existingItems && existingItems.length > 0) {
        itemId = existingItems[0].id
        console.log(`      ✓ Using existing item: ${itemId}`)
      } else {
        const { data: newItem } = await supabase
          .from('learning_items')
          .schema('indonesian')
          .insert({
            item_type: 'sentence',
            base_text: candidate.source_text,
            normalized_text: candidate.source_text.toLowerCase(),
            language: 'id',
            level: 'A2',
            source_type: 'textbook',
          })
          .select('id')

        if (!newItem || newItem.length === 0) {
          throw new Error(`Failed to create learning_item for: ${candidate.source_text}`)
        }

        itemId = newItem[0].id
        console.log(`      ✓ Created new item: ${itemId}`)
      }

      // Upsert item_contexts
      const contextPayload =
        candidate.exercise_type === 'contrast_pair'
          ? { source_text: candidate.prompt_text, translation_text: candidate.answer_key[0] }
          : candidate.exercise_type === 'sentence_transformation'
            ? { source_text: candidate.source_text, translation_text: candidate.answer_key[0] }
            : candidate.exercise_type === 'constrained_translation'
              ? { source_text: candidate.source_text, translation_text: candidate.answer_key[0] }
              : { source_text: candidate.source_text, translation_text: '' }

      const { data: context } = await supabase
        .from('item_contexts')
        .schema('indonesian')
        .insert({
          learning_item_id: itemId,
          context_type: 'textbook',
          source_text: contextPayload.source_text,
          translation_text: contextPayload.translation_text,
          is_anchor_context: true,
        })
        .select('id')

      if (!context || context.length === 0) {
        throw new Error('Failed to create item_context')
      }

      console.log(`      ✓ Created context: ${context[0].id}`)

      // Link grammar pattern if applicable
      if (candidate.grammar_pattern_id && patternMap[candidate.grammar_pattern_id]) {
        await supabase
          .from('item_context_grammar_patterns')
          .schema('indonesian')
          .insert({
            context_id: context[0].id,
            grammar_pattern_id: patternMap[candidate.grammar_pattern_id],
          })

        console.log(`      ✓ Linked grammar pattern: ${candidate.grammar_pattern_id}`)
      }

      // Insert exercise_variants with live payload
      const variantPayload =
        candidate.exercise_type === 'contrast_pair'
          ? {
              promptText: candidate.prompt_text,
              targetMeaning: candidate.explanation,
              options: candidate.answer_key,
              correctOptionId: '0',
            }
          : candidate.exercise_type === 'sentence_transformation'
            ? {
                sourceSentence: candidate.source_text,
                transformationInstruction: candidate.prompt_text,
                acceptableAnswers: candidate.answer_key,
                explanationText: candidate.explanation,
              }
            : candidate.exercise_type === 'constrained_translation'
              ? {
                  sourceLanguageSentence: candidate.source_text,
                  requiredTargetPattern: candidate.target_pattern || '',
                  acceptableAnswers: candidate.answer_key,
                  explanationText: candidate.explanation,
                }
              : {
                  promptText: candidate.prompt_text,
                  targetPatternOrScenario: candidate.target_pattern || '',
                  explanationText: candidate.explanation,
                }

      const { data: variant } = await supabase
        .from('exercise_variants')
        .schema('indonesian')
        .insert({
          context_id: context[0].id,
          exercise_type: candidate.exercise_type,
          payload_json: variantPayload,
          is_active: true,
        })
        .select('id')

      if (!variant || variant.length === 0) {
        throw new Error('Failed to create exercise_variant')
      }

      console.log(`      ✓ Created variant: ${variant[0].id}`)
    }

    // 6. Mark candidates as published
    console.log('\n6. Updating staging file with published status...')
    const updatedCandidates = candidates.map(c => {
      if (c.review_status === 'approved') {
        return { ...c, review_status: 'published' }
      }
      return c
    })

    const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)
    const candidatesTs = `// Auto-generated by publish-approved-content.ts
// Do not edit manually

import type { GeneratedExerciseCandidate } from '@/types/contentGeneration'

export const candidates: GeneratedExerciseCandidate[] = ${JSON.stringify(updatedCandidates, null, 2)}
`

    fs.writeFileSync(path.join(stagingDir, 'candidates.ts'), candidatesTs)

    console.log(`\n✓ Successfully published ${approvedCandidates.length} candidate(s) from lesson ${lessonNumber}`)
  } catch (err) {
    console.error('\nPublish failed:', err)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/publish-approved-content.ts <lesson-number>')
    process.exit(1)
  }

  await publishApprovedContent(lessonNumber)
}

main()
