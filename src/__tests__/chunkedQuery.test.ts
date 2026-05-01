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
})
