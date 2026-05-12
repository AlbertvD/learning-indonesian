import { describe, it, expect, vi } from 'vitest'

const { setLessonVoicesForLessonMock } = vi.hoisted(() => ({
  setLessonVoicesForLessonMock: vi.fn().mockResolvedValue({
    primaryVoice: 'V1',
    dialogueVoices: { Andi: 'V2' },
  }),
}))
vi.mock('../../../../set-lesson-voices', () => ({
  setLessonVoicesForLesson: setLessonVoicesForLessonMock,
}))

import { runLessonStage, collectLessonPageTexts } from '../runner'

interface StagingBundle {
  lesson: any
  pageBlocks: any[]
  grammarPatterns: any[]
}

function buildSyntheticStaging(): StagingBundle {
  return {
    lesson: {
      title: 'Synthetic Lesson',
      description: null,
      level: 'A1',
      module_id: 'm1',
      order_index: 99,
      primary_voice: 'V1',
      dialogue_voices: { Andi: 'V2', Budi: 'V3' },
      sections: [
        {
          title: 'Vocab',
          order_index: 0,
          content: {
            type: 'vocabulary',
            items: [
              { indonesian: 'halo', dutch: 'hallo', pos: 'greeting', level: 'A1' },
              { indonesian: 'apa kabar', dutch: 'hoe gaat het', pos: 'greeting', level: 'A1' },
            ],
          },
        },
        {
          title: 'Dialoog',
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [
              { text: 'Halo Budi', speaker: 'Andi', translation: 'Hallo Budi' },
              { text: 'Halo Andi', speaker: 'Budi', translation: 'Hallo Andi' },
            ],
          },
        },
        {
          title: 'Grammatica',
          order_index: 2,
          content: { type: 'grammar', grammar_topics: ['ada existential'] },
        },
      ],
    },
    grammarPatterns: [
      { slug: 'ada-existential', pattern_name: 'ADA — existential', complexity_score: 2 },
    ],
    pageBlocks: [
      {
        block_key: 'b1',
        source_ref: 'lesson-99',
        source_refs: ['lesson-99'],
        content_unit_slugs: [],
        block_kind: 'hero',
        display_order: 0,
        payload_json: { type: 'text', paragraphs: ['Welcome'] },
        capability_key_refs: [],
      },
      {
        block_key: 'b2',
        source_ref: 'lesson-99',
        source_refs: ['lesson-99'],
        content_unit_slugs: [],
        block_kind: 'section',
        display_order: 1,
        payload_json: { type: 'dialogue' },
        capability_key_refs: [],
      },
    ],
  }
}

interface SupabaseRecorder {
  upserts: Array<{ table: string; payload: any; onConflict?: string }>
  inserts: Array<{ table: string; payload: any }>
  updates: Array<{ table: string; payload: any }>
  rpcCalls: Array<{ fn: string; args: any }>
  uploads: Array<{ path: string }>
}

function buildSupabaseMock(opts: {
  existingClips?: Array<{ normalized_text: string; voice_id: string }>
} = {}): { client: any; recorder: SupabaseRecorder } {
  const recorder: SupabaseRecorder = {
    upserts: [], inserts: [], updates: [], rpcCalls: [], uploads: [],
  }

  const tableBuilder = (table: string) => {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        single: async () => ({ data: { id: 'new-lesson-id' }, error: null }),
      }),
      insert: (payload: any) => {
        recorder.inserts.push({ table, payload })
        return {
          select: () => ({
            single: async () => ({ data: { id: 'new-lesson-id' }, error: null }),
          }),
        }
      },
      update: (payload: any) => ({
        eq: async () => {
          recorder.updates.push({ table, payload })
          return { error: null }
        },
      }),
      upsert: (payload: any, opts2?: { onConflict?: string }) => {
        recorder.upserts.push({ table, payload, onConflict: opts2?.onConflict })
        return {
          then: (onResolve: (v: { error: null }) => unknown) => onResolve({ error: null }),
          select: () => ({
            single: async () => ({ data: { id: 'upserted-id' }, error: null }),
          }),
        }
      },
    }
  }

  const client = {
    schema: () => ({
      from: (table: string) => tableBuilder(table),
      rpc: vi.fn(async (fn: string, args: any) => {
        recorder.rpcCalls.push({ fn, args })
        if (fn === 'get_audio_clips') return { data: opts.existingClips ?? [], error: null }
        return { data: [], error: null }
      }),
    }),
    storage: {
      from: () => ({
        upload: vi.fn(async (p: string) => {
          recorder.uploads.push({ path: p })
          return { error: null }
        }),
      }),
    },
  }
  return { client, recorder }
}

