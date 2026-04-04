#!/usr/bin/env bun
/**
 * publish-approved-content.ts
 *
 * Publishes approved content from staging (lesson.ts, learning-items.ts, etc.) to Supabase.
 *
 * Usage:
 *   bun scripts/publish-approved-content.ts <lesson-number> [--dry-run]
 *   Requires SUPABASE_SERVICE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

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

function readStagingFile(stagingDir: string, filename: string): any {
  const filePath = path.join(stagingDir, filename)
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath, 'utf-8')
  const match = content.match(/=\s*([\s\S]*?)(?:\nexport|$)/)
  if (!match) return null
  
  const jsStr = match[1].trim().replace(/;$/, '')
  try {
    return JSON.parse(jsStr)
  } catch {
    try {
      return new Function(`return ${jsStr}`)()
    } catch {
      return null
    }
  }
}

function loadStagingData(lessonNumber: number) {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)

  if (!fs.existsSync(stagingDir)) {
    console.error(`Error: Staging directory not found: ${stagingDir}`)
    process.exit(1)
  }

  return {
    lesson: readStagingFile(stagingDir, 'lesson.ts'),
    learningItems: readStagingFile(stagingDir, 'learning-items.ts') || [],
    grammarPatterns: readStagingFile(stagingDir, 'grammar-patterns.ts') || [],
    candidates: readStagingFile(stagingDir, 'candidates.ts') || [],
    stagingDir
  }
}

// ---------------------------------------------------------------------------
// Publishing Logic
// ---------------------------------------------------------------------------

async function publishContent(lessonNumber: number, dryRun: boolean) {
  const supabase = createSupabaseClient()
  const { lesson, learningItems, grammarPatterns, candidates, stagingDir } = loadStagingData(lessonNumber)

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Publishing lesson ${lessonNumber}...`)

  try {
    // 1. Publish Lesson
    let lessonId: string | null = null
    if (lesson) {
      console.log('\n1. Publishing lesson metadata...')
      if (dryRun) {
        console.log(`   [DRY RUN] Would upsert lesson: ${lesson.title}`)
        lessonId = 'dry-run-lesson-id'
      } else {
        const { data: upsertedLesson, error: lessonError } = await supabase
          .schema('indonesian')
          .from('lessons')
          .upsert({
            title: lesson.title,
            description: lesson.description,
            level: lesson.level,
            module_id: lesson.module_id,
            order_index: lesson.order_index,
          }, { onConflict: 'title' })
          .select('id')
          .single()

        if (lessonError) throw lessonError
        lessonId = upsertedLesson.id
        console.log(`   ✓ Lesson published: ${lessonId}`)

        // Publish Sections
        console.log('   Publishing lesson sections...')
        for (const section of lesson.sections) {
          await supabase
            .schema('indonesian')
            .from('lesson_sections')
            .upsert({
              lesson_id: lessonId,
              title: section.title,
              content: section.content,
              order_index: section.order_index,
            }, { onConflict: 'lesson_id,order_index' })
        }
        console.log(`   ✓ ${lesson.sections.length} sections published`)
      }
    }

    // 2. Publish Grammar Patterns
    const patternMap: Record<string, string> = {}
    if (grammarPatterns.length > 0) {
      console.log('\n2. Publishing grammar patterns...')
      for (const pattern of grammarPatterns) {
        if (dryRun) {
          console.log(`   [DRY RUN] Would upsert grammar pattern: ${pattern.pattern_name}`)
          patternMap[pattern.pattern_name] = 'dry-run-pattern-id'
        } else {
          const { data: upsertedPattern, error: patternError } = await supabase
            .schema('indonesian')
            .from('grammar_patterns')
            .upsert({
              pattern_name: pattern.pattern_name,
              description: pattern.description,
              confusion_group: pattern.confusion_group,
              is_active: true,
            }, { onConflict: 'pattern_name' })
            .select('id')
            .single()

          if (patternError) throw patternError
          patternMap[pattern.pattern_name] = upsertedPattern.id
        }
      }
      console.log(`   ✓ ${grammarPatterns.length} grammar patterns processed`)
    }

    // 3. Publish Learning Items
    const approvedItems = learningItems.filter((item: any) => item.review_status === 'approved')
    if (approvedItems.length > 0) {
      console.log(`\n3. Publishing ${approvedItems.length} approved learning items...`)
      for (const item of approvedItems) {
        if (dryRun) {
          console.log(`   [DRY RUN] Would publish item: ${item.base_text} -> ${item.translation_nl}`)
        } else {
          // Upsert Learning Item
          const { data: upsertedItem, error: itemError } = await supabase
            .schema('indonesian')
            .from('learning_items')
            .upsert({
              base_text: item.base_text,
              item_type: item.item_type,
              normalized_text: item.base_text.toLowerCase().trim(),
              language: 'id',
              level: lesson?.level || 'A1',
              source_type: 'lesson',
            }, { onConflict: 'base_text' })
            .select('id')
            .single()

          if (itemError) throw itemError

          // Upsert Meaning (Dutch)
          await supabase
            .schema('indonesian')
            .from('item_meanings')
            .upsert({
              learning_item_id: upsertedItem.id,
              translation_text: item.translation_nl,
              is_primary: true,
            }, { onConflict: 'learning_item_id,translation_text' })

          // Upsert Context
          await supabase
            .schema('indonesian')
            .from('item_contexts')
            .upsert({
              learning_item_id: upsertedItem.id,
              context_type: item.context_type,
              source_text: item.base_text,
              translation_text: item.translation_nl,
              is_anchor_context: true,
              source_lesson_id: lessonId,
            }, { onConflict: 'learning_item_id,source_text' })
        }
      }
      
      if (!dryRun) {
        // Mark as published in staging
        const updatedItems = learningItems.map((item: any) => 
          item.review_status === 'approved' ? { ...item, review_status: 'published' } : item
        )
        fs.writeFileSync(
          path.join(stagingDir, 'learning-items.ts'),
          `// Published via script\nexport const learningItems = ${JSON.stringify(updatedItems, null, 2)}\n`
        )
        console.log('   ✓ Learning items marked as published in staging')
      }
    }

    // 4. Publish Exercise Candidates
    const approvedCandidates = candidates.filter((c: any) => c.review_status === 'approved')
    if (approvedCandidates.length > 0) {
      console.log(`\n4. Publishing ${approvedCandidates.length} approved exercise candidates...`)
      for (const candidate of approvedCandidates) {
        if (dryRun) {
          console.log(`   [DRY RUN] Would publish exercise: ${candidate.exercise_type} for ${candidate.source_text}`)
        } else {
          // Find context for the source text
          const { data: context, error: contextError } = await supabase
            .schema('indonesian')
            .from('item_contexts')
            .select('id')
            .eq('source_text', candidate.source_text)
            .limit(1)
            .single()

          if (contextError) {
            console.warn(`   ⚠️ Could not find context for exercise: ${candidate.source_text}. Skipping.`)
            continue
          }

          // Insert Variant
          await supabase
            .schema('indonesian')
            .from('exercise_variants')
            .insert({
              context_id: context.id,
              exercise_type: candidate.exercise_type,
              payload_json: {
                promptText: candidate.prompt_text,
                answerKey: candidate.answer_key,
                explanation: candidate.explanation,
              },
              is_active: true,
            })
        }
      }

      if (!dryRun) {
        // Mark as published in staging
        const updatedCandidates = candidates.map((c: any) => 
          c.review_status === 'approved' ? { ...c, review_status: 'published' } : c
        )
        fs.writeFileSync(
          path.join(stagingDir, 'candidates.ts'),
          `// Published via script\nexport const candidates = ${JSON.stringify(updatedCandidates, null, 2)}\n`
        )
        console.log('   ✓ Candidates marked as published in staging')
      }
    }

    console.log(`\n✓ ${dryRun ? '[DRY RUN] ' : ''}Successfully processed lesson ${lessonNumber}`)

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
    console.error('Usage: bun scripts/publish-approved-content.ts <lesson-number> [--dry-run]')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')
  await publishContent(lessonNumber, dryRun)
}

main()
