// Service-level tests for capabilityContentService.resolveBlocks.
// Mocks Supabase's chained query API the same way capabilitySessionDataService.test.ts does.

import { describe, it, expect, vi } from 'vitest'
import { createCapabilityContentService, type CapabilityContentService } from '../capabilityContentService'
import type { SessionBlock } from '@/lib/session/sessionPlan'
import { buildCanonicalKey } from '@/lib/capabilities/canonicalKey'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

// ─── Mock plumbing ───

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
      in: () => chain,
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
        id: 'item-1', item_type: 'word', base_text: 'akhir', normalized_text: 'akhir',
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
        id: 'item-1', item_type: 'word', base_text: 'akhir', normalized_text: 'akhir',
        language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
        source_card_id: null, notes: null, is_active: true, pos: 'noun',
        created_at: '', updated_at: '',
      }], inserts: [] },
      item_meanings: { rows: [{
        id: 'm-1', learning_item_id: 'item-1', translation_language: 'nl',
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

describe('createCapabilityContentService — exported correctly', () => {
  it('returns an object that satisfies CapabilityContentService', () => {
    const tables: Record<string, MockTable> = {}
    const service: CapabilityContentService = createCapabilityContentService(makeMockClient(tables) as never)
    expect(typeof service.resolveBlocks).toBe('function')
  })
})