describe('runLessonStage — synthetic fixture', () => {
  it('runs all 7 validators, classifies blocks, writes via adapter, returns ok', async () => {
    const staging = buildSyntheticStaging()
    const { client, recorder } = buildSupabaseMock({})

    const result = await runLessonStage(
      { lessonNumber: 99 },
      {
        loadStaging: async () => staging,
        createSupabaseClient: () => client,
        synthesizer: async () => Buffer.from('audio-bytes'),
      },
    )

    expect(result.status).toBe('ok')
    // Lesson + sections + page-blocks all written.
    expect(recorder.inserts.find((i) => i.table === 'lessons')).toBeDefined()
    expect(recorder.upserts.filter((u) => u.table === 'lesson_sections')).toHaveLength(3)
    expect(recorder.upserts.filter((u) => u.table === 'lesson_page_blocks')).toHaveLength(2)
    // page-block kinds got classified to canonical 7-value set.
    const blockKinds = recorder.upserts
      .filter((u) => u.table === 'lesson_page_blocks')
      .map((u) => u.payload.block_kind)
    expect(blockKinds.sort()).toEqual(['dialogue_card', 'lesson_hero'])
    // Counts match.
    expect(result.counts.sections).toBe(3)
    expect(result.counts.pageBlocks).toBe(2)
    // Findings has only warnings (no errors).
    expect(result.findings.every((f) => f.severity !== 'error')).toBe(true)
  })

  it('idempotent on a second call: no new findings, no new audio synthesised', async () => {
    const staging = buildSyntheticStaging()
    const { client } = buildSupabaseMock({
      existingClips: [
        { normalized_text: 'halo', voice_id: 'V1' },
        { normalized_text: 'apa kabar', voice_id: 'V1' },
        { normalized_text: 'halo budi', voice_id: 'V2' },
        { normalized_text: 'halo andi', voice_id: 'V3' },
      ],
    })
    const result = await runLessonStage(
      { lessonNumber: 99 },
      { loadStaging: async () => staging, createSupabaseClient: () => client },
    )
    expect(result.status).toBe('ok')
    expect(result.counts.audioClipsSynthesised).toBe(0)
    expect(result.counts.audioClipsReused).toBeGreaterThan(0)
  })

  it('validation errors short-circuit before any DB calls', async () => {
    const staging = buildSyntheticStaging()
    // Break a section's type to trigger GT5 (sectionType) error.
    staging.lesson.sections[0].content.type = 'unknown_type_xyz'
    const { client, recorder } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99 },
      { loadStaging: async () => staging, createSupabaseClient: () => client },
    )
    expect(result.status).toBe('validation_failed')
    expect(result.findings.some((f) => f.gate === 'GT5' && f.severity === 'error')).toBe(true)
    // No DB calls because errors short-circuited.
    expect(recorder.inserts).toEqual([])
    expect(recorder.upserts).toEqual([])
    expect(recorder.rpcCalls).toEqual([])
  })

  it('GT1 short-circuits when grammar_topics is empty and the enricher does not fill it', async () => {
    const staging = buildSyntheticStaging()
    // Force a state where the grammar section's topics are empty AND the
    // enricher is stubbed to be a no-op (e.g. an LLM/network failure).
    staging.lesson.sections[2].content.grammar_topics = []
    const { client, recorder } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99 },
      {
        loadStaging: async () => staging,
        createSupabaseClient: () => client,
        enrichGrammarTopics: async () => ({ filledSectionCount: 0, labels: [], source: 'none' }),
      },
    )
    expect(result.status).toBe('validation_failed')
    expect(result.findings.some((f) => f.gate === 'GT1' && f.severity === 'error')).toBe(true)
    expect(recorder.inserts).toEqual([])
    expect(recorder.upserts).toEqual([])
  })

  it('enricher fills empty grammar_topics before GT1 runs; lesson publishes ok', async () => {
    const staging = buildSyntheticStaging()
    staging.lesson.sections[2].content.grammar_topics = []
    const { client } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99 },
      {
        loadStaging: async () => staging,
        createSupabaseClient: () => client,
        synthesizer: async () => Buffer.from('audio-bytes'),
        // Enricher mutates the section in place and reports success — same
        // contract as the real enricher when LLM returns labels.
        enrichGrammarTopics: async (sections) => {
          for (const s of sections) {
            if (s.content?.type === 'grammar' || s.content?.type === 'reference_table') {
              s.content.grammar_topics = ['Synthetic theme']
            }
          }
          return { filledSectionCount: 1, labels: ['Synthetic theme'], source: 'llm' }
        },
      },
    )
    expect(result.status).toBe('ok')
    expect(result.findings.some((f) => f.gate === 'GT1')).toBe(false)
  })

  it('dryRun skips DB + audio calls but still returns counts based on staging', async () => {
    const staging = buildSyntheticStaging()
    const { client, recorder } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99, dryRun: true },
      { loadStaging: async () => staging, createSupabaseClient: () => client },
    )
    expect(result.status).toBe('ok')
    expect(result.counts.sections).toBe(3)
    expect(result.counts.pageBlocks).toBe(2)
    expect(result.counts.audioClipsSynthesised).toBe(0)
    expect(recorder.inserts).toEqual([])
    expect(recorder.upserts).toEqual([])
    expect(recorder.rpcCalls).toEqual([])
  })

  it('payload audioUrl in a page-block surfaces a GT3 error', async () => {
    const staging = buildSyntheticStaging()
    staging.pageBlocks[0].payload_json = { type: 'text', audioUrl: 'tts/x.mp3' }
    const { client } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99 },
      { loadStaging: async () => staging, createSupabaseClient: () => client },
    )
    expect(result.status).toBe('validation_failed')
    expect(result.findings.some((f) => f.gate === 'GT3' && f.severity === 'error')).toBe(true)
  })

  it('missing dialogue voice triggers GT4 error', async () => {
    const staging = buildSyntheticStaging()
    staging.lesson.dialogue_voices = null
    const { client } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99 },
      { loadStaging: async () => staging, createSupabaseClient: () => client },
    )
    expect(result.status).toBe('validation_failed')
    expect(result.findings.some((f) => f.gate === 'GT4' && f.severity === 'error')).toBe(true)
  })
})

