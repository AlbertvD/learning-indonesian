import { describe, it, expect } from 'vitest'
import {
  classifyResidue,
  applyClassification,
  assertNoResidueRemains,
  stableSlugForBaseText,
  type ResidueCap,
  type ClassifiedAction,
} from '../triage-residual-capabilities'

// ─── classifyResidue — pure ────────────────────────────────────────────────

describe('classifyResidue', () => {
  it('deletes an orphan item cap with no review history', () => {
    const cap: ResidueCap = {
      id: 'cap-orphan',
      source_kind: 'vocabulary_src',
      source_ref: 'learning_items/ghost-word',
    }
    const out = classifyResidue({
      residueCaps: [cap],
      learningItemSlugs: new Set(['halo', 'apa-kabar']),
      capsWithReviewEvents: new Set(),
    })
    expect(out).toEqual<ClassifiedAction[]>([
      { kind: 'delete', capId: 'cap-orphan', reason: 'orphan item with no review history' },
    ])
  })

  it('default-assigns an orphan item cap that has review history (preserve learner state)', () => {
    const cap: ResidueCap = {
      id: 'cap-orphan-historic',
      source_kind: 'vocabulary_src',
      source_ref: 'learning_items/ghost-word',
    }
    const out = classifyResidue({
      residueCaps: [cap],
      learningItemSlugs: new Set(['halo']),
      capsWithReviewEvents: new Set(['cap-orphan-historic']),
    })
    expect(out).toEqual<ClassifiedAction[]>([
      {
        kind: 'default_assign',
        capId: 'cap-orphan-historic',
        note: 'orphan source_ref preserved for history',
      },
    ])
  })

  it('default-assigns a non-orphan item cap (slug matches a learning_item) with the cross-corpus note', () => {
    const cap: ResidueCap = {
      id: 'cap-cross-corpus',
      source_kind: 'vocabulary_src',
      source_ref: 'learning_items/dan',
    }
    const out = classifyResidue({
      residueCaps: [cap],
      learningItemSlugs: new Set(['dan', 'tetapi']),
      capsWithReviewEvents: new Set(),
    })
    expect(out).toEqual<ClassifiedAction[]>([
      {
        kind: 'default_assign',
        capId: 'cap-cross-corpus',
        note: 'cross-corpus, defaulted to lesson 1',
      },
    ])
  })

  it('default-assigns non-item source kinds (dialogue_line, pattern, word_form_pair_src) with the cross-corpus note', () => {
    const caps: ResidueCap[] = [
      { id: 'cap-dialogue', source_kind: 'dialogue_line_src', source_ref: 'lesson-3/section-1/dialogue/foo' },
      { id: 'cap-pattern', source_kind: 'grammar_pattern_src', source_ref: 'lesson-3/pattern-bar' },
      { id: 'cap-affix', source_kind: 'word_form_pair_src', source_ref: 'lesson-3/morphology/baz' },
    ]
    const out = classifyResidue({
      residueCaps: caps,
      learningItemSlugs: new Set(),
      capsWithReviewEvents: new Set(),
    })
    expect(out).toEqual<ClassifiedAction[]>([
      { kind: 'default_assign', capId: 'cap-dialogue', note: 'cross-corpus, defaulted to lesson 1' },
      { kind: 'default_assign', capId: 'cap-pattern',  note: 'cross-corpus, defaulted to lesson 1' },
      { kind: 'default_assign', capId: 'cap-affix',    note: 'cross-corpus, defaulted to lesson 1' },
    ])
  })

  it('handles a mixed batch in one call', () => {
    const out = classifyResidue({
      residueCaps: [
        { id: 'a', source_kind: 'vocabulary_src', source_ref: 'learning_items/missing' },
        { id: 'b', source_kind: 'vocabulary_src', source_ref: 'learning_items/missing-with-history' },
        { id: 'c', source_kind: 'vocabulary_src', source_ref: 'learning_items/dan' },
        { id: 'd', source_kind: 'dialogue_line_src', source_ref: 'lesson-3/section-1/dialogue/foo' },
      ],
      learningItemSlugs: new Set(['dan']),
      capsWithReviewEvents: new Set(['b']),
    })
    expect(out).toEqual<ClassifiedAction[]>([
      { kind: 'delete', capId: 'a', reason: 'orphan item with no review history' },
      { kind: 'default_assign', capId: 'b', note: 'orphan source_ref preserved for history' },
      { kind: 'default_assign', capId: 'c', note: 'cross-corpus, defaulted to lesson 1' },
      { kind: 'default_assign', capId: 'd', note: 'cross-corpus, defaulted to lesson 1' },
    ])
  })

  it('throws on item source_ref that does not start with learning_items/ (signals a bug in the loader)', () => {
    const cap: ResidueCap = {
      id: 'cap-bad',
      source_kind: 'vocabulary_src',
      source_ref: 'lesson-3/item-without-prefix',
    }
    expect(() =>
      classifyResidue({
        residueCaps: [cap],
        learningItemSlugs: new Set(),
        capsWithReviewEvents: new Set(),
      }),
    ).toThrow(/source_ref/)
  })
})

// ─── stableSlugForBaseText — pure, exported for the slug-set builder ───────

describe('stableSlugForBaseText', () => {
  it('matches the pipeline-side stableSlug rules (lowercase, dash-collapse, NFKD)', () => {
    expect(stableSlugForBaseText('Selamat Pagi')).toBe('selamat-pagi')
    expect(stableSlugForBaseText('apa kabar?')).toBe('apa-kabar')
    expect(stableSlugForBaseText('  trailing  ')).toBe('trailing')
    expect(stableSlugForBaseText('CAFÉ')).toBe('cafe')
  })
})

// ─── applyClassification — IO with recorded mock ───────────────────────────

