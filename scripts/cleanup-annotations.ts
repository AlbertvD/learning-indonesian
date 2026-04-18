#!/usr/bin/env bun
/**
 * cleanup-annotations.ts
 *
 * Strips coursebook annotations from base_text on word/phrase items:
 *   - trailing asterisk markers: "membayar*" → "membayar"
 *   - trailing pronunciation parentheticals: "tv (tivi)" → "tv"
 *
 * Also deletes the orphaned audio_clips rows (they're keyed by the old
 * normalized_text which included the annotation). After running this, re-run
 * generate-exercise-audio.ts for the affected lessons to regenerate audio.
 *
 * Usage:
 *   bun scripts/cleanup-annotations.ts [--dry-run]
 *
 * Word/phrase scope only — leaves legitimate grammar-exercise sentence/dialogue
 * items alone (parentheticals there are intentional instructional scaffolding).
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function loadEnv() {
  const envPath = '.env.local'
  if (!fs.existsSync(envPath)) return
  const env = fs.readFileSync(envPath, 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const DRY_RUN = process.argv.includes('--dry-run')

function cleanBaseText(s: string): string {
  // Strip trailing "* " and trailing "(...)" (pronunciation/abbreviation hints).
  // Both only apply at the end of the string — parentheticals mid-text are rare
  // in word/phrase items and legit in the few cases they exist.
  return s
    .replace(/\s*\*\s*$/, '')
    .replace(/\s*\([^)]+\)\s*$/, '')
    .trim()
}

function normalizeForDb(s: string): string {
  // Matches publish-approved-content.ts: s.toLowerCase().trim()
  return s.toLowerCase().trim()
}

function normalizeTts(s: string): string {
  // Matches src/lib/ttsNormalize.ts — used by audio_clips.normalized_text
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

async function main() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const { data: items, error } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select('id, base_text, item_type')
    .in('item_type', ['word', 'phrase'])
  if (error || !items) { console.error(error); process.exit(1) }

  const needsCleanup = items.filter(i => /\*\s*$|\([^)]+\)\s*$/.test(i.base_text))
  console.log(`Found ${needsCleanup.length} word/phrase items with annotations\n`)

  if (needsCleanup.length === 0) return

  const updates: Array<{ id: string; oldBase: string; newBase: string; oldTtsKey: string }> = []
  for (const item of needsCleanup) {
    const newBase = cleanBaseText(item.base_text)
    if (newBase === item.base_text) continue
    if (!newBase) {
      console.warn(`  SKIP (would empty): "${item.base_text}"`)
      continue
    }
    updates.push({
      id: item.id,
      oldBase: item.base_text,
      newBase,
      oldTtsKey: normalizeTts(item.base_text),
    })
  }

  console.log('Proposed changes:')
  for (const u of updates) console.log(`  "${u.oldBase}"  →  "${u.newBase}"`)

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would update ${updates.length} items and delete ${updates.length} audio_clips entries.`)
    return
  }

  // Apply updates
  let updated = 0
  let clipsDeleted = 0
  for (const u of updates) {
    // Update the item
    const { error: uErr } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .update({
        base_text: u.newBase,
        normalized_text: normalizeForDb(u.newBase),
      })
      .eq('id', u.id)
    if (uErr) {
      console.error(`  update failed for ${u.id}: ${uErr.message}`)
      continue
    }
    updated++

    // Delete orphaned audio clip (keyed by the old TTS-normalized text)
    const { error: dErr, count } = await supabase
      .schema('indonesian')
      .from('audio_clips')
      .delete({ count: 'exact' })
      .eq('normalized_text', u.oldTtsKey)
    if (!dErr && count) clipsDeleted += count
  }

  console.log(`\nUpdated ${updated} items; deleted ${clipsDeleted} orphaned audio clips.`)

  // Report affected lessons so the operator can regenerate audio
  const { data: ctxs } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .select('learning_item_id, source_lesson_id')
    .in('learning_item_id', updates.map(u => u.id))
  const { data: lessons } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index, title')
  const lessonById = new Map((lessons ?? []).map(l => [l.id, l]))
  const affectedLessons = new Set<string>()
  for (const c of ctxs ?? []) if (c.source_lesson_id) affectedLessons.add(c.source_lesson_id)

  console.log('\nRe-generate audio for these lessons:')
  for (const lid of affectedLessons) {
    const l = lessonById.get(lid)
    if (l) console.log(`  bun scripts/generate-exercise-audio.ts ${l.order_index}   # ${l.title}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
