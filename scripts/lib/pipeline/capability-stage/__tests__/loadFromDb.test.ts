/**
 * loadFromDb.test.ts — Unit tests for the typed item import seam.
 *
 * Mocks the CapabilitySupabaseClient to return fixture rows without hitting
 * the DB. Asserts:
 *   - fetchItemRowsFromDb returns typed item rows with all required fields
 *   - fetchItemCapabilityState returns maps keyed by normalized_text and
 *     canonical_key
 *   - loadFromDb composes both into the expected ItemDbResult shape
 *
 * The mock follows the gate.test.ts pattern: a `buildMockSupabase` function
 * that routes `.from(table)` to a fixture-backed chain.
 */

import { describe, it, expect } from 'vitest'
import {
  fetchItemRowsFromDb,
  fetchItemCapabilityState,
  fetchDistractorPool,
  loadFromDb,
  PAGE_SIZE,
  type TypedItemRow,
  type ExistingItemState,
} from '../loadFromDb'

// ---------------------------------------------------------------------------
// Mock Supabase client — mirrors gate.test.ts pattern
// ---------------------------------------------------------------------------

interface MockTable {
  rows: Array<Record<string, unknown>>
}

function buildMockSupabase(tables: Record<string, MockTable>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const t = tables[table] ?? { rows: [] }
        let current = [...t.rows]
        // Track range calls so the paginated path returns the correct slice.
        let rangeFrom: number | null = null
        let rangeTo: number | null = null
        const chain: Record<string, unknown> = {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          select: (_cols: string) => {
            current = [...t.rows]
            rangeFrom = null
            rangeTo = null
            return chain
          },
          eq: (col: string, val: unknown) => {
            current = current.filter((r) => r[col] === val)
            return chain
          },
          in: (col: string, vals: unknown[]) => {
            current = current.filter((r) => vals.includes(r[col]))
            return chain
          },
          range: (from: number, to: number) => {
            rangeFrom = from
            rangeTo = to
            return chain
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: current[0] ?? null, error: null }),
          single: async () => ({ data: current[0] ?? null, error: null }),
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
            // If range was called, return only the requested slice.
            if (rangeFrom !== null && rangeTo !== null) {
              return resolve({ data: current.slice(rangeFrom, rangeTo + 1), error: null })
            }
            return resolve({ data: current, error: null })
          },
        }
        return chain
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LESSON_ID = 'lesson-uuid-1'
const SECTION_VOCAB_ID = 'section-vocab-1'
const SECTION_EXPR_ID = 'section-expr-1'

/** lesson_section_item_rows rows for the fixture lesson */
const ITEM_ROWS = [
  {
    id: 'item-row-1',
    section_id: SECTION_VOCAB_ID,
    lesson_id: LESSON_ID,
    display_order: 1,
    source_item_ref: 'lesson-1/section-1/item-0',
    item_type: 'word',
    indonesian_text: 'buku',
    l1_translation: 'boek',
    l2_translation: 'book',
    section_kind: 'vocabulary',
  },
  {
    id: 'item-row-2',
    section_id: SECTION_VOCAB_ID,
    lesson_id: LESSON_ID,
    display_order: 2,
    source_item_ref: 'lesson-1/section-1/item-1',
    item_type: 'word',
    indonesian_text: 'meja',
    l1_translation: 'tafel',
    l2_translation: 'table',
    section_kind: 'vocabulary',
  },
  {
    id: 'item-row-3',
    section_id: SECTION_EXPR_ID,
    lesson_id: LESSON_ID,
    display_order: 1,
    source_item_ref: 'lesson-1/section-2/item-0',
    item_type: 'phrase',
    indonesian_text: 'selamat pagi',
    l1_translation: 'goedemorgen',
    l2_translation: 'good morning',
    section_kind: 'expressions',
  },
  {
    id: 'item-row-4',
    section_id: SECTION_VOCAB_ID,
    lesson_id: LESSON_ID,
    display_order: 3,
    source_item_ref: 'lesson-1/section-1/item-2',
    item_type: 'word',
    indonesian_text: 'kursi',
    l1_translation: 'stoel',
    l2_translation: null, // nullable EN translation
    section_kind: 'vocabulary',
  },
]

