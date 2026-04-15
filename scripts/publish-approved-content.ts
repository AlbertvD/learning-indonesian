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

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
// This is safe — we're connecting to our own internal Supabase instance.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

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

// Use dynamic import so Bun handles TypeScript syntax (as const, type annotations, etc.)
// without relying on JSON.parse or new Function which can't handle TS.
async function readStagingFile(filePath: string): Promise<any> {
  if (!fs.existsSync(filePath)) return null
  // Bun resolves absolute file paths directly; file:// prefix handles cross-platform edge cases
  const module = await import(`file://${filePath}`)
  // Return the first export value (lesson, learningItems, grammarPatterns, candidates, clozeContexts)
  const values = Object.values(module)
  return values.length > 0 ? values[0] : null
}

async function loadStagingData(lessonNumber: number) {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)

  if (!fs.existsSync(stagingDir)) {
    console.error(`Error: Staging directory not found: ${stagingDir}`)
    process.exit(1)
  }

  const [lesson, learningItems, grammarPatterns, candidates, clozeContexts] = await Promise.all([
    readStagingFile(path.join(stagingDir, 'lesson.ts')),
    readStagingFile(path.join(stagingDir, 'learning-items.ts')),
    readStagingFile(path.join(stagingDir, 'grammar-patterns.ts')),
    readStagingFile(path.join(stagingDir, 'candidates.ts')),
    readStagingFile(path.join(stagingDir, 'cloze-contexts.ts')),
  ])

  return {
    lesson,
    learningItems: learningItems || [],
    grammarPatterns: grammarPatterns || [],
    candidates: candidates || [],
    clozeContexts: clozeContexts || [],
    stagingDir,
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_SECTION_TYPES = new Set([
  'vocabulary', 'expressions', 'numbers', 'dialogue', 'text',
  'grammar', 'exercises', 'pronunciation', 'reference_table',
])

function validateSections(sections: any[], lessonNumber: number) {
  const errors: string[] = []
  for (const section of sections) {
    if (!VALID_SECTION_TYPES.has(section.content?.type)) {
      errors.push(
        `  Section order_index=${section.order_index} has invalid type: "${section.content?.type}". ` +
        `Must be one of: ${[...VALID_SECTION_TYPES].join(', ')}`
      )
    }
  }
  if (errors.length > 0) {
    console.error(`\n✗ Invalid section type(s) in lesson ${lessonNumber}:`)
    errors.forEach(e => console.error(e))
    console.error('\nFix the section type(s) in lesson.ts before publishing.')
    process.exit(1)
  }
}

// Normalise a cloze context slug to match normalized_text in the DB.
// normalized_text = base_text.toLowerCase().trim().
//
// NOTE: do NOT replace hyphens with spaces — Indonesian has legitimately hyphenated
// words (oleh-oleh, sama-sama, baik-baik) where the hyphen is part of the word.
//
// The slug in cloze-contexts.ts ideally matches base_text exactly, but the
// linguist-structurer often writes simplified slugs (e.g. "beres") while the
// base_text — and therefore normalized_text in the DB — includes accent
// annotations and passive markers (e.g. "beres (bèrès)", "dibawa*").
//
// candidateSlugs() returns the exact slug first, then fallback variants:
//   1. exact: "beres (bèrès)"  →  matches DB directly
//   2. strip trailing *: "dibawa*" → "dibawa"
//   3. strip parenthetical: "beres (bèrès)" → "beres"
//   4. both: "disetrika* (foo)" → "disetrika"
// When the slug from the staging file lacks parentheticals/asterisks, variant 1
// is tried first; if not found the DB is queried with a LIKE prefix match.
function candidateSlugs(slug: string): string[] {
  const exact = slug.toLowerCase().trim()
  const stripped = exact
    .replace(/\s*\([^)]*\)\s*$/, '') // remove trailing (...)
    .replace(/\*$/, '')              // remove trailing *
    .trim()
  const noAsterisk = exact.replace(/\*$/, '').trim()
  const noParens = exact.replace(/\s*\([^)]*\)\s*$/, '').trim()
  // Deduplicate while preserving priority order
  return [...new Set([exact, noAsterisk, noParens, stripped])]
}

// ---------------------------------------------------------------------------
// Publishing Logic
// ---------------------------------------------------------------------------

