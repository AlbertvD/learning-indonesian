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
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { validatePOS } from './lib/validate-pos'
import {
  validateCapabilityStaging,
  validateContentUnits,
  validateExerciseAssets,
  validateLessonPageBlocks,
} from './lib/content-pipeline-output'

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
// This is safe Ã¢â‚¬â€ we're connecting to our own internal Supabase instance.
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
  const [contentUnits, capabilities, lessonPageBlocks, exerciseAssets] = await Promise.all([
    readStagingFile(path.join(stagingDir, 'content-units.ts')),
    readStagingFile(path.join(stagingDir, 'capabilities.ts')),
    readStagingFile(path.join(stagingDir, 'lesson-page-blocks.ts')),
    readStagingFile(path.join(stagingDir, 'exercise-assets.ts')),
  ])

  return {
    lesson,
    learningItems: learningItems || [],
    grammarPatterns: grammarPatterns || [],
    candidates: candidates || [],
    clozeContexts: clozeContexts || [],
    contentUnits: contentUnits || [],
    capabilities: capabilities || [],
    lessonPageBlocks: lessonPageBlocks || [],
    exerciseAssets: exerciseAssets || [],
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
    console.error(`\nÃ¢Å“â€” Invalid section type(s) in lesson ${lessonNumber}:`)
    errors.forEach(e => console.error(e))
    console.error('\nFix the section type(s) in lesson.ts before publishing.')
    process.exit(1)
  }
}

// Normalise a cloze context slug to match normalized_text in the DB.
// normalized_text = base_text.toLowerCase().trim().
//
// NOTE: do NOT replace hyphens with spaces Ã¢â‚¬â€ Indonesian has legitimately hyphenated
// words (oleh-oleh, sama-sama, baik-baik) where the hyphen is part of the word.
//
// The slug in cloze-contexts.ts ideally matches base_text exactly, but the
// linguist-structurer often writes simplified slugs (e.g. "beres") while the
// base_text Ã¢â‚¬â€ and therefore normalized_text in the DB Ã¢â‚¬â€ includes accent
// annotations and passive markers (e.g. "beres (bÃƒÂ¨rÃƒÂ¨s)", "dibawa*").
//
// candidateSlugs() returns the exact slug first, then fallback variants:
//   1. exact: "beres (bÃƒÂ¨rÃƒÂ¨s)"  Ã¢â€� â€™  matches DB directly
//   2. strip trailing *: "dibawa*" Ã¢â€� â€™ "dibawa"
//   3. strip parenthetical: "beres (bÃƒÂ¨rÃƒÂ¨s)" Ã¢â€� â€™ "beres"
//   4. both: "disetrika* (foo)" Ã¢â€� â€™ "disetrika"
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

