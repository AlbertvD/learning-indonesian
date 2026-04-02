// src/__tests__/progressService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { progressService } from '@/services/progressService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockPostgrest = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    then: vi.fn(function(onFulfilled: any) {
      return Promise.resolve({ data: null, error: null }).then(onFulfilled)
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

describe('progressService', () => {
  const getMock = () => (supabase.schema('indonesian').from('any') as any)

  beforeEach(() => {
    vi.clearAllMocks()
    getMock().then.mockImplementation(function(onFulfilled: any) {
      return Promise.resolve({ data: null, error: null }).then(onFulfilled)
    })
  })

  it('getUserProgress fetches progress from indonesian schema', async () => {
    const mockData = { user_id: 'user-1', current_level: 'A1' }
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockData, error: null }).then(onFulfilled)
    })

    const result = await progressService.getUserProgress('user-1')

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(getMock().eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result).toEqual(mockData)
  })

  it('upsertProgress upserts to user_progress with user_id onConflict', async () => {
    await progressService.upsertProgress('user-1', { current_level: 'A2' })

    expect(getMock().upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', current_level: 'A2' }),
      { onConflict: 'user_id' }
    )
  })

  it('markLessonComplete upserts to lesson_progress with correct natural key', async () => {
    await progressService.markLessonComplete('user-1', 'lesson-1', ['section-1'])

    expect(getMock().upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', lesson_id: 'lesson-1', sections_completed: ['section-1'] }),
      { onConflict: 'user_id,lesson_id' }
    )
  })
})
