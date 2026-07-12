import { beforeEach, describe, expect, it } from 'vitest'
import { createSessionBuilderAdapter, _resetInformalItemSourceRefsMemo } from '@/lib/session-builder/adapter'

// 2026-07-11 prod-ready audit ("REPEATED CONTENT FETCH"): loadInformalItemSourceRefs
// used to run a full learning_items register='informal' scan on every session
// build. It's now memoized module-wide — content data only changes at publish
// (ADR 0011 DB-authoritative-after-seeding), so caching for the page-load
// lifetime is correct. These tests assert the memo actually elides repeat
// queries, dedupes concurrent in-flight calls, and doesn't poison itself on a
// failed fetch.
function mockLearningItemsClient(input: {
  rows?: Array<{ normalized_text: string }>
  fail?: boolean
}) {
  let callCount = 0
  const client = {
    schema: () => ({
      from: (table: string) => {
        expect(table).toBe('learning_items')
        callCount += 1
        return {
          select: (columns: string) => {
            expect(columns).toBe('normalized_text')
            return {
              eq: (column: string, value: string) => {
                expect(column).toBe('register')
                expect(value).toBe('informal')
                return input.fail
                  ? Promise.resolve({ data: null, error: new Error('boom') })
                  : Promise.resolve({ data: input.rows ?? [], error: null })
              },
            }
          },
        }
      },
      rpc: () => { throw new Error('loadInformalItemSourceRefs should not call .rpc()') },
    }),
  }
  return { client, getCallCount: () => callCount }
}

describe('session-builder adapter — loadInformalItemSourceRefs memo', () => {
  beforeEach(() => {
    _resetInformalItemSourceRefsMemo()
  })

  it('resolves the informal source_ref set from a single query', async () => {
    const { client } = mockLearningItemsClient({ rows: [{ normalized_text: 'nggak' }, { normalized_text: 'aja' }] })
    const adapter = createSessionBuilderAdapter(client as any)

    const refs = await adapter.loadInformalItemSourceRefs()

    expect(refs).toEqual(new Set(['learning_items/nggak', 'learning_items/aja']))
  })

  it('memoizes — a second call does not re-query the database', async () => {
    const { client, getCallCount } = mockLearningItemsClient({ rows: [{ normalized_text: 'nggak' }] })
    const adapter = createSessionBuilderAdapter(client as any)

    await adapter.loadInformalItemSourceRefs()
    await adapter.loadInformalItemSourceRefs()

    expect(getCallCount()).toBe(1)
  })

  it('dedupes concurrent in-flight calls to a single query', async () => {
    const { client, getCallCount } = mockLearningItemsClient({ rows: [{ normalized_text: 'nggak' }] })
    const adapter = createSessionBuilderAdapter(client as any)

    const [a, b] = await Promise.all([
      adapter.loadInformalItemSourceRefs(),
      adapter.loadInformalItemSourceRefs(),
    ])

    expect(getCallCount()).toBe(1)
    expect(a).toEqual(b)
  })

  it('does not cache a failed fetch — a later call retries', async () => {
    const failing = mockLearningItemsClient({ fail: true })
    const failingAdapter = createSessionBuilderAdapter(failing.client as any)
    await expect(failingAdapter.loadInformalItemSourceRefs()).rejects.toThrow('boom')
    expect(failing.getCallCount()).toBe(1)

    const succeeding = mockLearningItemsClient({ rows: [{ normalized_text: 'aja' }] })
    const succeedingAdapter = createSessionBuilderAdapter(succeeding.client as any)
    const refs = await succeedingAdapter.loadInformalItemSourceRefs()

    expect(refs).toEqual(new Set(['learning_items/aja']))
    expect(succeeding.getCallCount()).toBe(1)
  })

  it('_resetInformalItemSourceRefsMemo forces a fresh fetch', async () => {
    const first = mockLearningItemsClient({ rows: [{ normalized_text: 'nggak' }] })
    const firstAdapter = createSessionBuilderAdapter(first.client as any)
    await firstAdapter.loadInformalItemSourceRefs()

    _resetInformalItemSourceRefsMemo()

    const second = mockLearningItemsClient({ rows: [{ normalized_text: 'aja' }] })
    const secondAdapter = createSessionBuilderAdapter(second.client as any)
    const refs = await secondAdapter.loadInformalItemSourceRefs()

    expect(refs).toEqual(new Set(['learning_items/aja']))
    expect(second.getCallCount()).toBe(1)
  })
})
