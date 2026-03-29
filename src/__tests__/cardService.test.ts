// src/__tests__/cardService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cardService } from '@/services/cardService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => {
  const mockPostgrest = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    then: vi.fn(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  }
  
  return {
    supabase: {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue(mockPostgrest),
      }),
      auth: {},
    },
  }
})

describe('cardService', () => {
  // Helper to get the mock object
  const getMock = () => (supabase.schema('indonesian').from('any') as any)

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = getMock()
    mock.then.mockImplementation(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  })

  it('getCardSets fetches card sets from indonesian schema', async () => {
    const mockData = [{ id: '1', name: 'Test Set' }]
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockData, error: null }).then(onFulfilled)
    })

    const result = await cardService.getCardSets()

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(result).toEqual(mockData)
  })

  it('createCardSet inserts a new private set', async () => {
    const mockSet = { id: '2', name: 'New Set', visibility: 'private' }
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockSet, error: null }).then(onFulfilled)
    })

    const result = await cardService.createCardSet('New Set', 'Desc', 'user-1')

    expect(getMock().insert).toHaveBeenCalledWith({
      name: 'New Set',
      description: 'Desc',
      owner_id: 'user-1',
      visibility: 'private',
    })
    expect(result).toEqual(mockSet)
  })

  it('getDueCards joins card_reviews with anki_cards and card_sets', async () => {
    await cardService.getDueCards('user-1')

    expect(getMock().select).toHaveBeenCalledWith('*, anki_cards!inner(*, card_sets!inner(*))')
    expect(getMock().eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(getMock().lte).toHaveBeenCalledWith('next_review_at', expect.any(String))
  })

  it('getDueCards filters by direction', async () => {
    await cardService.getDueCards('user-1', 'reverse')

    expect(getMock().eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(getMock().eq).toHaveBeenCalledWith('direction', 'reverse')
  })

  it('initializeCardReviews inserts rows with direction', async () => {
    await cardService.initializeCardReviews(['card-1'], 'user-1', 'reverse')

    expect(getMock().upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ card_id: 'card-1', user_id: 'user-1', direction: 'reverse' })
      ]),
      { onConflict: 'card_id,user_id,direction', ignoreDuplicates: true }
    )
  })

  it('updateCardReview upserts with direction', async () => {
    const sm2 = {
      easiness_factor: 2.5,
      interval_days: 1,
      repetitions: 0,
      next_review_at: '2026-04-01T00:00:00Z',
      last_reviewed_at: '2026-03-29T00:00:00Z',
    }
    await cardService.updateCardReview('card-1', 'user-1', 'forward', sm2)

    expect(getMock().upsert).toHaveBeenCalledWith(
      { card_id: 'card-1', user_id: 'user-1', direction: 'forward', ...sm2 },
      { onConflict: 'card_id,user_id,direction' }
    )
  })
})
