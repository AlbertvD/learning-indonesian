import { supabase } from '@/lib/supabase'
import type { ContentFlag, ExerciseType, FlagType } from '@/types/learning'

interface UpsertFlagInput {
  userId: string
  learningItemId: string
  exerciseType: ExerciseType
  exerciseVariantId: string | null
  flagType: FlagType
  comment: string | null
}

function mapRow(row: Record<string, unknown>): ContentFlag {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    learningItemId: row.learning_item_id as string,
    exerciseType: row.exercise_type as ExerciseType,
    exerciseVariantId: (row.exercise_variant_id as string | null) ?? null,
    flagType: row.flag_type as FlagType,
    comment: (row.comment as string | null) ?? null,
    status: row.status as 'open' | 'resolved',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export const contentFlagService = {
  async upsertFlag(input: UpsertFlagInput): Promise<ContentFlag> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('content_flags')
      .upsert({
        user_id: input.userId,
        learning_item_id: input.learningItemId,
        exercise_type: input.exerciseType,
        exercise_variant_id: input.exerciseVariantId,
        flag_type: input.flagType,
        comment: input.comment,
        status: 'open',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,learning_item_id,exercise_type' })
      .select()
      .single()

    if (error) throw error
    return mapRow(data)
  },

  async getFlagForItem(
    userId: string,
    learningItemId: string,
    exerciseType: ExerciseType,
  ): Promise<ContentFlag | null> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('content_flags')
      .select('*')
      .eq('user_id', userId)
      .eq('learning_item_id', learningItemId)
      .eq('exercise_type', exerciseType)
      .maybeSingle()

    if (error) throw error
    return data ? mapRow(data) : null
  },

  async resolveFlag(flagId: string): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('content_flags')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', flagId)

    if (error) throw error
  },

  async getOpenFlags(userId: string): Promise<ContentFlag[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('content_flags')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map(mapRow)
  },
}
