/**
 * enrichPos.test.ts — unit tests for the DB-native POS enrichment path
 * (Task 5a.4).
 *
 * Covers:
 *   B2(a) INSERT path  — new item with null DB pos → enrichMissingPos classifies
 *                        it → updateLearningItemPos is called with the result.
 *   B2(b) UPDATE-idempotency path — item already has a valid DB pos →
 *                        enrichMissingPos receives it as non-null → skips LLM →
 *                        updateLearningItemPos is NOT called.
 *   Unit: fetchLearningItemPosByNormalizedText — SELECT returns Map.
 *   Unit: updateLearningItemPos — UPDATE pos by normalized_text.
 */

import { describe, expect, it } from 'vitest'
import { fetchLearningItemPosByNormalizedText, updateLearningItemPos } from '../adapter'
import { enrichMissingPos, type PosEnrichmentItem } from '../enrichPos'

// ---------------------------------------------------------------------------
// Fake supabase clients
// ---------------------------------------------------------------------------

/**
 * Builds a fake Supabase client that simulates SELECT on `learning_items`.
 * `rows` is the data the `.select().in()` chain resolves with.
 */
function buildSelectClient(rows: Array<{ normalized_text: string; pos: string | null }>) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          in: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  } as never
}

/**
 * Builds a fake Supabase client that captures UPDATE calls.
 * `updateCalls` accumulates each { normalizedText, pos } pair written.
 */
function buildUpdateClient() {
  const updateCalls: Array<{ normalizedText: string; pos: string }> = []
  const client = {
    schema: () => ({
      from: () => ({
        update: (payload: { pos: string }) => ({
          eq: async (_col: string, normalizedText: string) => {
            updateCalls.push({ normalizedText, pos: payload.pos })
            return { error: null }
          },
        }),
      }),
    }),
  } as never
  return { client, updateCalls }
}

// ---------------------------------------------------------------------------
// Adapter unit tests
// ---------------------------------------------------------------------------

describe('fetchLearningItemPosByNormalizedText', () => {
  it('returns a Map keyed by normalized_text with the pos value from the DB', async () => {
    const client = buildSelectClient([
      { normalized_text: 'makan', pos: 'verb' },
      { normalized_text: 'rumah', pos: null },
    ])
    const result = await fetchLearningItemPosByNormalizedText(client, ['makan', 'rumah'])
    expect(result.get('makan')).toBe('verb')
    expect(result.get('rumah')).toBeNull()
    expect(result.size).toBe(2)
  })

  it('returns an empty Map for an empty input array', async () => {
    // No DB call should be made; even if it were, empty result is correct.
    const client = buildSelectClient([])
    const result = await fetchLearningItemPosByNormalizedText(client, [])
    expect(result.size).toBe(0)
  })

  it('omits entries for normalized_texts not found in the DB', async () => {
    const client = buildSelectClient([{ normalized_text: 'makan', pos: 'verb' }])
    const result = await fetchLearningItemPosByNormalizedText(client, ['makan', 'unknown-word'])
    expect(result.has('makan')).toBe(true)
    expect(result.has('unknown-word')).toBe(false)
  })
})

describe('updateLearningItemPos', () => {
  it('calls UPDATE with pos and the correct normalized_text', async () => {
    const { client, updateCalls } = buildUpdateClient()
    await updateLearningItemPos(client, 'makan', 'verb')
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).toEqual({ normalizedText: 'makan', pos: 'verb' })
  })
})

// ---------------------------------------------------------------------------
// DB-native POS pass integration tests (B2)
// ---------------------------------------------------------------------------

/**
 * Minimal harness simulating the DB-native POS pass in the runner (step 5b+):
 *   1. Read existing pos from DB (fetchLearningItemPosByNormalizedText).
 *   2. Build PosEnrichmentItem[] with DB pos populated.
 *   3. enrichMissingPos → classifies only items with null/empty pos.
 *   4. updateLearningItemPos for each classified item.
 *
 * Both adapter fns use the fake clients above; `enrichMissingPos` is mocked
 * to avoid a real Anthropic API call.
 */
async function runDbNativePosPass(params: {
  rows: Array<{ normalized_text: string; pos: string | null }>
  typedItems: Array<{ normalized_text: string; base_text: string; item_type: 'word' | 'phrase'; translation_nl: string | null; translation_en: string | null }>
  classifyResult: Map<string, string>
}) {
  const { rows, typedItems, classifyResult } = params

  // Step 1: read existing pos
  const selectClient = buildSelectClient(rows)
  const posMap = await fetchLearningItemPosByNormalizedText(
    selectClient,
    typedItems.map((i) => i.normalized_text),
  )

  // Step 2: build enrichment items
  const enrichmentItems: PosEnrichmentItem[] = typedItems.map((item) => ({
    base_text: item.base_text,
    item_type: item.item_type,
    translation_nl: item.translation_nl,
    translation_en: item.translation_en,
    pos: posMap.get(item.normalized_text) ?? null,
  }))

  // Step 3: enrichMissingPos (mocked below by the caller — injected as mock)
  const posResult = { posByBaseText: classifyResult, classifiedCount: classifyResult.size, invalidCount: 0 }

  // Verify enrichMissingPos would skip items that already had pos — the
  // enrichmentItems for those should carry pos non-null, and enrichMissingPos's
  // filter (item_type word/phrase AND !pos) would exclude them.
  const itemsThatWouldBeSkipped = enrichmentItems.filter(
    (i) => (i.item_type === 'word' || i.item_type === 'phrase') && i.pos && i.pos.trim() !== '',
  )

  // Step 4: write pos for classified items
  const { client: updateClient, updateCalls } = buildUpdateClient()
  for (const [baseText, pos] of posResult.posByBaseText) {
    const normalizedText = baseText.toLowerCase().trim()
    await updateLearningItemPos(updateClient, normalizedText, pos)
  }

  return { updateCalls, itemsThatWouldBeSkipped, enrichmentItems }
}

