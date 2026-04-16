#!/usr/bin/env bun
/**
 * generate-exercise-audio.ts
 *
 * Post-publish script that generates TTS audio clips for all Indonesian texts
 * associated with a lesson: learning items, exercise variant payloads, and
 * lesson section content.
 *
 * Usage:
 *   bun scripts/generate-exercise-audio.ts <lesson-number> [--dry-run]
 *   Requires SUPABASE_SERVICE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { normalizeTtsText } from './lib/tts-normalize'
import { synthesizeSpeech } from './lib/tts-client'
import { buildStoragePath } from './lib/tts-storage'

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// ---------------------------------------------------------------------------
// Supabase Client
// ---------------------------------------------------------------------------

function createSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY environment variable not set')
    console.error('Add it to .env.local: SUPABASE_SERVICE_KEY=<your-key>')
    process.exit(1)
  }

  return createClient(url, serviceKey)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TextEntry {
  text: string
  voiceId: string
  normalizedText: string
  source: string // for dry-run reporting
}

// ---------------------------------------------------------------------------
// Text Extraction Helpers
// ---------------------------------------------------------------------------

function collectFromLearningItems(items: any[], primaryVoice: string): TextEntry[] {
  const entries: TextEntry[] = []
  for (const item of items) {
    const text = item.base_text
    if (text?.trim()) {
      entries.push({
        text: text.trim(),
        voiceId: primaryVoice,
        normalizedText: normalizeTtsText(text),
        source: 'learning_item',
      })
    }
  }
  return entries
}

function collectFromExerciseVariants(variants: any[], primaryVoice: string): TextEntry[] {
  const entries: TextEntry[] = []

  for (const variant of variants) {
    const payload = variant.payload_json
    if (!payload) continue
    const type = variant.exercise_type as string

    const addText = (text: string | undefined | null, source: string) => {
      if (!text?.trim()) return
      entries.push({
        text: text.trim(),
        voiceId: primaryVoice,
        normalizedText: normalizeTtsText(text),
        source: `exercise_variant(${type}):${source}`,
      })
    }

    if (type === 'cloze_mcq') {
      // sentence with blank filled in
      if (payload.sentence && payload.correctOptionId) {
        const filled = (payload.sentence as string).replace('___', payload.correctOptionId)
        addText(filled, 'sentence_filled')
      }
      // all options
      if (Array.isArray(payload.options)) {
        for (const option of payload.options) {
          const optText = typeof option === 'string' ? option : option?.text ?? option?.id
          addText(optText, 'option')
        }
      }
    } else if (type === 'contrast_pair') {
      if (Array.isArray(payload.options)) {
        for (const option of payload.options) {
          addText(option?.text, 'option')
        }
      }
    } else if (type === 'sentence_transformation') {
      addText(payload.sourceSentence, 'sourceSentence')
      if (Array.isArray(payload.acceptableAnswers)) {
        for (const answer of payload.acceptableAnswers) {
          addText(answer, 'acceptableAnswer')
        }
      }
    } else if (type === 'constrained_translation') {
      if (Array.isArray(payload.acceptableAnswers)) {
        for (const answer of payload.acceptableAnswers) {
          addText(answer, 'acceptableAnswer')
        }
      }
    }
  }

  return entries
}

function collectFromLessonSections(
  sections: any[],
  primaryVoice: string,
  dialogueVoices: Record<string, string>
): TextEntry[] {
  const entries: TextEntry[] = []

  for (const section of sections) {
    const content = section.content
    if (!content) continue
    const type = content.type as string

    const addText = (text: string | undefined | null, voiceId: string, source: string) => {
      if (!text?.trim()) return
      entries.push({
        text: text.trim(),
        voiceId,
        normalizedText: normalizeTtsText(text),
        source: `section(${type}):${source}`,
      })
    }

    if (type === 'dialogue') {
      if (Array.isArray(content.lines)) {
        for (const line of content.lines) {
          const speaker = line.speaker as string | undefined
          const voice =
            speaker && dialogueVoices[speaker]
              ? dialogueVoices[speaker]
              : primaryVoice
          addText(line.text, voice, `line[${speaker ?? 'unknown'}]`)
        }
      }
    } else if (type === 'vocabulary' || type === 'expressions') {
      if (Array.isArray(content.items)) {
        for (const item of content.items) {
          const text = item.indonesian ?? item.base_text ?? item.text
          addText(text, primaryVoice, 'item')
        }
      }
    } else if (type === 'numbers') {
      if (Array.isArray(content.items)) {
        for (const item of content.items) {
          const text = item.indonesian ?? item.text
          addText(text, primaryVoice, 'item')
        }
      }
    } else if (type === 'grammar') {
      if (Array.isArray(content.categories)) {
        for (const category of content.categories) {
          if (Array.isArray(category.rules)) {
            for (const rule of category.rules) {
              addText(rule.example, primaryVoice, 'rule.example')
            }
          }
        }
      }
    } else if (type === 'pronunciation') {
      if (Array.isArray(content.letters)) {
        for (const letter of content.letters) {
          if (Array.isArray(letter.examples)) {
            for (const example of letter.examples) {
              if (typeof example === 'string') {
                addText(example, primaryVoice, 'letter.example')
              } else if (example && typeof example === 'object') {
                const text = example.indonesian ?? example.text
                addText(text, primaryVoice, 'letter.example')
              }
            }
          }
        }
      }
    }
  }

  return entries
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateEntries(entries: TextEntry[]): Map<string, TextEntry> {
  // Key: normalizedText + '|' + voiceId — one clip per unique (text, voice) pair
  const map = new Map<string, TextEntry>()
  for (const entry of entries) {
    const key = `${entry.normalizedText}|${entry.voiceId}`
    if (!map.has(key)) {
      map.set(key, entry)
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Main Logic
// ---------------------------------------------------------------------------

async function generateAudio(lessonNumber: number, dryRun: boolean) {
  const supabase = createSupabaseClient()

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Generating exercise audio for lesson ${lessonNumber}...`)

  // 1. Find lesson
  const { data: lesson, error: lessonError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, title, primary_voice, dialogue_voices')
    .eq('order_index', lessonNumber)
    .maybeSingle()

  if (lessonError) throw lessonError
  if (!lesson) {
    console.error(`Error: Lesson with order_index=${lessonNumber} not found`)
    process.exit(1)
  }

  const primaryVoice = lesson.primary_voice as string | null
  const dialogueVoices = (lesson.dialogue_voices ?? {}) as Record<string, string>

  console.log(`   Lesson: "${lesson.title}" (id: ${lesson.id})`)
  console.log(`   Primary voice: ${primaryVoice ?? '(none — will skip voice-dependent texts)'}`)
  console.log(`   Dialogue voices: ${JSON.stringify(dialogueVoices)}`)

  if (!primaryVoice) {
    if (dryRun) {
      console.warn('   Warning: lesson.primary_voice is not set. Dry-run will use placeholder voice "id-ID-Chirp3-HD-Achird" for inventory.')
    } else {
      console.error('Error: lesson.primary_voice is not set. Set it before generating audio.')
      process.exit(1)
    }
  }

  const resolvedPrimaryVoice = primaryVoice ?? 'id-ID-Chirp3-HD-Achird'

  // 2. Fetch all data in parallel
  const [learningItemsResult, exerciseVariantsResult, sectionsResult] = await Promise.all([
    // a) Learning items via item_contexts
    supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('learning_items(base_text)')
      .eq('source_lesson_id', lesson.id),

    // b) Exercise variants
    supabase
      .schema('indonesian')
      .from('exercise_variants')
      .select('exercise_type, payload_json')
      .eq('lesson_id', lesson.id),

    // c) Lesson sections
    supabase
      .schema('indonesian')
      .from('lesson_sections')
      .select('content')
      .eq('lesson_id', lesson.id),
  ])

  if (learningItemsResult.error) throw learningItemsResult.error
  if (exerciseVariantsResult.error) throw exerciseVariantsResult.error
  if (sectionsResult.error) throw sectionsResult.error

  // Flatten learning items (join returns nested objects)
  const learningItems = (learningItemsResult.data ?? [])
    .map((row: any) => row.learning_items)
    .filter(Boolean)

  const exerciseVariants = exerciseVariantsResult.data ?? []
  const sections = sectionsResult.data ?? []

  console.log(`\n   Source counts: ${learningItems.length} learning items, ${exerciseVariants.length} exercise variants, ${sections.length} sections`)

  // 3. Collect all texts
  const allEntries: TextEntry[] = [
    ...collectFromLearningItems(learningItems, resolvedPrimaryVoice),
    ...collectFromExerciseVariants(exerciseVariants, resolvedPrimaryVoice),
    ...collectFromLessonSections(sections, resolvedPrimaryVoice, dialogueVoices),
  ]

  // 4. Deduplicate
  const uniqueMap = deduplicateEntries(allEntries)
  console.log(`   Total texts found: ${allEntries.length}, unique (text+voice) pairs: ${uniqueMap.size}`)

  // Voice breakdown
  const voiceCounts = new Map<string, number>()
  for (const entry of uniqueMap.values()) {
    voiceCounts.set(entry.voiceId, (voiceCounts.get(entry.voiceId) ?? 0) + 1)
  }
  for (const [voice, count] of voiceCounts) {
    console.log(`     ${voice}: ${count} clips`)
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Texts that would be synthesized:')
    for (const [key, entry] of uniqueMap) {
      console.log(`  [${entry.voiceId.split('-').pop()}] "${entry.text}" (source: ${entry.source})`)
    }
    console.log(`\n[DRY RUN] Summary: ${uniqueMap.size} clips would be generated (skipping existing check in dry-run)`)
    return
  }

  // 5. Check existing clips
  const normalizedTexts = [...uniqueMap.keys()].map(k => k.split('|')[0])
  const existingNormalized = new Set<string>()

  // Chunk to avoid Kong buffer overflow
  const CHUNK_SIZE = 20
  const uniqueEntries = [...uniqueMap.entries()]
  for (let i = 0; i < uniqueEntries.length; i += CHUNK_SIZE) {
    const chunk = uniqueEntries.slice(i, i + CHUNK_SIZE)
    const chunkTexts = chunk.map(([k]) => k.split('|')[0])
    const chunkVoices = chunk.map(([k]) => k.split('|')[1])
    // Build OR filter — one condition per (normalized_text, voice_id) pair
    const filters = chunk.map(([k]) => {
      const [norm, voice] = k.split('|')
      return `and(normalized_text.eq.${norm},voice_id.eq.${voice})`
    })
    const { data: existing } = await supabase
      .schema('indonesian')
      .from('audio_clips')
      .select('normalized_text, voice_id')
      .or(filters.join(','))
    for (const row of existing ?? []) {
      existingNormalized.add(`${row.normalized_text}|${row.voice_id}`)
    }
  }

  const toGenerate = uniqueEntries.filter(([key]) => !existingNormalized.has(key))
  console.log(`\n   Already existed: ${existingNormalized.size}, to generate: ${toGenerate.length}`)

  // 6. Generate missing clips
  let generated = 0
  let failed = 0

  for (const [key, entry] of toGenerate) {
    try {
      // Rate limit: 100ms between calls
      if (generated > 0) await new Promise(res => setTimeout(res, 100))

      const audioBuffer = await synthesizeSpeech(entry.text, entry.voiceId)
      const storagePath = buildStoragePath(entry.text, entry.voiceId)

      // Upload to storage
      const { error: uploadError } = await supabase
        .storage
        .from('indonesian-tts')
        .upload(storagePath, audioBuffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        })

      if (uploadError) throw uploadError

      // Insert into audio_clips
      const { error: insertError } = await supabase
        .schema('indonesian')
        .from('audio_clips')
        .insert({
          text_content: entry.text,
          normalized_text: entry.normalizedText,
          voice_id: entry.voiceId,
          storage_path: storagePath,
          generated_for_lesson_id: lesson.id,
        })

      if (insertError) throw insertError

      generated++
      process.stdout.write(`\r   Generated: ${generated}/${toGenerate.length}`)
    } catch (err) {
      failed++
      console.error(`\n   Failed to generate clip for "${entry.text}" (${entry.voiceId}): ${err}`)
    }
  }

  if (toGenerate.length > 0) console.log() // newline after progress

  // 7. Summary
  console.log(`\n--- Summary ---`)
  console.log(`  Total unique texts:  ${uniqueMap.size}`)
  console.log(`  Already existed:     ${existingNormalized.size}`)
  console.log(`  Generated:           ${generated}`)
  console.log(`  Failed:              ${failed}`)

  if (failed > 0) {
    console.error(`\nCompleted with ${failed} failure(s).`)
    process.exit(1)
  }

  console.log(`\nDone.`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/generate-exercise-audio.ts <lesson-number> [--dry-run]')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')

  try {
    await generateAudio(lessonNumber, dryRun)
  } catch (err) {
    console.error('\nFatal error:', err)
    process.exit(1)
  }
}

main()
