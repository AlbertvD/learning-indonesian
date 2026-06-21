/**
 * propose-morphology-roots.ts — the deterministic morphology-roots PROPOSER
 * (design: docs/plans/2026-06-20-morphology-affix-pool-proposer.md; ADR 0020).
 *
 * Picks ~15-25 high-frequency, attested, taught-root derived forms per affix and
 * GENERATES the home lesson's morphology-roots.ts. Build-time only; writes no DB.
 *
 * Oracle (per (root,affix), engine-derive D):
 *   D attested AND (kaikki decomposes D as affix+root  →  confirm)
 *                OR (D is NOT a foreign borrowing       →  confirm; trusts the engine)
 *                OR (D is a borrowing w/ no affix etym  →  reject: homograph like beranda)
 *   D not attested but kaikki attests some affix+root form → flag-irregular (IRREGULAR-table todo)
 *   else → skip.
 * meN-/peN- stratify by allomorph class (floor 1/class); invariant affixes top-N by frequency.
 *
 * Usage:  SUPABASE_SERVICE_KEY=… NODE_TLS_REJECT_UNAUTHORIZED=0 \
 *           bun scripts/propose-morphology-roots.ts <affix> [--cap N] [--write]
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { deriveAffixedForm } from '@/lib/capabilities'
import { isCatalogAffix, affixCatalogEntry } from '@/lib/capabilities/affixCatalog'

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')

// ── Per-affix config (Q2): home lesson, illustratesCategory, POS, curation ──────
interface AffixConfig {
  lesson: number
  pos: string[]
  /** invariant affix: one category for all pairs. */
  category?: string
  /** allomorphic / POS-stratified affix: (root, pos) → category. */
  classify?: (root: string, pos?: string) => string
  /** morph-index affix base (kaikki lemma): ber-→ber, meN-→meng, peN-→peng. */
  affixBase?: string
  /** per-root illustratesCategory override (spelling exceptions). */
  categoryOverride?: Record<string, string>
  /** folk-etymology false positives to drop. */
  exclude?: string[]
}
const L11_EXC = 'Plaatsing van BER- — algemene regel en uitzonderingen'
const initial = (r: string) => r[0]?.toLowerCase() ?? ''
const inSet = (r: string, chars: string) => chars.includes(initial(r))

