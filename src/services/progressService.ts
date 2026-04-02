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
}