export async function publishCapabilityPipelineOutput(input: {
  supabase: ReturnType<typeof createSupabaseClient>
  dryRun: boolean
  contentUnits: any[]
  capabilities: any[]
  lessonPageBlocks: any[]
  exerciseAssets: any[]
}) {
  const { supabase, dryRun, contentUnits, capabilities, lessonPageBlocks, exerciseAssets } = input
  const requiredMissing: string[] = []
  if (contentUnits.length === 0) requiredMissing.push('content-units.ts')
  if (lessonPageBlocks.length === 0) requiredMissing.push('lesson-page-blocks.ts')
  if (capabilities.length === 0) requiredMissing.push('capabilities.ts')
  if (exerciseAssets.length === 0) requiredMissing.push('exercise-assets.ts')
  if (requiredMissing.length > 0) {
    throw new Error(`Missing required Slice 10 staging output: ${requiredMissing.join(', ')}`)
  }

  const findings = [
    ...validateContentUnits(contentUnits),
    ...validateCapabilityStaging({ capabilities, contentUnits }),
    ...validateExerciseAssets({ exerciseAssets, capabilities }),
    ...validateLessonPageBlocks({ blocks: lessonPageBlocks, contentUnits, capabilities }),
  ]
  const critical = findings.filter(finding => finding.severity === 'CRITICAL')
  if (critical.length > 0) {
    throw new Error(`Slice 10 staging output has critical findings:\n${critical.map(finding => `${finding.rule}: ${finding.detail}`).join('\n')}`)
  }

  console.log('\nCapability pipeline output...')
  if (dryRun) {
    console.log('   [DRY RUN] Local Slice 10 validation passed before publish simulation')
    console.log(`   [DRY RUN] Would upsert ${contentUnits.length} content units`)
    console.log(`   [DRY RUN] Would upsert ${lessonPageBlocks.length} lesson page blocks`)
    console.log(`   [DRY RUN] Would upsert ${capabilities.length} capabilities`)
    console.log(`   [DRY RUN] Would upsert ${exerciseAssets.length} exercise assets`)
    return
  }

  const contentUnitIdsBySlug = new Map<string, string>()
  for (const unit of contentUnits) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('content_units')
      .upsert({
        content_unit_key: unit.content_unit_key,
        source_ref: unit.source_ref,
        source_section_ref: unit.source_section_ref,
        unit_kind: unit.unit_kind,
        unit_slug: unit.unit_slug,
        display_order: unit.display_order,
        payload_json: unit.payload_json ?? {},
        source_fingerprint: unit.source_fingerprint,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'content_unit_key' })
      .select('id, unit_slug')
      .single()
    if (error) throw error
    contentUnitIdsBySlug.set(data.unit_slug, data.id)
  }
  console.log(`   Upserted ${contentUnitIdsBySlug.size} content units`)

  for (const block of lessonPageBlocks) {
    const { error } = await supabase
      .schema('indonesian')
      .from('lesson_page_blocks')
      .upsert({
        block_key: block.block_key,
        source_ref: block.source_ref,
        source_refs: block.source_refs ?? [],
        content_unit_slugs: block.content_unit_slugs ?? [],
        block_kind: block.block_kind,
        display_order: block.display_order,
        payload_json: block.payload_json ?? {},
        source_progress_event: block.source_progress_event ?? null,
        capability_key_refs: block.capability_key_refs ?? [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'source_ref,block_key' })
    if (error) throw error
  }
  console.log(`   Upserted ${lessonPageBlocks.length} lesson page blocks`)

  const capabilityIdsByKey = new Map<string, string>()
  for (const capability of capabilities) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .upsert({
        canonical_key: capability.canonicalKey,
        source_kind: capability.sourceKind,
        source_ref: capability.sourceRef,
        capability_type: capability.capabilityType,
        direction: capability.direction,
        modality: capability.modality,
        learner_language: capability.learnerLanguage,
        projection_version: capability.projectionVersion,
        readiness_status: 'unknown',
        publication_status: 'draft',
        source_fingerprint: capability.sourceFingerprint,
        artifact_fingerprint: capability.artifactFingerprint,
        metadata_json: {
          skillType: capability.skillType,
          requiredArtifacts: capability.requiredArtifacts,
          prerequisiteKeys: capability.prerequisiteKeys,
          requiredSourceProgress: capability.requiredSourceProgress ?? null,
          difficultyLevel: capability.difficultyLevel,
          goalTags: capability.goalTags ?? [],
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'canonical_key' })
      .select('id, canonical_key')
      .single()
    if (error) throw error
    capabilityIdsByKey.set(data.canonical_key, data.id)
  }
  console.log(`   Upserted ${capabilityIdsByKey.size} capabilities`)

  for (const capability of capabilities) {
    const capabilityId = capabilityIdsByKey.get(capability.canonicalKey)
    if (!capabilityId) continue
    for (const slug of capability.contentUnitSlugs ?? []) {
      const contentUnitId = contentUnitIdsBySlug.get(slug)
      if (!contentUnitId) continue
      const { error } = await supabase
        .schema('indonesian')
        .from('capability_content_units')
        .upsert({
          capability_id: capabilityId,
          content_unit_id: contentUnitId,
          relationship_kind: capability.relationshipKind ?? 'referenced_by',
        }, { onConflict: 'capability_id,content_unit_id,relationship_kind' })
      if (error) throw error
    }
  }

  for (const asset of exerciseAssets) {
    const capabilityId = capabilityIdsByKey.get(asset.capability_key)
    if (!capabilityId) continue
    const { error } = await supabase
      .schema('indonesian')
      .from('capability_artifacts')
      .upsert({
        capability_id: capabilityId,
        artifact_kind: asset.artifact_kind,
        quality_status: asset.quality_status,
        artifact_ref: asset.asset_key,
        artifact_json: asset.payload_json ?? {},
        artifact_fingerprint: asset.asset_key,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'capability_id,artifact_kind,artifact_fingerprint' })
    if (error) throw error
  }
  console.log(`   Upserted ${exerciseAssets.length} capability artifacts`)
}

