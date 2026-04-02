// src/__tests__/podcastService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { podcastService } from '@/services/podcastService'
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
  
  const mockStorage = {
    from: vi.fn().mockReturnValue({
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/audio.mp3' } })
    })
  }

  return {
    supabase: {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue(mockPostgrest),
      }),
      storage: mockStorage
    },
  }
})

describe('podcastService', () => {
  const getMock = () => (supabase.schema('indonesian').from('any') as any)

  beforeEach(() => {
    vi.clearAllMocks()
    getMock().then.mockImplementation(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  })

  it('getPodcasts fetches podcasts from indonesian schema', async () => {
    const mockData = [{ id: '1', title: 'Podcast 1' }]
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockData, error: null }).then(onFulfilled)
    })

    const result = await podcastService.getPodcasts()

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    expect(getMock().select).toHaveBeenCalledWith('*')
    expect(result).toEqual(mockData)
  })

  it('getAudioUrl calls supabase storage', () => {
    const url = podcastService.getAudioUrl('path/to/audio.mp3')
    expect(supabase.storage.from).toHaveBeenCalledWith('indonesian-podcasts')
    expect(url).toBe('https://example.com/audio.mp3')
  })
})
