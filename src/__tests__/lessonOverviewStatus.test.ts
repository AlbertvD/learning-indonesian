import { describe, expect, it } from 'vitest'
import {
  decideLessonOverviewStatus,
  formatGrammarTopicTag,
  overviewActionLabel,
  recommendLesson,
  type LessonOverviewSignal,
} from '@/lib/lessons/lessonOverviewStatus'

function signal(overrides: Partial<LessonOverviewSignal> = {}): LessonOverviewSignal {
  return {
    lessonId: 'lesson-1',
    orderIndex: 1,
    hasMeaningfulExposure: false,
    readyItemCount: 0,
    practicedEligibleItemCount: 0,
    eligibleIntroducedItemCount: 0,
    hasAuthoredEligiblePracticeContent: true,
    hasStartedLesson: false,
    earlierLessonsSatisfied: true,
    ...overrides,
  }
}

describe('lesson overview status', () => {
  it('maps lesson signals to learner-facing statuses', () => {
    expect(decideLessonOverviewStatus(signal())).toBe('not_started')
    expect(decideLessonOverviewStatus(signal({ hasStartedLesson: true }))).toBe('in_progress')
    expect(decideLessonOverviewStatus(signal({ hasMeaningfulExposure: true, readyItemCount: 4 }))).toBe('ready_to_practice')
    expect(decideLessonOverviewStatus(signal({
      hasMeaningfulExposure: true,
      readyItemCount: 2,
      practicedEligibleItemCount: 1,
      eligibleIntroducedItemCount: 4,
    }))).toBe('in_practice')
    expect(decideLessonOverviewStatus(signal({
      hasMeaningfulExposure: true,
      readyItemCount: 0,
      practicedEligibleItemCount: 4,
      eligibleIntroducedItemCount: 4,
    }))).toBe('practiced')
    expect(decideLessonOverviewStatus(signal({
      hasMeaningfulExposure: true,
      readyItemCount: 4,
      earlierLessonsSatisfied: false,
    }))).toBe('later')
  })

  it('does not call a lesson practiced when no introduced eligible item has been practiced', () => {
    expect(decideLessonOverviewStatus(signal({
      hasMeaningfulExposure: true,
      practicedEligibleItemCount: 0,
      eligibleIntroducedItemCount: 0,
      hasAuthoredEligiblePracticeContent: false,
    }))).toBe('in_progress')
  })

  it('keeps later lessons openable but not practice-forward', () => {
    expect(overviewActionLabel('later')).toBe('Open lesson')
    expect(overviewActionLabel('ready_to_practice')).toBe('Open lesson')
    expect(overviewActionLabel('practiced')).toBe('Open lesson')
    expect(overviewActionLabel('not_started')).toBe('Open lesson')
    expect(overviewActionLabel('in_progress')).toBe('Continue')
    expect(overviewActionLabel('in_practice')).toBe('Continue')
  })

  it('recommends an in-progress not-ready lesson before the next not-started lesson', () => {
    expect(recommendLesson([
      signal({ lessonId: 'lesson-1', orderIndex: 1, hasStartedLesson: true }),
      signal({ lessonId: 'lesson-2', orderIndex: 2 }),
    ])).toBe('lesson-1')
  })

  it('recommends the earliest ready or in-practice lesson before a not-started lesson', () => {
    expect(recommendLesson([
      signal({
        lessonId: 'lesson-1',
        orderIndex: 1,
        hasMeaningfulExposure: true,
        readyItemCount: 0,
        practicedEligibleItemCount: 3,
        eligibleIntroducedItemCount: 3,
      }),
      signal({
        lessonId: 'lesson-2',
        orderIndex: 2,
        hasMeaningfulExposure: true,
        readyItemCount: 5,
      }),
      signal({ lessonId: 'lesson-3', orderIndex: 3 }),
    ])).toBe('lesson-2')
  })

  it('usually moves from a practiced lesson to the next not-started lesson', () => {
    expect(recommendLesson([
      signal({
        lessonId: 'lesson-1',
        orderIndex: 1,
        hasMeaningfulExposure: true,
        practicedEligibleItemCount: 3,
        eligibleIntroducedItemCount: 3,
      }),
      signal({ lessonId: 'lesson-2', orderIndex: 2 }),
    ])).toBe('lesson-2')
  })

  it('does not recommend a read-ahead later lesson while earlier lessons are unsatisfied', () => {
    expect(recommendLesson([
      signal({
        lessonId: 'lesson-1',
        orderIndex: 1,
        hasMeaningfulExposure: true,
        readyItemCount: 4,
      }),
      signal({
        lessonId: 'lesson-2',
        orderIndex: 2,
        hasMeaningfulExposure: true,
        readyItemCount: 6,
        earlierLessonsSatisfied: false,
      }),
    ])).toBe('lesson-1')
  })

  it('lets meaningful lessons with no authored practice content satisfy the path without appearing practiced', () => {
    expect(recommendLesson([
      signal({
        lessonId: 'lesson-1',
        orderIndex: 1,
        hasMeaningfulExposure: true,
        hasAuthoredEligiblePracticeContent: false,
      }),
      signal({ lessonId: 'lesson-2', orderIndex: 2 }),
    ])).toBe('lesson-2')
  })

  it('recommends Lesson 1 for new learners without needing empty stats copy', () => {
    expect(recommendLesson([
      signal({ lessonId: 'lesson-1', orderIndex: 1 }),
      signal({ lessonId: 'lesson-2', orderIndex: 2, earlierLessonsSatisfied: false }),
    ])).toBe('lesson-1')
  })

  it('formats grammar topic tags without non-grammar lesson metadata', () => {
    expect(formatGrammarTopicTag([], 'lesson-1')).toBeNull()
    expect(formatGrammarTopicTag([
      { lessonId: 'lesson-1', label: 'possessive pronouns' },
    ], 'lesson-1')).toBe('Grammar: possessive pronouns')
    expect(formatGrammarTopicTag([
      { lessonId: 'lesson-1', label: 'word order' },
      { lessonId: 'lesson-1', label: 'negation' },
      { lessonId: 'lesson-1', label: 'questions' },
      { lessonId: 'lesson-2', label: 'numbers' },
    ], 'lesson-1')).toBe('Grammar: word order, negation +1 more')
  })
})
