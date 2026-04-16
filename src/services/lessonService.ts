// src/services/lessonService.ts
import { supabase } from '@/lib/supabase'

export interface Lesson {
  id: string
  module_id: string
  level: string
  title: string
  description: string | null
  order_index: number
  created_at: string
  audio_path: string | null
  duration_seconds: number | null
  transcript_dutch: string | null
  transcript_indonesian: string | null
  transcript_english: string | null
  primary_voice: string | null
  dialogue_voices: Record<string, string> | null
  lesson_sections: LessonSection[]
}

export interface LessonSection {
  id: string
  lesson_id: string
  title: string
  content: string | Record<string, unknown>
  order_index: number
}

export const lessonService = {
  async getLessons(): Promise<Lesson[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('*, lesson_sections(*)')
      .order('order_index')
      .order('order_index', { referencedTable: 'lesson_sections' })
    if (error) throw error
    return data as Lesson[]
  },

  async getLesson(lessonId: string): Promise<Lesson> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('*, lesson_sections(*)')
      .eq('id', lessonId)
      .order('order_index', { referencedTable: 'lesson_sections' })
      .single()
    if (error) throw error
    return data as Lesson
  },

  getAudioUrl(audioPath: string): string {
    const { data } = supabase.storage
      .from('indonesian-lessons')
      .getPublicUrl(audioPath)
    return data.publicUrl
  },

  async getLessonsBasic(): Promise<{ id: string; order_index: number }[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('id, order_index')
      .order('order_index')
    if (error) throw error
    return (data ?? []) as { id: string; order_index: number }[]
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
