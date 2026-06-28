import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock the supabase client the reading adapter writes through.
type WriteResult = { error: { message: string } | null }
const upsert = vi.fn<(row: Record<string, string>, opts: Record<string, unknown>) => Promise<WriteResult>>(
  () => Promise.resolve({ error: null }),
)
const from = vi.fn((table: string) => { void table; return { upsert } })
const schema = vi.fn((name: string) => { void name; return { from } })
vi.mock('@/lib/supabase', () => ({ supabase: { schema: (name: string) => schema(name) } }))

import { harvestWord } from '../index'

afterEach(() => {
  vi.clearAllMocks()
  upsert.mockResolvedValue({ error: null })
})

describe('harvestWord (reader §4 — membership only)', () => {
  it('inserts the tapped item as a learner_reading_harvest membership row', async () => {
    await harvestWord('user-1', 'item-jas')

    expect(schema).toHaveBeenCalledWith('indonesian')
    expect(from).toHaveBeenCalledWith('learner_reading_harvest')
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', learning_item_id: 'item-jas' },
      expect.objectContaining({ onConflict: 'user_id,learning_item_id', ignoreDuplicates: true }),
    )
  })

  it('is idempotent on re-tap (ignoreDuplicates → INSERT ON CONFLICT DO NOTHING, no UPDATE grant needed)', async () => {
    await harvestWord('user-1', 'item-jas')
    await harvestWord('user-1', 'item-jas')
    expect(upsert).toHaveBeenCalledTimes(2)
    for (const call of upsert.mock.calls) {
      expect(call[1]).toMatchObject({ ignoreDuplicates: true })
    }
    expect(upsert.mock.calls.length).toBe(2)
  })

  it('propagates a write error (so the UI can surface a friendly message)', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'rls denied' } })
    await expect(harvestWord('user-1', 'item-jas')).rejects.toBeTruthy()
  })
})
