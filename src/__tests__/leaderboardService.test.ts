// src/__tests__/leaderboardService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { leaderboardService } from '@/services/leaderboardService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockTable = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  }

  const mockSchema = {
    from: vi.fn().mockReturnValue(mockTable),
  }
  
  return {
    supabase: {
      schema: vi.fn().mockReturnValue(mockSchema),
    },
  }
})

describe('leaderboardService', () => {
  const getMockTable = () => (supabase.schema('indonesian').from('any') as any)
  const getMockSchema = () => (supabase.schema('indonesian') as any)

  beforeEach(() => {
    vi.clearAllMocks()
    getMockTable().then.mockImplementation(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  })

  it('getLeaderboard fetches data from indonesian schema view', async () => {
    const mockData = [{ user_id: '1', display_name: 'Winner' }]
    getMockTable().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockData, error: null }).then(onFulfilled)
    })

    const result = await leaderboardService.getLeaderboard('total_seconds_spent')

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(getMockSchema().from).toHaveBeenCalledWith('leaderboard')
    expect(getMockTable().order).toHaveBeenCalledWith('total_seconds_spent', { ascending: false })
    expect(result).toEqual(mockData)
  })
})
