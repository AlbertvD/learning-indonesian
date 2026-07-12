import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

describe('parseStoredAudioUrl', () => {
  it('strips a full public-storage URL down to {bucket, path}', async () => {
    const { parseStoredAudioUrl } = await import('@/lib/signedAudioUrl')
    expect(
      parseStoredAudioUrl(
        'https://api.supabase.duin.home/storage/v1/object/public/indonesian-tts/tts/despina/halo-abc.mp3',
      ),
    ).toEqual({ bucket: 'indonesian-tts', path: 'tts/despina/halo-abc.mp3' })
  })

  it('handles all three app buckets in the public-URL shape', async () => {
    const { parseStoredAudioUrl } = await import('@/lib/signedAudioUrl')
    expect(
      parseStoredAudioUrl('https://api.supabase.duin.home/storage/v1/object/public/indonesian-lessons/grammar/lesson-1-nl.mp3'),
    ).toEqual({ bucket: 'indonesian-lessons', path: 'grammar/lesson-1-nl.mp3' })
    expect(
      parseStoredAudioUrl('https://api.supabase.duin.home/storage/v1/object/public/indonesian-podcasts/ep1/nl.mp3'),
    ).toEqual({ bucket: 'indonesian-podcasts', path: 'ep1/nl.mp3' })
  })

  it('accepts an already bucket-relative path', async () => {
    const { parseStoredAudioUrl } = await import('@/lib/signedAudioUrl')
    expect(parseStoredAudioUrl('indonesian-tts/tts/despina/halo-abc.mp3')).toEqual({
      bucket: 'indonesian-tts',
      path: 'tts/despina/halo-abc.mp3',
    })
  })

  it('returns null for a URL naming a bucket the app does not own', async () => {
    const { parseStoredAudioUrl } = await import('@/lib/signedAudioUrl')
    expect(
      parseStoredAudioUrl('https://api.supabase.duin.home/storage/v1/object/public/some-other-bucket/x.mp3'),
    ).toBeNull()
  })

  it('returns null for malformed input (no recognizable bucket, empty string, bucket with no path)', async () => {
    const { parseStoredAudioUrl } = await import('@/lib/signedAudioUrl')
    expect(parseStoredAudioUrl('')).toBeNull()
    expect(parseStoredAudioUrl('not-a-url-or-path')).toBeNull()
    expect(parseStoredAudioUrl('indonesian-tts/')).toBeNull()
    expect(parseStoredAudioUrl('indonesian-tts')).toBeNull()
  })
})

describe('signStoredAudioUrl', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('parses then signs against the resolved bucket', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example/tts/despina/halo-abc.mp3?token=x' },
      error: null,
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrl } as any)

    const { signStoredAudioUrl } = await import('@/lib/signedAudioUrl')
    const url = await signStoredAudioUrl(
      'https://api.supabase.duin.home/storage/v1/object/public/indonesian-tts/tts/despina/halo-abc.mp3',
    )

    expect(supabase.storage.from).toHaveBeenCalledWith('indonesian-tts')
    expect(createSignedUrl).toHaveBeenCalledWith('tts/despina/halo-abc.mp3', 21600)
    expect(url).toBe('https://signed.example/tts/despina/halo-abc.mp3?token=x')
  })

  it('returns null (silently — non-entitled or missing object is expected) on a signing error', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: new Error('not entitled') })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrl } as any)

    const { signStoredAudioUrl } = await import('@/lib/signedAudioUrl')
    const url = await signStoredAudioUrl('indonesian-tts/tts/despina/paid.mp3')
    expect(url).toBeNull()
  })

  it('returns null and logs on malformed stored data — a real pipeline bug, unlike a signing rejection', async () => {
    const { logError } = await import('@/lib/logger')
    const { signStoredAudioUrl } = await import('@/lib/signedAudioUrl')
    const url = await signStoredAudioUrl('garbage-not-a-storage-reference')
    expect(url).toBeNull()
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ page: 'signed-audio-url', action: 'parseStoredAudioUrl' }),
    )
  })
})

