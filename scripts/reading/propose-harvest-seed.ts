#!/usr/bin/env bun
/**
 * propose-harvest-seed.ts — propose the pre-seed word list for the reader harvest
 * (Phase 2 §5), using kaikki/Wiktextract as the authoritative gloss + name filter +
 * root oracle. No hand-guessed meanings: every proposed seed carries kaikki's own
 * English gloss; a token kaikki doesn't know is treated as a name/artifact and dropped.
 *
 * For each corpus content token not already covered/folded:
 *   1. decompose(token, isRoot = kaikki-or-item) — if it reduces to a real root R:
 *        R already an item → FOLD (skip);  else → seed R (the primitive, kaikki gloss).
 *   2. else if kaikki knows the surface token → seed it (a base primitive, kaikki gloss).
 *   3. else → DROP (no dictionary entry: a name / artifact / unanalysable inflection).
 *
 * Output: a draft JSON of { indonesian, pos, english } seed rows (deduped) + the drop
 * list, for the author to add Dutch and publish via lesson-999. Read-only on the DB.
 *
 * Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/reading/propose-harvest-seed.ts --out /tmp/harvest-seed.json
 * Requires content/kaikki/id-en.jsonl (the Indonesian extract) + .env.local.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { toReadableText, contentTokens } from '../../src/lib/reading/readableText'
import { isFunctionWord } from '../../src/lib/reading/functionWords'
import { decompose } from '../../src/lib/capabilities/affixDecomposition'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
function loadEnv() {
  if (!existsSync('.env.local')) return
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

// ── kaikki Indonesian dictionary → word → { pos, gloss } ─────────────────────
const KAIKKI = 'content/kaikki/id-en.jsonl'
if (!existsSync(KAIKKI)) throw new Error(`${KAIKKI} missing — download the Indonesian extract first`)
interface KaikkiEntry { pos: string; gloss: string }
const dict = new Map<string, KaikkiEntry>()
for (const line of readFileSync(KAIKKI, 'utf-8').split('\n')) {
  if (!line) continue
  let row: { word?: string; pos?: string; senses?: Array<{ glosses?: string[]; raw_glosses?: string[] }> }
  try { row = JSON.parse(line) } catch { continue }
  if (!row.word) continue
  const w = row.word.toLowerCase()
  const gloss = row.senses?.map(s => s.glosses?.[0]).find(Boolean)
  if (!gloss) continue
  if (!dict.has(w)) dict.set(w, { pos: row.pos ?? '', gloss })
}
console.log(`kaikki: ${dict.size} Indonesian lemmas loaded.`)

// ── live items + corpus content tokens ───────────────────────────────────────
const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')
const db = createClient(URL, KEY).schema('indonesian')
const { data: textRows, error: tErr } = await db.from('texts').select('id,title,level,transcript_segments').not('transcript_segments', 'is', null)
if (tErr) throw tErr
const { data: itemRows, error: iErr } = await db.from('learning_items').select('normalized_text')
if (iErr) throw iErr
const items = new Set((itemRows ?? []).map((r: { normalized_text: string }) => r.normalized_text))

const tokens = new Set<string>()
for (const row of textRows ?? []) {
  const readable = toReadableText(row as never)
  for (const t of contentTokens(readable, isFunctionWord)) tokens.add(t)
}

// kaikki OR existing-item is a "known root" for decomposition.
const isRoot = (c: string) => dict.has(c) || items.has(c)

// ── propose ──────────────────────────────────────────────────────────────────
const seed = new Map<string, { indonesian: string; pos: string; english: string; from: string }>()
const folded: string[] = []      // affixed form whose root is ALREADY an item
const dropped: string[] = []     // no kaikki entry: name / artifact / unanalysable
for (const t of tokens) {
  if (items.has(t)) continue                                   // already covered
  const roots = decompose(t, isRoot).map(d => d.root)
  const root = roots.find(r => dict.has(r) || items.has(r))
  if (root) {
    if (items.has(root)) { folded.push(`${t}→${root}`); continue }
    const e = dict.get(root)
    if (e) seed.set(root, { indonesian: root, pos: e.pos, english: e.gloss, from: `${t} (affix→root)` })
    else dropped.push(`${t} (root ${root} not in kaikki)`)
    continue
  }
  const e = dict.get(t)
  if (e) { seed.set(t, { indonesian: t, pos: e.pos, english: e.gloss, from: 'base' }); continue }
  dropped.push(t)
}

const seedList = [...seed.values()].sort((a, b) => a.indonesian.localeCompare(b.indonesian))
console.log(`\nPROPOSED SEED (${seedList.length} distinct primitives — kaikki-glossed):`)
for (const s of seedList) console.log(`  ${s.indonesian.padEnd(16)} [${s.pos}]  ${s.english}   ‹${s.from}›`)
console.log(`\nFOLDED (affixed form, root already an item — not seeded): ${folded.length}`)
console.log(`  ${folded.join('  ')}`)
console.log(`\nDROPPED (no kaikki entry — name / artifact / unanalysable, NOT seeded): ${dropped.length}`)
console.log(`  ${dropped.sort().join('  ')}`)

const outIdx = process.argv.indexOf('--out')
if (outIdx > -1 && process.argv[outIdx + 1]) {
  writeFileSync(process.argv[outIdx + 1], JSON.stringify({ seed: seedList, folded, dropped }, null, 2))
  console.log(`\nWrote ${process.argv[outIdx + 1]}`)
}
