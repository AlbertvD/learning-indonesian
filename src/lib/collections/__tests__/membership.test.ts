import { describe, expect, it, vi } from 'vitest'
import { resolveActivatedMemberRefs } from '@/lib/collections/membership'

// Mock client that dispatches by table name. Two reads:
//   learner_collection_activation → activated collection_ids (single .eq, thenable)
//   collection_items              → members with embedded learning_items.normalized_text
function buildClient(opts: {
  activationRows?: Array<{ collection_id: string }>
  memberRows?: Array<{ learning_items: { normalized_text: string } | null }>
}) {
  const activationRows = opts.activationRows ?? []
  const memberRows = opts.memberRows ?? []

  const inFn = vi.fn(() =>
    Promise.resolve({ data: memberRows, error: null }),
  )
  const eqFn = vi.fn(() =>
    Promise.resolve({ data: activationRows, error: null }),
  )
  const select = vi.fn(() => ({ eq: eqFn, in: inFn }))
  const from = vi.fn(() => ({ select }))
  const schema = vi.fn(() => ({ from }))
  return { schema, from, select, eqFn, inFn }
}

describe('collections membership resolution', () => {
  it('resolves activated-collection members to learning_items/<normalized_text> source_refs', async () => {
    const client = buildClient({
      activationRows: [{ collection_id: 'top-100' }],
      memberRows: [
        { learning_items: { normalized_text: 'yang' } },
        { learning_items: { normalized_text: 'di' } },
      ],
    })

    const refs = await resolveActivatedMemberRefs('user-1', client as any)

    expect(refs).toEqual(new Set(['learning_items/yang', 'learning_items/di']))
    expect(client.from).toHaveBeenCalledWith('learner_collection_activation')
    expect(client.from).toHaveBeenCalledWith('collection_items')
    expect(client.eqFn).toHaveBeenCalledWith('user_id', 'user-1')
    expect(client.inFn).toHaveBeenCalledWith('collection_id', ['top-100'])
  })

  it('returns an empty set and does NOT query members when no collection is activated', async () => {
    const client = buildClient({ activationRows: [] })

    const refs = await resolveActivatedMemberRefs('user-1', client as any)

    expect(refs).toEqual(new Set())
    expect(client.inFn).not.toHaveBeenCalled()
  })
})
