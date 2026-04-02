// src/__tests__/sharing.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cardService } from '@/services/cardService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockTable = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
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

describe('cardService sharing', () => {
  const getMockTable = () => (supabase.schema('indonesian').from('any') as any)

  beforeEach(() => {
    vi.clearAllMocks()
    getMockTable().then.mockImplementation(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  })

  it('updateCardSetVisibility updates the visibility column', async () => {
    await cardService.updateCardSetVisibility('set-1', 'public')
    expect(getMockTable().update).toHaveBeenCalledWith({ visibility: 'public' })
    expect(getMockTable().eq).toHaveBeenCalledWith('id', 'set-1')
  })

  it('shareCardSet inserts into card_set_shares', async () => {
    await cardService.shareCardSet('set-1', 'user-2')
    expect(getMockTable().insert).toHaveBeenCalledWith({ card_set_id: 'set-1', shared_with_user_id: 'user-2' })
  })

  it('searchProfiles searches by display_name with ILIKE', async () => {
    await cardService.searchProfiles('alice')
    expect(getMockTable().select).toHaveBeenCalledWith('id, display_name')
    expect(getMockTable().ilike).toHaveBeenCalledWith('display_name', '%alice%')
  })
})
