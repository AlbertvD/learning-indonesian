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

  async getSkillStatesBatch(userId: string): Promise<LearnerSkillState[]> {
    // Fetch all skill states for the user instead of filtering by itemIds
    // to avoid URL length limits when passing many UUIDs via .in()
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

  async getLapsingItems(userId: string): Promise<{ count: number }> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('learning_item_id')
      .eq('user_id', userId)
      .gte('lapse_count', 3)

    if (error) throw error
    const unique = new Set(data.map((d: { learning_item_id: string }) => d.learning_item_id))
    return { count: unique.size }
  },
}
