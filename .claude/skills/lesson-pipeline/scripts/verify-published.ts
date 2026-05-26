#!/usr/bin/env bun
/**
 * verify-published.ts — independently confirm a lesson's rows landed in the
 * live DB (phase 10 post-publish verification).
 *
 * Reads back, by lesson_id, the row counts the Lesson Stage writes (the typed
 * lesson-content tables) so the publish's own LV1 parity check is corroborated
 * by an outside query.
 *
 * NOTE: audio_clips is intentionally NOT counted here — it is keyed by
 * (normalized_text, voice_id) and deduplicated ACROSS lessons, so it has no
 * lesson_id column. Audio coverage is signalled instead by the Stage A report's
 * audioClipsSynthesised/Reused counts (parse-report.ts flags 0). See SKILL.md.
 *
 * Env (auto-loaded from .env.local by bun): VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY.
 *
 * Usage:
 *   bun .../scripts/verify-published.ts <lessonId-uuid>
 * Find the lessonId in the Stage A report's `lesson.id`, or:
 *   select id from indonesian.lessons where order_index = <N>;
 */

import { createClient } from '@supabase/supabase-js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' // homelab Step-CA cert

const LESSON_ID = process.argv[2]
if (!LESSON_ID) {
  console.error('Usage: bun verify-published.ts <lessonId-uuid>')
  process.exit(2)
}
const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (in .env.local).')
  process.exit(2)
}

const sb = createClient(url, key, { db: { schema: 'indonesian' }, auth: { persistSession: false } })

const LESSON_TABLES = [
  'lesson_sections',
  'lesson_dialogue_lines',
  'lesson_section_item_rows',
  'lesson_section_grammar_categories',
  'lesson_section_grammar_topics',
  'lesson_section_affixed_pairs',
]

async function countFor(table: string): Promise<number | string> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('lesson_id', LESSON_ID)
  return error ? `ERR ${error.message}` : (count ?? 0)
}

async function main() {
  const { data: lesson, error } = await sb
    .from('lessons')
    .select('id, title, level, order_index')
    .eq('id', LESSON_ID)
    .maybeSingle()
  if (error) {
    console.error('Failed to read lessons row:', error.message)
    process.exit(1)
  }
  if (!lesson) {
    console.error(`No lessons row for id ${LESSON_ID} — was the publish run?`)
    process.exit(1)
  }
  console.log(`lesson: ${JSON.stringify(lesson)}`)
  for (const t of LESSON_TABLES) {
    console.log(`  ${t}: ${await countFor(t)}`)
  }
  console.log('  (audio_clips not lesson-scoped — see the Stage A report for audio coverage)')
  process.exit(0)
}

main()
