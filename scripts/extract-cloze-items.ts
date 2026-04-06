// scripts/extract-cloze-items.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://api.supabase.duin.home'
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

interface ClozeItem {
  lessonNumber: number
  sentence: string
  targetWord: string
  translation_en: string
  translation_nl: string
}

const clozeItems: ClozeItem[] = [
  // Lesson 1
  {
    lessonNumber: 1,
    sentence: 'Saya ke ___.',
    targetWord: 'pasar',
    translation_en: 'I go to the market.',
    translation_nl: 'Ik ga naar de markt.'
  },
  {
    lessonNumber: 1,
    sentence: 'Saya ___ buah.',
    targetWord: 'beli',
    translation_en: 'I buy fruit.',
    translation_nl: 'Ik koop fruit.'
  },
  {
    lessonNumber: 1,
    sentence: 'Bapak mau beli ___ besar.',
    targetWord: 'rumah',
    translation_en: 'Sir wants to buy a big house.',
    translation_nl: 'Meneer wil een groot huis kopen.'
  },
  {
    lessonNumber: 1,
    sentence: 'Harganya ___ Bu.',
    targetWord: 'murah',
    translation_en: 'The price is cheap, Ma\'am.',
    translation_nl: 'De prijs is goedkoop, mevrouw.'
  },
  {
    lessonNumber: 1,
    sentence: 'Itu ___ ya!',
    targetWord: 'mahal',
    translation_en: 'That is expensive, huh!',
    translation_nl: 'Dat is duur, hoor!'
  },
  // Lesson 2
  {
    lessonNumber: 2,
    sentence: 'Nama ___ Barends.',
    targetWord: 'saya',
    translation_en: 'My name is Barends.',
    translation_nl: 'Mijn naam is Barends.'
  },
  {
    lessonNumber: 2,
    sentence: 'Di mana bisa ___ taksi?',
    targetWord: 'naik',
    translation_en: 'Where can I take a taxi?',
    translation_nl: 'Waar kan ik een taxi nemen?'
  },
  {
    lessonNumber: 2,
    sentence: 'Saya dan suami saya ___ di hotel.',
    targetWord: 'tinggal',
    translation_en: 'I and my husband stay at a hotel.',
    translation_nl: 'Ik en mijn man verblijven in een hotel.'
  },
  {
    lessonNumber: 2,
    sentence: 'Taksi sudah ___.',
    targetWord: 'datang',
    translation_en: 'The taxi has arrived.',
    translation_nl: 'De taxi is al gekomen.'
  },
  {
    lessonNumber: 2,
    sentence: 'Rumah ini ___.',
    targetWord: 'kecil',
    translation_en: 'This house is small.',
    translation_nl: 'Dit huis is klein.'
  },
  // Lesson 3
  {
    lessonNumber: 3,
    sentence: 'Di sebelah ___ atau kanan?',
    targetWord: 'kiri',
    translation_en: 'On the left or right?',
    translation_nl: 'Aan de linker- of rechterkant?'
  },
  {
    lessonNumber: 3,
    sentence: 'O, barang saya ___ sekali.',
    targetWord: 'berat',
    translation_en: 'Oh, my things are very heavy.',
    translation_nl: 'O, mijn spullen zijn erg zwaar.'
  },
  {
    lessonNumber: 3,
    sentence: 'Ada dua ___ dan satu tas besar.',
    targetWord: 'koper',
    translation_en: 'There are two suitcases and one big bag.',
    translation_nl: 'Er zijn twee koffers en één grote tas.'
  },
  {
    lessonNumber: 3,
    sentence: 'Saya menginap dulu di ___ teman.',
    targetWord: 'rumah',
    translation_en: 'I am staying at a friend\'s house first.',
    translation_nl: 'Ik logeer eerst in het huis van een vriend.'
  },
  {
    lessonNumber: 3,
    sentence: 'Besok saya mau cari ___.',
    targetWord: 'hotel',
    translation_en: 'Tomorrow I want to look for a hotel.',
    translation_nl: 'Morgen wil ik een hotel zoeken.'
  },
  {
    lessonNumber: 3,
    sentence: 'Minta ___, Pak.',
    targetWord: 'tolong',
    translation_en: 'Help me, please, Sir.',
    translation_nl: 'Kunt u me helpen, meneer?'
  },
  {
    lessonNumber: 3,
    sentence: 'Koper saya penuh ___.',
    targetWord: 'pakaian',
    translation_en: 'My suitcase is full of clothes.',
    translation_nl: 'Mijn koffer zit vol kleding.'
  },
  {
    lessonNumber: 3,
    sentence: 'Di mana ada ___, ya Pak?',
    targetWord: 'taksi',
    translation_en: 'Where is there a taxi, Sir?',
    translation_nl: 'Waar is er een taxi, meneer?'
  },
  {
    lessonNumber: 3,
    sentence: 'Ibu mau ___ di kota?',
    targetWord: 'ke mana',
    translation_en: 'Where do you want to go in the city, Ma\'am?',
    translation_nl: 'Waarheen wilt u in de stad, mevrouw?'
  },
  {
    lessonNumber: 3,
    sentence: 'Di sini ___ ada \'kan?',
    targetWord: 'tidak',
    translation_en: 'It\'s not here, is it?',
    translation_nl: 'Het is hier niet, toch?'
  }
]

