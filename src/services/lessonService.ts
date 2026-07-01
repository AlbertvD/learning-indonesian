// src/services/lessonService.ts
//
// Thin transport service for the lessons-bucket public URL helper. Everything
// else folded into src/lib/lessons/adapter.ts as part of the lib/lessons/ fold
// (docs/plans/2026-05-18-fold-lib-lessons.md).
//
// getAudioUrl stays in services/ as long-form lesson audio bucket transport (per
// target arch §lib/lessons "Not part of this module").
// (getUserLessonProgress removed 2026-07-01 with the lesson_progress table — #150.)

import { supabase } from '@/lib/supabase'

export const lessonService = {
  getAudioUrl(audioPath: string): string {
    const { data } = supabase.storage
      .from('indonesian-lessons')
      .getPublicUrl(audioPath)
    return data.publicUrl
  },
}