const CONFIG: Record<string, AffixConfig> = {
  'ber-': {
    lesson: 11,
    pos: ['verb', 'noun', 'adjective', 'numeral', 'pronoun'],
    category: 'BER- + basiswoord uit vijf woordklassen',
    categoryOverride: { ajar: L11_EXC, kerja: L11_EXC },
    exclude: ['ingin', 'waktu'], // beringin = banyan (folk etym); berwaktu marginal
  },
  'meN-': {
    lesson: 13,
    pos: ['verb', 'noun', 'adjective'],
    affixBase: 'meng',
    // bare meN- exists but the *productive* form is a confix → drill there, not here:
    // membanyak→memperbanyak, mengata→mengatakan, membaru→memperbarui.
    exclude: ['banyak', 'kata', 'baru'],
    classify: (r) =>
      inSet(r, 'kpst') ? 'B. ME- met verandering van de eerste klank (K, P, S, T)'
      : inSet(r, 'lmnrwy') ? 'A1. ME- zonder verandering (me-)'
      : 'A2. ME- met aangepast voorvoegsel (mem-, men-, meng-)',
  },
  'peN-': {
    lesson: 20,
    pos: ['verb', 'noun', 'adjective'],
    affixBase: 'peng',
    classify: (r) =>
      inSet(r, 'kpst') ? 'B. Voorvoeging met wegval van de beginklank (K, P, S, T)'
      : inSet(r, 'bf') ? 'PEM- voor B en F'
      : inSet(r, 'cdj') ? 'PEN- voor C, D, J'
      : inSet(r, 'aeiough') ? 'PENG- voor de klinkers (A, E, I, O, U) en voor G, H'
      : 'A. Voorvoeging zonder verandering van het basiswoord (L, M, N, NY, R, W, Y)',
  },
  'di-': {
    lesson: 18,
    pos: ['verb'],
    affixBase: 'di',
    category: 'Passieve zin met de DI-vorm (3e persoon, agens onbenoemd)',
  },
  '-i': {
    lesson: 23,
    pos: ['verb', 'noun', 'adjective'],
    affixBase: 'i',
    category: 'Hoofdfunctie van de werkwoordsvorm met -i',
  },
  'pe-…-an': {
    lesson: 25,
    pos: ['verb', 'noun', 'adjective'],
    affixBase: 'peng',
    category: 'De PE-...-AN vorm: van basiswoord naar zelfstandig naamwoord',
  },
  'ter-': {
    lesson: 26,
    pos: ['verb', 'adjective'],
    affixBase: 'ter',
    category: 'Het voorvoegsel TER- — twee posities, twee basiswoordklassen',
  },
  'ke-…-an': {
    lesson: 27,
    pos: ['noun', 'adjective', 'verb'],
    affixBase: 'ke',
    category: 'KE-...-AN — overzicht en basiswoordtypen',
  },
  reduplication: {
    lesson: 22,
    pos: ['noun', 'verb', 'adjective'],
    affixBase: 'reduplication',
    // POS-stratified: verb / noun-plurality / adjective-intensifier reduplication.
    classify: (_r, pos) =>
      pos === 'verb' ? '1. Verdubbeling van het werkwoord'
      : pos === 'adjective' ? '3. Verdubbeling van het bijvoeglijk naamwoord — versterking'
      : '2. Verdubbeling van het zelfstandig naamwoord — meervoud mét diversiteit',
    // LEXICALISED / frozen reduplications — vocab, NOT productive morphology (CONTEXT.md):
    // lexicalised nouns (the reduplicated form IS the word) + frozen adverbs. The oracle
    // can't detect semantic lexicalisation, so these are curated out by hand.
    exclude: [
      'mata', 'paru', 'laki', 'langit', 'layang', 'gula', 'kuda', // mata-mata=spy, paru-paru=lungs, laki-laki=man, …
      'hati', 'tiba', 'tiap', 'masing', 'mula', 'benar', 'sama', 'tahu', 'pagi', 'kira', 'moga', 'ada', 'salah', // frozen adverbs
    ],
  },
}

const affix = process.argv[2]
const capArg = process.argv.indexOf('--cap')
const cap = capArg >= 0 ? Number(process.argv[capArg + 1]) : 22
if (!affix || !isCatalogAffix(affix)) throw new Error(`pass a catalog affix (got "${affix}")`)
const cfg = CONFIG[affix]
if (!cfg) throw new Error(`no config for ${affix} yet`)
const posByRoot = new Map<string, string>()
const catFor = (r: string, pos?: string) =>
  cfg.categoryOverride?.[r] ?? (cfg.classify ? cfg.classify(r, pos ?? posByRoot.get(r)) : cfg.category!)
const affixBase = cfg.affixBase ?? affix.replace(/-/g, '').toLowerCase()

// ── Attestation oracle (etymology-based + loanword-reject, ADR 0020) ────────────
const snap = JSON.parse(fs.readFileSync('scripts/data/kaikki/id-attestation.json', 'utf8')) as {
  flat: string[]
  morph: Record<string, string[]>
  borrowed: string[]
}
const flat = new Set(snap.flat)
const borrowed = new Set(snap.borrowed)
const isReduplication = affixCatalogEntry(affix)!.affixType === 'reduplication'
const reverse = new Map<string, string[]>()
for (const [form, decomps] of Object.entries(snap.morph)) {
  for (const d of decomps) reverse.set(d, [...(reverse.get(d) ?? []), form])
}
const decompHas = (form: string, root: string) => (reverse.get(`${affixBase}|${root}`) ?? []).includes(form)
// kaikki-attested affix+root forms (non-reduplicated unless the affix IS reduplication)
const attestedFormsFor = (root: string): string[] =>
  (reverse.get(`${affixBase}|${root}`) ?? []).filter((f) => isReduplication || !f.includes('-'))

