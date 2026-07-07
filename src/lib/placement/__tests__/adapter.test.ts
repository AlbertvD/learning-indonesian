import { describe, expect, it, vi } from 'vitest'
import { fetchPlacementPool } from '@/lib/placement/adapter'

// One word per rung + one that would ALSO be a cumulative member of every
// higher rung's collection (rank 40 <= 100 <= 300 <= 500 <= 1000) — proves
// the adapter samples EXCLUSIVE ranges, not the collections' own cumulative
// membership (scripts/collections/seed-collection.ts:7).
const ALL_ITEMS = [
  { normalized_text: 'gratis', base_text: 'gratis', translation_nl: 'gratis', frequency_rank: 40 },
  { normalized_text: 'kantor', base_text: 'kantor', translation_nl: 'kantoor', frequency_rank: 90 },
  { normalized_text: 'wortel', base_text: 'wortel', translation_nl: 'wortel', frequency_rank: 200 },
  { normalized_text: 'knalpot', base_text: 'knalpot', translation_nl: 'knalpot', frequency_rank: 450 },
  { normalized_text: 'buncis', base_text: 'buncis', translation_nl: 'sperzieboon', frequency_rank: 900 },
]

function makeCollectionsBuilder(rows: Array<{ slug: string; rank_cutoff: number | null }>) {
  const b: any = {}
  for (const method of ['select', 'in']) b[method] = vi.fn(() => b)
  b.then = (onFulfilled: any) => Promise.resolve({ data: rows, error: null }).then(onFulfilled)
  return b
}

function makeItemsBuilder(errorOnce?: { message: string }) {
  const b: any = {}
  for (const method of ['select', 'eq', 'not', 'gt', 'lte', 'order', 'limit']) {
    b[method] = vi.fn((...args: unknown[]) => {
      if (method === 'gt') b.__gt = args[1]
      if (method === 'lte') b.__lte = args[1]
      return b
    })
  }
  b.then = (onFulfilled: any) => {
    if (errorOnce) return Promise.resolve({ data: null, error: errorOnce }).then(onFulfilled)
    const low = b.__gt ?? 0
    const high = b.__lte ?? Infinity
    const rows = ALL_ITEMS.filter(item => item.frequency_rank > low && item.frequency_rank <= high)
    return Promise.resolve({ data: rows, error: null }).then(onFulfilled)
  }
  return b
}

function buildClient(opts: {
  collectionsRows: Array<{ slug: string; rank_cutoff: number | null }>
  collectionsError?: { message: string }
  itemsError?: { message: string }
}) {
  const from = vi.fn((table: string) => {
    if (table === 'collections') {
      if (opts.collectionsError) {
        const b: any = {}
        for (const method of ['select', 'in']) b[method] = vi.fn(() => b)
        b.then = (onFulfilled: any) => Promise.resolve({ data: null, error: opts.collectionsError }).then(onFulfilled)
        return b
      }
      return makeCollectionsBuilder(opts.collectionsRows)
    }
    if (table === 'learning_items') return makeItemsBuilder(opts.itemsError)
    throw new Error(`unexpected table ${table}`)
  })
  return { schema: vi.fn(() => ({ from })) }
}

const FOUR_BANDS_SCRAMBLED = [
  { slug: 'top-1000', rank_cutoff: 1000 },
  { slug: 'top-100', rank_cutoff: 100 },
  { slug: 'top-500', rank_cutoff: 500 },
  { slug: 'top-300', rank_cutoff: 300 },
]

describe('fetchPlacementPool', () => {
  it('orders bands ascending by rankCutoff', async () => {
    const client = buildClient({ collectionsRows: FOUR_BANDS_SCRAMBLED })
    const pool = await fetchPlacementPool(client as any)
    expect(pool.bands.map(b => b.slug)).toEqual(['top-100', 'top-300', 'top-500', 'top-1000'])
  })

  it('samples each band as an EXCLUSIVE frequency_rank range, not cumulative membership', async () => {
    const client = buildClient({ collectionsRows: FOUR_BANDS_SCRAMBLED })
    const pool = await fetchPlacementPool(client as any)

    expect(pool.itemsByBand.get('top-100')!.map(i => i.normalizedText)).toEqual(['gratis', 'kantor'])
    // wortel (rank 200) belongs ONLY to top-300's exclusive range (101-300),
    // even though it would also be a cumulative member of top-500/top-1000.
    expect(pool.itemsByBand.get('top-300')!.map(i => i.normalizedText)).toEqual(['wortel'])
    expect(pool.itemsByBand.get('top-500')!.map(i => i.normalizedText)).toEqual(['knalpot'])
    expect(pool.itemsByBand.get('top-1000')!.map(i => i.normalizedText)).toEqual(['buncis'])
  })

  it('populates rendering details + the flattened allItems corpus', async () => {
    const client = buildClient({ collectionsRows: FOUR_BANDS_SCRAMBLED })
    const pool = await fetchPlacementPool(client as any)

    expect(pool.detailsByNormalizedText.get('kantor')).toEqual({
      normalizedText: 'kantor',
      bandSlug: 'top-100',
      baseText: 'kantor',
      translationNl: 'kantoor',
    })
    expect(pool.allItems.map(i => i.normalizedText)).toEqual(['gratis', 'kantor', 'wortel', 'knalpot', 'buncis'])
  })

  it('ignores a collections row with a null rank_cutoff (defensive — should never happen given the CHECK)', async () => {
    const client = buildClient({
      collectionsRows: [...FOUR_BANDS_SCRAMBLED, { slug: 'nl-leenwoorden', rank_cutoff: null }],
    })
    const pool = await fetchPlacementPool(client as any)
    expect(pool.bands.map(b => b.slug)).not.toContain('nl-leenwoorden')
  })

  it('throws when the collections read errors', async () => {
    const client = buildClient({ collectionsRows: [], collectionsError: { message: 'boom' } })
    await expect(fetchPlacementPool(client as any)).rejects.toMatchObject({ message: 'boom' })
  })

  it('throws when a learning_items read errors', async () => {
    const client = buildClient({ collectionsRows: FOUR_BANDS_SCRAMBLED, itemsError: { message: 'boom2' } })
    await expect(fetchPlacementPool(client as any)).rejects.toMatchObject({ message: 'boom2' })
  })
})
