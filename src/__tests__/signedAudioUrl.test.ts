import { describe, it, expect, vi, beforeEach } from 'vitest'
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
