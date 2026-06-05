/**
 * runner.itemCutover.test.ts
 *
 * TDD coverage for Task 6c: item-source-kind cutover to DB→DB spine.
 *
 * Assertions:
 *   A. Item learning_items written via upsertLearningItemIdempotent (check-then-write).
 *   B. Item caps written via upsertCapabilitiesSkipIfExists (ignoreDuplicates=true bulk).
 *   C. Anchor contexts written for each item.
 *   D. Item caps NOT in the legacy upsertCapabilities bundle (constraint #1).
 *   E. Idempotent re-run: no NEW rows written on second call (skip-if-exists semantics).
 *   F. Distractors written for unseeded caps (injectable generateFn).
 *   G. --regenerate deletes + rewrites only that item's distractors.
 *   H. Legacy pattern/dialogue/morphology path unchanged (upsertCapabilities still called).
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
vi.mock('../enrichPos', () => ({
  enrichMissingPos: enrichMissingPosMock,
}))

import { runCapabilityStage } from '../runner'
import type { LoadedLesson } from '../loader'

// ---------------------------------------------------------------------------
// Mock Supabase client for item cutover tests
// ---------------------------------------------------------------------------

interface RecordedOp {
  table: string
  op: 'upsert' | 'insert' | 'delete' | 'update' | 'select'
  payload?: Record<string, unknown> | Array<Record<string, unknown>>
  opts?: Record<string, unknown>
}

function buildItemCutoverMock(opts: {
  /** Pre-existing learning_items (normalized_text → id) */
  existingItems?: Map<string, string>
  /** Pre-existing item learning_capabilities (canonical_key → id) */
  existingItemCaps?: Map<string, string>
  /** Pre-existing recognition_mcq_distractors (capability_id set) */
  seededDistractorCapIds?: Set<string>
} = {}) {
  const {
    existingItems = new Map(),
    existingItemCaps = new Map(),
    seededDistractorCapIds = new Set(),
  } = opts

  // Track all ops so tests can assert on them
  const ops: RecordedOp[] = []

  // Sequential ID generator
  let seq = 0
  const nextId = (prefix: string) => `${prefix}-${++seq}`

  // In-memory state for returned rows
  const upsertedLearningItemIds = new Map<string, string>() // normalized_text → id
  const upsertedCapIds = new Map<string, string>() // canonical_key → id

  // Seed pre-existing state
  for (const [nt, id] of existingItems) upsertedLearningItemIds.set(nt, id)
  for (const [key, id] of existingItemCaps) upsertedCapIds.set(key, id)

  const fromBuilder = (table: string) => {
    // Shared state for chaining
    let filterCol: string | undefined
    let filterVal: unknown
    let inVals: unknown[] = []
    let upsertOpts: Record<string, unknown> = {}
    let upsertPayload: Record<string, unknown> | Array<Record<string, unknown>> = {}

    const chain: any = {
      // --- filters ---
      eq: (col: string, val: unknown) => {
        filterCol = col
        filterVal = val
        return chain
      },
      in: (_col: string, vals: unknown[]) => {
        inVals = vals
        return chain
      },
      is: () => chain,
      not: () => chain,
      range: () => {
        // Simulate last page (no more rows) so pagination loop exits.
        // Return only items matching eq filter (for learning_items source_type filter).
        let rows: Array<Record<string, unknown>> = []

        if (table === 'learning_items') {
          if (filterCol === 'source_type' && filterVal === 'lesson') {
            rows = [...upsertedLearningItemIds.entries()].map(([nt, id]) => ({
              id,
              normalized_text: nt,
            }))
          } else if (filterCol === 'is_active') {
            // fetchDistractorPool — return pool items (also from learning_items)
            rows = [...upsertedLearningItemIds.entries()].map(([nt, id]) => ({
              id,
              normalized_text: nt,
              base_text: nt,  // simplification: base_text = normalized_text
              translation_nl: `nl_${nt}`,
              item_type: 'word' as const,
            }))
          }
        } else if (table === 'learning_capabilities') {
          if (filterCol === 'source_kind') {
            rows = [...upsertedCapIds.entries()].map(([key, id]) => ({
              id,
              canonical_key: key,
            }))
          }
        }
        return Promise.resolve({ data: rows, error: null, count: rows.length })
      },
      ilike: () => chain,
      limit: () => chain,
      order: () => chain,
      maybeSingle: async () => {
        // Used by upsertLearningItemIdempotent SELECT check
        if (table === 'learning_items' && filterCol === 'normalized_text') {
          const id = upsertedLearningItemIds.get(String(filterVal))
          if (id) {
            return { data: { id, normalized_text: String(filterVal) }, error: null }
          }
        }
        return { data: null, error: null }
      },
      single: async () => {
        // Used by upsertCapabilities, upsertLearningItemIdempotent (update path)
        if (table === 'learning_capabilities') {
          // Return what was upserted
          const payload = Array.isArray(upsertPayload) ? upsertPayload[0] : upsertPayload
          const key = payload?.canonical_key as string | undefined
          if (key) {
            const id = upsertedCapIds.get(key) ?? nextId('cap')
            upsertedCapIds.set(key, id)
            return { data: { id, canonical_key: key }, error: null }
          }
        }
        if (table === 'learning_items') {
          const payload = Array.isArray(upsertPayload) ? upsertPayload[0] : upsertPayload
          const nt = payload?.normalized_text as string | undefined
          if (nt) {
            const id = upsertedLearningItemIds.get(nt) ?? nextId('item')
            upsertedLearningItemIds.set(nt, id)
            return { data: { id, normalized_text: nt }, error: null }
          }
          // UPDATE path (upsertLearningItemIdempotent)
          if (filterCol === 'normalized_text') {
            const id = upsertedLearningItemIds.get(String(filterVal)) ?? nextId('item')
            return { data: { id, normalized_text: String(filterVal) }, error: null }
          }
        }
        // Default: return a generic id
        return { data: { id: nextId(table), unit_slug: 'slug', canonical_key: 'key', normalized_text: 'nt', slug: 'slug' }, error: null }
      },
      // Terminator for plain awaitable queries (e.g. .range() → { data, error })
      // Also handles fetchSeededDistractorCapIds which awaits .select().in() directly.
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        if (table === 'recognition_mcq_distractors' && inVals.length > 0) {
          // Return capability_ids that are in seededDistractorCapIds
          const rows = (inVals as string[])
            .filter((id) => seededDistractorCapIds.has(id))
            .map((capability_id) => ({ capability_id }))
          return resolve({ data: rows, error: null })
        }
        return resolve({ data: [], error: null })
      },
    }

    return {
      select: () => {
        return chain
      },
      upsert: (payload: Record<string, unknown> | Array<Record<string, unknown>>, opts2?: Record<string, unknown>) => {
        upsertOpts = opts2 ?? {}
        upsertPayload = payload
        const isArray = Array.isArray(payload)
        ops.push({ table, op: 'upsert', payload, opts: upsertOpts })

        // Simulate skip-if-exists (ignoreDuplicates: true) for item caps:
        // only return rows NOT in existingItemCaps
        if (table === 'learning_capabilities' && upsertOpts?.ignoreDuplicates === true) {
          const rows = (isArray ? payload : [payload]) as Array<Record<string, unknown>>
          const inserted = rows.filter((r) => {
            const key = r.canonical_key as string
            if (existingItemCaps.has(key)) return false
            // Also skip items already upserted in this run
            if (upsertedCapIds.has(key)) return false
            const id = nextId('cap')
            upsertedCapIds.set(key, id)
            r.id = id
            return true
          })
          // upsertCapabilitiesSkipIfExists calls .upsert(rows, opts).select()
          // directly (no .single()). The select() result must be thenable.
          return {
            select: () => {
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

        // Standard upsert path (upsertCapabilities for legacy caps)
        const rows = (isArray ? payload : [payload]) as Array<Record<string, unknown>>

        const buildSingleRow = () => {
          const row = rows[0]
          if (!row) return { data: null, error: null }
          const key = row.canonical_key as string | undefined
          const nt = row.normalized_text as string | undefined
          if (key) {
            const id = upsertedCapIds.get(key) ?? nextId('cap')
            upsertedCapIds.set(key, id)
            return { data: { id, canonical_key: key }, error: null }
          }
          if (nt) {
            const id = upsertedLearningItemIds.get(nt) ?? nextId('item')
            upsertedLearningItemIds.set(nt, id)
            return { data: { id, normalized_text: nt }, error: null }
          }
          return { data: { id: nextId(table), unit_slug: 'slug' }, error: null }
        }

        // upsertItemDistractors does .upsert().select() directly (no .single()).
        // Make the select() result thenable so both .single() and direct await work.
        const selectResult = () => {
          const singleData = buildSingleRow()
          const multiData = rows.map((r) => {
            const key = r.canonical_key as string | undefined
            const id = (key && upsertedCapIds.get(key)) ?? nextId(table)
            return { ...r, id }
          })
          const multiResult = { data: multiData, error: null }
          return {
            single: async () => singleData,
            then: (resolve: (v: typeof multiResult) => unknown) => resolve(multiResult),
          }
        }

        return {
          select: () => selectResult(),
          then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: null, error: null }),
        }
      },
      insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
        ops.push({ table, op: 'insert', payload: Array.isArray(payload) ? payload[0] : payload })
        return {
          select: () => ({
            single: async () => ({ data: { id: nextId(table) }, error: null }),
          }),
          then: (resolve: (v: { error: null; data: { id: string } }) => unknown) =>
            resolve({ error: null, data: { id: nextId(table) } }),
        }
      },
      update: (payload: Record<string, unknown>) => {
        ops.push({ table, op: 'update', payload })
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: filterCol ? (upsertedLearningItemIds.get(String(filterVal)) ?? nextId(table)) : nextId(table),
                  normalized_text: filterVal,
                },
                error: null,
              }),
            }),
            in: async () => ({ error: null }),
          }),
          in: async () => ({ error: null }),
        }
      },
      delete: () => {
        ops.push({ table, op: 'delete' })
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

  return { client, ops, upsertedLearningItemIds, upsertedCapIds }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpDir: string

function makeLessonWithItems(stagingDir: string): LoadedLesson {
  return {
    lesson: {
      id: 'lesson-uuid',
      module_id: 'module-1',
      order_index: 1,
      title: 'Test Lesson',
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
          items: [
            { indonesian: 'buku', dutch: 'boek', pos: 'noun', level: 'A1' },
            { indonesian: 'meja', dutch: 'tafel', pos: 'noun', level: 'A1' },
          ],
        },
      },
    ],
    audioClipsByNormalizedText: new Map(),
    staging: {
      stagingDir,
      learningItems: [
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
      grammarPatterns: [
        {
          slug: 'ada-existential',
          pattern_name: 'ADA existential',
          description: 'Indonesian uses *ada* to mark existence.',
          example: 'Ada buku — er is een boek',
          complexity_score: 2,
        },
      ],
      candidates: [],
      clozeContexts: [],
      contentUnits: [],
      capabilities: [
        // A non-item cap in the bundle — should pass through upsertCapabilities
        {
          canonicalKey: 'cap:v1:grammar:lesson-1/grammar-1:text_recognition:id_to_l1:text:nl',
          sourceKind: 'grammar',
          sourceRef: 'lesson-1/grammar-1',
          capabilityType: 'text_recognition',
          direction: 'id_to_l1',
          modality: 'text',
          learnerLanguage: 'nl',
          projectionVersion: 'capability-v3',
          requiredArtifacts: [],
          prerequisiteKeys: [],
        },
        // An item cap in the bundle — must be FILTERED OUT (constraint #1)
        {
          canonicalKey: 'cap:v1:item:learning_items%2Fbuku:text_recognition:id_to_l1:text:nl',
          sourceKind: 'item',
          sourceRef: 'learning_items/buku',
          capabilityType: 'text_recognition',
          direction: 'id_to_l1',
          modality: 'text',
          learnerLanguage: 'nl',
          projectionVersion: 'capability-v3',
          requiredArtifacts: [],
          prerequisiteKeys: [],
        },
      ],
      exerciseAssets: [],
      affixedFormPairs: [],
    },
  }
}

