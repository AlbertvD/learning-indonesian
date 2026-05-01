import { describe, expect, it, vi } from 'vitest'
import {
  parseAutoFillArgs,
  runAutoFill,
  type AutoFillReport,
} from '../auto-fill-capability-artifacts-from-legacy'

describe('parseAutoFillArgs', () => {
  it('returns mode=dry-run when --dry-run is passed', () => {
    expect(parseAutoFillArgs(['--dry-run'])).toEqual({ mode: 'dry-run' })
  })

  it('returns mode=apply when --apply is passed', () => {
    expect(parseAutoFillArgs(['--apply'])).toEqual({ mode: 'apply' })
  })

  it('throws when neither --dry-run nor --apply is passed', () => {
    expect(() => parseAutoFillArgs([])).toThrow(/--dry-run.*--apply/)
  })

  it('throws on unknown argument', () => {
    expect(() => parseAutoFillArgs(['--bogus'])).toThrow(/unknown argument/i)
  })

  it('throws on conflicting --dry-run and --apply', () => {
    expect(() => parseAutoFillArgs(['--dry-run', '--apply'])).toThrow()
  })
})

interface FakeFetchedFixtures {
  draftArtifacts: Array<{
    id: string
    capability_id: string
    artifact_kind: string
    artifact_json: Record<string, unknown>
    capability: Record<string, unknown>
  }>
  learningItems: Array<{
    id: string
    base_text: string
    normalized_text: string
    item_type: string
    is_active: boolean
    source_lesson_id?: string | null
  }>
  itemMeanings: Array<{
    learning_item_id: string
    translation_language: string
    translation_text: string
    is_primary: boolean
  }>
  answerVariants: Array<{
    learning_item_id: string
    variant_text: string
    language: string
  }>
  itemContexts: Array<{
    learning_item_id: string
    context_type: string
    sentence_text: string | null
    translation_text: string | null
    source_lesson_id: string | null
  }>
  grammarPatterns: Array<{
    id: string
    slug: string
    pattern_name: string
    short_explanation: string
    introduced_by_lesson_id: string | null
  }>
  lessonSections: Array<{ id: string; lesson_id: string; content: Record<string, unknown> }>
  lessons: Array<{ id: string; order_index: number }>
}

interface FakeClient {
  schema: (name: string) => { from: (table: string) => unknown }
  __updateCalls: Array<{ id: string; payload: Record<string, unknown> }>
}

function fakeClientFromFixtures(fx: FakeFetchedFixtures): FakeClient {
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = []

  function buildSelect(table: string): unknown {
    const filters: Array<{ op: string; col: string; value: unknown }> = []
    const proxy: Record<string, unknown> = {}
    proxy.select = () => proxy
    proxy.eq = (col: string, value: unknown) => {
      filters.push({ op: 'eq', col, value })
      return proxy
    }
    proxy.in = (col: string, values: unknown[]) => {
      filters.push({ op: 'in', col, value: values })
      return proxy
    }
    proxy.filter = (col: string, op: string, value: unknown) => {
      filters.push({ op: `filter:${op}`, col, value })
      return proxy
    }
    proxy.range = (from: number, to: number) => {
      filters.push({ op: 'range', col: 'range', value: [from, to] })
      return proxy
    }
    proxy.then = (resolve: (v: { data: unknown[] | null; error: unknown }) => void) => {
      const all = fetchTable(table, filters)
      const rangeFilter = filters.find(f => f.op === 'range')
      if (rangeFilter) {
        const [from, to] = rangeFilter.value as [number, number]
        resolve({ data: all.slice(from, to + 1), error: null })
      } else {
        resolve({ data: all, error: null })
      }
    }
    return proxy
  }

  function buildUpdate(table: string): unknown {
    const state: { payload?: Record<string, unknown>; idValue?: string } = {}
    const proxy: Record<string, unknown> = {}
    proxy.update = (payload: Record<string, unknown>) => {
      state.payload = payload
      return proxy
    }
    proxy.eq = (col: string, value: string) => {
      if (col === 'id' && table === 'capability_artifacts') state.idValue = value
      return proxy
    }
    proxy.then = (resolve: (v: { error: unknown }) => void) => {
      updateCalls.push({ id: state.idValue!, payload: state.payload! })
      resolve({ error: null })
    }
    return proxy
  }

  function fetchTable(
    table: string,
    filters: Array<{ op: string; col: string; value: unknown }>,
  ): unknown[] {
    if (table === 'capability_artifacts') return fx.draftArtifacts
    if (table === 'learning_items') return fx.learningItems
    if (table === 'item_meanings') {
      const inFilter = filters.find(f => f.op === 'in' && f.col === 'learning_item_id')
      const ids = (inFilter?.value as string[] | undefined) ?? []
      return fx.itemMeanings.filter(m => ids.includes(m.learning_item_id))
    }
    if (table === 'item_answer_variants') {
      const inFilter = filters.find(f => f.op === 'in' && f.col === 'learning_item_id')
      const ids = (inFilter?.value as string[] | undefined) ?? []
      return fx.answerVariants.filter(v => ids.includes(v.learning_item_id))
    }
    if (table === 'item_contexts') {
      const inFilter = filters.find(f => f.op === 'in' && f.col === 'learning_item_id')
      const ids = (inFilter?.value as string[] | undefined) ?? []
      return fx.itemContexts.filter(c => ids.includes(c.learning_item_id))
    }
    if (table === 'grammar_patterns') return fx.grammarPatterns
    if (table === 'lesson_sections') {
      const inFilter = filters.find(f => f.op === 'in' && f.col === 'lesson_id')
      const ids = (inFilter?.value as string[] | undefined) ?? []
      return fx.lessonSections.filter(s => ids.includes(s.lesson_id))
    }
    if (table === 'lessons') return fx.lessons
    return []
  }

  return {
    __updateCalls: updateCalls,
    schema: () => ({
      from: (table: string) => {
        return new Proxy({}, {
          get(_, prop: string) {
            if (prop === 'select') return (cols: string) => (buildSelect(table) as { select: (c: string) => unknown }).select(cols)
            if (prop === 'update') return (payload: Record<string, unknown>) => (buildUpdate(table) as { update: (p: Record<string, unknown>) => unknown }).update(payload)
            return undefined
          },
        })
      },
    }),
  }
}

