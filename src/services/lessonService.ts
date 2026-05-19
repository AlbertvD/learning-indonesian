// src/services/lessonService.ts
//
// Thin transport service for the lessons-bucket public URL helper and the
// lesson_progress read used by the Dashboard's "Continue where you left off"
// widget. Everything else folded into src/lib/lessons/adapter.ts as part of
// the lib/lessons/ fold (docs/plans/2026-05-18-fold-lib-lessons.md).
//
// Reasons these two stayed in services/:
// - getAudioUrl: long-form lesson audio bucket transport (per target arch
//   §lib/lessons "Not part of this module"). Stays in services/ as
//   transport.
// - getUserLessonProgress: reads lesson_progress; belongs in the
//   analytics/mastery fold, not lessons.

import { supabase } from '@/lib/supabase'

export const lessonService = {
  getAudioUrl(audioPath: string): string {
    const { data } = supabase.storage
      .from('indonesian-lessons')
      .getPublicUrl(audioPath)
    return data.publicUrl
  },

  async getUserLessonProgress(userId: string): Promise<import('@/types/progress').LessonProgress[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lesson_progress')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return (data ?? []) as import('@/types/progress').LessonProgress[]
  },
}
