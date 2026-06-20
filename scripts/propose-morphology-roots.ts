/**
 * propose-morphology-roots.ts — the deterministic morphology-roots PROPOSER
 * (design: docs/plans/2026-06-20-morphology-affix-pool-proposer.md; ADR 0020).
 *
 * Picks ~15-25 high-frequency, attested, taught-root derived forms per affix and
 * emits a morphology-roots.ts block. Build-time only; writes no DB.
 *
 * Inputs: (1) the per-affix config below, (2) learning_items (taught roots, ranked),
 * (3) the pinned kaikki attestation snapshot. Per (root,affix): engine-derive →
 * confirm (∈ attested) / flag-irregular (engine≠attested but a be…-shape form is) /
 * skip. meN-/peN- stratify by allomorph class; everything else top-N by frequency.
 *
 * PROTOTYPE STATUS: ber- only, --dry (report) mode. Extends to all affixes via CONFIG.
 *
 * Usage:  SUPABASE_SERVICE_KEY=… NODE_TLS_REJECT_UNAUTHORIZED=0 \
 *           bun scripts/propose-morphology-roots.ts ber- [--cap 20]
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { deriveAffixedForm } from '@/lib/capabilities'
import { isCatalogAffix, affixCatalogEntry } from '@/lib/capabilities/affixCatalog'

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')

// ── Per-affix config (Q2): home lesson + illustratesCategory + POS classes ──────
// Prototype carries ber-; the rest land here as we roll out. meN-/peN- would carry
// a class→category sub-map instead of a single category.
const POS_FOR_AFFIX: Record<string, string[]> = {
  'ber-': ['verb', 'noun', 'adjective', 'numeral', 'pronoun'],
}
const L11_EXCEPTIONS = 'Plaatsing van BER- — algemene regel en uitzonderingen'
interface AffixConfig {
  lesson: number
  category: string
  /** per-root illustratesCategory override (e.g. spelling exceptions → exceptions category). */
  categoryOverride?: Record<string, string>
  /** roots to drop — folk-etymology false positives kaikki attests but the learner shouldn't drill. */
  exclude?: string[]
}
const CONFIG: Record<string, AffixConfig> = {
  'ber-': {
    lesson: 11,
    category: 'BER- + basiswoord uit vijf woordklassen',
    categoryOverride: { ajar: L11_EXCEPTIONS, kerja: L11_EXCEPTIONS }, // belajar / bekerja
    exclude: ['ingin', 'waktu'], // beringin = banyan (folk etym); berwaktu marginal
  },
}

const affix = process.argv[2]
const cap = Number(process.argv[process.argv.indexOf('--cap') + 1]) || 20
if (!affix || !isCatalogAffix(affix)) throw new Error(`pass a catalog affix (got "${affix}")`)
const cfg = CONFIG[affix]
const posList = POS_FOR_AFFIX[affix]
if (!cfg || !posList) throw new Error(`no config for ${affix} yet (prototype = ber- only)`)

// ── Attestation oracle (etymology-based, ADR 0020) ──────────────────────────
// kaikki tells us each form's morphological decomposition; we confirm a pair only
// when kaikki attests "<affixBase> + <root>" for the engine's derived spelling —
// NOT merely that the string is a word (which lets homographs like beranda slip in).
const snap = JSON.parse(fs.readFileSync('scripts/data/kaikki/id-attestation.json', 'utf8')) as {
  flat: string[]
  morph: Record<string, string[]> // derivedForm -> ["affBase|root", …]
}
const affixBase = affix.replace(/-/g, '').toLowerCase() // 'ber-' → 'ber', 'meN-' → 'men' (refined per-affix at rollout)
// reverse index: "affBase|root" -> [attested derived forms]
const reverse = new Map<string, string[]>()
for (const [form, decomps] of Object.entries(snap.morph)) {
  for (const d of decomps) {
    const arr = reverse.get(d) ?? []
    arr.push(form)
    reverse.set(d, arr)
  }
}
// For a non-reduplication affix, exclude reduplicated attested forms (internal
// hyphen, e.g. berlari-lari) — those belong to the ber-…-reduplication affix, not
// plain ber-. kaikki decomposes both as "ber+lari", so we split them by shape here.
const isReduplication = affixCatalogEntry(affix)!.affixType === 'reduplication'
const attestedFormsFor = (root: string): string[] =>
  (reverse.get(`${affixBase}|${root}`) ?? []).filter((f) => isReduplication || !f.includes('-'))

const supabase = createClient(URL, KEY)
const { data, error } = await supabase
  .schema('indonesian')
  .from('learning_items')
  .select('normalized_text, pos, frequency_rank')
  .eq('is_active', true)
  .eq('item_type', 'word')
  .in('pos', posList)
  .order('frequency_rank', { ascending: true, nullsFirst: false })
if (error) throw error

const confirmed: { root: string; derived: string; rank: number | null }[] = []
const flagged: { root: string; engine: string; attested: string }[] = []
let skipped = 0

