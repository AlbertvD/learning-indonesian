#!/usr/bin/env bun
/**
 * repair-item-meanings.ts
 *
 * Repairs missing item_meanings for all lessons by reading translation_nl from
 * staging learning-items.ts files and inserting the missing DB rows.
 *
 * Safe to re-run: deletes then re-inserts meanings for every item found in staging.
 *
 * Usage:
 *   bun scripts/repair-item-meanings.ts              # all lessons
 *   bun scripts/repair-item-meanings.ts 4            # single lesson
 *   bun scripts/repair-item-meanings.ts --dry-run    # preview only
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function createSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY not set in .env.local')
    process.exit(1)
  }
  return createClient(url, serviceKey)
}

async function repairLesson(supabase: ReturnType<typeof createSupabaseClient>, lessonNumber: number, dryRun: boolean) {
  const itemsPath = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`, 'learning-items.ts')
  if (!fs.existsSync(itemsPath)) {
    console.log(`  Lesson ${lessonNumber}: no learning-items.ts, skipping`)
    return
  }

  const module = await import(`file://${itemsPath}`)
  const items: any[] = Object.values(module)[0] as any[]
  if (!items?.length) {
    console.log(`  Lesson ${lessonNumber}: empty learning items, skipping`)
    return
  }

  let repaired = 0
  let skipped = 0
  let errors = 0

  for (const item of items) {
    if (!item.translation_nl) { skipped++; continue }

    const normalizedText = item.base_text.toLowerCase().trim()

    // Look up ALL learning items with this normalized_text (item_type may differ between
    // staging and DB for numbers/phrases — match loosely and patch all variants)
    const { data: lis, error: lookupError } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('id')
      .eq('normalized_text', normalizedText)

    if (lookupError || !lis?.length) {
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would repair meanings for: ${item.base_text} (${lis.length} DB entries)`)
      repaired++
      continue
    }

    for (const li of lis) {
      // Delete existing meanings and re-insert with proper translation_language
      await supabase.schema('indonesian').from('item_meanings').delete().eq('learning_item_id', li.id)

      const meaningInserts = [
        { learning_item_id: li.id, translation_language: 'nl', translation_text: item.translation_nl, is_primary: true },
        ...(item.translation_en ? [{ learning_item_id: li.id, translation_language: 'en', translation_text: item.translation_en, is_primary: true }] : []),
      ]

      const { error: insertError } = await supabase
        .schema('indonesian')
        .from('item_meanings')
        .insert(meaningInserts)

      if (insertError) {
        console.warn(`  ⚠️ Failed to insert meanings for ${item.base_text}: ${insertError.message}`)
        errors++
      } else {
        repaired++
      }
    }
  }

  console.log(`  Lesson ${lessonNumber}: ${repaired} repaired, ${skipped} skipped (no translation), ${errors} errors`)
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--dry-run')
  const dryRun = process.argv.includes('--dry-run')
  const supabase = createSupabaseClient()

  const stagingBase = path.join(process.cwd(), 'scripts', 'data', 'staging')
  const allLessons = fs.readdirSync(stagingBase)
    .filter(d => /^lesson-\d+$/.test(d))
    .map(d => parseInt(d.replace('lesson-', ''), 10))
    .sort((a, b) => a - b)

  const lessonsToRepair = args.length > 0
    ? args.map(a => parseInt(a, 10)).filter(n => !isNaN(n))
    : allLessons

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Repairing item_meanings for lessons: ${lessonsToRepair.join(', ')}\n`)

  for (const n of lessonsToRepair) {
    await repairLesson(supabase, n, dryRun)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
