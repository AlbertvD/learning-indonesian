// src/__tests__/textService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { textService } from '@/services/textService'
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

describe('textService', () => {
  const getMock = () => (supabase.schema('indonesian').from('any') as any)

  beforeEach(() => {
    vi.clearAllMocks()
    getMock().then.mockImplementation(function(onFulfilled: any) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled)
    })
  })

  it('listTexts fetches texts from indonesian schema, trimmed to the list columns (not select *)', async () => {
    const mockData = [{ id: '1', title: 'Text 1', audio_path: 'a.mp3' }]
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockData, error: null }).then(onFulfilled)
    })

    const result = await textService.listTexts()

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
    // Heavy denormalized columns (transcript_indonesian/english/dutch, attribution)
    // must NOT be in the list select -- only what list pages actually render/consume.
    expect(getMock().select).toHaveBeenCalledWith(
      'id, title, description, audio_path, level, duration_seconds, transcript_segments',
    )
    expect(result).toEqual(mockData)
  })

  it('getText still fetches every column (the reader needs the full row)', async () => {
    const mockData = { id: '1', title: 'Text 1', audio_path: 'a.mp3' }
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockData, error: null }).then(onFulfilled)
    })

    const result = await textService.getText('1')

    expect(getMock().select).toHaveBeenCalledWith('*')
    expect(result).toEqual(mockData)
  })

  it('listPodcasts returns only audio-bearing texts (the Listen face)', async () => {
    const mockData = [
      { id: '1', title: 'With audio', audio_path: 'a.mp3' },
      { id: '2', title: 'Read-only', audio_path: null },
    ]
    getMock().then.mockImplementationOnce(function(onFulfilled: any) {
      return Promise.resolve({ data: mockData, error: null }).then(onFulfilled)
    })

    const result = await textService.listPodcasts()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('getAudioUrl calls supabase storage', () => {
    const url = textService.getAudioUrl('path/to/audio.mp3')
    expect(supabase.storage.from).toHaveBeenCalledWith('indonesian-podcasts')
    expect(url).toBe('https://example.com/audio.mp3')
  })
})
