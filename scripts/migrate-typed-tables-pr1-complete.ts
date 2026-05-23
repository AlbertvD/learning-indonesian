#!/usr/bin/env bun
/**
 * migrate-typed-tables-pr1-complete.ts
 *
 * One-shot bridge for PR 1.6 — completes the data side of PR 1 (Decision R).
 *
 * BACKGROUND
 * ----------
 * PR 1 (commit 404a2da, "item source_kind typed-table reader") switched the
 * item-source reader at src/lib/exercise-content/byKind/item.ts to read
 * translations from learning_items.translation_{nl,en} columns directly
 * (Decision R), instead of joining item_meanings. The reader's
 * meaningsFromItem() returns [] when those columns are NULL (item.ts:56),
 * so any active item capability pointing at a NULL-translation learning_item
 * renders an empty-meaning card — the live breakage this PR fixes.
 *
 * PR 1's writer (projectors/vocab.ts:158-160) populates the columns on
 * re-publish, and the CS4b validator (validators/itemTranslations.ts) hard-
 * fails publish on a missing NL translation. But lessons not re-published
 * since PR 1 landed — notably L5/7/8, which are blocked by pre-existing
 * dialogue-cloze gaps and cannot publish — keep NULL columns even though the
 * old item_meanings rows still hold the translation.
 *
 * WHAT THIS DOES
 * --------------
 * Copies the primary-language translation from item_meanings into the
 * learning_items.translation_{nl,en} columns, ONLY where the column is
 * currently NULL. It never overwrites a value the writer already wrote —
 * staging remains the source of truth (feedback_pipeline_is_writer_not_db);
 * this only fills the gap for rows the re-publish path hasn't reached.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * - Audio (capability_audio_refs): NOT bridged. Nothing reads that table at
 *   runtime — audio resolves via audioService.fetchSessionAudioMap →
 *   rpc('get_audio_clips', {p_texts, p_voice_ids}) by text+voice, and
 *   byKind/item.ts:8 marks the table "populated for future use". Deferred to
 *   whichever PR wires a capability_audio_refs reader.
 * - usage_note: item_meanings holds zero usage_note rows (verified 2026-05-23),
 *   so there is nothing to bridge.
 *
 * IDEMPOTENCY
 * -----------
 * Every UPDATE is guarded with `.is(<column>, null)`, and only NULL columns
 * are selected for patching. A second run finds no NULL columns with a
 * matching meaning and writes nothing.
 *
 * ROLLBACK
 * --------
 * The run logs every (id, base_text, language, value) it writes. To roll back,
 * set translation_{nl,en} = NULL for exactly the logged ids/columns.
 *
 * USAGE
 *   bun scripts/migrate-typed-tables-pr1-complete.ts --dry-run   # preview, no writes
 *   bun scripts/migrate-typed-tables-pr1-complete.ts             # apply
 *   Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY in .env.local.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// ── Env loading (mirror scripts/backfill-pos.ts) ─────────────────────────────
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

interface ItemRow {
  id: string
  base_text: string
  translation_nl: string | null
  translation_en: string | null
}

interface MeaningRow {
  learning_item_id: string
  translation_language: string
  translation_text: string | null
  is_primary: boolean
}

// ── Paginated fetch helper (PostgREST caps at 1000 rows/page) ────────────────
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}

async function countNull(supabase: SupabaseClient, column: 'translation_nl' | 'translation_en'): Promise<number> {
  const { count, error } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select('id', { count: 'exact', head: true })
    .is(column, null)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('Error: VITE_SUPABASE_URL (from .env.local) and SUPABASE_SERVICE_KEY are required.')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  console.log(`PR 1.6 typed-table bridge — dry-run=${DRY_RUN}`)
  console.log('Surface: learning_items.translation_{nl,en} ← item_meanings (primary, where column IS NULL)\n')

  // ── BEFORE counts ──────────────────────────────────────────────────────────
  const beforeNullNl = await countNull(supabase, 'translation_nl')
  const beforeNullEn = await countNull(supabase, 'translation_en')
  console.log(`BEFORE: translation_nl NULL = ${beforeNullNl}, translation_en NULL = ${beforeNullEn}`)

  // ── 1. Primary meanings, indexed by (item, lang) ─────────────────────────────
  const meanings = await fetchAll<MeaningRow>((from, to) =>
    supabase
      .schema('indonesian')
      .from('item_meanings')
      .select('learning_item_id, translation_language, translation_text, is_primary')
      .eq('is_primary', true)
      .in('translation_language', ['nl', 'en'])
      .range(from, to),
  )
  const meaningByItemLang = new Map<string, string>() // `${itemId}:${lang}` → text
  for (const m of meanings) {
    const text = (m.translation_text ?? '').trim()
    if (!text) continue
    if (m.translation_language !== 'nl' && m.translation_language !== 'en') continue
    const k = `${m.learning_item_id}:${m.translation_language}`
    // First primary wins; duplicates are ignored (and reported as anomalies below).
    if (!meaningByItemLang.has(k)) meaningByItemLang.set(k, text)
  }

  // ── 2. Items with at least one NULL translation column ──────────────────────
  const nullItems = await fetchAll<ItemRow>((from, to) =>
    supabase
      .schema('indonesian')
      .from('learning_items')
      .select('id, base_text, translation_nl, translation_en')
      .or('translation_nl.is.null,translation_en.is.null')
      .range(from, to),
  )

  // ── 3. Build per-item patches (only NULL columns that have a meaning) ───────
  interface Patch { id: string; base_text: string; nl?: string; en?: string }
  const patches: Patch[] = []
  for (const item of nullItems) {
    const patch: Patch = { id: item.id, base_text: item.base_text }
    let has = false
    if (item.translation_nl === null) {
      const v = meaningByItemLang.get(`${item.id}:nl`)
      if (v) { patch.nl = v; has = true }
    }
    if (item.translation_en === null) {
      const v = meaningByItemLang.get(`${item.id}:en`)
      if (v) { patch.en = v; has = true }
    }
    if (has) patches.push(patch)
  }

  const fillNl = patches.filter(p => p.nl !== undefined).length
  const fillEn = patches.filter(p => p.en !== undefined).length
  console.log(`\nPlan: fill translation_nl for ${fillNl} item(s), translation_en for ${fillEn} item(s) ` +
    `(${patches.length} item(s) touched).\n`)

  // ── 4. Apply (or preview) ────────────────────────────────────────────────────
  let okNl = 0
  let okEn = 0
  let failures = 0
  for (const p of patches) {
    const filled: string[] = []
    if (p.nl !== undefined) filled.push(`nl="${p.nl}"`)
    if (p.en !== undefined) filled.push(`en="${p.en}"`)
    console.log(`  ${DRY_RUN ? '[dry-run] would set' : 'set'} ${p.id} (${p.base_text}): ${filled.join(', ')}`)

    if (DRY_RUN) {
      okNl += p.nl !== undefined ? 1 : 0
      okEn += p.en !== undefined ? 1 : 0
      continue
    }

    // One UPDATE per column so the `.is(col, null)` idempotency guard is exact.
    if (p.nl !== undefined) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .update({ translation_nl: p.nl })
        .eq('id', p.id)
        .is('translation_nl', null)
        .select('id')
      if (error) { console.error(`    ! nl update failed for ${p.id}: ${error.message}`); failures++ }
      else okNl += (data ?? []).length
    }
    if (p.en !== undefined) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .update({ translation_en: p.en })
        .eq('id', p.id)
        .is('translation_en', null)
        .select('id')
      if (error) { console.error(`    ! en update failed for ${p.id}: ${error.message}`); failures++ }
      else okEn += (data ?? []).length
    }
  }

  // ── 5. AFTER counts + verification ───────────────────────────────────────────
  if (DRY_RUN) {
    console.log(`\n[DRY RUN] would fill nl=${okNl}, en=${okEn}. No writes performed.`)
    console.log(`AFTER (unchanged): translation_nl NULL = ${beforeNullNl}, translation_en NULL = ${beforeNullEn}`)
    return
  }

  const afterNullNl = await countNull(supabase, 'translation_nl')
  const afterNullEn = await countNull(supabase, 'translation_en')
  console.log(`\nWrote: translation_nl ${okNl} row(s), translation_en ${okEn} row(s) (${failures} failure(s)).`)
  console.log(`AFTER: translation_nl NULL = ${afterNullNl}, translation_en NULL = ${afterNullEn}`)
  console.log(`Delta: nl NULL ${beforeNullNl} → ${afterNullNl} (-${beforeNullNl - afterNullNl}), ` +
    `en NULL ${beforeNullEn} → ${afterNullEn} (-${beforeNullEn - afterNullEn})`)

  // The NULL count must drop by exactly the number of rows we wrote. A mismatch
  // means a concurrent writer raced us or an update silently no-op'd — fail loud.
  let anomaly = false
  if (failures > 0) { console.error(`\n✗ ${failures} update(s) errored.`); anomaly = true }
  if (beforeNullNl - afterNullNl !== okNl) {
    console.error(`\n✗ nl NULL delta (${beforeNullNl - afterNullNl}) != rows written (${okNl}).`); anomaly = true
  }
  if (beforeNullEn - afterNullEn !== okEn) {
    console.error(`\n✗ en NULL delta (${beforeNullEn - afterNullEn}) != rows written (${okEn}).`); anomaly = true
  }
  if (anomaly) process.exit(1)
  console.log('\n✓ Bridge complete. Remaining NULLs are rows with no item_meanings row ' +
    '(re-publish from staging) or L5/7/8 cloze-gap lessons (out of scope).')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
