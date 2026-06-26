// Phase 2 — build NotebookLM source briefings + per-episode job specs from a
// lesson's verified DB grammar.
//
// Usage:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/grammar-podcast/build-briefings.ts <orderIndex...>
//
// Writes, per lesson, per language (nl, en):
//   content/grammar-briefings/lesson-<N>.<lang>.md        — the NotebookLM source
//   content/grammar-briefings/lesson-<N>.<lang>.job.json  — { lesson, lang, level,
//        notebookTitle, instructionPrompt, briefingPath, topics } for generate.py

import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { buildBriefings } from './briefings'
import { instructionPrompt, notebookTitle, type Lang } from './prompts'

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
  console.error('Usage: bun scripts/grammar-podcast/build-briefings.ts <orderIndex...>')
  process.exit(1)
}

const OUT_DIR = 'content/grammar-briefings'
mkdirSync(OUT_DIR, { recursive: true })
const LANGS: Lang[] = ['nl', 'en']

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

  const meta = { lesson: oi, title: lesson.title as string, level: lesson.level as string }
  const { nl, en, topics, warnings } = buildBriefings(meta, grammar)
  const bodies: Record<Lang, string> = { nl, en }

  for (const lang of LANGS) {
    const briefingPath = `${OUT_DIR}/lesson-${oi}.${lang}.md`
    writeFileSync(briefingPath, bodies[lang], 'utf8')
    const job = {
      lesson: oi,
      lang,
      level: meta.level,
      notebookTitle: notebookTitle(meta, lang),
      instructionPrompt: instructionPrompt(meta, lang),
      briefingPath,
      topics, // the deterministic coverage checklist the output gate compares against
    }
    writeFileSync(`${OUT_DIR}/lesson-${oi}.${lang}.job.json`, JSON.stringify(job, null, 2) + '\n', 'utf8')
  }

  const warnNote = warnings.length ? ` ⚠ ${warnings.length} warning(s)` : ''
  console.log(`✓ L${oi} (${meta.level}) — ${topics.length} topics → nl+en briefings + jobs${warnNote}`)
  for (const w of warnings) console.error(`  ! ${w}`)
}
