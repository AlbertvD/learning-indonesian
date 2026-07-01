// src/lib/lessons/__tests__/adapter.test.ts
//
// Tests for the lesson-domain methods + pure helpers folded out of
// src/services/lessonService.ts during the lib/lessons/ fold (commit 6 of
// docs/plans/2026-05-18-fold-lib-lessons.md). Moved verbatim from
// src/__tests__/lessonService.test.ts; the remaining service method
// (getAudioUrl) had no tests, so the legacy file is deleted entirely.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractLessonGrammarTopics,
  formatGrammarTopicTag,
  getLesson,
  getLessons,
  getLessonCapabilityPracticeSummaryByLessonId,
  lessonSourceRefForOverview,
  lessonSourceRefsByLesson,
} from '../adapter'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockPostgrest = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi.fn(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    }),
  }

  return {
    supabase: {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue(mockPostgrest),
      }),
    },
  }
})

describe('lessons adapter', () => {
  const getMock = () => (supabase.schema('indonesian').from('any') as any)

  beforeEach(() => {
    vi.clearAllMocks()
    getMock().then.mockImplementation(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  })

  it('getLessons fetches lessons with sections from indonesian schema', async () => {
    const mockData = [{ id: '1', title: 'Lesson 1', lesson_sections: [] }]
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockData, error: null }).then(onFulfilled)
    })

    const result = await getLessons()

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(getMock().select).toHaveBeenCalledWith('*, lesson_sections(*)')
    expect(result).toEqual(mockData)
  })

  it('getLesson fetches a single lesson by id', async () => {
    const mockLesson = { id: '1', title: 'Lesson 1' }
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockLesson, error: null }).then(onFulfilled)
    })

    const result = await getLesson('1')

    expect(getMock().eq).toHaveBeenCalledWith('id', '1')
    expect(result).toEqual(mockLesson)
  })

  it('builds canonical lesson source refs for overview reads', () => {
    expect(lessonSourceRefForOverview({ order_index: 4 })).toBe('lesson-4')
    expect(lessonSourceRefsByLesson([
      { id: 'lesson-4', order_index: 4 },
      { id: 'lesson-5', order_index: 5 },
    ], [
      {
        source_ref: 'lesson-4',
        source_refs: ['lesson-4', 'learning_items/makan'],
      } as any,
      {
        source_ref: 'lesson-4',
        source_refs: ['learning_items/minum'],
      } as any,
    ])).toEqual(new Map([
      ['lesson-4', ['lesson-4', 'learning_items/makan', 'learning_items/minum']],
      ['lesson-5', ['lesson-5']],
    ]))
  })

  it('getLessonCapabilityPracticeSummaryByLessonId queries by lesson_id and returns zeros when no capabilities', async () => {
    // Mock chain: select(...).eq('lesson_id',...).eq('readiness_status',...).eq('publication_status',...)
    // resolves to empty data → method short-circuits with zeros.
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })

    const summary = await getLessonCapabilityPracticeSummaryByLessonId('user-uuid', 'lesson-uuid-1')

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(getMock().eq).toHaveBeenCalledWith('lesson_id', 'lesson-uuid-1')
    expect(getMock().eq).toHaveBeenCalledWith('readiness_status', 'ready')
    expect(getMock().eq).toHaveBeenCalledWith('publication_status', 'published')
    expect(summary).toEqual({ readyCapabilityCount: 0, activePracticedCapabilityCount: 0 })
  })

  it('getLessonCapabilityPracticeSummaryByLessonId counts active+reviewed states', async () => {
    const capabilityRows = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]
    const stateRows = [
      { capability_id: 'c1', activation_state: 'active', review_count: 3 },
      { capability_id: 'c2', activation_state: 'active', review_count: 0 },
      { capability_id: 'c3', activation_state: 'inactive', review_count: 5 },
    ]
    // First .then (capabilities) → rows; second .then (state via chunkedIn) → rows.
    getMock().then
      .mockImplementationOnce(function(onFulfilled: any) {
        return Promise.resolve({ data: capabilityRows, error: null }).then(onFulfilled)
      })
      .mockImplementationOnce(function(onFulfilled: any) {
        return Promise.resolve({ data: stateRows, error: null }).then(onFulfilled)
      })

    const summary = await getLessonCapabilityPracticeSummaryByLessonId('user-uuid', 'lesson-uuid-1')

    expect(summary.readyCapabilityCount).toBe(3)
    // Only c1 is both active and review_count>0.
    expect(summary.activePracticedCapabilityCount).toBe(1)
  })

  it('extracts only grammar topics from lesson section metadata', () => {
    const topics = extractLessonGrammarTopics([
      {
        id: 'lesson-1',
        order_index: 1,
        title: 'Lesson 1',
        lesson_sections: [
          {
            id: 'section-1',
            lesson_id: 'lesson-1',
            title: 'Grammar: -nya',
            order_index: 1,
            content: {
              type: 'grammar',
              categories: [
                { title: '-nya as possession' },
                { title: 'adjective order' },
              ],
            },
          },
          {
            id: 'section-2',
            lesson_id: 'lesson-1',
            title: 'Culture',
            order_index: 2,
            content: { type: 'culture', title: 'Markets' },
          },
        ],
      } as any,
      {
        id: 'lesson-2',
        order_index: 2,
        title: 'Lesson 2',
        lesson_sections: [
          {
            id: 'section-3',
            lesson_id: 'lesson-2',
            title: 'Grammar: word order',
            order_index: 1,
            content: { type: 'grammar', body: 'Word order notes.' },
          },
        ],
      } as any,
    ])

    expect(topics).toEqual([
      { lessonId: 'lesson-1', label: '-nya as possession' },
      { lessonId: 'lesson-1', label: 'adjective order' },
      { lessonId: 'lesson-2', label: 'word order' },
    ])
  })

  // Relocated from the retired overviewStatus.test.ts (2026-06-09).
  it('formats grammar topic tags without non-grammar lesson metadata', () => {
    expect(formatGrammarTopicTag([], 'lesson-1')).toBeNull()
    expect(formatGrammarTopicTag([
      { lessonId: 'lesson-1', label: 'possessive pronouns' },
    ], 'lesson-1')).toBe('possessive pronouns')
    expect(formatGrammarTopicTag([
      { lessonId: 'lesson-1', label: 'word order' },
      { lessonId: 'lesson-1', label: 'negation' },
      { lessonId: 'lesson-1', label: 'questions' },
      { lessonId: 'lesson-2', label: 'numbers' },
    ], 'lesson-1')).toBe('word order, negation, questions')
  })
})