const supabase = createClient(URL, KEY)
const { data, error } = await supabase
  .schema('indonesian').from('learning_items')
  .select('normalized_text, pos, frequency_rank')
  .eq('is_active', true).eq('item_type', 'word').in('pos', cfg.pos)
  .order('frequency_rank', { ascending: true, nullsFirst: false })
if (error) throw error

interface Pick { root: string; derived: string; rank: number | null; category: string }
const confirmed: Pick[] = []
const flagged: { root: string; engine: string; attested: string }[] = []
let skipped = 0, rejected = 0

const excludeSet = new Set(cfg.exclude ?? [])
for (const row of (data ?? []) as Array<{ normalized_text: string; pos: string; frequency_rank: number | null }>) {
  const root = row.normalized_text
  posByRoot.set(root, row.pos)
  if (excludeSet.has(root)) continue
  let derived: string
  try { derived = deriveAffixedForm(root, affix).derived } catch { skipped++; continue }
  if (flat.has(derived)) {
    if (decompHas(derived, root) || !borrowed.has(derived)) {
      confirmed.push({ root, derived, rank: row.frequency_rank, category: catFor(root) })
    } else {
      rejected++ // attested but a foreign borrowing with no affix etymology → homograph (beranda)
    }
  } else {
    const real = attestedFormsFor(root)
    if (real.length) flagged.push({ root, engine: derived, attested: real[0] }) // engine mis-spells → IRREGULAR todo
    else skipped++
  }
}

// ── Selection: stratify allomorphic affixes (floor 1/class), else top-N ─────────
let selected: Pick[]
const perClass = new Map<string, number>()
if (cfg.classify) {
  const byCat = new Map<string, Pick[]>()
  for (const c of confirmed) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c])
  for (const [k, v] of byCat) perClass.set(k, v.length)
  const sel: Pick[] = []
  for (const [, v] of byCat) if (v.length) sel.push(v[0]) // floor: 1 highest-freq per class
  const chosen = new Set(sel.map((c) => c.root))
  for (const c of confirmed) if (!chosen.has(c.root) && sel.length < cap) { sel.push(c); chosen.add(c.root) }
  selected = sel.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
} else {
  selected = confirmed.slice(0, cap)
}

const entry = affixCatalogEntry(affix)!
console.log(`\n=== propose ${affix}  (home L${cfg.lesson}, cap ${cap}, ${entry.affixType}) ===`)
console.log(`scanned: ${data?.length ?? 0} | confirmed: ${confirmed.length} | selected: ${selected.length} | flagged-irregular: ${flagged.length} | rejected-borrowing: ${rejected} | skipped: ${skipped}`)
if (cfg.classify) {
  console.log(`per-class confirmed:`)
  for (const [k, n] of perClass) console.log(`   ${n.toString().padStart(3)}  ${k}`)
  const covered = new Set(selected.map((c) => c.category))
  console.log(`selected covers ${covered.size}/${new Set(confirmed.map((c) => c.category)).size} classes present`)
}
console.log(`\n── selected pool ──`)
for (const c of selected) console.log(`  ${c.derived}  [${c.root}, rank ${c.rank ?? '—'}]  ${cfg.classify ? '· ' + c.category.slice(0, 28) : ''}`)
console.log(`\n── flagged irregular (engine mis-spells an attested affix+root form → IRREGULAR-table) ──`)
for (const f of flagged.slice(0, 25)) console.log(`  ${f.root}: engine='${f.engine}'  attested='${f.attested}'`)
if (!flagged.length) console.log('  (none)')