interface RecordedCall {
  table: string
  op: 'delete' | 'update' | 'select'
  filterCol?: string
  filterVal?: unknown
  payload?: Record<string, unknown>
}

function buildRecordingSupabase(seed: {
  capRow?: { id: string; metadata_json: Record<string, unknown> | null }
  residueCount?: number
} = {}) {
  const calls: RecordedCall[] = []
  return {
    calls,
    client: {
      schema: () => ({
        from: (table: string) => {
          let pendingOp: 'delete' | 'update' | 'select' | null = null
          let pendingPayload: Record<string, unknown> | undefined
          let isCountHeadQuery = false
          const chain: any = {
            select: (_cols?: string, opts?: { count?: 'exact'; head?: boolean }) => {
              pendingOp = 'select'
              isCountHeadQuery = !!(opts?.count === 'exact' && opts.head)
              return chain
            },
            update: (payload: Record<string, unknown>) => {
              pendingOp = 'update'
              pendingPayload = payload
              return chain
            },
            delete: () => {
              pendingOp = 'delete'
              return chain
            },
            eq: (col: string, val: unknown) => {
              if (pendingOp === 'select' && !isCountHeadQuery) {
                // .select().eq(id, X).maybeSingle() — record + return single-row terminal.
                return {
                  maybeSingle: async () => ({
                    data: seed.capRow && seed.capRow.id === val ? seed.capRow : null,
                    error: null,
                  }),
                }
              }
              calls.push({ table, op: pendingOp!, filterCol: col, filterVal: val, payload: pendingPayload })
              return Promise.resolve({ data: null, error: null })
            },
            is: () => chain,
            not: () => {
              if (isCountHeadQuery) {
                calls.push({ table, op: 'select' })
                return Promise.resolve({ data: null, count: seed.residueCount ?? 0, error: null })
              }
              return chain
            },
            maybeSingle: async () => ({ data: null, error: null }),
          }
          return chain
        },
      }),
    } as any,
  }
}

describe('applyClassification', () => {
  it('apply mode: delete branch issues a single CASCADE delete on learning_capabilities (post-PR-4 child FKs are ON DELETE CASCADE)', async () => {
    const { client, calls } = buildRecordingSupabase()
    await applyClassification(client, {
      lesson1Id: 'lesson-1-uuid',
      actions: [{ kind: 'delete', capId: 'cap-X', reason: 'orphan' }],
      dryRun: false,
    })

    const deleteCalls = calls.filter((c) => c.op === 'delete' && c.filterVal === 'cap-X')
    expect(deleteCalls.map((c) => c.table)).toEqual(['learning_capabilities'])
    expect(deleteCalls[0].filterCol).toBe('id')
  })

  it('apply mode: default_assign branch updates lesson_id and merges metadata_json.note', async () => {
    const { client, calls } = buildRecordingSupabase({
      capRow: { id: 'cap-Y', metadata_json: { skillType: 'recall_mode' } },
    })
    await applyClassification(client, {
      lesson1Id: 'lesson-1-uuid',
      actions: [{ kind: 'default_assign', capId: 'cap-Y', note: 'cross-corpus, defaulted to lesson 1' }],
      dryRun: false,
    })
    const updates = calls.filter((c) => c.op === 'update' && c.table === 'learning_capabilities')
    expect(updates).toHaveLength(1)
    expect(updates[0].filterCol).toBe('id')
    expect(updates[0].filterVal).toBe('cap-Y')
    expect(updates[0].payload?.lesson_id).toBe('lesson-1-uuid')
    expect(updates[0].payload?.metadata_json).toEqual({
      skillType: 'recall_mode',
      note: 'cross-corpus, defaulted to lesson 1',
    })
  })

  it('apply mode: default_assign preserves an existing metadata_json.note if it differs (appends, never overwrites)', async () => {
    const { client, calls } = buildRecordingSupabase({
      capRow: { id: 'cap-Z', metadata_json: { skillType: 'recall_mode', note: 'earlier note' } },
    })
    await applyClassification(client, {
      lesson1Id: 'lesson-1-uuid',
      actions: [{ kind: 'default_assign', capId: 'cap-Z', note: 'orphan source_ref preserved for history' }],
      dryRun: false,
    })
    const updates = calls.filter((c) => c.op === 'update' && c.table === 'learning_capabilities')
    expect(updates).toHaveLength(1)
    expect(updates[0].payload?.metadata_json).toEqual({
      skillType: 'recall_mode',
      note: 'earlier note; orphan source_ref preserved for history',
    })
  })

  it('dry-run mode: makes NO update or delete calls', async () => {
    const { client, calls } = buildRecordingSupabase()
    await applyClassification(client, {
      lesson1Id: 'lesson-1-uuid',
      actions: [
        { kind: 'delete', capId: 'cap-A', reason: 'orphan' },
        { kind: 'default_assign', capId: 'cap-B', note: 'cross-corpus, defaulted to lesson 1' },
      ],
      dryRun: true,
    })
    expect(calls.filter((c) => c.op === 'delete')).toEqual([])
    expect(calls.filter((c) => c.op === 'update')).toEqual([])
  })
})

// ─── assertNoResidueRemains — final gate ───────────────────────────────────

describe('assertNoResidueRemains', () => {
  it('returns silently when residue count is 0', async () => {
    const { client } = buildRecordingSupabase({ residueCount: 0 })
    await expect(assertNoResidueRemains(client)).resolves.toBeUndefined()
  })

  it('throws when residue count is > 0 (PR-3 incomplete)', async () => {
    const { client } = buildRecordingSupabase({ residueCount: 7 })
    await expect(assertNoResidueRemains(client)).rejects.toThrow(/7 non-podcast capabilit/i)
  })
})
