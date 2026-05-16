// Service-level tests for capabilityContentService.resolveBlocks.
// Mocks Supabase's chained query API the same way the session-builder adapter test does.

import { describe, it, expect, vi } from 'vitest'
import { createCapabilityContentService, type CapabilityContentService } from '../capabilityContentService'
import type { SessionBlock } from '@/lib/session-builder'
import { buildCanonicalKey } from '@/lib/capabilities/canonicalKey'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

// ─── Mock plumbing ───
//
// URL-budget guard: every .in(column, ids) call in this test suite is checked
// against Kong's 8 KB request-line buffer. Any unbounded IN that would overflow
// in production fails the test here, regardless of whether the caller is the
// distractor-pool path or something added later. The check is unconditional —
// new tests don't need to opt in.

const KONG_REQUEST_LINE_LIMIT_BYTES = 8 * 1024

function assertUrlBudget(table: string, column: string, ids: readonly unknown[]): void {
  // Mirrors how supabase-js + PostgREST encode .in() into a query string:
  //   /rest/v1/{table}?select=*&{column}=in.(id1,id2,...)
  // Commas/parens/colons get percent-encoded, so each id contributes its
  // own length plus a worst-case 3-byte separator overhead. The constant
  // prefix covers `/rest/v1/{table}?select=*&{column}=in.(...)` plus headroom.
  const URL_PREFIX_BYTES = 256
  const SEPARATOR_BYTES = 3
  const projected = URL_PREFIX_BYTES + ids.reduce<number>((sum, id) => sum + String(id).length + SEPARATOR_BYTES, 0)
  if (projected > KONG_REQUEST_LINE_LIMIT_BYTES) {
    throw new Error(
      `Unsafe IN fetch on ${table}.${column}: ${ids.length} ids would produce a ~${projected} B URL, `
      + `over Kong's ${KONG_REQUEST_LINE_LIMIT_BYTES} B limit. Route the caller through chunkedIn.`,
    )
  }
}

interface MockTable {
  rows: unknown[]
  inserts: unknown[]
}

function makeMockClient(tables: Record<string, MockTable>) {
  function query(table: string): any {
    const t = tables[table] ?? { rows: [], inserts: [] }
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: (column: string, ids: readonly unknown[]) => {
        assertUrlBudget(table, column, ids)
        return chain
      },
      insert: (row: unknown) => {
        t.inserts.push(row)
        return Promise.resolve({ data: null, error: null })
      },
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
        resolve({ data: t.rows, error: null })
      },
    }
    return chain
  }
  return {
    schema: () => ({ from: (table: string) => query(table) }),
  }
}

function makeBlock(opts: { itemId?: string; exerciseType?: SessionBlock['renderPlan']['exerciseType']; sourceKind?: 'item' | 'pattern' } = {}): SessionBlock {
  const itemId = opts.itemId ?? 'item-1'
  const sourceKind = opts.sourceKind ?? 'item'
  const exerciseType = opts.exerciseType ?? 'meaning_recall'
  const sourceRef = sourceKind === 'item' ? `learning_items/${itemId}` : `lesson-1/${itemId}`
  const key = buildCanonicalKey({
    sourceKind,
    sourceRef,
    capabilityType: 'text_recognition',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
  })
  return {
    id: `block-${itemId}-${exerciseType}`,
    kind: 'due_review',
    capabilityId: `cap-${itemId}`,
    canonicalKeySnapshot: key,
    renderPlan: {
      capabilityKey: key,
      sourceRef,
      exerciseType,
      capabilityType: 'text_recognition',
      skillType: 'recognition',
      requiredArtifacts: [],
    },
    reviewContext: {
      schedulerSnapshot: {} as never,
      currentStateVersion: 0,
      artifactVersionSnapshot: {},
      capabilityReadinessStatus: 'ready',
      capabilityPublicationStatus: 'published',
    },
  }
}

