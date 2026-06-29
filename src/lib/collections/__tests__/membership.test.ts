import { describe, expect, it, vi } from 'vitest'
import { resolveActivatedMemberRefs } from '@/lib/collections/membership'

// Mock client that dispatches by table name. Three reads:
//   learner_collection_activation → activated collection_ids (single .eq, thenable)
//   collection_items              → members with embedded learning_items.normalized_text (.in)
//   learner_reading_harvest       → harvested words with embedded learning_items.normalized_text (.eq)
function buildClient(opts: {
  activationRows?: Array<{ collection_id: string }>
  memberRows?: Array<{ learning_items: { normalized_text: string } | null }>
  harvestRows?: Array<{ learning_items: { normalized_text: string } | null }>
}) {
  const activationRows = opts.activationRows ?? []
  const memberRows = opts.memberRows ?? []
  const harvestRows = opts.harvestRows ?? []

  const activationEq = vi.fn(() => Promise.resolve({ data: activationRows, error: null }))
  const memberIn = vi.fn(() => Promise.resolve({ data: memberRows, error: null }))
  const harvestEq = vi.fn(() => Promise.resolve({ data: harvestRows, error: null }))

  const from = vi.fn((table: string) => {
    if (table === 'learner_collection_activation') return { select: () => ({ eq: activationEq }) }
    if (table === 'collection_items') return { select: () => ({ in: memberIn }) }
    if (table === 'learner_reading_harvest') return { select: () => ({ eq: harvestEq }) }
    throw new Error(`unexpected table ${table}`)
  })
  const schema = vi.fn(() => ({ from }))
  return { schema, from, activationEq, memberIn, harvestEq }
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
    expect(client.activationEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(client.memberIn).toHaveBeenCalledWith('collection_id', ['top-100'])
  })

  it('returns an empty set and does NOT query collection members when no collection is activated', async () => {
    const client = buildClient({ activationRows: [] })

    const refs = await resolveActivatedMemberRefs('user-1', client as any)

    expect(refs).toEqual(new Set())
    expect(client.memberIn).not.toHaveBeenCalled()
  })

  it('UNIONs the learner harvested-word refs with the activated-collection refs (reader §4 gate-OR feed)', async () => {
    const client = buildClient({
      activationRows: [{ collection_id: 'top-100' }],
      memberRows: [{ learning_items: { normalized_text: 'yang' } }],
      harvestRows: [
        { learning_items: { normalized_text: 'membaca' } },
        { learning_items: { normalized_text: 'jas' } },
      ],
    })

    const refs = await resolveActivatedMemberRefs('user-1', client as any)

    expect(refs).toEqual(
      new Set(['learning_items/yang', 'learning_items/membaca', 'learning_items/jas']),
    )
    expect(client.from).toHaveBeenCalledWith('learner_reading_harvest')
    expect(client.harvestEq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('resolves harvested refs even when NO collection is activated (harvest is independent of collections)', async () => {
    const client = buildClient({
      activationRows: [],
      harvestRows: [{ learning_items: { normalized_text: 'jas' } }],
    })

    const refs = await resolveActivatedMemberRefs('user-1', client as any)

    expect(refs).toEqual(new Set(['learning_items/jas']))
    expect(client.memberIn).not.toHaveBeenCalled()
  })
})
