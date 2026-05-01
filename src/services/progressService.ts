// src/services/progressService.ts
import { supabase } from '@/lib/supabase'
import { learnerProgressService } from '@/services/learnerProgressService'

// Voortgang-page surfaces. The four analytics methods here are now thin
// wrappers around learnerProgressService (the canonical contract for
// surfacing-layer reads). progressService stays as a façade so the existing
// useProgressData hook contract doesn't need to change in this PR; once the
// hook itself is refactored a future cleanup can collapse the indirection.
//
// markLessonComplete remains here because it's a pure write to lesson_progress,
// not an analytics read — it doesn't belong in learnerProgressService.

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
    const counts = await learnerProgressService.getRecallAccuracyByDirection({ userId })
    return {
      recognitionAccuracy: counts.recognitionTotal > 0
        ? counts.recognitionCorrect / counts.recognitionTotal
        : 0,
      recognitionSampleSize: counts.recognitionTotal,
      recallAccuracy: counts.recallTotal > 0
        ? counts.recallCorrect / counts.recallTotal
        : 0,
      recallSampleSize: counts.recallTotal,
    }
  },

  async getLapsePrevention(userId: string): Promise<{ atRisk: number; rescued: number }> {
    return learnerProgressService.getLapsePrevention({ userId })
  },

  async getVulnerableItems(userId: string): Promise<
    { id: string; indonesianText: string; meaning: string; lapseCount: number; consecutiveFailures: number }[]
  > {
    // Shape adapter: maps the new VulnerableCapability shape (capability-level)
    // back to the legacy VulnerableItem shape Voortgang expects. itemId → id,
    // baseText → indonesianText, consecutiveFailureCount → consecutiveFailures.
    const rows = await learnerProgressService.getVulnerableCapabilities({ userId })
    return rows.map(row => ({
      id: row.itemId,
      indonesianText: row.baseText,
      meaning: row.meaning,
      lapseCount: row.lapseCount,
      consecutiveFailures: row.consecutiveFailureCount,
    }))
  },

  async getAvgLatencyMs(userId: string): Promise<{ currentWeekMs: number | null; priorWeekMs: number | null }> {
    return learnerProgressService.getReviewLatencyStats({ userId })
  },
}
