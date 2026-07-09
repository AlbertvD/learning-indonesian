import { describe, it, expect } from 'vitest'
import {
  isRetireCandidate,
  expectedTextRecognitionKey,
  planPrereqRewrites,
  findDanglingRewriteTargets,
  chunkArray,
  typesMissingFromLiveDb,
  buildReport,
  fetchAllVocabCapRows,
  applyPrereqRewrites,
  assertZeroRemaining,
  type VocabCapRow,
} from '../retire-dropped-vocab-modes'
import { buildCanonicalKey, DROPPED_VOCAB_CAP_TYPES } from '@/lib/capabilities'

const row = (overrides: Partial<VocabCapRow>): VocabCapRow => ({
  id: 'cap-1',
  canonical_key: 'cap:v1:vocabulary_src:learning_items/halo:recognise_meaning_from_text_cap:id_to_l1:text:nl',
  source_kind: 'vocabulary_src',
  capability_type: 'recognise_meaning_from_text_cap',
  source_ref: 'learning_items/halo',
  prerequisite_keys: [],
  retired_at: null,
  ...overrides,
})

// ─── isRetireCandidate — pure predicate ─────────────────────────────────────

describe('isRetireCandidate', () => {
  it('selects a live vocabulary_src cap of a dropped type', () => {
    expect(isRetireCandidate({
      source_kind: 'vocabulary_src',
      capability_type: 'recognise_form_from_meaning_cap',
      retired_at: null,
    })).toBe(true)
  })

  it('selects each of the 3 dropped types', () => {
    for (const type of DROPPED_VOCAB_CAP_TYPES) {
      expect(isRetireCandidate({ source_kind: 'vocabulary_src', capability_type: type, retired_at: null })).toBe(true)
    }
  })

  it('rejects a kept type (#1, #3, #6)', () => {
    for (const type of ['recognise_meaning_from_text_cap', 'recognise_meaning_from_audio_cap', 'produce_form_from_meaning_cap']) {
      expect(isRetireCandidate({ source_kind: 'vocabulary_src', capability_type: type, retired_at: null })).toBe(false)
    }
  })

  it('rejects a non-vocabulary_src source_kind even with a dropped-type-shaped string', () => {
    expect(isRetireCandidate({
      source_kind: 'grammar_pattern_src',
      capability_type: 'recognise_form_from_meaning_cap',
      retired_at: null,
    })).toBe(false)
  })

  it('rejects an already-retired row (idempotent — skip on re-run)', () => {
    expect(isRetireCandidate({
      source_kind: 'vocabulary_src',
      capability_type: 'recognise_form_from_meaning_cap',
      retired_at: '2026-07-08T00:00:00.000Z',
    })).toBe(false)
  })
})

// ─── expectedTextRecognitionKey — pure key derivation ───────────────────────

