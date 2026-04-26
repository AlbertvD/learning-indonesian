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

export interface LessonPageBlock {
  id?: string
  block_key: string
  source_ref: string
  source_refs: string[]
  content_unit_slugs: string[]
  block_kind: 'hero' | 'section' | 'exposure' | 'practice_bridge' | 'recap'
  display_order: number
  payload_json: Record<string, unknown>
  source_progress_event: string | null
  capability_key_refs: string[]
}

export interface LessonSourceProgressRow {
  source_ref: string
  source_section_ref: string
  current_state: string
  completed_event_types: string[]
  last_event_at: string
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

  async getLessonsWithVoice(): Promise<{ id: string; order_index: number; primary_voice: string | null }[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('id, order_index, primary_voice')
      .order('order_index')
    if (error) throw error
    return (data ?? []) as { id: string; order_index: number; primary_voice: string | null }[]
  },

  async getLessonPageBlocks(sourceRef: string): Promise<LessonPageBlock[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lesson_page_blocks')
      .select('*')
      .eq('source_ref', sourceRef)
      .order('display_order')
    if (error) throw error
    return (data ?? []) as LessonPageBlock[]
  },

  async getLessonSourceProgress(userId: string, sourceRefs: string[]): Promise<LessonSourceProgressRow[]> {
    if (sourceRefs.length === 0) return []
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_source_progress_state')
      .select('source_ref, source_section_ref, current_state, completed_event_types, last_event_at')
      .eq('user_id', userId)
      .in('source_ref', [...new Set(sourceRefs)])
    if (error) throw error
    return (data ?? []) as LessonSourceProgressRow[]
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
