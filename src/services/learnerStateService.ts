// src/services/learnerStateService.ts
import { supabase } from '@/lib/supabase'
import type { LearnerItemState, LearnerSkillState } from '@/types/learning'

export const learnerStateService = {
  async getItemStates(userId: string): Promise<LearnerItemState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_item_state')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return data
  },

  async getItemState(userId: string, itemId: string): Promise<LearnerItemState | null> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_item_state')
      .select('*')
      .eq('user_id', userId)
      .eq('learning_item_id', itemId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getSkillStates(userId: string, itemId: string): Promise<LearnerSkillState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('*')
      .eq('user_id', userId)
      .eq('learning_item_id', itemId)
    if (error) throw error
    return data
  },

  async getSkillStatesBatch(userId: string, itemIds: string[]): Promise<LearnerSkillState[]> {
    // Batch into chunks to avoid URL length limits with large in() filters
    const chunkSize = 20
    const results: LearnerSkillState[] = []
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      const chunk = itemIds.slice(i, i + chunkSize)
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learner_skill_state')
        .select('*')
        .eq('user_id', userId)
        .in('learning_item_id', chunk)
      if (error) throw error
      results.push(...data)
    }
    return results
  },

  async getAllSkillStates(userId: string): Promise<LearnerSkillState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return data
  },

  async getDueSkills(userId: string): Promise<LearnerSkillState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('*')
      .eq('user_id', userId)
      .lte('next_due_at', new Date().toISOString())
      .order('next_due_at')
    if (error) throw error
    return data
  },

  async upsertItemState(state: Omit<LearnerItemState, 'id' | 'updated_at'>): Promise<LearnerItemState> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_item_state')
      .upsert({ ...state, updated_at: new Date().toISOString() }, { onConflict: 'user_id,learning_item_id' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async upsertSkillState(state: Omit<LearnerSkillState, 'id' | 'updated_at'>): Promise<LearnerSkillState> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .upsert({ ...state, updated_at: new Date().toISOString() }, { onConflict: 'user_id,learning_item_id,skill_type' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async logStageEvent(userId: string, itemId: string, fromStage: string, toStage: string, reviewEventId: string): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('learner_stage_events')
      .insert({
        user_id: userId,
        learning_item_id: itemId,
        from_stage: fromStage,
        to_stage: toStage,
        source_review_event_id: reviewEventId,
        created_at: new Date().toISOString()
      })
    if (error) throw error
  },
}