describe('expectedTextRecognitionKey', () => {
  it('matches buildCanonicalKey for #1 with the projector shape (learnerLanguage=nl)', () => {
    const expected = buildCanonicalKey({
      sourceKind: 'vocabulary_src',
      sourceRef: 'learning_items/halo',
      capabilityType: 'recognise_meaning_from_text_cap',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'nl',
    })
    expect(expectedTextRecognitionKey('learning_items/halo')).toBe(expected)
  })

  it('is deterministic and varies only by sourceRef', () => {
    const a = expectedTextRecognitionKey('learning_items/halo')
    const b = expectedTextRecognitionKey('learning_items/halo')
    const c = expectedTextRecognitionKey('learning_items/makan')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

// ─── planPrereqRewrites — pure rewrite-plan derivation ──────────────────────

describe('planPrereqRewrites', () => {
  it('plans a rewrite for a #6 row still pointing at the old #2 key', () => {
    const oldKey = 'cap:v1:vocabulary_src:learning_items/halo:recognise_form_from_meaning_cap:l1_to_id:text:nl'
    const rows: VocabCapRow[] = [row({
      id: 'cap-6',
      capability_type: 'produce_form_from_meaning_cap',
      source_ref: 'learning_items/halo',
      prerequisite_keys: [oldKey],
    })]
    const plan = planPrereqRewrites(rows)
    expect(plan).toHaveLength(1)
    expect(plan[0].id).toBe('cap-6')
    expect(plan[0].fromKeys).toEqual([oldKey])
    expect(plan[0].toKey).toBe(expectedTextRecognitionKey('learning_items/halo'))
  })

  it('is idempotent — skips a #6 row already pointing at the expected #1 key', () => {
    const rows: VocabCapRow[] = [row({
      id: 'cap-6',
      capability_type: 'produce_form_from_meaning_cap',
      source_ref: 'learning_items/halo',
      prerequisite_keys: [expectedTextRecognitionKey('learning_items/halo')],
    })]
    expect(planPrereqRewrites(rows)).toEqual([])
  })

  it('plans a rewrite for a #6 row with an empty prerequisite_keys array', () => {
    const rows: VocabCapRow[] = [row({
      id: 'cap-6',
      capability_type: 'produce_form_from_meaning_cap',
      source_ref: 'learning_items/halo',
      prerequisite_keys: [],
    })]
    const plan = planPrereqRewrites(rows)
    expect(plan).toHaveLength(1)
    expect(plan[0].fromKeys).toEqual([])
  })

  it('plans a rewrite for a #6 row pointing at MULTIPLE stale keys (defensive — not expected live shape)', () => {
    const rows: VocabCapRow[] = [row({
      id: 'cap-6',
      capability_type: 'produce_form_from_meaning_cap',
      source_ref: 'learning_items/halo',
      prerequisite_keys: ['stale-key-1', 'stale-key-2'],
    })]
    const plan = planPrereqRewrites(rows)
    expect(plan).toHaveLength(1)
  })

  it('handles multiple distinct words independently', () => {
    const rows: VocabCapRow[] = [
      row({ id: 'cap-halo', capability_type: 'produce_form_from_meaning_cap', source_ref: 'learning_items/halo', prerequisite_keys: ['stale'] }),
      row({ id: 'cap-makan', capability_type: 'produce_form_from_meaning_cap', source_ref: 'learning_items/makan', prerequisite_keys: [expectedTextRecognitionKey('learning_items/makan')] }),
    ]
    const plan = planPrereqRewrites(rows)
    expect(plan).toHaveLength(1)
    expect(plan[0].id).toBe('cap-halo')
  })
})

// ─── findDanglingRewriteTargets — pure safety-net predicate (hardening, 2026-07-08) ─
//
// planPrereqRewrites derives `toKey` PURELY (no DB lookup) — this guard
// cross-checks the derived key against the live #1 canonical_key set so a
// deviating #1 (e.g. a legacy learnerLanguage mismatch) never silently
// produces a dangling #6 prereq. HC43 does NOT catch this class (it only
// checks for DROPPED-type references, not for a target that simply doesn't exist).

describe('findDanglingRewriteTargets', () => {
  it('flags a rewrite whose toKey has no matching live #1 canonical_key', () => {
    const rewrites = [
      {
        id: 'cap-6', sourceRef: 'learning_items/ghost', fromKeys: ['old'],
        toKey: expectedTextRecognitionKey('learning_items/ghost'),
      },
    ]
    const live = new Set<string>() // no #1 row for 'ghost' at all
    expect(findDanglingRewriteTargets(rewrites, live)).toEqual(rewrites)
  })

  it('does not flag a rewrite whose toKey IS a live canonical_key', () => {
    const toKey = expectedTextRecognitionKey('learning_items/halo')
    const rewrites = [{ id: 'cap-6', sourceRef: 'learning_items/halo', fromKeys: ['old'], toKey }]
    const live = new Set([toKey])
    expect(findDanglingRewriteTargets(rewrites, live)).toEqual([])
  })

  it('handles a mixed batch — only the dangling ones are returned', () => {
    const safeKey = expectedTextRecognitionKey('learning_items/halo')
    const danglingKey = expectedTextRecognitionKey('learning_items/ghost')
    const rewrites = [
      { id: 'cap-safe', sourceRef: 'learning_items/halo', fromKeys: ['old'], toKey: safeKey },
      { id: 'cap-dangling', sourceRef: 'learning_items/ghost', fromKeys: ['old'], toKey: danglingKey },
    ]
    const live = new Set([safeKey])
    expect(findDanglingRewriteTargets(rewrites, live)).toEqual([rewrites[1]])
  })

  it('returns empty for an empty rewrite list', () => {
    expect(findDanglingRewriteTargets([], new Set())).toEqual([])
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

  it('returns a single chunk when input is smaller than the chunk size', () => {
    expect(chunkArray([1, 2], 10)).toEqual([[1, 2]])
  })

  it('returns an empty array for empty input', () => {
    expect(chunkArray([], 10)).toEqual([])
  })
})

// ─── typesMissingFromLiveDb — reconciliation guard ──────────────────────────

describe('typesMissingFromLiveDb', () => {
  it('returns nothing when every dropped type has at least one live row', () => {
    const distinct = new Set([...DROPPED_VOCAB_CAP_TYPES, 'recognise_meaning_from_text_cap'])
    expect(typesMissingFromLiveDb(distinct)).toEqual([])
  })

  it('flags a dropped type with zero live rows', () => {
    const distinct = new Set(DROPPED_VOCAB_CAP_TYPES.filter((t) => t !== 'produce_form_from_audio_cap'))
    expect(typesMissingFromLiveDb(distinct)).toEqual(['produce_form_from_audio_cap'])
  })

  it('flags all 3 when the DB has none of the dropped types (e.g. after a completed --apply)', () => {
    const distinct = new Set(['recognise_meaning_from_text_cap', 'produce_form_from_meaning_cap'])
    expect(typesMissingFromLiveDb(distinct).sort()).toEqual([...DROPPED_VOCAB_CAP_TYPES].sort())
  })
})

// ─── buildReport — pure aggregation ──────────────────────────────────────────

describe('buildReport', () => {
  it('aggregates retire counts by type and the rewrite plan from one row set', () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', capability_type: 'recognise_form_from_meaning_cap', source_ref: 'learning_items/halo' }),
      row({ id: 'r2', capability_type: 'recall_meaning_from_text_cap', source_ref: 'learning_items/halo' }),
      row({ id: 'r3', capability_type: 'produce_form_from_audio_cap', source_ref: 'learning_items/halo' }),
      row({ id: 'r4', capability_type: 'recognise_meaning_from_text_cap', source_ref: 'learning_items/halo' }),
      row({ id: 'r5', capability_type: 'recognise_meaning_from_audio_cap', source_ref: 'learning_items/halo' }),
      row({
        id: 'r6', capability_type: 'produce_form_from_meaning_cap', source_ref: 'learning_items/halo',
        prerequisite_keys: ['old-key'],
      }),
    ]
    const report = buildReport(rows)
    expect(report.totalVocabRows).toBe(6)
    expect(report.retireCandidates.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3'])
    expect(report.retireCountsByType).toEqual({
      recognise_form_from_meaning_cap: 1,
      recall_meaning_from_text_cap: 1,
      produce_form_from_audio_cap: 1,
    })
    expect(report.rewrites).toHaveLength(1)
    expect(report.rewrites[0].id).toBe('r6')
    expect(report.missingTypesWarning).toEqual([])
  })

  it('warns when a dropped type has zero rows in the scanned set', () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', capability_type: 'recognise_meaning_from_text_cap' }),
      row({ id: 'r2', capability_type: 'produce_form_from_meaning_cap' }),
    ]
    const report = buildReport(rows)
    expect(report.missingTypesWarning.sort()).toEqual([...DROPPED_VOCAB_CAP_TYPES].sort())
  })

  it('produces zero retire counts and zero rewrites on an all-kept row set', () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', capability_type: 'recognise_meaning_from_text_cap' }),
      row({
        id: 'r2', capability_type: 'produce_form_from_meaning_cap',
        prerequisite_keys: [expectedTextRecognitionKey('learning_items/halo')],
      }),
      row({ id: 'r3', capability_type: 'recognise_meaning_from_audio_cap' }),
    ]
    const report = buildReport(rows)
    expect(report.retireCandidates).toEqual([])
    expect(report.rewrites).toEqual([])
  })

  it('flags a #6 rewrite whose source_ref has no #1 row at all as dangling (hardening, 2026-07-08)', () => {
    const rows: VocabCapRow[] = [
      // No recognise_meaning_from_text_cap row for 'ghost' anywhere in the
      // scanned set — e.g. a legacy learnerLanguage mismatch or an
      // un-migrated word. planPrereqRewrites still derives a toKey for it
      // (pure derivation), but buildReport must flag it as dangling.
      row({
        id: 'r6', capability_type: 'produce_form_from_meaning_cap', source_ref: 'learning_items/ghost',
        prerequisite_keys: ['stale-key'],
      }),
    ]
    const report = buildReport(rows)
    expect(report.rewrites).toHaveLength(1)
    expect(report.danglingRewriteTargets).toHaveLength(1)
    expect(report.danglingRewriteTargets[0].id).toBe('r6')
    expect(report.danglingRewriteTargets[0].toKey).toBe(expectedTextRecognitionKey('learning_items/ghost'))
  })

  it('does NOT flag a #6 rewrite whose #1 row exists in the same scanned set', () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', capability_type: 'recognise_meaning_from_text_cap', source_ref: 'learning_items/halo' }),
      row({
        id: 'r6', capability_type: 'produce_form_from_meaning_cap', source_ref: 'learning_items/halo',
        prerequisite_keys: ['stale-key'],
      }),
    ]
    const report = buildReport(rows)
    expect(report.rewrites).toHaveLength(1)
    expect(report.danglingRewriteTargets).toEqual([])
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
        }
      },
    }),
  } as never
  return client
}

