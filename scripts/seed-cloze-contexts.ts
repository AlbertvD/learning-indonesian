#!/usr/bin/env bun
/**
 * seed-cloze-contexts.ts
 *
 * Seeds cloze-contexts.ts staging files into indonesian.item_contexts rows.
 * For each entry, resolves the learning_item by normalized_text and inserts
 * an item_context with context_type = 'cloze'. Safe to re-run (upserts).
 *
 * Usage:
 *   bun scripts/seed-cloze-contexts.ts <lesson-number>
 *   Requires SUPABASE_SERVICE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import path from 'path'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable not set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

async function seedClozeContexts(lessonNumber: number) {
  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)
  const contextFile = path.join(stagingDir, 'cloze-contexts.ts')

  console.log(`\nSeeding cloze contexts for lesson ${lessonNumber}...`)
  console.log(`Loading from: ${contextFile}`)

  const mod = await import(contextFile)
  const clozeContexts: Array<{
    learning_item_slug: string
    source_text: string
    translation_text: string
    difficulty: string | null
    topic_tag: string | null
  }> = mod.clozeContexts

  if (!clozeContexts || clozeContexts.length === 0) {
    console.error('No cloze contexts found in file')
    process.exit(1)
  }

  console.log(`Found ${clozeContexts.length} cloze contexts`)

  // Fetch lesson ID
  const { data: lessons, error: lessonsError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index')

  if (lessonsError) {
    console.error('Failed to fetch lessons:', lessonsError.message, lessonsError)
    process.exit(1)
  }

  console.log(`Lessons in DB: ${lessons?.map(l => `${l.order_index}:${l.id.slice(0,8)}`).join(', ')}`)
  const lesson = lessons?.find(l => Number(l.order_index) === lessonNumber)
  if (!lesson) {
    console.error(`Lesson ${lessonNumber} not found in DB`)
    process.exit(1)
  }
  const lessonId = lesson.id
  console.log(`Lesson ID: ${lessonId}`)

  // Fetch all learning items (normalized_text → id)
  const { data: items, error: itemsError } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select('id, normalized_text, base_text')

  if (itemsError || !items) {
    console.error('Failed to fetch learning items:', itemsError?.message)
    process.exit(1)
  }

  const itemByNormalized = new Map(items.map(i => [i.normalized_text, i]))
  const itemByBase = new Map(items.map(i => [i.base_text.toLowerCase().trim(), i]))

  let inserted = 0
  let notFound = 0

  for (const ctx of clozeContexts) {
    const slug = ctx.learning_item_slug.toLowerCase().trim()
    const item = itemByNormalized.get(slug) || itemByBase.get(slug)

    if (!item) {
      console.warn(`  ⚠️  No learning item found for slug: "${ctx.learning_item_slug}"`)
      notFound++
      continue
    }

    const { error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .upsert({
        learning_item_id: item.id,
        context_type: 'cloze',
        source_text: ctx.source_text,
        translation_text: ctx.translation_text,
        difficulty: ctx.difficulty,
        topic_tag: ctx.topic_tag,
        is_anchor_context: false,
        source_lesson_id: lessonId,
        source_section_id: null,
      }, { onConflict: 'learning_item_id,source_text' })

    if (error) {
      console.error(`  ❌ Failed for "${ctx.learning_item_slug}":`, error.message)
    } else {
      inserted++
    }
  }

  console.log(`\n✓ Done: ${inserted} upserted, ${notFound} slugs not found`)
  if (notFound > 0) {
    console.log('  Check that normalized_text matches learning_item_slug exactly.')
  }
}

const lessonNumber = parseInt(process.argv[2], 10)
if (isNaN(lessonNumber)) {
  console.error('Usage: bun scripts/seed-cloze-contexts.ts <lesson-number>')
  process.exit(1)
}

seedClozeContexts(lessonNumber)
