/**
 * capability-stage/loader.ts — import boundary for the deep module (Slice 1).
 *
 * DB→DB spine: reads lesson content entirely from the database.
 * No staging-file I/O crosses this boundary (enforced by
 * src/__tests__/slice1-enforcement.test.ts).
 *
 * Public surface:
 *   loadFromDb(supabase, { lessonNumber, lessonId }) → LoadedLesson
 *
 * What it reads:
 *   - lessons (lesson metadata)
 *   - lesson_sections (section content + order)
 *   - lesson_dialogue_lines (typed dialogue rows for dialogue_line caps)
 *   - audio_clips (via fetchLessonAudioCoverage from adapter)
 *   - learning_items + item_contexts (existing items for idempotency delta)
 *
 * Grammar patterns, candidates, cloze-contexts, and affixed-form-pairs are
 * Slice 2 and 3 surfaces. loadFromDb returns empty arrays for those fields
 * so the runner produces zero writes for those source kinds until their
 * respective slices land.
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

/**
 * Items loaded from the DB for this lesson (via item_contexts.source_lesson_id).
 * Used as the item population the projector fans out capability plans from.
 * All enriched fields (translation_nl, translation_en, pos, level) are already
 * populated from previous runs — re-runs upsert the same values (idempotent).
 */
export interface LoadedItemRow {
  base_text: string
  item_type: 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
  translation_nl: string | null
  translation_en: string | null
  pos: string | null
  level: string
  review_status?: string | null
  context_type: string
  source_text: string
  translation_text: string | null
}

/**
 * Typed dialogue line loaded from lesson_dialogue_lines.
 * Used for dialogue_line capability construction (Slice 2 cloze path).
 */
export interface LoadedDialogueLine {
  id: string
  section_id: string
  line_index: number
  source_line_ref: string
  text: string
  speaker: string | null
  translation: string
}

/**
 * The staging-equivalent payload returned by loadFromDb. Typed rather than
 * Record<string, unknown> to make the runner's expectations explicit.
 *
 * Grammar patterns, candidates, cloze-contexts, and affixed-form-pairs are
 * Slice 2/3 surfaces; the runner produces 0 writes for them until those
 * slices land and populate these fields.
 *
 * Note: there is no stagingDir field — the DB→DB spine never writes back
 * to disk. The runner regenerates contentUnits/capabilities/exerciseAssets
 * in-memory and does not persist them.
 */
export interface LoadedStaging {
  learningItems: LoadedItemRow[]
  grammarPatterns: Array<Record<string, unknown>>
  candidates: Array<Record<string, unknown>>
  clozeContexts: Array<Record<string, unknown>>
  contentUnits: Array<Record<string, unknown>>
  capabilities: Array<Record<string, unknown>>
  exerciseAssets: Array<Record<string, unknown>>
  affixedFormPairs: Array<Record<string, unknown>>
  dialogueLines: LoadedDialogueLine[]
}

export interface LoadedLesson {
  lesson: LoadedLessonRow
  sections: LoadedLessonSection[]
  /**
   * Map of normalized_text to audio clip metadata for every audio_clips row
   * attached to this lesson, primary-voice preferred.
   */
  audioClipsByNormalizedText: Map<string, AudioClipMeta>
  staging: LoadedStaging
}

// ---------------------------------------------------------------------------
// DB load — the single public entry point for the capability-stage runner
// ---------------------------------------------------------------------------

/**
 * Load all content needed for the capability-stage run from the database.
 *
 * Returns:
 *  - lesson metadata + sections (from Stage A's lesson_sections write)
 *  - existing learning_items linked to this lesson (via item_contexts.source_lesson_id)
 *  - audio clip coverage map (from audio_clips)
 *  - dialogue lines (from lesson_dialogue_lines)
 *
 * Grammar/candidates/cloze/affixed are empty for Slice 1; Slice 2 will
 * populate them from their respective typed tables.
 */
export async function loadFromDb(
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

  const typedLessonRow = lessonRow as LoadedLessonRow

  const { data: sectionsData, error: sectionsError } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('id, title, content, order_index')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true })
  if (sectionsError) throw sectionsError

  const audioClipsByNormalizedText = await fetchLessonAudioCoverage(
    supabase,
    lessonId,
    typedLessonRow.primary_voice,
  )

  // Learning items are linked to lessons via item_contexts.source_lesson_id.
  const { data: contextRows, error: contextError } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .select(`
      context_type,
      source_text,
      translation_text,
      learning_item_id,
      learning_items!inner (
        base_text,
        item_type,
        translation_nl,
        translation_en,
        pos,
        level,
        review_status
      )
    `)
    .eq('source_lesson_id', lessonId)
    .eq('is_anchor_context', true)
  if (contextError) throw contextError

  const itemByBaseText = new Map<string, LoadedItemRow>()
  for (const ctx of (contextRows ?? []) as Array<{
    context_type: string
    source_text: string
    translation_text: string | null
    learning_item_id: string
    learning_items: {
      base_text: string
      item_type: string
      translation_nl: string | null
      translation_en: string | null
      pos: string | null
      level: string
      review_status: string | null
    }
  }>) {
    const item = ctx.learning_items
    if (!itemByBaseText.has(item.base_text)) {
      itemByBaseText.set(item.base_text, {
        base_text: item.base_text,
        item_type: item.item_type as LoadedItemRow['item_type'],
        translation_nl: item.translation_nl,
        translation_en: item.translation_en,
        pos: item.pos,
        level: item.level,
        review_status: item.review_status,
        context_type: ctx.context_type,
        source_text: ctx.source_text,
        translation_text: ctx.translation_text,
      })
    }
  }

  const { data: dialogueLineRows, error: dialogueLineError } = await supabase
    .schema('indonesian')
    .from('lesson_dialogue_lines')
    .select('id, section_id, line_index, source_line_ref, text, speaker, translation')
    .eq('lesson_id', lessonId)
    .order('line_index', { ascending: true })
  if (dialogueLineError) throw dialogueLineError

  return {
    lesson: typedLessonRow,
    sections: (sectionsData ?? []) as LoadedLessonSection[],
    audioClipsByNormalizedText,
    staging: {
      learningItems: [...itemByBaseText.values()],
      grammarPatterns: [],
      candidates: [],
      clozeContexts: [],
      contentUnits: [],
      capabilities: [],
      exerciseAssets: [],
      affixedFormPairs: [],
      dialogueLines: (dialogueLineRows ?? []) as LoadedDialogueLine[],
    },
  }
}
