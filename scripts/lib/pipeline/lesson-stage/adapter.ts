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
 *
 * PR 6: also writes the `section_kind` discriminator (= content.type, already
 * GT5-validated to the canonical set) and `source_section_ref`
 * (`lesson-N/section-orderIndex`). The `content` jsonb blob is RETAINED.
 */
export async function upsertLessonSections(
  supabase: SupabaseClient,
  lessonId: string,
  lessonNumber: number,
  sections: SectionInput[],
): Promise<{ count: number; idsByOrderIndex: Map<number, string> }> {
  const idsByOrderIndex = new Map<number, string>()
  let count = 0
  for (const section of sections) {
    const rawType = (section.content as { type?: unknown })?.type
    const sectionKind = typeof rawType === 'string' ? rawType : null
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lesson_sections')
      .upsert(
        {
          lesson_id: lessonId,
          title: section.title,
          content: section.content,
          order_index: section.order_index,
          section_kind: sectionKind,
          source_section_ref: `lesson-${lessonNumber}/section-${section.order_index}`,
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
  /** Legacy single-column Dutch translation (kept; rename-retire is a later PR). */
  translation: string
  /** PR 6: bilingual columns. translation_nl mirrors `translation`. */
  translation_nl: string
  translation_en: string | null
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
        translation_nl: line.translation_nl,
        translation_en: line.translation_en,
      })),
    )
  if (insertError) throw insertError

  return lines.length
}

// ───────────────── PR 6: typed lesson-section capability-contract writers ─────
//
// Each is a delete-by-scope + bulk-insert replace. Safe + idempotent because
// these are regenerable projections of the (staging-canonical) lesson content —
// no referenced user state (ADR 0011 lesson-content regime; re-publish is the
// canonical writer). They are WRITE-ONLY at PR 6 merge — the future Capability
// Stage (#98/#99) is their reader.

export interface ItemRowInput {
  section_id: string
  lesson_id: string
  display_order: number
  source_item_ref: string
  item_type: 'word' | 'phrase'
  indonesian_text: string
  l1_translation: string
  l2_translation: string | null
}

/** Replace lesson_section_item_rows for the given (item-bearing) section ids. */
export async function replaceLessonSectionItemRows(
  supabase: SupabaseClient,
  sectionIds: string[],
  rows: ItemRowInput[],
): Promise<number> {
  if (sectionIds.length === 0) return 0
  const { error: deleteError } = await supabase
    .schema('indonesian')
    .from('lesson_section_item_rows')
    .delete()
    .in('section_id', sectionIds)
  if (deleteError) throw deleteError
  if (rows.length === 0) return 0
  const { error: insertError } = await supabase
    .schema('indonesian')
    .from('lesson_section_item_rows')
    .insert(rows)
  if (insertError) throw insertError
  return rows.length
}

export interface GrammarCategoryInput {
  section_id: string
  lesson_id: string
  display_order: number
  title: string
  title_en: string | null
  rules: string[]
  rules_en: string[]
  examples: Array<{ indonesian: string; dutch: string | null; english: string | null }> | null
}

/** Replace lesson_section_grammar_categories for the given grammar section ids. */
export async function replaceLessonSectionGrammarCategories(
  supabase: SupabaseClient,
  sectionIds: string[],
  rows: GrammarCategoryInput[],
): Promise<number> {
  if (sectionIds.length === 0) return 0
  const { error: deleteError } = await supabase
    .schema('indonesian')
    .from('lesson_section_grammar_categories')
    .delete()
    .in('section_id', sectionIds)
  if (deleteError) throw deleteError
  if (rows.length === 0) return 0
  const { error: insertError } = await supabase
    .schema('indonesian')
    .from('lesson_section_grammar_categories')
    .insert(rows)
  if (insertError) throw insertError
  return rows.length
}

export interface GrammarTopicInput {
  section_id: string
  lesson_id: string
  topic_label: string
}

/** Replace lesson_section_grammar_topics for the given grammar section ids. */
export async function replaceLessonSectionGrammarTopics(
  supabase: SupabaseClient,
  sectionIds: string[],
  rows: GrammarTopicInput[],
): Promise<number> {
  if (sectionIds.length === 0) return 0
  const { error: deleteError } = await supabase
    .schema('indonesian')
    .from('lesson_section_grammar_topics')
    .delete()
    .in('section_id', sectionIds)
  if (deleteError) throw deleteError
  if (rows.length === 0) return 0
  const { error: insertError } = await supabase
    .schema('indonesian')
    .from('lesson_section_grammar_topics')
    .insert(rows)
  if (insertError) throw insertError
  return rows.length
}

export interface AffixedPairRowInput {
  lesson_id: string
  section_id: string | null
  source_ref: string
  pattern_source_ref: string | null
  affix: string
  root_text: string
  derived_text: string
  allomorph_rule: string
}

/**
 * Replace lesson_section_affixed_pairs for the lesson. Scoped by lesson_id
 * (not section_id — morphology has no lesson.ts section, section_id is null).
 */
export async function replaceLessonSectionAffixedPairs(
  supabase: SupabaseClient,
  lessonId: string,
  rows: AffixedPairRowInput[],
): Promise<number> {
  const { error: deleteError } = await supabase
    .schema('indonesian')
    .from('lesson_section_affixed_pairs')
    .delete()
    .eq('lesson_id', lessonId)
  if (deleteError) throw deleteError
  if (rows.length === 0) return 0
  const { error: insertError } = await supabase
    .schema('indonesian')
    .from('lesson_section_affixed_pairs')
    .insert(rows)
  if (insertError) throw insertError
  return rows.length
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
