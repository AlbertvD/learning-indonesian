import { describe, it, expect, vi, beforeEach } from 'vitest'
import { learnerStateService } from '@/services/learnerStateService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockQueryBuilder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn(function(this: any, onFulfilled: any) {
      return Promise.resolve(onFulfilled({ data: [], error: null }));
    }),
  }

  const mockFrom = vi.fn(() => mockQueryBuilder)
  const mockSchema = vi.fn(() => ({ from: mockFrom }))

  return {
    supabase: {
      schema: mockSchema
    },
  }
})

describe('learnerStateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getItemStates returns array', async () => {
    const states = await learnerStateService.getItemStates('user1')
    expect(Array.isArray(states)).toBe(true)
    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
  })

  it('getDueSkills queries by user and due date', async () => {
    await learnerStateService.getDueSkills('user1')
    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    const mockSchema = vi.mocked(supabase.schema)
    const indonesianSchema = mockSchema.mock.results[0].value
    expect(indonesianSchema.from).toHaveBeenCalledWith('learner_skill_state')
  })
})
