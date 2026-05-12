#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const sb = createClient(
  process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home',
  process.env.SUPABASE_SERVICE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_KEY required') })(),
)

const lessonId = process.argv[2]

const { data: sections, error } = await sb
  .schema('indonesian')
  .from('lesson_sections')
  .select('id, title, content, order_index')
  .eq('lesson_id', lessonId)
  .order('order_index', { ascending: true })
if (error) { console.error(error.message); process.exit(1) }

console.log(`Section content audit for lesson ${lessonId}`)
console.log('─'.repeat(80))

for (const s of (sections ?? []) as Array<{ title: string; content: Record<string, unknown>; order_index: number }>) {
  const type = s.content?.type
  console.log(`\nSection [${s.order_index}] "${s.title}" — type=${type}`)
  if (type === 'dialogue') {
    const lines = (s.content?.lines ?? []) as Array<{ text?: string; translation?: string; speaker?: string }>
    const total = lines.length
    const withTrans = lines.filter(l => l.translation && l.translation.trim().length > 0).length
    const emptyTrans = lines.filter(l => l.translation !== undefined && (!l.translation || l.translation.trim() === '')).length
    const missingTrans = lines.filter(l => l.translation === undefined).length
    console.log(`  lines: ${total}, with translation: ${withTrans}, empty: ${emptyTrans}, missing field: ${missingTrans}`)
    if (withTrans > 0) {
      const sample = lines.find(l => l.translation && l.translation.trim().length > 0)
      console.log(`  example with translation: "${sample?.text}" → "${sample?.translation}"`)
    } else {
      const sample = lines[0]
      console.log(`  example missing translation: "${sample?.text}"`)
    }
  } else if (type === 'grammar' || type === 'reference_table') {
    const gt = s.content?.grammar_topics
    console.log(`  grammar_topics: ${gt === undefined ? 'MISSING FIELD' : Array.isArray(gt) ? (gt.length === 0 ? 'EMPTY ARRAY' : JSON.stringify(gt)) : 'NOT ARRAY'}`)
    // also check structure
    const cats = (s.content?.categories ?? []) as unknown[]
    console.log(`  categories: ${Array.isArray(cats) ? cats.length : 'not array'}`)
  } else if (type === 'vocabulary' || type === 'expressions' || type === 'numbers') {
    const items = (s.content?.items ?? []) as Array<{ pos?: string; level?: string; indonesian?: string }>
    const total = items.length
    const withPos = items.filter(i => i.pos && i.pos.trim()).length
    const withLevel = items.filter(i => i.level && i.level.trim()).length
    console.log(`  items: ${total}, with pos: ${withPos}, with level: ${withLevel}`)
  } else if (type === 'exercises') {
    const sec = (s.content?.sections ?? []) as unknown[]
    console.log(`  sections: ${Array.isArray(sec) ? sec.length : 'not array'}`)
  } else if (type === 'text') {
    console.log(`  (text section — no enrichment fields tracked)`)
  }
}
