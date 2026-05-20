import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { enrichMissingEnTranslationsMock, enrichMissingPosMock } = vi.hoisted(() => ({
  enrichMissingEnTranslationsMock: vi.fn().mockResolvedValue({
    translationsByBaseText: new Map<string, string>(),
    translatedCount: 0,
  }),
  enrichMissingPosMock: vi.fn().mockResolvedValue({
    posByBaseText: new Map<string, string>(),
    enrichedCount: 0,
  }),
}))
vi.mock('../enrichEnTranslations', () => ({
  enrichMissingEnTranslations: enrichMissingEnTranslationsMock,
}))
vi.mock('../enrichPos', () => ({
  enrichMissingPos: enrichMissingPosMock,
}))

import { runCapabilityStage } from '../runner'
import type { LoadedLesson } from '../loader'

interface SupabaseMockTable {
  rows: Array<Record<string, unknown>>
  countOverride?: number
}

function buildSupabaseMock(opts: {
  tables?: Record<string, SupabaseMockTable>
} = {}) {
  const tables = opts.tables ?? {}
  const recorder = {
    upserts: [] as Array<{ table: string; payload: Record<string, unknown>; onConflict?: string }>,
    inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    deletes: [] as Array<{ table: string }>,
  }

  const idGen = (table: string) =>
    `${table}-id-${recorder.upserts.length + recorder.inserts.length}`

  const fromBuilder = (table: string) => {
    const t = tables[table] ?? { rows: [] }
    let current = [...t.rows]
    return {
      select: (_cols: string, selectOpts?: { count?: 'exact'; head?: boolean }) => {
        const buildResult = () => ({
          data: current,
          error: null,
          count: selectOpts?.count ? (t.countOverride ?? current.length) : undefined,
        })
        const chain: any = {
          eq: (col: string, val: unknown) => {
            current = current.filter((r) => r[col] === val)
            return chain
          },
          in: (col: string, vals: unknown[]) => {
            current = current.filter((r) => vals.includes(r[col]))
            return chain
          },
          ilike: () => chain,
          limit: () => chain,
          order: () => chain,
          maybeSingle: async () => ({ data: current[0] ?? null, error: null }),
          single: async () => ({ data: current[0] ?? null, error: null }),
          then: (resolve: (v: ReturnType<typeof buildResult>) => unknown) => resolve(buildResult()),
        }
        return chain
      },
      upsert: (payload: Record<string, unknown>, opts2?: { onConflict?: string }) => {
        recorder.upserts.push({ table, payload, onConflict: opts2?.onConflict })
        const id = idGen(table)
        const data = {
          id,
          ...payload,
          unit_slug: payload.unit_slug,
          canonical_key: payload.canonical_key,
          normalized_text: payload.normalized_text,
          slug: payload.slug,
        }
        return {
          select: () => ({
            single: async () => ({ data, error: null }),
          }),
          then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
        }
      },
      insert: (payload: Record<string, unknown>) => {
        recorder.inserts.push({ table, payload })
        const id = idGen(table)
        return {
          select: () => ({
            single: async () => ({ data: { id }, error: null }),
          }),
          then: (resolve: (v: { error: null; data: { id: string } }) => unknown) =>
            resolve({ error: null, data: { id } }),
        }
      },
      delete: () => ({
        eq: async () => {
          recorder.deletes.push({ table })
          return { error: null }
        },
      }),
    }
  }

  const client = {
    schema: () => ({ from: fromBuilder }),
  }
  return { client, recorder }
}

// Each test gets its own tmpdir so the in-runner snapshot writes
// (content-units.ts, capabilities.ts, exercise-assets.ts, lesson-page-blocks.ts,
// learning-items.ts) don't collide across tests or leak between runs.
let tmpStagingDir: string

