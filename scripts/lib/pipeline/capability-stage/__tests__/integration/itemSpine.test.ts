/**
 * integration/itemSpine.test.ts — canonical item-spine integration test.
 *
 * Plan: docs/plans/2026-05-27-capability-stage-slice-1-item-db-spine.md
 * Task: 9 + 10 (code portions)
 *
 * Drives `runCapabilityStage` through its DB seams with a mock Supabase client
 * and fixture lesson content. Asserts the external behaviour of the complete
 * item path — from seeded lesson-content rows to the typed capability rows,
 * curated distractor rows, translation_nl backfill, idempotency, and regenerate.
 *
 * Testing philosophy: external behaviour through DB seams only. No imports
 * from internal helpers (adapter, projectors, etc.) — the test reads the
 * runner's public output and the ops the mock client records.
 *
 * Covered assertions (plan Task 10 + Task 9):
 *   1. Seed → run → assert:
 *      - learning_items written with translation_nl from l1_translation
 *      - 4 base item caps written per item (skip-if-exists path)
 *      - anchor contexts (item_contexts) written per item
 *      - curated distractor rows in recognition_mcq_distractors +
 *        cued_recall_distractors, keyed to the correct cap types
 *      - cloze_mcq_item_distractors NOT written (no item cloze cap in Slice 1)
 *   2. Idempotency: second run writes nothing new
 *   3. --regenerate <item>: deletes + rewrites only that item; others untouched
 *   4. translation_nl backfill (Task 9): existing item with translation_nl=null
 *      gets translation_nl populated from l1_translation; pos PRESERVED
 *   5. CS14–17 gate: post-write validators execute in the integrated path
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock enrichPos so tests don't hit the LLM
const { enrichMissingPosMock } = vi.hoisted(() => ({
  enrichMissingPosMock: vi.fn().mockResolvedValue({
    posByBaseText: new Map<string, string>(),
    enrichedCount: 0,
  }),
}))
vi.mock('../../enrichPos', () => ({
  enrichMissingPos: enrichMissingPosMock,
}))

import { runCapabilityStage } from '../../runner'
import type { LoadedLesson } from '../../loader'
import type { TypedItemRow } from '../../loadFromDb'

// ---------------------------------------------------------------------------
// Shared fixture: typed item rows (what loadFromDb returns)
// ---------------------------------------------------------------------------

const LESSON_ID = 'integration-lesson-uuid'

const TYPED_ROWS: TypedItemRow[] = [
  {
    id: 'row-buku',
    section_id: 'section-vocab',
    lesson_id: LESSON_ID,
    display_order: 0,
    source_item_ref: 'buku',
    item_type: 'word',
    indonesian_text: 'buku',
    l1_translation: 'boek',
    l2_translation: 'book',
    section_kind: 'vocabulary',
  },
  {
    id: 'row-meja',
    section_id: 'section-vocab',
    lesson_id: LESSON_ID,
    display_order: 1,
    source_item_ref: 'meja',
    item_type: 'word',
    indonesian_text: 'meja',
    l1_translation: 'tafel',
    l2_translation: 'table',
    section_kind: 'vocabulary',
  },
]

// Subset used for single-item assertions
const TYPED_ROWS_SINGLE: TypedItemRow[] = [TYPED_ROWS[0]!]

// ---------------------------------------------------------------------------
// Mock Supabase client — full state-tracking version
// ---------------------------------------------------------------------------
//
// State tracked:
//   - learning_items (normalized_text → { id, translation_nl, pos })
//   - learning_capabilities (canonical_key → id)
//   - recognition_mcq_distractors (capability_id → distractors)
//   - cued_recall_distractors (capability_id → distractors)
//   - item_contexts (upsert count)
//
// The mock supports the CHECK-THEN-WRITE pattern used by
// upsertLearningItemIdempotent: maybeSingle() returns the existing row if
// normalizedText exists; insert/update then writes/updates.
//
// For idempotency, the caller can pass pre-seeded state so the mock
// correctly simulates "already exists" for skip-if-exists semantics.

interface LearningItemState {
  id: string
  normalized_text: string
  translation_nl: string | null
  pos: string | null
}

interface RecordedOp {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  payload?: unknown
  opts?: Record<string, unknown>
}

interface MockClientState {
  learningItems: Map<string, LearningItemState>
  capabilities: Map<string, string> // canonical_key → id
  recognitionDistractors: Map<string, string[]> // capability_id → distractors
  cuedRecallDistractors: Map<string, string[]>
  clozeItemDistractors: Map<string, string[]>
  itemContextCount: number
  ops: RecordedOp[]
}

function buildIntegrationMock(initial: {
  learningItems?: Map<string, LearningItemState>
  capabilities?: Map<string, string>
  recognitionDistractors?: Map<string, string[]>
  cuedRecallDistractors?: Map<string, string[]>
  seededDistractorCapIds?: Set<string>
} = {}): { client: unknown; state: MockClientState } {
  let seq = 0
  const nextId = (prefix: string) => `${prefix}-${++seq}`

  const state: MockClientState = {
    learningItems: initial.learningItems ?? new Map(),
    capabilities: initial.capabilities ?? new Map(),
    recognitionDistractors: initial.recognitionDistractors ?? new Map(),
    cuedRecallDistractors: initial.cuedRecallDistractors ?? new Map(),
    clozeItemDistractors: new Map(),
    itemContextCount: 0,
    ops: [],
  }

  // Seed IDs: used by fetchSeededDistractorCapIds (queries recognition_mcq_distractors)
  const seededCapIds = initial.seededDistractorCapIds ?? new Set<string>()

  // For recognition_mcq_distractors fetch, seed from recognition map too
  for (const capId of state.recognitionDistractors.keys()) {
    seededCapIds.add(capId)
  }

  const fromBuilder = (table: string) => {
    let eqCol: string | undefined
    let eqVal: unknown
    let inVals: unknown[] = []
    let upsertPayload: unknown = undefined
    let upsertOpts: Record<string, unknown> = {}

    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        eqCol = col
        eqVal = val
        return chain
      },
      in(_col: string, vals: unknown[]) {
        inVals = vals
        return chain
      },
      is: () => chain,
      not: () => chain,
      ilike: () => chain,
      limit: () => chain,
      order: () => chain,

      // Paginated range read — used by fetchItemCapabilityState and fetchDistractorPool
      range() {
        let rows: Array<Record<string, unknown>> = []

        if (table === 'learning_items') {
          if (eqCol === 'source_type') {
            rows = [...state.learningItems.values()].map((r) => ({
              id: r.id,
              normalized_text: r.normalized_text,
            }))
          } else if (eqCol === 'is_active') {
            // fetchDistractorPool
            rows = [...state.learningItems.values()].map((r) => ({
              id: r.id,
              normalized_text: r.normalized_text,
              base_text: r.normalized_text,
              translation_nl: r.translation_nl ?? `nl_${r.normalized_text}`,
              item_type: 'word',
            }))
          }
        } else if (table === 'learning_capabilities') {
          rows = [...state.capabilities.entries()].map(([key, id]) => ({
            id,
            canonical_key: key,
          }))
        }

        return Promise.resolve({ data: rows, error: null, count: rows.length })
      },

      // Single row — used by upsertLearningItemIdempotent SELECT check
      maybeSingle: async () => {
        if (table === 'learning_items' && eqCol === 'normalized_text') {
          const existing = state.learningItems.get(String(eqVal))
          if (existing) {
            return {
              data: { id: existing.id, normalized_text: existing.normalized_text },
              error: null,
            }
          }
        }
        return { data: null, error: null }
      },

      // Single row — used by update().eq().select().single()
      single: async () => {
        if (table === 'learning_items') {
          if (eqCol === 'normalized_text') {
            const existing = state.learningItems.get(String(eqVal))
            if (existing) {
              return {
                data: { id: existing.id, normalized_text: existing.normalized_text },
                error: null,
              }
            }
          }
          // insert path — payload-derived
          if (upsertPayload && typeof upsertPayload === 'object' && !Array.isArray(upsertPayload)) {
            const p = upsertPayload as Record<string, unknown>
            const nt = String(p.normalized_text)
            const id = state.learningItems.get(nt)?.id ?? nextId('item')
            state.learningItems.set(nt, {
              id,
              normalized_text: nt,
              translation_nl: (p.translation_nl as string | null) ?? null,
              pos: (p.pos as string | null) ?? null,
            })
            return { data: { id, normalized_text: nt }, error: null }
          }
        }
        if (table === 'learning_capabilities') {
          const p = Array.isArray(upsertPayload) ? upsertPayload[0] : upsertPayload
          if (p && typeof p === 'object') {
            const key = (p as Record<string, unknown>).canonical_key as string
            const id = state.capabilities.get(key) ?? nextId('cap')
            state.capabilities.set(key, id)
            return { data: { id, canonical_key: key }, error: null }
          }
        }
        return { data: { id: nextId(table) }, error: null }
      },

      // Direct await on select (fetchSeededDistractorCapIds pattern)
      then(resolve: (v: { data: unknown; error: null }) => unknown) {
        if (table === 'recognition_mcq_distractors' && inVals.length > 0) {
          const rows = (inVals as string[])
            .filter((id) => seededCapIds.has(id))
            .map((capability_id) => ({ capability_id }))
          return resolve({ data: rows, error: null })
        }
        return resolve({ data: [], error: null })
      },
    }

    return {
      select() {
        return chain
      },

      // upsert — handles learning_capabilities (skip-if-exists) + distractor tables
      upsert(
        payload: unknown,
        opts2?: Record<string, unknown>,
      ) {
        upsertOpts = opts2 ?? {}
        upsertPayload = payload
        const rows = Array.isArray(payload) ? payload : [payload]
        state.ops.push({ table, op: 'upsert', payload, opts: upsertOpts })

        // learning_capabilities skip-if-exists (ignoreDuplicates: true)
        if (table === 'learning_capabilities' && upsertOpts?.ignoreDuplicates === true) {
          const inserted = (rows as Array<Record<string, unknown>>).filter((r) => {
            const key = r.canonical_key as string
            if (state.capabilities.has(key)) return false
            const id = nextId('cap')
            state.capabilities.set(key, id)
            r.id = id
            return true
          })
          return {
            select() {
              const result = { data: inserted, error: null }
              return {
                single: async () => ({ data: inserted[0] ?? null, error: null }),
                then: (resolve: (v: typeof result) => unknown) => resolve(result),
              }
            },
            then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
              resolve({ data: inserted, error: null }),
          }
        }

        // recognition_mcq_distractors
        if (table === 'recognition_mcq_distractors') {
          for (const r of rows as Array<{ capability_id: string; distractors: string[] }>) {
            state.recognitionDistractors.set(r.capability_id, r.distractors)
            seededCapIds.add(r.capability_id)
          }
          const result = { data: rows, error: null }
          return {
            select() {
              return { then: (resolve: (v: typeof result) => unknown) => resolve(result) }
            },
            then: (resolve: (v: typeof result) => unknown) => resolve(result),
          }
        }

        // cued_recall_distractors
        if (table === 'cued_recall_distractors') {
          for (const r of rows as Array<{ capability_id: string; distractors: string[] }>) {
            state.cuedRecallDistractors.set(r.capability_id, r.distractors)
          }
          const result = { data: rows, error: null }
          return {
            select() {
              return { then: (resolve: (v: typeof result) => unknown) => resolve(result) }
            },
            then: (resolve: (v: typeof result) => unknown) => resolve(result),
          }
        }

        // cloze_mcq_item_distractors
        if (table === 'cloze_mcq_item_distractors') {
          for (const r of rows as Array<{ capability_id: string; distractors: string[] }>) {
            state.clozeItemDistractors.set(r.capability_id, r.distractors)
          }
          const result = { data: rows, error: null }
          return {
            select() {
              return { then: (resolve: (v: typeof result) => unknown) => resolve(result) }
            },
            then: (resolve: (v: typeof result) => unknown) => resolve(result),
          }
        }

        // Generic upsert (content_units, item_contexts, etc.)
        const resultRows = (rows as Array<Record<string, unknown>>).map((r) => ({
          ...r,
          id: r.id ?? nextId(table),
        }))
        const multiResult = { data: resultRows, error: null }

        // item_contexts: track count
        if (table === 'item_contexts') {
          state.itemContextCount += rows.length
        }

        return {
          select() {
            const single = resultRows[0] ?? null
            return {
              single: async () => ({ data: single, error: null }),
              then: (resolve: (v: typeof multiResult) => unknown) => resolve(multiResult),
            }
          },
          then: (resolve: (v: typeof multiResult) => unknown) => resolve(multiResult),
        }
      },

      insert(payload: unknown) {
        upsertPayload = payload
        const rows = Array.isArray(payload) ? payload : [payload]
        state.ops.push({ table, op: 'insert', payload })

        if (table === 'learning_items') {
          const r = rows[0] as Record<string, unknown>
          const nt = String(r.normalized_text)
          const existingId = state.learningItems.get(nt)?.id
          const id = existingId ?? nextId('item')
          state.learningItems.set(nt, {
            id,
            normalized_text: nt,
            translation_nl: (r.translation_nl as string | null) ?? null,
            pos: (r.pos as string | null) ?? null,
          })
          return {
            select() {
              return {
                single: async () => ({
                  data: { id, normalized_text: nt },
                  error: null,
                }),
              }
            },
          }
        }

        return {
          select() {
            return {
              single: async () => ({ data: { id: nextId(table) }, error: null }),
            }
          },
          then: (resolve: (v: { error: null; data: { id: string } }) => unknown) =>
            resolve({ error: null, data: { id: nextId(table) } }),
        }
      },

      update(payload: unknown) {
        state.ops.push({ table, op: 'update', payload })

        return {
          eq(col: string, val: unknown) {
            eqCol = col
            eqVal = val
            return {
              select() {
                return {
                  single: async () => {
                    if (table === 'learning_items' && col === 'normalized_text') {
                      const existing = state.learningItems.get(String(val))
                      if (existing) {
                        // Apply translation update
                        const p = payload as Record<string, unknown>
                        existing.translation_nl = (p.translation_nl as string | null) ?? existing.translation_nl
                        // pos is NOT in the update payload — preserved
                        return {
                          data: { id: existing.id, normalized_text: existing.normalized_text },
                          error: null,
                        }
                      }
                    }
                    return { data: { id: nextId(table) }, error: null }
                  },
                }
              },
              in: async () => ({ error: null }),
            }
          },
          in: async () => ({ error: null }),
        }
      },

      delete() {
        state.ops.push({ table, op: 'delete' })
        return {
          eq: async () => ({ error: null }),
          in: async () => ({ error: null }),
        }
      },
    }
  }

  const client = {
    schema: () => ({ from: fromBuilder }),
  }

  return { client, state }
}

// ---------------------------------------------------------------------------
// Fixture: LoadedLesson with word items
// ---------------------------------------------------------------------------

function makeLoadedLesson(stagingDir: string, opts: { singleItem?: boolean } = {}): LoadedLesson {
  return {
    lesson: {
      id: LESSON_ID,
      module_id: 'module-1',
      order_index: 1,
      title: 'Integratie Test Les',
      level: 'A1',
      primary_voice: 'Achird',
    },
    sections: [
      {
        id: 'section-vocab',
        title: 'Woordenschat',
        order_index: 0,
        content: {
          type: 'vocabulary',
          items: opts.singleItem
            ? [{ indonesian: 'buku', dutch: 'boek', pos: 'noun', level: 'A1' }]
            : [
                { indonesian: 'buku', dutch: 'boek', pos: 'noun', level: 'A1' },
                { indonesian: 'meja', dutch: 'tafel', pos: 'noun', level: 'A1' },
              ],
        },
      },
    ],
    audioClipsByNormalizedText: new Map(),
    staging: {
      stagingDir,
      learningItems: opts.singleItem
        ? [
            {
              base_text: 'buku',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: 'boek',
              translation_en: 'book',
              pos: 'noun',
              level: 'A1',
              review_status: 'pending_review',
            },
          ]
        : [
            {
              base_text: 'buku',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: 'boek',
              translation_en: 'book',
              pos: 'noun',
              level: 'A1',
              review_status: 'pending_review',
            },
            {
              base_text: 'meja',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: 'tafel',
              translation_en: 'table',
              pos: 'noun',
              level: 'A1',
              review_status: 'pending_review',
            },
          ],
      grammarPatterns: [],
      candidates: [],
      clozeContexts: [],
      contentUnits: [],
      capabilities: [],
      exerciseAssets: [],
      affixedFormPairs: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Generator fixtures
// ---------------------------------------------------------------------------

function makeCuratedGenerateFn(
  items: Array<{
    source_item_ref: string
    recognition_distractors_nl: string[]
    cued_recall_distractors_id: string[]
    cloze_distractors_id: string[]
  }>,
) {
  return async () => JSON.stringify(items)
}

const CURATED_GENERATE_TWO_ITEMS = makeCuratedGenerateFn([
  {
    source_item_ref: 'buku',
    recognition_distractors_nl: ['stoel', 'pen', 'huis'],
    cued_recall_distractors_id: ['meja', 'kursi', 'rumah'],
    cloze_distractors_id: ['meja', 'kursi', 'rumah'],
  },
  {
    source_item_ref: 'meja',
    recognition_distractors_nl: ['boek', 'pen', 'huis'],
    cued_recall_distractors_id: ['buku', 'kursi', 'rumah'],
    cloze_distractors_id: ['buku', 'kursi', 'rumah'],
  },
])

const CURATED_GENERATE_BUKU_ONLY = makeCuratedGenerateFn([
  {
    source_item_ref: 'buku',
    recognition_distractors_nl: ['stoel', 'pen', 'huis'],
    cued_recall_distractors_id: ['meja', 'kursi', 'rumah'],
    cloze_distractors_id: ['meja', 'kursi', 'rumah'],
  },
])

// ---------------------------------------------------------------------------
// Helper: run the stage with the standard hooks pattern
// ---------------------------------------------------------------------------

async function runStage(
  inputOverrides: Partial<Parameters<typeof runCapabilityStage>[0]>,
  client: unknown,
  loadFromDbFn: (supabase: unknown, input: { lessonId: string }) => Promise<{
    items: TypedItemRow[]
    itemState: {
      existingItemsByNormalizedText: Map<string, { id: string; normalized_text: string }>
      existingItemCapsByCanonicalKey: Map<string, { id: string; canonical_key: string }>
    }
  }>,
  stagingDir: string,
  generateFn: () => Promise<string> = async () => '[]',
  singleItem = false,
) {
  return runCapabilityStage(
    {
      lessonNumber: 1,
      lessonId: LESSON_ID,
      ...inputOverrides,
    },
    {
      loadLesson: async () => makeLoadedLesson(stagingDir, { singleItem }),
      createSupabaseClient: () => client as never,
      loadFromDb: loadFromDbFn as never,
      fetchDistractorPool: async () => [],
      generateFn,
    },
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'item-spine-integration-'))
  enrichMissingPosMock.mockResolvedValue({
    posByBaseText: new Map<string, string>(),
    enrichedCount: 0,
  })
})

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe('item-spine integration — seed → run → assert', () => {
  it('writes learning_items with translation_nl from l1_translation', async () => {
    const { client, state } = buildIntegrationMock()

    const result = await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      CURATED_GENERATE_TWO_ITEMS,
    )

    expect(['ok', 'partial']).toContain(result.status)

    // learning_items written for both items
    expect(state.learningItems.has('buku')).toBe(true)
    expect(state.learningItems.has('meja')).toBe(true)

    // translation_nl populated from l1_translation
    expect(state.learningItems.get('buku')?.translation_nl).toBe('boek')
    expect(state.learningItems.get('meja')?.translation_nl).toBe('tafel')
  })

  it('writes 4 base caps per item via skip-if-exists path', async () => {
    const { client, state } = buildIntegrationMock()

    const result = await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      CURATED_GENERATE_TWO_ITEMS,
    )

    expect(['ok', 'partial']).toContain(result.status)

    // Item caps use skip-if-exists (ignoreDuplicates: true)
    const itemCapUpserts = state.ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        (op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates === true,
    )
    expect(itemCapUpserts.length).toBeGreaterThan(0)

    // 2 items × 4 caps = 8 item caps total
    const totalItemCaps = itemCapUpserts.reduce((sum, op) => {
      const rows = Array.isArray(op.payload) ? op.payload : [op.payload]
      return sum + rows.length
    }, 0)
    expect(totalItemCaps).toBe(8)
  })

  it('writes anchor contexts for each item', async () => {
    const { client, state } = buildIntegrationMock()

    await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      CURATED_GENERATE_TWO_ITEMS,
    )

    // item_contexts upserted — at least one per item
    expect(state.itemContextCount).toBeGreaterThanOrEqual(2)
  })

  it('writes recognition_mcq_distractors and cued_recall_distractors from curated generate fn', async () => {
    const { client, state } = buildIntegrationMock()

    const result = await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      CURATED_GENERATE_TWO_ITEMS,
    )

    expect(['ok', 'partial']).toContain(result.status)

    // Both tables must have rows
    expect(state.recognitionDistractors.size).toBeGreaterThan(0)
    expect(state.cuedRecallDistractors.size).toBeGreaterThan(0)

    // cloze_mcq_item_distractors NOT written (no cloze cap for items in Slice 1)
    expect(state.clozeItemDistractors.size).toBe(0)

    // counts.itemDistractorSets reflects written rows
    expect(result.counts.itemDistractorSets).toBeGreaterThan(0)
  })

  it('recognition_mcq_distractors are keyed to text_recognition cap, cued_recall to l1_to_id_choice cap', async () => {
    // Use single-item fixture to keep cap-id tracking unambiguous
    const { client, state } = buildIntegrationMock()

    await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS_SINGLE,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      CURATED_GENERATE_BUKU_ONLY,
      /* singleItem */ true,
    )

    // Find the text_recognition and l1_to_id_choice cap ids for buku
    // canonical key format: cap:v1:item:learning_items/buku:<type>:<dir>:<mod>:<lang>
    const TEXT_REC_KEY_SUFFIX = ':text_recognition:id_to_l1:text:nl'
    const L1_TO_ID_KEY_SUFFIX = ':l1_to_id_choice:l1_to_id:text:nl'

    let textRecCapId: string | undefined
    let l1ToIdCapId: string | undefined

    for (const [key, id] of state.capabilities) {
      if (key.includes('buku') && key.endsWith(TEXT_REC_KEY_SUFFIX)) textRecCapId = id
      if (key.includes('buku') && key.endsWith(L1_TO_ID_KEY_SUFFIX)) l1ToIdCapId = id
    }

    expect(textRecCapId).toBeDefined()
    expect(l1ToIdCapId).toBeDefined()

    // recognition row keyed by text_recognition cap
    expect(state.recognitionDistractors.has(textRecCapId!)).toBe(true)
    expect(state.recognitionDistractors.get(textRecCapId!)).toEqual(['stoel', 'pen', 'huis'])

    // cued_recall row keyed by l1_to_id_choice cap
    expect(state.cuedRecallDistractors.has(l1ToIdCapId!)).toBe(true)
    expect(state.cuedRecallDistractors.get(l1ToIdCapId!)).toEqual(['meja', 'kursi', 'rumah'])
  })
})

