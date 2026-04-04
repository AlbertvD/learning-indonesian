#!/usr/bin/env bun
/**
 * publish-grammar-candidates.ts
 *
 * Publishes approved grammar exercise candidates from a staging candidates.ts
 * file to Supabase. Grammar candidates are not tied to a specific vocabulary
 * word — this script creates sentence-level learning_items from each
 * candidate's exercise payload, then wires up item_contexts,
 * item_context_grammar_patterns, and exercise_variants.
 *
 * Usage:
 *   bun scripts/publish-grammar-candidates.ts <lesson-number> --dry-run
 *   bun scripts/publish-grammar-candidates.ts <lesson-number>
 *   Requires SUPABASE_SERVICE_KEY in .env.local
 *
 * Publish order (per design spec section 7.3):
 *   1. Resolve or create learning_item (item_type: 'sentence')
 *   2. Upsert item_contexts (context_type: 'exercise_prompt')
 *   3. Upsert item_context_grammar_patterns links
 *   4. Insert exercise_variants
 *   5. Mark candidate as 'published' in staging file
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Env / Client
// ---------------------------------------------------------------------------

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('CRITICAL: SUPABASE_SERVICE_KEY not set. Add it to .env.local.')
  process.exit(1)
}

const SUPABASE_URL = 'https://api.supabase.duin.home'
const supabase = createClient(SUPABASE_URL, serviceKey)
const dryRun = process.argv.includes('--dry-run')

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const lessonArg = process.argv[2]
if (!lessonArg || lessonArg === '--dry-run') {
  console.error('Usage: bun scripts/publish-grammar-candidates.ts <lesson-number> [--dry-run]')
  process.exit(1)
}
const lessonNumber = parseInt(lessonArg, 10)
if (isNaN(lessonNumber)) {
  console.error(`Invalid lesson number: ${lessonArg}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Load staging candidates
// ---------------------------------------------------------------------------

const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)
const candidatesPath = path.join(stagingDir, 'candidates.ts')

if (!fs.existsSync(candidatesPath)) {
  console.error(`CRITICAL: Staging file not found: ${candidatesPath}`)
  process.exit(1)
}

const { candidates } = await import(candidatesPath)

// ---------------------------------------------------------------------------
// Helpers — derive base_text from candidate payload
// ---------------------------------------------------------------------------

function deriveBaseText(candidate: any): string {
  const p = candidate.payload
  // sentence_transformation: use the source sentence being transformed
  if (p.sourceSentence) return p.sourceSentence
  // constrained_translation: use the Dutch source sentence
  if (p.sourceLanguageSentence) return p.sourceLanguageSentence
  // contrast_pair: use the promptText
  if (p.promptText) return p.promptText
  throw new Error(`Cannot derive base_text from candidate: ${JSON.stringify(candidate).slice(0, 120)}`)
}

function buildAnswerKeyJson(candidate: any): Record<string, unknown> {
  const p = candidate.payload
  if (candidate.exercise_type === 'contrast_pair') {
    return { correctOptionId: p.correctOptionId }
  }
  if (candidate.exercise_type === 'sentence_transformation') {
    return { acceptableAnswers: p.acceptableAnswers }
  }
  if (candidate.exercise_type === 'constrained_translation') {
    return {
      acceptableAnswers: p.acceptableAnswers,
      disallowedShortcutForms: p.disallowedShortcutForms ?? null,
    }
  }
  return {}
}

function buildPayloadJson(candidate: any): Record<string, unknown> {
  const p = candidate.payload
  // Strip answer keys from payload — they live in answer_key_json
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { acceptableAnswers: _a, correctOptionId: _c, disallowedShortcutForms: _d, ...rest } = p
  return rest
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const approved = candidates.filter((c: any) => c.review_status === 'approved')
const pending  = candidates.filter((c: any) => c.review_status === 'pending_review')
const rejected = candidates.filter((c: any) => c.review_status === 'rejected')
const published = candidates.filter((c: any) => c.review_status === 'published')

console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Publishing grammar candidates — lesson ${lessonNumber}`)
console.log(`  approved: ${approved.length}  pending: ${pending.length}  rejected: ${rejected.length}  already published: ${published.length}`)

if (pending.length > 0) {
  console.log(`  WARNING: ${pending.length} candidates still in pending_review — skipped`)
}

if (approved.length === 0) {
  console.log('  No approved candidates to publish.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Step 0: Resolve grammar pattern IDs by slug
// ---------------------------------------------------------------------------

const slugsNeeded = [...new Set(approved.map((c: any) => c.grammar_pattern_slug as string))]
console.log(`\nStep 0: Resolving ${slugsNeeded.length} grammar pattern slugs...`)

const patternIdBySlug: Record<string, string> = {}

if (!dryRun) {
  const { data: patterns, error: pErr } = await supabase
    .schema('indonesian')
    .from('grammar_patterns')
    .select('id, slug')
    .in('slug', slugsNeeded)

  if (pErr) {
    console.error('CRITICAL: Failed to fetch grammar patterns:', pErr.message)
    process.exit(1)
  }

  for (const p of patterns ?? []) {
    patternIdBySlug[p.slug] = p.id
  }

  const missing = slugsNeeded.filter(s => !patternIdBySlug[s])
  if (missing.length > 0) {
    console.error(`CRITICAL: Grammar patterns not found in DB: ${missing.join(', ')}`)
    console.error('Run seed-lesson4-grammar-exercises.ts first to seed grammar_patterns.')
    process.exit(1)
  }
  console.log(`  Resolved: ${Object.keys(patternIdBySlug).length} patterns`)
} else {
  for (const slug of slugsNeeded) {
    patternIdBySlug[slug] = `dry-run-pattern-id-${slug}`
  }
  console.log(`  [DRY RUN] Would resolve: ${slugsNeeded.join(', ')}`)
}

// ---------------------------------------------------------------------------
// Step 1-4: For each approved candidate, upsert item, context, links, variant
// ---------------------------------------------------------------------------

console.log(`\nSteps 1-4: Processing ${approved.length} approved candidates...`)

let inserted = 0
let skippedAlreadyPublished = 0
const publishedSlugs: string[] = []

for (const candidate of approved) {
  const baseText = deriveBaseText(candidate)
  const normalizedText = baseText.toLowerCase().trim()
  const slug = candidate.grammar_pattern_slug
  const exerciseType = candidate.exercise_type
  const patternId = patternIdBySlug[slug]
  const payloadJson = buildPayloadJson(candidate)
  const answerKeyJson = buildAnswerKeyJson(candidate)

  if (dryRun) {
    console.log(`  [DRY RUN] ${exerciseType} / ${slug}`)
    console.log(`    base_text: ${baseText.slice(0, 60)}`)
    inserted++
    continue
  }

  // 1. Upsert learning_item
  const { data: item, error: itemErr } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .upsert(
      {
        item_type: 'sentence',
        base_text: baseText,
        normalized_text: normalizedText,
        language: 'id',
        level: 'A1',
        source_type: 'lesson',
        notes: `Grammar exercise: ${exerciseType} — ${slug}`,
      },
      { onConflict: 'normalized_text,item_type' },
    )
    .select('id')
    .single()

  if (itemErr) {
    console.error(`  ERROR upserting learning_item for "${baseText}":`, itemErr.message)
    process.exit(1)
  }

  // 2. Upsert item_context
  const { data: context, error: ctxErr } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .upsert(
      {
        learning_item_id: item.id,
        context_type: 'exercise_prompt',
        source_text: baseText,
        is_anchor_context: true,
      },
      { onConflict: 'learning_item_id,source_text' },
    )
    .select('id')
    .single()

  if (ctxErr) {
    console.error(`  ERROR upserting item_context for "${baseText}":`, ctxErr.message)
    process.exit(1)
  }

  // 3. Upsert item_context_grammar_patterns link
  const { error: linkErr } = await supabase
    .schema('indonesian')
    .from('item_context_grammar_patterns')
    .upsert(
      {
        context_id: context.id,
        grammar_pattern_id: patternId,
        is_primary: true,
      },
      { onConflict: 'context_id,grammar_pattern_id' },
    )

  if (linkErr) {
    console.error(`  ERROR upserting grammar pattern link for context ${context.id}:`, linkErr.message)
    process.exit(1)
  }

  // 4. Insert exercise_variant (idempotent: skip if exact duplicate exists)
  const { data: existingVariant } = await supabase
    .schema('indonesian')
    .from('exercise_variants')
    .select('id')
    .eq('context_id', context.id)
    .eq('exercise_type', exerciseType)
    .eq('grammar_pattern_id', patternId)
    .limit(1)
    .maybeSingle()

  if (existingVariant) {
    skippedAlreadyPublished++
    continue
  }

  const { error: variantErr } = await supabase
    .schema('indonesian')
    .from('exercise_variants')
    .insert({
      exercise_type: exerciseType,
      learning_item_id: item.id,
      context_id: context.id,
      grammar_pattern_id: patternId,
      payload_json: payloadJson,
      answer_key_json: answerKeyJson,
      is_active: true,
    })

  if (variantErr) {
    console.error(`  ERROR inserting exercise_variant for "${baseText}" (${exerciseType}):`, variantErr.message)
    process.exit(1)
  }

  inserted++
  publishedSlugs.push(`${exerciseType}/${slug}`)
}

// ---------------------------------------------------------------------------
// Step 5: Mark published in staging file
// ---------------------------------------------------------------------------

if (!dryRun && inserted > 0) {
  console.log('\nStep 5: Marking candidates as published in staging file...')
  const updatedCandidates = candidates.map((c: any) =>
    c.review_status === 'approved' ? { ...c, review_status: 'published' } : c
  )

  // Preserve the TypeScript structure — write back with export const candidates
  const fileContent = fs.readFileSync(candidatesPath, 'utf-8')
  const header = fileContent.match(/^([\s\S]*?)export const candidates/)?.[1] ?? ''
  const newContent =
    header +
    'export const candidates = ' +
    JSON.stringify(updatedCandidates, null, 2) +
    '\n'

  fs.writeFileSync(candidatesPath, newContent)
  console.log(`  Marked ${inserted} candidates as published`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n--- Summary ---')
if (dryRun) {
  console.log(`  [DRY RUN] Would insert: ${inserted} exercise_variants`)
  console.log(`  [DRY RUN] Would create: ${inserted} learning_items (sentence) + item_contexts`)
  if (pending.length > 0) console.log(`  WARNING: ${pending.length} skipped (pending_review)`)
} else {
  console.log(`  inserted: ${inserted}`)
  console.log(`  skipped (already published): ${skippedAlreadyPublished}`)
  if (pending.length > 0) console.log(`  WARNING: ${pending.length} skipped (pending_review)`)
}
console.log('\nDone.')
