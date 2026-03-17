#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { lessons } from './data/lessons'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required. Run: make seed-lessons SUPABASE_SERVICE_KEY=<key>')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)

for (const lesson of lessons) {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .upsert(
      {
        module_id: lesson.module_id,
        level: lesson.level,
        title: lesson.title,
        description: lesson.description,
        order_index: lesson.order_index,
      },
      { onConflict: 'module_id,order_index' },
    )
    .select('id')
    .single()
  if (error) {
    console.error('Failed lesson:', lesson.title, error.message)
    continue
  }
  console.log('Upserted lesson:', lesson.title, data.id)

  for (const section of lesson.sections) {
    const { error: sectionError } = await supabase
      .schema('indonesian')
      .from('lesson_sections')
      .upsert(
        {
          lesson_id: data.id,
          title: section.title,
          content: section.content,
          order_index: section.order_index,
        },
        { onConflict: 'lesson_id,order_index' },
      )
    if (sectionError) {
      console.error('  Section failed:', section.title, sectionError.message)
      continue
    }
    console.log('  Upserted section:', section.title)
  }
}

console.log('Done!')
