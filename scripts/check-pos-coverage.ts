#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const sb = createClient(
  process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home',
  process.env.SUPABASE_SERVICE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_KEY required') })(),
)

const lessonId = process.argv[2]

console.log(`POS coverage check\n${'─'.repeat(70)}`)

// Overall DB state
async function cnt(label: string, filter: (q: any) => any) {
  let q = sb.schema('indonesian').from('learning_items').select('*', { count: 'exact', head: true })
  q = filter(q)
  const { count } = await q
  console.log(`${label.padEnd(60)} ${count ?? 0}`)
}

await cnt('Total learning_items (all lessons):', q => q.eq('is_active', true))
await cnt('  …with pos populated:', q => q.eq('is_active', true).not('pos', 'is', null))
await cnt('  …with pos null:', q => q.eq('is_active', true).is('pos', null))
await cnt('  …word/phrase only:', q => q.eq('is_active', true).in('item_type', ['word','phrase']))
await cnt('    …with pos populated:', q => q.eq('is_active', true).in('item_type', ['word','phrase']).not('pos', 'is', null))
await cnt('    …with pos null:', q => q.eq('is_active', true).in('item_type', ['word','phrase']).is('pos', null))

console.log('─'.repeat(70))
console.log(`Lesson ${lessonId} specifically:`)

// All learning_items linked to this lesson via anchor context
const { data: items, error } = await sb
  .schema('indonesian')
  .from('learning_items')
  .select('id, base_text, item_type, pos, item_contexts!inner(source_lesson_id, is_anchor_context)')
  .eq('item_contexts.source_lesson_id', lessonId)
  .eq('item_contexts.is_anchor_context', true)
  .eq('is_active', true)
if (error) { console.error(error.message); process.exit(1) }

const rows = (items ?? []) as Array<{ id: string; base_text: string; item_type: string; pos: string | null }>
const total = rows.length
const wordPhrase = rows.filter(r => r.item_type === 'word' || r.item_type === 'phrase')
const wordPhraseWithPos = wordPhrase.filter(r => r.pos != null && r.pos.trim() !== '')
const wordPhraseWithoutPos = wordPhrase.filter(r => r.pos == null || r.pos.trim() === '')

console.log(`Total items linked to lesson: ${total}`)
console.log(`Word/phrase items: ${wordPhrase.length}`)
console.log(`  with pos: ${wordPhraseWithPos.length}`)
console.log(`  without pos: ${wordPhraseWithoutPos.length}`)
if (wordPhraseWithoutPos.length > 0) {
  console.log(`  Examples missing pos: ${wordPhraseWithoutPos.slice(0, 8).map(r => r.base_text).join(', ')}`)
}

// POS distribution
const posDist = new Map<string, number>()
for (const r of wordPhraseWithPos) {
  const k = r.pos ?? 'null'
  posDist.set(k, (posDist.get(k) ?? 0) + 1)
}
console.log(`POS distribution for lesson:`)
for (const [pos, c] of [...posDist].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pos.padEnd(15)} ${c}`)
}