const lessonOneId = 'lesson-1-uuid'
const akhirItemId = 'item-akhir-uuid'

const baseFixtures: FakeFetchedFixtures = {
  draftArtifacts: [
    {
      id: 'art-1',
      capability_id: 'cap-1',
      artifact_kind: 'meaning:l1',
      artifact_json: { placeholder: true },
      capability: {
        canonical_key: 'cap:v1:item:learning_items/akhir:text_recognition:id_to_l1:text:nl',
        source_kind: 'item',
        source_ref: 'learning_items/akhir',
        capability_type: 'text_recognition',
      },
    },
    {
      id: 'art-2',
      capability_id: 'cap-1',
      artifact_kind: 'base_text',
      artifact_json: { placeholder: true },
      capability: {
        canonical_key: 'cap:v1:item:learning_items/akhir:text_recognition:id_to_l1:text:nl',
        source_kind: 'item',
        source_ref: 'learning_items/akhir',
        capability_type: 'text_recognition',
      },
    },
  ],
  learningItems: [
    {
      id: akhirItemId,
      base_text: 'akhir',
      normalized_text: 'akhir',
      item_type: 'word',
      is_active: true,
      source_lesson_id: lessonOneId,
    },
  ],
  itemMeanings: [
    {
      learning_item_id: akhirItemId,
      translation_language: 'nl',
      translation_text: 'einde',
      is_primary: true,
    },
  ],
  answerVariants: [],
  itemContexts: [],
  grammarPatterns: [],
  lessonSections: [],
  lessons: [{ id: lessonOneId, order_index: 1 }],
}

describe('runAutoFill', () => {
  it('plans both meaning:l1 and base_text in dry-run, no DB writes', async () => {
    const client = fakeClientFromFixtures(baseFixtures)
    const report: AutoFillReport = await runAutoFill(client as never, { mode: 'dry-run' })
    expect(report.mode).toBe('dry-run')
    expect(report.totalFilled).toBe(2)
    expect(report.totalCritical).toBe(0)
    expect(report.exitCode).toBe(0)
    expect(client.__updateCalls).toHaveLength(0)
  })

  it('writes UPDATEs to capability_artifacts when --apply', async () => {
    const client = fakeClientFromFixtures(baseFixtures)
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const stagingRoot = await fs.mkdtemp(os.tmpdir() + '/auto-fill-cli-')
    const report = await runAutoFill(client as never, { mode: 'apply', stagingRoot })
    expect(report.mode).toBe('apply')
    expect(report.totalFilled).toBe(2)
    expect(client.__updateCalls).toHaveLength(2)
    expect(client.__updateCalls[0]?.payload).toMatchObject({
      quality_status: 'approved',
      artifact_json: expect.objectContaining({ reviewedBy: 'auto-from-legacy-db' }),
    })
  })

  it('reports totalCritical>0 and exitCode=1 on a slug collision that cannot be resolved', async () => {
    const fx: FakeFetchedFixtures = {
      ...baseFixtures,
      learningItems: [
        ...baseFixtures.learningItems,
        // Second active item with the same stableSlug → unresolvable.
        {
          id: 'item-akhir-dup',
          base_text: 'akhir',
          normalized_text: 'akhir',
          item_type: 'word',
          is_active: true,
          source_lesson_id: 'lesson-2-uuid',
        },
      ],
    }
    const client = fakeClientFromFixtures(fx)
    const report = await runAutoFill(client as never, { mode: 'dry-run' })
    expect(report.totalCritical).toBeGreaterThanOrEqual(1)
    expect(report.exitCode).toBe(1)
    expect(report.slugCollisions.length).toBeGreaterThanOrEqual(1)
  })

  it('skips meaning:l1 and reports it under skippedByKind when no NL meaning exists', async () => {
    const fx: FakeFetchedFixtures = {
      ...baseFixtures,
      itemMeanings: [], // No translations at all
    }
    const client = fakeClientFromFixtures(fx)
    const report = await runAutoFill(client as never, { mode: 'dry-run' })
    // base_text still fills, meaning:l1 skips
    expect(report.totalFilled).toBe(1)
    const sumSkipped = Object.values(report.perLesson)
      .reduce((acc, p) => acc + Object.values(p.skippedByKind).reduce((a, b) => a + b, 0), 0)
    expect(sumSkipped).toBeGreaterThanOrEqual(1)
  })
})

describe('main process exit wiring', () => {
  it('process.exit is called with the report exitCode', async () => {
    // Spy on process.exit to capture the value without actually exiting.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const { runMain } = await import('../auto-fill-capability-artifacts-from-legacy')
    const client = fakeClientFromFixtures(baseFixtures)
    await runMain(['--dry-run'], client as never)

    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})