describe('item-spine integration — idempotency', () => {
  it('second run writes no new items or caps when all already seeded', async () => {
    // Pre-seed all 8 caps for both items
    const TEXT_REC_BUKU = 'cap:v1:item:learning_items/buku:text_recognition:id_to_l1:text:nl'
    const L1_TO_ID_BUKU = 'cap:v1:item:learning_items/buku:l1_to_id_choice:l1_to_id:text:nl'
    const MEANING_BUKU = 'cap:v1:item:learning_items/buku:meaning_recall:id_to_l1:text:nl'
    const FORM_BUKU = 'cap:v1:item:learning_items/buku:form_recall:l1_to_id:text:nl'
    const TEXT_REC_MEJA = 'cap:v1:item:learning_items/meja:text_recognition:id_to_l1:text:nl'
    const L1_TO_ID_MEJA = 'cap:v1:item:learning_items/meja:l1_to_id_choice:l1_to_id:text:nl'
    const MEANING_MEJA = 'cap:v1:item:learning_items/meja:meaning_recall:id_to_l1:text:nl'
    const FORM_MEJA = 'cap:v1:item:learning_items/meja:form_recall:l1_to_id:text:nl'

    const preSeededCaps = new Map<string, string>([
      [TEXT_REC_BUKU, 'cap-buku-1'],
      [L1_TO_ID_BUKU, 'cap-buku-2'],
      [MEANING_BUKU, 'cap-buku-3'],
      [FORM_BUKU, 'cap-buku-4'],
      [TEXT_REC_MEJA, 'cap-meja-1'],
      [L1_TO_ID_MEJA, 'cap-meja-2'],
      [MEANING_MEJA, 'cap-meja-3'],
      [FORM_MEJA, 'cap-meja-4'],
    ])

    const seededCapIds = new Set([
      'cap-buku-1', 'cap-buku-2', 'cap-buku-3', 'cap-buku-4',
      'cap-meja-1', 'cap-meja-2', 'cap-meja-3', 'cap-meja-4',
    ])

    const preSeededItems = new Map<string, LearningItemState>([
      ['buku', { id: 'item-buku', normalized_text: 'buku', translation_nl: 'boek', pos: 'noun' }],
      ['meja', { id: 'item-meja', normalized_text: 'meja', translation_nl: 'tafel', pos: 'noun' }],
    ])

    const { client, state } = buildIntegrationMock({
      learningItems: preSeededItems,
      capabilities: preSeededCaps,
      seededDistractorCapIds: seededCapIds,
    })

    const capsBefore = new Map(state.capabilities)
    const itemsBefore = new Map(state.learningItems)
    const recDistractorsBefore = new Map(state.recognitionDistractors)
    const cuedDistractorsBefore = new Map(state.cuedRecallDistractors)

    const result = await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map([
            ['buku', { id: 'item-buku', normalized_text: 'buku' }],
            ['meja', { id: 'item-meja', normalized_text: 'meja' }],
          ]),
          existingItemCapsByCanonicalKey: new Map(
            [...preSeededCaps].map(([key, id]) => [key, { id, canonical_key: key }]),
          ),
        },
      }),
      tmpDir,
      // generateFn should NOT be called for already-seeded items
      async () => '[]',
    )

    expect(['ok', 'partial']).toContain(result.status)

    // No NEW caps written (skip-if-exists returned nothing)
    expect(state.capabilities.size).toBe(capsBefore.size)

    // No NEW distractor rows written
    expect(state.recognitionDistractors.size).toBe(recDistractorsBefore.size)
    expect(state.cuedRecallDistractors.size).toBe(cuedDistractorsBefore.size)
    expect(result.counts.itemDistractorSets).toBe(0)

    // item count unchanged
    expect(state.learningItems.size).toBe(itemsBefore.size)
  })
})

