import { describe, expect, it } from 'vitest'

import {
  insertExerciseVariantGrammar,
  insertExerciseVariantVocab,
  retireOrphanedCapabilities,
  upsertCapabilities,
  upsertCapabilityArtifacts,
  upsertLearningItem,
  type CapabilityArtifactInput,
  type CapabilityInput,
  type LearningItemInput,
} from '../adapter'

// Minimal Supabase mock that records upserts/inserts and returns the supplied
// id when the caller chains `.select('id').single()`. Mirrors the structure of
// the runner.test.ts mock so the two stay aligned.
function buildClient(idByTable: Record<string, string>) {
  return {
    schema: () => ({
      from: (table: string) => ({
        upsert: () => ({
          select: () => ({
            single: async () => ({ data: { id: idByTable[table] ?? null }, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: idByTable[table] ?? null }, error: null }),
          }),
        }),
      }),
    }),
  } as never
}

describe('capability-stage adapter — writer return contracts (F6-1 wiring)', () => {
  it('upsertCapabilityArtifacts returns one id per artifact so CS8 can validate them', async () => {
    const client = buildClient({ capability_artifacts: 'artifact-uuid-1' })
    const input: CapabilityArtifactInput = {
      capability_id: 'cap-1',
      artifact_kind: 'meaning:l1',
      quality_status: 'approved',
      artifact_ref: 'ref',
      artifact_json: { value: 'eten' },
      artifact_fingerprint: 'fp-1',
    }
    const ids = await upsertCapabilityArtifacts(client, [input, input])
    expect(ids).toEqual(['artifact-uuid-1', 'artifact-uuid-1'])
  })

  it('insertExerciseVariantGrammar returns the inserted id for CS8 wiring', async () => {
    const client = buildClient({ exercise_variants: 'variant-uuid-1' })
    const result = await insertExerciseVariantGrammar(client, {
      lesson_id: 'lesson-1',
      exercise_type: 'sentence_transformation',
      grammar_pattern_id: 'gp-1',
      payload_json: { prompt: 'x' },
      answer_key_json: { answer: 'y' },
    })
    expect(result).toEqual({ ok: true, id: 'variant-uuid-1' })
  })

  it('insertExerciseVariantVocab returns the inserted id for CS8 wiring', async () => {
    const client = buildClient({ exercise_variants: 'variant-uuid-2' })
    const result = await insertExerciseVariantVocab(client, {
      context_id: 'ctx-1',
      exercise_type: 'cloze_mcq',
      grammar_pattern_id: null,
      payload_json: { stem: 'x' },
      answer_key_json: { answer: 'y' },
    })
    expect(result).toEqual({ ok: true, id: 'variant-uuid-2' })
  })
})

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
      sourceKind: 'item',
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
function buildRetireClient(activeCapsForLesson: Array<{ id: string; canonical_key: string }>) {
  const updateCalls: Array<{ payload: Record<string, unknown>; ids: string[] }> = []
  const client = {
    schema: () => ({
      from: (table: string) => {
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
  return { client, updateCalls }
}

describe('capability-stage adapter — retireOrphanedCapabilities', () => {
  it('retires caps attached to the lesson that did NOT reappear in the emit set', async () => {
    const { client, updateCalls } = buildRetireClient([
      { id: 'cap-a', canonical_key: 'item:halo:recognition' },     // re-emitted → keep
      { id: 'cap-b', canonical_key: 'item:gone:recognition' },     // orphan    → retire
      { id: 'cap-c', canonical_key: 'item:halo:cued_recall' },     // re-emitted → keep
      { id: 'cap-d', canonical_key: 'dialogue_line:old-text:cl' }, // orphan    → retire
    ])
    const result = await retireOrphanedCapabilities(client, {
      lessonId: 'lesson-uuid-1',
      emittedKeys: ['item:halo:recognition', 'item:halo:cued_recall', 'item:new:recognition'],
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
  })

  it('makes no update call when every active cap is in the emit set', async () => {
    const { client, updateCalls } = buildRetireClient([
      { id: 'cap-a', canonical_key: 'item:halo:recognition' },
    ])
    const result = await retireOrphanedCapabilities(client, {
      lessonId: 'lesson-uuid-1',
      emittedKeys: ['item:halo:recognition', 'item:halo:cued_recall'],
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
      { id: 'cap-b', canonical_key: 'item:halo:cued_recall' },
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
