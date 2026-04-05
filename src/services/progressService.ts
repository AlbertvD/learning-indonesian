// src/services/progressService.ts
import { supabase } from '@/lib/supabase'

export const progressService = {
  async markLessonComplete(userId: string, lessonId: string, sectionsCompleted: string[]): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('lesson_progress')
      .upsert({
        user_id: userId,
        lesson_id: lessonId,
        completed_at: new Date().toISOString(),
        sections_completed: sectionsCompleted,
      }, { onConflict: 'user_id,lesson_id' })
    if (error) throw error
  },

  async getAccuracyBySkillType(userId: string): Promise<{
    recognitionAccuracy: number
    recognitionSampleSize: number
    recallAccuracy: number
    recallSampleSize: number
  }> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('review_events')
      .select('skill_type, was_correct')
      .eq('user_id', userId)
      .in('skill_type', ['recognition', 'form_recall'])
    if (error) throw error

    const rows = data ?? []
    const rec = rows.filter(e => e.skill_type === 'recognition')
    const recall = rows.filter(e => e.skill_type === 'form_recall')

    return {
      recognitionAccuracy: rec.length > 0 ? rec.filter(e => e.was_correct).length / rec.length : 0,
      recognitionSampleSize: rec.length,
      recallAccuracy: recall.length > 0 ? recall.filter(e => e.was_correct).length / recall.length : 0,
      recallSampleSize: recall.length,
    }
  },

  async getLapsePrevention(userId: string): Promise<{ atRisk: number; rescued: number }> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('lapse_count, consecutive_failures, last_reviewed_at')
      .eq('user_id', userId)
      .gt('lapse_count', 0)
    if (error) throw error

    const rows = data ?? []
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    return {
      atRisk: rows.filter(s => s.consecutive_failures > 0).length,
      rescued: rows.filter(s =>
        s.lapse_count > 0 &&
        s.consecutive_failures === 0 &&
        s.last_reviewed_at != null &&
        new Date(s.last_reviewed_at) >= sevenDaysAgo
      ).length,
    }
  },

  async getVulnerableItems(userId: string): Promise<
    { id: string; indonesianText: string; lapseCount: number; consecutiveFailures: number }[]
  > {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select('learning_item_id, lapse_count, consecutive_failures, learning_items!inner(base_text)')
      .eq('user_id', userId)
      .gt('lapse_count', 0)
      .order('lapse_count', { ascending: false })
      .limit(10)
    if (error) throw error

    return (data ?? []).map(row => ({
      id: row.learning_item_id,
      indonesianText: (row as any).learning_items.base_text,
      lapseCount: row.lapse_count,
      consecutiveFailures: row.consecutive_failures,
    }))
  },
}