// ── --write: emit the generated morphology-roots.ts (additive, ADR 0011 / Q6) ──
if (process.argv.includes('--write')) {
  const { data: lrow } = await supabase.schema('indonesian').from('lessons').select('id').eq('order_index', cfg.lesson).single()
  const lessonId = (lrow as { id: string } | null)?.id
  const { data: pubRows } = await supabase
    .schema('indonesian').from('affixed_form_pairs').select('root_text').eq('affix', affix).eq('lesson_id', lessonId)
  const published = new Set(((pubRows ?? []) as Array<{ root_text: string }>).map((r) => r.root_text))
  const selRoots = new Set(selected.map((c) => c.root))

  const keep: string[] = []
  for (const c of selected) if (published.has(c.root)) keep.push(c.root)          // preserved (live caps)
  for (const r of published) if (!selRoots.has(r) && !excludeSet.has(r)) keep.push(r) // preserved even if reselection dropped
  for (const c of selected) if (!published.has(c.root) && keep.length < cap) keep.push(c.root) // new

  const groups = new Map<string, string[]>()
  for (const r of keep) { const c = catFor(r); groups.set(c, [...(groups.get(c) ?? []), r]) }

  // Multi-affix lessons (e.g. L22's reduplication family) host >1 affix in one file.
  // Preserve entries for OTHER affixes verbatim — we only regenerate THIS affix's set.
  const path = `scripts/data/staging/lesson-${cfg.lesson}/morphology-roots.ts`
  const foreign: { root: string; affix: string; cat: string }[] = []
  if (fs.existsSync(path)) {
    const text = fs.readFileSync(path, 'utf8')
    const consts = new Map<string, string>()
    for (const m of text.matchAll(/const (\w+)\s*=\s*(['"])([\s\S]*?)\2/g)) consts.set(m[1], m[3])
    for (const m of text.matchAll(/\{\s*root:\s*'([^']*)',\s*affix:\s*'([^']*)',\s*illustratesCategory:\s*([^}]+?)\s*\}/g)) {
      const [, r, afx, expr] = m
      if (afx === affix) continue
      const lit = expr.trim().match(/^(['"])([\s\S]*)\1$/)
      const cat = lit ? lit[2] : consts.get(expr.trim())
      if (cat) foreign.push({ root: r, affix: afx, cat })
    }
  }

  const lines: string[] = [`import type { MorphologyRoot } from '@/lib/capabilities'`, '']
  lines.push(`// GENERATED by scripts/propose-morphology-roots.ts — affix ${affix}, home L${cfg.lesson} (ADR 0020).`)
  lines.push(`// Roots = taught learning_items whose ${affix} form kaikki attests (not a loanword). Re-run additive.`)
  if (foreign.length) lines.push(`// Entries for other affixes in this lesson are preserved verbatim below.`)
  lines.push('')
  const cats = [...groups.keys()]
  cats.forEach((c, i) => lines.push(`const CAT_${i} = ${JSON.stringify(c)}`))
  lines.push('', 'export const morphologyRoots: MorphologyRoot[] = [')
  cats.forEach((c, i) => {
    lines.push(`  // ── ${c} ──`)
    for (const r of groups.get(c)!) lines.push(`  { root: '${r}', affix: '${affix}', illustratesCategory: CAT_${i} }, // ${deriveAffixedForm(r, affix).derived}`)
  })
  if (foreign.length) {
    lines.push(`  // ── preserved: other affixes taught in this lesson ──`)
    for (const f of foreign) lines.push(`  { root: '${f.root}', affix: '${f.affix}', illustratesCategory: ${JSON.stringify(f.cat)} }, // ${deriveAffixedForm(f.root, f.affix).derived}`)
  }
  lines.push(']', '')
  fs.writeFileSync(path, lines.join('\n'))
  console.log(`\n✍  wrote ${keep.length} ${affix} roots + ${foreign.length} preserved (other affixes) → ${path}  (${published.size} published this affix preserved + ${keep.length - published.size} new)`)
}
