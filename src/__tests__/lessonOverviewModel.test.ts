import { describe, expect, it } from 'vitest'
import {
  buildLessonOverviewModel,
  buildLessonOverviewSignals,
  type LessonOverviewCapabilityCounts,
  type LessonOverviewExposure,
  type LessonOverviewModelLesson,
} from '@/lib/lessons/lessonOverviewModel'

function lesson(overrides: Partial<LessonOverviewModelLesson>): LessonOverviewModelLesson {
  return {
    id: 'lesson-1',
    title: 'Lesson 1',
    order_index: 1,
    ...overrides,
  }
}

function exposure(overrides: Partial<LessonOverviewExposure>): LessonOverviewExposure {
  return {
    lessonId: 'lesson-1',
    exposureKind: 'grammar',
    started: true,
    meaningful: true,
    ...overrides,
  }
}

function counts(overrides: Partial<LessonOverviewCapabilityCounts>): LessonOverviewCapabilityCounts {
  return {
    lessonId: 'lesson-1',
    readyItemCount: 0,
    practicedEligibleItemCount: 0,
    eligibleIntroducedItemCount: 0,
    hasAuthoredEligiblePracticeContent: true,
    ...overrides,
  }
}

describe('lesson overview model', () => {
  it('combines lessons, exposure, capability counts, and grammar topics into sorted rows', () => {
    const lessons = [
      lesson({ id: 'lesson-2', title: 'Lesson 2', order_index: 2 }),
      lesson({ id: 'lesson-1', title: 'Lesson 1', order_index: 1 }),
    ]
    const signals = buildLessonOverviewSignals({
      lessons,
      exposures: [exposure({ lessonId: 'lesson-1' })],
      capabilityCounts: [counts({
        lessonId: 'lesson-1',
        readyItemCount: 4,
        eligibleIntroducedItemCount: 4,
      })],
    })

    const model = buildLessonOverviewModel({
      lessons,
      signals,
      grammarTopics: [{ lessonId: 'lesson-1', label: 'word order' }],
    })

    expect(model.rows.map(row => row.lessonId)).toEqual(['lesson-1', 'lesson-2'])
    expect(model.recommendedLessonId).toBe('lesson-1')
    expect(model.recommendedRow?.lessonId).toBe('lesson-1')
    expect(model.rows.some(row => row.lessonId === model.recommendedLessonId)).toBe(true)
    expect(model.rows[0]).toMatchObject({
      lessonId: 'lesson-1',
      status: 'ready_to_practice',
      actionLabel: 'Open lesson',
      href: '/lesson/lesson-1',
      grammarTopicTag: 'Grammar: word order',
    })
  })

  it('falls back to openable rows and recommends Lesson 1 for new learners', () => {
    const model = buildLessonOverviewModel({
      lessons: [
        lesson({ id: 'lesson-1', title: 'Lesson 1', order_index: 1 }),
        lesson({ id: 'lesson-2', title: 'Lesson 2', order_index: 2 }),
      ],
      signals: [],
      grammarTopics: [],
    })

    expect(model.recommendedLessonId).toBe('lesson-1')
    expect(model.recommendedRow).toMatchObject({
      lessonId: 'lesson-1',
      status: 'not_started',
      actionLabel: 'Open lesson',
      grammarTopicTag: null,
    })
    expect(model.rows.map(row => row.actionLabel)).toEqual(['Open lesson', 'Open lesson'])
  })

  it('lets meaningful exposure with no authored practice content satisfy the earlier-lesson path', () => {
    const lessons = [
      lesson({ id: 'lesson-1', title: 'Lesson 1', order_index: 1 }),
      lesson({ id: 'lesson-2', title: 'Lesson 2', order_index: 2 }),
    ]
    const model = buildLessonOverviewModel({
      lessons,
      signals: buildLessonOverviewSignals({
        lessons,
        exposures: [exposure({ lessonId: 'lesson-1' })],
        capabilityCounts: [counts({
          lessonId: 'lesson-1',
          hasAuthoredEligiblePracticeContent: false,
        })],
      }),
      grammarTopics: [],
    })

    expect(model.rows[0]).toMatchObject({
      lessonId: 'lesson-1',
      status: 'in_progress',
    })
    expect(model.rows[1]).toMatchObject({
      lessonId: 'lesson-2',
      status: 'not_started',
    })
    expect(model.recommendedLessonId).toBe('lesson-2')
  })

  it('ignores culture and pronunciation-only exposure for status and recommendation', () => {
    const lessons = [
      lesson({ id: 'lesson-1', title: 'Lesson 1', order_index: 1 }),
      lesson({ id: 'lesson-2', title: 'Lesson 2', order_index: 2 }),
    ]
    const signals = buildLessonOverviewSignals({
      lessons,
      exposures: [
        exposure({ lessonId: 'lesson-1', exposureKind: 'culture' }),
        exposure({ lessonId: 'lesson-1', exposureKind: 'pronunciation' }),
      ],
      capabilityCounts: [counts({ lessonId: 'lesson-1', readyItemCount: 6 })],
    })
    const model = buildLessonOverviewModel({ lessons, signals, grammarTopics: [] })

    expect(model.rows[0]?.status).toBe('not_started')
    expect(model.recommendedLessonId).toBe('lesson-1')
  })

  it('includes only published lessons and omits the grammar tag when metadata is missing', () => {
    const model = buildLessonOverviewModel({
      lessons: [
        lesson({ id: 'lesson-1', title: 'Lesson 1', order_index: 1, publication_status: 'published' }),
        lesson({ id: 'lesson-2', title: 'Lesson 2', order_index: 2, publication_status: 'draft' }),
        lesson({ id: 'lesson-3', title: 'Lesson 3', order_index: 3, is_published: false }),
      ],
      signals: [],
      grammarTopics: [],
    })

    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]).toMatchObject({
      lessonId: 'lesson-1',
      grammarTopicTag: null,
    })
  })
})
