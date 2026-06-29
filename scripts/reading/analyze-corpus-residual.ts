#!/usr/bin/env bun
/**
 * analyze-corpus-residual.ts — the authoritative reading-corpus residual detector
 * for the harvest pre-seed (reader Phase 2 §5).
 *
 * Reads the LIVE DB (never staging — [[project_staging_learning_items_drifts_from_db]]):
 * every `texts` row's ID transcript, tokenised with the reader's OWN tokenizer +
 * function-word list (so the numbers match what the reader actually treats as a
 * glossable content word), then partitioned against live `learning_items`.
 *
 * A corpus content token is in exactly one bucket:
 *   covered      — already a learning_item (has the vocab cap suite; harvestable)
 *   morphology   — NOT an item but decomposes to a known-root item (the MORPHOLOGY
 *                  FOLD: the reader glosses it via item_morphology, the root is the
 *                  harvestable primitive) → NOT seeded as its own item
 *   residual     — a genuine lexical primitive with no item and no known root → the
 *                  gap words to author + publish through lesson-999 (§5)
 *
 * Function words and proper nouns are excluded up front (always-known / not glossed).
 *
 * Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/reading/analyze-corpus-residual.ts [--json /tmp/out.json]
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY in .env.local.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { toReadableText } from '../../src/lib/reading/readableText'
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

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')
const db = createClient(URL, KEY).schema('indonesian')

// ── 1. Live corpus + live items ──────────────────────────────────────────────
const { data: textRows, error: textErr } = await db
  .from('texts')
  .select('id, title, level, transcript_segments')
  .not('transcript_segments', 'is', null)
if (textErr) throw textErr

const { data: itemRows, error: itemErr } = await db.from('learning_items').select('normalized_text')
if (itemErr) throw itemErr
const items = new Set((itemRows ?? []).map((r: { normalized_text: string }) => r.normalized_text))
const isRoot = (candidate: string) => items.has(candidate)

// ── 2. Distinct content tokens + TYPE-LEVEL proper-noun detection ────────────
// The reader's per-occurrence proper-noun flag (capitalised AND not sentence-initial)
// structurally MISSES a name that only ever appears sentence-initially (e.g. a city
// or person at the start of a sentence) — it leaks in lowercased. So we classify at
// the TYPE level over every raw occurrence in the corpus:
//   a type is a proper noun if it is EVER capitalised mid-sentence, OR it is
//   capitalised in EVERY occurrence and NEVER appears lowercase (an always-cap name).
// Function words and known items are never names (a real-word safety net).
interface CapProfile { caps: number; total: number; capMid: boolean; lowerAnywhere: boolean }
const profile = new Map<string, CapProfile>()
const tokens = new Set<string>()
for (const row of textRows ?? []) {
  const readable = toReadableText(row as never)
  for (const seg of readable.segments) {
    seg.tokens.forEach((tok, i) => {
      if (!tok.isWord || isFunctionWord(tok.normalized)) return
      tokens.add(tok.normalized)
      const firstLetter = tok.raw.replace(/^[^A-Za-zÀ-ÿ]+/, '').charAt(0)
      const isCap = firstLetter !== '' && firstLetter === firstLetter.toUpperCase() && firstLetter !== firstLetter.toLowerCase()
      const p = profile.get(tok.normalized) ?? { caps: 0, total: 0, capMid: false, lowerAnywhere: false }
      p.total += 1
      if (isCap) { p.caps += 1; if (i > 0) p.capMid = true } else { p.lowerAnywhere = true }
      profile.set(tok.normalized, p)
    })
  }
}
// RELIABLE name signal: capitalised mid-sentence (a common word is lowercase there).
// AMBIGUOUS: capitalised in every occurrence but only ever sentence-initial — could be
// a sentence-initial-only name (Surabaya) OR a real word that only happens to start a
// sentence in this tiny corpus (mendengar). We DON'T auto-drop the ambiguous set; we
// report it so the curation step can split names from words (a gazetteer / judgement),
// exactly the surabaya-vs-mendengar problem.
function isNameType(t: string): boolean {
  if (items.has(t) || isFunctionWord(t)) return false
  return profile.get(t)?.capMid ?? false
}
function isAmbiguousCap(t: string): boolean {
  if (items.has(t) || isFunctionWord(t)) return false
  const p = profile.get(t)
  return !!p && !p.capMid && p.caps === p.total && !p.lowerAnywhere
}
const properNouns = [...tokens].filter(isNameType).sort()
const ambiguousCap = [...tokens].filter(isAmbiguousCap).sort()
for (const t of properNouns) tokens.delete(t)   // mid-sentence caps: names, never seeded

// Enclitic pronouns/particles (-nya/-ku/-mu/-lah/-kah/-pun) are NOT derivational
// morphology — they are function-word clitics appended to a base. A token folds if
// its base (after stripping one clitic) is itself known/coverable. Reduplication
// (`teman-teman`) folds when the base half is known. Neither is a lexical primitive,
// so neither is seeded.
const CLITICS = ['nya', 'ku', 'mu', 'lah', 'kah', 'pun']
function known(word: string): boolean {
  return items.has(word) || isFunctionWord(word) || decompose(word, isRoot).length > 0
}
function foldsViaCliticOrRedup(t: string): boolean {
  for (const c of CLITICS) {
    if (t.length > c.length + 1 && t.endsWith(c)) {
      const base = t.slice(0, -c.length)
      if (known(base)) return true
    }
  }
  if (t.includes('-')) {
    const [a, b] = t.split('-')
    if (a && a === b && known(a)) return true        // full reduplication: anak-anak
    if (a && known(a)) return true                    // base + redup tail
  }
  return false
}

// ── 3. Bucket each token ─────────────────────────────────────────────────────
const covered: string[] = []
const morphology: Array<{ word: string; root: string; affix: string }> = []
const clitic: string[] = []
const residual: string[] = []
for (const t of tokens) {
  if (items.has(t)) { covered.push(t); continue }
  const decomp = decompose(t, isRoot)
  if (decomp.length > 0) { morphology.push({ word: t, root: decomp[0].root, affix: decomp[0].affix }); continue }
  if (foldsViaCliticOrRedup(t)) { clitic.push(t); continue }
  residual.push(t)
}
residual.sort()
clitic.sort()
morphology.sort((a, b) => a.word.localeCompare(b.word))

const total = tokens.size
const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`
console.log(`\nReading corpus: ${textRows?.length ?? 0} texts, ${total} distinct content tokens (function words + ${properNouns.length} mid-sentence-capitalised name TYPES excluded).`)
console.log(`Names removed (capitalised mid-sentence): ${properNouns.join(' ')}`)
console.log(`\n⚠ AMBIGUOUS (always-capitalised, sentence-initial only — names vs sentence-start words; CURATE these): ${ambiguousCap.join(' ')}\n`)
console.log(`  covered (already a learning_item)        ${String(covered.length).padStart(4)}  ${pct(covered.length)}`)
console.log(`  morphology fold (root is a known item)   ${String(morphology.length).padStart(4)}  ${pct(morphology.length)}  → glossed, NOT seeded`)
console.log(`  clitic/redup fold (base is known)        ${String(clitic.length).padStart(4)}  ${pct(clitic.length)}  → fold to base, NOT seeded`)
console.log(`  RESIDUAL (genuine gap primitives)        ${String(residual.length).padStart(4)}  ${pct(residual.length)}  → author + publish (§5)\n`)

console.log('RESIDUAL gap words (lexical primitives to author — own NL+EN):')
console.log('  ' + residual.join(' '))
console.log('\nMORPHOLOGY-FOLD sample (decompose to a known root — covered by the reader gloss, not seeded):')
for (const m of morphology.slice(0, 40)) console.log(`  ${m.word}  →  ${m.affix} + ${m.root}`)
if (morphology.length > 40) console.log(`  … +${morphology.length - 40} more`)

const jsonIdx = process.argv.indexOf('--json')
if (jsonIdx > -1 && process.argv[jsonIdx + 1]) {
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ total, covered, morphology, residual }, null, 2))
  console.log(`\nWrote ${process.argv[jsonIdx + 1]}`)
}