async function publishContent(lessonNumber: number, dryRun: boolean) {
  const supabase = createSupabaseClient()
  const { lesson, learningItems, grammarPatterns, candidates, clozeContexts, stagingDir } = await loadStagingData(lessonNumber)

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
        // First, try to find existing lesson by module_id and order_index (primary key constraint)
        const { data: existingLesson } = await supabase
          .schema('indonesian')
          .from('lessons')
          .select('id')
          .eq('module_id', lesson.module_id)
          .eq('order_index', lesson.order_index)
          .maybeSingle()

        if (existingLesson) {
          // Update existing lesson
          const { error: updateError } = await supabase
            .schema('indonesian')
            .from('lessons')
            .update({
              title: lesson.title,
              description: lesson.description,
              level: lesson.level,
            })
            .eq('id', existingLesson.id)

          if (updateError) throw updateError
          lessonId = existingLesson.id
          console.log(`   ✓ Lesson updated: ${lessonId}`)
        } else {
          // Insert new lesson
          const { data: newLesson, error: insertError } = await supabase
            .schema('indonesian')
            .from('lessons')
            .insert({
              title: lesson.title,
              description: lesson.description,
              level: lesson.level,
              module_id: lesson.module_id,
              order_index: lesson.order_index,
            })
            .select('id')
            .single()

          if (insertError) throw insertError
          lessonId = newLesson.id
          console.log(`   ✓ Lesson published: ${lessonId}`)
        }

        // Publish Sections
        console.log('   Publishing lesson sections...')
        if (lesson.sections.length > 0) {
          validateSections(lesson.sections, lessonNumber)
        }
        for (const section of lesson.sections) {
          const { error: sectionError } = await supabase
            .schema('indonesian')
            .from('lesson_sections')
            .upsert({
              lesson_id: lessonId,
              title: section.title,
              content: section.content,
              order_index: section.order_index,
            }, { onConflict: 'lesson_id,order_index' })
          if (sectionError) throw sectionError
        }
        console.log(`   ✓ ${lesson.sections.length} sections published`)
      }
    }

    // 2. Publish Grammar Patterns (if table exists)
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
              slug: pattern.slug,
              name: pattern.pattern_name,
              short_explanation: pattern.description,
              complexity_score: pattern.complexity_score,
              confusion_group: pattern.confusion_group ?? null,
              introduced_by_lesson_id: lessonId,
            }, { onConflict: 'slug' })
            .select('id')
            .single()

          // Grammar patterns table may not exist yet, skip silently
          if (patternError && patternError.code === 'PGRST205') {
            console.log(`   ⓘ Grammar patterns table not yet in schema, skipping`)
            break
          }
          if (patternError) throw patternError
          patternMap[pattern.slug] = upsertedPattern.id
        }
      }
      if (!dryRun) {
        console.log(`   ✓ ${grammarPatterns.length} grammar patterns processed`)
      }
    }

    // 3. Publish Learning Items
    // Everything publishes immediately — review happens live in the app via admin account.
    // Only rejected and already-published items are excluded.
    const approvedItems = learningItems.filter((item: any) =>
      item.review_status === 'pending_review' || item.review_status === 'approved'
    )
    const VALID_LANGUAGES = new Set(['nl', 'en'])
    const VALID_CONTEXT_TYPES = new Set(['example_sentence', 'dialogue', 'cloze', 'lesson_snippet', 'vocabulary_list', 'exercise_prompt'])
    const publishedItemIds: string[] = []
    const dialogueItemIds = new Set<string>()
    if (approvedItems.length > 0) {
      console.log(`\n3. Publishing ${approvedItems.length} learning items...`)
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
            }, { onConflict: 'normalized_text' })
            .select('id')
            .single()

          if (itemError) throw itemError
          publishedItemIds.push(upsertedItem.id)
          if (item.item_type === 'dialogue_chunk') dialogueItemIds.add(upsertedItem.id)

          // Pre-insert assertion: validate context_type (regression guard)
          if (!VALID_CONTEXT_TYPES.has(item.context_type)) {
            throw new Error(`Invalid context_type "${item.context_type}" for item "${item.base_text}". Must be one of: ${[...VALID_CONTEXT_TYPES].join(', ')}`)
          }

          // Delete existing meanings for this item and re-insert both languages.
          // item_meanings has no unique constraint on (learning_item_id, language), so
          // upsert-on-conflict is not available — delete+insert is the safe re-run strategy.
          const { error: deleteError } = await supabase
            .schema('indonesian')
            .from('item_meanings')
            .delete()
            .eq('learning_item_id', upsertedItem.id)
          if (deleteError) throw deleteError

          const meaningInserts = [
            ...(item.translation_nl?.trim() ? [{ learning_item_id: upsertedItem.id, translation_language: 'nl', translation_text: item.translation_nl, is_primary: true }] : []),
            ...(item.translation_en?.trim() ? [{ learning_item_id: upsertedItem.id, translation_language: 'en', translation_text: item.translation_en, is_primary: true }] : []),
          ]

          // Assert translation_language and translation_text before inserting (regression guard)
          for (const m of meaningInserts) {
            if (!VALID_LANGUAGES.has(m.translation_language)) {
              throw new Error(`Invalid translation_language "${m.translation_language}" — must be 'nl' or 'en'`)
            }
            if (!m.translation_text?.trim()) {
              throw new Error(`Empty translation_text for language "${m.translation_language}" on item "${item.base_text}"`)
            }
          }

          if (meaningInserts.length > 0) {
            const { error: meaningError } = await supabase
              .schema('indonesian')
              .from('item_meanings')
              .insert(meaningInserts)
            if (meaningError) throw meaningError
          }

          // Upsert Context
          const { error: ctxError } = await supabase
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
          if (ctxError) throw ctxError
        }
      }
      
    }

    // 4. Publish Exercise Candidates
    // Candidates fall into two categories:
    //   - Grammar exercises (contrast_pair, sentence_transformation, constrained_translation, cloze_mcq):
    //     linked via lesson_id + grammar_pattern_id — no vocabulary context needed
    //   - Vocabulary exercises (cloze, recognition_mcq, etc.):
    //     linked via context_id (looked up by source_text)
    const GRAMMAR_EXERCISE_TYPES = new Set([
      'contrast_pair', 'sentence_transformation', 'constrained_translation', 'cloze_mcq',
    ])

    // Everything publishes immediately — review happens live in the app.
    const approvedCandidates = candidates.filter((c: any) =>
      c.review_status === 'pending_review' || c.review_status === 'approved'
    )
    if (approvedCandidates.length > 0) {
      console.log(`\n4. Publishing ${approvedCandidates.length} approved exercise candidates...`)

      // Build slug → grammar_pattern_id map from what we just published
      const grammarPatternIdMap: Record<string, string> = {}
      if (grammarPatterns.length > 0 && !dryRun) {
        const { data: dbPatterns } = await supabase
          .schema('indonesian')
          .from('grammar_patterns')
          .select('id, slug')
        for (const p of dbPatterns || []) {
          grammarPatternIdMap[p.slug] = p.id
        }
      }

      let published = 0
      let skipped = 0
      for (const candidate of approvedCandidates) {
        const { exercise_type, grammar_pattern_slug, payload } = candidate

        if (!payload) {
          console.warn(`   ⚠️ Candidate missing payload field (exercise_type: ${exercise_type}) — skipping`)
          skipped++
          continue
        }

        if (dryRun) {
          console.log(`   [DRY RUN] Would publish ${exercise_type} (grammar_pattern: ${grammar_pattern_slug ?? 'none'})`)
          published++
          continue
        }

        // Extract answer_key from payload based on exercise type
        let answerKeyJson: Record<string, unknown> = {}
        if (exercise_type === 'contrast_pair' || exercise_type === 'cloze_mcq') {
          answerKeyJson = { correctOptionId: payload.correctOptionId }
        } else if (exercise_type === 'sentence_transformation' || exercise_type === 'constrained_translation') {
          answerKeyJson = { acceptableAnswers: payload.acceptableAnswers ?? [] }
        }

        if (GRAMMAR_EXERCISE_TYPES.has(exercise_type)) {
          // Grammar exercise: link via lesson_id + grammar_pattern_id
          if (!lessonId) {
            console.warn(`   ⚠️ Cannot publish grammar exercise — lessonId not available. Skipping.`)
            skipped++
            continue
          }

          const grammarPatternId = grammar_pattern_slug
            ? grammarPatternIdMap[grammar_pattern_slug]
            : undefined

          if (grammar_pattern_slug && !grammarPatternId) {
            console.warn(`   ⚠️ grammar_pattern_slug "${grammar_pattern_slug}" not found in DB — skipping`)
            skipped++
            continue
          }

          const { error } = await supabase
            .schema('indonesian')
            .from('exercise_variants')
            .insert({
              lesson_id: lessonId,
              exercise_type,
              grammar_pattern_id: grammarPatternId ?? null,
              payload_json: payload,
              answer_key_json: answerKeyJson,
              is_active: true,
            })

          if (error) {
            console.warn(`   ⚠️ Failed to insert grammar exercise variant: ${error.message}`)
            skipped++
          } else {
            published++
          }
        } else {
          // Vocabulary exercise: link via item_context (source_text lookup)
          const sourceText = payload.sentence ?? payload.sourceSentence ?? payload.sourceLanguageSentence
          if (!sourceText) {
            console.warn(`   ⚠️ Vocabulary exercise missing source text in payload — skipping`)
            skipped++
            continue
          }

          const { data: context, error: contextError } = await supabase
            .schema('indonesian')
            .from('item_contexts')
            .select('id')
            .eq('source_text', sourceText)
            .limit(1)
            .maybeSingle()

          if (contextError || !context) {
            console.warn(`   ⚠️ Could not find context for source_text: "${sourceText}" — skipping`)
            skipped++
            continue
          }

          const { error } = await supabase
            .schema('indonesian')
            .from('exercise_variants')
            .insert({
              context_id: context.id,
              exercise_type,
              grammar_pattern_id: grammar_pattern_slug ? grammarPatternIdMap[grammar_pattern_slug] ?? null : null,
              payload_json: payload,
              answer_key_json: answerKeyJson,
              is_active: true,
            })

          if (error) {
            console.warn(`   ⚠️ Failed to insert exercise variant: ${error.message}`)
            skipped++
          } else {
            published++
          }
        }
      }

      if (!dryRun) {
        // Verify the exercise_variants rows actually landed before marking staging as published
        const { count: variantCount } = await supabase
          .schema('indonesian')
          .from('exercise_variants')
          .select('*', { count: 'exact', head: true })
          .eq('lesson_id', lessonId!)

        if ((variantCount ?? 0) < published) {
          console.warn(`   ⚠️ Expected ${published} exercise_variants for lesson ${lessonNumber} but DB has ${variantCount} — staging NOT marked published`)
        } else {
          console.log(`   ✓ ${published} candidates published, ${skipped} skipped`)
          // Mark as published in staging only after DB confirmation
          const updatedCandidates = candidates.map((c: any) =>
            (c.review_status === 'pending_review' || c.review_status === 'approved')
              ? { ...c, review_status: 'published' }
              : c
          )
          fs.writeFileSync(
            path.join(stagingDir, 'candidates.ts'),
            `// Published via script\nexport const candidates = ${JSON.stringify(updatedCandidates, null, 2)}\n`
          )
          console.log('   ✓ Candidates marked as published in staging')
        }
      }
    }

    // 5. Publish Cloze Contexts
    if (clozeContexts.length > 0) {
      if (!lessonId) {
        console.warn('\n5. Skipping cloze contexts — lessonId not available (lesson publish may have failed or been skipped)')
      } else {
        console.log(`\n5. Publishing ${clozeContexts.length} cloze contexts...`)
        for (const ctx of clozeContexts) {
          if (dryRun) {
            console.log(`   [DRY RUN] Would publish cloze context for: ${ctx.learning_item_slug}`)
            continue
          }
          // Resolve learning_item_id from normalized_text.
          // Try each candidate slug in priority order until a match is found.
          // This handles simplified slugs from the linguist-structurer (e.g. "beres")
          // matching DB entries that include accent annotations (e.g. "beres (bèrès)").
          const slugCandidates = candidateSlugs(ctx.learning_item_slug)
          let item: { id: string } | null = null
          let matchedSlug: string | null = null
          for (const candidate of slugCandidates) {
            const { data, error } = await supabase
              .schema('indonesian')
              .from('learning_items')
              .select('id')
              .eq('normalized_text', candidate)
              .limit(1)
              .maybeSingle()
            if (!error && data) {
              item = data
              matchedSlug = candidate
              break
            }
          }
          if (!item) {
            // Last resort: prefix match to catch "beres" matching "beres (bèrès)"
            const prefix = slugCandidates[slugCandidates.length - 1]
            const { data } = await supabase
              .schema('indonesian')
              .from('learning_items')
              .select('id, normalized_text')
              .ilike('normalized_text', `${prefix}%`)
              .limit(1)
              .maybeSingle()
            if (data) {
              item = { id: data.id }
              matchedSlug = data.normalized_text
            }
          }
          if (matchedSlug && matchedSlug !== ctx.learning_item_slug.toLowerCase().trim()) {
            console.log(`   ℹ️  Slug "${ctx.learning_item_slug}" resolved via fallback to "${matchedSlug}"`)
          }

          if (!item) {
            console.warn(`   ⚠️ Could not find learning item for slug: ${ctx.learning_item_slug} — skipping`)
            continue
          }

          const { error: ctxError } = await supabase
            .schema('indonesian')
            .from('item_contexts')
            .upsert({
              learning_item_id: item.id,
              context_type: 'cloze',
              source_text: ctx.source_text,
              translation_text: ctx.translation_text,
              is_anchor_context: false,
              difficulty: ctx.difficulty ?? null,
              topic_tag: ctx.topic_tag ?? null,
              source_lesson_id: lessonId,
            }, { onConflict: 'learning_item_id,source_text' })

          if (ctxError) {
            console.warn(`   ⚠️ Failed to upsert cloze context for ${ctx.learning_item_slug}: ${ctxError.message}`)
          }
        }
        if (!dryRun) console.log('   ✓ Cloze contexts published')
      }
    }

    // 6. Post-seed verification (real runs only)
    if (!dryRun && publishedItemIds.length > 0) {
      console.log('\n6. Verifying seed integrity...')
      const CHUNK_SIZE = 50
      const expectedCount = publishedItemIds.length

      // Verify meanings (chunked)
      const nlCovered = new Set<string>()
      const enCovered = new Set<string>()
      for (let i = 0; i < publishedItemIds.length; i += CHUNK_SIZE) {
        const chunk = publishedItemIds.slice(i, i + CHUNK_SIZE)
        const { data: nlData, error: nlErr } = await supabase
          .schema('indonesian').from('item_meanings').select('learning_item_id')
          .in('learning_item_id', chunk).eq('translation_language', 'nl')
        if (nlErr) throw nlErr
        ;(nlData ?? []).forEach((r: any) => nlCovered.add(r.learning_item_id))

        const { data: enData, error: enErr } = await supabase
          .schema('indonesian').from('item_meanings').select('learning_item_id')
          .in('learning_item_id', chunk).eq('translation_language', 'en')
        if (enErr) throw enErr
        ;(enData ?? []).forEach((r: any) => enCovered.add(r.learning_item_id))
      }

      // Dialogue chunks have no translations — exclude from NL meaning check
      const itemsRequiringNl = publishedItemIds.filter(id => !dialogueItemIds.has(id))
      const missingNl = itemsRequiringNl.filter(id => !nlCovered.has(id))
      const missingEn = publishedItemIds.filter(id => !enCovered.has(id))

      if (missingNl.length > 0) {
        console.error(`   ✗ ${missingNl.length}/${itemsRequiringNl.length} items missing NL meaning`)
        console.error('\n✗ Seed integrity check FAILED — missing NL meanings indicate a silent write error.')
        console.error('  Re-run this script to retry.')
        process.exit(1)
      } else {
        const dialogueCount = publishedItemIds.length - itemsRequiringNl.length
        console.log(`   ✓ All ${itemsRequiringNl.length} items have NL meanings${dialogueCount > 0 ? ` (${dialogueCount} dialogue chunks excluded)` : ''}`)
      }
      if (missingEn.length > 0) {
        console.warn(`   ⚠️ ${missingEn.length}/${expectedCount} items missing EN meaning (expected if no translation_en in staging)`)
      } else {
        console.log(`   ✓ All ${expectedCount} items have EN meanings`)
      }

      // Verify contexts (chunked) — using publishedItemIds, not a re-query of item_contexts
      const ctxCovered = new Set<string>()
      for (let i = 0; i < publishedItemIds.length; i += CHUNK_SIZE) {
        const chunk = publishedItemIds.slice(i, i + CHUNK_SIZE)
        const { data: ctxData, error: ctxErr } = await supabase
          .schema('indonesian').from('item_contexts').select('learning_item_id')
          .in('learning_item_id', chunk)
        if (ctxErr) throw ctxErr
        ;(ctxData ?? []).forEach((r: any) => ctxCovered.add(r.learning_item_id))
      }
      const missingCtx = publishedItemIds.filter(id => !ctxCovered.has(id))
      if (missingCtx.length > 0) {
        console.error(`   ✗ ${missingCtx.length}/${expectedCount} items have no context — they cannot appear in sessions`)
        process.exit(1)
      } else {
        console.log(`   ✓ All ${expectedCount} items have at least one context`)
      }

      // Mark as published in staging — only after step-6 integrity check passes.
      // Writing this earlier would permanently mark items published even if the
      // DB write failed, making re-runs silently skip the broken items.
      const updatedItems = learningItems.map((item: any) =>
        (item.review_status === 'pending_review' || item.review_status === 'approved')
          ? { ...item, review_status: 'published' }
          : item
      )
      fs.writeFileSync(
        path.join(stagingDir, 'learning-items.ts'),
        `// Published via script\nexport const learningItems = ${JSON.stringify(updatedItems, null, 2)}\n`
      )
      console.log('   ✓ Learning items marked as published in staging')

      // Note: exercise_variant verification is handled in step 4's post-insert check.
      // Vocab variants link via context_id (not lesson_id) — a lesson_id query would
      // only count grammar variants and produce misleading results for vocab candidates.
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
