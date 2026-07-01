// src/lib/lessons/adapter.ts
//
// I/O adapter for the lessons module. Hides the Supabase schema name
// (`indonesian`), table names, the `get_lessons_overview` RPC, snake → camel
// mapping conventions, and the source_ref convention
// (`lesson-${order_index}`).
//
// Folded from src/services/lessonService.ts in commit 6 of the lib/lessons/
// fold (docs/plans/2026-05-18-fold-lib-lessons.md). getAudioUrl (long-form
// lesson audio bucket transport) stayed in services/lessonService.ts.
// (getUserLessonProgress was removed 2026-07-01 with the lesson_progress table — #150.)

import { supabase } from '@/lib/supabase'
import { chunkedIn } from '@/lib/chunkedQuery'

// A grammar topic tag shown on a lesson tile. Moved here (with
// formatGrammarTopicTag, below) from the retired overviewStatus.ts — this is the
// seam where extractLessonGrammarTopics already produces LessonGrammarTopic[].
export interface LessonGrammarTopic {
  lessonId: string
  label: string
}

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
  level: string | null
  description: string | null
  audio_path: string | null
  duration_seconds: number | null
  primary_voice: string | null
  publication_status: string | null
  is_published: boolean | null
  lesson_sections: LessonSection[]
  is_activated: boolean
  ready_capability_count: number
  mastered_capability_count: number
  practiced_capability_count: number
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

// Renders ALL of a lesson's grammar topics into a tile tag, comma-joined, e.g.
// "negation, possessives, questions". No cap / "+N more" — the tile shows the
// full list and the page grid equalises tile heights (see the lesson-tile
// redesign). Returns null when the lesson has no grammar topics. Moved from
// overviewStatus.ts (retired 2026-06-09).
export function formatGrammarTopicTag(topics: LessonGrammarTopic[], lessonId: string): string | null {
  const lessonTopics = topics
    .filter(topic => topic.lessonId === lessonId)
    .map(topic => topic.label.trim())
    .filter(Boolean)

  if (lessonTopics.length === 0) {
    return null
  }

  return lessonTopics.join(', ')
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

// Distinct source_refs of a lesson's ready+published capabilities, scoped by
// learning_capabilities.lesson_id (ADR 0006). Feeds the lesson_practice /
// lesson_review session scope (Session.tsx) — replacing the retired
// lesson_page_blocks fan-out. The session-builder still matches caps by
// selectedSourceRefs.includes(cap.sourceRef); only the data source changed.
export async function getLessonSourceRefsByLessonId(lessonId: string): Promise<string[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('source_ref')
    .eq('lesson_id', lessonId)
    .eq('readiness_status', 'ready')
    .eq('publication_status', 'published')
    .is('retired_at', null)
  if (error) throw error
  return [...new Set(((data ?? []) as Array<{ source_ref: string }>).map(r => r.source_ref).filter(Boolean))]
}

// Lesson practice summary keyed on learning_capabilities.lesson_id (ADR 0006).
// Used by PracticeActions.tsx. The legacy source_refs[]-based variant and its
// page-block fan-out were removed when the generic reader path was retired.
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
    .is('retired_at', null)
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
