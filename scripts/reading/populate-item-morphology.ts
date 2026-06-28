/**
 * Build-time population of `indonesian.item_morphology` (ADR 0024) — the Lezen reader's
 * morphology gloss pre-compute. For every affixed reading-corpus word, store its
 * {root, affix} so the reader shows an exploratory gloss by a pure retrieve.
 *
 * Two sources, in precedence order:
 *   1. `affixed_form_pairs` — the curated, attested drilled set (authoritative
 *      {root_text, derived_text, affix}); projected verbatim.
 *   2. the affixDecomposition engine over the reading corpus (texts.transcript_segments)
 *      for words not covered by (1): strip-to-propose + derive-to-verify, with the
 *      `isRoot` predicate = "is a learning_item". Only verified decompositions land.
 *
 * Idempotent: upsert on `normalized_text`. Re-run after publishing new texts/morphology.
 * Gloss-only: writes NO capabilities (the drilled set stays affixed_form_pairs).
 *
 * Requires SUPABASE_SERVICE_KEY + VITE_SUPABASE_URL in .env.local. Live-DB write.
 *   bun scripts/reading/populate-item-morphology.ts [--dry-run]
 */
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { decompose } from '../../src/lib/capabilities/affixDecomposition'
import { isFunctionWord } from '../../src/lib/reading/functionWords'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const DRY_RUN = process.argv.includes('--dry-run')
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')
const db = createClient(URL, KEY).schema('indonesian')

interface Row { normalized_text: string; root: string; affix: string }

const tokenize = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z-]+/).filter((w) => w.length >= 3 && w !== '-')

async function main() {
  const rows = new Map<string, Row>() // normalized_text → row (first writer wins)

  // 1. Curated affixed_form_pairs (authoritative).
  const { data: pairs, error: pe } = await db
    .from('affixed_form_pairs')
    .select('root_text, derived_text, affix')
    .not('affix', 'is', null)
  if (pe) throw pe
  for (const p of (pairs ?? []) as Array<{ root_text: string; derived_text: string; affix: string }>) {
    const key = p.derived_text.toLowerCase()
    if (!rows.has(key)) rows.set(key, { normalized_text: key, root: p.root_text.toLowerCase(), affix: p.affix })
  }
  const fromPairs = rows.size

  // 2. learning_items = the root lexicon for decomposition + the corpus membership.
  const { data: items, error: ie } = await db.from('learning_items').select('normalized_text')
  if (ie) throw ie
  const itemSet = new Set((items ?? []).map((r: { normalized_text: string }) => r.normalized_text.toLowerCase()))
  const isRoot = (w: string) => itemSet.has(w)

  // 3. Reading corpus tokens (texts.transcript_segments → Indonesian sentences).
  const { data: texts, error: te } = await db.from('texts').select('transcript_segments')
  if (te) throw te
  const corpus = new Set<string>()
  for (const t of (texts ?? []) as Array<{ transcript_segments: Array<{ id: string }> | null }>) {
    for (const seg of t.transcript_segments ?? []) for (const w of tokenize(seg.id)) corpus.add(w)
  }

  // 4. Decompose uncovered corpus words (verified against the forward engine).
  let fromDecomp = 0
  for (const word of corpus) {
    if (rows.has(word) || isFunctionWord(word)) continue
    const results = decompose(word, isRoot)
    if (results.length === 0) continue
    const best = results[0] // usually 1; ambiguous picks the first catalog-order affix
    rows.set(word, { normalized_text: word, root: best.root, affix: best.affix })
    fromDecomp++
  }

  const all = [...rows.values()]
  console.log(`item_morphology: ${all.length} rows (${fromPairs} from affixed_form_pairs, ${fromDecomp} from corpus decomposition)`)
  if (DRY_RUN) {
    console.log('Sample:', all.slice(0, 12).map((r) => `${r.normalized_text}←${r.root}/${r.affix}`).join('  '))
    return
  }
  // Upsert in chunks (idempotent on normalized_text).
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await db.from('item_morphology').upsert(all.slice(i, i + 500), { onConflict: 'normalized_text' })
    if (error) throw error
  }
  console.log(`✓ upserted ${all.length} item_morphology rows.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
