import { supabase } from '@/lib/supabase'
import type { ExerciseVariant, ReviewComment, ReviewCommentWithContext } from '@/types/learning'

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

/** Derive a short human-readable prompt from a variant's payload_json. Exported for testing. */
export function getPromptSummary(exerciseType: string, payload: Record<string, unknown>): string {
  const raw = (() => {
    switch (exerciseType) {
      case 'recognition_mcq':
      case 'meaning_recall':
      case 'typed_recall':
        return (payload.base_text ?? payload.prompt ?? '') as string
      case 'cued_recall':
        return (payload.promptMeaningText ?? '') as string
      case 'cloze_mcq':
        return (payload.sentence ?? '') as string
      case 'cloze':
        return (payload.sentence ?? payload.source_text ?? '') as string
      case 'contrast_pair':
        return (payload.promptText ?? '') as string
      case 'sentence_transformation':
        return (payload.sourceSentence ?? '') as string
      case 'constrained_translation':
        return (payload.sourceLanguageSentence ?? '') as string
      case 'speaking':
        return (payload.promptText ?? '') as string
      default:
        return ''
    }
  })()
  const text = String(raw).replace(/___/g, '…').trim()
  return text.length > 80 ? text.slice(0, 79) + '…' : text
}

export const exerciseReviewService = {
  /**
   * Fetch all active exercise variants for a lesson.
   *
   * Two queries because grammar and vocab variants link to lessons differently:
   * - Grammar: exercise_variants.lesson_id is a direct FK (set at publish time)
   * - Vocab:   exercise_variants.lesson_id IS NULL; linked via context_id → item_contexts.source_lesson_id
   *
   * Note: PostgREST .eq('relation.column', value) only affects the embedded result,
   * not the parent rows. Vocab variants are therefore filtered client-side after the join.
   */
  async getVariantsForLesson(lessonId: string): Promise<ExerciseVariant[]> {
    const [grammarResult, vocabResult] = await Promise.all([
      supabase
        .schema('indonesian')
        .from('exercise_variants')
        .select('*')
        .eq('lesson_id', lessonId)
        .eq('is_active', true),

      supabase
        .schema('indonesian')
        .from('exercise_variants')
        .select('*, item_contexts!context_id(source_lesson_id)')
        .is('lesson_id', null)
        .eq('is_active', true),
    ])

    if (grammarResult.error) throw grammarResult.error
    if (vocabResult.error) throw vocabResult.error

    const grammarVariants = (grammarResult.data ?? []) as ExerciseVariant[]

    // Filter vocab variants client-side — PostgREST join filter does not narrow parent rows
    const vocabVariants = ((vocabResult.data ?? []) as any[])
      .filter(v => v.item_contexts?.source_lesson_id === lessonId)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ item_contexts: _ic, ...rest }) => rest as ExerciseVariant)

    return [...grammarVariants, ...vocabVariants]
  },

  /** Load open comments for a batch of variant IDs. Returns Map<variantId, ReviewComment>. */
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

  /** Upsert (create or update) a comment for a variant. */
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
   * Three-step approach (avoids unreliable multi-level PostgREST embeds):
   * 1. Fetch all open comments for the user
   * 2. Fetch the exercise_variants for those IDs (+ item_contexts for vocab variants)
   * 3. Fetch lessons for grammar variants (by lesson_id) and vocab variants (by source_lesson_id)
   * 4. Assemble client-side
   */
  async getOpenComments(userId: string): Promise<ReviewCommentWithContext[]> {
    // Step 1: all open comments
    const { data: comments, error: commentsError } = await supabase
      .schema('indonesian')
      .from('exercise_review_comments')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')

    if (commentsError) throw commentsError
    if (!comments || comments.length === 0) return []

    const variantIds = comments.map(c => c.exercise_variant_id)

    // Step 2: fetch variants with context join for vocab path
    const { data: variants, error: variantsError } = await supabase
      .schema('indonesian')
      .from('exercise_variants')
      .select('id, exercise_type, payload_json, lesson_id, context_id, item_contexts!context_id(source_lesson_id)')
      .in('id', variantIds)

    if (variantsError) throw variantsError

    const rows = (variants ?? []) as any[]
    const variantMap = new Map<string, any>()
    for (const v of rows) variantMap.set(v.id, v)

    // Collect lesson IDs to resolve titles
    const grammarLessonIds = new Set<string>()
    const vocabLessonIds = new Set<string>()
    for (const v of rows) {
      if (v.lesson_id) grammarLessonIds.add(v.lesson_id)
      else if (v.item_contexts?.source_lesson_id) vocabLessonIds.add(v.item_contexts.source_lesson_id)
    }

    // Step 3: fetch lesson titles
    const allLessonIds = [...new Set([...grammarLessonIds, ...vocabLessonIds])]
    const { data: lessons, error: lessonsError } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('id, title')
      .in('id', allLessonIds)

    if (lessonsError) throw lessonsError

    const lessonTitleMap = new Map<string, string>()
    for (const l of lessons ?? []) lessonTitleMap.set(l.id, l.title)

    // Step 4: assemble
    return comments
      .map(row => {
        const comment = mapComment(row)
        const variant = variantMap.get(comment.exerciseVariantId)
        if (!variant) return null

        const lessonId = variant.lesson_id ?? variant.item_contexts?.source_lesson_id ?? null
        const lessonTitle = lessonId ? (lessonTitleMap.get(lessonId) ?? 'Onbekende les') : 'Onbekende les'

        return {
          ...comment,
          lessonTitle,
          exerciseType: variant.exercise_type ?? '',
          promptSummary: getPromptSummary(variant.exercise_type ?? '', variant.payload_json ?? {}),
        } satisfies ReviewCommentWithContext
      })
      .filter((c): c is ReviewCommentWithContext => c !== null)
      .sort((a, b) => a.lessonTitle.localeCompare(b.lessonTitle) || a.exerciseType.localeCompare(b.exerciseType))
  },
}
