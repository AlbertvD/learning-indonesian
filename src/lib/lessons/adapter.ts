// src/lib/lessons/adapter.ts
//
// I/O adapter for the lessons module. Hides the Supabase schema name
// (`indonesian`), table names, the `get_lessons_overview` RPC, snake → camel
// mapping conventions, and the source_ref convention
// (`lesson-${order_index}`).
//
// Folded from src/services/lessonService.ts in commit 6 of the lib/lessons/
// fold (docs/plans/2026-05-18-fold-lib-lessons.md). Two methods stayed in
// services/lessonService.ts:
//   - getAudioUrl: long-form lesson audio bucket transport
//   - getUserLessonProgress: reads lesson_progress (Dashboard concern; will
//     migrate during the analytics/mastery fold)

import { supabase } from '@/lib/supabase'
import { chunkedIn } from '@/lib/chunkedQuery'
import type { LessonGrammarTopic } from './overviewStatus'

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
  block_kind:
    | 'lesson_hero'
    | 'reading_section'
    | 'vocab_strip'
    | 'dialogue_card'
    | 'pattern_callout'
    | 'practice_bridge'
    | 'lesson_recap'
    // Legacy 5-value enum (lessons authored before the GT2 backfill). The
    // runtime classifier in experience.ts:40-71 still handles these until a
    // future PR audits the live DB + retires the bridging classifier.
    | 'hero'
    | 'section'
    | 'exposure'
    | 'recap'
  display_order: number
  payload_json: Record<string, unknown>
}

export interface LessonCapabilityPracticeSummary {
  readyCapabilityCount: number
  activePracticedCapabilityCount: number
}

export interface LessonOverviewSourceBlock {
  source_ref: string
  source_refs?: string[] | null
}

// One row per lesson returned by indonesian.get_lessons_overview(p_user_id).
// Mirrors the SQL function's RETURNS TABLE shape exactly.
export interface LessonOverviewRpcRow {
  lesson_id: string
  order_index: number
  title: string
  description: string | null
  audio_path: string | null
  duration_seconds: number | null
  primary_voice: string | null
  publication_status: string | null
  is_published: boolean | null
  lesson_sections: LessonSection[]
  has_started_lesson: boolean
  has_page_blocks: boolean
  ready_capability_count: number
  practiced_eligible_capability_count: number
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

export async function getLessons(): Promise<Lesson[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('*, lesson_sections(*)')
    .order('order_index')
    .order('order_index', { referencedTable: 'lesson_sections' })
  if (error) throw error
  return data as Lesson[]
}

export async function getLesson(lessonId: string): Promise<Lesson> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('*, lesson_sections(*)')
    .eq('id', lessonId)
    .order('order_index', { referencedTable: 'lesson_sections' })
    .single()
  if (error) throw error
  return data as Lesson
}

export async function getLessonsBasic(): Promise<{ id: string; order_index: number }[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index')
    .order('order_index')
  if (error) throw error
  return (data ?? []) as { id: string; order_index: number }[]
}

export async function getLessonsWithVoice(): Promise<{ id: string; order_index: number; primary_voice: string | null }[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index, primary_voice')
    .order('order_index')
  if (error) throw error
  return (data ?? []) as { id: string; order_index: number; primary_voice: string | null }[]
}

export async function getLessonPageBlocks(sourceRef: string): Promise<LessonPageBlock[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lesson_page_blocks')
    .select('*')
    .eq('source_ref', sourceRef)
    .order('display_order')
  if (error) throw error
  return (data ?? []) as LessonPageBlock[]
}

export async function getLessonCapabilityPracticeSummary(
  userId: string,
  sourceRefs: string[],
): Promise<LessonCapabilityPracticeSummary> {
  const uniqueSourceRefs = [...new Set(sourceRefs)].filter(Boolean)
  if (uniqueSourceRefs.length === 0) return { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 }

  const { data: capabilityRows, error: capabilityError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id')
    .in('source_ref', uniqueSourceRefs)
    .eq('readiness_status', 'ready')
    .eq('publication_status', 'published')
  if (capabilityError) throw capabilityError

  const capabilityIds = ((capabilityRows ?? []) as Array<{ id: string }>).map(row => row.id)
  if (capabilityIds.length === 0) return { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 }

  const stateRows = await chunkedIn<{
    activation_state: string | null
    review_count: number | null
  }>(
    'learner_capability_state',
    'capability_id',
    capabilityIds,
    (b) => b.select('capability_id, activation_state, review_count').eq('user_id', userId),
  )

  const activePracticedCapabilityCount = stateRows
    .filter(row => row.activation_state === 'active' && (row.review_count ?? 0) > 0).length

  return {
    readyCapabilityCount: capabilityIds.length,
    activePracticedCapabilityCount,
  }
}

// Phase 1 of retiring lesson_page_blocks (2026-05-20): same shape as
// getLessonCapabilityPracticeSummary, but keyed on learning_capabilities.lesson_id
// (ADR 0006) instead of source_refs derived from page-block fan-out. Used by
// PracticeActions.tsx; the old source_refs[]-based variant stays alive for
// Lesson.tsx (legacy renderer code path for lessons 4-9).
export async function getLessonCapabilityPracticeSummaryByLessonId(
  userId: string,
  lessonId: string,
): Promise<LessonCapabilityPracticeSummary> {
  const { data: capabilityRows, error: capabilityError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('readiness_status', 'ready')
    .eq('publication_status', 'published')
  if (capabilityError) throw capabilityError

  const capabilityIds = ((capabilityRows ?? []) as Array<{ id: string }>).map(r => r.id)
  if (capabilityIds.length === 0) {
    return { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 }
  }

  const stateRows = await chunkedIn<{
    activation_state: string | null
    review_count: number | null
  }>(
    'learner_capability_state',
    'capability_id',
    capabilityIds,
    (b) => b.select('capability_id, activation_state, review_count').eq('user_id', userId),
  )
  const activePracticedCapabilityCount = stateRows
    .filter(row => row.activation_state === 'active' && (row.review_count ?? 0) > 0).length
  return { readyCapabilityCount: capabilityIds.length, activePracticedCapabilityCount }
}

// One-shot read for the Lessons overview page. The SQL function returns the
// per-lesson kind-classification + meaningful-events shape that Lessons.tsx
// consumes — see scripts/migrations/2026-05-02-lessons-overview-function.sql.
export async function getLessonsOverview(userId: string): Promise<LessonOverviewRpcRow[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('get_lessons_overview', { p_user_id: userId })
  if (error) throw error
  return (data ?? []) as LessonOverviewRpcRow[]
}
