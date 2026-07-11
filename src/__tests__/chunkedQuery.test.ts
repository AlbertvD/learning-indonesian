import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          in: () => ({ data: [{ id: 'global' }], error: null }),
        }),
      }),
    }),
  },
}))

import { chunkedIn } from '@/lib/chunkedQuery'

describe('chunkedIn', () => {
  it('returns [] without querying when ids is empty', async () => {
    const out = await chunkedIn('learner_capability_state', 'capability_id', [])
    expect(out).toEqual([])
  })

  it('chunks 130 ids into 3 batches of 50/50/30 and concatenates', async () => {
    const calls: number[] = []
    const fakeClient = makeFakeClient((chunk) => {
      calls.push(chunk.length)
      return { data: chunk.map(id => ({ capability_id: id })), error: null }
    })
    const ids = Array.from({ length: 130 }, (_, i) => `id-${i}`)
    const out = await chunkedIn<{ capability_id: string }>(
      'learner_capability_state',
      'capability_id',
      ids,
      undefined,
      fakeClient as never,
    )
    expect(calls).toEqual([50, 50, 30])
    expect(out).toHaveLength(130)
    expect(out[0]?.capability_id).toBe('id-0')
    expect(out[129]?.capability_id).toBe('id-129')
  })

  it('preserves result order even when chunks resolve OUT of order (Promise.all order != resolution order)', async () => {
    // Chunk 0 resolves LAST, chunk 2 resolves FIRST -- if chunkedIn simply
    // concatenated in resolution order (e.g. via a naive Promise.race-style
    // accumulator) this would come back scrambled. Promise.all guarantees the
    // output array matches the INPUT order regardless.
    const resolvers: Array<() => void> = []
    const fakeClient = makeDeferredClient((chunk) => {
      let resolve!: () => void
      const ready = new Promise<void>((res) => { resolve = res })
      resolvers.push(resolve)
      return ready.then(() => ({ data: chunk.map(id => ({ id })), error: null }))
    })
    const ids = Array.from({ length: 130 }, (_, i) => `id-${i}`) // 3 chunks: 50/50/30
    const promise = chunkedIn<{ id: string }>('learner_capability_state', 'id', ids, undefined, fakeClient as never)

    // Resolve out of order: chunk 2 (index 2) first, then chunk 0, then chunk 1.
    resolvers[2]!()
    await Promise.resolve()
    resolvers[0]!()
    await Promise.resolve()
    resolvers[1]!()

    const out = await promise
    expect(out).toHaveLength(130)
    expect(out[0]?.id).toBe('id-0') // chunk 0's first id, still first in the output
    expect(out[49]?.id).toBe('id-49') // chunk 0's last id
    expect(out[50]?.id).toBe('id-50') // chunk 1's first id
    expect(out[129]?.id).toBe('id-129') // chunk 2's last id
  })

  it('dispatches all chunk queries in PARALLEL, not sequentially awaited (spies on the builder)', async () => {
    // Each chunk's query builder is constructed (`.in()` called) synchronously
    // when the query starts; resolution is deferred via a real Promise that
    // only settles when we manually call the recorded resolver. Sequential
    // (await-in-a-loop) dispatch would only ever construct chunk 0's builder
    // until it resolves; parallel (Promise.all(map(...))) dispatch constructs
    // ALL chunk builders up front, before any of them resolve.
    const startedChunkSizes: number[] = []
    const resolvers: Array<() => void> = []
    const fakeClient = makeDeferredClient((chunk) => {
      startedChunkSizes.push(chunk.length)
      let resolve!: () => void
      const ready = new Promise<void>((res) => { resolve = res })
      resolvers.push(resolve)
      return ready.then(() => ({ data: chunk.map(id => ({ id })), error: null }))
    })
    const ids = Array.from({ length: 130 }, (_, i) => `id-${i}`) // 3 chunks: 50/50/30
    const promise = chunkedIn<{ id: string }>('learner_capability_state', 'id', ids, undefined, fakeClient as never)

    // All three chunk queries must have STARTED (synchronously) before we
    // resolve any of them -- proof of parallel dispatch.
    expect(startedChunkSizes).toEqual([50, 50, 30])

    resolvers.forEach(r => r())
    const out = await promise
    expect(out).toHaveLength(130)
  })

  it('threads queryFn so callers can add .eq() filters per chunk', async () => {
    const recorded: Array<{ eq?: { col: string; value: unknown } }> = []
    const fakeClient = makeFakeClient((chunk, state) => {
      recorded.push({ eq: state.eq })
      return { data: chunk.map(id => ({ id })), error: null }
    })
    await chunkedIn<{ id: string }>(
      'learner_capability_state',
      'capability_id',
      ['a', 'b'],
      (b: { eq: (col: string, value: unknown) => unknown }) => b.eq('user_id', 'u-1'),
      fakeClient as never,
    )
    expect(recorded[0]).toEqual({ eq: { col: 'user_id', value: 'u-1' } })
  })

  it('throws on the first error, surfacing the chunk that failed', async () => {
    const fakeClient = makeFakeClient(() => ({ data: null, error: new Error('kong-buffer') }))
    await expect(
      chunkedIn('learner_capability_state', 'capability_id', ['a'], undefined, fakeClient as never),
    ).rejects.toThrow('kong-buffer')
  })

  function makeFakeClient(
    onChunk: (
      chunk: string[],
      state: { select: string; eq?: { col: string; value: unknown } },
    ) => { data: unknown[] | null; error: unknown },
  ) {
    return {
      schema: () => ({
        from: () => ({
          select: (cols: string) => {
            const state: { select: string; eq?: { col: string; value: unknown }; chunk?: string[] } = { select: cols }
            const builder: Record<string, unknown> = {}
            builder.in = (_col: string, chunk: string[]) => {
              state.chunk = chunk
              return builder // chainable so queryFn can call .eq() on it
            }
            builder.eq = (col: string, value: unknown) => {
              state.eq = { col, value }
              return builder
            }
            // Make the builder thenable so `await builder` resolves to the result.
            builder.then = (resolve: (v: unknown) => void) => {
              resolve(onChunk(state.chunk ?? [], state))
            }
            return builder
          },
        }),
      }),
    }
  }

  // Like makeFakeClient, but `.in()` returns a REAL (deferred) promise via
  // onChunk instead of resolving synchronously -- needed to observe dispatch
  // ordering (construction vs resolution) independently of one another.
  function makeDeferredClient(
    onChunk: (chunk: string[]) => Promise<{ data: unknown[] | null; error: unknown }>,
  ) {
    return {
      schema: () => ({
        from: () => ({
          select: () => ({
            in: (_col: string, chunk: string[]) => onChunk(chunk),
          }),
        }),
      }),
    }
  }
})
