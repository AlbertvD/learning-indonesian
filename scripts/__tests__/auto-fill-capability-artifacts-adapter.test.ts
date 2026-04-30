import { describe, expect, it } from 'vitest'
import {
  applyArtifactUpdatesInChunks,
  detectSlugCollisions,
  loadAnswerVariants,
  loadDraftArtifactsWithCapability,
  type LearningItemRow,
} from '../auto-fill-capability-artifacts-from-legacy'

interface QueryCall {
  table: string
  select?: string
  filters: Array<{ op: string; col: string; value: unknown }>
}

interface FakeOptions {
  draftArtifactRows?: unknown[]
  answerVariantRows?: unknown[]
  updateRecorder?: (id: string, payload: Record<string, unknown>) => { error?: unknown }
}

function fakeClient(opts: FakeOptions) {
  const queries: QueryCall[] = []
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = []

  const buildQuery = (table: string, dataProvider: () => unknown[]) => {
    const call: QueryCall = { table, filters: [] }
    queries.push(call)
    const builder: Record<string, unknown> = {}
    builder.select = (cols: string) => {
      call.select = cols
      return builder
    }
    builder.eq = (col: string, value: unknown) => {
      call.filters.push({ op: 'eq', col, value })
      return builder
    }
    builder.in = (col: string, values: unknown[]) => {
      call.filters.push({ op: 'in', col, value: values })
      return builder
    }
    builder.filter = (col: string, op: string, value: unknown) => {
      call.filters.push({ op: `filter:${op}`, col, value })
      return builder
    }
    builder.range = (from: number, to: number) => {
      call.filters.push({ op: 'range', col: 'range', value: [from, to] })
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => {
      const all = dataProvider()
      const rangeFilter = call.filters.find(f => f.op === 'range')
      if (rangeFilter) {
        const [from, to] = rangeFilter.value as [number, number]
        resolve({ data: all.slice(from, to + 1), error: null })
      } else {
        resolve({ data: all, error: null })
      }
    }
    return builder
  }

  const buildUpdate = (table: string) => {
    const updateState: { payload?: Record<string, unknown>; idValue?: string } = {}
    const builder: Record<string, unknown> = {}
    builder.update = (payload: Record<string, unknown>) => {
      updateState.payload = payload
      return builder
    }
    builder.eq = (col: string, value: string) => {
      if (col === 'id') updateState.idValue = value
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => {
      const id = updateState.idValue!
      const payload = updateState.payload!
      updateCalls.push({ id, payload })
      const fn = opts.updateRecorder ?? (() => ({ error: null }))
      const result = fn(id, payload)
      resolve({ error: result.error ?? null })
    }
    return builder
  }

  const fromImpl = (table: string) => {
    if (table === 'capability_artifacts') {
      // Either select or update path
      return new Proxy({}, {
        get(_, prop: string) {
          if (prop === 'select') {
            return (cols: string) => buildQuery(table, () => opts.draftArtifactRows ?? []).select!(cols)
          }
          if (prop === 'update') {
            return (payload: Record<string, unknown>) => buildUpdate(table).update!(payload)
          }
          return undefined
        },
      })
    }
    if (table === 'item_answer_variants') {
      return buildQuery(table, () => opts.answerVariantRows ?? [])
    }
    return buildQuery(table, () => [])
  }

  return {
    schema: (_schema: string) => ({ from: fromImpl }),
    queries,
    updateCalls,
  }
}

describe('detectSlugCollisions', () => {
  it('returns the colliding-slug set when apa and apa? exist', () => {
    const items: LearningItemRow[] = [
      { id: '1', baseText: 'apa', normalizedText: 'apa', itemType: 'word', isActive: true },
      { id: '2', baseText: 'apa?', normalizedText: 'apa?', itemType: 'word', isActive: true },
      { id: '3', baseText: 'rumah', normalizedText: 'rumah', itemType: 'word', isActive: true },
    ]
    const collisions = detectSlugCollisions(items)
    expect(collisions.size).toBe(1)
    const colliding = collisions.get('apa')
    expect(colliding).toBeDefined()
    expect(colliding!.map(item => item.id).sort()).toEqual(['1', '2'])
    expect(collisions.has('rumah')).toBe(false)
  })

  it('returns empty map when all slugs are unique', () => {
    const items: LearningItemRow[] = [
      { id: '1', baseText: 'apa', normalizedText: 'apa', itemType: 'word', isActive: true },
      { id: '2', baseText: 'rumah', normalizedText: 'rumah', itemType: 'word', isActive: true },
    ]
    expect(detectSlugCollisions(items).size).toBe(0)
  })

  it('ignores inactive items when checking collisions', () => {
    const items: LearningItemRow[] = [
      { id: '1', baseText: 'apa', normalizedText: 'apa', itemType: 'word', isActive: true },
      { id: '2', baseText: 'apa', normalizedText: 'apa', itemType: 'word', isActive: false },
    ]
    expect(detectSlugCollisions(items).size).toBe(0)
  })
})

describe('loadDraftArtifactsWithCapability', () => {
  it('filters quality_status=draft and placeholder=true and joins capability', async () => {
    const stubRows = [{
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
    }]
    const fake = fakeClient({ draftArtifactRows: stubRows })

    const rows = await loadDraftArtifactsWithCapability(fake as never)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'art-1',
      capabilityId: 'cap-1',
      artifactKind: 'meaning:l1',
      capability: { canonicalKey: 'cap:v1:item:learning_items/akhir:text_recognition:id_to_l1:text:nl' },
    })

    // Verify filters: quality_status='draft' eq + placeholder filter
    expect(fake.queries).toHaveLength(1)
    const q = fake.queries[0]
    expect(q.table).toBe('capability_artifacts')
    expect(q.filters.find(f => f.op === 'eq' && f.col === 'quality_status' && f.value === 'draft')).toBeTruthy()
    expect(q.filters.some(f => /placeholder/.test(f.col))).toBeTruthy()
  })
})

