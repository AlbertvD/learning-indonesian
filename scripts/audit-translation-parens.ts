#!/usr/bin/env bun
/**
 * audit-translation-parens.ts
 *
 * Dumps all item_meanings whose translation_text contains parentheticals
 * to a CSV for manual review. Some are legitimate disambiguation
 * (e.g. "huis (gebouw)"), others bleed Indonesian into Dutch
 * (e.g. "goud (emas)"). Not auto-fixable — human judgment required.
 *
 * Usage:
 *   bun scripts/audit-translation-parens.ts [--csv <path>]
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

const CSV_PATH = (() => {
  const i = process.argv.indexOf('--csv')
  return i > -1 ? process.argv[i + 1] : '/tmp/translation-parens-review.csv'
})()

async function main() {
  const s = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const { data: meanings } = await s.schema('indonesian').from('item_meanings')
    .select('learning_item_id, translation_language, translation_text, is_primary')
    .ilike('translation_text', '%(%')
  const { data: items } = await s.schema('indonesian').from('learning_items')
    .select('id, base_text, item_type, pos')

  if (!meanings || !items) { console.error('fetch failed'); process.exit(1) }
  const iById = new Map((items ?? []).map(i => [i.id, i]))

  const rows = (meanings ?? []).filter(m => /\([^)]+\)/.test(m.translation_text))
  console.log(`Found ${rows.length} translations with parentheticals`)

  // Heuristic categorization
  const suggest = (base: string, trans: string): string => {
    const parens = trans.match(/\(([^)]+)\)/g) ?? []
    for (const p of parens) {
      const inner = p.slice(1, -1).toLowerCase().trim()
      // If the parenthetical contains the base_text (Indonesian), it's likely
      // an Indonesian-in-Dutch bleed — flag as "review: Indonesian-in-translation".
      if (base && inner.includes(base.toLowerCase())) return 'indonesian-in-translation'
      // Short parenthetical (<= 4 chars) often denotes a register marker.
      if (inner.length <= 4) return 'register-marker'
      // Phrases like "(kwaliteit)", "(emas)", "(interjectie)" are disambiguators.
      if (/^[a-zàâéèêîôû\- ]+$/.test(inner)) return 'disambiguation-candidate'
    }
    return 'review'
  }

  // CSV
  const headers = ['item_id', 'base_text', 'item_type', 'pos', 'language', 'is_primary', 'translation_text', 'suggestion']
  const lines = [headers.join(',')]
  for (const m of rows) {
    const item = iById.get(m.learning_item_id)
    if (!item) continue
    const bt = (item.base_text ?? '').replace(/"/g, '""')
    const tt = m.translation_text.replace(/"/g, '""')
    const sug = suggest(item.base_text ?? '', m.translation_text)
    lines.push([
      item.id,
      `"${bt}"`,
      item.item_type,
      item.pos ?? '',
      m.translation_language,
      String(m.is_primary),
      `"${tt}"`,
      sug,
    ].join(','))
  }
  fs.writeFileSync(CSV_PATH, lines.join('\n'))
  console.log(`Wrote ${rows.length} rows to ${CSV_PATH}`)

  // Summary
  const counts: Record<string, number> = {}
  for (const l of lines.slice(1)) {
    const sug = l.split(',').pop() ?? ''
    counts[sug] = (counts[sug] ?? 0) + 1
  }
  console.log('\nBy suggestion:')
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)
}

main().catch(e => { console.error(e); process.exit(1) })
