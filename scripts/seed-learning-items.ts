// Seed learning items from vocabulary data
// Uses upsert — never touches learner progress tables (learner_item_state,
// learner_skill_state, review_events). Safe to re-run at any time.
import { createClient } from '@supabase/supabase-js'
import { vocabulary } from './data/vocabulary'

const supabaseUrl = 'https://api.supabase.duin.home'
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[?!.,;:'"]/g, '').trim()
}

function determineItemType(item: typeof vocabulary[0]): string {
  if (item.tags.includes('expression') || item.indonesian.includes(' ')) {
    return 'phrase'
  }
  return 'word'
}

async function seedLearningItems() {
  console.log('🌱 Seeding learning items from vocabulary...')
  console.log(`   Found ${vocabulary.length} vocabulary items`)
  console.log('   Using upsert — learner progress is preserved')

  // Build order_index → UUID map dynamically from DB so this script works
  // regardless of how many lessons exist.
  const { data: lessons, error: lessonsError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index')
  if (lessonsError || !lessons) {
    console.error('❌ Failed to fetch lessons:', lessonsError?.message)
    process.exit(1)
  }
  const lessonIds: Record<number, string> = {}
  for (const lesson of lessons) {
    lessonIds[lesson.order_index] = lesson.id
  }
  console.log(`   Lesson map: ${Object.entries(lessonIds).map(([k, v]) => `${k}→${v.slice(0, 8)}…`).join(', ')}`)

  let created = 0
  let skipped = 0
  let meaningErrors = 0

  for (const vocab of vocabulary) {
    const normalizedText = normalizeText(vocab.indonesian)
    const itemType = determineItemType(vocab)
    const lessonId = lessonIds[vocab.lesson_order_index]
    if (!lessonId) {
      console.warn(`   ⚠️  No lesson in DB for order_index ${vocab.lesson_order_index} ("${vocab.indonesian}") — skipped`)
      skipped++
      continue
    }

    // Upsert learning_item on (normalized_text, item_type)
    const { data: item, error: itemError } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .upsert(
        {
          item_type: itemType,
          base_text: vocab.indonesian,
          normalized_text: normalizedText,
          language: 'id',
          level: vocab.level,
          source_type: 'lesson',
          is_active: true,
        },
        { onConflict: 'normalized_text,item_type' }
      )
      .select('id')
      .single()

    if (itemError || !item) {
      console.error(`   ❌ Error upserting "${vocab.indonesian}":`, itemError?.message)
      skipped++
      continue
    }

    const itemId = item.id

    // Delete and re-insert meanings + variants + context for this item
    // (safe — these have no learner FK dependencies)
    await supabase.schema('indonesian').from('item_meanings').delete().eq('learning_item_id', itemId)
    await supabase.schema('indonesian').from('item_answer_variants').delete().eq('learning_item_id', itemId)
    await supabase.schema('indonesian').from('item_contexts').delete().eq('learning_item_id', itemId)

    // Insert English meaning
    const { error: enErr } = await supabase
      .schema('indonesian')
      .from('item_meanings')
      .insert({
        learning_item_id: itemId,
        translation_language: 'en',
        translation_text: vocab.english,
        is_primary: true,
      })
    if (enErr) {
      console.error(`   ❌ Meaning (en) for "${vocab.indonesian}":`, enErr.message)
      meaningErrors++
      // Do NOT `continue` here — the old meanings were already deleted above.
      // Continuing to insert variants and context prevents an orphaned learning_item.
      // The item will be usable for NL users but invisible to EN users until fixed.
    }

    // Insert Dutch meaning if available
    if (vocab.dutch) {
      const { error: nlErr } = await supabase
        .schema('indonesian')
        .from('item_meanings')
        .insert({
          learning_item_id: itemId,
          translation_language: 'nl',
          translation_text: vocab.dutch,
          is_primary: true,
        })
      if (nlErr) {
        console.error(`   ❌ Meaning (nl) for "${vocab.indonesian}":`, nlErr.message)
        meaningErrors++
        // Do NOT `continue` — see comment above.
      }
    }

    // Indonesian answer variants
    const idVariants = new Set<string>()
    idVariants.add(normalizedText)
    if (vocab.indonesian.includes('?')) {
      idVariants.add(vocab.indonesian.replace('?', '').trim().toLowerCase())
    }

    for (const variant of idVariants) {
      await supabase.schema('indonesian').from('item_answer_variants').insert({
        learning_item_id: itemId,
        variant_text: variant,
        variant_type: 'alternative_translation',
        language: 'id',
        is_accepted: true,
      })
    }

    // English answer variants
    const enVariants = new Set<string>()
    enVariants.add(vocab.english.toLowerCase().trim())
    if (vocab.english.includes('/')) {
      for (const part of vocab.english.split('/')) {
        enVariants.add(part.trim().toLowerCase())
      }
    }

    for (const variant of enVariants) {
      await supabase.schema('indonesian').from('item_answer_variants').insert({
        learning_item_id: itemId,
        variant_text: variant,
        variant_type: 'alternative_translation',
        language: 'en',
        is_accepted: true,
      })
    }

    // Dutch answer variants
    if (vocab.dutch) {
      const nlVariants = new Set<string>()
      nlVariants.add(vocab.dutch.toLowerCase().trim())
      if (vocab.dutch.includes('/')) {
        for (const part of vocab.dutch.split('/')) {
          nlVariants.add(part.trim().toLowerCase())
        }
      }

      for (const variant of nlVariants) {
        await supabase.schema('indonesian').from('item_answer_variants').insert({
          learning_item_id: itemId,
          variant_text: variant,
          variant_type: 'alternative_translation',
          language: 'nl',
          is_accepted: true,
        })
      }
    }

    // Lesson context (associates item with its lesson)
    await supabase.schema('indonesian').from('item_contexts').insert({
      learning_item_id: itemId,
      context_type: 'lesson_snippet',
      source_text: vocab.indonesian,
      topic_tag: vocab.tags[0] ?? null,
      is_anchor_context: true,
      source_lesson_id: lessonId,
    })

    created++
  }

  console.log(`\n✅ Seeding complete: ${created} items upserted, ${skipped} skipped`)
  if (meaningErrors > 0) {
    console.error(`\n✗ ${meaningErrors} meaning insert(s) failed. Items were seeded but may be missing NL or EN translations.`)
    process.exit(1)
  }

  // Verify counts
  const { count: itemCount } = await supabase.schema('indonesian').from('learning_items').select('*', { count: 'exact', head: true })
  const { count: meaningCount } = await supabase.schema('indonesian').from('item_meanings').select('*', { count: 'exact', head: true })
  const { count: variantCount } = await supabase.schema('indonesian').from('item_answer_variants').select('*', { count: 'exact', head: true })
  const { count: contextCount } = await supabase.schema('indonesian').from('item_contexts').select('*', { count: 'exact', head: true })

  console.log(`   learning_items: ${itemCount}`)
  console.log(`   item_meanings: ${meaningCount}`)
  console.log(`   item_answer_variants: ${variantCount}`)
  console.log(`   item_contexts: ${contextCount}`)
}

seedLearningItems().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
