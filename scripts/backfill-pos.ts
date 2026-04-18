#!/usr/bin/env bun
/**
 * backfill-pos.ts
 *
 * One-shot backfill: tag learning_items.pos for existing word/phrase items
 * where pos is currently NULL. Uses Claude to classify items in batches.
 *
 * Usage:
 *   bun scripts/backfill-pos.ts [--dry-run] [--csv <path>] [--max-items <N>] [--resume]
 *   Requires SUPABASE_SERVICE_KEY and ANTHROPIC_API_KEY in .env.local.
 *
 * Safety guardrails:
 *  - --max-items caps the run size (default 200).
 *  - --dry-run prints proposals without writing.
 *  - --csv writes proposals to CSV for manual spot-check.
 *  - --resume reads a checkpoint file to skip items already processed.
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import { VALID_POS } from './lib/validate-pos'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// ── Env loading ──────────────────────────────────────────────────────────────
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

// ── Args ─────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run')
const RESUME = process.argv.includes('--resume')
const CSV_PATH = (() => {
  const i = process.argv.indexOf('--csv')
  return i > -1 ? process.argv[i + 1] : null
})()
const MAX_ITEMS = (() => {
  const i = process.argv.indexOf('--max-items')
  return i > -1 ? parseInt(process.argv[i + 1], 10) : 200
})()
const CHECKPOINT_PATH = '/tmp/pos-backfill-progress.json'
const BATCH_SIZE = 40
const MODEL = 'claude-sonnet-4-6'

// ── Types ────────────────────────────────────────────────────────────────────
interface Item {
  id: string
  base_text: string
  item_type: string
  translation_nl: string
  translation_en: string
}

interface ClassificationResult {
  id: string
  pos: string | null
}

// ── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(items: Item[]): string {
  return `You are classifying Indonesian learning items by part of speech for an A1-B1 beginner curriculum.

Tag each item with exactly one of these 12 values:

  verb, noun, adjective, adverb, pronoun, numeral,
  classifier, preposition, conjunction, particle,
  question_word, greeting

Rules:
- Use the POS of the primary Dutch translation's meaning. If "makan" is taught as "to eat" → verb. If taught as "meal" → noun.
- For phrase items, use the head-word's POS (e.g. "selamat pagi" → "greeting"; "buah jeruk" → "noun" because jeruk is the head).
- Classifiers (orang, ekor, buah, batang used as counters) → "classifier", not "noun".
- Question words (apa, siapa, mana, kapan, bagaimana, berapa) → "question_word".
- Greetings and courteous formulas → "greeting".
- Aspect/discourse particles (sudah, belum, akan, sedang, juga, saja, pun, kah, lah) → "particle".

Examples:
- "makan" (eten/to eat) → verb
- "rumah" (huis/house) → noun
- "orang" (as classifier for persons) → classifier
- "apa" (wat/what) → question_word
- "sudah" (al/already) → particle
- "selamat pagi" (goedemorgen) → greeting

Return ONLY a JSON array. No prose, no markdown fences. Exactly one object per input item:

[{"id": "...", "pos": "..."}]

Items to classify:

${JSON.stringify(items.map(i => ({
  id: i.id,
  indonesian: i.base_text,
  item_type: i.item_type,
  translation_nl: i.translation_nl,
  translation_en: i.translation_en,
})), null, 2)}
`
}

function parseResponse(raw: string): ClassificationResult[] {
  // Strip markdown fences if the model ignored instructions
  const cleaned = raw.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r: unknown): r is { id: unknown; pos: unknown } =>
        typeof r === 'object' && r !== null && 'id' in r && 'pos' in r
      )
      .map(r => ({
        id: String(r.id),
        pos: typeof r.pos === 'string' ? r.pos : null,
      }))
  } catch {
    return []
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  console.log(`Backfill POS — dry-run=${DRY_RUN}, max-items=${MAX_ITEMS}, csv=${CSV_PATH ?? 'none'}, resume=${RESUME}`)

  // Checkpoint
  let processedIds = new Set<string>()
  if (RESUME && fs.existsSync(CHECKPOINT_PATH)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8'))
      processedIds = new Set(cp.processedIds ?? [])
      console.log(`Resuming — skipping ${processedIds.size} already-processed items`)
    } catch (e) {
      console.warn(`Checkpoint unreadable, starting fresh: ${(e as Error).message}`)
    }
  }

  // 1. Fetch eligible items
  const { data: rawItems, error: itemsErr } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select('id, base_text, item_type')
    .is('pos', null)
    .in('item_type', ['word', 'phrase'])
    .limit(MAX_ITEMS * 2)  // over-fetch, filter below

  if (itemsErr) {
    console.error('Failed to fetch items:', itemsErr.message)
    process.exit(1)
  }
  const allItems = (rawItems ?? []) as Array<{ id: string; base_text: string; item_type: string }>
  const eligibleItems = allItems.filter(i => !processedIds.has(i.id)).slice(0, MAX_ITEMS)
  if (eligibleItems.length === 0) {
    console.log('No items to backfill.')
    return
  }
  console.log(`Eligible: ${eligibleItems.length} items (total in DB: ${allItems.length})`)

  // 2. Fetch primary meanings
  const { data: meanings } = await supabase
    .schema('indonesian')
    .from('item_meanings')
    .select('learning_item_id, translation_text, translation_language, is_primary')
    .in('learning_item_id', eligibleItems.map(i => i.id))
  const meaningsByItem = new Map<string, typeof meanings>()
  for (const m of meanings ?? []) {
    if (!meaningsByItem.has(m.learning_item_id)) meaningsByItem.set(m.learning_item_id, [])
    meaningsByItem.get(m.learning_item_id)!.push(m)
  }
  const primary = (itemId: string, lang: 'nl' | 'en') => {
    const arr = meaningsByItem.get(itemId) ?? []
    return (arr.find(m => m?.translation_language === lang && m?.is_primary)
      ?? arr.find(m => m?.translation_language === lang))?.translation_text ?? ''
  }

  const items: Item[] = eligibleItems.map(i => ({
    id: i.id,
    base_text: i.base_text,
    item_type: i.item_type,
    translation_nl: primary(i.id, 'nl'),
    translation_en: primary(i.id, 'en'),
  }))

  // 3. Classify in batches
  const results: Array<{ id: string; base_text: string; pos: string | null; valid: boolean }> = []
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    let classifications = await classifyBatch(claude, batch)

    // One retry on empty response (parse failure)
    if (classifications.length === 0 && batch.length > 0) {
      console.warn(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: empty response, retrying with stricter prompt`)
      classifications = await classifyBatch(claude, batch)
    }

    for (const c of classifications) {
      const item = batch.find(b => b.id === c.id)
      if (!item) continue
      const valid = c.pos != null && VALID_POS.has(c.pos)
      results.push({
        id: c.id,
        base_text: item.base_text,
        pos: valid ? c.pos : null,
        valid,
      })
    }
    // Update checkpoint after each batch
    const newProcessed = [...processedIds, ...classifications.map(c => c.id)]
    fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ processedIds: newProcessed }))
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)}: ${classifications.length} classified`)
  }

  // 4. CSV export
  if (CSV_PATH) {
    const rows = ['id,base_text,pos,valid', ...results.map(r =>
      `${r.id},"${r.base_text.replace(/"/g, '""')}",${r.pos ?? ''},${r.valid}`
    )]
    fs.writeFileSync(CSV_PATH, rows.join('\n'))
    console.log(`Wrote ${results.length} rows to ${CSV_PATH}`)
  }

  // 5. Write to DB unless dry-run
  const validResults = results.filter(r => r.valid && r.pos)
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would update ${validResults.length} items (${results.length - validResults.length} invalid/null skipped)`)
  } else {
    let written = 0
    for (const r of validResults) {
      const { error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .update({ pos: r.pos })
        .eq('id', r.id)
      if (error) {
        console.error(`  Failed to update ${r.id}: ${error.message}`)
      } else {
        written++
      }
    }
    console.log(`Updated ${written} items`)
  }

  // 6. Coverage summary
  const counts: Record<string, number> = {}
  for (const r of results) counts[r.pos ?? 'null'] = (counts[r.pos ?? 'null'] ?? 0) + 1
  console.log('\nCoverage:')
  for (const [pos, count] of Object.entries(counts).sort()) console.log(`  ${pos}: ${count}`)
}

async function classifyBatch(claude: Anthropic, batch: Item[]): Promise<ClassificationResult[]> {
  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: buildPrompt(batch) }],
  })
  const content = response.content[0]
  if (content.type !== 'text') return []
  return parseResponse(content.text)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
