#!/usr/bin/env bun
/**
 * set-lesson-voices.ts
 *
 * Assigns primary_voice and dialogue_voices to each lesson.
 *
 * Usage:
 *   bun scripts/set-lesson-voices.ts           # update DB
 *   bun scripts/set-lesson-voices.ts --dry-run  # preview only
 *
 * The single-lesson core is exported as `setLessonVoicesForLesson` so the
 * lesson-stage audio orchestrator (scripts/lib/pipeline/lesson-stage/audio.ts)
 * can configure voices per-lesson at publish time without re-running the
 * whole CLI.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// ---------------------------------------------------------------------------
// Voice definitions
// ---------------------------------------------------------------------------

export const VOICE_ROTATION = [
  'id-ID-Chirp3-HD-Despina',  // lesson 1 (order_index=1) — female
  'id-ID-Chirp3-HD-Achird',   // lesson 2 — male
  'id-ID-Chirp3-HD-Sulafat',  // lesson 3 — female
  'id-ID-Chirp3-HD-Algenib',  // lesson 4 — male
  'id-ID-Chirp3-HD-Gacrux',   // lesson 5 — female
  'id-ID-Chirp3-HD-Orus',     // lesson 6 — male
  'id-ID-Chirp3-HD-Despina',  // lesson 7 — female (cycle restarts)
  'id-ID-Chirp3-HD-Achird',   // lesson 8 — male
]

const MALE_VOICES = ['id-ID-Chirp3-HD-Achird', 'id-ID-Chirp3-HD-Algenib', 'id-ID-Chirp3-HD-Orus']
const FEMALE_VOICES = ['id-ID-Chirp3-HD-Despina', 'id-ID-Chirp3-HD-Sulafat', 'id-ID-Chirp3-HD-Gacrux']

// ---------------------------------------------------------------------------
// Gender detection helpers
// ---------------------------------------------------------------------------

function detectGender(speaker: string): 'female' | 'male' | 'ambiguous' {
  const s = speaker.trim()

  // Skip narrator — treated separately
  if (s.toLowerCase() === 'narrator') return 'ambiguous'

  // Female honorifics / names
  if (/\b(Bu|Ibu|Mbak|Nona)\b/.test(s)) return 'female'
  if (/\b(Titin|Ninik|Dewi|Yulia|Yati)\b/i.test(s)) return 'female'

  // Male honorifics
  if (/\b(Pak|Bapak|Mas|Bang)\b/.test(s)) return 'male'

  return 'ambiguous'
}

/**
 * Pick a voice for a speaker. Avoids the primaryVoice and voices already used
 * in the dialogue. Falls back gracefully if pool is exhausted.
 */
function pickDialogueVoice(
  speaker: string,
  primaryVoice: string,
  usedVoices: Map<string, string>,
): string {
  // If we've already assigned a voice to this speaker, reuse it
  if (usedVoices.has(speaker)) return usedVoices.get(speaker)!

  const gender = detectGender(speaker)

  // Build candidate pool: preferred gender first, then opposite
  let pool: string[]
  if (gender === 'female') {
    pool = [...FEMALE_VOICES, ...MALE_VOICES]
  } else if (gender === 'male') {
    pool = [...MALE_VOICES, ...FEMALE_VOICES]
  } else {
    // Narrator or ambiguous — alternate by count of already-assigned voices
    const toggleFemale = usedVoices.size % 2 === 0
    pool = toggleFemale ? [...FEMALE_VOICES, ...MALE_VOICES] : [...MALE_VOICES, ...FEMALE_VOICES]
  }

  // Exclude primaryVoice and already-used voices from the pool
  const alreadyUsed = new Set(usedVoices.values())
  const filtered = pool.filter((v) => v !== primaryVoice && !alreadyUsed.has(v))

  // Fall back to the pool without the already-used constraint if needed
  const candidate = filtered[0] ?? pool.filter((v) => v !== primaryVoice)[0] ?? pool[0]

  usedVoices.set(speaker, candidate)
  return candidate
}

