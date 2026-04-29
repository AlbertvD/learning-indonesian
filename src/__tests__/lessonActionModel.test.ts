import { describe, expect, it } from 'vitest'
import { buildLessonPracticeActions } from '@/lib/lessons/lessonActionModel'

describe('buildLessonPracticeActions', () => {
  it('does not offer review before the learner has practiced lesson content', () => {
    const actions = buildLessonPracticeActions({
      lessonId: 'lesson-4',
      state: {
        practiceReadyCount: 0,
        hasActivePracticedItems: false,
        hasUnpracticedEligibleItems: false,
      },
    })

    expect(actions).toEqual([])
  })

  it('makes practice primary when unpracticed eligible content exists', () => {
    const actions = buildLessonPracticeActions({
      lessonId: 'lesson-4',
      state: {
        practiceReadyCount: 8,
        hasActivePracticedItems: false,
        hasUnpracticedEligibleItems: true,
      },
    })

    expect(actions).toEqual([
      {
        kind: 'practice',
        label: 'Practice this lesson · 8 ready',
        href: '/session?lesson=lesson-4&mode=lesson_practice',
        priority: 'primary',
      },
    ])
  })

  it('makes review primary when practiced content exists and no new eligible content remains', () => {
    const actions = buildLessonPracticeActions({
      lessonId: 'lesson-4',
      state: {
        practiceReadyCount: 0,
        hasActivePracticedItems: true,
        hasUnpracticedEligibleItems: false,
      },
    })

    expect(actions).toEqual([
      {
        kind: 'review',
        label: 'Review this lesson',
        href: '/session?lesson=lesson-4&mode=lesson_review',
        priority: 'primary',
      },
    ])
  })

  it('keeps practice primary and review secondary when both are available', () => {
    const actions = buildLessonPracticeActions({
      lessonId: 'lesson-4',
      state: {
        practiceReadyCount: 3,
        hasActivePracticedItems: true,
        hasUnpracticedEligibleItems: true,
      },
    })

    expect(actions).toEqual([
      {
        kind: 'practice',
        label: 'Practice this lesson · 3 ready',
        href: '/session?lesson=lesson-4&mode=lesson_practice',
        priority: 'primary',
      },
      {
        kind: 'review',
        label: 'Review this lesson',
        href: '/session?lesson=lesson-4&mode=lesson_review',
        priority: 'secondary',
      },
    ])
  })
})