describe('fetchAllVocabCapRows', () => {
  it('pages through results until a page returns fewer than PAGE rows', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row({ id: `r${i}` }))
    const client = buildPagedSelectClient(rows)
    const result = await fetchAllVocabCapRows(client)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.id)).toEqual(['r0', 'r1', 'r2'])
  })

  it('returns an empty array when there are no vocabulary_src rows', async () => {
    const client = buildPagedSelectClient([])
    const result = await fetchAllVocabCapRows(client)
    expect(result).toEqual([])
  })
})

function buildUpdateCapturingClient() {
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = []
  const client = {
    schema: () => ({
      from: (table: string) => {
        if (table !== 'learning_capabilities') throw new Error(`unexpected table: ${table}`)
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              updates.push({ id, payload })
              return { error: null }
            },
          }),
        }
      },
    }),
  } as never
  return { client, updates }
}

describe('applyPrereqRewrites', () => {
  it('writes prerequisite_keys=[toKey] for every planned rewrite', async () => {
    const { client, updates } = buildUpdateCapturingClient()
    const rewrites = [
      { id: 'cap-1', sourceRef: 'learning_items/halo', fromKeys: ['old'], toKey: 'new-1' },
      { id: 'cap-2', sourceRef: 'learning_items/makan', fromKeys: ['old'], toKey: 'new-2' },
    ]
    const written = await applyPrereqRewrites(client, rewrites)
    expect(written).toBe(2)
    expect(updates).toHaveLength(2)
    expect(updates.find((u) => u.id === 'cap-1')?.payload.prerequisite_keys).toEqual(['new-1'])
    expect(updates.find((u) => u.id === 'cap-2')?.payload.prerequisite_keys).toEqual(['new-2'])
  })

  it('respects a bounded concurrency option without dropping any writes', async () => {
    const { client, updates } = buildUpdateCapturingClient()
    const rewrites = Array.from({ length: 25 }, (_, i) => ({
      id: `cap-${i}`, sourceRef: `learning_items/word-${i}`, fromKeys: ['old'], toKey: `new-${i}`,
    }))
    const written = await applyPrereqRewrites(client, rewrites, { concurrency: 10 })
    expect(written).toBe(25)
    expect(updates).toHaveLength(25)
  })

  it('is a no-op for an empty rewrite plan', async () => {
    const { client, updates } = buildUpdateCapturingClient()
    const written = await applyPrereqRewrites(client, [])
    expect(written).toBe(0)
    expect(updates).toHaveLength(0)
  })
})

