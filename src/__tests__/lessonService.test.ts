// src/__tests__/lessonService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractLessonGrammarTopics,
  lessonSourceRefForOverview,
  lessonSourceRefsByLesson,
  lessonService,
} from '@/services/lessonService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockPostgrest = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi.fn(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  }
  
  return {
    supabase: {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue(mockPostgrest),
      }),
    },
  }
})

describe('lessonService', () => {
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

    const result = await lessonService.getLessons()

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(getMock().select).toHaveBeenCalledWith('*, lesson_sections(*)')
    expect(result).toEqual(mockData)
  })

  it('getLesson fetches a single lesson by id', async () => {
    const mockLesson = { id: '1', title: 'Lesson 1' }
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockLesson, error: null }).then(onFulfilled)
    })

    const result = await lessonService.getLesson('1')

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
})