describe('item-spine integration — --regenerate', () => {
  it('deletes and rewrites distractors for the target item only; other items untouched', async () => {
    // Pre-seed both items' caps and distractors
    const TEXT_REC_BUKU = 'cap:v1:item:learning_items/buku:text_recognition:id_to_l1:text:nl'
    const L1_TO_ID_BUKU = 'cap:v1:item:learning_items/buku:l1_to_id_choice:l1_to_id:text:nl'
    const MEANING_BUKU = 'cap:v1:item:learning_items/buku:meaning_recall:id_to_l1:text:nl'
    const FORM_BUKU = 'cap:v1:item:learning_items/buku:form_recall:l1_to_id:text:nl'
    const TEXT_REC_MEJA = 'cap:v1:item:learning_items/meja:text_recognition:id_to_l1:text:nl'
    const L1_TO_ID_MEJA = 'cap:v1:item:learning_items/meja:l1_to_id_choice:l1_to_id:text:nl'
    const MEANING_MEJA = 'cap:v1:item:learning_items/meja:meaning_recall:id_to_l1:text:nl'
    const FORM_MEJA = 'cap:v1:item:learning_items/meja:form_recall:l1_to_id:text:nl'

    const preSeededCaps = new Map<string, string>([
      [TEXT_REC_BUKU, 'cap-buku-1'],
      [L1_TO_ID_BUKU, 'cap-buku-2'],
      [MEANING_BUKU, 'cap-buku-3'],
      [FORM_BUKU, 'cap-buku-4'],
      [TEXT_REC_MEJA, 'cap-meja-1'],
      [L1_TO_ID_MEJA, 'cap-meja-2'],
      [MEANING_MEJA, 'cap-meja-3'],
      [FORM_MEJA, 'cap-meja-4'],
    ])

    // Meja's distractors are pre-seeded; buku's are NOT (--regenerate will write them)
    const preSeededRec = new Map<string, string[]>([
      ['cap-meja-1', ['boek', 'pen', 'huis']],
    ])
    const preSeededCued = new Map<string, string[]>([
      ['cap-meja-2', ['buku', 'kursi', 'rumah']],
    ])

    const { client, state } = buildIntegrationMock({
      learningItems: new Map<string, LearningItemState>([
        ['buku', { id: 'item-buku', normalized_text: 'buku', translation_nl: 'boek', pos: 'noun' }],
        ['meja', { id: 'item-meja', normalized_text: 'meja', translation_nl: 'tafel', pos: 'noun' }],
      ]),
      capabilities: preSeededCaps,
      recognitionDistractors: preSeededRec,
      cuedRecallDistractors: preSeededCued,
      seededDistractorCapIds: new Set(['cap-meja-1', 'cap-meja-2', 'cap-meja-3', 'cap-meja-4']),
    })

    const result = await runStage(
      { regenerate: { kind: 'item', normalizedText: 'buku' } },
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map([
            ['buku', { id: 'item-buku', normalized_text: 'buku' }],
            ['meja', { id: 'item-meja', normalized_text: 'meja' }],
          ]),
          existingItemCapsByCanonicalKey: new Map(
            [...preSeededCaps].map(([key, id]) => [key, { id, canonical_key: key }]),
          ),
        },
      }),
      tmpDir,
      CURATED_GENERATE_BUKU_ONLY,
    )

    expect(['ok', 'partial']).toContain(result.status)

    // DELETE ops fired for all 3 distractor tables for buku's caps
    const deleteOps = state.ops.filter(
      (op) =>
        ['recognition_mcq_distractors', 'cued_recall_distractors', 'cloze_mcq_item_distractors'].includes(
          op.table,
        ) && op.op === 'delete',
    )
    // 3 tables × delete for buku's cap set
    expect(deleteOps.length).toBe(3)

    // buku's distractors were written after the delete
    expect(state.recognitionDistractors.has('cap-buku-1')).toBe(true)
    expect(state.recognitionDistractors.get('cap-buku-1')).toEqual(['stoel', 'pen', 'huis'])

    // meja's distractors were NOT touched
    expect(state.recognitionDistractors.get('cap-meja-1')).toEqual(['boek', 'pen', 'huis'])
    expect(state.cuedRecallDistractors.get('cap-meja-2')).toEqual(['buku', 'kursi', 'rumah'])
  })
})

