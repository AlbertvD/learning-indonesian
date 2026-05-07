// Decision tree rewritten in retirement #6: source-progress signals retired,
// lesson activation is the single "started" signal. Five surviving statuses:
//   later         — earlier lessons not satisfied (UNCHANGED — order-driven)
//   coming_later  — lesson has no page blocks yet (UNCHANGED — content-driven)
//   not_started   — lesson is published + prepared but not yet activated
//   in_progress   — lesson is activated; capabilities ready or not
//   in_practice   — practiced > 0 AND practiced < ready
//   practiced     — practiced > 0 AND practiced == ready
//
// The retired 'ready_to_practice' status was a function of source-progress
// exposure. Activation now subsumes its meaning ("user is ready").

export type LessonOverviewStatus =
  | 'not_started'
  | 'in_progress'
  | 'in_practice'
  | 'practiced'
  | 'later'
  | 'coming_later'

export interface LessonOverviewSignal {
  lessonId: string
  orderIndex: number
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
  return decideLessonOverviewStatus({
    ...signal,
    earlierLessonsSatisfied: true,
  }) === 'practiced'
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

  if (signal.hasStartedLesson) {
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

  const inPractice = earliestByStatus(signals, status => status === 'in_practice')
  if (inPractice) {
    return inPractice.lessonId
  }

  const notStarted = earliestByStatus(signals, status => status === 'not_started')
  if (notStarted) {
    return notStarted.lessonId
  }

  const satisfiedReadAhead = [...signals]
    .sort(byLessonOrder)
    .find(signal => signal.earlierLessonsSatisfied && isLessonSatisfiedForRecommendation(signal))

  return satisfiedReadAhead?.lessonId ?? null
}
