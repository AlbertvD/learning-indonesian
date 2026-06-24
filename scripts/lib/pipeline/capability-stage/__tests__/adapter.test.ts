import { describe, expect, it } from 'vitest'

import {
  reconcileArtifactPresence,
  replaceAffixedFormPairs,
  retireOrphanedCapabilities,
  upsertCapabilities,
  upsertLearningItem,
  type AffixedFormPairRowInput,
  type CapabilityInput,
  type LearningItemInput,
} from '../adapter'

// Captures the upsert payload so we can assert on its shape. Returns a Supabase
// stub whose .upsert(payload) call records the payload before resolving.
function buildPayloadCapturingClient(returnId: string) {
  const captured: Array<{ table: string; payload: unknown; options: unknown }> = []
  const client = {
    schema: () => ({
      from: (table: string) => ({
        upsert: (payload: unknown, options: unknown) => {
          captured.push({ table, payload, options })
          return {
            select: () => ({
              single: async () => ({
                data: { id: returnId, normalized_text: (payload as { normalized_text: string }).normalized_text },
                error: null,
              }),
            }),
          }
        },
      }),
    }),
  } as never
  return { client, captured }
}

describe('capability-stage adapter — replaceAffixedFormPairs lesson-scoped delete', () => {
  // Captures the delete .in(column, values) so we can assert the scope.
  function buildAffixedClient() {
    const deletes: Array<{ column: string; values: unknown }> = []
    const inserts: unknown[][] = []
    const client = {
      schema: () => ({
        from: () => ({
          delete: () => ({
            in: (column: string, values: unknown) => {
              deletes.push({ column, values })
              return Promise.resolve({ error: null })
            },
          }),
          insert: (rows: unknown[]) => {
            inserts.push(rows)
            return Promise.resolve({ error: null })
          },
        }),
      }),
    } as never
    return { client, deletes, inserts }
  }

  const row = (capId: string, lessonId: string, root: string): AffixedFormPairRowInput => ({
    capability_id: capId,
    source_ref: `lesson-23/morphology/-i${root}-${root}i`,
    lesson_id: lessonId,
    root_text: root,
    derived_text: `${root}i`,
    allomorph_rule: '-i',
    grammar_pattern_id: 'gp-1',
    affix: '-i',
    affix_type: 'suffix',
    affix_gloss: 'verbal -i',
    allomorph_class: null,
    circumfix_left: null,
    circumfix_right: null,
    carrier_text: null,
    derived_gloss_nl: 'x',
    derived_gloss_en: 'x',
  })

  it('deletes by lesson_id (not the incoming capability_ids) so a dropped pair leaves no orphan row', async () => {
    // Regression (2026-06-24): regenerating the -i pool smaller left junk
    // affixed_form_pairs rows (adai/tahui) because the delete was keyed on the
    // incoming capability_ids — a removed pair's cap is absent from the write,
    // so its row was never deleted → HC33 drift. Delete-by-lesson clears the
    // whole projection first; the cap orphan-sweep preserves FSRS state.
    const { client, deletes } = buildAffixedClient()
    const inputs = [row('cap-a', 'L23', 'mula'), row('cap-b', 'L23', 'jalan')]
    const written = await replaceAffixedFormPairs(client, inputs)

    expect(written).toBe(2)
    expect(deletes).toHaveLength(1)
    expect(deletes[0].column).toBe('lesson_id')
    expect(deletes[0].values).toEqual(['L23'])
  })

  it('is a no-op when there are no inputs (does not blanket-delete the lesson)', async () => {
    const { client, deletes } = buildAffixedClient()
    const written = await replaceAffixedFormPairs(client, [])
    expect(written).toBe(0)
    expect(deletes).toHaveLength(0)
  })
})