describe('item-spine integration — translation_nl backfill (Task 9)', () => {
  it('refreshes translation_nl on existing row from l1_translation AND preserves pos', async () => {
    // Simulate an existing item with stale (null) translation_nl but a valid pos.
    // The column-restricted upsert must populate translation_nl WITHOUT nulling pos.
    const EXISTING_BUKU_ID = 'pre-existing-buku'
    const { client, state } = buildIntegrationMock({
      learningItems: new Map<string, LearningItemState>([
        [
          'buku',
          {
            id: EXISTING_BUKU_ID,
            normalized_text: 'buku',
            translation_nl: null, // stale — backfill target
            pos: 'noun',          // DB-authoritative; must be preserved
          },
        ],
      ]),
    })

    await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS_SINGLE,
        itemState: {
          existingItemsByNormalizedText: new Map([
            ['buku', { id: EXISTING_BUKU_ID, normalized_text: 'buku' }],
          ]),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      CURATED_GENERATE_BUKU_ONLY,
      /* singleItem */ true,
    )

    // translation_nl now populated from l1_translation
    const buku = state.learningItems.get('buku')
    expect(buku?.translation_nl).toBe('boek')

    // pos was preserved (column-restricted UPDATE does not touch pos)
    expect(buku?.pos).toBe('noun')

    // The row id did not change (same row updated, not replaced)
    expect(buku?.id).toBe(EXISTING_BUKU_ID)
  })

  it('refreshes translation_nl on an existing row with a stale value (non-null but wrong)', async () => {
    const { client, state } = buildIntegrationMock({
      learningItems: new Map<string, LearningItemState>([
        [
          'buku',
          {
            id: 'buku-old',
            normalized_text: 'buku',
            translation_nl: 'STALE_VALUE', // wrong translation — should be refreshed
            pos: 'noun',
          },
        ],
      ]),
    })

    await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS_SINGLE,
        itemState: {
          existingItemsByNormalizedText: new Map([
            ['buku', { id: 'buku-old', normalized_text: 'buku' }],
          ]),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      CURATED_GENERATE_BUKU_ONLY,
      /* singleItem */ true,
    )

    expect(state.learningItems.get('buku')?.translation_nl).toBe('boek')
    expect(state.learningItems.get('buku')?.pos).toBe('noun') // preserved
  })
})

