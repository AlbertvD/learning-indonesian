import { describe, it, expect } from 'vitest'
import {
  isUnretireCandidate,
  needsReanimation,
  gapWordSourceRefs,
  chunkArray,
  buildReport,
  fetchTargetAndSiblingRows,
  unretireTargetCapabilities,
  countReanimationCandidates,
  reanimateDueDates,
  TARGET_SOURCE_KIND,
  TARGET_CAPABILITY_TYPE,
  SIBLING_CAPABILITY_TYPE,
  type VocabCapRow,
} from '../unretire-vocab-mode'

const row = (overrides: Partial<VocabCapRow>): VocabCapRow => ({
  id: 'cap-1',
  canonical_key: 'cap:v1:vocabulary_src:learning_items/halo:recognise_form_from_meaning_cap:l1_to_id:text:nl',
  source_kind: TARGET_SOURCE_KIND,
  capability_type: TARGET_CAPABILITY_TYPE,
  source_ref: 'learning_items/halo',
  retired_at: '2026-07-08T00:00:00.000Z',
  ...overrides,
})

// ─── isUnretireCandidate — pure predicate ───────────────────────────────────

describe('isUnretireCandidate', () => {
  it('selects a retired #2 vocabulary_src row', () => {
    expect(isUnretireCandidate({
      source_kind: TARGET_SOURCE_KIND,
      capability_type: TARGET_CAPABILITY_TYPE,
      retired_at: '2026-07-08T00:00:00.000Z',
    })).toBe(true)
  })

  it('rejects an already-live row (idempotent — skip on re-run)', () => {
    expect(isUnretireCandidate({
      source_kind: TARGET_SOURCE_KIND,
      capability_type: TARGET_CAPABILITY_TYPE,
      retired_at: null,
    })).toBe(false)
  })

  it('rejects a non-#2 capability_type even if retired', () => {
    expect(isUnretireCandidate({
      source_kind: TARGET_SOURCE_KIND,
      capability_type: SIBLING_CAPABILITY_TYPE,
      retired_at: '2026-07-08T00:00:00.000Z',
    })).toBe(false)
  })

  it('rejects a non-vocabulary_src source_kind even with a matching type string', () => {
    expect(isUnretireCandidate({
      source_kind: 'grammar_pattern_src',
      capability_type: TARGET_CAPABILITY_TYPE,
      retired_at: '2026-07-08T00:00:00.000Z',
    })).toBe(false)
  })
})

// ─── needsReanimation — pure predicate ──────────────────────────────────────

describe('needsReanimation', () => {
  it('flags a practiced row whose next_due_at was cleared by the original soft-retire', () => {
    expect(needsReanimation({ review_count: 3, next_due_at: null })).toBe(true)
  })

  it('does not flag a never-reviewed row (review_count = 0)', () => {
    expect(needsReanimation({ review_count: 0, next_due_at: null })).toBe(false)
  })

  it('does not flag a row that already has a next_due_at', () => {
    expect(needsReanimation({ review_count: 3, next_due_at: '2026-08-01T00:00:00.000Z' })).toBe(false)
  })
})

// ─── gapWordSourceRefs — pure set-difference ────────────────────────────────

describe('gapWordSourceRefs', () => {
  it('returns #6 source_refs with no matching #2 row', () => {
    const produceRefs = new Set(['learning_items/halo', 'learning_items/ghost'])
    const recogniseRefs = new Set(['learning_items/halo'])
    expect(gapWordSourceRefs(produceRefs, recogniseRefs)).toEqual(['learning_items/ghost'])
  })

  it('returns empty when every #6 word has a #2 row', () => {
    const produceRefs = new Set(['learning_items/halo'])
    const recogniseRefs = new Set(['learning_items/halo'])
    expect(gapWordSourceRefs(produceRefs, recogniseRefs)).toEqual([])
  })

  it('returns empty for an empty #6 set', () => {
    expect(gapWordSourceRefs(new Set(), new Set(['learning_items/halo']))).toEqual([])
  })
})