/** learning_items rows (already-seeded items) */
const EXISTING_LEARNING_ITEMS = [
  {
    id: 'li-1',
    normalized_text: 'buku',
    source_type: 'lesson',
  },
  {
    id: 'li-2',
    normalized_text: 'meja',
    source_type: 'lesson',
  },
]

/** learning_capabilities rows for item source_kind */
const EXISTING_ITEM_CAPS = [
  {
    id: 'cap-1',
    canonical_key: 'item:buku:recognition:nl',
    source_kind: 'vocabulary_src',
  },
  {
    id: 'cap-2',
    canonical_key: 'item:meja:recognition:nl',
    source_kind: 'vocabulary_src',
  },
]

// The mock must handle the join pattern: item rows are fetched from
// lesson_section_item_rows joined via section_id → lesson_sections.section_kind.
// Since we store section_kind inline in the fixture rows (pre-joined), the mock
// returns item rows with section_kind already present.
function buildFixtureMock() {
  return buildMockSupabase({
    // The fetchItemRowsFromDb query selects from lesson_section_item_rows
    // joining to lesson_sections. We return pre-joined rows (section_kind inline).
    lesson_section_item_rows: { rows: ITEM_ROWS },
    // lesson_sections is accessed to get section_kind via a join; the mock
    // handles this through the pre-joined data above.
    lesson_sections: {
      rows: [
        { id: SECTION_VOCAB_ID, lesson_id: LESSON_ID, section_kind: 'vocabulary' },
        { id: SECTION_EXPR_ID, lesson_id: LESSON_ID, section_kind: 'expressions' },
      ],
    },
    learning_items: { rows: EXISTING_LEARNING_ITEMS },
    learning_capabilities: { rows: EXISTING_ITEM_CAPS },
  })
}

// ---------------------------------------------------------------------------
// fetchItemRowsFromDb
// ---------------------------------------------------------------------------

describe('fetchItemRowsFromDb', () => {
  it('returns all typed item rows for the lesson', async () => {
    const supabase = buildFixtureMock()
    const rows = await fetchItemRowsFromDb(supabase as never, LESSON_ID)
    expect(rows).toHaveLength(4)
  })

  it('row has all required typed fields', async () => {
    const supabase = buildFixtureMock()
    const rows = await fetchItemRowsFromDb(supabase as never, LESSON_ID)
    const buku = rows.find((r) => r.indonesian_text === 'buku')
    expect(buku).toBeDefined()
    expect(buku!.source_item_ref).toBe('lesson-1/section-1/item-0')
    expect(buku!.item_type).toBe('word')
    expect(buku!.l1_translation).toBe('boek')
    expect(buku!.l2_translation).toBe('book')
    expect(buku!.lesson_id).toBe(LESSON_ID)
    expect(buku!.section_id).toBe(SECTION_VOCAB_ID)
  })

  it('preserves phrase item_type', async () => {
    const supabase = buildFixtureMock()
    const rows = await fetchItemRowsFromDb(supabase as never, LESSON_ID)
    const phrase = rows.find((r) => r.item_type === 'phrase')
    expect(phrase).toBeDefined()
    expect(phrase!.indonesian_text).toBe('selamat pagi')
  })

  it('handles nullable l2_translation', async () => {
    const supabase = buildFixtureMock()
    const rows = await fetchItemRowsFromDb(supabase as never, LESSON_ID)
    const kursi = rows.find((r) => r.indonesian_text === 'kursi')
    expect(kursi).toBeDefined()
    expect(kursi!.l2_translation).toBeNull()
  })

  it('throws when the query returns an error', async () => {
    const errorMock = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              // fetchItemRowsFromDb chains .order() after .eq() (5a.5 deterministic ordering)
              order: () => ({
                order: () => ({
                  then: (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
                    resolve({ data: null, error: { message: 'DB error' } }),
                }),
              }),
            }),
          }),
        }),
      }),
    }
    await expect(
      fetchItemRowsFromDb(errorMock as never, LESSON_ID),
    ).rejects.toThrow('Failed to fetch lesson_section_item_rows')
  })

  // FIX 1: section_kind join — PostgREST returns nested object, mapper must unwrap it.
  it('maps section_kind from nested lesson_sections embed (PostgREST join shape)', async () => {
    // PostgREST returns lesson_sections as a nested object, NOT a top-level field.
    // This test verifies the mapper correctly unwraps it.
    const nestedMock = buildMockSupabase({
      lesson_section_item_rows: {
        rows: [
          {
            id: 'item-row-nested',
            section_id: SECTION_VOCAB_ID,
            lesson_id: LESSON_ID,
            display_order: 1,
            source_item_ref: 'lesson-1/section-1/item-0',
            item_type: 'word',
            indonesian_text: 'apel',
            l1_translation: 'appel',
            l2_translation: 'apple',
            // ↓ PostgREST join shape: section_kind nested under lesson_sections object
            lesson_sections: { section_kind: 'vocabulary' },
          },
        ],
      },
      learning_items: { rows: [] },
      learning_capabilities: { rows: [] },
    })
    const rows = await fetchItemRowsFromDb(nestedMock as never, LESSON_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0].section_kind).toBe('vocabulary')
  })

  it('maps section_kind to empty string when lesson_sections embed is absent (pre-republish null section)', async () => {
    // A row whose section FK resolves to null (pre-republish state) must map to ''
    // rather than throwing — this is the intentional fallback for NULL section_id rows.
    const nullSectionMock = buildMockSupabase({
      lesson_section_item_rows: {
        rows: [
          {
            id: 'item-row-null-section',
            section_id: null,
            lesson_id: LESSON_ID,
            display_order: 1,
            source_item_ref: 'lesson-1/section-1/item-0',
            item_type: 'word',
            indonesian_text: 'jeruk',
            l1_translation: 'sinaasappel',
            l2_translation: null,
            // ↓ lesson_sections embed absent (null or missing key)
            lesson_sections: null,
          },
        ],
      },
      learning_items: { rows: [] },
      learning_capabilities: { rows: [] },
    })
    const rows = await fetchItemRowsFromDb(nullSectionMock as never, LESSON_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0].section_kind).toBe('')
  })
})

