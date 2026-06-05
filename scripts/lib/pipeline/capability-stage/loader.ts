/**
 * capability-stage/loader.ts — input boundary for the deep module.
 *
 * Single read source (Slice 5b #147 — the no-disk cutover):
 *   DB (Stage A's outputs): `lessons`, `lesson_sections`, `audio_clips`.
 *   Every downstream input the legacy loader read off staging files
 *   (learning-items / grammar-patterns / candidates / cloze-contexts /
 *   content-units / capabilities / exercise-assets) is now read from the typed
 *   DB tables further down the stage (loadFromDb / loadPatternFromDb /
 *   loadDialogueFromDb / fetchAffixedPairsFromDb). The loader performs ZERO
 *   disk reads — it held the last staging coupling, retired here so the global
 *   no-disk gate (5b.9) can de-allowlist it and pass clean.
 *
 * The deep module's external interface remains
 *   { lessonNumber, lessonId, dryRun }
 * and Stage A's runLessonStage must have run first so the DB rows exist —
 * including in dry-run (dry-run loads from the DB Stage A wrote, ADR 0011/0012).
 */

import {
  fetchLessonAudioCoverage,
  type AudioClipMeta,
  type CapabilitySupabaseClient,
} from './adapter'

export interface LoadedLessonRow {
  id: string
  module_id: string
  order_index: number
  title: string
  level: string
  primary_voice: string | null
}

export interface LoadedLessonSection {
  id: string
  title: string
  content: Record<string, unknown>
  order_index: number
}

export interface LoadedLesson {
  lesson: LoadedLessonRow
  sections: LoadedLessonSection[]
  /**
   * Map of `normalized_text` (via normalizeTtsText) → audio clip metadata for
   * every audio_clips row attached to this lesson, primary-voice preferred.
   * Replaces the older `audioNormalizedTexts: Set<string>` so the projector
   * can both flag `hasAudio` AND build a concrete `audio_clip` artifact
   * payload from the same source.
   */
  audioClipsByNormalizedText: Map<string, AudioClipMeta>
}

// ---------------------------------------------------------------------------
// DB reads (Stage A outputs)
// ---------------------------------------------------------------------------

export async function loadStageAOutputsFromDb(
  supabase: CapabilitySupabaseClient,
  input: { lessonNumber: number; lessonId: string },
): Promise<LoadedLesson> {
  const { lessonId } = input

  const { data: lessonRow, error: lessonError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, module_id, order_index, title, level, primary_voice')
    .eq('id', lessonId)
    .single()
  if (lessonError) throw new Error(`Failed to load lessons.id=${lessonId}: ${lessonError.message}`)
  if (!lessonRow) throw new Error(`No lessons row found for id=${lessonId} (Stage A must run first)`)

  const { data: sectionsData, error: sectionsError } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('id, title, content, order_index')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true })
  if (sectionsError) throw sectionsError

  const typedLessonRow = lessonRow as LoadedLessonRow
  const audioClipsByNormalizedText = await fetchLessonAudioCoverage(
    supabase,
    lessonId,
    typedLessonRow.primary_voice,
  )

  return {
    lesson: typedLessonRow,
    sections: (sectionsData ?? []) as LoadedLessonSection[],
    audioClipsByNormalizedText,
  }
}

// ---------------------------------------------------------------------------
// Combined load: Stage A outputs (DB only — Slice 5b #147)
// ---------------------------------------------------------------------------

/**
 * Loads the lesson's Stage-A outputs (lesson row + sections + audio coverage)
 * from the database. DB-only as of Slice 5b (#147): there is no staging-file
 * fallback, and dry-run uses this same path (Stage A must have run live first
 * so the rows exist — see runner.ts dry-run handling).
 */
export async function loadLesson(
  supabase: CapabilitySupabaseClient,
  input: { lessonNumber: number; lessonId: string },
): Promise<LoadedLesson> {
  return loadStageAOutputsFromDb(supabase, input)
}
