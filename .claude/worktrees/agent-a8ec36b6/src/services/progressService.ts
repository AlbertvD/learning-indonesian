// src/services/progressService.ts
import { supabase } from '@/lib/supabase'
import type { UserProgress } from '@/types/progress'

export const progressService = {
  async getUserProgress(userId: string): Promise<UserProgress | null> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async upsertProgress(userId: string, updates: Partial<Omit<UserProgress, 'id' | 'user_id' | 'created_at'>>): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('user_progress')
      .upsert({ user_id: userId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) throw error
  },

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
}