// ---------------------------------------------------------------------------
// Per-lesson core (extracted for the lesson-stage audio orchestrator)
// ---------------------------------------------------------------------------

export interface SetLessonVoicesParams {
  lessonId: string
  orderIndex: number
  supabase: SupabaseClient
  dryRun?: boolean
}

export interface LessonVoiceAssignment {
  primaryVoice: string
  dialogueVoices: Record<string, string>
}

/**
 * Compute (and optionally write) the primary_voice + dialogue_voices for a
 * single lesson. Idempotent — safe to call before every publish: the same
 * lesson always resolves to the same voices because the voice rotation is
 * deterministic on order_index and pickDialogueVoice is deterministic on
 * speaker order within the dialogue lines.
 */
export async function setLessonVoicesForLesson(
  params: SetLessonVoicesParams,
): Promise<LessonVoiceAssignment> {
  const { lessonId, orderIndex, supabase, dryRun = false } = params

  const idx = orderIndex - 1 // 0-indexed
  const primaryVoice = VOICE_ROTATION[idx % VOICE_ROTATION.length]

  // Fetch dialogue sections for THIS lesson only.
  const { data: dialogueSections, error: sectionsError } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('content')
    .eq('lesson_id', lessonId)
    .filter('content->>type', 'eq', 'dialogue')

  if (sectionsError) throw sectionsError

  // Build dialogue_voices map from all speakers across all dialogue sections.
  const dialogueVoices: Record<string, string> = {}
  const usedVoices = new Map<string, string>()
  for (const section of dialogueSections ?? []) {
    const d = section.content as { lines?: { speaker?: string }[] }
    for (const line of d.lines ?? []) {
      const speaker = line.speaker?.trim()
      if (!speaker) continue
      if (dialogueVoices[speaker]) continue // already assigned
      dialogueVoices[speaker] = pickDialogueVoice(speaker, primaryVoice, usedVoices)
    }
  }

  if (!dryRun) {
    const { error: updateError } = await supabase
      .schema('indonesian')
      .from('lessons')
      .update({
        primary_voice: primaryVoice,
        dialogue_voices: Object.keys(dialogueVoices).length > 0 ? dialogueVoices : null,
      })
      .eq('id', lessonId)
    if (updateError) throw updateError
  }

  return { primaryVoice, dialogueVoices }
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

function createSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY not set. Add it to .env.local.')
    process.exit(1)
  }

  return createClient(url, serviceKey)
}

// ---------------------------------------------------------------------------
// CLI — iterate every lesson
// ---------------------------------------------------------------------------

const isDryRun = process.argv.includes('--dry-run')

async function main() {
  const supabase = createSupabaseClient()

  const { data: lessons, error: lessonsError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index, title')
    .order('order_index')

  if (lessonsError) throw lessonsError
  if (!lessons?.length) {
    console.log('No lessons found.')
    return
  }

  console.log(isDryRun ? '--- DRY RUN (no DB changes) ---\n' : '--- Updating DB ---\n')

  for (const lesson of lessons) {
    try {
      const { primaryVoice, dialogueVoices } = await setLessonVoicesForLesson({
        lessonId: lesson.id,
        orderIndex: lesson.order_index,
        supabase,
        dryRun: isDryRun,
      })

      console.log(`Lesson ${lesson.order_index}: ${lesson.title}`)
      console.log(`  primary_voice: ${primaryVoice}`)
      if (Object.keys(dialogueVoices).length > 0) {
        console.log('  dialogue_voices:')
        for (const [speaker, voice] of Object.entries(dialogueVoices)) {
          console.log(`    "${speaker}" → ${voice}`)
        }
      } else {
        console.log('  dialogue_voices: (none)')
      }
      if (!isDryRun) console.log('  ✓ Updated')
      console.log()
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      console.error(`  ERROR updating lesson ${lesson.order_index}: ${msg}`)
    }
  }

  if (isDryRun) {
    console.log('Dry run complete — no DB changes made.')
  } else {
    console.log('All lessons updated.')
  }
}

// Only run main() when invoked as a CLI, not when imported as a module.
if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