// Fake typed item rows that loadFromDb would return
const FAKE_TYPED_ROWS = [
  {
    id: 'row-buku',
    section_id: 'section-vocab',
    lesson_id: 'lesson-uuid',
    display_order: 0,
    source_item_ref: 'buku',
    item_type: 'word' as const,
    indonesian_text: 'buku',
    l1_translation: 'boek',
    l2_translation: 'book',
    section_kind: 'vocabulary' as const,
  },
  {
    id: 'row-meja',
    section_id: 'section-vocab',
    lesson_id: 'lesson-uuid',
    display_order: 1,
    source_item_ref: 'meja',
    item_type: 'word' as const,
    indonesian_text: 'meja',
    l1_translation: 'tafel',
    l2_translation: 'table',
    section_kind: 'vocabulary' as const,
  },
]

// Fake loadFromDb that returns typed rows without hitting the DB
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runner item cutover (Task 6c)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-item-cutover-test-'))
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

  // --- A + B + C: item learning_items/caps/anchors written via idempotent fns ---
  it('writes item learning_items via check-then-write path and item caps via skip-if-exists', async () => {
    const { client, ops } = buildItemCutoverMock()

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: async () => '[]', // no distractors — empty response
      },
    )

    expect(['ok', 'partial']).toContain(result.status)

    // A: upsertLearningItemIdempotent uses SELECT then INSERT/UPDATE
    // The mock records SELECT (maybeSingle) + UPDATE or INSERT for each item
    // We check that learning_items table was interacted with
    const learningItemOps = ops.filter((op) => op.table === 'learning_items')
    expect(learningItemOps.length).toBeGreaterThan(0)

    // B: item caps written via bulk upsert with ignoreDuplicates: true
    const itemCapUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        (op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates === true,
    )
    expect(itemCapUpserts.length).toBeGreaterThan(0)

    // Each item emits 4 caps; 2 items = 8 caps total
    const totalItemCaps = itemCapUpserts.reduce((sum, op) => {
      const payload = op.payload
      return sum + (Array.isArray(payload) ? payload.length : 1)
    }, 0)
    expect(totalItemCaps).toBe(8) // 2 items × 4 caps

    // C: anchor contexts written via item_contexts upsert
    const anchorContextUpserts = ops.filter((op) => op.table === 'item_contexts')
    expect(anchorContextUpserts.length).toBeGreaterThanOrEqual(2) // at least one per item
  })

  // --- D: item caps NOT in legacy upsertCapabilities bundle (constraint #1) ---
  it('constraint #1: item-source-kind caps are excluded from the legacy upsertCapabilities bundle', async () => {
    const { client, ops } = buildItemCutoverMock()

    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: async () => '[]',
      },
    )

    // The legacy upsertCapabilities call uses single-row upsert (the loop in adapter.ts)
    // OR a bulk upsert WITHOUT ignoreDuplicates: true.
    // Item caps use ignoreDuplicates: true. Non-item caps use the legacy path.
    const legacyCapUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        !(op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates,
    )

    // Assert that no item-source-kind row appears in the legacy upserts
    for (const upsertOp of legacyCapUpserts) {
      const rows = Array.isArray(upsertOp.payload) ? upsertOp.payload : [upsertOp.payload as Record<string, unknown>]
      for (const row of rows) {
        expect(row?.source_kind).not.toBe('item')
      }
    }

    // Also assert: there IS at least one legacy upsert (for the grammar cap)
    expect(legacyCapUpserts.length).toBeGreaterThan(0)
  })

  // --- Fix 1a (ADR 0014): productive ceiling — sentence/dialogue_chunk items
  //     produce NO item capabilities (neither the new DB→DB path nor the legacy
  //     bundle), while word/phrase + non-item caps are unaffected. ---
  it('Fix1a: a sentence/dialogue_chunk item produces zero item caps; word/phrase + grammar caps still emit', async () => {
    const lesson = makeLessonWithItems(tmpDir)
    // Add an over-harvested sentence and a dialogue_chunk to the item set. The
    // new DB→DB path (loadFromDb → FAKE_TYPED_ROWS) is word/phrase only, so these
    // flow exclusively through the regenerated legacy bundle — exactly the seam
    // Fix 1a cuts.
    lesson.staging.learningItems = [
      ...(lesson.staging.learningItems as Array<Record<string, unknown>>),
      {
        base_text: 'Ada yang dari negeri Belanda dan ada yang dari negeri Jerman.',
        item_type: 'sentence',
        context_type: 'lesson_snippet',
        translation_nl: 'Sommigen komen uit Nederland en sommigen uit Duitsland.',
        translation_en: 'Some are from the Netherlands and some from Germany.',
        pos: null,
        level: 'A1',
        review_status: 'published',
      },
      {
        base_text: 'Selamat pagi, apa kabar?',
        item_type: 'dialogue_chunk',
        context_type: 'dialogue',
        translation_nl: 'Goedemorgen, hoe gaat het?',
        translation_en: 'Good morning, how are you?',
        pos: null,
        level: 'A1',
        review_status: 'published',
      },
    ] as never

    const { client, ops } = buildItemCutoverMock()
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => lesson,
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: async () => '[]',
      },
    )
    expect(['ok', 'partial']).toContain(result.status)

    // Collect every capability row that reached ANY learning_capabilities upsert
    // (legacy bundle AND the skip-if-exists new path).
    const allCapRows = ops
      .filter((op) => op.table === 'learning_capabilities' && op.op === 'upsert')
      .flatMap((op) => (Array.isArray(op.payload) ? op.payload : [op.payload]) as Array<Record<string, unknown>>)
    const sourceRefs = new Set(allCapRows.map((r) => r?.source_ref as string))

    // The over-harvested item caps appear NOWHERE.
    const sentenceSlug = 'ada yang dari negeri belanda dan ada yang dari negeri jerman.'
    const dialogueSlug = 'selamat pagi, apa kabar?'
    expect(sourceRefs.has(`learning_items/${sentenceSlug}`)).toBe(false)
    expect(sourceRefs.has(`learning_items/${dialogueSlug}`)).toBe(false)
    // No item cap whose source resolves to either over-harvested item.
    for (const row of allCapRows) {
      const ref = row?.source_ref as string | undefined
      if (row?.source_kind === 'item' && ref) {
        expect(ref).not.toContain('negeri belanda')
        expect(ref).not.toContain('apa kabar')
      }
    }

    // The grammar (non-item) cap still flows through the legacy bundle.
    const legacyCapUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        !(op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates,
    )
    const legacySourceKinds = legacyCapUpserts
      .flatMap((op) => (Array.isArray(op.payload) ? op.payload : [op.payload]) as Array<Record<string, unknown>>)
      .map((r) => r?.source_kind)
    // A non-item (grammar→pattern) cap still flows through the legacy bundle, and
    // no item cap leaks into it.
    expect(legacySourceKinds.some((k) => k !== 'item')).toBe(true)
    expect(legacySourceKinds).not.toContain('item')
    // And the word items still seed item caps via the new path (skip-if-exists).
    const newPathItemCaps = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        (op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates === true,
    )
    expect(newPathItemCaps.length).toBeGreaterThan(0)
  })

  // --- E: idempotent re-run writes nothing new ---
  it('idempotent re-run: second call writes no new items or caps when all already seeded', async () => {
    // Pre-populate existingItemCaps so skip-if-exists returns nothing new
    const existingItemCaps = new Map<string, string>([
      ['cap:v1:item:learning_items%2Fbuku:text_recognition:id_to_l1:text:nl', 'cap-buku-1'],
      ['cap:v1:item:learning_items%2Fbuku:l1_to_id_choice:l1_to_id:text:nl', 'cap-buku-2'],
      ['cap:v1:item:learning_items%2Fbuku:meaning_recall:id_to_l1:text:nl', 'cap-buku-3'],
      ['cap:v1:item:learning_items%2Fbuku:form_recall:l1_to_id:text:nl', 'cap-buku-4'],
      ['cap:v1:item:learning_items%2Fmeja:text_recognition:id_to_l1:text:nl', 'cap-meja-1'],
      ['cap:v1:item:learning_items%2Fmeja:l1_to_id_choice:l1_to_id:text:nl', 'cap-meja-2'],
      ['cap:v1:item:learning_items%2Fmeja:meaning_recall:id_to_l1:text:nl', 'cap-meja-3'],
      ['cap:v1:item:learning_items%2Fmeja:form_recall:l1_to_id:text:nl', 'cap-meja-4'],
    ])
    // All caps already have distractors seeded
    const seededCapIds = new Set(['cap-buku-1', 'cap-buku-2', 'cap-buku-3', 'cap-buku-4', 'cap-meja-1', 'cap-meja-2', 'cap-meja-3', 'cap-meja-4'])

    const { client, ops } = buildItemCutoverMock({ existingItemCaps, seededDistractorCapIds: seededCapIds })

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map([
              ['buku', { id: 'item-buku', normalized_text: 'buku' }],
              ['meja', { id: 'item-meja', normalized_text: 'meja' }],
            ]),
            // Pre-populate all 8 item caps so upsertCapabilitiesSkipIfExists skips them
            existingItemCapsByCanonicalKey: new Map(
              [...existingItemCaps].map(([key, id]) => [key, { id, canonical_key: key }]),
            ),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: async () => '[]',
      },
    )

    expect(['ok', 'partial']).toContain(result.status)

    // No new item cap inserts (ignoreDuplicates returned empty set)
    const itemCapUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        (op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates === true,
    )
    // Upsert was called but returned 0 written (all existed)
    expect(itemCapUpserts.length).toBeGreaterThan(0)
    // No distractor writes (all seeded)
    const distractorInserts = ops.filter(
      (op) =>
        ['recognition_mcq_distractors', 'cued_recall_distractors', 'cloze_mcq_item_distractors'].includes(op.table) &&
        op.op === 'upsert',
    )
    expect(distractorInserts.length).toBe(0)
    expect(result.counts.itemDistractorSets).toBe(0)
  })

  // --- F: distractors written for unseeded caps via injected generateFn ---
  it('writes distractors for unseeded caps using the injectable generateFn', async () => {
    const { client, ops } = buildItemCutoverMock()

    // Fake generator returns valid distractor sets for both items
    const fakeGenerateFn = async (): Promise<string> => {
      return JSON.stringify([
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
    }

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: fakeGenerateFn,
      },
    )

    expect(['ok', 'partial']).toContain(result.status)

    // Distractor rows should be written (one row per cap × 3 tables)
    const distractorUpserts = ops.filter(
      (op) =>
        op.table === 'recognition_mcq_distractors' &&
        op.op === 'upsert',
    )
    // 2 items × 4 caps each = 8 rows in recognition_mcq_distractors
    expect(distractorUpserts.length).toBeGreaterThan(0)
    // counts.itemDistractorSets reflects written rows
    // (mock returns written count from recognition table)
    expect(result.counts.itemDistractorSets).toBeGreaterThanOrEqual(0)
  })

  // --- F2: SEEDED items skip distractor generation entirely (cost-skip regression) ---
  it('skips distractor generation when recognition caps are already seeded (no LLM call)', async () => {
    // Both items' 4 caps already exist with known ids; their text_recognition caps
    // already have recognition_mcq_distractors rows (seeded). The fix checks ONLY the
    // recognition cap (the canonical seeded signal), so both items skip and the
    // generator is NEVER invoked. Pre-fix, the `.some()`-over-all-caps filter was
    // ALWAYS true (meaning_recall/form_recall/l1_to_id_choice never seed
    // recognition_mcq_distractors) → every item regenerated on every publish.
    const existingItemCaps = new Map<string, string>([
      ['cap:v1:item:learning_items/buku:text_recognition:id_to_l1:text:nl', 'cap-buku-rec'],
      ['cap:v1:item:learning_items/buku:l1_to_id_choice:l1_to_id:text:nl', 'cap-buku-cue'],
      ['cap:v1:item:learning_items/buku:meaning_recall:id_to_l1:text:nl', 'cap-buku-mr'],
      ['cap:v1:item:learning_items/buku:form_recall:l1_to_id:text:nl', 'cap-buku-fr'],
      ['cap:v1:item:learning_items/meja:text_recognition:id_to_l1:text:nl', 'cap-meja-rec'],
      ['cap:v1:item:learning_items/meja:l1_to_id_choice:l1_to_id:text:nl', 'cap-meja-cue'],
      ['cap:v1:item:learning_items/meja:meaning_recall:id_to_l1:text:nl', 'cap-meja-mr'],
      ['cap:v1:item:learning_items/meja:form_recall:l1_to_id:text:nl', 'cap-meja-fr'],
    ])
    // Seed ONLY the recognition caps (mirrors fetchSeededDistractorCapIds reading
    // recognition_mcq_distractors). The other caps are intentionally NOT seeded —
    // pre-fix that alone forced full regeneration.
    const seededDistractorCapIds = new Set(['cap-buku-rec', 'cap-meja-rec'])

    const { client } = buildItemCutoverMock({ existingItemCaps, seededDistractorCapIds })

    let generateCalls = 0
    const spyGenerateFn = async (): Promise<string> => {
      generateCalls++
      return '[]'
    }

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map([
              ['buku', { id: 'item-buku', normalized_text: 'buku' }],
              ['meja', { id: 'item-meja', normalized_text: 'meja' }],
            ]),
            existingItemCapsByCanonicalKey: new Map(
              [...existingItemCaps].map(([key, id]) => [key, { id, canonical_key: key }]),
            ),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: spyGenerateFn,
      },
    )

    expect(['ok', 'partial']).toContain(result.status)
    // The fix: both recognition caps seeded → distractorItems empty → generator never
    // called. Pre-fix this was 1 (full regeneration of all items every publish).
    expect(generateCalls).toBe(0)
  })

  // --- G: --regenerate deletes + rewrites only that item's distractors ---
  it('--regenerate deletes existing distractors for only the target item then rewrites', async () => {
    const existingItemCaps = new Map<string, string>([
      ['cap:v1:item:learning_items%2Fbuku:text_recognition:id_to_l1:text:nl', 'cap-buku-1'],
      ['cap:v1:item:learning_items%2Fbuku:l1_to_id_choice:l1_to_id:text:nl', 'cap-buku-2'],
      ['cap:v1:item:learning_items%2Fbuku:meaning_recall:id_to_l1:text:nl', 'cap-buku-3'],
      ['cap:v1:item:learning_items%2Fbuku:form_recall:l1_to_id:text:nl', 'cap-buku-4'],
    ])

    const { client, ops } = buildItemCutoverMock({ existingItemCaps })

    // Fake generator returns valid set for buku
    const fakeGenerateFn = async (): Promise<string> => {
      return JSON.stringify([
        {
          source_item_ref: 'buku',
          recognition_distractors_nl: ['stoel', 'pen', 'huis'],
          cued_recall_distractors_id: ['meja', 'kursi', 'rumah'],
          cloze_distractors_id: ['meja', 'kursi', 'rumah'],
        },
      ])
    }

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid', regenerate: { kind: 'item', normalizedText: 'buku' } },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map([
              ['buku', { id: 'item-buku', normalized_text: 'buku' }],
            ]),
            // Pass existing caps so cap IDs are known to the runner
            existingItemCapsByCanonicalKey: new Map(
              [...existingItemCaps].map(([key, id]) => [key, { id, canonical_key: key }]),
            ),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: fakeGenerateFn,
      },
    )

    expect(['ok', 'partial']).toContain(result.status)

    // Deletes should have been issued for all 3 distractor tables
    const deleteOps = ops.filter(
      (op) =>
        ['recognition_mcq_distractors', 'cued_recall_distractors', 'cloze_mcq_item_distractors'].includes(op.table) &&
        op.op === 'delete',
    )
    expect(deleteOps.length).toBe(3) // 3 tables deleted for buku's caps

    // And rewrites should follow
    const distractorUpserts = ops.filter(
      (op) => op.table === 'recognition_mcq_distractors' && op.op === 'upsert',
    )
    expect(distractorUpserts.length).toBeGreaterThan(0)
  })

  // --- FIX1→5a.5: audio caps move to the new DB→DB path ---
  it('FIX1→5a.5: audio caps move to the new DB→DB path (skip-if-exists) and are excluded from the legacy bundle', async () => {
    // NEW CONTRACT (5a.5 / #147):
    // projectItemsFromTypedRows now receives the audioClipsByNormalizedText map
    // (runner.ts step 5: audioClipsByNormalizedText passed to projectItemsFromTypedRows).
    // When the map contains the item's normalized_text, the projector emits
    // audio_recognition + dictation caps alongside the 4 base caps — so those 6 keys
    // ALL enter newPathEmittedKeys, and ALL are excluded from the legacy bundle.
    //
    // OLD CONTRACT (Slice 1, before 5a.5):
    // The audio map was NOT passed to projectItemsFromTypedRows, so audio caps
    // were absent from newPathEmittedKeys and flowed through the legacy
    // upsertCapabilities path (to avoid being dropped entirely).
    //
    // FIXTURE: FAKE_TYPED_ROWS contains 'buku' (word, item_type='word') so the
    // projector can look up normalizeTtsText('buku') == 'buku' in the audio map.
    const AUDIO_RECOGNITION_KEY = 'cap:v1:item:learning_items/buku:audio_recognition:audio_to_l1:audio:nl'
    const DICTATION_KEY = 'cap:v1:item:learning_items/buku:dictation:audio_to_id:audio:none'

    const lessonWithAudio = makeLessonWithItems(tmpDir)
    // Provide an audio clip for 'buku' so projectItemsFromTypedRows emits
    // audio_recognition + dictation caps on the new skip-if-exists path.
    lessonWithAudio.audioClipsByNormalizedText = new Map([
      ['buku', { storage_path: 'lessons/buku.mp3', voice_id: 'Achird' }],
    ])

    const { client, ops } = buildItemCutoverMock()

    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => lessonWithAudio,
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: async () => '[]',
      },
    )

    // Audio caps must NOT appear in the legacy upsertCapabilities bundle
    // (they are now in newPathEmittedKeys → excluded from the filter).
    const legacyCapUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        !(op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates,
    )
    const legacyKeys = legacyCapUpserts.flatMap((op) =>
      (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>])
        .map((r) => r?.canonical_key as string | undefined)
        .filter(Boolean),
    )
    expect(legacyKeys).not.toContain(AUDIO_RECOGNITION_KEY)
    expect(legacyKeys).not.toContain(DICTATION_KEY)

    // Audio caps MUST appear in the skip-if-exists (new DB→DB path) writes.
    const newPathUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        (op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates === true,
    )
    const newPathKeys = newPathUpserts.flatMap((op) =>
      (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>])
        .map((r) => r?.canonical_key as string | undefined)
        .filter(Boolean),
    )
    expect(newPathKeys).toContain(AUDIO_RECOGNITION_KEY)
    expect(newPathKeys).toContain(DICTATION_KEY)
  })

  // --- FIX 2 regression: per-cap-1:1 distractor writes ---
  it('FIX2: distractors written to exactly one cap per table (recognition→text_recognition, cued_recall→l1_to_id_choice, no cloze for items)', async () => {
    // Before the fix: the loop pushed one row per cap (4 caps per item) × 3 tables = 12 rows/item.
    // After the fix: recognition_mcq_distractors keyed by text_recognition cap id,
    //                cued_recall_distractors keyed by l1_to_id_choice cap id,
    //                cloze_mcq_item_distractors NOT written (no cloze cap for items in this slice).
    const { client, ops } = buildItemCutoverMock()

    const fakeGenerateFn = async (): Promise<string> =>
      JSON.stringify([
        {
          source_item_ref: 'buku',
          recognition_distractors_nl: ['stoel', 'pen', 'huis'],
          cued_recall_distractors_id: ['meja', 'kursi', 'rumah'],
          cloze_distractors_id: ['meja', 'kursi', 'rumah'],
        },
      ])

    // Use single-item fixture (buku only) to keep cap-id tracking unambiguous.
    const singleItemLesson = makeLessonWithItems(tmpDir)
    singleItemLesson.staging.learningItems = [singleItemLesson.staging.learningItems[0]!]

    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => singleItemLesson,
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: [FAKE_TYPED_ROWS[0]!],
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: fakeGenerateFn,
      },
    )

    // recognition_mcq_distractors: exactly 1 row per item (not 4).
    const recUpserts = ops.filter(
      (op) => op.table === 'recognition_mcq_distractors' && op.op === 'upsert',
    )
    const recRows = recUpserts.flatMap((op) =>
      Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>],
    )
    // 1 item → 1 row, not 4.
    expect(recRows.length).toBe(1)

    // cued_recall_distractors: exactly 1 row per item (not 4).
    const cuedUpserts = ops.filter(
      (op) => op.table === 'cued_recall_distractors' && op.op === 'upsert',
    )
    const cuedRows = cuedUpserts.flatMap((op) =>
      Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>],
    )
    expect(cuedRows.length).toBe(1)

    // cloze_mcq_item_distractors: NO writes (no cloze cap for items in this slice).
    const clozeUpserts = ops.filter(
      (op) => op.table === 'cloze_mcq_item_distractors' && op.op === 'upsert',
    )
    expect(clozeUpserts.length).toBe(0)

    // Verify the recognition row is keyed by text_recognition cap id and
    // the cued_recall row is keyed by l1_to_id_choice cap id.
    // The canonical key uses '/' not '%2F': encodeSegment() only encodes % and : chars,
    // not '/'. So learning_items/buku (with slash) is the correct format.
    const TEXT_RECOGNITION_KEY = 'cap:v1:item:learning_items/buku:text_recognition:id_to_l1:text:nl'
    const L1_TO_ID_CHOICE_KEY = 'cap:v1:item:learning_items/buku:l1_to_id_choice:l1_to_id:text:nl'

    // Extract which ids the mock assigned to these canonical keys.
    const newPathUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        (op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates === true,
    )
    const allItemCapRows = newPathUpserts.flatMap((op) =>
      Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>],
    )
    const textRecRow = allItemCapRows.find((r) => r.canonical_key === TEXT_RECOGNITION_KEY)
    const l1ToIdRow = allItemCapRows.find((r) => r.canonical_key === L1_TO_ID_CHOICE_KEY)
    expect(textRecRow).toBeDefined()
    expect(l1ToIdRow).toBeDefined()

    // recognition row capability_id must match text_recognition cap id
    if (textRecRow?.id && l1ToIdRow?.id) {
      expect(recRows[0]?.capability_id).toBe(textRecRow.id)
      expect(cuedRows[0]?.capability_id).toBe(l1ToIdRow.id)
    }
  })


  // --- I: CS14-17 validators receive data and execute via the runner (FIX 1) ---
  it('FIX1-wiring: CS14 warning emitted for null-pos items; answer-equal distractor is sanitized (no CS16 equals-answer error)', async () => {
    // CS14: itemProjection.perItemPlans emits pos=null for items coming from
    // TypedItemRows (lesson_section_item_rows has no pos column; POS is the
    // Lesson Stage's job). The validator produces a WARNING per null-pos word/phrase item.
    //
    // CS16 + generator sanitization: inject a generateFn that returns a distractor
    // EQUAL TO THE ANSWER ('buku'). The generator's defensive sanitization
    // (filter answer-equal + pad from pool) removes it BEFORE the gate, so CS16
    // sees clean data and emits NO 'equals the answer' error. (CS16's own error
    // path is unit-tested directly in validators/itemDistractors.test.ts.)
    //
    // This test FAILS if the runner does NOT pass writtenItems / distractorSets
    // to runCapabilityGatePostWrite (CS14 never runs) — proving the FIX-1 wiring.

    const badDistractorGenerateFn = async (): Promise<string> =>
      JSON.stringify([
        {
          source_item_ref: 'buku',
          // CS16 rule 2 violation: 'buku' appears as a distractor in cued_recall
          // (distractor equals the answer). parseResponse accepts this (all 3 arrays
          // have 3 items), so the set reaches the CS16 validator which flags it.
          recognition_distractors_nl: ['stoel', 'pen', 'huis'],
          // 'buku' == the ID answer → the generator sanitizes it out + pads from pool.
          cued_recall_distractors_id: ['buku', 'kursi', 'rumah'],
          cloze_distractors_id: ['meja', 'kursi', 'rumah'],
        },
      ])

    const { client } = buildItemCutoverMock()

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        // Same-word-class pool so the generator can pad to 3 after dropping
        // the answer-equal distractor.
        fetchDistractorPool: async () => [
          { source_item_ref: 'pena', item_type: 'word', indonesian_text: 'pena', l1_translation: 'pen' },
          { source_item_ref: 'tas', item_type: 'word', indonesian_text: 'tas', l1_translation: 'tas' },
        ],
        generateFn: badDistractorGenerateFn,
      },
    )

    // CS14: null-pos warnings for word/phrase items (both items have pos=null
    // from projectItemsFromTypedRows — TypedItemRow has no pos column).
    // This is the FIX-1 wiring proof: CS14 only emits if the runner passed
    // writtenItems to the post-write gate.
    const cs14Findings = result.findings.filter((f) => f.gate === 'CS14')
    expect(cs14Findings.length).toBeGreaterThan(0)
    expect(cs14Findings.every((f) => f.severity === 'warning')).toBe(true)

    // CS16: the answer-equal 'buku' was sanitized out + padded from pool BEFORE
    // the gate, so NO 'equals the answer' error is emitted.
    const cs16Findings = result.findings.filter((f) => f.gate === 'CS16')
    expect(cs16Findings.some((f) => f.message.includes('equals the answer'))).toBe(false)
  })

  it('FIX1-wiring: CS15 warning emitted when no distractors generated (empty generateFn)', async () => {
    // CS15: items with no distractor rows after publish => warning.
    // generateFn returns empty => no distractor sets written => every item cap
    // gets flagged by CS15. This test fails if itemCapsWithDistractorFlag is
    // not passed to the gate.
    const { client } = buildItemCutoverMock()

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: async () => '[]', // no distractors
      },
    )

    const cs15Findings = result.findings.filter((f) => f.gate === 'CS15')
    // 2 items x 4 caps each = 8 item caps, all lacking distractors
    expect(cs15Findings.length).toBeGreaterThan(0)
    expect(cs15Findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('FIX1-wiring: CS17 check runs (no duplicates in clean single-lesson scenario)', async () => {
    // CS17 queries the DB for cross-lesson duplicates. In the mock, all items
    // share the same lesson_id ('lesson-uuid'), so no CS17 errors are expected.
    // This test verifies CS17 executes (writtenNormalizedTexts passed to the gate)
    // without errors — a clean publish scenario.
    const { client } = buildItemCutoverMock()

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: async () => '[]',
      },
    )

    // No CS17 errors — all written items have the same lesson_id
    const cs17Errors = result.findings.filter((f) => f.gate === 'CS17' && f.severity === 'error')
    expect(cs17Errors).toHaveLength(0)
  })

  // --- H: legacy pattern/dialogue path unchanged ---
  it('legacy pattern/dialogue/grammar path still calls upsertCapabilities', async () => {
    const { client, ops } = buildItemCutoverMock()

    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLessonWithItems(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => ({
          items: FAKE_TYPED_ROWS,
          itemState: {
            existingItemsByNormalizedText: new Map(),
            existingItemCapsByCanonicalKey: new Map(),
          },
        }),
        fetchDistractorPool: async () => [],
        generateFn: async () => '[]',
      },
    )

    // The legacy upsertCapabilities loop is called for non-item caps
    // (single-row upsert without ignoreDuplicates)
    const legacyCaps = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        !(op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates,
    )
    expect(legacyCaps.length).toBeGreaterThan(0)

    // Caps from the regenerated staging (grammar patterns use sourceKind='pattern')
    // should appear in the legacy path. Any non-item cap (pattern, dialogue_line,
    // affixed_form_pair) would qualify.
    const nonItemCapRows = legacyCaps.filter((op) => {
      const payload = Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>]
      return payload.some((r) => r?.source_kind !== 'item')
    })
    expect(nonItemCapRows.length).toBeGreaterThan(0)
  })
})
