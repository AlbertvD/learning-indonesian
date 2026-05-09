import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock set-lesson-voices.ts so audio.ts's voice-config step is observable
// without needing a real Supabase client. vi.hoisted ensures the mock is
// initialized before vi.mock's hoisted call runs.
const { setLessonVoicesForLessonMock } = vi.hoisted(() => ({
  setLessonVoicesForLessonMock: vi.fn().mockResolvedValue({
    primaryVoice: 'id-ID-Chirp3-HD-Despina',
    dialogueVoices: {},
  }),
}))
vi.mock('../../../../set-lesson-voices', () => ({
  setLessonVoicesForLesson: setLessonVoicesForLessonMock,
}))

import { ensureLessonAudio } from '../audio'

interface RpcCall {
  fn: string
  args: unknown
}

function buildSupabaseMock(options: {
  existingClips?: Array<{ normalized_text: string; voice_id: string }>
  rpcError?: Error
  uploadError?: Error
  insertError?: Error
}): { client: any; rpcCalls: RpcCall[]; uploads: Array<{ path: string }>; inserts: Array<Record<string, unknown>> } {
  const rpcCalls: RpcCall[] = []
  const uploads: Array<{ path: string }> = []
  const inserts: Array<Record<string, unknown>> = []

  const client = {
    schema: () => ({
      rpc: vi.fn(async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args })
        if (fn === 'get_audio_clips') {
          if (options.rpcError) return { data: null, error: options.rpcError }
          return { data: options.existingClips ?? [], error: null }
        }
        return { data: [], error: null }
      }),
      from: () => ({
        insert: vi.fn(async (row: Record<string, unknown>) => {
          inserts.push(row)
          return { error: options.insertError ?? null }
        }),
      }),
    }),
    storage: {
      from: () => ({
        upload: vi.fn(async (path: string) => {
          uploads.push({ path })
          return { error: options.uploadError ?? null }
        }),
      }),
    },
  }

  return { client, rpcCalls, uploads, inserts }
}

