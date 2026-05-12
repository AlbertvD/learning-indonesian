import { describe, it, expect } from 'vitest'

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
        return Promise.resolve({ error: null, data: { id: idGen(table) } })
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

const synthLesson: LoadedLesson = {
  lesson: {
    id: 'lesson-uuid',
    module_id: 'module-1',
    order_index: 1,
    title: 'Test Lesson',
    level: 'A1',
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
  pageBlocks: [],
  audioNormalizedTexts: new Set(['halo']),
  staging: {
    stagingDir: '/tmp/lesson-test',
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
      { slug: 'ada-existential', pattern_name: 'ADA existential', complexity_score: 2 },
    ],
    candidates: [],
    clozeContexts: [],
    contentUnits: [],
    capabilities: [],
    lessonPageBlocks: [],
    exerciseAssets: [],
  },
}

describe('runCapabilityStage — synthetic fixture (staging-aware)', () => {
  it('returns status:ok on a clean fixture and reaches the seed-hook phase', async () => {
    const { client } = buildSupabaseMock({})
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => synthLesson,
        createSupabaseClient: () => client as never,
      },
    )
    expect(['ok', 'partial']).toContain(result.status)
    expect(result.findings.every((f) => f.gate.startsWith('CS'))).toBe(true)
    expect(result.counts.learningItems).toBe(1)
  })

  it('short-circuits with status:validation_failed when CS6 (grammar pattern) fails', async () => {
    const lessonWithBadPattern: LoadedLesson = {
      ...synthLesson,
      staging: {
        ...synthLesson.staging,
        grammarPatterns: [{ slug: 'BAD_SLUG', pattern_name: 'X', complexity_score: 1 }],
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
        { loadLesson: async () => synthLesson },
      ),
    ).rejects.toThrow(/lessonId/)
  })

  it('dryRun returns ok without DB writes', async () => {
    const { client, recorder } = buildSupabaseMock({})
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid', dryRun: true },
      {
        loadLesson: async () => synthLesson,
        createSupabaseClient: () => client as never,
      },
    )
    expect(result.status).toBe('ok')
    expect(recorder.upserts).toEqual([])
    expect(recorder.inserts).toEqual([])
  })
})