describe('capability-stage adapter — upsertLearningItem activation', () => {
  it('always upserts with is_active: true so re-publishes reactivate items that were toggled off', async () => {
    // Regression: the 2026-04-24 incident left a pile of dialogue_chunk
    // learning_items with is_active=false. Re-publishing did not flip them
    // back on because the upsert payload omitted is_active. The
    // reactivate-dialogue-chunks.ts maintenance script was the workaround;
    // this lock-in test ensures the field stays in the payload so the
    // runner's upsert is itself the activation gate.
    const { client, captured } = buildPayloadCapturingClient('item-uuid-1')
    const input: LearningItemInput = {
      base_text: 'Apa kabar?',
      item_type: 'phrase',
      language: 'id',
      level: 'A1',
      source_type: 'lesson',
      pos: 'greeting',
    }
    const result = await upsertLearningItem(client, input)

    expect(result.id).toBe('item-uuid-1')
    expect(captured).toHaveLength(1)
    expect(captured[0].table).toBe('learning_items')
    const payload = captured[0].payload as Record<string, unknown>
    expect(payload.is_active).toBe(true)
    expect(payload.base_text).toBe('Apa kabar?')
    expect(payload.normalized_text).toBe('apa kabar?')
    expect(captured[0].options).toEqual({ onConflict: 'normalized_text' })
  })

  it('keeps is_active: true for dialogue_chunk items — the specific class the bug affected', async () => {
    const { client, captured } = buildPayloadCapturingClient('item-uuid-2')
    const input: LearningItemInput = {
      base_text: 'Aduh, kalau begitu, di mana lift?',
      item_type: 'dialogue_chunk',
      language: 'id',
      level: 'A1',
      source_type: 'lesson',
      review_status: 'published',
    }
    await upsertLearningItem(client, input)

    const payload = captured[0].payload as Record<string, unknown>
    expect(payload.is_active).toBe(true)
    expect(payload.item_type).toBe('dialogue_chunk')
    expect(payload.review_status).toBe('published')
  })
})

// ── PR 1.5: soft-retirement for orphaned capabilities ──────────────────────

// Captures upsertCapabilities payloads to assert the retired_at field is set
// to null (un-retire on re-emission contract).
function buildCapabilityUpsertCapturer() {
  const captured: Array<{ table: string; payload: Record<string, unknown>; options: unknown }> = []
  const client = {
    schema: () => ({
      from: (table: string) => ({
        upsert: (payload: Record<string, unknown>, options: unknown) => {
          captured.push({ table, payload, options })
          return {
            select: () => ({
              single: async () => ({
                data: { id: `cap-${captured.length}`, canonical_key: payload.canonical_key },
                error: null,
              }),
            }),
          }
        },
      }),
    }),
  } as never
  return { client, captured }
}

describe('capability-stage adapter — upsertCapabilities un-retires on re-emission', () => {
  it('every upsert payload sets retired_at: null so re-emitted caps come back active', async () => {
    const { client, captured } = buildCapabilityUpsertCapturer()
    const input: CapabilityInput = {
      canonicalKey: 'item:halo:recognition:l1-l2:visual',
      sourceKind: 'vocabulary_src',
      sourceRef: 'learning_items/halo',
      capabilityType: 'recognition',
      direction: 'l1-l2',
      modality: 'visual',
      learnerLanguage: 'nl',
      projectionVersion: 'capability-v3',
      lessonId: 'lesson-uuid-1',
      requiredArtifacts: [],
      prerequisiteKeys: [],
    }
    await upsertCapabilities(client, [input])
    expect(captured).toHaveLength(1)
    expect(captured[0].table).toBe('learning_capabilities')
    expect(captured[0].payload.retired_at).toBeNull()
    expect(captured[0].options).toEqual({ onConflict: 'canonical_key' })
  })
})

// Mock supabase client that supports the chains retireOrphanedCapabilities calls:
//   .from('learning_capabilities').select(...).eq('lesson_id', X).is('retired_at', null)
//   .from('learning_capabilities').update({ retired_at, updated_at }).in('id', ids)
//   .from('learner_capability_state').update({ next_due_at: null }).in('capability_id', ids)  ← M1
// `updateCalls` records ONLY the learning_capabilities retire update; `stateClearCalls`
// records the companion next_due_at clear so tests can assert the M1 state write.
function buildRetireClient(activeCapsForLesson: Array<{ id: string; canonical_key: string }>) {
  const updateCalls: Array<{ payload: Record<string, unknown>; ids: string[] }> = []
  const stateClearCalls: Array<{ payload: Record<string, unknown>; capIds: string[] }> = []
  const client = {
    schema: () => ({
      from: (table: string) => {
        if (table === 'learner_capability_state') {
          return {
            update: (payload: Record<string, unknown>) => ({
              in: async (_column: string, capIds: string[]) => {
                stateClearCalls.push({ payload, capIds })
                return { error: null }
              },
            }),
          }
        }
        if (table !== 'learning_capabilities') throw new Error(`unexpected table: ${table}`)
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({ data: activeCapsForLesson, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            in: async (_column: string, ids: string[]) => {
              updateCalls.push({ payload, ids })
              return { error: null }
            },
          }),
        }
      },
    }),
  } as never
  return { client, updateCalls, stateClearCalls }
}

