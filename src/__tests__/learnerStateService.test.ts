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
    supabase: { schema: mockSchema },
    __mockQueryBuilder: mockQueryBuilder,
    __mockFrom: mockFrom,
  }
})

// Access the shared mock query builder for assertions
const { __mockQueryBuilder: mockQB, __mockFrom: mockFrom } = await import('@/lib/supabase') as any

describe('learnerStateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getItemStates queries indonesian schema with correct user filter', async () => {
    const states = await learnerStateService.getItemStates('user1')
    expect(Array.isArray(states)).toBe(true)
    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(mockFrom).toHaveBeenCalledWith('learner_item_state')
    expect(mockQB.eq).toHaveBeenCalledWith('user_id', 'user1')
  })

  it('getSkillStates filters by user_id and learning_item_id', async () => {
    await learnerStateService.getSkillStates('user1', 'item1')

    expect(mockFrom).toHaveBeenCalledWith('learner_skill_state')
    expect(mockQB.eq).toHaveBeenCalledWith('user_id', 'user1')
    expect(mockQB.eq).toHaveBeenCalledWith('learning_item_id', 'item1')
  })

  it('getSkillStatesBatch fetches all skill states for user', async () => {
    await learnerStateService.getSkillStatesBatch('user1')

    expect(mockFrom).toHaveBeenCalledWith('learner_skill_state')
    expect(mockQB.eq).toHaveBeenCalledWith('user_id', 'user1')
  })
})
