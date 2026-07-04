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
              // english present so GT9 (sectionShape) passes without an LLM call —
              // mirrors how dialogue lines pre-carry `translation` for GT8.
              { indonesian: 'halo', dutch: 'hallo', english: 'hello', pos: 'greeting', level: 'A1' },
              { indonesian: 'apa kabar', dutch: 'hoe gaat het', english: 'how are you', pos: 'greeting', level: 'A1' },
            ],
          },
        },
        {
          title: 'Dialoog',
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [
              { text: 'Halo Budi', speaker: 'Andi', translation: 'Hallo Budi', translation_en: 'Hello Budi' },
              { text: 'Halo Andi', speaker: 'Budi', translation: 'Hallo Andi', translation_en: 'Hello Andi' },
            ],
          },
        },
        {
          title: 'Grammatica',
          order_index: 2,
          content: {
            type: 'grammar',
            grammar_topics: ['ada existential'],
            categories: [
              {
                title: 'Ada als existentieel werkwoord',
                title_en: 'Ada as existential verb',
                rules: ['Ada drukt bestaan/aanwezigheid uit.'],
                rules_en: ['Ada expresses existence/presence.'],
              },
            ],
          },
        },
      ],
    },
  }
}

interface SupabaseRecorder {
  upserts: Array<{ table: string; payload: any; onConflict?: string }>
  inserts: Array<{ table: string; payload: any }>
  updates: Array<{ table: string; payload: any }>
  rpcCalls: Array<{ fn: string; args: any }>
  uploads: Array<{ path: string }>
}

/**
 * Stateful Supabase mock. Records writes (recorder) AND stores the written
 * rows per table so the Lesson Gate's post-write read-back (LV1 count parity,
 * LV2 content non-empty) sees what the runner just wrote — exercising the real
 * declared-vs-DB wiring rather than stubbing it. Mirrors the capability-stage
 * runner test's count-aware mock.
 *
 * Overrides simulate failure modes without rollback:
 *   - countOverrides[table]: force a count-head read to return < what was
 *     written (a silent short write → LV1).
 *   - sectionContentOverride: replace the lesson_sections content read with a
 *     row carrying an empty blob (→ LV2).
 */
