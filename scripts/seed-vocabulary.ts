#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { vocabulary } from './data/vocabulary'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required.')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)

// Fetch all lessons to map order_index → id
const { data: lessonRows, error: lessonErr } = await supabase
  .schema('indonesian')
  .from('lessons')
  .select('id, order_index, module_id')

if (lessonErr) {
  console.error('Failed to fetch lessons:', lessonErr.message)
  process.exit(1)
}

const lessonMap = new Map(lessonRows.map((l) => [`${l.module_id}:${l.order_index}`, l.id]))

const { count: countBefore } = await supabase
  .schema('indonesian').from('vocabulary').select('*', { count: 'exact', head: true })
const preSeedCount = countBefore ?? 0

for (const word of vocabulary) {
  const lessonId = lessonMap.get(`${word.module_id}:${word.lesson_order_index}`) ?? null
  const { error } = await supabase
    .schema('indonesian')
    .from('vocabulary')
    .upsert(
      {
        indonesian: word.indonesian,
        english: word.english,
        dutch: word.dutch ?? null,
        example_sentence: word.example_sentence ?? null,
        lesson_id: lessonId,
        module_id: word.module_id,
        level: word.level,
        tags: word.tags,
      },
      { onConflict: 'indonesian,lesson_id' },
    )
  if (error) {
    console.error('Failed:', word.indonesian, error.message)
    continue
  }
  console.log('Upserted:', word.indonesian)
}

const { count: countAfter, error: countErr } = await supabase
  .schema('indonesian').from('vocabulary').select('*', { count: 'exact', head: true })
if (countErr) {
  console.error('Failed to verify seed count:', countErr.message)
  process.exit(1)
}
const newRows = (countAfter ?? 0) - preSeedCount
console.log(`\n✓ Done. ${newRows} new rows added (${countAfter} total in vocabulary table).`)
if (newRows < 0) {
  // Shouldn't happen — seed-vocabulary never deletes
  console.error('✗ Row count decreased — unexpected deletion occurred.')
  process.exit(1)
}