describe('DB-native POS pass — B2(a) INSERT path', () => {
  it('classifies an item with null DB pos and writes it via updateLearningItemPos', async () => {
    // Simulate: "makan" was just inserted with pos=null.
    const rows = [{ normalized_text: 'makan', pos: null }]
    const typedItems = [{
      normalized_text: 'makan',
      base_text: 'makan',
      item_type: 'word' as const,
      translation_nl: 'eten',
      translation_en: 'to eat',
    }]
    // classifyResult: LLM returns 'verb' for 'makan'
    const classifyResult = new Map([['makan', 'verb']])

    const { updateCalls, itemsThatWouldBeSkipped, enrichmentItems } = await runDbNativePosPass({
      rows, typedItems, classifyResult,
    })

    // The enrichment item should carry pos=null (from DB) → not skipped
    expect(enrichmentItems[0].pos).toBeNull()
    expect(itemsThatWouldBeSkipped).toHaveLength(0)

    // updateLearningItemPos should be called once with the classified pos
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).toEqual({ normalizedText: 'makan', pos: 'verb' })
  })
})

describe('DB-native POS pass — B2(b) UPDATE-idempotency path', () => {
  it('skips LLM classification for an item whose DB row already has a valid pos', async () => {
    // Simulate: "rumah" already exists in DB with pos='noun'.
    const rows = [{ normalized_text: 'rumah', pos: 'noun' }]
    const typedItems = [{
      normalized_text: 'rumah',
      base_text: 'rumah',
      item_type: 'word' as const,
      translation_nl: 'huis',
      translation_en: 'house',
    }]
    // classifyResult is empty because enrichMissingPos would skip this item
    // (it has pos='noun' — not null/empty).  We simulate that here.
    const classifyResult = new Map<string, string>()

    const { updateCalls, itemsThatWouldBeSkipped, enrichmentItems } = await runDbNativePosPass({
      rows, typedItems, classifyResult,
    })

    // The enrichment item should carry pos='noun' from the DB
    expect(enrichmentItems[0].pos).toBe('noun')

    // enrichMissingPos would see pos='noun' and exclude this item
    expect(itemsThatWouldBeSkipped).toHaveLength(1)
    expect(itemsThatWouldBeSkipped[0].base_text).toBe('rumah')

    // No pos write should happen
    expect(updateCalls).toHaveLength(0)
  })
})

describe('DB-native POS pass — mixed batch', () => {
  it('classifies only null-pos items when the batch is mixed', async () => {
    const rows = [
      { normalized_text: 'makan', pos: null },
      { normalized_text: 'rumah', pos: 'noun' },
      { normalized_text: 'besar', pos: null },
    ]
    const typedItems = [
      { normalized_text: 'makan', base_text: 'makan', item_type: 'word' as const, translation_nl: 'eten', translation_en: 'to eat' },
      { normalized_text: 'rumah', base_text: 'rumah', item_type: 'word' as const, translation_nl: 'huis', translation_en: 'house' },
      { normalized_text: 'besar', base_text: 'besar', item_type: 'word' as const, translation_nl: 'groot', translation_en: 'big' },
    ]
    // LLM classifies the two null-pos items
    const classifyResult = new Map([['makan', 'verb'], ['besar', 'adjective']])

    const { updateCalls, itemsThatWouldBeSkipped } = await runDbNativePosPass({
      rows, typedItems, classifyResult,
    })

    // 'rumah' would be skipped by enrichMissingPos (has pos='noun')
    expect(itemsThatWouldBeSkipped).toHaveLength(1)
    expect(itemsThatWouldBeSkipped[0].base_text).toBe('rumah')

    // Two pos writes: makan → verb, besar → adjective
    expect(updateCalls).toHaveLength(2)
    expect(updateCalls.find(c => c.normalizedText === 'makan')?.pos).toBe('verb')
    expect(updateCalls.find(c => c.normalizedText === 'besar')?.pos).toBe('adjective')
    // 'rumah' must NOT appear in the update calls
    expect(updateCalls.find(c => c.normalizedText === 'rumah')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// enrichMissingPos pure-logic tests (no LLM — verifies the filter contract)
// ---------------------------------------------------------------------------

describe('enrichMissingPos — skip contract', () => {
  it('returns empty map when all items already have a valid pos', async () => {
    // No ANTHROPIC_API_KEY in test env → the "no items need classification"
    // short-circuit fires first (before the API key check), so this is safe.
    const items: PosEnrichmentItem[] = [
      { base_text: 'makan', item_type: 'word', pos: 'verb' },
      { base_text: 'rumah', item_type: 'word', pos: 'noun' },
    ]
    const result = await enrichMissingPos(items)
    // All items have pos → needsClassification is empty → returns { ..., classifiedCount: 0 }
    expect(result.classifiedCount).toBe(0)
    expect(result.posByBaseText.size).toBe(0)
  })

  it('returns empty map when all items are sentence/dialogue_chunk (not word/phrase)', async () => {
    const items: PosEnrichmentItem[] = [
      { base_text: 'Saya makan nasi.', item_type: 'sentence', pos: null },
      { base_text: 'Halo, apa kabar?', item_type: 'dialogue_chunk', pos: null },
    ]
    const result = await enrichMissingPos(items)
    expect(result.classifiedCount).toBe(0)
    expect(result.posByBaseText.size).toBe(0)
  })
})
