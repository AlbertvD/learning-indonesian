import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

/**
 * Default signing stub: echoes each requested storage_path back inside a
 * fake signed URL, so existing `.toContain(storagePath)` assertions keep
 * working without every test needing to know the exact signed shape.
 */
function mockCreateSignedUrls(
  build: (paths: string[]) => { data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null; error: unknown } = (paths) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}?token=mock`, error: null })),
    error: null,
  }),
) {
  const createSignedUrls = vi.fn(async (paths: string[]) => build(paths))
  vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls } as any)
  return createSignedUrls
}

describe('fetchSessionAudioMap (legacy voice-agnostic behaviour preserved via voiceId: null)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('maps normalized text to a SIGNED url for each returned clip (one batch createSignedUrls call)', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          { normalized_text: 'di', storage_path: 'tts/despina/di-abc123.mp3' },
          { normalized_text: 'ini', storage_path: 'tts/achird/ini-def456.mp3' },
        ],
        error: null,
      }),
    } as any)
    const createSignedUrls = mockCreateSignedUrls()

    const { fetchSessionAudioMap, resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([
      { text: 'di', voiceId: null },
      { text: 'ini', voiceId: null },
    ])

    expect(supabase.storage.from).toHaveBeenCalledWith('indonesian-tts')
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(
      expect.arrayContaining(['tts/despina/di-abc123.mp3', 'tts/achird/ini-def456.mp3']),
      21600,
    )
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

  it('a per-path signing error (non-entitled user, missing object) drops that entry — no wholesale failure', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          { normalized_text: 'free', storage_path: 'tts/despina/free.mp3' },
          { normalized_text: 'paid', storage_path: 'tts/despina/paid.mp3' },
        ],
        error: null,
      }),
    } as any)
    mockCreateSignedUrls((paths) => ({
      data: paths.map((path) =>
        path.includes('paid')
          ? { path, signedUrl: null, error: 'not entitled' }
          : { path, signedUrl: `https://signed.example/${path}`, error: null },
      ),
      error: null,
    }))

    const { fetchSessionAudioMap, resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([
      { text: 'free', voiceId: null },
      { text: 'paid', voiceId: null },
    ])

    expect(resolveSessionAudioUrl(map, 'free', null)).toContain('free.mp3')
    expect(resolveSessionAudioUrl(map, 'paid', null)).toBeUndefined()
  })

  it('a wholesale createSignedUrls failure returns whatever the map already has (empty here) — mirrors RPC error handling', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ normalized_text: 'di', storage_path: 'tts/despina/di-abc123.mp3' }],
        error: null,
      }),
    } as any)
    mockCreateSignedUrls(() => ({ data: null, error: new Error('bucket unreachable') }))

    const { fetchSessionAudioMap } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([{ text: 'di', voiceId: null }])
    expect(map.size).toBe(0)
  })
})

describe('resolveSessionAudioUrl (pure map lookup — signing already happened in fetchSessionAudioMap)', () => {
  it('returns the signed url stored in the map for a matching normalized text + null voice', async () => {
    const { resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = new Map([['batik|__default__', 'https://signed.example/tts/despina/batik-abc.mp3?token=x']])
    const url = resolveSessionAudioUrl(map, 'Batik', null)
    expect(url).toBe('https://signed.example/tts/despina/batik-abc.mp3?token=x')
  })

  it('returns undefined when no clip matches', async () => {
    const { resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = new Map([['batik|__default__', 'https://signed.example/tts/despina/batik-abc.mp3']])
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
    mockCreateSignedUrls()

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

  it('mixed batch dispatches both RPCs, signs every path in ONE createSignedUrls call, and merges results into one map', async () => {
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
    const createSignedUrls = mockCreateSignedUrls()

    const { fetchSessionAudioMap, resolveSessionAudioUrl } = await import('@/services/audioService')
    const map = await fetchSessionAudioMap([
      { text: 'apa kabar', voiceId: 'Despina' },
      { text: 'halo', voiceId: null },
    ])

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
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
    const map = new Map([['halo|Despina', 'https://signed.example/tts/despina/halo.mp3']])
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
    mockCreateSignedUrls()

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