// ─── chunkArray — pure batching ──────────────────────────────────────────────

describe('chunkArray', () => {
  it('splits evenly when the length is a multiple of the chunk size', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })

  it('leaves a smaller final chunk when not evenly divisible', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns an empty array for empty input', () => {
    expect(chunkArray([], 10)).toEqual([])
  })
})

// ─── buildReport — pure aggregation ──────────────────────────────────────────

describe('buildReport', () => {
  it('aggregates un-retire candidates and the gap-word check from one row set', () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', source_ref: 'learning_items/halo', retired_at: '2026-07-08T00:00:00.000Z' }),
      row({ id: 'r2', source_ref: 'learning_items/makan', retired_at: null }), // already live, not a candidate
      row({
        id: 'r3', source_ref: 'learning_items/halo', capability_type: SIBLING_CAPABILITY_TYPE, retired_at: null,
      }),
      row({
        id: 'r4', source_ref: 'learning_items/anjing', capability_type: SIBLING_CAPABILITY_TYPE, retired_at: null,
      }), // #6 with no #2 sibling in this row set → gap word
    ]
    const report = buildReport(rows)
    expect(report.totalScannedRows).toBe(4)
    expect(report.unretireCandidateCount).toBe(1)
    expect(report.unretireSamples.map((r) => r.id)).toEqual(['r1'])
    expect(report.gapWordSourceRefs).toEqual(['learning_items/anjing'])
    expect(report.targetCapabilityIds.sort()).toEqual(['r1', 'r2'])
  })

  it('produces zero candidates and zero gap words on an all-live, fully-paired row set', () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', source_ref: 'learning_items/halo', retired_at: null }),
      row({ id: 'r2', source_ref: 'learning_items/halo', capability_type: SIBLING_CAPABILITY_TYPE, retired_at: null }),
    ]
    const report = buildReport(rows)
    expect(report.unretireCandidateCount).toBe(0)
    expect(report.gapWordSourceRefs).toEqual([])
  })

  it('caps samples at 5', () => {
    const rows: VocabCapRow[] = Array.from({ length: 8 }, (_, i) => row({ id: `r${i}`, source_ref: `learning_items/word-${i}` }))
    const report = buildReport(rows)
    expect(report.unretireCandidateCount).toBe(8)
    expect(report.unretireSamples).toHaveLength(5)
  })
})

// ─── IO layer — mocked Supabase client ──────────────────────────────────────

function buildPagedSelectClient(allRows: VocabCapRow[]) {
  const client = {
    schema: () => ({
      from: (table: string) => {
        if (table !== 'learning_capabilities') throw new Error(`unexpected table: ${table}`)
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                // .order('id') is load-bearing in the fetch (stable pagination);
                // the mock accepts and ignores it — slices are inherently ordered.
                order: () => ({
                  range: async (from: number, to: number) => ({
                    data: allRows.slice(from, to + 1),
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      },
    }),
  } as never
  return client
}

describe('fetchTargetAndSiblingRows', () => {
  it('pages through results until a page returns fewer than PAGE rows', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row({ id: `r${i}` }))
    const client = buildPagedSelectClient(rows)
    const result = await fetchTargetAndSiblingRows(client)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.id)).toEqual(['r0', 'r1', 'r2'])
  })

  it('returns an empty array when there are no matching rows', async () => {
    const client = buildPagedSelectClient([])
    const result = await fetchTargetAndSiblingRows(client)
    expect(result).toEqual([])
  })
})

