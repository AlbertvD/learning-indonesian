import { formatGrammarTopicTag, type LessonGrammarTopic } from './adapter'

// The Lessons overview model. Per-lesson tile signals: activation
// (learner_lesson_activation EXISTS), % mastered (mastered / introducible), and
// % practiced (practiced / introducible) — the two nested progress bars. No
// status enum, no sequential order-gate, no recommended-lesson hero: those
// retired with overviewStatus.ts (see
// docs/plans/2026-06-09-lesson-status-two-sources-design.md). The tile redesign
// adding % practiced + the CEFR level badge is
// docs/plans/2026-06-09-lesson-tile-redesign-and-practiced-metric.md.

// Canonical practiced threshold: a capability is "practiced" once it has been
// reviewed at least once. Owned here in ONE place; the get_lessons_overview SQL
// `practiced_count` filter mirrors it (coalesce(review_count,0) >= this), kept in
// lockstep by scripts/__tests__/lessons-overview-mastery-parity.test.ts.
export const PRACTICED_MIN_REVIEWS = 1

export interface LessonOverviewModelLesson {
  id: string
  title: string
  level?: string | null
  order_index: number
  publication_status?: string | null
  is_published?: boolean | null
}

// Per-lesson learner facts, sourced from get_lessons_overview.
export interface LessonOverviewCapabilityCounts {
  lessonId: string
  isActivated: boolean
  masteredCount: number
  practicedCount: number
  introducibleCount: number
}

export interface LessonOverviewRow {
  lessonId: string
  orderIndex: number
  title: string
  // CEFR level (A1/A2/B1) for the tile badge; null when unset. Passthrough of
  // lessons.level (see docs/current-system/cefr-level-rubric.md).
  level: string | null
  isActivated: boolean
  masteredCount: number
  practicedCount: number
  introducibleCount: number
  // null when the lesson is not activated or has no introducible caps — the
  // tile then shows activation only, never "0/0". practicedPercent ≥
  // masteredPercent always (mastered ⊆ practiced).
  masteredPercent: number | null
  practicedPercent: number | null
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

// % practiced = practiced / introducible. Same null rule and clamp as
// lessonMasteredPercent, so the Geoefend bar behaves identically to Beheerst:
// null (bar hidden) when not activated or no introducible caps; 0 (a visible 0%
// bar) when activated with nothing practiced yet. practiced ⊇ mastered, so this
// is ≥ lessonMasteredPercent for the same row.
export function lessonPracticedPercent(input: {
  isActivated: boolean
  practicedCount: number
  introducibleCount: number
}): number | null {
  if (!input.isActivated || input.introducibleCount <= 0) return null
  const practiced = Math.max(0, Math.min(input.practicedCount, input.introducibleCount))
  return Math.round((practiced / input.introducibleCount) * 100)
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
    const practicedCount = Math.max(0, counts?.practicedCount ?? 0)
    const introducibleCount = Math.max(0, counts?.introducibleCount ?? 0)
    const isPrepared = preparedLessonIds.has(lesson.id)
    return {
      lessonId: lesson.id,
      orderIndex: lesson.order_index,
      title: lesson.title,
      level: lesson.level ?? null,
      isActivated,
      masteredCount,
      practicedCount,
      introducibleCount,
      masteredPercent: lessonMasteredPercent({ isActivated, masteredCount, introducibleCount }),
      practicedPercent: lessonPracticedPercent({ isActivated, practicedCount, introducibleCount }),
      isPrepared,
      href: isPrepared ? `/lesson/${lesson.id}` : null,
      grammarTopicTag: formatGrammarTopicTag(input.grammarTopics, lesson.id),
    }
  })

  return { rows }
}