// ─── Dangling rewrite targets are excluded from --apply (hardening, 2026-07-08) ───
//
// Mirrors run()'s apply-time filter (run() itself is not unit-tested — it
// wires up the real createClient/env-vars — so this exercises the same
// buildReport → filter-by-danglingRewriteTargets → applyPrereqRewrites
// sequence run() performs, using only the exported pure/IO functions.

describe('dangling rewrite targets are excluded from --apply (hardening, 2026-07-08)', () => {
  it('a #6 row whose source_ref has no #1 row is reported as dangling and excluded from the write', async () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', capability_type: 'recognise_meaning_from_text_cap', source_ref: 'learning_items/halo' }),
      row({
        id: 'r6-safe', capability_type: 'produce_form_from_meaning_cap', source_ref: 'learning_items/halo',
        prerequisite_keys: ['stale'],
      }),
      // 'ghost' has NO recognise_meaning_from_text_cap row anywhere in the scanned set.
      row({
        id: 'r6-dangling', capability_type: 'produce_form_from_meaning_cap', source_ref: 'learning_items/ghost',
        prerequisite_keys: ['stale'],
      }),
    ]
    const report = buildReport(rows)
    expect(report.rewrites).toHaveLength(2)
    expect(report.danglingRewriteTargets).toHaveLength(1)
    expect(report.danglingRewriteTargets[0].id).toBe('r6-dangling')

    // The same filter run() applies before calling applyPrereqRewrites in --apply mode.
    const danglingIds = new Set(report.danglingRewriteTargets.map((r) => r.id))
    const safeRewrites = report.rewrites.filter((r) => !danglingIds.has(r.id))
    expect(safeRewrites.map((r) => r.id)).toEqual(['r6-safe'])

    const { client, updates } = buildUpdateCapturingClient()
    const written = await applyPrereqRewrites(client, safeRewrites)
    expect(written).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('r6-safe')
  })
})

describe('assertZeroRemaining', () => {
  it('resolves silently when no dropped-type rows and no stale #6 prereqs remain', async () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', capability_type: 'recognise_meaning_from_text_cap' }),
      row({
        id: 'r2', capability_type: 'produce_form_from_meaning_cap',
        prerequisite_keys: [expectedTextRecognitionKey('learning_items/halo')],
      }),
    ]
    const client = buildPagedSelectClient(rows)
    await expect(assertZeroRemaining(client)).resolves.toBeUndefined()
  })

  it('throws when a dropped-type row is still live', async () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r1', capability_type: 'recognise_form_from_meaning_cap', retired_at: null }),
    ]
    const client = buildPagedSelectClient(rows)
    await expect(assertZeroRemaining(client)).rejects.toThrow(/dropped-type vocabulary_src/)
  })

  it('throws when a #6 row still has a stale prereq', async () => {
    const rows: VocabCapRow[] = [
      row({ id: 'r2', capability_type: 'produce_form_from_meaning_cap', prerequisite_keys: ['stale'] }),
    ]
    const client = buildPagedSelectClient(rows)
    await expect(assertZeroRemaining(client)).rejects.toThrow(/still do not prereq on #1/)
  })
})