const baseOptions = { userId: 'u-1', userLanguage: 'nl' as const, sessionId: 'sess-1' }

// ─── Tests ───

describe('capabilityContentService.resolveBlocks', () => {
  it('returns empty map for empty input', async () => {
    const tables: Record<string, MockTable> = {}
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const map = await service.resolveBlocks([], baseOptions)
    expect(map.size).toBe(0)
  })

  it('routes non-item sourceKind blocks to unsupported_source_kind', async () => {
    const tables: Record<string, MockTable> = {}
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeBlock({ sourceKind: 'pattern' })
    const map = await service.resolveBlocks([block], baseOptions)
    expect(map.size).toBe(1)
    const ctx = map.get(block.id)!
    expect(ctx.exerciseItem).toBeNull()
    expect(ctx.diagnostic?.reasonCode).toBe('unsupported_source_kind')
  })

  it('routes malformed canonical keys to sourceref_unparseable', async () => {
    const tables: Record<string, MockTable> = {}
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block: SessionBlock = {
      ...makeBlock(),
      canonicalKeySnapshot: 'not-a-canonical-key',
    }
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.diagnostic?.reasonCode).toBe('sourceref_unparseable')
  })

  it('emits item_not_found / block_failed_db_fetch when learning_item missing from DB', async () => {
    const tables: Record<string, MockTable> = {
      learning_items: { rows: [], inserts: [] },        // empty: id not found
      item_meanings: { rows: [], inserts: [] },
      item_contexts: { rows: [], inserts: [] },
      item_answer_variants: { rows: [], inserts: [] },
      exercise_variants: { rows: [], inserts: [] },
      capability_artifacts: { rows: [], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeBlock()
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.exerciseItem).toBeNull()
    expect(ctx.diagnostic?.reasonCode).toBe('block_failed_db_fetch')
  })

  it('emits item_inactive when is_active=false', async () => {
    const tables: Record<string, MockTable> = {
      learning_items: { rows: [{
        id: 'uuid-1', item_type: 'word', base_text: 'item-1', normalized_text: 'item-1',
        language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
        source_card_id: null, notes: null, is_active: false, pos: 'noun',
        created_at: '', updated_at: '',
      }], inserts: [] },
      item_meanings: { rows: [], inserts: [] },
      item_contexts: { rows: [], inserts: [] },
      item_answer_variants: { rows: [], inserts: [] },
      exercise_variants: { rows: [], inserts: [] },
      capability_artifacts: { rows: [], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeBlock()
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.diagnostic?.reasonCode).toBe('item_inactive')
  })

  it('happy path: meaning_recall resolves to ok with audibleTexts', async () => {
    const tables: Record<string, MockTable> = {
      learning_items: { rows: [{
        id: 'uuid-1', item_type: 'word', base_text: 'item-1', normalized_text: 'item-1',
        language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
        source_card_id: null, notes: null, is_active: true, pos: 'noun',
        created_at: '', updated_at: '',
      }], inserts: [] },
      item_meanings: { rows: [{
        id: 'm-1', learning_item_id: 'uuid-1', translation_language: 'nl',
        translation_text: 'einde', sense_label: null, usage_note: null, is_primary: true,
      }], inserts: [] },
      item_contexts: { rows: [], inserts: [] },
      item_answer_variants: { rows: [], inserts: [] },
      exercise_variants: { rows: [], inserts: [] },
      capability_artifacts: { rows: [], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeBlock({ exerciseType: 'meaning_recall' })
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.exerciseItem).not.toBeNull()
    expect(ctx.exerciseItem!.exerciseType).toBe('meaning_recall')
    expect(ctx.audibleTexts.length).toBeGreaterThan(0)
    expect(ctx.diagnostic).toBeNull()
  })

  it('writes failure events to capability_resolution_failure_events for every diagnostic', async () => {
    const failureTable: MockTable = { rows: [], inserts: [] }
    const tables: Record<string, MockTable> = {
      learning_items: { rows: [], inserts: [] },        // empty → triggers block_failed_db_fetch
      item_meanings: { rows: [], inserts: [] },
      item_contexts: { rows: [], inserts: [] },
      item_answer_variants: { rows: [], inserts: [] },
      exercise_variants: { rows: [], inserts: [] },
      capability_artifacts: { rows: [], inserts: [] },
      capability_resolution_failure_events: failureTable,
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeBlock()
    await service.resolveBlocks([block], baseOptions)
    // Async fire-and-forget — give microtasks a tick
    await Promise.resolve()
    await Promise.resolve()
    expect(failureTable.inserts.length).toBeGreaterThanOrEqual(1)
    const insert = failureTable.inserts[0] as Record<string, unknown>
    expect(insert.reason_code).toBe('block_failed_db_fetch')
    expect(insert.user_id).toBe('u-1')
    expect(insert.session_id).toBe('sess-1')
    expect(insert.block_id).toBe(block.id)
  })

  it('total function: every input block has a key in the result map', async () => {
    const tables: Record<string, MockTable> = {
      learning_items: { rows: [], inserts: [] },
      item_meanings: { rows: [], inserts: [] },
      item_contexts: { rows: [], inserts: [] },
      item_answer_variants: { rows: [], inserts: [] },
      exercise_variants: { rows: [], inserts: [] },
      capability_artifacts: { rows: [], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const blocks = [
      makeBlock({ itemId: 'item-1' }),
      makeBlock({ itemId: 'item-2', sourceKind: 'pattern' }),
      { ...makeBlock({ itemId: 'item-3' }), canonicalKeySnapshot: 'garbage' },
    ]
    const map = await service.resolveBlocks(blocks, baseOptions)
    expect(map.size).toBe(3)
    expect(map.has(blocks[0].id)).toBe(true)
    expect(map.has(blocks[1].id)).toBe(true)
    expect(map.has(blocks[2].id)).toBe(true)
  })
})

describe('capabilityContentService.resolveBlocks — distractor pool chunking', () => {
  it('chunks learning_items and item_meanings IN queries when the pool exceeds 50 ids', async () => {
    // 130 distinct distractor-pool ids → expect 3 chunks (50/50/30) per table.
    const POOL_SIZE = 130
    const poolIds = Array.from({ length: POOL_SIZE }, (_, i) => `pool-${String(i).padStart(3, '0')}`)
    const learningItemsInCalls: string[][] = []
    const itemMeaningsInCalls: string[][] = []

    function makeBuilder(table: string): any {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: (column: string, ids: string[]) => {
          if (table === 'learning_items' && column === 'id') {
            learningItemsInCalls.push(ids)
          } else if (table === 'item_meanings' && column === 'learning_item_id') {
            itemMeaningsInCalls.push(ids)
          }
          builder._lastIn = { column, ids }
          return builder
        },
        insert: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
          const lastIn = builder._lastIn as { column: string; ids: string[] } | undefined
          if (table === 'learning_items' && lastIn?.column === 'normalized_text') {
            resolve({ data: [{
              id: 'item-1-uuid', item_type: 'word', base_text: 'item-1', normalized_text: 'item-1',
              language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
              source_card_id: null, notes: null, is_active: true, pos: 'noun',
              created_at: '', updated_at: '',
            }], error: null })
          } else if (table === 'item_contexts' && lastIn?.column === 'learning_item_id') {
            resolve({ data: [{
              id: 'ctx-1', learning_item_id: 'item-1-uuid', context_type: 'phrase',
              source_text: '', translation_text: '', difficulty: 'A1', topic_tag: null,
              is_anchor_context: true, source_lesson_id: 'lesson-A', source_section_id: null,
            }], error: null })
          } else if (table === 'item_contexts' && lastIn?.column === 'source_lesson_id') {
            // The pool-discovery query — return many distinct learning_item_ids.
            resolve({ data: poolIds.map(id => ({ learning_item_id: id })), error: null })
          } else if (table === 'learning_items' && lastIn?.column === 'id') {
            resolve({ data: lastIn.ids.map(id => ({
              id, item_type: 'word', base_text: id, normalized_text: id,
              language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
              source_card_id: null, notes: null, is_active: true, pos: 'noun',
              created_at: '', updated_at: '',
            })), error: null })
          } else if (table === 'item_meanings' && lastIn?.column === 'learning_item_id') {
            resolve({ data: [], error: null })
          } else {
            resolve({ data: [], error: null })
          }
        },
      }
      return builder
    }
    const client = { schema: () => ({ from: (table: string) => makeBuilder(table) }) }

    const service = createCapabilityContentService(client as never)
    await service.resolveBlocks([makeBlock({ itemId: 'item-1', exerciseType: 'meaning_recall' })], baseOptions)

    // Wave 2 fetchMeanings runs first with ~1 session item, then fetchDistractorPool
    // runs fetchMeanings again with all 130 pool ids — captured here mixed in.
    // What matters is the URL ceiling: no chunk may exceed 50 ids.
    expect(learningItemsInCalls.length).toBeGreaterThan(0)
    expect(itemMeaningsInCalls.length).toBeGreaterThan(0)
    for (const ids of learningItemsInCalls) expect(ids.length).toBeLessThanOrEqual(50)
    for (const ids of itemMeaningsInCalls) expect(ids.length).toBeLessThanOrEqual(50)

    // The distractor-pool path specifically must have produced 3 chunks of (50, 50, 30).
    const poolChunkSizes = learningItemsInCalls
      .filter(ids => ids.length > 1 || (ids[0]?.startsWith('pool-')))
      .map(ids => ids.length)
      .sort((a, b) => b - a)
    expect(poolChunkSizes).toEqual([50, 50, 30])
  })
})

describe('capabilityContentService.resolveBlocks — URL-budget guard at production scale', () => {
  it('survives a 667-item distractor pool (full union of every activated lesson)', async () => {
    // Worst-case observed in prod (all 9 lessons activated, union of every
    // anchored item). The shared makeMockClient asserts URL budget on every
    // .in() — if anyone removes chunkedIn from fetchLearningItemsById or
    // fetchMeanings, this test throws with a clear message.
    const poolRows = Array.from({ length: 667 }, (_, i) => ({
      id: `ctx-${i}`,
      learning_item_id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      context_type: 'phrase',
      source_text: '',
      translation_text: '',
      difficulty: 'A1',
      topic_tag: null,
      is_anchor_context: true,
      source_lesson_id: 'lesson-A',
      source_section_id: null,
    }))
    const tables: Record<string, MockTable> = {
      learning_items: { rows: [{
        id: 'uuid-1', item_type: 'word', base_text: 'item-1', normalized_text: 'item-1',
        language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
        source_card_id: null, notes: null, is_active: true, pos: 'noun',
        created_at: '', updated_at: '',
      }], inserts: [] },
      item_meanings: { rows: [], inserts: [] },
      item_contexts: { rows: poolRows, inserts: [] },
      item_answer_variants: { rows: [], inserts: [] },
      exercise_variants: { rows: [], inserts: [] },
      capability_artifacts: { rows: [], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    // Must not throw — the guard would fire if any IN clause exceeded budget.
    await expect(
      service.resolveBlocks([makeBlock({ itemId: 'item-1', exerciseType: 'meaning_recall' })], baseOptions),
    ).resolves.toBeDefined()
  })
})

describe('createCapabilityContentService — exported correctly', () => {
  it('returns an object that satisfies CapabilityContentService', () => {
    const tables: Record<string, MockTable> = {}
    const service: CapabilityContentService = createCapabilityContentService(makeMockClient(tables) as never)
    expect(typeof service.resolveBlocks).toBe('function')
  })
})