function buildSupabaseMock(opts: {
  existingClips?: Array<{ normalized_text: string; voice_id: string }>
  countOverrides?: Record<string, number>
  sectionContentOverride?: Array<{ id: string; order_index: number; content: unknown }>
} = {}): { client: any; recorder: SupabaseRecorder } {
  const recorder: SupabaseRecorder = {
    upserts: [], inserts: [], updates: [], rpcCalls: [], uploads: [],
  }
  // Written-row store, keyed by table. `lessons` is intentionally never stored
  // (the find-or-insert path expects no existing row → insert).
  const store: Record<string, Array<Record<string, any>>> = {}
  const rowsOf = (table: string) => (store[table] ??= [])

  const tableBuilder = (table: string) => {
    return {
      select: (_cols?: string, selectOpts?: { count?: 'exact'; head?: boolean }) => {
        const isContentRead = table === 'lesson_sections' && opts.sectionContentOverride && !selectOpts?.count
        let current: Array<Record<string, any>> = isContentRead
          ? (opts.sectionContentOverride as Array<Record<string, any>>)
          : [...rowsOf(table)]
        const resolve = () => ({
          data: current,
          error: null,
          count: selectOpts?.count
            ? (opts.countOverrides?.[table] ?? current.length)
            : undefined,
        })
        const chain: any = {
          eq: (col: string, val: unknown) => {
            if (!isContentRead) current = current.filter((r) => r[col] === val)
            return chain
          },
          order: () => chain,
          maybeSingle: async () => ({ data: current[0] ?? null, error: null }),
          single: async () => ({ data: current[0] ?? null, error: null }),
          then: (onResolve: (v: ReturnType<typeof resolve>) => unknown) => onResolve(resolve()),
        }
        return chain
      },
      insert: (payload: any) => {
        recorder.inserts.push({ table, payload })
        if (Array.isArray(payload)) rowsOf(table).push(...payload)
        else rowsOf(table).push(payload)
        return {
          then: (onResolve: (v: { error: null }) => unknown) => onResolve({ error: null }),
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
      // PR 6: typed-table writers use delete-then-insert; the dialogue writer
      // prunes with .eq().not('source_line_ref','in',…) (id-preserving upsert).
      delete: () => ({
        in: async (col: string, vals: unknown[]) => {
          store[table] = rowsOf(table).filter((r) => !vals.includes(r[col]))
          return { error: null }
        },
        eq: (col: string, val: unknown) => {
          const run = (keep?: { col: string; refs: Set<string> }) => {
            store[table] = rowsOf(table).filter(
              (r) => r[col] !== val || (keep ? keep.refs.has(r[keep.col]) : false),
            )
            return { error: null }
          }
          return {
            not: (ncol: string, _op: string, list: string) => ({
              then: (onResolve: (v: { error: null }) => unknown) =>
                onResolve(run({
                  col: ncol,
                  refs: new Set(list.slice(1, -1).split(',').map((s) => s.replace(/^"|"$/g, ''))),
                })),
            }),
            then: (onResolve: (v: { error: null }) => unknown) => onResolve(run()),
          }
        },
      }),
      upsert: (payload: any, opts2?: { onConflict?: string }) => {
        recorder.upserts.push({ table, payload, onConflict: opts2?.onConflict })
        if (Array.isArray(payload)) {
          // Batch upsert keyed by the conflict column (dialogue lines on
          // source_line_ref) — id-preserving, like the real DB.
          const key = opts2?.onConflict ?? 'id'
          for (const row of payload) {
            const idx = rowsOf(table).findIndex((r) => r[key] === row[key])
            if (idx >= 0) rowsOf(table)[idx] = { ...rowsOf(table)[idx], ...row }
            else rowsOf(table).push({ ...row, id: `${table}-${rowsOf(table).length}` })
          }
          return {
            then: (onResolve: (v: { error: null }) => unknown) => onResolve({ error: null }),
            select: () => ({ single: async () => ({ data: null, error: null }) }),
          }
        }
        // lesson_sections upserts one row per call, keyed by order_index.
        const id = `sec-${payload?.order_index ?? rowsOf(table).length}`
        const existingIdx = rowsOf(table).findIndex((r) => r.order_index === payload?.order_index)
        const stored = { ...payload, id }
        if (existingIdx >= 0) rowsOf(table)[existingIdx] = stored
        else rowsOf(table).push(stored)
        return {
          then: (onResolve: (v: { error: null }) => unknown) => onResolve({ error: null }),
          select: () => ({
            single: async () => ({ data: { id, order_index: payload?.order_index }, error: null }),
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
  it('runs Stage A cleanly with no page-block or grammar-pattern reads (Phase 1: pipeline does not produce page blocks)', async () => {
    const staging = buildSyntheticStaging()
    // Phase 1: staging no longer carries pageBlocks or grammarPatterns —
    // simulate that by passing a lesson-only bundle to loadStaging.
    const { client, recorder } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99 },
      {
        loadStaging: async () => ({ lesson: staging.lesson } as any),
        createSupabaseClient: () => client,
        synthesizer: async () => Buffer.from('audio-bytes'),
      },
    )
    expect(result.status).toBe('ok')
    expect((result.counts as { pageBlocks?: number }).pageBlocks).toBeUndefined()
    expect(recorder.upserts.filter((u) => u.table === 'lesson_page_blocks')).toEqual([])
  })

  it('runs all validators and writes lesson + sections via adapter, returns ok', async () => {
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
    // Lesson + sections written (page-blocks no longer produced — Phase 1).
    expect(recorder.inserts.find((i) => i.table === 'lessons')).toBeDefined()
    expect(recorder.upserts.filter((u) => u.table === 'lesson_sections')).toHaveLength(3)
    expect(recorder.upserts.filter((u) => u.table === 'lesson_page_blocks')).toEqual([])
    // Counts match.
    expect(result.counts.sections).toBe(3)
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
    expect(result.counts.audioClipsSynthesised).toBe(0)
    expect(recorder.inserts).toEqual([])
    expect(recorder.upserts).toEqual([])
    expect(recorder.rpcCalls).toEqual([])
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

describe('runLessonStage — pre-flight vs publish mode (Lesson Gate, slice 2)', () => {
  /** Synthetic staging with the English stripped from vocab items — the raw,
   *  not-yet-enriched authoring state. */
  function stagingWithoutEn() {
    const staging = buildSyntheticStaging()
    for (const item of staging.lesson.sections[0].content.items as Array<Record<string, unknown>>) {
      delete item.english
    }
    return staging
  }

  it('dry-run runs pre-flight mode: a not-yet-enriched lesson passes with EN as warnings (the wart fix)', async () => {
    const { client } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99, dryRun: true },
      { loadStaging: async () => stagingWithoutEn(), createSupabaseClient: () => client },
    )
    expect(result.status).toBe('ok')
    expect(result.findings.some((f) => f.gate === 'GT9' && f.severity === 'warning')).toBe(true)
    expect(result.findings.some((f) => f.gate === 'GT9' && f.severity === 'error')).toBe(false)
  })

  it('dry-run pre-flight: a raw lesson with un-enriched dialogue NL passes with GT8 as a warning', async () => {
    // The raw catalog state: dialogue lines carry {speaker, text} with no
    // `translation` — the NL enricher (skipped in dry-run) fills it later.
    const staging = stagingWithoutEn()
    for (const line of staging.lesson.sections[1].content.lines as Array<Record<string, unknown>>) {
      delete line.translation
      delete line.translation_en
    }
    const { client } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99, dryRun: true },
      { loadStaging: async () => staging, createSupabaseClient: () => client },
    )
    expect(result.status).toBe('ok')
    expect(result.findings.some((f) => f.gate === 'GT8' && f.severity === 'warning')).toBe(true)
    expect(result.findings.some((f) => f.gate === 'GT8' && f.severity === 'error')).toBe(false)
  })

  it('publish mode enforces EN-completeness as CRITICAL (no-op EN enricher leaves EN missing)', async () => {
    const { client, recorder } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99 },
      {
        loadStaging: async () => stagingWithoutEn(),
        createSupabaseClient: () => client,
        synthesizer: async () => Buffer.from('audio-bytes'),
        // EN enricher is a no-op (e.g. LLM returned nothing) — EN stays missing.
        enrichEnContent: async () => ({ needed: 0, filled: { items: 0, dialogueLines: 0, grammarCategories: 0 } }),
      },
    )
    expect(result.status).toBe('validation_failed')
    expect(result.findings.some((f) => f.gate === 'GT9' && f.severity === 'error')).toBe(true)
    // Pre-write failure → no DB writes.
    expect(recorder.inserts).toEqual([])
    expect(recorder.upserts).toEqual([])
  })
})

describe('runLessonStage — post-write verification (Lesson Gate, ADR 0013)', () => {
  it('clean write passes post-write verification: ok, no LV findings', async () => {
    const staging = buildSyntheticStaging()
    const { client } = buildSupabaseMock({})
    const result = await runLessonStage(
      { lessonNumber: 99 },
      {
        loadStaging: async () => staging,
        createSupabaseClient: () => client,
        synthesizer: async () => Buffer.from('audio-bytes'),
      },
    )
    expect(result.status).toBe('ok')
    expect(result.findings.some((f) => f.gate === 'LV1' || f.gate === 'LV2')).toBe(false)
  })

  it('a short write (DB has fewer rows than written) returns partial with an LV1 finding and no rollback', async () => {
    const staging = buildSyntheticStaging()
    // Simulate item rows silently not landing: the runner writes 2, DB reads 0.
    const { client, recorder } = buildSupabaseMock({
      countOverrides: { lesson_section_item_rows: 0 },
    })
    const result = await runLessonStage(
      { lessonNumber: 99 },
      {
        loadStaging: async () => staging,
        createSupabaseClient: () => client,
        synthesizer: async () => Buffer.from('audio-bytes'),
      },
    )
    expect(result.status).toBe('partial')
    const lv1 = result.findings.filter((f) => f.gate === 'LV1' && f.severity === 'error')
    expect(lv1.length).toBe(1)
    expect(lv1[0].context?.table).toBe('lesson_section_item_rows')
    // No rollback: the writes still happened (the rows were inserted).
    expect(recorder.inserts.some((i) => i.table === 'lesson_section_item_rows')).toBe(true)
  })

  it('an empty content blob in the DB returns partial with an LV2 finding', async () => {
    const staging = buildSyntheticStaging()
    const { client } = buildSupabaseMock({
      sectionContentOverride: [{ id: 'sec-0', order_index: 0, content: {} }],
    })
    const result = await runLessonStage(
      { lessonNumber: 99 },
      {
        loadStaging: async () => staging,
        createSupabaseClient: () => client,
        synthesizer: async () => Buffer.from('audio-bytes'),
      },
    )
    expect(result.status).toBe('partial')
    const lv2 = result.findings.filter((f) => f.gate === 'LV2' && f.severity === 'error')
    expect(lv2.length).toBe(1)
    expect(lv2[0].context?.rowId).toBe('sec-0')
  })

  it('does not run post-write verification in dry-run (no writes to verify)', async () => {
    const staging = buildSyntheticStaging()
    // Even if the read-back would fail, dry-run never writes, so verify is skipped.
    const { client } = buildSupabaseMock({ countOverrides: { lesson_section_item_rows: 0 } })
    const result = await runLessonStage(
      { lessonNumber: 99, dryRun: true },
      { loadStaging: async () => staging, createSupabaseClient: () => client },
    )
    expect(result.status).toBe('ok')
    expect(result.findings.some((f) => f.gate === 'LV1' || f.gate === 'LV2')).toBe(false)
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

  it('voices grammar category example sentences (indonesian) via primary_voice, never the Dutch rules', () => {
    const lesson = {
      sections: [
        {
          title: 'Grammatica - BER-',
          order_index: 0,
          content: {
            type: 'grammar',
            grammar_topics: ['ber- prefix'],
            categories: [
              {
                title: 'BER- werkwoorden',
                // Dutch explanatory rules — must NOT be voiced (Indonesian-only).
                rules: ['Het voorvoegsel BER- maakt van een grondwoord een werkwoord.'],
                examples: [
                  { indonesian: 'Bus merah berangkat sekarang.', dutch: 'De rode bus vertrekt nu.' },
                  { indonesian: 'Candi Borobudur bertingkat delapan.', dutch: 'De Borobudur heeft acht niveaus.' },
                ],
              },
              {
                // Category with only Dutch rules and no examples → emits nothing.
                title: 'Alleen regels',
                rules: ['Een afgeleid werkwoord ontstaat door affixen.'],
              },
            ],
          },
        },
      ],
      primary_voice: 'V1',
      dialogue_voices: null,
    }
    expect(collectLessonPageTexts(lesson)).toEqual([
      { text: 'Bus merah berangkat sekarang.', voiceId: 'V1' },
      { text: 'Candi Borobudur bertingkat delapan.', voiceId: 'V1' },
    ])
  })

  it('skips grammar examples when there is no primary_voice', () => {
    const lesson = {
      sections: [
        {
          title: 'Grammatica',
          order_index: 0,
          content: {
            type: 'grammar',
            categories: [{ title: 't', examples: [{ indonesian: 'berangkat', dutch: 'vertrekken' }] }],
          },
        },
      ],
      primary_voice: null,
      dialogue_voices: null,
    }
    expect(collectLessonPageTexts(lesson)).toEqual([])
  })
})