function makeSynthLesson(overrides: { stagingDir: string }): LoadedLesson {
  return {
    lesson: {
      id: 'lesson-uuid',
      module_id: 'module-1',
      order_index: 1,
      title: 'Test Lesson',
      level: 'A1',
      primary_voice: 'Achird',
    },
    sections: [
      {
        id: 'section-vocab',
        title: 'Woordenschat',
        order_index: 0,
        content: {
          type: 'vocabulary',
          items: [
            { indonesian: 'halo', dutch: 'hallo', pos: 'greeting', level: 'A1' },
          ],
        },
      },
      {
        id: 'section-grammar',
        title: 'Grammatica',
        order_index: 1,
        content: { type: 'grammar', grammar_topics: ['ada existential'] },
      },
    ],
    audioClipsByNormalizedText: new Map([
      ['halo', { storage_path: 'lesson-1/halo-Achird.mp3', voice_id: 'Achird' }],
    ]),
    staging: {
      stagingDir: overrides.stagingDir,
      learningItems: [
        {
          base_text: 'halo',
          item_type: 'word',
          context_type: 'vocabulary_list',
          translation_nl: 'hallo',
          translation_en: 'hello',
          pos: 'greeting',
          level: 'A1',
          review_status: 'pending_review',
        },
      ],
      grammarPatterns: [
        {
          slug: 'ada-existential',
          pattern_name: 'ADA existential',
          description: 'Indonesian uses *ada* to mark existence.',
          example: 'Ada buku — er is een boek',
          complexity_score: 2,
        },
      ],
      candidates: [],
      clozeContexts: [],
      contentUnits: [],
      capabilities: [],
      exerciseAssets: [],
      affixedFormPairs: [],
    },
  }
}