describe('ensureLessonAudio', () => {
  beforeEach(() => {
    setLessonVoicesForLessonMock.mockClear()
  })

  it('empty texts → no synthesis, no DB call', async () => {
    const { client } = buildSupabaseMock({})
    const synth = vi.fn(async () => Buffer.from('x'))
    const result = await ensureLessonAudio({
      lessonId: 'l1',
      orderIndex: 1,
      texts: [],
      audioBudget: 100,
      supabase: client,
      synthesizer: synth,
    })
    expect(result).toEqual({ synthesised: 0, reused: 0 })
    expect(synth).not.toHaveBeenCalled()
  })

  it('all texts already exist → 0 synthesised, N reused', async () => {
    const { client, rpcCalls } = buildSupabaseMock({
      existingClips: [
        { normalized_text: 'halo', voice_id: 'V1' },
        { normalized_text: 'apa kabar', voice_id: 'V1' },
      ],
    })
    const synth = vi.fn(async () => Buffer.from('x'))
    const result = await ensureLessonAudio({
      lessonId: 'l1',
      orderIndex: 1,
      texts: [
        { text: 'Halo', voiceId: 'V1' },
        { text: 'apa kabar', voiceId: 'V1' },
      ],
      audioBudget: 100,
      supabase: client,
      synthesizer: synth,
    })
    expect(result).toEqual({ synthesised: 0, reused: 2 })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('get_audio_clips')
    expect(synth).not.toHaveBeenCalled()
  })

  it('new texts within budget → synthesised, uploaded, inserted', async () => {
    const { client, uploads, inserts } = buildSupabaseMock({ existingClips: [] })
    const synth = vi.fn(async () => Buffer.from('audio bytes'))
    const result = await ensureLessonAudio({
      lessonId: 'l1',
      orderIndex: 1,
      texts: [
        { text: 'Halo', voiceId: 'V1' },
        { text: 'apa kabar', voiceId: 'V1' },
      ],
      audioBudget: 10,
      supabase: client,
      synthesizer: synth,
    })
    expect(result).toEqual({ synthesised: 2, reused: 0 })
    expect(synth).toHaveBeenCalledTimes(2)
    expect(uploads).toHaveLength(2)
    expect(inserts).toHaveLength(2)
    expect(inserts[0].generated_for_lesson_id).toBe('l1')
    expect(inserts[0].voice_id).toBe('V1')
  })

  it('mixed batch: some existing, some new', async () => {
    const { client, inserts } = buildSupabaseMock({
      existingClips: [{ normalized_text: 'halo', voice_id: 'V1' }],
    })
    const synth = vi.fn(async () => Buffer.from('x'))
    const result = await ensureLessonAudio({
      lessonId: 'l1',
      orderIndex: 1,
      texts: [
        { text: 'Halo', voiceId: 'V1' },
        { text: 'apa kabar', voiceId: 'V1' },
        { text: 'baik', voiceId: 'V2' },
      ],
      audioBudget: 10,
      supabase: client,
      synthesizer: synth,
    })
    expect(result).toEqual({ synthesised: 2, reused: 1 })
    expect(synth).toHaveBeenCalledTimes(2)
    expect(inserts).toHaveLength(2)
  })

  it('exceeding the audio budget throws before any synthesis', async () => {
    const { client } = buildSupabaseMock({ existingClips: [] })
    const synth = vi.fn(async () => Buffer.from('x'))
    await expect(
      ensureLessonAudio({
        lessonId: 'l1',
        orderIndex: 1,
        texts: [
          { text: 'a', voiceId: 'V1' },
          { text: 'b', voiceId: 'V1' },
          { text: 'c', voiceId: 'V1' },
        ],
        audioBudget: 2,
        supabase: client,
        synthesizer: synth,
      }),
    ).rejects.toThrow(/budget exceeded/i)
    expect(synth).not.toHaveBeenCalled()
  })

  it('voice configuration is applied via setLessonVoicesForLesson before synthesis', async () => {
    const { client } = buildSupabaseMock({ existingClips: [] })
    const synth = vi.fn(async () => Buffer.from('x'))
    let voiceCalled = false
    let synthCalledFirst = false
    setLessonVoicesForLessonMock.mockImplementationOnce(async () => {
      voiceCalled = true
      return { primaryVoice: 'V1', dialogueVoices: {} }
    })
    synth.mockImplementationOnce(async () => {
      if (!voiceCalled) synthCalledFirst = true
      return Buffer.from('x')
    })
    await ensureLessonAudio({
      lessonId: 'l1',
      orderIndex: 1,
      texts: [{ text: 'halo', voiceId: 'V1' }],
      audioBudget: 5,
      supabase: client,
      synthesizer: synth,
    })
    expect(setLessonVoicesForLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 'l1', orderIndex: 1 }),
    )
    expect(synthCalledFirst).toBe(false)
  })

  it('dryRun: no synthesis, no inserts, only dedup query (and voice config in dry-run mode)', async () => {
    const { client, inserts, uploads, rpcCalls } = buildSupabaseMock({ existingClips: [] })
    const synth = vi.fn(async () => Buffer.from('x'))
    const result = await ensureLessonAudio({
      lessonId: 'l1',
      orderIndex: 1,
      texts: [
        { text: 'halo', voiceId: 'V1' },
        { text: 'apa', voiceId: 'V1' },
      ],
      audioBudget: 10,
      supabase: client,
      dryRun: true,
      synthesizer: synth,
    })
    expect(result.synthesised).toBe(0)
    expect(synth).not.toHaveBeenCalled()
    expect(inserts).toEqual([])
    expect(uploads).toEqual([])
    expect(rpcCalls).toHaveLength(1)
    expect(setLessonVoicesForLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    )
  })

  it('text dedup is keyed on (normalized_text, voiceId) — same text + different voice = 2 syntheses', async () => {
    const { client } = buildSupabaseMock({ existingClips: [] })
    const synth = vi.fn(async () => Buffer.from('x'))
    const result = await ensureLessonAudio({
      lessonId: 'l1',
      orderIndex: 1,
      texts: [
        { text: 'halo', voiceId: 'V1' },
        { text: 'halo', voiceId: 'V2' },
        { text: 'HALO', voiceId: 'V1' }, // same as first after normalization
      ],
      audioBudget: 10,
      supabase: client,
      synthesizer: synth,
    })
    expect(result.synthesised).toBe(2)
    expect(synth).toHaveBeenCalledTimes(2)
  })
})
