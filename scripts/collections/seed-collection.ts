#!/usr/bin/env bun
/**
 * seed-collection.ts
 *
 * Seeds (or re-projects) a FREQUENCY collection: sets `learning_items.frequency_rank`
 * from a corpus ranking, creates/updates the `collections` row, and materialises
 * `collection_items` as the projection `frequency_rank <= rank_cutoff`
 * (collections spec §4.3 / §6 / §7). Idempotent: re-running rebuilds the projection.
 *
 * The membership rule + bidirectional invariant live in projection.ts (the §8
 * gate-1 shared helper); this script is the I/O shell around them and re-asserts
 * the §8 gate-2 invariant before it finishes (fails loud on drift).
 *
 * Gap words (corpus words with no learning_item yet) are REPORTED, not created —
 * they must be authored + published through the pipeline first (the "Common Words"
 * vocab unit, spec §6), so they arrive with their full capability suite. A second
 * run after that publish picks them up.
 *
 * Usage:
 *   bun scripts/collections/seed-collection.ts \
 *     --slug top-100 --name "Top 100 woorden" --cutoff 100 \
 *     --ranks /tmp/pbwl-top100.json [--dry-run]
 *
 *   --ranks JSON shape: [{ "rank": 1, "root": "saya", ... }, ...]
 *
 * Requires SUPABASE_SERVICE_KEY (+ VITE_SUPABASE_URL) in .env.local. Live-DB
 * write — uses the Supabase JS client (the TLS-internal homelab cert convention).
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  partitionByExistence,
  projectionViolations,
  type RankedItem,
  type RankedWord,
} from './projection'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function loadEnv() {
  if (!existsSync('.env.local')) return
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const DRY_RUN = process.argv.includes('--dry-run')
const slug = arg('slug')
const name = arg('name')
const cutoff = Number(arg('cutoff'))
const ranksPath = arg('ranks')

if (!slug || !name || !Number.isInteger(cutoff) || !ranksPath) {
  console.error('Usage: seed-collection.ts --slug <s> --name <n> --cutoff <int> --ranks <path> [--dry-run]')
  process.exit(1)
}

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')
const supabase = createClient(URL, KEY)
const db = supabase.schema('indonesian')

interface RanksFileRow { rank: number; root: string }
const rankedWords: RankedWord[] = (JSON.parse(readFileSync(ranksPath, 'utf-8')) as RanksFileRow[])
  .map(r => ({ word: r.root, rank: r.rank }))

// ── 1. Load existing items, classify resolve-or-create ───────────────────────
const { data: itemRows, error: itemErr } = await db
  .from('learning_items')
  .select('id, normalized_text, frequency_rank')
if (itemErr) throw itemErr
const items = (itemRows ?? []) as Array<{ id: string; normalized_text: string; frequency_rank: number | null }>
const existing = new Set(items.map(i => i.normalized_text))
const idByNorm = new Map(items.map(i => [i.normalized_text, i.id]))

const { resolved, gaps } = partitionByExistence(rankedWords, existing)
console.log(`\nCorpus words: ${rankedWords.length}  |  resolved: ${resolved.length}  |  gaps: ${gaps.length}`)
if (gaps.length) {
  console.log('\nGAP WORDS (author + publish via the Common Words unit before they can be members):')
  for (const g of gaps) console.log(`  rank ${String(g.rank).padStart(4)}  ${g.word}`)
}

if (DRY_RUN) {
  console.log('\n--dry-run: no writes. Resolved words would receive frequency_rank; collection_items would be the rank<=cutoff projection.')
  process.exit(0)
}

// ── 2. Set frequency_rank on resolved items ──────────────────────────────────
let ranked = 0
for (const r of resolved) {
  const id = idByNorm.get(r.normalizedText)
  if (!id) continue
  const { error } = await db.from('learning_items').update({ frequency_rank: r.rank }).eq('id', id)
  if (error) throw error
  ranked++
}
console.log(`\nSet frequency_rank on ${ranked} items.`)

// ── 3. Upsert the collection row ─────────────────────────────────────────────
const { data: coll, error: collErr } = await db
  .from('collections')
  .upsert({ slug, name, kind: 'frequency', rank_cutoff: cutoff }, { onConflict: 'slug' })
  .select('id')
  .single()
if (collErr) throw collErr
const collectionId = (coll as { id: string }).id

// ── 4. Materialise collection_items = projection(frequency_rank <= cutoff) ────
const { data: memberRows, error: memberErr } = await db
  .from('learning_items')
  .select('id')
  .not('frequency_rank', 'is', null)
  .lte('frequency_rank', cutoff)
if (memberErr) throw memberErr
const memberIds = (memberRows ?? []).map(r => (r as { id: string }).id)

// Rebuild (truncate-and-rebuild is fine at build-stage; the projection is derived).
const { error: delErr } = await db.from('collection_items').delete().eq('collection_id', collectionId)
if (delErr) throw delErr
if (memberIds.length) {
  const { error: insErr } = await db
    .from('collection_items')
    .insert(memberIds.map(id => ({ collection_id: collectionId, learning_item_id: id })))
  if (insErr) throw insErr
}
console.log(`Materialised ${memberIds.length} collection_items for "${slug}".`)

// ── 5. Re-assert the §8 gate-2 bidirectional invariant ───────────────────────
const { data: allAfter, error: allErr } = await db.from('learning_items').select('id, frequency_rank')
if (allErr) throw allErr
const snapshot: RankedItem[] = (allAfter ?? []).map(r => {
  const row = r as { id: string; frequency_rank: number | null }
  return { id: row.id, frequencyRank: row.frequency_rank }
})
const violations = projectionViolations(snapshot, new Set(memberIds), cutoff)
if (violations.length) {
  console.error(`\n❌ Projection invariant FAILED (${violations.length} violations):`)
  for (const v of violations.slice(0, 20)) console.error(`  ${v.kind}  ${v.itemId}  rank=${v.frequencyRank}`)
  process.exit(1)
}
console.log(`\n✅ Projection invariant holds (both directions). "${slug}" seeded: ${memberIds.length} words, ${gaps.length} gaps pending.`)