describe('item-spine integration — CS14–17 gate', () => {
  it('CS14 warning emitted for null-pos items from typed rows (projectItemsFromTypedRows has no pos)', async () => {
    // projectItemsFromTypedRows emits pos: null because TypedItemRow has no pos column.
    // CS14 validator flags each word/phrase item without pos as a warning.
    const { client } = buildIntegrationMock()

    const result = await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      async () => '[]', // no distractors needed for this assertion
    )

    const cs14Findings = result.findings.filter((f) => f.gate === 'CS14')
    expect(cs14Findings.length).toBeGreaterThan(0)
    expect(cs14Findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('CS15 warning emitted when no distractors generated', async () => {
    // Every item cap lacks distractor rows when generateFn returns empty.
    const { client } = buildIntegrationMock()

    const result = await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      async () => '[]',
    )

    const cs15Findings = result.findings.filter((f) => f.gate === 'CS15')
    expect(cs15Findings.length).toBeGreaterThan(0)
    expect(cs15Findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('CS16 error emitted for distractor equal to the answer', async () => {
    // 'buku' as a cued_recall distractor for 'buku' violates "no-answer" rule.
    const { client } = buildIntegrationMock()

    const result = await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS_SINGLE,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      async () =>
        JSON.stringify([
          {
            source_item_ref: 'buku',
            recognition_distractors_nl: ['stoel', 'pen', 'huis'],
            cued_recall_distractors_id: ['buku', 'kursi', 'rumah'], // buku == answer
            cloze_distractors_id: ['meja', 'kursi', 'rumah'],
          },
        ]),
      /* singleItem */ true,
    )

    const cs16Findings = result.findings.filter((f) => f.gate === 'CS16')
    expect(cs16Findings.length).toBeGreaterThan(0)
    expect(cs16Findings.some((f) => f.severity === 'error')).toBe(true)
    expect(cs16Findings.some((f) => f.message.includes('equals the answer'))).toBe(true)
  })

  it('CS17 produces no errors in a clean single-lesson scenario (no cross-lesson duplicates)', async () => {
    // All written items share the same lesson_id — no duplicates across lessons.
    const { client } = buildIntegrationMock()

    const result = await runStage(
      {},
      client,
      async () => ({
        items: TYPED_ROWS,
        itemState: {
          existingItemsByNormalizedText: new Map(),
          existingItemCapsByCanonicalKey: new Map(),
        },
      }),
      tmpDir,
      async () => '[]',
    )

    const cs17Errors = result.findings.filter((f) => f.gate === 'CS17' && f.severity === 'error')
    expect(cs17Errors).toHaveLength(0)
  })
})
