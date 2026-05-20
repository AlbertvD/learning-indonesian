import { describe, it, expect, vi } from 'vitest'
import {
  upsertLesson,
  upsertLessonSections,
  fetchExistingAudioClips,
} from '../adapter'

interface UpsertCall {
  table: string
  payload: Record<string, unknown>
  onConflict?: string
}

interface InsertCall {
  table: string
  payload: Record<string, unknown>
}

interface UpdateCall {
  table: string
  payload: Record<string, unknown>
  whereId?: string
}

interface RpcCall {
  fn: string
  args: unknown
}

function buildSupabaseMock(options: {
  existingLesson?: { id: string } | null
  insertedLessonId?: string
  upsertError?: Error
  insertError?: Error
  updateError?: Error
  findError?: Error
  rpcError?: Error
  rpcResult?: Array<{ normalized_text: string; voice_id: string }>
} = {}): {
  client: any
  upserts: UpsertCall[]
  inserts: InsertCall[]
  updates: UpdateCall[]
  rpcCalls: RpcCall[]
  selects: Array<{ table: string; eqs: Record<string, unknown> }>
} {
  const upserts: UpsertCall[] = []
  const inserts: InsertCall[] = []
  const updates: UpdateCall[] = []
  const rpcCalls: RpcCall[] = []
  const selects: Array<{ table: string; eqs: Record<string, unknown> }> = []

  const tableBuilder = (table: string) => {
    const eqs: Record<string, unknown> = {}
    let whereId: string | undefined

    const builder = {
      select: () => ({
        eq: (col: string, val: unknown) => {
          eqs[col] = val
          return {
            eq: (col2: string, val2: unknown) => {
              eqs[col2] = val2
              return {
                maybeSingle: async () => {
                  selects.push({ table, eqs: { ...eqs } })
                  if (options.findError) return { data: null, error: options.findError }
                  return { data: options.existingLesson ?? null, error: null }
                },
              }
            },
            limit: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }
        },
        single: async () => ({
          data: { id: options.insertedLessonId ?? 'inserted-lesson-id' },
          error: options.insertError ?? null,
        }),
      }),
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table, payload })
        return {
          select: () => ({
            single: async () => ({
              data: { id: options.insertedLessonId ?? 'inserted-lesson-id' },
              error: options.insertError ?? null,
            }),
          }),
        }
      },
      update: (payload: Record<string, unknown>) => {
        const updateBuilder = {
          eq: async (col: string, val: unknown) => {
            whereId = String(val)
            updates.push({ table, payload, whereId })
            void col
            return { error: options.updateError ?? null }
          },
        }
        return updateBuilder
      },
      upsert: (payload: Record<string, unknown>, opts?: { onConflict?: string }) => {
        upserts.push({ table, payload, onConflict: opts?.onConflict })
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'upserted-id' },
              error: options.upsertError ?? null,
            }),
          }),
          // bare upsert (no .select()) returns the error directly via promise resolution
          then: (onResolve: (value: { error: Error | null }) => unknown) =>
            onResolve({ error: options.upsertError ?? null }),
        }
      },
    }
    return builder
  }

  const client = {
    schema: () => ({
      from: (table: string) => tableBuilder(table),
      rpc: vi.fn(async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args })
        if (options.rpcError) return { data: null, error: options.rpcError }
        return { data: options.rpcResult ?? [], error: null }
      }),
    }),
  }

  return { client, upserts, inserts, updates, rpcCalls, selects }
}

describe('upsertLesson', () => {
  it('inserts when no existing lesson is found', async () => {
    const { client, inserts, updates, selects } = buildSupabaseMock({
      existingLesson: null,
      insertedLessonId: 'new-lesson-id',
    })
    const result = await upsertLesson(client, {
      module_id: 'm1',
      order_index: 4,
      title: 'Lesson 4',
      level: 'A1',
    })
    expect(result.id).toBe('new-lesson-id')
    expect(result.orderIndex).toBe(4)
    expect(selects[0]).toMatchObject({ table: 'lessons', eqs: { module_id: 'm1', order_index: 4 } })
    expect(inserts).toHaveLength(1)
    expect(inserts[0].payload).toMatchObject({
      module_id: 'm1',
      order_index: 4,
      title: 'Lesson 4',
      level: 'A1',
    })
    expect(updates).toHaveLength(0)
  })

  it('updates when an existing lesson is found by (module_id, order_index)', async () => {
    const { client, inserts, updates } = buildSupabaseMock({
      existingLesson: { id: 'existing-id' },
    })
    const result = await upsertLesson(client, {
      module_id: 'm1',
      order_index: 4,
      title: 'Lesson 4 — renamed',
      level: 'A1',
    })
    expect(result.id).toBe('existing-id')
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(1)
    expect(updates[0].whereId).toBe('existing-id')
    expect(updates[0].payload).toMatchObject({ title: 'Lesson 4 — renamed', level: 'A1' })
  })

  it('throws when a supabase error occurs during find', async () => {
    const { client } = buildSupabaseMock({ findError: new Error('boom') })
    await expect(
      upsertLesson(client, { module_id: 'm1', order_index: 4, title: 'X', level: 'A1' }),
    ).rejects.toThrow(/boom/)
  })
})

describe('upsertLessonSections', () => {
  it('upserts every section with the correct conflict target', async () => {
    const { client, upserts } = buildSupabaseMock({})
    const count = await upsertLessonSections(client, 'lid', [
      { title: 'A', content: { type: 'text' }, order_index: 0 },
      { title: 'B', content: { type: 'vocabulary', items: [] }, order_index: 1 },
    ])
    expect(count).toBe(2)
    expect(upserts).toHaveLength(2)
    expect(upserts[0]).toMatchObject({
      table: 'lesson_sections',
      onConflict: 'lesson_id,order_index',
      payload: { lesson_id: 'lid', title: 'A', order_index: 0 },
    })
  })
})

describe('fetchExistingAudioClips', () => {
  it('queries get_audio_clips RPC with deduped texts + voices', async () => {
    const { client, rpcCalls } = buildSupabaseMock({
      rpcResult: [{ normalized_text: 'halo', voice_id: 'V1' }],
    })
    const present = await fetchExistingAudioClips(client, [
      { normalizedText: 'halo', voiceId: 'V1' },
      { normalizedText: 'halo', voiceId: 'V1' }, // duplicate
      { normalizedText: 'apa', voiceId: 'V1' },
    ])
    expect(present.has('halo|V1')).toBe(true)
    expect(present.has('apa|V1')).toBe(false)
    expect(rpcCalls[0].fn).toBe('get_audio_clips')
    expect(rpcCalls[0].args).toEqual({ p_texts: ['halo', 'apa'], p_voice_ids: ['V1'] })
  })

  it('returns empty set for empty input (no RPC call)', async () => {
    const { client, rpcCalls } = buildSupabaseMock({})
    const present = await fetchExistingAudioClips(client, [])
    expect(present.size).toBe(0)
    expect(rpcCalls).toEqual([])
  })

  it('throws when the RPC errors', async () => {
    const { client } = buildSupabaseMock({ rpcError: new Error('rpc-boom') })
    await expect(
      fetchExistingAudioClips(client, [{ normalizedText: 'x', voiceId: 'V1' }]),
    ).rejects.toThrow(/rpc-boom/)
  })
})
