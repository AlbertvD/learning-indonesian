// One-off analysis: which of the PBWL top-100 roots are NOT yet learning_items.
// Reads /tmp/pbwl-top100.json (produced by the openpyxl extraction). Normalises
// via the itemSlug contract (lowercase + trim) and diffs against live
// learning_items.normalized_text. Not committed long-term — feeds the gap-word
// authoring + the seed script.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { itemSlug } from '../../src/lib/capabilities/itemSlug'

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')

const top100 = JSON.parse(readFileSync('/tmp/pbwl-top100.json', 'utf8')) as Array<{
  rank: number; root: string; cefr: string | null; freq: number | null
}>

const supabase = createClient(URL, KEY)
const { data, error } = await supabase
  .schema('indonesian')
  .from('learning_items')
  .select('normalized_text')
if (error) throw error
const existing = new Set((data ?? []).map((r: { normalized_text: string }) => r.normalized_text))

const matched: typeof top100 = []
const gaps: typeof top100 = []
for (const row of top100) {
  ;(existing.has(itemSlug(row.root)) ? matched : gaps).push(row)
}

console.log(`Top-100: ${matched.length} already in the app, ${gaps.length} gap words.\n`)
console.log('GAP WORDS (need authoring — own NL+EN):')
for (const g of gaps) console.log(`  rank ${String(g.rank).padStart(3)}  ${g.root}  [CEFR ${g.cefr}]`)
