import {
  decideLessonOverviewStatus,
  formatGrammarTopicTag,
  isLessonSatisfiedForRecommendation,
  overviewActionLabel,
  recommendLesson,
  type LessonGrammarTopic,
  type LessonOverviewSignal,
  type LessonOverviewStatus,
} from '@/lib/lessons/lessonOverviewStatus'

export interface LessonOverviewModelLesson {
  id: string
  title: string
  order_index: number
  publication_status?: string | null
  is_published?: boolean | null
}

export type LessonOverviewExposureKind =
  | 'lesson'
  | 'grammar'
  | 'dialogue'
  | 'culture'
  | 'pronunciation'

export interface LessonOverviewExposure {
  lessonId: string
  exposureKind: LessonOverviewExposureKind
  started: boolean
  meaningful: boolean
}

export interface LessonOverviewCapabilityCounts {
  lessonId: string
  readyItemCount: number
  practicedEligibleItemCount: number
  eligibleIntroducedItemCount: number
  hasAuthoredEligiblePracticeContent: boolean
}

export interface LessonOverviewRow {
  lessonId: string
  orderIndex: number
  title: string
  status: LessonOverviewStatus
  actionLabel: 'Open lesson' | 'Continue'
  href: string
  grammarTopicTag: string | null
}

export interface LessonOverviewModel {
  recommendedLessonId: string | null
  recommendedRow: LessonOverviewRow | null
  rows: LessonOverviewRow[]
}

const LEARNING_EXPOSURE_KINDS = new Set<LessonOverviewExposureKind>(['grammar', 'dialogue'])
const STARTED_EXPOSURE_KINDS = new Set<LessonOverviewExposureKind>(['lesson', 'grammar', 'dialogue'])

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

function defaultSignal(lesson: LessonOverviewModelLesson): LessonOverviewSignal {
  return {
    lessonId: lesson.id,
    orderIndex: lesson.order_index,
    hasMeaningfulExposure: false,
    readyItemCount: 0,
    practicedEligibleItemCount: 0,
    eligibleIntroducedItemCount: 0,
    hasAuthoredEligiblePracticeContent: true,
    hasStartedLesson: false,
    earlierLessonsSatisfied: true,
  }
}

function normalizeSignalsForLessons(
  lessons: LessonOverviewModelLesson[],
  signals: LessonOverviewSignal[],
): LessonOverviewSignal[] {
  const signalByLessonId = new Map(signals.map(signal => [signal.lessonId, signal]))
  let earlierLessonsSatisfied = true

  return publishedLessons(lessons).map(lesson => {
    const rawSignal = signalByLessonId.get(lesson.id)
    const normalizedSignal: LessonOverviewSignal = {
      ...defaultSignal(lesson),
      ...rawSignal,
      lessonId: lesson.id,
      orderIndex: lesson.order_index,
      earlierLessonsSatisfied: earlierLessonsSatisfied && rawSignal?.earlierLessonsSatisfied !== false,
    }
    earlierLessonsSatisfied = earlierLessonsSatisfied && isLessonSatisfiedForRecommendation(normalizedSignal)
    return normalizedSignal
  })
}

export function buildLessonOverviewSignals(input: {
  lessons: LessonOverviewModelLesson[]
  exposures: LessonOverviewExposure[]
  capabilityCounts: LessonOverviewCapabilityCounts[]
}): LessonOverviewSignal[] {
  const exposuresByLessonId = new Map<string, LessonOverviewExposure[]>()
  for (const exposure of input.exposures) {
    exposuresByLessonId.set(
      exposure.lessonId,
      [...(exposuresByLessonId.get(exposure.lessonId) ?? []), exposure],
    )
  }
  const countsByLessonId = new Map(input.capabilityCounts.map(count => [count.lessonId, count]))

  const signals = publishedLessons(input.lessons).map(lesson => {
    const lessonExposures = exposuresByLessonId.get(lesson.id) ?? []
    const counts = countsByLessonId.get(lesson.id)
    const hasMeaningfulExposure = lessonExposures.some(exposure =>
      exposure.meaningful && LEARNING_EXPOSURE_KINDS.has(exposure.exposureKind),
    )
    const hasStartedLesson = lessonExposures.some(exposure =>
      exposure.started && STARTED_EXPOSURE_KINDS.has(exposure.exposureKind),
    )

    return {
      ...defaultSignal(lesson),
      ...counts,
      hasMeaningfulExposure,
      hasStartedLesson,
    }
  })

  return normalizeSignalsForLessons(input.lessons, signals)
}

export function buildLessonOverviewModel(input: {
  lessons: LessonOverviewModelLesson[]
  signals: LessonOverviewSignal[]
  grammarTopics: LessonGrammarTopic[]
}): LessonOverviewModel {
  const lessons = publishedLessons(input.lessons)
  const normalizedSignals = normalizeSignalsForLessons(lessons, input.signals)
  const signalByLessonId = new Map(normalizedSignals.map(signal => [signal.lessonId, signal]))

  const rows = lessons.map((lesson): LessonOverviewRow => {
    const signal = signalByLessonId.get(lesson.id) ?? defaultSignal(lesson)
    const status = decideLessonOverviewStatus(signal)
    return {
      lessonId: lesson.id,
      orderIndex: lesson.order_index,
      title: lesson.title,
      status,
      actionLabel: overviewActionLabel(status),
      href: `/lesson/${lesson.id}`,
      grammarTopicTag: formatGrammarTopicTag(input.grammarTopics, lesson.id),
    }
  })

  const recommendedLessonId = recommendLesson(normalizedSignals)
  const recommendedRow = rows.find(row => row.lessonId === recommendedLessonId) ?? null

  return {
    recommendedLessonId,
    recommendedRow,
    rows,
  }
}
