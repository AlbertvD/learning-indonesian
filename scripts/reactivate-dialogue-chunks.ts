#!/usr/bin/env bun
/**
 * reactivate-dialogue-chunks.ts
 *
 * Reactivates (is_active = true) dialogue_chunk learning_items for a given
 * lesson, scoped defensively to that lesson via item_contexts.source_lesson_id.
 *
 * Used at the end of a publish run when dialogue chunks land for the first time
 * with their translations + cloze contexts — the 2026-04-24 incident left a
 * pile of dialogue_chunks with is_active=false in the DB, and publishing
 * translations alone doesn't toggle is_active back on (upsert doesn't set it).
 *
 * Idempotent: re-runs on an already-reactivated lesson are no-ops.
 *
 * Usage:
 *   bun scripts/reactivate-dialogue-chunks.ts 9               # reactivate lesson 9
 *   bun scripts/reactivate-dialogue-chunks.ts 9 --dry-run     # preview
 *
 * Exit codes:
 *   0 — success (including no-op)
 *   1 — error (missing env, DB failure, lesson not found)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Homelab's internal Step-CA cert isn't trusted by default.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function createSupabaseClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY not set in .env.local')
    process.exit(1)
  }
  return createClient(url, serviceKey, {
    db: { schema: 'indonesian' },
    auth: { persistSession: false },
  })
}

async function loadStagingDialogueChunks(lessonNumber: number): Promise<Array<{ base_text: string }>> {
  const itemsPath = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`, 'learning-items.ts')
  if (!fs.existsSync(itemsPath)) {
    console.error(`  lesson-${lessonNumber}/learning-items.ts not found at ${itemsPath}`)
    return []
  }
  // Cache-bust the module loader so repeat runs pick up edits.
  const m = await import(`file://${itemsPath}?t=${Date.now()}`)
  const arr = Object.values(m)[0] as any[]
  if (!Array.isArray(arr)) return []
  // Only items that would be published end up reactivated — skip deferred ones.
  return arr
    .filter((it: any) => it?.item_type === 'dialogue_chunk' && it?.review_status === 'published')
    .map((it: any) => ({ base_text: String(it.base_text ?? '') }))
    .filter(it => it.base_text.trim().length > 0)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const lessonNumberArg = args.find(a => /^\d+$/.test(a))
  if (!lessonNumberArg) {
    console.error('Usage: bun scripts/reactivate-dialogue-chunks.ts <lesson-number> [--dry-run]')
    process.exit(1)
  }
  const lessonNumber = parseInt(lessonNumberArg, 10)

  const supabase = createSupabaseClient()

  // 1. Locate the lesson row in DB by order_index.
  const { data: lessonRow, error: lessonErr } = await supabase
    .from('lessons')
    .select('id, title')
    .eq('order_index', lessonNumber)
    .maybeSingle()
  if (lessonErr) {
    console.error('lesson lookup failed:', lessonErr.message)
    process.exit(1)
  }
  if (!lessonRow) {
    console.error(`lesson with order_index=${lessonNumber} not found in DB`)
    process.exit(1)
  }
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Reactivating dialogue_chunks for lesson ${lessonNumber} (${lessonRow.title})`)

  // 2. Staging: which dialogue_chunks are "published" and therefore candidates for reactivation?
  const stagingChunks = await loadStagingDialogueChunks(lessonNumber)
  if (stagingChunks.length === 0) {
    console.log('  No published dialogue_chunks in staging — nothing to reactivate.')
    return
  }

  // 3. Build normalized_text → base_text map for the staging set. DB's
  //    normalized_text is base_text.toLowerCase().trim() per publish-approved-content.ts:293.
  const normalizedToBaseText = new Map<string, string>()
  for (const c of stagingChunks) {
    normalizedToBaseText.set(c.base_text.toLowerCase().trim(), c.base_text)
  }

  // 4. Pull DB dialogue_chunks scoped to THIS lesson (via item_contexts.source_lesson_id)
  //    and item_type='dialogue_chunk'. The source_lesson_id join is the defensive
  //    scoping — without it, a normalized_text collision across lessons could reactivate
  //    unintended rows.
  const { data: contextRows, error: ctxErr } = await supabase
    .from('item_contexts')
    .select('learning_item_id')
    .eq('source_lesson_id', lessonRow.id)
  if (ctxErr) {
    console.error('item_contexts lookup failed:', ctxErr.message)
    process.exit(1)
  }
  const lessonItemIds = [...new Set((contextRows ?? []).map((r: any) => r.learning_item_id))]
  if (lessonItemIds.length === 0) {
    console.log('  No item_contexts linked to this lesson — nothing to reactivate.')
    return
  }

  // Chunked .in() to stay under Kong's URL length limit.
  const CHUNK = 50
  const dbItems: Array<{ id: string, base_text: string, normalized_text: string, is_active: boolean, item_type: string }> = []
  for (let i = 0; i < lessonItemIds.length; i += CHUNK) {
    const slice = lessonItemIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('learning_items')
      .select('id, base_text, normalized_text, is_active, item_type')
      .in('id', slice)
      .eq('item_type', 'dialogue_chunk')
    if (error) {
      console.error('learning_items lookup failed:', error.message)
      process.exit(1)
    }
    dbItems.push(...((data ?? []) as typeof dbItems))
  }

  // 5. Intersect staging set with DB set. Only reactivate items whose normalized_text
  //    matches a staging entry — this gates against old/stale rows for lines that
  //    have since been skipped (review_status='deferred_dialogue' in staging).
  const toReactivate = dbItems.filter(it => {
    if (it.is_active) return false   // already active — skip
    return normalizedToBaseText.has(it.normalized_text)
  })

  console.log(`  Staging: ${stagingChunks.length} published dialogue_chunks.`)
  console.log(`  DB (this lesson, dialogue_chunks): ${dbItems.length} rows — active ${dbItems.filter(i => i.is_active).length}, inactive ${dbItems.filter(i => !i.is_active).length}.`)
  console.log(`  To reactivate: ${toReactivate.length} row(s).`)

  if (toReactivate.length === 0) {
    console.log('  Nothing to do — all reviewable dialogue_chunks already active.')
    return
  }

  if (dryRun) {
    console.log('  [DRY RUN] Would reactivate:')
    for (const it of toReactivate) {
      const preview = it.base_text.length > 70 ? `${it.base_text.slice(0, 70)}…` : it.base_text
      console.log(`    - ${preview}`)
    }
    return
  }

  // 6. Apply in one UPDATE.
  const ids = toReactivate.map(it => it.id)
  const { error: updErr } = await supabase
    .from('learning_items')
    .update({ is_active: true })
    .in('id', ids)
  if (updErr) {
    console.error('reactivation UPDATE failed:', updErr.message)
    process.exit(1)
  }
  console.log(`  ✓ Reactivated ${ids.length} dialogue_chunk row(s).`)

  // 7. Sanity-check: all targets now report is_active=true.
  const { data: postCheck, error: postErr } = await supabase
    .from('learning_items')
    .select('id, is_active')
    .in('id', ids)
  if (postErr) {
    console.error('post-update verification failed:', postErr.message)
    process.exit(1)
  }
  const stillInactive = (postCheck ?? []).filter((r: any) => !r.is_active)
  if (stillInactive.length > 0) {
    console.error(`  ✗ ${stillInactive.length} row(s) still is_active=false after UPDATE — investigate.`)
    process.exit(1)
  }
  console.log(`  ✓ Verified: all ${ids.length} row(s) now is_active=true.`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