const excludeSet = new Set(cfg.exclude ?? [])
for (const row of (data ?? []) as Array<{ normalized_text: string; pos: string; frequency_rank: number | null }>) {
  const root = row.normalized_text
  if (excludeSet.has(root)) continue // curation: folk-etymology false positives
  const realForms = attestedFormsFor(root) // kaikki-attested affix+root forms
  if (realForms.length === 0) {
    skipped++ // root doesn't take this affix (per kaikki) → never a homograph false-positive
    continue
  }
  let engineForm: string
  try {
    engineForm = deriveAffixedForm(root, affix).derived
  } catch {
    skipped++
    continue
  }
  if (realForms.includes(engineForm)) {
    confirmed.push({ root, derived: engineForm, rank: row.frequency_rank }) // engine spells it right
  } else {
    // kaikki knows an affix+root form, but the engine mis-spells it → needs an
    // IRREGULAR-table entry before it can be authored (don't auto-emit).
    flagged.push({ root, engine: engineForm, attested: realForms[0] })
  }
}

const entry = affixCatalogEntry(affix)!
console.log(`\n=== propose ${affix}  (home L${cfg.lesson}, cap ${cap}, ${entry.affixType}) ===`)
console.log(`candidates scanned: ${data?.length ?? 0}  |  confirmed: ${confirmed.length}  |  flagged-irregular: ${flagged.length}  |  skipped: ${skipped}\n`)
console.log(`── top ${cap} confirmed (the proposed pool) ──`)
for (const c of confirmed.slice(0, cap)) {
  console.log(`  { root: '${c.root}', affix: '${affix}', illustratesCategory: ${JSON.stringify(cfg.category)} },  // ${c.derived}  [rank ${c.rank ?? '—'}]`)
}
if (confirmed.length > cap) console.log(`  … +${confirmed.length - cap} more confirmed beyond the cap`)
console.log(`\n── flagged irregular (real form attested, engine mis-spells → IRREGULAR-table candidates) ──`)
for (const f of flagged.slice(0, 20)) console.log(`  ${f.root}: engine='${f.engine}'  attested='${f.attested}'`)
if (!flagged.length) console.log('  (none)')

// ── --write: emit the generated morphology-roots.ts (additive, ADR 0011 / Q6) ──
if (process.argv.includes('--write')) {
  const { data: lrow } = await supabase.schema('indonesian').from('lessons').select('id').eq('order_index', cfg.lesson).single()
  const lessonId = (lrow as { id: string } | null)?.id
  const { data: pubRows } = await supabase
    .schema('indonesian').from('affixed_form_pairs').select('root_text').eq('affix', affix).eq('lesson_id', lessonId)
  const published = new Set(((pubRows ?? []) as Array<{ root_text: string }>).map((r) => r.root_text))
  const confirmedRoots = new Set(confirmed.map((c) => c.root))

  // Preserve every published root (never orphan a live cap); then append top new confirmed up to cap.
  const keep: string[] = []
  for (const c of confirmed) if (published.has(c.root)) keep.push(c.root)
  for (const r of published) if (!confirmedRoots.has(r) && !excludeSet.has(r)) keep.push(r)
  for (const c of confirmed) if (!published.has(c.root) && keep.length < cap) keep.push(c.root)

  const catFor = (r: string) => cfg.categoryOverride?.[r] ?? cfg.category
  const groups = new Map<string, string[]>()
  for (const r of keep) {
    const c = catFor(r)
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c)!.push(r)
  }
  const lines: string[] = []
  lines.push(`import type { MorphologyRoot } from '@/lib/capabilities'`, '')
  lines.push(`// GENERATED by scripts/propose-morphology-roots.ts — affix ${affix}, home L${cfg.lesson}.`)
  lines.push(`// Roots = taught learning_items whose ${affix}-derived form kaikki attests as "${affix}+root"`)
  lines.push(`// (ADR 0020). Re-run additive (--regenerate to rebuild). Curation overrides live in the script config.`)
  lines.push('')
  // declare category consts referenced
  const cats = [...groups.keys()]
  cats.forEach((c, i) => lines.push(`const CAT_${i} = ${JSON.stringify(c)}`))
  lines.push('', 'export const morphologyRoots: MorphologyRoot[] = [')
  cats.forEach((c, i) => {
    lines.push(`  // ── ${c} ──`)
    for (const r of groups.get(c)!) {
      lines.push(`  { root: '${r}', affix: '${affix}', illustratesCategory: CAT_${i} }, // ${deriveAffixedForm(r, affix).derived}`)
    }
  })
  lines.push(']', '')
  const path = `scripts/data/staging/lesson-${cfg.lesson}/morphology-roots.ts`
  fs.writeFileSync(path, lines.join('\n'))
  console.log(`\n✍  wrote ${keep.length} roots → ${path}  (preserved ${published.size} published + ${keep.length - published.size} new; cap ${cap})`)
}