describe('useSignedAudioSrc — request-coalescing batch signer', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  it('resolves a signed URL via ONE createSignedUrls batch call for a single hook instance', async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{ path: 'tts/despina/halo-abc.mp3', signedUrl: 'https://signed.example/halo.mp3?token=x', error: null }],
      error: null,
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls } as any)

    const { useSignedAudioSrc } = await import('@/lib/signedAudioUrl')
    const { result } = renderHook(() => useSignedAudioSrc('indonesian-tts/tts/despina/halo-abc.mp3'))

    await waitFor(() => expect(result.current).toBe('https://signed.example/halo.mp3?token=x'))
    expect(supabase.storage.from).toHaveBeenCalledWith('indonesian-tts')
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(['tts/despina/halo-abc.mp3'], 21600)
  })

  it('coalesces two sibling hook instances mounted in the same tick into ONE createSignedUrls call', async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: 'a.mp3', signedUrl: 'https://signed.example/a.mp3', error: null },
        { path: 'b.mp3', signedUrl: 'https://signed.example/b.mp3', error: null },
      ],
      error: null,
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls } as any)

    const { useSignedAudioSrc } = await import('@/lib/signedAudioUrl')
    const { result: r1 } = renderHook(() => useSignedAudioSrc('indonesian-lessons/a.mp3'))
    const { result: r2 } = renderHook(() => useSignedAudioSrc('indonesian-lessons/b.mp3'))

    await waitFor(() => expect(r1.current).toBe('https://signed.example/a.mp3'))
    await waitFor(() => expect(r2.current).toBe('https://signed.example/b.mp3'))
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(['a.mp3', 'b.mp3'], 21600)
  })

  it('returns null for a per-path signing failure without logging (non-entitled is expected)', async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{ path: 'paid.mp3', signedUrl: null, error: 'not entitled' }],
      error: null,
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls } as any)

    const { useSignedAudioSrc } = await import('@/lib/signedAudioUrl')
    const { logError } = await import('@/lib/logger')
    const { result } = renderHook(() => useSignedAudioSrc('indonesian-lessons/paid.mp3'))

    await waitFor(() => expect(createSignedUrls).toHaveBeenCalledTimes(1))
    expect(result.current).toBeNull()
    expect(logError).not.toHaveBeenCalled()
  })

  it('returns null and logs on a wholesale batch failure', async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({ data: null, error: new Error('network down') })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls } as any)

    const { useSignedAudioSrc } = await import('@/lib/signedAudioUrl')
    const { logError } = await import('@/lib/logger')
    const { result } = renderHook(() => useSignedAudioSrc('indonesian-lessons/a.mp3'))

    await waitFor(() => expect(createSignedUrls).toHaveBeenCalledTimes(1))
    expect(result.current).toBeNull()
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ page: 'signed-audio-url', action: 'createSignedUrls' }),
    )
  })

  it('returns null and logs for an unparseable stored reference, without calling Stripe/storage', async () => {
    const { useSignedAudioSrc } = await import('@/lib/signedAudioUrl')
    const { logError } = await import('@/lib/logger')
    const { result } = renderHook(() => useSignedAudioSrc('garbage-not-a-storage-reference'))

    await waitFor(() =>
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ page: 'signed-audio-url', action: 'parseStoredAudioUrl' }),
      ),
    )
    expect(result.current).toBeNull()
    expect(supabase.storage.from).not.toHaveBeenCalled()
  })

  it('returns null when src is undefined, without calling storage', async () => {
    const { useSignedAudioSrc } = await import('@/lib/signedAudioUrl')
    const { result } = renderHook(() => useSignedAudioSrc(undefined))

    expect(result.current).toBeNull()
    expect(supabase.storage.from).not.toHaveBeenCalled()
  })
})