describe('capability-stage adapter — retireOrphanedCapabilities', () => {
  it('retires caps attached to the lesson that did NOT reappear in the emit set', async () => {
    const { client, updateCalls, stateClearCalls } = buildRetireClient([
      { id: 'cap-a', canonical_key: 'item:halo:recognition' },     // re-emitted → keep
      { id: 'cap-b', canonical_key: 'item:gone:recognition' },     // orphan    → retire
      { id: 'cap-c', canonical_key: 'item:halo:choose_form_ex' },     // re-emitted → keep
      { id: 'cap-d', canonical_key: 'dialogue_line:old-text:cl' }, // orphan    → retire
    ])
    const result = await retireOrphanedCapabilities(client, {
      lessonId: 'lesson-uuid-1',
      emittedKeys: ['item:halo:recognition', 'item:halo:choose_form_ex', 'item:new:recognition'],
    })
    expect(result.retiredCount).toBe(2)
    expect(result.retiredKeys.sort()).toEqual([
      'dialogue_line:old-text:cl',
      'item:gone:recognition',
    ])
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].ids.sort()).toEqual(['cap-b', 'cap-d'])
    expect(updateCalls[0].payload.retired_at).toEqual(expect.any(String))
    expect(updateCalls[0].payload.updated_at).toEqual(expect.any(String))
    // M1: the same retired ids get next_due_at cleared (HC14 invariant).
    expect(stateClearCalls).toHaveLength(1)
    expect(stateClearCalls[0].capIds.sort()).toEqual(['cap-b', 'cap-d'])
    expect(stateClearCalls[0].payload.next_due_at).toBeNull()
  })

  it('makes no update call when every active cap is in the emit set', async () => {
    const { client, updateCalls } = buildRetireClient([
      { id: 'cap-a', canonical_key: 'item:halo:recognition' },
    ])
    const result = await retireOrphanedCapabilities(client, {
      lessonId: 'lesson-uuid-1',
      emittedKeys: ['item:halo:recognition', 'item:halo:choose_form_ex'],
    })
    expect(result.retiredCount).toBe(0)
    expect(result.retiredKeys).toEqual([])
    expect(updateCalls).toHaveLength(0)
  })

  it('makes no update call when no caps are active under this lesson', async () => {
    const { client, updateCalls } = buildRetireClient([])
    const result = await retireOrphanedCapabilities(client, {
      lessonId: 'lesson-uuid-with-no-caps',
      emittedKeys: ['item:halo:recognition'],
    })
    expect(result.retiredCount).toBe(0)
    expect(updateCalls).toHaveLength(0)
  })

  it('retires every active cap when the emit set is empty (mass retire)', async () => {
    const { client, updateCalls } = buildRetireClient([
      { id: 'cap-a', canonical_key: 'item:halo:recognition' },
      { id: 'cap-b', canonical_key: 'item:halo:choose_form_ex' },
    ])
    const result = await retireOrphanedCapabilities(client, {
      lessonId: 'lesson-uuid-1',
      emittedKeys: [],
    })
    expect(result.retiredCount).toBe(2)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].ids.sort()).toEqual(['cap-a', 'cap-b'])
  })
})

