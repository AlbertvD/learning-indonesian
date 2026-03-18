#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { vocabulary } from './data/vocabulary'
import { lessons } from './data/lessons'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required.')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)

async function seed() {
  try {
    // 1. Find the admin user to be the owner of these public card sets
    const { data: adminRole, error: adminError } = await supabase
      .schema('indonesian')
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .single()

    if (adminError || !adminRole) {
      console.error('No admin user found. Create an admin user first via user_roles table.')
      process.exit(1)
    }
    const ownerId = adminRole.user_id
    console.log('Using admin user:', ownerId)

    for (const lesson of lessons) {
      // Get the lesson ID from the database
      const { data: lessonRow, error: lessonError } = await supabase
        .schema('indonesian')
        .from('lessons')
        .select('id')
        .eq('module_id', lesson.module_id)
        .eq('order_index', lesson.order_index)
        .single()

      if (lessonError || !lessonRow) {
        console.error(`Lesson not found: ${lesson.title}. Run seed-lessons first.`)
        continue
      }

      const setName = `${lesson.title} — Woordenschat`

      // Upsert the card set
      const { data: cardSet, error: setError } = await supabase
        .schema('indonesian')
        .from('card_sets')
        .upsert(
          {
            owner_id: ownerId,
            name: setName,
            description: `Woordenschat uit ${lesson.title}`,
            visibility: 'public',
          },
          { onConflict: 'owner_id,name' }
        )
        .select('id')
        .single()

      if (setError || !cardSet) {
        console.error('Failed to upsert card set:', setName, setError?.message)
        continue
      }
      console.log('Upserted card set:', setName)

      // Get vocabulary for this lesson
      const lessonVocab = vocabulary.filter((v) => v.lesson_order_index === lesson.order_index)

      for (const word of lessonVocab) {
        const back = word.dutch ?? word.english
        const { error: cardError } = await supabase
          .schema('indonesian')
          .from('anki_cards')
          .upsert(
            {
              card_set_id: cardSet.id,
              owner_id: ownerId,
              front: word.indonesian,
              back,
              notes: word.dutch && word.english !== word.dutch ? word.english : null,
              tags: word.tags,
            },
            { onConflict: 'card_set_id,front' }
          )
        if (cardError) {
          console.error('  Failed card:', word.indonesian, cardError.message)
        } else {
          console.log('  Upserted card:', word.indonesian, '→', back)
        }
      }
    }

    console.log('Done!')
  } catch (err) {
    console.error('Seed failed:', err)
  }
}

seed()