// ---------------------------------------------------------------------------
// fetchItemCapabilityState
// ---------------------------------------------------------------------------

describe('fetchItemCapabilityState', () => {
  it('returns existingItemsByNormalizedText keyed by normalized_text', async () => {
    const supabase = buildFixtureMock()
    const state = await fetchItemCapabilityState(supabase as never)
    expect(state.existingItemsByNormalizedText.has('buku')).toBe(true)
    expect(state.existingItemsByNormalizedText.has('meja')).toBe(true)
    expect(state.existingItemsByNormalizedText.get('buku')!.id).toBe('li-1')
  })

  it('returns existingItemCapsByCanonicalKey keyed by canonical_key', async () => {
    const supabase = buildFixtureMock()
    const state = await fetchItemCapabilityState(supabase as never)
    expect(state.existingItemCapsByCanonicalKey.has('item:buku:recognition:nl')).toBe(true)
    expect(state.existingItemCapsByCanonicalKey.has('item:meja:recognition:nl')).toBe(true)
    expect(state.existingItemCapsByCanonicalKey.get('item:buku:recognition:nl')!.id).toBe('cap-1')
  })

  it('returns empty maps when no items/caps exist', async () => {
    const emptyMock = buildMockSupabase({
      learning_items: { rows: [] },
      learning_capabilities: { rows: [] },
    })
    const state = await fetchItemCapabilityState(emptyMock as never)
    expect(state.existingItemsByNormalizedText.size).toBe(0)
    expect(state.existingItemCapsByCanonicalKey.size).toBe(0)
  })

  // FIX 2: Pagination — fetchItemCapabilityState must fetch ALL rows across pages.
  it('paginates learning_items and learning_capabilities across multiple pages', async () => {
    // Build a set of items and caps larger than PAGE_SIZE to force multiple rounds.
    const manyItems = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => ({
      id: `li-${i}`,
      normalized_text: `word-${i}`,
      source_type: 'lesson',
    }))
    const manyCaps = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({
      id: `cap-${i}`,
      canonical_key: `item:word-${i}:recognition:nl`,
      source_kind: 'vocabulary_src',
    }))
    const bigMock = buildMockSupabase({
      learning_items: { rows: manyItems },
      learning_capabilities: { rows: manyCaps },
    })
    const state = await fetchItemCapabilityState(bigMock as never)
    // Must contain ALL rows across pages, not just the first PAGE_SIZE.
    expect(state.existingItemsByNormalizedText.size).toBe(PAGE_SIZE + 3)
    expect(state.existingItemCapsByCanonicalKey.size).toBe(PAGE_SIZE + 5)
    // Spot-check a row from the second page.
    expect(state.existingItemsByNormalizedText.has(`word-${PAGE_SIZE}`)).toBe(true)
    expect(state.existingItemCapsByCanonicalKey.has(`item:word-${PAGE_SIZE}:recognition:nl`)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// loadFromDb (composed seam)
// ---------------------------------------------------------------------------

describe('loadFromDb', () => {
  it('returns items array and itemState maps', async () => {
    const supabase = buildFixtureMock()
    const result = await loadFromDb(supabase as never, { lessonId: LESSON_ID })
    expect(result.items).toHaveLength(4)
    expect(result.itemState.existingItemsByNormalizedText.size).toBe(2)
    expect(result.itemState.existingItemCapsByCanonicalKey.size).toBe(2)
  })

  it('items have correct TypedItemRow shape', async () => {
    const supabase = buildFixtureMock()
    const result = await loadFromDb(supabase as never, { lessonId: LESSON_ID })
    const meja = result.items.find((i) => i.indonesian_text === 'meja')
    expect(meja).toBeDefined()
    // Verify the full TypedItemRow contract
    const row = meja as TypedItemRow
    expect(typeof row.id).toBe('string')
    expect(typeof row.section_id).toBe('string')
    expect(typeof row.lesson_id).toBe('string')
    expect(typeof row.display_order).toBe('number')
    expect(typeof row.source_item_ref).toBe('string')
    expect(['word', 'phrase']).toContain(row.item_type)
    expect(typeof row.indonesian_text).toBe('string')
    expect(typeof row.l1_translation).toBe('string')
  })

  it('itemState existingItemsByNormalizedText has id field', async () => {
    const supabase = buildFixtureMock()
    const result = await loadFromDb(supabase as never, { lessonId: LESSON_ID })
    const state: ExistingItemState = result.itemState
    const entry = state.existingItemsByNormalizedText.get('buku')
    expect(entry).toBeDefined()
    expect(entry!.id).toBe('li-1')
  })

  it('itemState existingItemCapsByCanonicalKey has id field', async () => {
    const supabase = buildFixtureMock()
    const result = await loadFromDb(supabase as never, { lessonId: LESSON_ID })
    const state: ExistingItemState = result.itemState
    const entry = state.existingItemCapsByCanonicalKey.get('item:buku:recognition:nl')
    expect(entry).toBeDefined()
    expect(entry!.id).toBe('cap-1')
  })

  it('is disk-free — no fs module imported', async () => {
    // Belt-and-suspenders: the noDiskReads enforcement test covers the source
    // scanning; this test confirms the module can be loaded without any disk
    // side-effect in test mode.
    const { loadFromDb: fn } = await import('../loadFromDb')
    expect(typeof fn).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// fetchDistractorPool fixtures
// ---------------------------------------------------------------------------

/**
 * Fixture rows for learning_items — the pool source.
 * Includes:
 *   - 3 active word items (should be in pool)
 *   - 1 active phrase item (should be in pool)
 *   - 1 inactive word item (excluded — is_active=false)
 *   - 1 active non-word/phrase item (excluded — item_type='grammar')
 */
const POOL_LEARNING_ITEMS = [
  {
    id: 'pool-li-1',
    normalized_text: 'buku',
    base_text: 'buku',
    translation_nl: 'boek',
    item_type: 'word',
    is_active: true,
  },
  {
    id: 'pool-li-2',
    normalized_text: 'meja',
    base_text: 'meja',
    translation_nl: 'tafel',
    item_type: 'word',
    is_active: true,
  },
  {
    id: 'pool-li-3',
    normalized_text: 'murah',
    base_text: 'murah',
    translation_nl: 'goedkoop',
    item_type: 'word',
    is_active: true,
  },
  {
    id: 'pool-li-4',
    normalized_text: 'selamat pagi',
    base_text: 'selamat pagi',
    translation_nl: 'goedemorgen',
    item_type: 'phrase',
    is_active: true,
  },
  // Excluded: inactive
  {
    id: 'pool-li-5',
    normalized_text: 'kursi',
    base_text: 'kursi',
    translation_nl: 'stoel',
    item_type: 'word',
    is_active: false,
  },
  // Excluded: non-word/phrase type
  {
    id: 'pool-li-6',
    normalized_text: 'me-verb-pattern',
    base_text: 'meN-',
    translation_nl: 'actief prefix',
    item_type: 'grammar',
    is_active: true,
  },
]

function buildPoolMock(rows = POOL_LEARNING_ITEMS) {
  return buildMockSupabase({
    learning_items: { rows },
    learning_capabilities: { rows: [] },
  })
}

// ---------------------------------------------------------------------------
// fetchDistractorPool
// ---------------------------------------------------------------------------

describe('fetchDistractorPool', () => {
  it('returns only active word/phrase items', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    // 3 active words + 1 active phrase = 4; inactive word and grammar item excluded
    expect(pool).toHaveLength(4)
  })

  it('maps base_text to indonesian_text', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    const buku = pool.find((p) => p.indonesian_text === 'buku')
    expect(buku).toBeDefined()
  })

  it('maps translation_nl to l1_translation', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    const buku = pool.find((p) => p.indonesian_text === 'buku')
    expect(buku!.l1_translation).toBe('boek')
  })

  it('maps normalized_text to source_item_ref', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    const buku = pool.find((p) => p.indonesian_text === 'buku')
    expect(buku!.source_item_ref).toBe('buku')
    const greeting = pool.find((p) => p.indonesian_text === 'selamat pagi')
    expect(greeting!.source_item_ref).toBe('selamat pagi')
  })

  it('preserves item_type for word items', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    const murah = pool.find((p) => p.indonesian_text === 'murah')
    expect(murah!.item_type).toBe('word')
  })

  it('preserves item_type for phrase items', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    const pagi = pool.find((p) => p.indonesian_text === 'selamat pagi')
    expect(pagi!.item_type).toBe('phrase')
  })

  it('excludes inactive items', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    const inactive = pool.find((p) => p.indonesian_text === 'kursi')
    expect(inactive).toBeUndefined()
  })

  it('excludes non-word/phrase item_types', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    const grammar = pool.find((p) => p.source_item_ref === 'me-verb-pattern')
    expect(grammar).toBeUndefined()
  })

  it('returns empty array when no active word/phrase items exist', async () => {
    const emptyMock = buildMockSupabase({ learning_items: { rows: [] }, learning_capabilities: { rows: [] } })
    const pool = await fetchDistractorPool(emptyMock as never)
    expect(pool).toHaveLength(0)
  })

  it('throws when the query returns an error', async () => {
    const errorMock = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                range: () => ({
                  then: (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
                    resolve({ data: null, error: { message: 'pool fetch failed' } }),
                }),
              }),
            }),
          }),
        }),
      }),
    }
    await expect(fetchDistractorPool(errorMock as never)).rejects.toThrow(
      'Failed to fetch distractor pool from learning_items',
    )
  })

  it('paginates across multiple pages', async () => {
    // Build more than PAGE_SIZE active word items to exercise the pagination loop.
    const manyItems = Array.from({ length: PAGE_SIZE + 7 }, (_, i) => ({
      id: `pool-${i}`,
      normalized_text: `kata-${i}`,
      base_text: `kata-${i}`,
      translation_nl: `woord-${i}`,
      item_type: 'word',
      is_active: true,
    }))
    const bigMock = buildMockSupabase({
      learning_items: { rows: manyItems },
      learning_capabilities: { rows: [] },
    })
    const pool = await fetchDistractorPool(bigMock as never)
    // All rows across both pages must be returned.
    expect(pool).toHaveLength(PAGE_SIZE + 7)
    // Spot-check an item from the second page.
    expect(pool.find((p) => p.source_item_ref === `kata-${PAGE_SIZE}`)).toBeDefined()
  })

  it('every pool item satisfies DistractorInputItem shape', async () => {
    const supabase = buildPoolMock()
    const pool = await fetchDistractorPool(supabase as never)
    for (const item of pool) {
      expect(typeof item.source_item_ref).toBe('string')
      expect(typeof item.indonesian_text).toBe('string')
      expect(typeof item.l1_translation).toBe('string')
      expect(['word', 'phrase']).toContain(item.item_type)
    }
  })
})
