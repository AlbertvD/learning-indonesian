import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase')

describe('fetchSessionAudioMap (legacy voice-agnostic behaviour preserved via voiceId: null)', () => {
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

    const { fetchSessionAudioMap, resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([
      { text: 'di', voiceId: null },
      { text: 'ini', voiceId: null },
    ])

    expect(resolveSessionAudioUrl(map, 'di', null)).toContain('tts/despina/di-abc123.mp3')
    expect(resolveSessionAudioUrl(map, 'ini', null)).toContain('tts/achird/ini-def456.mp3')
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
    const map = await fetchSessionAudioMap([{ text: 'x', voiceId: null }])
    expect(map.size).toBe(0)
  })

  it('normalizes input texts before sending to the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as any)

    const { fetchSessionAudioMap } = await import('@/services/audioService')
    await fetchSessionAudioMap([
      { text: '  Apa?  ', voiceId: null },
      { text: 'INI', voiceId: null },
    ])

    expect(rpc).toHaveBeenCalledWith('get_audio_clip_per_text', { p_texts: ['apa?', 'ini'] })
  })
})

describe('resolveSessionAudioUrl', () => {
  it('returns the public URL for a matching normalized text + null voice', async () => {
    const { resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = new Map([['batik|__default__', 'tts/despina/batik-abc.mp3']])
    const url = resolveSessionAudioUrl(map, 'Batik', null)
    expect(url).toContain('/storage/v1/object/public/indonesian-tts/tts/despina/batik-abc.mp3')
  })

  it('returns undefined when no clip matches', async () => {
    const { resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = new Map([['batik|__default__', 'tts/despina/batik-abc.mp3']])
    expect(resolveSessionAudioUrl(map, 'halus', null)).toBeUndefined()
  })
})

// === New voice-paired API tests (spec v2.2.1 §11.1 Item 4) ===

describe('fetchSessionAudioMap — voice-paired API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('voice-paired requests use get_audio_clips RPC with text+voice batches', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { normalized_text: 'apa kabar', voice_id: 'Despina', storage_path: 'tts/despina/apakabar.mp3' },
      ],
      error: null,
    })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as any)

    const { fetchSessionAudioMap } = await import('@/services/audioService')
    await fetchSessionAudioMap([{ text: 'apa kabar', voiceId: 'Despina' }])

    expect(rpc).toHaveBeenCalledWith('get_audio_clips', {
      p_texts: ['apa kabar'],
      p_voice_ids: ['Despina'],
    })
  })

  it('null-voice requests use get_audio_clip_per_text RPC (voice-agnostic fallback)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as any)

    const { fetchSessionAudioMap } = await import('@/services/audioService')
    await fetchSessionAudioMap([{ text: 'halo', voiceId: null }])

    expect(rpc).toHaveBeenCalledWith('get_audio_clip_per_text', { p_texts: ['halo'] })
  })

  it('mixed batch dispatches both RPCs and merges results into one map', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [
          { normalized_text: 'apa kabar', voice_id: 'Despina', storage_path: 'tts/despina/apakabar.mp3' },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { normalized_text: 'halo', storage_path: 'tts/default/halo.mp3' },
        ],
        error: null,
      })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as any)

    const { fetchSessionAudioMap, resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([
      { text: 'apa kabar', voiceId: 'Despina' },
      { text: 'halo', voiceId: null },
    ])

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(resolveSessionAudioUrl(map, 'apa kabar', 'Despina')).toContain('tts/despina/apakabar.mp3')
    expect(resolveSessionAudioUrl(map, 'halo', null)).toContain('tts/default/halo.mp3')
  })

  it('missing (text, voice) pair returns undefined', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any)

    const { fetchSessionAudioMap, resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([{ text: 'unknown', voiceId: 'Despina' }])
    expect(resolveSessionAudioUrl(map, 'unknown', 'Despina')).toBeUndefined()
  })

  it('null voice resolves only via voice-agnostic key (not against any voice-paired entry)', async () => {
    const { resolveSessionAudioUrl } = await import('@/services/audioService')
    // Map has only the voice-paired entry — looking up with null voice must miss
    const map = new Map([['halo|Despina', 'tts/despina/halo.mp3']])
    expect(resolveSessionAudioUrl(map, 'halo', null)).toBeUndefined()
    expect(resolveSessionAudioUrl(map, 'halo', 'Despina')).toContain('tts/despina/halo.mp3')
  })

  it('text normalisation applies before keying for both lookup and storage', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { normalized_text: 'apa kabar?', voice_id: 'Despina', storage_path: 'tts/despina/apakabar.mp3' },
      ],
      error: null,
    })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as any)

    const { fetchSessionAudioMap, resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([{ text: '  Apa Kabar?  ', voiceId: 'Despina' }])

    // Texts sent to RPC are normalized (lowercase, trimmed, whitespace-collapsed)
    expect(rpc).toHaveBeenCalledWith('get_audio_clips', {
      p_texts: ['apa kabar?'],
      p_voice_ids: ['Despina'],
    })
    // Look up using a denormalized form — should still resolve via normalized key
    expect(resolveSessionAudioUrl(map, 'APA KABAR?', 'Despina')).toContain('tts/despina/apakabar.mp3')
  })
})