async function seedClozeItems() {
  console.log('🌱 Seeding cloze items for Lessons 1, 2, and 3...')

  // Resolve lesson order_index → UUID dynamically so this script works regardless
  // of which UUIDs the DB assigned on creation.
  const { data: lessons, error: lessonsError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index')
  if (lessonsError || !lessons) {
    console.error('❌ Failed to fetch lessons:', lessonsError?.message)
    process.exit(1)
  }
  const LESSON_IDS: Record<number, string> = {}
  for (const lesson of lessons) {
    LESSON_IDS[lesson.order_index] = lesson.id
  }
  console.log(`   Lesson map: ${Object.entries(LESSON_IDS).map(([k, v]) => `${k}→${v.slice(0, 8)}…`).join(', ')}`)

  for (const item of clozeItems) {
    const baseText = item.sentence.replace('___', item.targetWord)
    const normalizedText = baseText.toLowerCase().replace(/[?!.,;:'"]/g, '').trim()
    const lessonId = LESSON_IDS[item.lessonNumber]
    if (!lessonId) {
      console.warn(`   ⚠️  No lesson in DB for order_index ${item.lessonNumber} ("${item.sentence}") — skipped`)
      continue
    }

    // 1. Create learning_item
    const { data: learningItem, error: itemErr } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .upsert({
        item_type: 'sentence',
        base_text: baseText,
        normalized_text: normalizedText,
        language: 'id',
        level: 'A1',
        source_type: 'lesson',
        is_active: true
      }, { onConflict: 'normalized_text,item_type' })
      .select()
      .single()

    if (itemErr) {
      console.error(`   ❌ Error for "${baseText}":`, itemErr.message)
      continue
    }

    // 2. Create meanings
    await supabase.schema('indonesian').from('item_meanings').upsert([
      {
        learning_item_id: learningItem.id,
        translation_language: 'en',
        translation_text: item.translation_en,
        is_primary: true
      },
      {
        learning_item_id: learningItem.id,
        translation_language: 'nl',
        translation_text: item.translation_nl,
        is_primary: true
      }
    ], { onConflict: 'learning_item_id,translation_language' })

    // 3. Create context (cloze type)
    await supabase.schema('indonesian').from('item_contexts').upsert({
      learning_item_id: learningItem.id,
      context_type: 'cloze',
      source_text: item.sentence,
      translation_text: item.translation_nl,
      is_anchor_context: true,
      source_lesson_id: lessonId
    }, { onConflict: 'learning_item_id,context_type' })

    console.log(`   ✅ Added cloze (L${item.lessonNumber}): ${item.sentence} (target: ${item.targetWord})`)
  }

  console.log('✨ Done!')
}

seedClozeItems()