describe('loadAnswerVariants', () => {
  it('chunks itemIds into 50-id batches (Kong URI buffer limit)', async () => {
    const itemIds = Array.from({ length: 130 }, (_, i) => `item-${i}`)
    const fake = fakeClient({
      answerVariantRows: [{
        learning_item_id: 'item-1',
        variant_text: 'eten',
        language: 'nl',
      }],
    })
    const rows = await loadAnswerVariants(fake as never, itemIds)
    expect(rows.length).toBe(3) // 1 row × 3 chunks (50/50/30)
    expect(fake.queries).toHaveLength(3)
    for (const q of fake.queries) {
      expect(q.table).toBe('item_answer_variants')
      const inFilter = q.filters.find(f => f.op === 'in' && f.col === 'learning_item_id')
      expect(inFilter).toBeTruthy()
      expect((inFilter!.value as string[]).length).toBeLessThanOrEqual(50)
    }
  })

  it('returns empty array for empty itemIds without querying', async () => {
    const fake = fakeClient({})
    const rows = await loadAnswerVariants(fake as never, [])
    expect(rows).toEqual([])
    expect(fake.queries).toHaveLength(0)
  })
})

describe('applyArtifactUpdatesInChunks', () => {
  it('chunks 130 updates into 50/50/30 and reports updated count', async () => {
    const updates = Array.from({ length: 130 }, (_, i) => ({
      id: `art-${i}`,
      artifactJson: { value: `v-${i}`, reviewedBy: 'auto-from-legacy-db' },
    }))
    const fake = fakeClient({})
    const result = await applyArtifactUpdatesInChunks(fake as never, updates, 50)
    expect(result.updated).toBe(130)
    expect(result.failedChunks).toBe(0)
    expect(fake.updateCalls).toHaveLength(130)
    expect(fake.updateCalls[0]).toMatchObject({
      id: 'art-0',
      payload: expect.objectContaining({
        artifact_json: expect.objectContaining({ value: 'v-0' }),
        quality_status: 'approved',
      }),
    })
  })

  it('returns updated=0 / failedChunks=0 when given no updates', async () => {
    const fake = fakeClient({})
    const result = await applyArtifactUpdatesInChunks(fake as never, [], 50)
    expect(result).toEqual({ updated: 0, failedChunks: 0 })
    expect(fake.updateCalls).toHaveLength(0)
  })

  it('records failed chunk when an update returns an error', async () => {
    const updates = Array.from({ length: 5 }, (_, i) => ({
      id: `art-${i}`,
      artifactJson: { value: `v-${i}`, reviewedBy: 'auto-from-legacy-db' },
    }))
    const fake = fakeClient({
      updateRecorder: (id) => id === 'art-2' ? { error: new Error('fail') } : { error: null },
    })
    const result = await applyArtifactUpdatesInChunks(fake as never, updates, 5)
    // One chunk of 5; one update fails inside that chunk → chunk reported failed.
    expect(result.failedChunks).toBe(1)
    expect(result.updated).toBe(4)
  })
})
