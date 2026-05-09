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

export interface PageBlockInput {
  block_key: string
  source_ref: string
  source_refs: string[]
  content_unit_slugs: string[]
  /** Canonical 7-value reader kind, post-classifier. */
  block_kind: string
  display_order: number
  payload_json: Record<string, unknown>
  capability_key_refs: string[]
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
 * existing UNIQUE constraint on the table.
 */
export async function upsertLessonSections(
  supabase: SupabaseClient,
  lessonId: string,
  sections: SectionInput[],
): Promise<number> {
  let count = 0
  for (const section of sections) {
    const { error } = await supabase
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
    if (error) throw error
    count++
  }
  return count
}

/**
 * Upsert every page-block row, keyed by (source_ref, block_key). Drops the
 * dead `source_progress_event` field — the column was removed in retirement
 * #6 (scripts/migration.sql:1801–1803). Includes the canonical block_kind
 * value produced by classifier.ts.
 */
export async function upsertLessonPageBlocks(
  supabase: SupabaseClient,
  blocks: PageBlockInput[],
): Promise<number> {
  let count = 0
  for (const block of blocks) {
    const { error } = await supabase
      .schema('indonesian')
      .from('lesson_page_blocks')
      .upsert(
        {
          block_key: block.block_key,
          source_ref: block.source_ref,
          source_refs: block.source_refs ?? [],
          content_unit_slugs: block.content_unit_slugs ?? [],
          block_kind: block.block_kind,
          display_order: block.display_order,
          payload_json: block.payload_json ?? {},
          capability_key_refs: block.capability_key_refs ?? [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source_ref,block_key' },
      )
    if (error) throw error
    count++
  }
  return count
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
