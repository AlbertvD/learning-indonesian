#!/usr/bin/env bun
/**
 * seed-theme.ts
 *
 * Seeds THEME collections (kind='theme') — the authored-membership counterpart of
 * seed-collection.ts (which projects frequency bands). A theme's members are an
 * explicit word list, not a `frequency_rank <= cutoff` projection, so the
 * collection carries NO rank_cutoff (DB CHECK: theme ⇒ rank_cutoff IS NULL).
 *
 * Membership is resolve-or-create on `normalized_text` (the itemSlug contract):
 * every theme word must already exist as a learning_item (publish the gap words
 * through the pipeline first — the Common Words unit, spec §6/§7). Words that do
 * NOT resolve are REPORTED and the theme is skipped, never partially seeded.
 *
 * Input: a JSON file [{ "slug": "...", "name": "...", "words": ["root", ...] }].
 * Usage:
 *   bun scripts/collections/seed-theme.ts --themes /tmp/themes-seed.json [--dry-run]
 *
 * Requires SUPABASE_SERVICE_KEY (+ VITE_SUPABASE_URL) in .env.local.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { itemSlug } from '../../src/lib/capabilities/itemSlug'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined }
const DRY_RUN = process.argv.includes('--dry-run')
const themesPath = arg('themes')
if (!themesPath) { console.error('Usage: seed-theme.ts --themes <path.json> [--dry-run]'); process.exit(1) }

const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')
const db = createClient(URL, KEY).schema('indonesian')

interface ThemeInput { slug: string; name: string; words: string[] }
const themes = JSON.parse(readFileSync(themesPath, 'utf-8')) as ThemeInput[]

// Resolve the whole library once: normalized_text → learning_item id.
const { data: itemRows, error: itemErr } = await db.from('learning_items').select('id, normalized_text')
if (itemErr) throw itemErr
const idByNorm = new Map((itemRows ?? []).map((r) => {
  const row = r as { id: string; normalized_text: string }
  return [row.normalized_text, row.id]
}))

let failed = 0
for (const theme of themes) {
  const resolved: string[] = []
  const gaps: string[] = []
  for (const word of theme.words) {
    const id = idByNorm.get(itemSlug(word))
    if (id) resolved.push(id); else gaps.push(word)
  }
  console.log(`\n### ${theme.slug} — ${resolved.length}/${theme.words.length} resolved, ${gaps.length} gaps`)
  if (gaps.length) console.log(`  GAPS (author + publish first): ${gaps.join(', ')}`)
  if (gaps.length) { failed++; continue }  // never partial-seed a theme
  if (DRY_RUN) continue

  const { data: coll, error: cErr } = await db
    .from('collections')
    .upsert({ slug: theme.slug, name: theme.name, kind: 'theme', rank_cutoff: null }, { onConflict: 'slug' })
    .select('id').single()
  if (cErr) throw cErr
  const collectionId = (coll as { id: string }).id

  // Rebuild membership (authored projection is idempotent: delete + insert).
  const { error: dErr } = await db.from('collection_items').delete().eq('collection_id', collectionId)
  if (dErr) throw dErr
  const { error: iErr } = await db.from('collection_items')
    .insert(resolved.map((id) => ({ collection_id: collectionId, learning_item_id: id })))
  if (iErr) throw iErr
  console.log(`  ✓ seeded "${theme.slug}": ${resolved.length} members`)
}

if (failed > 0) {
  console.error(`\n❌ ${failed} theme(s) had unresolved words — publish them first, then re-run.`)
  process.exit(1)
}
console.log(`\n✅ ${DRY_RUN ? '[dry-run] ' : ''}All ${themes.length} themes ${DRY_RUN ? 'resolve cleanly' : 'seeded'}.`)
