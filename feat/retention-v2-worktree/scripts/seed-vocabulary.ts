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

console.log('Done!')
