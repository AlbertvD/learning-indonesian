// src/services/learnerStateService.ts
import { supabase } from '@/lib/supabase'
import type { DailyGoalRollup, LearnerItemState, LearnerSkillState } from '@/types/learning'

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

  // Atomic. Counters increment server-side so duplicate exercises in one
  // session (which share a stale snapshot of LearnerSkillState) can't lose
  // increments via last-write-wins.
  async applyReviewToSkillState(input: {
    userId: string
    learningItemId: string
    skillType: string
    wasCorrect: boolean
    stability: number
    difficulty: number
    retrievability: number | null
    lastReviewedAt: string
    nextDueAt: string
    meanLatencyMs: number | null
  }): Promise<LearnerSkillState> {
    const { data, error } = await supabase
      .schema('indonesian')
      .rpc('apply_review_to_skill_state', {
        p_user_id: input.userId,
        p_learning_item_id: input.learningItemId,
        p_skill_type: input.skillType,
        p_was_correct: input.wasCorrect,
        p_stability: input.stability,
        p_difficulty: input.difficulty,
        p_retrievability: input.retrievability,
        p_last_reviewed_at: input.lastReviewedAt,
        p_next_due_at: input.nextDueAt,
        p_mean_latency_ms: input.meanLatencyMs,
      })
    if (error) throw error
    return data as LearnerSkillState
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
    // Only show items that are currently weak (stability < 2.0), not just historically troubled.
    // lapse_count is cumulative and never decreases, so without the stability filter
    // a recovered word would show as at-risk forever.
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('learning_item_id')
      .eq('user_id', userId)
      .gte('lapse_count', 3)
      .lt('stability', 2.0)

    if (error) throw error
    const unique = new Set(data.map((d: { learning_item_id: string }) => d.learning_item_id))
    return { count: unique.size }
  },

  async getDailyRollups(userId: string, limit = 7): Promise<DailyGoalRollup[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_daily_goal_rollups')
      .select('*')
      .eq('user_id', userId)
      .order('local_date', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).reverse()  // oldest-first for chart rendering
  },
}
