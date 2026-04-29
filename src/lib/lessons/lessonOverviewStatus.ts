export type LessonOverviewStatus =
  | 'not_started'
  | 'in_progress'
  | 'ready_to_practice'
  | 'in_practice'
  | 'practiced'
  | 'later'

export interface LessonOverviewSignal {
  lessonId: string
  orderIndex: number
  hasMeaningfulExposure: boolean
  readyItemCount: number
  practicedEligibleItemCount: number
  eligibleIntroducedItemCount: number
  hasAuthoredEligiblePracticeContent: boolean
  hasStartedLesson: boolean
  earlierLessonsSatisfied: boolean
}

export interface LessonGrammarTopic {
  lessonId: string
  label: string
}

export function isLessonSatisfiedForRecommendation(signal: LessonOverviewSignal): boolean {
  const status = decideLessonOverviewStatus({
    ...signal,
    earlierLessonsSatisfied: true,
  })
  return (
    status === 'practiced'
    || (signal.hasMeaningfulExposure && !signal.hasAuthoredEligiblePracticeContent)
  )
}

export function decideLessonOverviewStatus(signal: LessonOverviewSignal): LessonOverviewStatus {
  if (!signal.earlierLessonsSatisfied) {
    return 'later'
  }

  if (
    signal.eligibleIntroducedItemCount > 0
    && signal.practicedEligibleItemCount >= signal.eligibleIntroducedItemCount
  ) {
    return 'practiced'
  }

  if (
    signal.eligibleIntroducedItemCount > 0
    && signal.practicedEligibleItemCount > 0
    && signal.practicedEligibleItemCount < signal.eligibleIntroducedItemCount
  ) {
    return 'in_practice'
  }

  if (
    signal.hasMeaningfulExposure
    && signal.readyItemCount > 0
    && signal.practicedEligibleItemCount === 0
  ) {
    return 'ready_to_practice'
  }

  if (signal.hasStartedLesson || signal.hasMeaningfulExposure) {
    return 'in_progress'
  }

  return 'not_started'
}

export function overviewActionLabel(status: LessonOverviewStatus): 'Open lesson' | 'Continue' {
  return status === 'in_progress' || status === 'in_practice' ? 'Continue' : 'Open lesson'
}

export function formatGrammarTopicTag(topics: LessonGrammarTopic[], lessonId: string): string | null {
  const lessonTopics = topics
    .filter(topic => topic.lessonId === lessonId)
    .map(topic => topic.label.trim())
    .filter(Boolean)

  if (lessonTopics.length === 0) {
    return null
  }

  const visibleTopics = lessonTopics.slice(0, 2)
  const remainingCount = lessonTopics.length - visibleTopics.length
  const suffix = remainingCount > 0 ? ` +${remainingCount} more` : ''
  return `Grammar: ${visibleTopics.join(', ')}${suffix}`
}

function byLessonOrder(a: LessonOverviewSignal, b: LessonOverviewSignal): number {
  return a.orderIndex - b.orderIndex
}

function earliestByStatus(
  signals: LessonOverviewSignal[],
  predicate: (status: LessonOverviewStatus, signal: LessonOverviewSignal) => boolean,
): LessonOverviewSignal | undefined {
  return [...signals]
    .sort(byLessonOrder)
    .find(signal => predicate(decideLessonOverviewStatus(signal), signal))
}

export function recommendLesson(signals: LessonOverviewSignal[]): string | null {
  if (signals.length === 0) {
    return null
  }

  const inProgress = earliestByStatus(
    signals,
    (status, signal) => status === 'in_progress' && !isLessonSatisfiedForRecommendation(signal),
  )
  if (inProgress) {
    return inProgress.lessonId
  }

  const readyOrInPractice = earliestByStatus(
    signals,
    status => status === 'ready_to_practice' || status === 'in_practice',
  )
  if (readyOrInPractice) {
    return readyOrInPractice.lessonId
  }

  const notStarted = earliestByStatus(
    signals,
    status => status === 'not_started',
  )
  if (notStarted) {
    return notStarted.lessonId
  }

  const satisfiedReadAhead = [...signals]
    .sort(byLessonOrder)
    .find(signal => signal.earlierLessonsSatisfied && isLessonSatisfiedForRecommendation(signal))

  return satisfiedReadAhead?.lessonId ?? null
}
