import type { SupabaseClient } from '@supabase/supabase-js'

export interface LessonInput {
  module_id: string
  order_index: number
  title: string
  description?: string | null
  level: string
}

export interface LessonRow {
  id: string
  orderIndex: number
  title: string
  level: string
}

export interface SectionInput {
  title: string
  content: Record<string, unknown>
  order_index: number
}

/**
 * Upsert the `lessons` row by (module_id, order_index). Mirrors the existing
 * find-or-insert pattern at publish-approved-content.ts so behaviour is
 * unchanged: existing rows get UPDATEd; new rows get INSERTed; the returned
 * id is consistent across re-runs.
 */
export async function upsertLesson(
  supabase: SupabaseClient,
  lesson: LessonInput,
): Promise<LessonRow> {
  const { data: existing, error: findError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id')
    .eq('module_id', lesson.module_id)
    .eq('order_index', lesson.order_index)
    .maybeSingle()
  if (findError) throw findError

  let id: string
  if (existing) {
    const { error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .update({
        title: lesson.title,
        description: lesson.description ?? null,
        level: lesson.level,
      })
      .eq('id', existing.id)
    if (error) throw error
    id = existing.id
  } else {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .insert({
        module_id: lesson.module_id,
        order_index: lesson.order_index,
        title: lesson.title,
        description: lesson.description ?? null,
        level: lesson.level,
      })
      .select('id')
      .single()
    if (error) throw error
    id = data.id
  }

  return { id, orderIndex: lesson.order_index, title: lesson.title, level: lesson.level }
}

/**
 * Upsert every section row, keyed by (lesson_id, order_index) — matches the
 * existing UNIQUE constraint on the table. Returns the section ids keyed by
 * order_index so downstream writers (e.g. lesson_dialogue_lines for
 * dialogue sections) can FK to them.
 */
export async function upsertLessonSections(
  supabase: SupabaseClient,
  lessonId: string,
  sections: SectionInput[],
): Promise<{ count: number; idsByOrderIndex: Map<number, string> }> {
  const idsByOrderIndex = new Map<number, string>()
  let count = 0
  for (const section of sections) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lesson_sections')
      .upsert(
        {
          lesson_id: lessonId,
          title: section.title,
          content: section.content,
          order_index: section.order_index,
        },
        { onConflict: 'lesson_id,order_index' },
      )
      .select('id, order_index')
      .single()
    if (error) throw error
    if (data) idsByOrderIndex.set(data.order_index as number, data.id as string)
    count++
  }
  return { count, idsByOrderIndex }
}

export interface DialogueLineInput {
  section_id: string
  lesson_id: string
  line_index: number
  source_line_ref: string
  text: string
  speaker: string | null
  translation: string
}

/**
 * Replace every `lesson_dialogue_lines` row for the given dialogue sections.
 *
 * Strategy: delete all rows for the affected `section_id`s, then bulk-insert
 * the new ones. This is safe because `lesson_dialogue_lines` is a
 * regenerable projection of `lesson_sections.content.lines[]` — there is no
 * referenced user state (caps FK to capability_id, not the line). Re-publish
 * is the canonical writer.
 *
 * Idempotent across re-runs: re-publishing the same lesson reproduces the
 * same set of rows.
 */
export async function replaceLessonDialogueLines(
  supabase: SupabaseClient,
  sectionIds: string[],
  lines: DialogueLineInput[],
): Promise<number> {
  if (sectionIds.length === 0) return 0

  const { error: deleteError } = await supabase
    .schema('indonesian')
    .from('lesson_dialogue_lines')
    .delete()
    .in('section_id', sectionIds)
  if (deleteError) throw deleteError

  if (lines.length === 0) return 0

  const { error: insertError } = await supabase
    .schema('indonesian')
    .from('lesson_dialogue_lines')
    .insert(
      lines.map((line) => ({
        section_id: line.section_id,
        lesson_id: line.lesson_id,
        line_index: line.line_index,
        source_line_ref: line.source_line_ref,
        text: line.text,
        speaker: line.speaker,
        translation: line.translation,
      })),
    )
  if (insertError) throw insertError

  return lines.length
}

/**
 * Read which (normalized_text, voice_id) pairs already exist in `audio_clips`.
 * Returns a Set of `${normalized_text}|${voice_id}` keys for O(1) membership
 * checks. Used by audio.ts dedup; exposed here for direct access from the
 * runner / tests.
 */
export async function fetchExistingAudioClips(
  supabase: SupabaseClient,
  pairs: ReadonlyArray<{ normalizedText: string; voiceId: string }>,
): Promise<Set<string>> {
  if (pairs.length === 0) return new Set()

  const allTexts = [...new Set(pairs.map((p) => p.normalizedText))]
  const allVoices = [...new Set(pairs.map((p) => p.voiceId))]

  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('get_audio_clips', { p_texts: allTexts, p_voice_ids: allVoices })
  if (error) throw error

  const present = new Set<string>()
  for (const row of (data ?? []) as Array<{ normalized_text: string; voice_id: string }>) {
    present.add(`${row.normalized_text}|${row.voice_id}`)
  }
  return present
}
