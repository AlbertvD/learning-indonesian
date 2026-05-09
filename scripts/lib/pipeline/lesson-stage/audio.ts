import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeTtsText } from '../../tts-normalize'
import { synthesizeSpeech } from '../../tts-client'
import { buildStoragePath } from '../../tts-storage'
import { setLessonVoicesForLesson } from '../../../set-lesson-voices'

export interface EnsureLessonAudioInput {
  lessonId: string
  orderIndex: number
  texts: ReadonlyArray<{ text: string; voiceId: string }>
  audioBudget: number
  supabase: SupabaseClient
  dryRun?: boolean
  /**
   * Optional override for the synthesizer — defaults to the Cloud TTS client.
   * Lets tests stub the TTS call without going to the network.
   */
  synthesizer?: (text: string, voiceId: string) => Promise<Buffer>
}

export interface EnsureLessonAudioResult {
  synthesised: number
  reused: number
}

/**
 * Per-text TTS synthesis for the lesson-stage runner. Modelled on the proven
 * pattern at `scripts/generate-exercise-audio.ts:330–385`:
 *   1. Apply voice configuration to the lesson row (primary_voice +
 *      dialogue_voices) via setLessonVoicesForLesson.
 *   2. Dedup against existing `audio_clips` rows for the (text, voice) pairs.
 *   3. Budget cap: throw if missing.length exceeds audioBudget.
 *   4. For each missing entry: synthesize via Cloud TTS → upload to the
 *      `indonesian-tts` bucket → insert a row into `audio_clips`.
 *
 * Audio synthesis is non-fatal in the publish pipeline — the runner reports
 * the synthesised + reused counts; failures throw so the runner can decide
 * whether to fail the publish or continue.
 */
export async function ensureLessonAudio(
  input: EnsureLessonAudioInput,
): Promise<EnsureLessonAudioResult> {
  // 1. Voice configuration first — `dialogue_voices` must be set BEFORE the
  //    runner asks for per-line audio so the (text, voice) keys are valid.
  await setLessonVoicesForLesson({
    lessonId: input.lessonId,
    orderIndex: input.orderIndex,
    supabase: input.supabase,
    dryRun: input.dryRun ?? false,
  })

  return synthesiseLessonPageTexts(input)
}

async function synthesiseLessonPageTexts(
  input: EnsureLessonAudioInput,
): Promise<EnsureLessonAudioResult> {
  const { lessonId, texts, audioBudget, supabase, dryRun = false } = input

  if (texts.length === 0) {
    return { synthesised: 0, reused: 0 }
  }

  // Build (normalizedText, voiceId) keys — same shape generate-exercise-audio.ts
  // uses, for parity with the existing dedup query.
  const uniqueByKey = new Map<string, { text: string; voiceId: string; normalizedText: string }>()
  for (const { text, voiceId } of texts) {
    const trimmed = text.trim()
    if (!trimmed) continue
    const normalized = normalizeTtsText(text)
    const key = `${normalized}|${voiceId}`
    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, { text: trimmed, voiceId, normalizedText: normalized })
    }
  }

  if (uniqueByKey.size === 0) {
    return { synthesised: 0, reused: 0 }
  }

  // 2. Dedup against existing rows.
  const allNormalizedTexts = [...new Set([...uniqueByKey.values()].map((e) => e.normalizedText))]
  const allVoiceIds = [...new Set([...uniqueByKey.values()].map((e) => e.voiceId))]

  const existingKeys = new Set<string>()
  const { data: existing, error: existingError } = await supabase
    .schema('indonesian')
    .rpc('get_audio_clips', { p_texts: allNormalizedTexts, p_voice_ids: allVoiceIds })
  if (existingError) throw existingError
  for (const row of (existing ?? []) as Array<{ normalized_text: string; voice_id: string }>) {
    existingKeys.add(`${row.normalized_text}|${row.voice_id}`)
  }

  const toGenerate = [...uniqueByKey.entries()]
    .filter(([key]) => !existingKeys.has(key))
    .map(([, entry]) => entry)
  const reused = uniqueByKey.size - toGenerate.length

  if (dryRun) {
    return { synthesised: 0, reused }
  }

  // 3. Budget cap — fail rather than rack up unbounded TTS cost.
  if (toGenerate.length > audioBudget) {
    throw new Error(
      `Audio budget exceeded: lesson ${lessonId} would synthesise ${toGenerate.length} clips ` +
      `but the budget is ${audioBudget}. Raise audioBudget.maxNewSyntheses or split the lesson.`,
    )
  }

  // 4. Synthesize → upload → insert per missing entry.
  const synthesizer = input.synthesizer ?? synthesizeSpeech
  let synthesised = 0
  for (let i = 0; i < toGenerate.length; i++) {
    const entry = toGenerate[i]
    if (i > 0) await new Promise((res) => setTimeout(res, 100)) // rate-limit 100ms

    const audioBuffer = await synthesizer(entry.text, entry.voiceId)
    const storagePath = buildStoragePath(entry.text, entry.voiceId)

    const { error: uploadError } = await supabase
      .storage
      .from('indonesian-tts')
      .upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadError) throw uploadError

    const { error: insertError } = await supabase
      .schema('indonesian')
      .from('audio_clips')
      .insert({
        text_content: entry.text,
        normalized_text: entry.normalizedText,
        voice_id: entry.voiceId,
        storage_path: storagePath,
        generated_for_lesson_id: lessonId,
      })
    if (insertError) throw insertError

    synthesised++
  }

  return { synthesised, reused }
}
