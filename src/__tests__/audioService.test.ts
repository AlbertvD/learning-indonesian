import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase')

describe('audioService', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fetches audio map for given texts and voices', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          { text_content: 'batik', normalized_text: 'batik', voice_id: 'id-ID-Chirp3-HD-Achird', storage_path: 'tts/achird/batik-abc123.mp3', duration_ms: 1200 },
          { text_content: 'halus', normalized_text: 'halus', voice_id: 'id-ID-Chirp3-HD-Achird', storage_path: 'tts/achird/halus-def456.mp3', duration_ms: 900 },
        ],
        error: null,
      }),
    } as any)

    const { fetchAudioMap } = await import('@/services/audioService')
    const map = await fetchAudioMap(['batik', 'halus'], ['id-ID-Chirp3-HD-Achird'])

    expect(map.get('id-ID-Chirp3-HD-Achird')?.get('batik')).toBe('tts/achird/batik-abc123.mp3')
    expect(map.get('id-ID-Chirp3-HD-Achird')?.get('halus')).toBe('tts/achird/halus-def456.mp3')
  })

  it('returns empty map when no clips found', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any)

    const { fetchAudioMap } = await import('@/services/audioService')
    const map = await fetchAudioMap(['nonexistent'], ['voice'])

    expect(map.size).toBe(0)
  })

  it('returns empty map for empty inputs', async () => {
    const { fetchAudioMap } = await import('@/services/audioService')
    const map = await fetchAudioMap([], [])
    expect(map.size).toBe(0)
  })
})
