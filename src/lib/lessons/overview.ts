import { formatGrammarTopicTag, type LessonGrammarTopic } from './adapter'

// The Lessons overview model. Two single-sourced facts per lesson tile —
// activation (learner_lesson_activation EXISTS) and % mastered
// (mastered / introducible). No status enum, no sequential order-gate, no
// recommended-lesson hero: those retired with overviewStatus.ts (see
// docs/plans/2026-06-09-lesson-status-two-sources-design.md).

export interface LessonOverviewModelLesson {
  id: string
  title: string
  order_index: number
  publication_status?: string | null
  is_published?: boolean | null
}

// Per-lesson learner facts, sourced from get_lessons_overview.
export interface LessonOverviewCapabilityCounts {
  lessonId: string
  isActivated: boolean
  masteredCount: number
  introducibleCount: number
}

export interface LessonOverviewRow {
  lessonId: string
  orderIndex: number
  title: string
  isActivated: boolean
  masteredCount: number
  introducibleCount: number
  // null when the lesson is not activated or has no introducible caps — the
  // tile then shows activation only, never "0/0".
  masteredPercent: number | null
  isPrepared: boolean
  href: string | null
  grammarTopicTag: string | null
}

export interface LessonOverviewModel {
  rows: LessonOverviewRow[]
}

export function isPublishedOverviewLesson(lesson: LessonOverviewModelLesson): boolean {
  if (lesson.is_published === false) return false
  if (typeof lesson.publication_status === 'string') {
    return lesson.publication_status === 'published'
  }
  return true
}

function byLessonOrder(a: LessonOverviewModelLesson, b: LessonOverviewModelLesson): number {
  return a.order_index - b.order_index
}

function publishedLessons(lessons: LessonOverviewModelLesson[]): LessonOverviewModelLesson[] {
  return lessons.filter(isPublishedOverviewLesson).sort(byLessonOrder)
}

// % mastered = mastered / introducible, or null when there's nothing to show
// (not activated, or no introducible caps). Clamped so a transient count skew
// can't exceed 100%.
export function lessonMasteredPercent(input: {
  isActivated: boolean
  masteredCount: number
  introducibleCount: number
}): number | null {
  if (!input.isActivated || input.introducibleCount <= 0) return null
  const mastered = Math.max(0, Math.min(input.masteredCount, input.introducibleCount))
  return Math.round((mastered / input.introducibleCount) * 100)
}

export function buildLessonOverviewModel(input: {
  lessons: LessonOverviewModelLesson[]
  counts: LessonOverviewCapabilityCounts[]
  grammarTopics: LessonGrammarTopic[]
  preparedLessonIds: string[]
}): LessonOverviewModel {
  const lessons = publishedLessons(input.lessons)
  const countsByLessonId = new Map(input.counts.map(count => [count.lessonId, count]))
  const preparedLessonIds = new Set(input.preparedLessonIds)

  const rows = lessons.map((lesson): LessonOverviewRow => {
    const counts = countsByLessonId.get(lesson.id)
    const isActivated = counts?.isActivated ?? false
    const masteredCount = Math.max(0, counts?.masteredCount ?? 0)
    const introducibleCount = Math.max(0, counts?.introducibleCount ?? 0)
    const isPrepared = preparedLessonIds.has(lesson.id)
    return {
      lessonId: lesson.id,
      orderIndex: lesson.order_index,
      title: lesson.title,
      isActivated,
      masteredCount,
      introducibleCount,
      masteredPercent: lessonMasteredPercent({ isActivated, masteredCount, introducibleCount }),
      isPrepared,
      href: isPrepared ? `/lesson/${lesson.id}` : null,
      grammarTopicTag: formatGrammarTopicTag(input.grammarTopics, lesson.id),
    }
  })

  return { rows }
}