describe('runCapabilityStage — synthetic fixture (staging-aware)', () => {
  beforeEach(() => {
    tmpStagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-stage-test-'))
    enrichMissingEnTranslationsMock.mockResolvedValue({
      translationsByBaseText: new Map<string, string>(),
      translatedCount: 0,
    })
    enrichMissingPosMock.mockResolvedValue({
      posByBaseText: new Map<string, string>(),
      enrichedCount: 0,
    })
  })

  afterEach(() => {
    if (tmpStagingDir && fs.existsSync(tmpStagingDir)) {
      fs.rmSync(tmpStagingDir, { recursive: true, force: true })
    }
  })

  it('returns status:ok on a clean fixture and reaches the seed-hook phase', async () => {
    const { client } = buildSupabaseMock({})
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeSynthLesson({ stagingDir: tmpStagingDir }),
        createSupabaseClient: () => client as never,
      },
    )
    expect(['ok', 'partial']).toContain(result.status)
    expect(result.findings.every((f) => f.gate.startsWith('CS'))).toBe(true)
    expect(result.counts.learningItems).toBe(1)
  })

  it('short-circuits with status:validation_failed when CS6 (grammar pattern) fails', async () => {
    const synth = makeSynthLesson({ stagingDir: tmpStagingDir })
    const lessonWithBadPattern: LoadedLesson = {
      ...synth,
      staging: {
        ...synth.staging,
        grammarPatterns: [{ slug: 'BAD_SLUG', pattern_name: 'X', description: 'irrelevant', example: 'irrelevant example', complexity_score: 1 }],
      },
    }
    const { client } = buildSupabaseMock({})

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => lessonWithBadPattern,
        createSupabaseClient: () => client as never,
      },
    )
    expect(result.status).toBe('validation_failed')
    expect(result.findings.some((f) => f.gate === 'CS6' && f.severity === 'error')).toBe(true)
  })

  // CS1 (grammar_topics) moved back to lesson-stage as GT1 — see
  // lesson-stage/__tests__/runner.test.ts for the integration coverage.
  // No equivalent short-circuit test belongs here.

  it('throws when invoked without lessonId (Stage A status guard)', async () => {
    await expect(
      runCapabilityStage(
        { lessonNumber: 1, lessonId: '' },
        { loadLesson: async () => makeSynthLesson({ stagingDir: tmpStagingDir }) },
      ),
    ).rejects.toThrow(/lessonId/)
  })

  it('dryRun returns ok without DB writes', async () => {
    const { client, recorder } = buildSupabaseMock({})
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid', dryRun: true },
      {
        loadLesson: async () => makeSynthLesson({ stagingDir: tmpStagingDir }),
        createSupabaseClient: () => client as never,
      },
    )
    expect(result.status).toBe('ok')
    expect(recorder.upserts).toEqual([])
    expect(recorder.inserts).toEqual([])
  })

  it('does not regenerate lesson-page-blocks.ts (Phase 1: pipeline does not produce page blocks)', async () => {
    const writes: string[] = []
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation((p: fs.PathOrFileDescriptor) => {
      writes.push(String(p))
    })
    try {
      const { client } = buildSupabaseMock({})
      await runCapabilityStage(
        { lessonNumber: 1, lessonId: 'lesson-uuid' },
        {
          loadLesson: async () => makeSynthLesson({ stagingDir: tmpStagingDir }),
          createSupabaseClient: () => client as never,
        },
      )
    } finally {
      spy.mockRestore()
    }
    expect(writes.find((w) => w.endsWith('lesson-page-blocks.ts'))).toBeUndefined()
  })

  it('regenerates content-unit snapshots from enriched learning items so the upsert sees post-enrichment data', async () => {
    // Set up: staging has a learning item with empty translation_en and a stale
    // snapshot (contentUnits) that pre-dates enrichment — translationEn is empty.
    // The runner's enrichment fills translation_en in-memory; without regeneration,
    // the snapshot's payload_json.translationEn stays empty when upserted.
    const synth = makeSynthLesson({ stagingDir: tmpStagingDir })
    const lessonWithStaleSnapshot: LoadedLesson = {
      ...synth,
      staging: {
        ...synth.staging,
        learningItems: [
          {
            base_text: 'makan',
            item_type: 'word',
            context_type: 'vocabulary_list',
            translation_nl: 'eten',
            translation_en: '', // empty — enrichment should fill this
            pos: 'verb',
            level: 'A1',
            review_status: 'pending_review',
          },
        ],
        // Stale snapshot — built before enrichment, so translationEn is empty.
        contentUnits: [
          {
            content_unit_key: 'item-makan::lesson-1/section-vocabulary::item-makan',
            source_ref: 'item-makan',
            source_section_ref: 'lesson-1/section-vocabulary',
            unit_kind: 'learning_item',
            unit_slug: 'item-makan',
            display_order: 1000,
            payload_json: {
              baseText: 'makan',
              itemType: 'word',
              translationNl: 'eten',
              translationEn: '', // stale
            },
            source_fingerprint: 'stale-fingerprint',
          },
        ],
      },
    }

    // Mock the LLM enricher: fill translation_en for "makan" → "to eat".
    enrichMissingEnTranslationsMock.mockResolvedValueOnce({
      translationsByBaseText: new Map([['makan', 'to eat']]),
      translatedCount: 1,
    })

    const { client, recorder } = buildSupabaseMock({})
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => lessonWithStaleSnapshot,
        createSupabaseClient: () => client as never,
      },
    )

    expect(['ok', 'partial']).toContain(result.status)

    // Find the content_units upsert payload for our learning item.
    const learningItemUpserts = recorder.upserts.filter(
      (u) => u.table === 'content_units' && u.payload.unit_slug === 'item-makan',
    )
    expect(learningItemUpserts).toHaveLength(1)
    const payload = learningItemUpserts[0].payload as {
      payload_json: { translationEn?: string }
    }
    // This is the centerpiece assertion: the regenerated snapshot picked up
    // the enriched EN translation, so the DB upsert carries "to eat" — not "".
    expect(payload.payload_json.translationEn).toBe('to eat')
  })
})
