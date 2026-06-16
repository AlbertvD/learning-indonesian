// Resolver-level tests for lib/exercise-content/resolver.resolveBlocks.
// Mocks Supabase's chained query API the same way the session-builder adapter test does.

import { describe, it, expect, vi } from 'vitest'
import { createCapabilityContentService, type CapabilityContentService } from '../resolver'
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

function makeBlock(opts: { itemId?: string; exerciseType?: SessionBlock['renderPlan']['exerciseType']; sourceKind?: 'vocabulary_src' | 'grammar_pattern_src' } = {}): SessionBlock {
  const itemId = opts.itemId ?? 'item-1'
  const sourceKind = opts.sourceKind ?? 'vocabulary_src'
  const exerciseType = opts.exerciseType ?? 'meaning_recall'
  const sourceRef = sourceKind === 'vocabulary_src' ? `learning_items/${itemId}` : `lesson-1/${itemId}`
  const key = buildCanonicalKey({
    sourceKind,
    sourceRef,
    capabilityType: 'recognise_meaning_from_text_cap',
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
      capabilityType: 'recognise_meaning_from_text_cap',
      skillType: 'recognition',
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

describe('resolver.resolveBlocks', () => {
  it('returns empty map for empty input', async () => {
    const tables: Record<string, MockTable> = {}
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const map = await service.resolveBlocks([], baseOptions)
    expect(map.size).toBe(0)
  })

  it('routes a pattern block with a malformed pattern ref to pattern_ref_unparseable', async () => {
    // PR 4: pattern is now a supported source kind (bucketed to byKind/pattern),
    // but makeBlock's sourceRef (lesson-1/item-1) lacks the `/pattern-` segment,
    // so it fails ref parsing rather than reaching the fetcher.
    const tables: Record<string, MockTable> = {}
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeBlock({ sourceKind: 'grammar_pattern_src' })
    const map = await service.resolveBlocks([block], baseOptions)
    expect(map.size).toBe(1)
    const ctx = map.get(block.id)!
    expect(ctx.exerciseItem).toBeNull()
    expect(ctx.diagnostic?.reasonCode).toBe('pattern_ref_unparseable')
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
      // Decision R (PR 1): translation_nl is now read from inline column, not item_meanings.
      learning_items: { rows: [{
        id: 'uuid-1', item_type: 'word', base_text: 'item-1', normalized_text: 'item-1',
        language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
        source_card_id: null, notes: null, is_active: true, pos: 'noun',
        translation_nl: 'einde', translation_en: 'end', usage_note: null,
        created_at: '', updated_at: '',
      }], inserts: [] },
      // item_meanings table is not read by byKind/item.ts after PR 1 (Decision R).
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
      makeBlock({ itemId: 'item-2', sourceKind: 'grammar_pattern_src' }),
      { ...makeBlock({ itemId: 'item-3' }), canonicalKeySnapshot: 'garbage' },
    ]
    const map = await service.resolveBlocks(blocks, baseOptions)
    expect(map.size).toBe(3)
    expect(map.has(blocks[0].id)).toBe(true)
    expect(map.has(blocks[1].id)).toBe(true)
    expect(map.has(blocks[2].id)).toBe(true)
  })
})

describe('resolver.resolveBlocks — distractor pool chunking', () => {
  // Decision R (PR 1): item_meanings is no longer fetched. Chunking test now
  // verifies only learning_items chunked IN queries (pool of 130 items → 3 chunks).
  it('chunks learning_items IN queries when the distractor pool exceeds 50 ids', async () => {
    // 130 distinct distractor-pool ids → expect 3 chunks (50/50/30) for learning_items.id.
    const POOL_SIZE = 130
    const poolIds = Array.from({ length: POOL_SIZE }, (_, i) => `pool-${String(i).padStart(3, '0')}`)
    const learningItemsInCalls: string[][] = []

    function makeBuilder(table: string): any {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: (column: string, ids: string[]) => {
          if (table === 'learning_items' && column === 'id') {
            learningItemsInCalls.push(ids)
          }
          builder._lastIn = { column, ids }
          return builder
        },
        insert: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
          const lastIn = builder._lastIn as { column: string; ids: string[] } | undefined
          if (table === 'learning_items' && lastIn?.column === 'normalized_text') {
            // Decision R: return row with translation_nl so the builder can synthesise a meaning.
            resolve({ data: [{
              id: 'item-1-uuid', item_type: 'word', base_text: 'item-1', normalized_text: 'item-1',
              language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
              source_card_id: null, notes: null, is_active: true, pos: 'noun',
              translation_nl: 'einde', translation_en: 'end', usage_note: null,
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
            // Decision R: pool items get translation_nl so meaningsFromItem returns values.
            resolve({ data: lastIn.ids.map(id => ({
              id, item_type: 'word', base_text: id, normalized_text: id,
              language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
              source_card_id: null, notes: null, is_active: true, pos: 'noun',
              translation_nl: `vertaling-${id}`, translation_en: null, usage_note: null,
              created_at: '', updated_at: '',
            })), error: null })
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

    // Decision R (PR 1): item_meanings is no longer fetched from DB. Only learning_items
    // is chunked. The distractor pool fetches 130 pool item rows via chunkedIn.
    expect(learningItemsInCalls.length).toBeGreaterThan(0)
    for (const ids of learningItemsInCalls) expect(ids.length).toBeLessThanOrEqual(50)

    // The distractor-pool path specifically must have produced 3 chunks of (50, 50, 30).
    const poolChunkSizes = learningItemsInCalls
      .filter(ids => ids.length > 1 || (ids[0]?.startsWith('pool-')))
      .map(ids => ids.length)
      .sort((a, b) => b - a)
    expect(poolChunkSizes).toEqual([50, 50, 30])
  })
})

describe('resolver.resolveBlocks — URL-budget guard at production scale', () => {
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

// ─── dialogue_line resolution (PR-B of the lib/exercise-content fold) ────────

function makeDialogueBlock(opts: { sourceRef?: string; capabilityId?: string; exerciseType?: SessionBlock['renderPlan']['exerciseType'] } = {}): SessionBlock {
  const sourceRef = opts.sourceRef ?? 'lesson-9/section-1/line-10'
  const capabilityId = opts.capabilityId ?? `cap-${sourceRef}`
  const exerciseType = opts.exerciseType ?? 'cloze'
  const key = buildCanonicalKey({
    sourceKind: 'dialogue_line_src',
    sourceRef,
    capabilityType: 'produce_form_from_context_cap',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
  })
  return {
    id: `block-${sourceRef}-${exerciseType}`,
    kind: 'due_review',
    capabilityId,
    canonicalKeySnapshot: key,
    renderPlan: {
      capabilityKey: key,
      sourceRef,
      exerciseType,
      capabilityType: 'produce_form_from_context_cap',
      skillType: 'form_recall',
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

describe('resolver.resolveBlocks — dialogue_line source kind', () => {
  // PR 2: dialogue_line reads come from the typed `dialogue_clozes` table
  // JOINed to `lesson_dialogue_lines`, not from 3 `capability_artifacts` rows.
  // The PostgREST JOIN puts the lesson_dialogue_lines row as a nested object
  // on each dialogue_clozes row in the mock fixture.

  it('resolves to a render-ready cloze exerciseItem from the typed dialogue_clozes row', async () => {
    const block = makeDialogueBlock({ capabilityId: 'cap-dl-1' })
    const tables: Record<string, MockTable> = {
      dialogue_clozes: { rows: [
        {
          capability_id: 'cap-dl-1',
          sentence_with_blank: 'Aku tidak ___ tinggal di rumah terus',
          answer_text: 'suka',
          translation_text: 'Ik vind het niet leuk om de hele tijd thuis te blijven',
          lesson_dialogue_lines: {
            text: 'Aku tidak suka tinggal di rumah terus',
            speaker: 'Titin',
            translation: 'Ik vind het niet leuk om de hele tijd thuis te blijven',
          },
        },
      ], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.diagnostic).toBeNull()
    expect(ctx.exerciseItem?.exerciseType).toBe('cloze')
    expect(ctx.exerciseItem?.learningItem).toBeNull()
    expect(ctx.exerciseItem?.clozeContext?.sentence).toBe('Aku tidak ___ tinggal di rumah terus')
    expect(ctx.exerciseItem?.clozeContext?.targetWord).toBe('suka')
    expect(ctx.exerciseItem?.clozeContext?.translation).toBe('Ik vind het niet leuk om de hele tijd thuis te blijven')
    expect(ctx.exerciseItem?.clozeContext?.speaker).toBe('Titin')
  })

  it('fails dialogue_line_typed_row_missing when no dialogue_clozes row exists for a ready cap', async () => {
    const block = makeDialogueBlock({ capabilityId: 'cap-dl-missing' })
    const tables: Record<string, MockTable> = {
      // Empty dialogue_clozes — the JOIN returns no row.
      dialogue_clozes: { rows: [], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.exerciseItem).toBeNull()
    expect(ctx.diagnostic?.reasonCode).toBe('dialogue_line_typed_row_missing')
  })

  it('fails dialogue_line_typed_row_missing when JOIN to lesson_dialogue_lines is broken', async () => {
    const block = makeDialogueBlock({ capabilityId: 'cap-dl-broken-fk' })
    const tables: Record<string, MockTable> = {
      dialogue_clozes: { rows: [
        {
          capability_id: 'cap-dl-broken-fk',
          sentence_with_blank: 'Aku tidak ___ tinggal di rumah terus',
          answer_text: 'suka',
          translation_text: 'Ik vind het niet leuk',
          lesson_dialogue_lines: null,
        },
      ], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.exerciseItem).toBeNull()
    expect(ctx.diagnostic?.reasonCode).toBe('dialogue_line_typed_row_missing')
  })

  it('fails dialogue_line_ref_unparseable when source_ref does not match lesson-N/section-M/line-K', async () => {
    const block = makeDialogueBlock({ sourceRef: 'lesson-9/section-1', capabilityId: 'cap-dl-bad' })
    const tables: Record<string, MockTable> = {
      dialogue_clozes: { rows: [], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.diagnostic?.reasonCode).toBe('dialogue_line_ref_unparseable')
  })

  it('rejects dialogue_line block scheduled with exerciseType=cloze_mcq (cloze_mcq still item-only)', async () => {
    const block = makeDialogueBlock({ exerciseType: 'cloze_mcq', capabilityId: 'cap-dl-mcq' })
    const tables: Record<string, MockTable> = {
      dialogue_clozes: { rows: [
        {
          capability_id: 'cap-dl-mcq',
          sentence_with_blank: 'Aku tidak ___ tinggal di rumah terus',
          answer_text: 'suka',
          translation_text: 'irrelevant',
          lesson_dialogue_lines: {
            text: 'Aku tidak suka tinggal di rumah terus',
            speaker: null,
            translation: 'irrelevant',
          },
        },
      ], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const map = await service.resolveBlocks([block], baseOptions)
    const ctx = map.get(block.id)!
    expect(ctx.exerciseItem).toBeNull()
    // The projector emits item_not_found because cloze_mcq's contract input
    // requires a non-null learningItem (no dialogueLine field in its shape).
    expect(ctx.diagnostic?.reasonCode).toBe('item_not_found')
  })
})
