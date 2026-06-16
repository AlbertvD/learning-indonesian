import { supabase } from '@/lib/supabase'
import type { ExerciseReviewRow, ReviewComment, ReviewCommentWithContext } from '@/types/learning'

// The 4 typed grammar-exercise tables, paired with the exercise_type discriminant
// they map to. These are the only exercise_types that exist as authored rows
// (PR 4a — vocab exercises are runtime-generated, never persisted). Order is
// stable so the index lines up with the Promise.all result array below.
const TYPED_TABLES = [
  { table: 'contrast_pair_exercises', type: 'choose_correct_form_ex' },
  { table: 'sentence_transformation_exercises', type: 'transform_sentence_ex' },
  { table: 'constrained_translation_exercises', type: 'translate_sentence_ex' },
  { table: 'cloze_mcq_exercises', type: 'choose_missing_word_ex' },
] as const

/**
 * Tag raw PostgREST rows with their exercise_type discriminant, in TYPED_TABLES
 * order. Throws on any per-table query error. The cast to ExerciseReviewRow is a
 * DB-boundary cast — PostgREST returns untyped JSON and the table→branch
 * correlation is by index, which TS can't track structurally.
 */
function tagRows(results: Array<{ data: unknown[] | null; error: { message: string } | null }>): ExerciseReviewRow[] {
  const rows: ExerciseReviewRow[] = []
  results.forEach((res, i) => {
    if (res.error) throw res.error
    const exercise_type = TYPED_TABLES[i].type
    for (const r of res.data ?? []) {
      rows.push({ ...(r as object), exercise_type } as ExerciseReviewRow)
    }
  })
  return rows
}

function mapComment(row: Record<string, unknown>): ReviewComment {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    exerciseVariantId: row.exercise_variant_id as string,
    comment: row.comment as string,
    status: row.status as 'open' | 'resolved',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Derive a short human-readable prompt from a typed exercise row. Exported for testing. */
export function getPromptSummary(row: ExerciseReviewRow): string {
  const raw = (() => {
    switch (row.exercise_type) {
      case 'choose_correct_form_ex':
        return row.prompt_text
      case 'transform_sentence_ex':
        return row.source_sentence
      case 'translate_sentence_ex':
        return row.source_language_sentence
      case 'choose_missing_word_ex':
        return row.sentence
    }
  })()
  const text = String(raw ?? '').replace(/___/g, '…').trim()
  return text.length > 80 ? text.slice(0, 79) + '…' : text
}

export const exerciseReviewService = {
  /**
   * Fetch all active typed grammar-exercise rows for a lesson.
   *
   * The 4 typed tables each carry `lesson_id` directly (set at publish time), so
   * a single per-table filter replaces the old grammar/vocab split that read
   * exercise_variants. Vocab exercises are never persisted, so there is nothing
   * to fetch for them.
   */
  async getVariantsForLesson(lessonId: string): Promise<ExerciseReviewRow[]> {
    const results = await Promise.all(
      TYPED_TABLES.map(({ table }) =>
        supabase
          .schema('indonesian')
          .from(table)
          .select('*')
          .eq('lesson_id', lessonId)
          .eq('is_active', true)
      )
    )
    return tagRows(results)
  },

  /** Load open comments for a batch of exercise IDs. Returns Map<exerciseId, ReviewComment>. */
  async getCommentsForVariants(userId: string, variantIds: string[]): Promise<Map<string, ReviewComment>> {
    if (variantIds.length === 0) return new Map()

    const { data, error } = await supabase
      .schema('indonesian')
      .from('exercise_review_comments')
      .select('*')
      .eq('user_id', userId)
      .in('exercise_variant_id', variantIds)
      .eq('status', 'open')

    if (error) throw error

    const map = new Map<string, ReviewComment>()
    for (const row of data ?? []) {
      const c = mapComment(row)
      map.set(c.exerciseVariantId, c)
    }
    return map
  },

  /**
   * Upsert (create or update) a comment for an exercise.
   *
   * The comment is keyed by `exercise_variant_id`, which holds the TYPED
   * grammar-exercise row id (one of the 4 typed tables). Slice 2 Task 8 dropped
   * the FK to exercise_variants (the typed id only coincidentally lived there for
   * the PR-4 bridged rows; runner-minted typed rows have their own uuid). The
   * column name is retained for compatibility; integrity is now enforced
   * app-side (getOpenComments/getCommentsForVariants resolve the id across the 4
   * typed tables) + a deep health check counts orphans. The `UNIQUE(user_id,
   * exercise_variant_id)` still gives one comment per user per exercise.
   */
  async upsertComment(userId: string, variantId: string, comment: string): Promise<ReviewComment> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('exercise_review_comments')
      .upsert(
        {
          user_id: userId,
          exercise_variant_id: variantId,
          comment,
          status: 'open',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,exercise_variant_id' }
      )
      .select()
      .single()

    if (error) throw error
    return mapComment(data)
  },

  /** Mark a comment as resolved. */
  async resolveComment(commentId: string): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('exercise_review_comments')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', commentId)

    if (error) throw error
  },

  /**
   * Fetch all open comments with lesson context for the overview tab.
   *
   * 1. Fetch all open comments for the user.
   * 2. Resolve each comment's exercise id across the 4 typed tables (the id is
   *    shared, so each lands in exactly one table). Every typed row carries
   *    `lesson_id`, so no context join is needed.
   * 3. Fetch lesson titles by lesson_id.
   * 4. Assemble client-side.
   */
  async getOpenComments(userId: string): Promise<ReviewCommentWithContext[]> {
    const { data: comments, error: commentsError } = await supabase
      .schema('indonesian')
      .from('exercise_review_comments')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')

    if (commentsError) throw commentsError
    if (!comments || comments.length === 0) return []

    const exerciseIds = [...new Set(comments.map(c => c.exercise_variant_id))]

    // Resolve exercise rows across all 4 typed tables.
    const rowResults = await Promise.all(
      TYPED_TABLES.map(({ table }) =>
        supabase.schema('indonesian').from(table).select('*').in('id', exerciseIds)
      )
    )
    const rowMap = new Map<string, ExerciseReviewRow>()
    for (const row of tagRows(rowResults)) rowMap.set(row.id, row)

    // Resolve lesson titles.
    const lessonIds = [...new Set([...rowMap.values()].map(r => r.lesson_id))]
    const { data: lessons, error: lessonsError } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('id, title')
      .in('id', lessonIds)

    if (lessonsError) throw lessonsError

    const lessonTitleMap = new Map<string, string>()
    for (const l of lessons ?? []) lessonTitleMap.set(l.id, l.title)

    return comments
      .map((row): ReviewCommentWithContext | null => {
        const comment = mapComment(row)
        const exRow = rowMap.get(comment.exerciseVariantId)
        if (!exRow) return null

        return {
          ...comment,
          lessonTitle: lessonTitleMap.get(exRow.lesson_id) ?? 'Onbekende les',
          exerciseType: exRow.exercise_type,
          promptSummary: getPromptSummary(exRow),
        }
      })
      .filter((c): c is ReviewCommentWithContext => c !== null)
      .sort((a, b) => a.lessonTitle.localeCompare(b.lessonTitle) || a.exerciseType.localeCompare(b.exerciseType))
  },
}
