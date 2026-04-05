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
    { id: string; indonesianText: string; meaning: string; lapseCount: number; consecutiveFailures: number }[]
  > {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_skill_state')
      .select(`
        learning_item_id,
        lapse_count,
        consecutive_failures,
        learning_items!inner(
          base_text,
          item_meanings(translation_text, is_primary, translation_language)
        )
      `)
      .eq('user_id', userId)
      .gt('lapse_count', 0)
      .order('lapse_count', { ascending: false })
      .limit(10)
    if (error) throw error

    return (data ?? []).map(row => {
      const li = (row as any).learning_items
      const meanings: { translation_text: string; is_primary: boolean; translation_language: string }[] = li.item_meanings ?? []
      const meaning =
        meanings.find(m => m.is_primary && m.translation_language === 'nl')?.translation_text ??
        meanings.find(m => m.translation_language === 'nl')?.translation_text ??
        meanings.find(m => m.is_primary)?.translation_text ??
        ''
      return {
        id: row.learning_item_id,
        indonesianText: li.base_text,
        meaning,
        lapseCount: row.lapse_count,
        consecutiveFailures: row.consecutive_failures,
      }
    })
  },

  async getAvgLatencyMs(userId: string): Promise<{ currentWeekMs: number | null; priorWeekMs: number | null }> {
    const now = new Date()
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const priorWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const { data, error } = await supabase
      .schema('indonesian')
      .from('review_events')
      .select('latency_ms, created_at')
      .eq('user_id', userId)
      .not('latency_ms', 'is', null)
      .gte('created_at', priorWeekStart.toISOString())

    if (error) throw error
    const rows = data ?? []

    const currentWeekRows = rows.filter(r => new Date(r.created_at!) >= weekStart)
    const priorWeekRows = rows.filter(r => {
      const d = new Date(r.created_at!)
      return d >= priorWeekStart && d < weekStart
    })

    const avgMs = (arr: typeof rows): number | null =>
      arr.length > 0 ? Math.round(arr.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / arr.length) : null

    return { currentWeekMs: avgMs(currentWeekRows), priorWeekMs: avgMs(priorWeekRows) }
  },
}
