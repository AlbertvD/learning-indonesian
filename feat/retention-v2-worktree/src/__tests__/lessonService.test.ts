// src/__tests__/lessonService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lessonService } from '@/services/lessonService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockPostgrest = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
})