describe('collectLessonPageTexts', () => {
  it('returns dialogue lines voiced via dialogue_voices + vocab/expressions/numbers via primary_voice', () => {
    const staging = buildSyntheticStaging()
    const texts = collectLessonPageTexts(staging.lesson)
    expect(texts).toEqual([
      { text: 'halo', voiceId: 'V1' },
      { text: 'apa kabar', voiceId: 'V1' },
      { text: 'Halo Budi', voiceId: 'V2' },
      { text: 'Halo Andi', voiceId: 'V3' },
    ])
  })

  it('skips dialogue lines when speaker has no voice mapping', () => {
    const lesson = {
      sections: [
        {
          title: 'D', order_index: 0,
          content: { type: 'dialogue', lines: [{ text: 'a', speaker: 'Cici' }] },
        },
      ],
      primary_voice: 'V1',
      dialogue_voices: { Andi: 'V2' },
    }
    expect(collectLessonPageTexts(lesson)).toEqual([])
  })

  it('returns empty when no primary_voice and no dialogue_voices', () => {
    const lesson = {
      sections: [
        {
          title: 'V', order_index: 0,
          content: { type: 'vocabulary', items: [{ indonesian: 'halo' }] },
        },
      ],
      primary_voice: null,
      dialogue_voices: null,
    }
    expect(collectLessonPageTexts(lesson)).toEqual([])
  })
})
