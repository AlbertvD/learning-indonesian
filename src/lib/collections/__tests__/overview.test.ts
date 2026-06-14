import { describe, expect, it, vi } from 'vitest'
import { getCollectionsOverview } from '@/lib/collections/overview'

function buildClient(rows: unknown[] | null, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data: rows, error }))
  const schema = vi.fn(() => ({ rpc }))
  return { schema, rpc }
}

describe('collections overview read-model', () => {
  it('maps get_collections_overview rows to camelCase CollectionOverview', async () => {
    const client = buildClient([
      {
        collection_id: 'uuid-1',
        slug: 'top-100',
        name: 'Top 100',
        kind: 'frequency',
        rank_cutoff: 100,
        is_activated: true,
        total_words: 100,
        known_words: 72,
        eligible_words: 85,
      },
    ])

    const result = await getCollectionsOverview('user-1', client as any)

    expect(client.rpc).toHaveBeenCalledWith('get_collections_overview', { p_user_id: 'user-1' })
    expect(result).toEqual([
      {
        collectionId: 'uuid-1',
        slug: 'top-100',
        name: 'Top 100',
        kind: 'frequency',
        rankCutoff: 100,
        isActivated: true,
        totalWords: 100,
        knownWords: 72,
        eligibleNow: 85,
        gain: 15,
      },
    ])
  })

  it('returns an empty array when no collections are published', async () => {
    const client = buildClient([])
    expect(await getCollectionsOverview('user-1', client as any)).toEqual([])
  })

  it('throws when the RPC returns an error', async () => {
    const client = buildClient(null, { message: 'boom' })
    await expect(getCollectionsOverview('user-1', client as any)).rejects.toMatchObject({ message: 'boom' })
  })
})