// cap-v2 #161 (landmine 8a): with the item branch in the vocab module, the runner
// and publishVocabulary BOTH call retireOrphanedCapabilities for the same lesson
// with DISJOINT source-kind scopes + their own emit sets. The `.in('source_kind',…)`
// filter must keep each sweep from retiring the OTHER stage's live caps. This mock
// is scope-aware: `.in('source_kind', kinds)` filters the active set server-side.
function buildScopedRetireClient(
  allActive: Array<{ id: string; canonical_key: string; source_kind: string }>,
) {
  const updateCalls: Array<{ ids: string[] }> = []
  const result = (rows: typeof allActive) => {
    const thenable = Promise.resolve({ data: rows, error: null }) as Promise<{ data: typeof allActive; error: null }> & {
      in: (col: string, kinds: string[]) => Promise<{ data: typeof allActive; error: null }>
    }
    thenable.in = (_col: string, kinds: string[]) =>
      Promise.resolve({ data: rows.filter((r) => kinds.includes(r.source_kind)), error: null })
    return thenable
  }
  const client = {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ is: () => result(allActive) }) }),
        update: () => ({
          in: async (_col: string, ids: string[]) => {
            updateCalls.push({ ids })
            return { error: null }
          },
        }),
      }),
    }),
  } as never
  return { client, updateCalls }
}

describe('retireOrphanedCapabilities — source-kind scoping (cap-v2 #161 landmine 8a)', () => {
  // One lesson with both item caps (vocab module's) and non-item caps (runner's).
  const allActive = [
    { id: 'item-keep', canonical_key: 'item:halo:recognition', source_kind: 'vocabulary_src' },
    { id: 'item-orphan', canonical_key: 'item:gone:recognition', source_kind: 'vocabulary_src' },
    { id: 'pat-keep', canonical_key: 'pattern:meN:recognition', source_kind: 'grammar_pattern_src' },
    { id: 'dlg-orphan', canonical_key: 'dialogue_line:old:cl', source_kind: 'dialogue_line_src' },
  ]

  it("the runner's non-item sweep never retires item caps", async () => {
    const { client, updateCalls } = buildScopedRetireClient(allActive)
    const result = await retireOrphanedCapabilities(client, {
      lessonId: 'L',
      emittedKeys: ['pattern:meN:recognition'], // runner re-emitted the pattern; dialogue is an orphan
      sourceKinds: ['dialogue_line_src', 'grammar_pattern_src', 'word_form_pair_src'],
    })
    // Only the dialogue orphan is retired; NEITHER item cap is touched.
    expect(result.retiredKeys).toEqual(['dialogue_line:old:cl'])
    expect(updateCalls[0].ids).toEqual(['dlg-orphan'])
    expect(updateCalls[0].ids).not.toContain('item-keep')
    expect(updateCalls[0].ids).not.toContain('item-orphan')
  })

  it("the vocab module's item sweep never retires non-item caps", async () => {
    const { client, updateCalls } = buildScopedRetireClient(allActive)
    const result = await retireOrphanedCapabilities(client, {
      lessonId: 'L',
      emittedKeys: ['item:halo:recognition'], // vocab re-emitted halo; gone is an orphan
      sourceKinds: ['vocabulary_src'],
    })
    // Only the item orphan is retired; NEITHER non-item cap is touched.
    expect(result.retiredKeys).toEqual(['item:gone:recognition'])
    expect(updateCalls[0].ids).toEqual(['item-orphan'])
    expect(updateCalls[0].ids).not.toContain('pat-keep')
    expect(updateCalls[0].ids).not.toContain('dlg-orphan')
  })
})

// ── Readiness↔artifact reconciliation (2026-06-14 spec) ────────────────────

