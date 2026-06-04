#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const lessonId = process.argv[2]
const lessonNumber = process.argv[3]
if (!lessonId || !lessonNumber) {
  console.error('Usage: bun scripts/check-lesson-coverage.ts <lesson-uuid> <lesson-number>')
  process.exit(1)
}

const sb = createClient(
  process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home',
  process.env.SUPABASE_SERVICE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_KEY required') })(),
)

const lessonSourceRef = `lesson-${lessonNumber}`

async function cnt(label: string, q: Promise<{ count: number | null; error: unknown }>): Promise<void> {
  const { count, error } = await q
  console.log(`${label.padEnd(50)} ${error ? 'ERR ' + (error as Error).message : String(count ?? 0)}`)
}

console.log(`Lesson ${lessonNumber} (id=${lessonId})`)
console.log('─'.repeat(70))

await cnt('content_units (any source_ref incl lesson-4):', sb.schema('indonesian')
  .from('content_units').select('*', { count: 'exact', head: true })
  .ilike('source_ref', `%${lessonSourceRef}%`))

await cnt('  …by unit_kind = lesson_section:', sb.schema('indonesian')
  .from('content_units').select('*', { count: 'exact', head: true })
  .ilike('source_ref', `%${lessonSourceRef}%`).eq('unit_kind', 'lesson_section'))
await cnt('  …by unit_kind = learning_item:', sb.schema('indonesian')
  .from('content_units').select('*', { count: 'exact', head: true })
  .ilike('source_ref', `%${lessonSourceRef}%`).eq('unit_kind', 'learning_item'))
await cnt('  …by unit_kind = grammar_pattern:', sb.schema('indonesian')
  .from('content_units').select('*', { count: 'exact', head: true })
  .ilike('source_ref', `%${lessonSourceRef}%`).eq('unit_kind', 'grammar_pattern'))
await cnt('  …by unit_kind = affixed_form_pair:', sb.schema('indonesian')
  .from('content_units').select('*', { count: 'exact', head: true })
  .ilike('source_ref', `%${lessonSourceRef}%`).eq('unit_kind', 'affixed_form_pair'))

// learning_item content_units may use source_ref `learning_items/<slug>` not `lesson-4`
await cnt('content_units (learning_items source_ref):', sb.schema('indonesian')
  .from('content_units').select('*', { count: 'exact', head: true })
  .eq('unit_kind', 'learning_item'))

console.log('─'.repeat(70))
await cnt('learning_capabilities (all kinds, active+retired):', sb.schema('indonesian')
  .from('learning_capabilities').select('*', { count: 'exact', head: true }))
await cnt('  …retired (retired_at IS NOT NULL):', sb.schema('indonesian')
  .from('learning_capabilities').select('*', { count: 'exact', head: true }).not('retired_at', 'is', null))
await cnt('  …source_kind = item:', sb.schema('indonesian')
  .from('learning_capabilities').select('*', { count: 'exact', head: true }).eq('source_kind', 'item'))
await cnt('  …source_kind = pattern:', sb.schema('indonesian')
  .from('learning_capabilities').select('*', { count: 'exact', head: true }).eq('source_kind', 'pattern'))
await cnt('  …source_kind = dialogue_line:', sb.schema('indonesian')
  .from('learning_capabilities').select('*', { count: 'exact', head: true }).eq('source_kind', 'dialogue_line'))
await cnt('  …source_kind = affixed_form_pair:', sb.schema('indonesian')
  .from('learning_capabilities').select('*', { count: 'exact', head: true }).eq('source_kind', 'affixed_form_pair'))

console.log('─'.repeat(70))
// capability_content_units
await cnt('capability_content_units (junction):', sb.schema('indonesian')
  .from('capability_content_units').select('*', { count: 'exact', head: true }))

// exercise_variants — break down by routing
await cnt('exercise_variants (lesson_id grammar):', sb.schema('indonesian')
  .from('exercise_variants').select('*', { count: 'exact', head: true })
  .eq('lesson_id', lessonId))

// projection_version distribution
console.log('─'.repeat(70))
console.log('learning_capabilities projection_version distribution:')
const { data: versions } = await sb.schema('indonesian')
  .from('learning_capabilities').select('projection_version')
const counts = new Map<string, number>()
for (const v of (versions ?? []) as Array<{ projection_version: string }>) {
  counts.set(v.projection_version, (counts.get(v.projection_version) ?? 0) + 1)
}
for (const [v, c] of counts) console.log(`  ${v}: ${c}`)
