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

describe('fetchSessionAudioMap', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('maps normalized text to storage path for each returned clip', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          { normalized_text: 'di', storage_path: 'tts/despina/di-abc123.mp3' },
          { normalized_text: 'ini', storage_path: 'tts/achird/ini-def456.mp3' },
        ],
        error: null,
      }),
    } as any)

    const { fetchSessionAudioMap } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap(['di', 'ini'])

    expect(map.get('di')).toBe('tts/despina/di-abc123.mp3')
    expect(map.get('ini')).toBe('tts/achird/ini-def456.mp3')
  })

  it('returns empty map for empty inputs', async () => {
    const { fetchSessionAudioMap } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([])
    expect(map.size).toBe(0)
  })

  it('returns empty map when RPC errors (silent — audio is non-fatal)', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('boom') }),
    } as any)

    const { fetchSessionAudioMap } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap(['x'])
    expect(map.size).toBe(0)
  })

  it('normalizes input texts before sending to the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as any)

    const { fetchSessionAudioMap } = await import('@/services/audioService')
    await fetchSessionAudioMap(['  Apa?  ', 'INI'])

    expect(rpc).toHaveBeenCalledWith('get_audio_clip_per_text', { p_texts: ['apa?', 'ini'] })
  })
})

describe('resolveSessionAudioUrl', () => {
  it('returns the public URL for a matching normalized text', async () => {
    const { resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = new Map([['batik', 'tts/despina/batik-abc.mp3']])
    const url = resolveSessionAudioUrl(map, 'Batik')
    expect(url).toContain('/storage/v1/object/public/indonesian-tts/tts/despina/batik-abc.mp3')
  })

  it('returns undefined when no clip matches', async () => {
    const { resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = new Map([['batik', 'tts/despina/batik-abc.mp3']])
    expect(resolveSessionAudioUrl(map, 'halus')).toBeUndefined()
  })
})
