import { describe, expect, it } from 'vitest'
import {
  buildLessonOverviewModel,
  lessonMasteredPercent,
  lessonPracticedPercent,
  type LessonOverviewCapabilityCounts,
  type LessonOverviewModelLesson,
} from '@/lib/lessons'

function lesson(overrides: Partial<LessonOverviewModelLesson>): LessonOverviewModelLesson {
  return {
    id: 'lesson-1',
    title: 'Lesson 1',
    order_index: 1,
    ...overrides,
  }
}

function counts(overrides: Partial<LessonOverviewCapabilityCounts>): LessonOverviewCapabilityCounts {
  return {
    lessonId: 'lesson-1',
    isActivated: false,
    masteredCount: 0,
    practicedCount: 0,
    introducibleCount: 0,
    ...overrides,
  }
}

describe('lessonMasteredPercent', () => {
  it('returns null when not activated or no introducible caps', () => {
    expect(lessonMasteredPercent({ isActivated: false, masteredCount: 5, introducibleCount: 10 })).toBeNull()
    expect(lessonMasteredPercent({ isActivated: true, masteredCount: 0, introducibleCount: 0 })).toBeNull()
  })

  it('rounds mastered/introducible to a percentage', () => {
    expect(lessonMasteredPercent({ isActivated: true, masteredCount: 7, introducibleCount: 9 })).toBe(78)
    expect(lessonMasteredPercent({ isActivated: true, masteredCount: 10, introducibleCount: 10 })).toBe(100)
    expect(lessonMasteredPercent({ isActivated: true, masteredCount: 0, introducibleCount: 10 })).toBe(0)
  })

  it('clamps a transient count skew to 100%', () => {
    expect(lessonMasteredPercent({ isActivated: true, masteredCount: 12, introducibleCount: 10 })).toBe(100)
  })
})

describe('lessonPracticedPercent', () => {
  it('returns null when not activated or no introducible caps (same rule as mastered)', () => {
    expect(lessonPracticedPercent({ isActivated: false, practicedCount: 5, introducibleCount: 10 })).toBeNull()
    expect(lessonPracticedPercent({ isActivated: true, practicedCount: 0, introducibleCount: 0 })).toBeNull()
  })

  it('returns a visible 0% (not null) when activated with nothing practiced yet', () => {
    expect(lessonPracticedPercent({ isActivated: true, practicedCount: 0, introducibleCount: 10 })).toBe(0)
  })

  it('rounds practiced/introducible to a percentage and clamps skew', () => {
    expect(lessonPracticedPercent({ isActivated: true, practicedCount: 7, introducibleCount: 10 })).toBe(70)
    expect(lessonPracticedPercent({ isActivated: true, practicedCount: 12, introducibleCount: 10 })).toBe(100)
  })

  it('is always ≥ mastered for the same row (mastered ⊆ practiced)', () => {
    const input = { isActivated: true, introducibleCount: 10 }
    const practiced = lessonPracticedPercent({ ...input, practicedCount: 7 })!
    const mastered = lessonMasteredPercent({ ...input, masteredCount: 4 })!
    expect(practiced).toBeGreaterThanOrEqual(mastered)
  })
})

describe('lesson overview model', () => {
  it('maps lessons + counts + grammar topics into order-sorted tile rows', () => {
    const lessons = [
      lesson({ id: 'lesson-2', title: 'Lesson 2', order_index: 2 }),
      lesson({ id: 'lesson-1', title: 'Lesson 1', order_index: 1 }),
    ]
    const model = buildLessonOverviewModel({
      lessons,
      counts: [counts({ lessonId: 'lesson-1', isActivated: true, masteredCount: 7, practicedCount: 9, introducibleCount: 9 })],
      grammarTopics: [{ lessonId: 'lesson-1', label: 'word order' }],
      preparedLessonIds: ['lesson-1', 'lesson-2'],
    })

    expect(model.rows.map(row => row.lessonId)).toEqual(['lesson-1', 'lesson-2'])
    expect(model.rows[0]).toMatchObject({
      lessonId: 'lesson-1',
      isActivated: true,
      masteredCount: 7,
      practicedCount: 9,
      introducibleCount: 9,
      masteredPercent: 78,
      practicedPercent: 100,
      isPrepared: true,
      href: '/lesson/lesson-1',
      grammarTopicTag: 'word order',
    })
    // No recommended-lesson hero in the model anymore.
    expect('recommendedLessonId' in model).toBe(false)
  })

  it('a not-activated lesson has masteredPercent null and a default not-started shape', () => {
    const model = buildLessonOverviewModel({
      lessons: [lesson({ id: 'lesson-1', order_index: 1 })],
      counts: [counts({ lessonId: 'lesson-1', isActivated: false, masteredCount: 0, introducibleCount: 12 })],
      grammarTopics: [],
      preparedLessonIds: ['lesson-1'],
    })
    expect(model.rows[0]).toMatchObject({
      lessonId: 'lesson-1',
      isActivated: false,
      masteredPercent: null,
      practicedPercent: null,
      href: '/lesson/lesson-1',
    })
  })

  it('NO sequential locking: a later lesson is openable regardless of earlier-lesson state', () => {
    const lessons = [
      lesson({ id: 'lesson-1', title: 'Lesson 1', order_index: 1 }),
      lesson({ id: 'lesson-2', title: 'Lesson 2', order_index: 2 }),
    ]
    const model = buildLessonOverviewModel({
      lessons,
      // lesson-1 barely started; under the old order-gate this would have
      // forced lesson-2 to 'later' with no href. It must not anymore.
      counts: [counts({ lessonId: 'lesson-1', isActivated: true, masteredCount: 0, introducibleCount: 20 })],
      grammarTopics: [],
      preparedLessonIds: ['lesson-1', 'lesson-2'],
    })
    expect(model.rows[1]).toMatchObject({ lessonId: 'lesson-2', href: '/lesson/lesson-2' })
  })

  it('a non-prepared lesson has no href (not-available tile)', () => {
    const model = buildLessonOverviewModel({
      lessons: [lesson({ id: 'lesson-1', order_index: 1 })],
      counts: [counts({ lessonId: 'lesson-1', isActivated: true, masteredCount: 3, introducibleCount: 10 })],
      grammarTopics: [],
      preparedLessonIds: [], // not prepared
    })
    expect(model.rows[0]).toMatchObject({ lessonId: 'lesson-1', isPrepared: false, href: null })
  })

  it('includes only published lessons and omits the grammar tag when metadata is missing', () => {
    const model = buildLessonOverviewModel({
      lessons: [
        lesson({ id: 'lesson-1', title: 'Lesson 1', order_index: 1, publication_status: 'published' }),
        lesson({ id: 'lesson-2', title: 'Lesson 2', order_index: 2, publication_status: 'draft' }),
        lesson({ id: 'lesson-3', title: 'Lesson 3', order_index: 3, is_published: false }),
      ],
      counts: [],
      grammarTopics: [],
      preparedLessonIds: ['lesson-1'],
    })

    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]).toMatchObject({
      lessonId: 'lesson-1',
      grammarTopicTag: null,
    })
  })
})
