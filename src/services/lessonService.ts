// src/services/lessonService.ts
import { supabase } from '@/lib/supabase'
import type { LessonGrammarTopic } from '@/lib/lessons/lessonOverviewStatus'

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

export interface LessonCapabilityPracticeSummary {
  activePracticedCapabilityCount: number
}

export interface LessonOverviewSourceBlock {
  source_ref: string
  source_refs?: string[] | null
}

export function lessonSourceRefForOverview(lesson: Pick<Lesson, 'order_index'>): string {
  return `lesson-${lesson.order_index}`
}

export function lessonSourceRefsByLesson(
  lessons: Array<Pick<Lesson, 'id' | 'order_index'>>,
  pageBlocks: LessonOverviewSourceBlock[] = [],
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const lessonIdByCanonicalSourceRef = new Map<string, string>()

  for (const lesson of lessons) {
    const canonicalSourceRef = lessonSourceRefForOverview(lesson)
    lessonIdByCanonicalSourceRef.set(canonicalSourceRef, lesson.id)
    result.set(lesson.id, [canonicalSourceRef])
  }

  for (const block of pageBlocks) {
    const lessonId = lessonIdByCanonicalSourceRef.get(block.source_ref)
    if (!lessonId) continue
    const refs = result.get(lessonId) ?? []
    result.set(lessonId, [...new Set([...refs, ...(block.source_refs ?? [block.source_ref])])])
  }

  return result
}

function trimTopic(label: string): string {
  return label
    .replace(/^\s*(grammar|grammatica)\s*:?\s*/i, '')
    .trim()
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function categoryTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const title = (item as Record<string, unknown>).title
    return typeof title === 'string' && title.trim() ? [title] : []
  })
}

function grammarTopicLabels(section: LessonSection): string[] {
  if (!section.content || typeof section.content !== 'object') return []
  const content = section.content as Record<string, unknown>
  const type = content.type
  if (type !== 'grammar' && type !== 'reference_table') return []

  const explicitTopics = [
    ...stringList(content.grammarTopics),
    ...stringList(content.grammar_topics),
  ]
  const categories = categoryTitles(content.categories)
  const contentTitle = typeof content.title === 'string' ? [content.title] : []
  const fallbackTitle = section.title ? [section.title] : []

  return (explicitTopics.length > 0
    ? explicitTopics
    : categories.length > 0
      ? categories
      : contentTitle.length > 0
        ? contentTitle
        : fallbackTitle)
    .map(trimTopic)
    .filter(Boolean)
}

export function extractLessonGrammarTopics(lessons: Array<Pick<Lesson, 'id' | 'lesson_sections'>>): LessonGrammarTopic[] {
  const topics: LessonGrammarTopic[] = []
  const seen = new Set<string>()

  for (const lesson of lessons) {
    for (const section of lesson.lesson_sections ?? []) {
      for (const label of grammarTopicLabels(section)) {
        const key = `${lesson.id}:${label.toLocaleLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        topics.push({ lessonId: lesson.id, label })
      }
    }
  }

  return topics
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

  async getLessonCapabilityPracticeSummary(userId: string, sourceRefs: string[]): Promise<LessonCapabilityPracticeSummary> {
    const uniqueSourceRefs = [...new Set(sourceRefs)].filter(Boolean)
    if (uniqueSourceRefs.length === 0) return { activePracticedCapabilityCount: 0 }

    const { data: capabilityRows, error: capabilityError } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('id')
      .in('source_ref', uniqueSourceRefs)
      .eq('readiness_status', 'ready')
      .eq('publication_status', 'published')
    if (capabilityError) throw capabilityError

    const capabilityIds = ((capabilityRows ?? []) as Array<{ id: string }>).map(row => row.id)
    if (capabilityIds.length === 0) return { activePracticedCapabilityCount: 0 }

    const { data: stateRows, error: stateError } = await supabase
      .schema('indonesian')
      .from('learner_capability_state')
      .select('capability_id, activation_state, review_count')
      .eq('user_id', userId)
      .in('capability_id', capabilityIds)
    if (stateError) throw stateError

    const activePracticedCapabilityCount = ((stateRows ?? []) as Array<{
      activation_state: string | null
      review_count: number | null
    }>).filter(row => row.activation_state === 'active' && (row.review_count ?? 0) > 0).length

    return { activePracticedCapabilityCount }
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
