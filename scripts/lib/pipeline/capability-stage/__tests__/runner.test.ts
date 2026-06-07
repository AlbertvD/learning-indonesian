import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// EN-translation enrichment relocated to lesson-stage (PR 6, ADR 0012) — the
// capability stage no longer imports an EN enricher, so there is nothing to mock.
const { enrichMissingPosMock } = vi.hoisted(() => ({
  enrichMissingPosMock: vi.fn().mockResolvedValue({
    posByBaseText: new Map<string, string>(),
    enrichedCount: 0,
  }),
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
          is: (col: string, val: unknown) => {
            // PR 1.5 retireOrphanedCapabilities uses .is('retired_at', null).
            current = current.filter((r) => r[col] === val)
            return chain
          },
          // Task 6c: loadFromDb uses .range() for paginated reads.
          // The mock returns all current rows in one page (PAGE_SIZE > fixture rows),
          // simulating the last page — loadFromDb breaks out of the pagination loop.
          range: () => {
            return Promise.resolve(buildResult())
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
      update: (payload: Record<string, unknown>) => ({
        // PR 1.5 retireOrphanedCapabilities chains .update(...).in('id', ids).
        // No persistence needed for the synthetic fixture — return error: null.
        in: async (col: string, ids: string[]) => {
          void payload; void col; void ids
          return { error: null }
        },
      }),
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

// Each test gets its own tmpdir (kept as a leak-free scratch dir; the runner no
// longer writes any staging snapshots after the Slice 5b no-disk cutover).
let tmpStagingDir: string

// Slice 5b (#147): the loader is DB-only — LoadedLesson no longer carries a
// staging field. Item data reaches the runner via the injected loadFromDb hook
// (the pre-write gate reads itemProjection, not staging).
function makeSynthLesson(): LoadedLesson {
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
  }
}

describe('runCapabilityStage — synthetic fixture (DB-only loader)', () => {
  beforeEach(() => {
    tmpStagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-stage-test-'))
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
        loadLesson: async () => makeSynthLesson(),
        createSupabaseClient: () => client as never,
      },
    )
    expect(['ok', 'partial']).toContain(result.status)
    expect(result.findings.every((f) => f.gate.startsWith('CS'))).toBe(true)
    // Slice 5b (#147): learning_items are written by the typed DB-native path
    // (projectItemsFromTypedRows), no longer from staging. This fixture injects
    // no lesson_section_item_rows, so 0 items are written — the DB-native item
    // write path (count > 0) is covered by runner.itemCutover.test.ts.
    expect(result.counts.learningItems).toBe(0)
  })

  // Slice 5b (#147): the pre-write gate's item checks read the typed item
  // projection (itemProjection.perItemPlans), NOT staging — and grammar/candidate
  // checks pass [] (grammar is DB-native via the pattern path + CS18). So the
  // short-circuit is now exercised through a REAL item failure (CS4b), proving the
  // repointed gate fires on actual item data and is not vacuous (data-arch N1).
  // (The old CS6-on-staging-grammar short-circuit is gone with the staging read.)
  // cap-v2 #161 cutover: the item CS4b short-circuit test moved with the item
  // branch to the vocab module — see __tests__/vocabulary/gate.test.ts (CS4b unit)
  // and __tests__/vocabulary/publish.test.ts (validation_failed control flow).

  // CS1 (grammar_topics) moved back to lesson-stage as GT1 — see
  // lesson-stage/__tests__/runner.test.ts for the integration coverage.
  // No equivalent short-circuit test belongs here.

  it('throws when invoked without lessonId (Stage A status guard)', async () => {
    await expect(
      runCapabilityStage(
        { lessonNumber: 1, lessonId: '' },
        { loadLesson: async () => makeSynthLesson() },
      ),
    ).rejects.toThrow(/lessonId/)
  })

  it('dryRun returns ok without DB writes', async () => {
    const { client, recorder } = buildSupabaseMock({})
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid', dryRun: true },
      {
        loadLesson: async () => makeSynthLesson(),
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
          loadLesson: async () => makeSynthLesson(),
          createSupabaseClient: () => client as never,
        },
      )
    } finally {
      spy.mockRestore()
    }
    expect(writes.find((w) => w.endsWith('lesson-page-blocks.ts'))).toBeUndefined()
  })

  // REMOVED (Slice 5b #147): '5a.5: staging contentUnits snapshot is NOT upserted
  // directly'. Its premise was a stale staging.contentUnits snapshot that the
  // DB-native builder must ignore; with the loader's staging field deleted there is
  // no snapshot to ignore — content_units are built purely DB-natively. The
  // DB-native builder + payload_json:{} (Decision E) are covered by
  // projectors/__tests__/contentUnits.test.ts and verify/residualParity.test.ts.
})
