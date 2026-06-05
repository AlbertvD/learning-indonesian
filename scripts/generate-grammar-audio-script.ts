// Generates verbatim grammar audio-recording scripts ("SD Lx.txt") from the
// live DB's grammar lesson_sections.
//
// Usage:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/generate-grammar-audio-script.ts <orderIndex...>
//   e.g. NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/generate-grammar-audio-script.ts 5 6 7 8 9 10
//
// Output: audio-scripts/SD L<orderIndex>.txt — one file per lesson, containing
// every grammar section's Dutch explanations and Indonesian examples/tables,
// verbatim. English enrichment (title_en/rules_en) and grammar_topics metadata
// are intentionally excluded; this is a Dutch-language recording script.
//
// Any unexpected content field is printed to stderr (never silently dropped) so
// the "verbatim" guarantee stays honest as content shapes drift.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local')

const supabase = createClient(url, key, { db: { schema: 'indonesian' } })

const orderIndexes = process.argv.slice(2).map(Number)
if (orderIndexes.length === 0 || orderIndexes.some((n) => !Number.isInteger(n) || n < 1)) {
  console.error('Usage: bun scripts/generate-grammar-audio-script.ts <orderIndex...>')
  process.exit(1)
}

const OUT_DIR = 'audio-scripts'
mkdirSync(OUT_DIR, { recursive: true })

// Category/section keys we knowingly handle or knowingly skip. Anything else
// triggers a stderr warning so no content is dropped without notice.
const KNOWN_SECTION_KEYS = new Set(['type', 'categories', 'grammar_topics', 'intro', 'word_order', 'examples', 'note', 'notes'])
const KNOWN_CATEGORY_KEYS = new Set([
  'title', 'rules', 'examples', 'table', 'note', 'notes',
  'title_en', 'rules_en', // English enrichment — intentionally excluded
])

type Example = { indonesian?: string; dutch?: string; note?: string }

function warn(lesson: number, msg: string): void {
  console.error(`  ! L${lesson}: ${msg}`)
}

function renderExample(ex: Example): string {
  const id = (ex.indonesian ?? '').trim()
  const nl = (ex.dutch ?? '').trim()
  const note = (ex.note ?? '').trim()
  let line = id && nl ? `${id} — ${nl}` : id || nl
  if (note) line += `  (${note})`
  return line
}

function renderTable(rows: unknown): string[] {
  const out: string[] = []
  if (!Array.isArray(rows)) return out
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    out.push(row.map((c) => String(c ?? '').trim()).join(' — '))
  }
  return out
}

function renderCategory(cat: Record<string, unknown>, lesson: number): string[] {
  const lines: string[] = []
  const title = typeof cat.title === 'string' ? cat.title.trim() : ''
  if (title) lines.push(title)

  const rules = Array.isArray(cat.rules) ? (cat.rules as unknown[]) : []
  for (const r of rules) {
    const s = String(r ?? '').trim()
    if (s) lines.push(`- ${s}`)
  }

  if (Array.isArray(cat.table) && (cat.table as unknown[]).length > 0) {
    if (lines.length > 0 && rules.length > 0) lines.push('')
    lines.push(...renderTable(cat.table))
  }

  const examples = Array.isArray(cat.examples) ? (cat.examples as Example[]) : []
  if (examples.length > 0) {
    // Skip the "Voorbeelden:" label when the category is already titled that.
    const titleIsVoorbeelden = title.toLowerCase().replace(/[:.]/g, '').trim() === 'voorbeelden'
    if (!titleIsVoorbeelden) {
      lines.push('')
      lines.push('Voorbeelden:')
    }
    for (const ex of examples) lines.push(`  ${renderExample(ex)}`)
  }

  const note = (typeof cat.note === 'string' && cat.note) || (typeof cat.notes === 'string' && cat.notes) || ''
  if (note) {
    lines.push('')
    lines.push(`Opmerking: ${note.trim()}`)
  }

  for (const k of Object.keys(cat)) {
    if (!KNOWN_CATEGORY_KEYS.has(k)) warn(lesson, `unhandled category field "${k}" in "${title}" — content NOT emitted`)
  }
  return lines
}

function renderSection(rowTitle: string, content: Record<string, unknown>, lesson: number): string[] {
  const lines: string[] = []
  const bar = '═'.repeat(Math.max(8, rowTitle.length))
  lines.push(bar, rowTitle, bar, '')

  // Top-level intro / word_order (not present in L5-10, but handled for safety)
  if (typeof content.intro === 'string' && content.intro.trim()) {
    lines.push(content.intro.trim(), '')
  }
  if (typeof content.word_order === 'string' && content.word_order.trim()) {
    lines.push(`Woordvolgorde: ${content.word_order.trim()}`, '')
  }

  const categories = Array.isArray(content.categories) ? (content.categories as Record<string, unknown>[]) : []
  categories.forEach((cat, i) => {
    lines.push(...renderCategory(cat, lesson))
    if (i < categories.length - 1) lines.push('', '')
  })

  // Top-level examples (not present in L5-10, but handled for safety)
  if (Array.isArray(content.examples) && (content.examples as Example[]).length > 0) {
    lines.push('', 'Voorbeelden:')
    for (const ex of content.examples as Example[]) lines.push(`  ${renderExample(ex)}`)
  }

  for (const k of Object.keys(content)) {
    if (!KNOWN_SECTION_KEYS.has(k)) warn(lesson, `unhandled section field "${k}" in "${rowTitle}" — content NOT emitted`)
  }
  return lines
}

for (const oi of orderIndexes) {
  const { data: lesson, error: lErr } = await supabase
    .from('lessons')
    .select('id, title, order_index')
    .eq('order_index', oi)
    .maybeSingle()
  if (lErr) throw lErr
  if (!lesson) {
    console.error(`L${oi}: no lesson found — skipped`)
    continue
  }

  const { data: secs, error: sErr } = await supabase
    .from('lesson_sections')
    .select('order_index, title, content')
    .eq('lesson_id', lesson.id)
    .order('order_index')
  if (sErr) throw sErr

  const grammar = (secs ?? []).filter((s) => (s.content as { type?: string } | null)?.type === 'grammar')

  const doc: string[] = []
  doc.push(lesson.title.trim())
  doc.push('Grammatica — opnamescript')
  doc.push('')
  doc.push('')

  grammar.forEach((s, idx) => {
    const rowTitle = (s.title ?? '').trim() || `Grammatica ${idx + 1}`
    doc.push(...renderSection(rowTitle, s.content as Record<string, unknown>, oi))
    if (idx < grammar.length - 1) doc.push('', '', '')
  })

  const fileBody = doc.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n'
  const path = `${OUT_DIR}/SD L${oi}.txt`
  writeFileSync(path, fileBody, 'utf8')
  console.log(`✓ ${path} — ${grammar.length} grammar sections, ${fileBody.split('\n').length} lines`)
}
