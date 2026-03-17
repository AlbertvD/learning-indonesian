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
