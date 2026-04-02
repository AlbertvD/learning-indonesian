import { describe, it, expect, vi, beforeEach } from 'vitest'
import { learningItemService } from '@/services/learningItemService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockQueryBuilder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: '1', base_text: 'rumah' }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn(function(this: any, onFulfilled: any) {
      return Promise.resolve(onFulfilled({ data: [{ id: '1', base_text: 'rumah' }], error: null }));
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

describe('learningItemService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getLearningItems returns items', async () => {
    const items = await learningItemService.getLearningItems()
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].base_text).toBe('rumah')
    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
  })

  it('getItemContextsByLesson calls with correct lesson filter', async () => {
    await learningItemService.getItemContextsByLesson('L1')
    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    const mockSchema = vi.mocked(supabase.schema)
    const indonesianSchema = mockSchema.mock.results[0].value
    expect(indonesianSchema.from).toHaveBeenCalledWith('item_contexts')
  })
})
