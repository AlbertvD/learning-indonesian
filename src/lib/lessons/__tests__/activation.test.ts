import { describe, expect, it, vi } from 'vitest'
import {
  isLessonActivated,
  listActivatedLessons,
  setLessonActivated,
} from '@/lib/lessons/activation'

function buildSelectChain(rows: Array<{ lesson_id: string }> | { lesson_id: string } | null) {
  const eq2 = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({ data: rows, error: null })),
  }))
  const eq1 = vi.fn(() => ({
    eq: eq2,
    // listActivatedLessons does a single .eq, so it must resolve as a thenable
    // that returns { data, error }. PostgREST query builders are thenables
    // after .eq returns the underlying builder. Mirror that here.
    then: (onFulfilled: (value: { data: typeof rows; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onFulfilled),
  }))
  const select = vi.fn(() => ({ eq: eq1 }))
  return { select, eq1, eq2 }
}

function buildClient(options: {
  selectRows?: Array<{ lesson_id: string }> | { lesson_id: string } | null
  rpcImpl?: ReturnType<typeof vi.fn>
}) {
  const chain = buildSelectChain(options.selectRows ?? null)
  const from = vi.fn(() => ({ select: chain.select }))
  const rpc = options.rpcImpl ?? vi.fn(async () => ({ data: null, error: null }))
  const schema = vi.fn(() => ({ from, rpc }))
  return { schema, from, rpc, select: chain.select, eq1: chain.eq1, eq2: chain.eq2 }
}

describe('lesson activation API', () => {
  it('returns true when the activation row exists', async () => {
    const client = buildClient({ selectRows: { lesson_id: 'lesson-uuid' } })
    const activated = await isLessonActivated('user-1', 'lesson-uuid', client as any)
    expect(activated).toBe(true)
    expect(client.schema).toHaveBeenCalledWith('indonesian')
    expect(client.from).toHaveBeenCalledWith('learner_lesson_activation')
    expect(client.eq1).toHaveBeenCalledWith('user_id', 'user-1')
    expect(client.eq2).toHaveBeenCalledWith('lesson_id', 'lesson-uuid')
  })

  it('returns false when no activation row exists', async () => {
    const client = buildClient({ selectRows: null })
    const activated = await isLessonActivated('user-1', 'lesson-uuid', client as any)
    expect(activated).toBe(false)
  })

  it('listActivatedLessons returns a Set of lesson_ids', async () => {
    const client = buildClient({
      selectRows: [{ lesson_id: 'a' }, { lesson_id: 'b' }, { lesson_id: 'c' }],
    })
    const ids = await listActivatedLessons('user-1', client as any)
    expect(ids).toEqual(new Set(['a', 'b', 'c']))
  })

  it('setLessonActivated calls the set_lesson_activation RPC with the right args', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const client = buildClient({ rpcImpl: rpc })
    await setLessonActivated('user-1', 'lesson-uuid', true, client as any)
    expect(rpc).toHaveBeenCalledWith('set_lesson_activation', {
      p_user_id: 'user-1',
      p_lesson_id: 'lesson-uuid',
      p_activated: true,
    })
  })

  it('setLessonActivated propagates the deactivate flag', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const client = buildClient({ rpcImpl: rpc })
    await setLessonActivated('user-1', 'lesson-uuid', false, client as any)
    expect(rpc).toHaveBeenCalledWith('set_lesson_activation', {
      p_user_id: 'user-1',
      p_lesson_id: 'lesson-uuid',
      p_activated: false,
    })
  })

  it('throws when the RPC returns an error', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'denied' } }))
    const client = buildClient({ rpcImpl: rpc })
    await expect(setLessonActivated('user-1', 'lesson-uuid', true, client as any)).rejects.toMatchObject({ message: 'denied' })
  })
})