describe('unretireTargetCapabilities', () => {
  it('issues a single two-predicate UPDATE with no id list', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const client = {
      schema: () => ({
        from: (table: string) => {
          if (table !== 'learning_capabilities') throw new Error(`unexpected table: ${table}`)
          return {
            update: (payload: Record<string, unknown>) => {
              calls.push({ method: 'update', args: [payload] })
              return {
                eq: (col: string, val: unknown) => {
                  calls.push({ method: 'eq', args: [col, val] })
                  return {
                    eq: async (col2: string, val2: unknown) => {
                      calls.push({ method: 'eq', args: [col2, val2] })
                      return { error: null }
                    },
                  }
                },
              }
            },
          }
        },
      }),
    } as never

    await unretireTargetCapabilities(client)

    expect(calls[0]).toEqual({ method: 'update', args: [expect.objectContaining({ retired_at: null })] })
    expect(calls[1]).toEqual({ method: 'eq', args: ['source_kind', TARGET_SOURCE_KIND] })
    expect(calls[2]).toEqual({ method: 'eq', args: ['capability_type', TARGET_CAPABILITY_TYPE] })
    // Exactly 2 .eq() predicates — no .in() over an id list.
    expect(calls.filter((c) => c.method === 'eq')).toHaveLength(2)
  })
})

function buildStateUpdateClient(matchingRowsByCapabilityId: Map<string, number>) {
  const updateCalls: string[][] = []
  const client = {
    schema: () => ({
      from: (table: string) => {
        if (table !== 'learner_capability_state') throw new Error(`unexpected table: ${table}`)
        return {
          select: () => ({
            in: (_col: string, ids: string[]) => ({
              gt: () => ({
                is: async () => {
                  const count = ids.reduce((sum, id) => sum + (matchingRowsByCapabilityId.get(id) ?? 0), 0)
                  return { count, error: null }
                },
              }),
            }),
          }),
          update: () => ({
            in: (_col: string, ids: string[]) => {
              updateCalls.push(ids)
              return {
                gt: () => ({
                  is: () => ({
                    select: async () => {
                      const data = ids.flatMap((id) => {
                        const n = matchingRowsByCapabilityId.get(id) ?? 0
                        return Array.from({ length: n }, (_, i) => ({ id: `${id}-state-${i}` }))
                      })
                      return { data, error: null }
                    },
                  }),
                }),
              }
            },
          }),
        }
      },
    }),
  } as never
  return { client, updateCalls }
}

describe('countReanimationCandidates', () => {
  it('sums counts across chunked .in() reads', async () => {
    const matching = new Map([['cap-1', 1], ['cap-2', 0], ['cap-3', 2]])
    const { client } = buildStateUpdateClient(matching)
    const total = await countReanimationCandidates(client, ['cap-1', 'cap-2', 'cap-3'])
    expect(total).toBe(3)
  })

  it('chunks ids into batches of STATE_CHUNK_SIZE', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `cap-${i}`)
    const matching = new Map(ids.map((id) => [id, 1]))
    const { client } = buildStateUpdateClient(matching)
    const total = await countReanimationCandidates(client, ids)
    expect(total).toBe(250)
  })

  it('returns 0 for an empty id list', async () => {
    const { client } = buildStateUpdateClient(new Map())
    const total = await countReanimationCandidates(client, [])
    expect(total).toBe(0)
  })
})

describe('reanimateDueDates', () => {
  it('writes next_due_at and returns the number of rows actually touched', async () => {
    const matching = new Map([['cap-1', 1], ['cap-2', 0]])
    const { client, updateCalls } = buildStateUpdateClient(matching)
    const written = await reanimateDueDates(client, ['cap-1', 'cap-2'])
    expect(written).toBe(1)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).toEqual(['cap-1', 'cap-2'])
  })

  it('chunks the write into batches of STATE_CHUNK_SIZE (50 — Kong URL-length limit, observed live 2026-07-09)', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `cap-${i}`)
    const matching = new Map(ids.map((id) => [id, 1]))
    const { client, updateCalls } = buildStateUpdateClient(matching)
    const written = await reanimateDueDates(client, ids)
    expect(written).toBe(120)
    expect(updateCalls).toHaveLength(3)
    expect(updateCalls[0]).toHaveLength(50)
    expect(updateCalls[2]).toHaveLength(20)
  })

  it('is a no-op for an empty id list', async () => {
    const { client, updateCalls } = buildStateUpdateClient(new Map())
    const written = await reanimateDueDates(client, [])
    expect(written).toBe(0)
    expect(updateCalls).toHaveLength(0)
  })
})
