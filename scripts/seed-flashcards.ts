#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { vocabulary } from './data/vocabulary'
import { lessons, type LessonData } from './data/lessons'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required.')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FlashCard {
  front: string
  back: string
  notes?: string | null
  tags: string[]
}

/** Extract translation cards from all exercises sections of a lesson. */
function extractExerciseCards(lesson: LessonData): FlashCard[] {
  const tag = `lesson-${lesson.order_index}`
  const cards: FlashCard[] = []

  for (const section of lesson.sections) {
    const content = section.content as Record<string, unknown>
    if (content.type !== 'exercises') continue

    const sections = content.sections as Array<Record<string, unknown>> | undefined
    if (!sections) continue

    for (const ex of sections) {
      const items = ex.items as Array<Record<string, unknown>> | undefined
      if (!items) continue

      for (const item of items) {
        const dutch = item.dutch as string | undefined
        const indonesian = item.indonesian as string | undefined
        if (dutch && indonesian) {
          cards.push({ front: dutch, back: indonesian, tags: [tag, 'exercise'] })
        }
      }
    }
  }

  return cards
}

/** Upsert a card set and its cards. */
async function upsertCardSet(
  ownerId: string,
  name: string,
  description: string,
  cards: FlashCard[]
): Promise<void> {
  if (cards.length === 0) {
    console.log(`  Skipping "${name}" — no cards`)
    return
  }

  const { data: cardSet, error: setError } = await supabase
    .schema('indonesian')
    .from('card_sets')
    .upsert(
      { owner_id: ownerId, name, description, visibility: 'public' },
      { onConflict: 'owner_id,name' }
    )
    .select('id')
    .single()

  if (setError || !cardSet) {
    console.error(`  Failed to upsert card set "${name}":`, setError?.message)
    return
  }
  console.log(`  Upserted card set: ${name} (${cards.length} cards)`)

  for (const card of cards) {
    const { error } = await supabase
      .schema('indonesian')
      .from('anki_cards')
      .upsert(
        {
          card_set_id: cardSet.id,
          owner_id: ownerId,
          front: card.front,
          back: card.back,
          notes: card.notes ?? null,
          tags: card.tags,
        },
        { onConflict: 'card_set_id,front' }
      )
    if (error) {
      console.error(`    Failed card: "${card.front}"`, error.message)
    }
  }
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  try {
    // Find the admin user to own these public card sets
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
      // Verify the lesson exists in the DB before creating card sets for it.
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

      console.log(`\n${lesson.title}`)

      // 1. Vocabulary card set
      const lessonVocab = vocabulary.filter((v) => v.lesson_order_index === lesson.order_index)
      const vocabCards: FlashCard[] = lessonVocab.map((word) => ({
        front: word.indonesian,
        back: word.dutch ?? word.english,
        notes: word.dutch && word.english !== word.dutch ? word.english : null,
        tags: word.tags,
      }))
      await upsertCardSet(
        ownerId,
        `${lesson.title} — Woordenschat`,
        `Woordenschat uit ${lesson.title}`,
        vocabCards
      )

      // 2. Exercises card set
      const exerciseCards = extractExerciseCards(lesson)
      await upsertCardSet(
        ownerId,
        `${lesson.title} — Oefeningen`,
        `Vertaaloefeningen uit ${lesson.title}`,
        exerciseCards
      )
    }

    console.log('\nDone!')
  } catch (err) {
    console.error('Seed failed:', err)
  }
}

seed()