// Mock supporting the chains reconcileArtifactPresence + findCapsMissingSatellite use:
//   .from('learning_capabilities').select(...).eq().eq().eq().is().in('source_kind', kinds)  → caps
//   .from('learning_capabilities').update({ retired_at }).in('id', ids)                       → retireUpdate
//   .from('learner_capability_state').update({ next_due_at: null }).in('capability_id', ids)  → stateClear
//   .from(<satellite table>).select(...).in(...)/.eq(...)                                     → tables[table]
function buildReconcileClient(
  caps: Array<Record<string, unknown>>,
  tables: Record<string, Array<Record<string, unknown>>>,
) {
  const retireUpdate: Array<{ payload: Record<string, unknown>; ids: string[] }> = []
  const stateClear: Array<{ payload: Record<string, unknown>; capIds: string[] }> = []
  function chain(rows: Array<Record<string, unknown>>): never {
    const p = Promise.resolve({ data: rows, error: null })
    return {
      select: () => chain(rows),
      eq: () => chain(rows),
      is: () => chain(rows),
      in: (col: string, vals: string[]) => chain(rows.filter((r) => vals.includes(r[col] as string))),
      then: p.then.bind(p),
      catch: p.catch.bind(p),
      finally: p.finally.bind(p),
    } as never
  }
  const client = {
    schema: () => ({
      from: (table: string) => {
        if (table === 'learning_capabilities') {
          return {
            select: () => chain(caps),
            update: (payload: Record<string, unknown>) => ({
              in: async (_c: string, ids: string[]) => { retireUpdate.push({ payload, ids }); return { error: null } },
            }),
          }
        }
        if (table === 'learner_capability_state') {
          return {
            update: (payload: Record<string, unknown>) => ({
              in: async (_c: string, capIds: string[]) => { stateClear.push({ payload, capIds }); return { error: null } },
            }),
          }
        }
        return { select: () => chain(tables[table] ?? []) }
      },
    }),
  } as never
  return { client, retireUpdate, stateClear }
}

describe('capability-stage adapter — reconcileArtifactPresence', () => {
  const dlgCap = (id: string) => ({
    id,
    canonical_key: `dialogue_line:${id}:produce_form_from_context_cap`,
    source_kind: 'dialogue_line_src',
    source_ref: `lesson-1/section-3/line-${id}`,
    capability_type: 'produce_form_from_context_cap',
  })

  it('soft-retires a ready+published dialogue cap whose dialogue_clozes row vanished, and clears next_due_at', async () => {
    const { client, retireUpdate, stateClear } = buildReconcileClient(
      [dlgCap('keep'), dlgCap('orphan')],
      { dialogue_clozes: [{ capability_id: 'keep' }] }, // 'orphan' has no cloze row
    )
    const result = await reconcileArtifactPresence(client, {
      lessonId: 'L1',
      sourceKinds: ['dialogue_line_src', 'grammar_pattern_src', 'word_form_pair_src'],
    })
    expect(result.retiredKeys).toEqual(['dialogue_line:orphan:produce_form_from_context_cap'])
    expect(retireUpdate).toHaveLength(1)
    expect(retireUpdate[0].ids).toEqual(['orphan'])
    expect(retireUpdate[0].payload.retired_at).toEqual(expect.any(String))
    // M1: the retired cap's scheduler row is cleared.
    expect(stateClear).toHaveLength(1)
    expect(stateClear[0].capIds).toEqual(['orphan'])
    expect(stateClear[0].payload.next_due_at).toBeNull()
  })

  it('retires nothing (and writes nothing) when every cap has its satellite row', async () => {
    const { client, retireUpdate, stateClear } = buildReconcileClient(
      [dlgCap('a'), dlgCap('b')],
      { dialogue_clozes: [{ capability_id: 'a' }, { capability_id: 'b' }] },
    )
    const result = await reconcileArtifactPresence(client, {
      lessonId: 'L1',
      sourceKinds: ['dialogue_line_src', 'grammar_pattern_src', 'word_form_pair_src'],
    })
    expect(result.retiredCount).toBe(0)
    expect(retireUpdate).toHaveLength(0)
    expect(stateClear).toHaveLength(0)
  })

  it('is a no-op for the item scope — item caps have no satellite predicate (§2c)', async () => {
    const itemCap = {
      id: 'i1', canonical_key: 'item:halo:recognition',
      source_kind: 'vocabulary_src', source_ref: 'learning_items/halo', capability_type: 'recognition',
    }
    const { client, retireUpdate } = buildReconcileClient([itemCap], {})
    const result = await reconcileArtifactPresence(client, { lessonId: 'L1', sourceKinds: ['vocabulary_src'] })
    expect(result.retiredCount).toBe(0)
    expect(retireUpdate).toHaveLength(0)
  })

  it('short-circuits on an empty sourceKinds scope', async () => {
    const { client, retireUpdate } = buildReconcileClient([dlgCap('x')], {})
    const result = await reconcileArtifactPresence(client, { lessonId: 'L1', sourceKinds: [] })
    expect(result.retiredCount).toBe(0)
    expect(retireUpdate).toHaveLength(0)
  })
})