async function publishContent(lessonNumber: number, dryRun: boolean) {
  const supabase = dryRun ? null as unknown as ReturnType<typeof createSupabaseClient> : createSupabaseClient()
  const {
    lesson,
    learningItems,
    grammarPatterns,
    candidates,
    clozeContexts,
    contentUnits,
    capabilities,
    lessonPageBlocks,
    exerciseAssets,
    stagingDir,
  } = await loadStagingData(lessonNumber)

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
          console.log(`   Ã¢Å“â€œ Lesson updated: ${lessonId}`)
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
          console.log(`   Ã¢Å“â€œ Lesson published: ${lessonId}`)
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
        console.log(`   Ã¢Å“â€œ ${lesson.sections.length} sections published`)
      }
    }

    await publishCapabilityPipelineOutput({
      supabase,
      dryRun,
      contentUnits,
      capabilities,
      lessonPageBlocks,
      exerciseAssets,
    })

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
            console.log(`   Ã¢â€œËœ Grammar patterns table not yet in schema, skipping`)
            break
          }
          if (patternError) throw patternError
          patternMap[pattern.slug] = upsertedPattern.id
        }
      }
      if (!dryRun) {
        console.log(`   Ã¢Å“â€œ ${grammarPatterns.length} grammar patterns processed`)
      }
    }

    // 3. Publish Learning Items
    // Everything publishes immediately Ã¢â‚¬â€ review happens live in the app via admin account.
    // Only rejected and already-published items are excluded.
    // 'deferred_dialogue' is included so that adding artifacts (translations or a cloze
    // context) on a re-run automatically lifts the deferral.
    const approvedItems = learningItems.filter((item: any) =>
      item.review_status === 'pending_review' ||
      item.review_status === 'approved' ||
      item.review_status === 'deferred_dialogue'
    )

    // Defer dialogue_chunk items that lack reviewability artifacts.
    // Per C-1 in docs/plans/2026-04-24-dialogue-pipeline-completion.md, a
    // dialogue_chunk is reviewable iff it has BOTH translation_nl (for
    // productive-stage recognition_mcq) AND a cloze context keyed on the
    // dialogue line's normalized slug (for retrieving-stage cloze, which is
    // the only path session-engine.md:125 routes to at that stage).
    //
    // Cloze contexts authored by cloze-creator for dialogue_chunks use
    // learning_item_slug = base_text.toLowerCase().trim() Ã¢â‚¬â€ match on that, not
    // on source_text (which carries the `___` blank).
    const dialogueSlugsWithCloze = new Set(
      clozeContexts
        .filter((c: any) => typeof c?.learning_item_slug === 'string')
        .map((c: any) => String(c.learning_item_slug).toLowerCase().trim())
    )
    const deferredDialogueChunks = approvedItems.filter((item: any) => {
      if (item.item_type !== 'dialogue_chunk') return false
      const hasTranslation = Boolean(item.translation_nl?.trim())
      const slug = String(item.base_text ?? '').toLowerCase().trim()
      const hasCloze = dialogueSlugsWithCloze.has(slug)
      return !(hasTranslation && hasCloze)
    })
    const deferredKeys = new Set(deferredDialogueChunks.map((d: any) => d.base_text))
    const publishableItems = approvedItems.filter((item: any) => !deferredKeys.has(item.base_text))

    if (deferredDialogueChunks.length > 0) {
      console.warn(`\nÃ¢Å¡Â� Ã¯Â¸Â  Deferring ${deferredDialogueChunks.length} dialogue_chunk item(s) Ã¢â‚¬â€ no translation_nl and no cloze context:`)
      for (const d of deferredDialogueChunks) {
        const t = d.base_text.length > 80 ? `${d.base_text.slice(0, 80)}Ã¢â‚¬Â¦` : d.base_text
        console.warn(`     - "${t}"`)
      }
      console.warn(`   Marked review_status='deferred_dialogue' in staging Ã¢â‚¬â€ re-run after adding translations or cloze contexts.\n`)
    }

    const VALID_LANGUAGES = new Set(['nl', 'en'])
    const VALID_CONTEXT_TYPES = new Set(['example_sentence', 'dialogue', 'cloze', 'lesson_snippet', 'vocabulary_list', 'exercise_prompt'])
    const publishedItemIds: string[] = []
    const dialogueItemIds = new Set<string>()

    // POS validation Ã¢â‚¬â€ WARNING for missing pos on word/phrase items,
    // CRITICAL (abort publish) for invalid pos values, coverage report at the end.
    if (publishableItems.length > 0) {
      const posResult = validatePOS(publishableItems)
      for (const w of posResult.warnings) console.warn(w)
      if (posResult.criticalErrors.length > 0) {
        for (const e of posResult.criticalErrors) console.error(e)
        console.error('Aborting publish due to invalid POS values.')
        process.exit(1)
      }
    }

    if (publishableItems.length > 0) {
      console.log(`\n3. Publishing ${publishableItems.length} learning items...`)
      for (const item of publishableItems) {
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
              pos: item.pos ?? null,
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
          // upsert-on-conflict is not available Ã¢â‚¬â€ delete+insert is the safe re-run strategy.
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
              throw new Error(`Invalid translation_language "${m.translation_language}" Ã¢â‚¬â€ must be 'nl' or 'en'`)
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
    //     linked via lesson_id + grammar_pattern_id Ã¢â‚¬â€ no vocabulary context needed
    //   - Vocabulary exercises (cloze, recognition_mcq, etc.):
    //     linked via context_id (looked up by source_text)
    const GRAMMAR_EXERCISE_TYPES = new Set([
      'contrast_pair', 'sentence_transformation', 'constrained_translation', 'cloze_mcq',
    ])

    // Everything publishes immediately Ã¢â‚¬â€ review happens live in the app.
    const approvedCandidates = candidates.filter((c: any) =>
      c.review_status === 'pending_review' || c.review_status === 'approved'
    )
    if (approvedCandidates.length > 0) {
      console.log(`\n4. Publishing ${approvedCandidates.length} approved exercise candidates...`)

      // Build slug Ã¢â€� â€™ grammar_pattern_id map from what we just published
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
          console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Candidate missing payload field (exercise_type: ${exercise_type}) Ã¢â‚¬â€ skipping`)
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
            console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Cannot publish grammar exercise Ã¢â‚¬â€ lessonId not available. Skipping.`)
            skipped++
            continue
          }

          const grammarPatternId = grammar_pattern_slug
            ? grammarPatternIdMap[grammar_pattern_slug]
            : undefined

          if (grammar_pattern_slug && !grammarPatternId) {
            console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â grammar_pattern_slug "${grammar_pattern_slug}" not found in DB Ã¢â‚¬â€ skipping`)
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
            console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Failed to insert grammar exercise variant: ${error.message}`)
            skipped++
          } else {
            published++
          }
        } else {
          // Vocabulary exercise: link via item_context (source_text lookup)
          const sourceText = payload.sentence ?? payload.sourceSentence ?? payload.sourceLanguageSentence
          if (!sourceText) {
            console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Vocabulary exercise missing source text in payload Ã¢â‚¬â€ skipping`)
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
            console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Could not find context for source_text: "${sourceText}" Ã¢â‚¬â€ skipping`)
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
            console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Failed to insert exercise variant: ${error.message}`)
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
          console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Expected ${published} exercise_variants for lesson ${lessonNumber} but DB has ${variantCount} Ã¢â‚¬â€ staging NOT marked published`)
        } else {
          console.log(`   Ã¢Å“â€œ ${published} candidates published, ${skipped} skipped`)
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
          console.log('   Ã¢Å“â€œ Candidates marked as published in staging')
        }
      }
    }

    // 5. Publish Cloze Contexts
    if (clozeContexts.length > 0) {
      if (!lessonId) {
        console.warn('\n5. Skipping cloze contexts Ã¢â‚¬â€ lessonId not available (lesson publish may have failed or been skipped)')
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
          // matching DB entries that include accent annotations (e.g. "beres (bÃƒÂ¨rÃƒÂ¨s)").
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
            // Last resort: prefix match to catch "beres" matching "beres (bÃƒÂ¨rÃƒÂ¨s)"
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
            console.log(`   Ã¢â€žÂ¹Ã¯Â¸Â  Slug "${ctx.learning_item_slug}" resolved via fallback to "${matchedSlug}"`)
          }

          if (!item) {
            console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Could not find learning item for slug: ${ctx.learning_item_slug} Ã¢â‚¬â€ skipping`)
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
            console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â Failed to upsert cloze context for ${ctx.learning_item_slug}: ${ctxError.message}`)
          }
        }
        if (!dryRun) console.log('   Ã¢Å“â€œ Cloze contexts published')
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

      // Dialogue chunks are already reviewability-gated pre-write (see the
      // deferredDialogueChunks pre-publish gate earlier in this script). Step 6
      // enforces reviewability for EVERYTHING ELSE Ã¢â‚¬â€ catches the original
      // 2026-04-24 incident's non-dialogue orphan pattern (the 65 `sentence`
      // items + 20 no-context items that landed without meanings or variants).
      //
      // Non-dialogue reviewability: item has NL meaning OR item has at least one
      // item_contexts row with an active exercise_variant. "Either" is correct
      // here (unlike dialogue_chunks which require BOTH): recognition_mcq needs
      // the NL meaning; cloze/listening needs a context+variant; any one of the
      // two render paths satisfies filterEligible.
      const nonDialogueIds = publishedItemIds.filter(id => !dialogueItemIds.has(id))
      const missingNl = nonDialogueIds.filter(id => !nlCovered.has(id))
      const missingEn = publishedItemIds.filter(id => !enCovered.has(id))

      if (missingNl.length > 0) {
        console.error(`   Ã¢Å“â€” ${missingNl.length}/${nonDialogueIds.length} non-dialogue items missing NL meaning`)
        console.error('\nÃ¢Å“â€” Seed integrity check FAILED Ã¢â‚¬â€ missing NL meanings indicate a silent write error.')
        console.error('  Re-run this script to retry.')
        process.exit(1)
      } else {
        const dialogueCount = publishedItemIds.length - nonDialogueIds.length
        console.log(`   Ã¢Å“â€œ All ${nonDialogueIds.length} non-dialogue items have NL meanings${dialogueCount > 0 ? ` (${dialogueCount} dialogue chunks excluded Ã¢â‚¬â€ verified separately)` : ''}`)
      }
      if (missingEn.length > 0) {
        console.warn(`   Ã¢Å¡Â� Ã¯Â¸Â ${missingEn.length}/${expectedCount} items missing EN meaning (expected if no translation_en in staging)`)
      } else {
        console.log(`   Ã¢Å“â€œ All ${expectedCount} items have EN meanings`)
      }

      // Verify contexts (chunked) Ã¢â‚¬â€ using publishedItemIds, not a re-query of item_contexts
      const ctxCovered = new Set<string>()
      const ctxIdsByItem = new Map<string, string[]>()
      for (let i = 0; i < publishedItemIds.length; i += CHUNK_SIZE) {
        const chunk = publishedItemIds.slice(i, i + CHUNK_SIZE)
        const { data: ctxData, error: ctxErr } = await supabase
          .schema('indonesian').from('item_contexts').select('id, learning_item_id')
          .in('learning_item_id', chunk)
        if (ctxErr) throw ctxErr
        for (const r of ctxData ?? []) {
          const row = r as { id: string; learning_item_id: string }
          ctxCovered.add(row.learning_item_id)
          const list = ctxIdsByItem.get(row.learning_item_id) ?? []
          list.push(row.id)
          ctxIdsByItem.set(row.learning_item_id, list)
        }
      }
      const missingCtx = publishedItemIds.filter(id => !ctxCovered.has(id))
      if (missingCtx.length > 0) {
        console.error(`   Ã¢Å“â€” ${missingCtx.length}/${expectedCount} items have no context Ã¢â‚¬â€ they cannot appear in sessions`)
        process.exit(1)
      } else {
        console.log(`   Ã¢Å“â€œ All ${expectedCount} items have at least one context`)
      }

      // Cross-check: every non-dialogue published item is "reviewable" (has NL
      // meaning OR has at least one context with an active exercise_variant).
      // The NL-meaning branch is already verified above (missingNl empty). This
      // catches the corner case where an item has neither NL meaning nor a
      // context with a live variant Ã¢â‚¬â€ i.e. the 65 `sentence` orphan pattern
      // from the 2026-04-24 incident. Dialogue_chunks are skipped here: they're
      // reviewability-checked pre-write by the deferredDialogueChunks gate
      // (stricter AND-contract) so they can't enter this step without artifacts.
      const allCtxIds = [...ctxIdsByItem.values()].flat()
      const ctxIdsWithActiveVariant = new Set<string>()
      if (allCtxIds.length > 0) {
        for (let i = 0; i < allCtxIds.length; i += CHUNK_SIZE) {
          const chunk = allCtxIds.slice(i, i + CHUNK_SIZE)
          const { data: varData, error: varErr } = await supabase
            .schema('indonesian').from('exercise_variants').select('context_id')
            .in('context_id', chunk).eq('is_active', true)
          if (varErr) throw varErr
          for (const r of varData ?? []) {
            const row = r as { context_id: string }
            if (row.context_id) ctxIdsWithActiveVariant.add(row.context_id)
          }
        }
      }
      const unreviewable: string[] = []
      for (const id of nonDialogueIds) {
        if (nlCovered.has(id)) continue   // NL-path satisfied
        const itemCtxIds = ctxIdsByItem.get(id) ?? []
        if (itemCtxIds.some(cid => ctxIdsWithActiveVariant.has(cid))) continue   // variant-path satisfied
        unreviewable.push(id)
      }
      if (unreviewable.length > 0) {
        console.error(`   Ã¢Å“â€” ${unreviewable.length}/${nonDialogueIds.length} non-dialogue items are unreviewable Ã¢â‚¬â€ they have neither an NL meaning nor any context with an active exercise_variant`)
        console.error('     Affected item IDs:')
        for (const id of unreviewable.slice(0, 10)) console.error(`       ${id}`)
        if (unreviewable.length > 10) console.error(`       Ã¢â‚¬Â¦ and ${unreviewable.length - 10} more`)
        console.error('\nÃ¢Å“â€” Seed integrity check FAILED Ã¢â‚¬â€ items will be scheduled by FSRS but no exercise can render them (lesson 9 orphan pattern).')
        process.exit(1)
      } else {
        console.log(`   Ã¢Å“â€œ All ${nonDialogueIds.length} non-dialogue items are reviewable (NL meaning or active variant)`)
      }

      // Mark as published in staging Ã¢â‚¬â€ only after step-6 integrity check passes.
      // Writing this earlier would permanently mark items published even if the
      // DB write failed, making re-runs silently skip the broken items.
      // Deferred dialogue chunks get review_status='deferred_dialogue' so they're
      // visible as TODO; re-running the script after artifacts land auto-publishes them.
      const updatedItems = learningItems.map((item: any) => {
        const wasCandidate = item.review_status === 'pending_review' ||
                             item.review_status === 'approved' ||
                             item.review_status === 'deferred_dialogue'
        if (!wasCandidate) return item
        if (deferredKeys.has(item.base_text)) return { ...item, review_status: 'deferred_dialogue' }
        return { ...item, review_status: 'published' }
      })
      fs.writeFileSync(
        path.join(stagingDir, 'learning-items.ts'),
        `// Published via script\nexport const learningItems = ${JSON.stringify(updatedItems, null, 2)}\n`
      )
      console.log('   Ã¢Å“â€œ Learning items marked as published in staging')

      // Note: exercise_variant verification is handled in step 4's post-insert check.
      // Vocab variants link via context_id (not lesson_id) Ã¢â‚¬â€ a lesson_id query would
      // only count grammar variants and produce misleading results for vocab candidates.
    } else if (!dryRun && deferredDialogueChunks.length > 0) {
      // No items were published, but there are deferrals. Still write the staging
      // back so the deferred markers persist (otherwise items stay 'pending_review'
      // and the deferral list is recomputed every run with no record of intent).
      const updatedItems = learningItems.map((item: any) => {
        const wasCandidate = item.review_status === 'pending_review' ||
                             item.review_status === 'approved' ||
                             item.review_status === 'deferred_dialogue'
        if (!wasCandidate) return item
        if (deferredKeys.has(item.base_text)) return { ...item, review_status: 'deferred_dialogue' }
        return item
      })
      fs.writeFileSync(
        path.join(stagingDir, 'learning-items.ts'),
        `// Published via script\nexport const learningItems = ${JSON.stringify(updatedItems, null, 2)}\n`
      )
      console.log(`\nÃ¢Å“â€œ ${deferredDialogueChunks.length} dialogue chunks marked deferred in staging (nothing else to publish)`)
    }

    console.log(`\nÃ¢Å“â€œ ${dryRun ? '[DRY RUN] ' : ''}Successfully processed lesson ${lessonNumber}`)

    // POS coverage report Ã¢â‚¬â€ informational summary at the end.
    // Uses publishableItems (excludes deferred dialogue chunks, which have no POS).
    if (!dryRun && publishableItems.length > 0) {
      const posResult = validatePOS(publishableItems)
      console.log(`\n[POS-coverage] Lesson ${lessonNumber} word/phrase items by POS:`)
      for (const [pos, count] of Object.entries(posResult.coverage).sort()) {
        console.log(`  ${pos}: ${count}`)
      }
    }

  } catch (err) {
    console.error('\nPublish failed:', err)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function buildLintStagingCommand(lessonNumber: number): {
  command: string
  args: string[]
} {
  return {
    command: process.execPath,
    args: [
      path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      'scripts/lint-staging.ts',
      '--lesson',
      String(lessonNumber),
      '--severity',
      'critical',
    ],
  }
}

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: npx tsx scripts/publish-approved-content.ts <lesson-number> [--dry-run] [--skip-lint]')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')
  const skipLint = process.argv.includes('--skip-lint')

  if (!skipLint && !(dryRun && !process.env.SUPABASE_SERVICE_KEY)) {
    // Run the deterministic linter as a pre-flight gate. Exit 1 from the
    // linter means at least one CRITICAL finding Ã¢â‚¬â€ refuse to publish until
    // it's clean. Use --skip-lint to override (e.g. when republishing
    // already-shipped content during a migration).
    const lintCommand = buildLintStagingCommand(lessonNumber)
    const lint = spawnSync(lintCommand.command, lintCommand.args, { stdio: 'inherit' })
    if (lint.status !== 0) {
      console.error(`\nlint-staging found CRITICAL issues for lesson ${lessonNumber} Ã¢â‚¬â€ fix them and rerun, or use --skip-lint to override.`)
      process.exit(1)
    }
  } else if (dryRun && !process.env.SUPABASE_SERVICE_KEY) {
    console.log('Skipping DB-backed lint during dry-run because SUPABASE_SERVICE_KEY is not set; local Slice 10 validation still runs.')
  }

  await publishContent(lessonNumber, dryRun)
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
