// Phase 0 — grammar verification (input gate): extract a lesson's verifiable
// grammar claims from the live DB and write them to
// content/grammar-review/lesson-<N>.claims.json (gitignored). A web-enabled agent
// then cross-checks each claim against TBBBI + KBBI and a report is built with
// crossCheckReport.buildReport.
//
// Usage:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/grammar-podcast/extract-grammar-claims.ts <orderIndex...>
//
// Reads the same grammar source as generate-grammar-audio-script.ts: lesson_sections
// whose content.type === 'grammar'.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { extractGrammarClaims } from './grammarClaims'

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
  console.error('Usage: bun scripts/grammar-podcast/extract-grammar-claims.ts <orderIndex...>')
  process.exit(1)
}

const OUT_DIR = 'content/grammar-review'
mkdirSync(OUT_DIR, { recursive: true })

for (const oi of orderIndexes) {
  const { data: lesson, error: lErr } = await supabase
    .from('lessons')
    .select('id, title, order_index, level')
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

  const grammar = (secs ?? [])
    .filter((s) => (s.content as { type?: string } | null)?.type === 'grammar')
    .map((s) => ({ title: s.title as string | null, content: s.content as Record<string, unknown> }))

  const { claims, warnings } = extractGrammarClaims(oi, grammar)

  const out = {
    lesson: oi,
    title: lesson.title,
    level: lesson.level, // CEFR level — the verification must not escalate it
    grammarSections: grammar.length,
    claimCount: claims.length,
    claims,
    warnings,
  }
  const path = `${OUT_DIR}/lesson-${oi}.claims.json`
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n', 'utf8')
  const warnNote = warnings.length ? ` ⚠ ${warnings.length} warning(s)` : ''
  console.log(`✓ ${path} — ${claims.length} claims from ${grammar.length} grammar sections (${lesson.level})${warnNote}`)
  for (const w of warnings) console.error(`  ! ${w}`)
}
