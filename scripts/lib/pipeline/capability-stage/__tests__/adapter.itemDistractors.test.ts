/**
 * Task 6b: idempotent item write functions — TDD tests.
 *
 * Covers:
 *   1. upsertItemDistractors — skip-if-exists on capability_id (all 3 tables)
 *   2. deleteItemDistractors — removes rows for given capabilityIds from all 3 tables
 *   3. upsertLearningItemIdempotent — check-then-write: on existing row, issues
 *      .update({translation_nl, translation_en}) only; pos/level/base_text preserved.
 *      On new row, issues .insert with the full payload.
 *   4. upsertCapabilitiesSkipIfExists — .upsert with ignoreDuplicates:true;
 *      an existing row survives untouched (FSRS state / corrections preserved)
 *
 * REGRESSION GUARD NOTES (what each mock is designed to catch):
 *   - buildDistractorClient: the mock exposes `.upsert` (not `.insert`) and
 *     only skips rows when ignoreDuplicates:true is passed. If the implementation
 *     reverts to `.insert`, the mock's `.upsert` won't be called and insert
 *     will throw — this catches the regression.
 *   - buildItemWriteClient: on the UPDATE path, the test asserts that ONLY
 *     {translation_nl, translation_en} are in the update payload, and that
 *     `.update` (not `.upsert`) was called. A revert to full-column `.upsert`
 *     would call `.upsert` instead of `.update`, failing the "updateCalls.length=1"
 *     assertion and the "pos not in update payload" assertion.
 *   - buildCapabilityUpsertClient: asserts `.upsert` is called (not `.insert`)
 *     with ignoreDuplicates:true and onConflict:'canonical_key'. A revert to
 *     `.insert(rows, {...})` fails the "upsertCalls.length=1" assertion.
 */

import { describe, expect, it } from 'vitest'

import {
  deleteItemDistractors,
  upsertCapabilitiesSkipIfExists,
  upsertItemDistractors,
  upsertLearningItemIdempotent,
  type CapabilityInput,
  type ItemDistractorRow,
  type LearningItemInput,
} from '../adapter'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Mock client for upsertItemDistractors and deleteItemDistractors.
 *
 * Exposes `.upsert` (the real API) — NOT `.insert`. This means if the
 * implementation calls `.insert`, it will hit an undefined method and throw,
 * catching the regression immediately.
 *
 * upsert with ignoreDuplicates:true skips rows whose capability_id is already
 * in existingCapabilityIds (mirroring INSERT ... ON CONFLICT DO NOTHING RETURNING *).
 */
function buildDistractorClient(existingCapabilityIds: Set<string> = new Set()) {
  const upserted: Record<string, Array<Record<string, unknown>>> = {
    recognition_mcq_distractors: [],
    cued_recall_distractors: [],
    cloze_mcq_item_distractors: [],
  }
  const deleted: Record<string, string[]> = {
    recognition_mcq_distractors: [],
    cued_recall_distractors: [],
    cloze_mcq_item_distractors: [],
  }

  const client = {
    schema: () => ({
      from: (table: string) => ({
        // Real API: .upsert exists; .insert does NOT exist (so a revert to .insert throws)
        upsert: (
          rows: Array<Record<string, unknown>>,
          opts: { onConflict?: string; ignoreDuplicates?: boolean },
        ) => {
          // ignoreDuplicates:true = ON CONFLICT DO NOTHING: skip already-existing rows.
          const toWrite =
            opts?.ignoreDuplicates
              ? rows.filter((r) => !existingCapabilityIds.has(r.capability_id as string))
              : rows
          upserted[table] ??= []
          upserted[table].push(...toWrite)
          // PostgREST RETURNING * only returns actually-inserted rows.
          return {
            select: () =>
              Promise.resolve({ data: toWrite, error: null }),
          }
        },
        delete: () => ({
          in: (_col: string, ids: string[]) => {
            deleted[table] ??= []
            deleted[table].push(...ids)
            return Promise.resolve({ error: null })
          },
        }),
      }),
    }),
  } as never

  return { client, upserted, deleted }
}

/**
 * Mock client for upsertLearningItemIdempotent.
 *
 * Models the check-then-write mechanic:
 *   - .select().eq().maybeSingle() -> returns existingRow (or null)
 *   - If exists: .update(payload).eq().select().single() -> records updateCalls
 *   - If new: .insert(payload).select().single() -> records insertCalls
 *
 * REGRESSION GUARD: If implementation reverts to a full-column .upsert, the
 * mock's .upsert path is not present on the from() builder here, so it throws —
 * catching the regression. Additionally, the existing-row test asserts
 * updateCalls.length===1 and that `pos` is NOT in the update payload.
 */
function buildItemWriteClient(existingRow: { id: string; normalized_text: string } | null = null) {
  const updateCalls: Array<Record<string, unknown>> = []
  const insertCalls: Array<Record<string, unknown>> = []

  const client = {
    schema: () => ({
      from: () => {
        return {
          // .select() chain — for the initial existence check
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existingRow, error: null }),
            }),
          }),
          // .update() chain — only called when row exists
          update: (payload: Record<string, unknown>) => {
            updateCalls.push(payload)
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: existingRow ?? { id: 'item-uuid', normalized_text: 'makan' },
                    error: null,
                  }),
                }),
              }),
            }
          },
          // .insert() chain — only called when row is new
          insert: (payload: Record<string, unknown>) => {
            insertCalls.push(payload)
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'new-uuid', normalized_text: (payload as Record<string, unknown>).normalized_text },
                  error: null,
                }),
              }),
            }
          },
        }
      },
    }),
  } as never

  return { client, updateCalls, insertCalls }
}

/**
 * Mock client for upsertCapabilitiesSkipIfExists.
 *
 * Exposes `.upsert` (not `.insert`). REGRESSION GUARD: if the implementation
 * calls `.insert`, it hits undefined and throws, catching the regression.
 *
 * upsert with ignoreDuplicates:true skips rows whose canonical_key is in existingKeys.
 */
function buildCapabilityUpsertClient(existingKeys: Set<string> = new Set()) {
  const upsertCalls: Array<{ rows: Array<Record<string, unknown>>; options: Record<string, unknown> }> = []

  const client = {
    schema: () => ({
      from: () => ({
        // Real API: .upsert exists; .insert does NOT (revert throws)
        upsert: (rows: Array<Record<string, unknown>>, options: Record<string, unknown>) => {
          upsertCalls.push({ rows, options })
          // Simulate DB skip: return only non-existing rows
          const returned = rows.filter((r) => !existingKeys.has(r.canonical_key as string))
          return {
            select: () =>
              Promise.resolve({
                data: returned.map((r) => ({
                  id: `cap-${r.canonical_key as string}`,
                  canonical_key: r.canonical_key as string,
                })),
                error: null,
              }),
          }
        },
      }),
    }),
  } as never

  return { client, upsertCalls }
}

// ---------------------------------------------------------------------------
// 1. upsertItemDistractors — skip-if-exists via .upsert
// ---------------------------------------------------------------------------

describe('upsertItemDistractors', () => {
  it('calls .upsert (not .insert) with ignoreDuplicates:true and onConflict:capability_id', async () => {
    const { client, upserted } = buildDistractorClient()
    const rows: ItemDistractorRow[] = [
      {
        capability_id: 'cap-1',
        recognition: ['eten', 'drinken', 'slapen'],
        cued_recall: ['makan', 'minum', 'tidur'],
        cloze: ['jalan', 'duduk', 'berdiri'],
      },
    ]
    const result = await upsertItemDistractors(client, rows)
    expect(result.written).toBe(1)
    expect(result.skipped).toBe(0)
    expect(upserted.recognition_mcq_distractors).toHaveLength(1)
    expect(upserted.recognition_mcq_distractors[0]).toMatchObject({
      capability_id: 'cap-1',
      distractors: ['eten', 'drinken', 'slapen'],
    })
    expect(upserted.cued_recall_distractors).toHaveLength(1)
    expect(upserted.cued_recall_distractors[0]).toMatchObject({
      capability_id: 'cap-1',
      distractors: ['makan', 'minum', 'tidur'],
    })
    expect(upserted.cloze_mcq_item_distractors).toHaveLength(1)
    expect(upserted.cloze_mcq_item_distractors[0]).toMatchObject({
      capability_id: 'cap-1',
      distractors: ['jalan', 'duduk', 'berdiri'],
    })
  })

  it('skips a capability_id that already has rows in all three tables', async () => {
    // existingCapabilityIds includes cap-1; upsert with ignoreDuplicates skips it
    const { client, upserted } = buildDistractorClient(new Set(['cap-1']))
    const rows: ItemDistractorRow[] = [
      {
        capability_id: 'cap-1',
        recognition: ['eten', 'drinken', 'slapen'],
        cued_recall: ['makan', 'minum', 'tidur'],
        cloze: ['jalan', 'duduk', 'berdiri'],
      },
    ]
    const result = await upsertItemDistractors(client, rows)
    expect(result.written).toBe(0)
    expect(result.skipped).toBe(1)
    expect(upserted.recognition_mcq_distractors).toHaveLength(0)
    expect(upserted.cued_recall_distractors).toHaveLength(0)
    expect(upserted.cloze_mcq_item_distractors).toHaveLength(0)
  })

  it('writes new caps and skips existing caps in a mixed batch', async () => {
    const { client, upserted } = buildDistractorClient(new Set(['cap-1']))
    const rows: ItemDistractorRow[] = [
      {
        capability_id: 'cap-1', // existing -> skip
        recognition: ['A', 'B', 'C'],
        cued_recall: ['D', 'E', 'F'],
        cloze: ['G', 'H', 'I'],
      },
      {
        capability_id: 'cap-2', // new -> write
        recognition: ['J', 'K', 'L'],
        cued_recall: ['M', 'N', 'O'],
        cloze: ['P', 'Q', 'R'],
      },
    ]
    const result = await upsertItemDistractors(client, rows)
    expect(result.written).toBe(1)
    expect(result.skipped).toBe(1)
    // Only cap-2 should appear in the upserted rows
    expect(upserted.recognition_mcq_distractors).toHaveLength(1)
    expect(upserted.recognition_mcq_distractors[0].capability_id).toBe('cap-2')
  })

  it('returns written=0 skipped=0 for empty input', async () => {
    const { client } = buildDistractorClient()
    const result = await upsertItemDistractors(client, [])
    expect(result.written).toBe(0)
    expect(result.skipped).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. deleteItemDistractors — destructive path for --regenerate
// ---------------------------------------------------------------------------

describe('deleteItemDistractors', () => {
  it('deletes from all three tables for the given capabilityIds', async () => {
    const { client, deleted } = buildDistractorClient()
    await deleteItemDistractors(client, ['cap-1', 'cap-2'])
    expect(deleted.recognition_mcq_distractors).toEqual(['cap-1', 'cap-2'])
    expect(deleted.cued_recall_distractors).toEqual(['cap-1', 'cap-2'])
    expect(deleted.cloze_mcq_item_distractors).toEqual(['cap-1', 'cap-2'])
  })

  it('no-ops for empty capabilityIds', async () => {
    const { client, deleted } = buildDistractorClient()
    await deleteItemDistractors(client, [])
    expect(deleted.recognition_mcq_distractors).toHaveLength(0)
    expect(deleted.cued_recall_distractors).toHaveLength(0)
    expect(deleted.cloze_mcq_item_distractors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 3. upsertLearningItemIdempotent — check-then-write
// ---------------------------------------------------------------------------

describe('upsertLearningItemIdempotent', () => {
  it('issues .insert with full payload for a new item (no existing row)', async () => {
    const { client, insertCalls, updateCalls } = buildItemWriteClient(null)
    const input: LearningItemInput = {
      base_text: 'makan',
      item_type: 'word',
      language: 'id',
      level: 'A1',
      source_type: 'lesson',
      pos: 'verb',
      translation_nl: 'eten',
      translation_en: 'to eat',
    }
    const result = await upsertLearningItemIdempotent(client, input)
    expect(result.normalized_text).toBe('makan')
    // INSERT path: updateCalls must be empty, insertCalls must have the full payload
    expect(updateCalls).toHaveLength(0)
    expect(insertCalls).toHaveLength(1)
    const payload = insertCalls[0] as Record<string, unknown>
    expect(payload.base_text).toBe('makan')
    expect(payload.pos).toBe('verb')
    expect(payload.translation_nl).toBe('eten')
    expect(payload.translation_en).toBe('to eat')
    expect(payload.is_active).toBe(true)
  })

  it('issues .update with ONLY translation columns on conflict (not full payload)', async () => {
    // Simulate existing row
    const existing = { id: 'existing-uuid', normalized_text: 'makan' }
    const { client, updateCalls, insertCalls } = buildItemWriteClient(existing)
    const input: LearningItemInput = {
      base_text: 'makan',
      item_type: 'word',
      language: 'id',
      level: 'A1',
      source_type: 'lesson',
      pos: 'verb', // pipeline emits pos, but this must NOT reach the UPDATE
      translation_nl: 'eten (nieuw)',
      translation_en: 'to eat (new)',
    }
    await upsertLearningItemIdempotent(client, input)
    // UPDATE path: insertCalls must be empty, updateCalls must have exactly the two translation columns
    expect(insertCalls).toHaveLength(0)
    expect(updateCalls).toHaveLength(1)
    const updatePayload = updateCalls[0] as Record<string, unknown>
    // Only translation columns are updated
    expect(updatePayload.translation_nl).toBe('eten (nieuw)')
    expect(updatePayload.translation_en).toBe('to eat (new)')
    // pos MUST NOT be in the update payload — DB-corrected pos is preserved
    expect('pos' in updatePayload).toBe(false)
    // Other capability-authored columns must not be in the update payload
    expect('level' in updatePayload).toBe(false)
    expect('base_text' in updatePayload).toBe(false)
    expect('is_active' in updatePayload).toBe(false)
  })

  it('preserves pos when updating translations: pos absent from update payload even when pipeline sends null', async () => {
    const existing = { id: 'buku-uuid', normalized_text: 'buku' }
    const { client, updateCalls } = buildItemWriteClient(existing)
    const input: LearningItemInput = {
      base_text: 'buku',
      item_type: 'word',
      language: 'id',
      level: 'A1',
      source_type: 'lesson',
      pos: null, // projector emits null; DB has 'noun' — must survive
      translation_nl: 'boek (bijgewerkt)',
      translation_en: 'book (updated)',
    }
    await upsertLearningItemIdempotent(client, input)
    expect(updateCalls).toHaveLength(1)
    const updatePayload = updateCalls[0] as Record<string, unknown>
    // pos must not appear in the update payload at all — not even as null
    expect('pos' in updatePayload).toBe(false)
    // Translation refresh is included
    expect(updatePayload.translation_nl).toBe('boek (bijgewerkt)')
  })
})

// ---------------------------------------------------------------------------
// 4. upsertCapabilitiesSkipIfExists — .upsert with ignoreDuplicates:true
// ---------------------------------------------------------------------------

describe('upsertCapabilitiesSkipIfExists', () => {
  it('calls .upsert (not .insert) with ignoreDuplicates:true and onConflict:canonical_key', async () => {
    const { client, upsertCalls } = buildCapabilityUpsertClient()
    const cap: CapabilityInput = {
      canonicalKey: 'item:makan:recognition:l1-l2:visual',
      sourceKind: 'vocabulary_src',
      sourceRef: 'learning_items/makan',
      capabilityType: 'recognition',
      direction: 'l1-l2',
      modality: 'visual',
      learnerLanguage: 'nl',
      projectionVersion: 'capability-v3',
      lessonId: 'lesson-uuid-1',
      requiredArtifacts: [],
      prerequisiteKeys: [],
    }
    const result = await upsertCapabilitiesSkipIfExists(client, [cap])
    // Must have called .upsert exactly once
    expect(upsertCalls).toHaveLength(1)
    // Must use ignoreDuplicates (ON CONFLICT DO NOTHING) so existing rows survive
    expect(upsertCalls[0].options.ignoreDuplicates).toBe(true)
    // Must conflict on canonical_key
    expect(upsertCalls[0].options.onConflict).toBe('canonical_key')
    expect(result.size).toBe(1)
    expect(result.has('item:makan:recognition:l1-l2:visual')).toBe(true)
  })

  it('returns empty map for an existing capability (skipped)', async () => {
    const existingKey = 'item:makan:recognition:l1-l2:visual'
    const { client } = buildCapabilityUpsertClient(new Set([existingKey]))
    const cap: CapabilityInput = {
      canonicalKey: existingKey,
      sourceKind: 'vocabulary_src',
      sourceRef: 'learning_items/makan',
      capabilityType: 'recognition',
      direction: 'l1-l2',
      modality: 'visual',
      learnerLanguage: 'nl',
      projectionVersion: 'capability-v3',
      lessonId: 'lesson-uuid-1',
      requiredArtifacts: [],
      prerequisiteKeys: [],
    }
    const result = await upsertCapabilitiesSkipIfExists(client, [cap])
    // Skipped row: DB returned nothing, map has no entry for this key
    expect(result.size).toBe(0)
  })

  it('does NOT include retired_at in the payload (preserves existing DB value)', async () => {
    const { client, upsertCalls } = buildCapabilityUpsertClient()
    const cap: CapabilityInput = {
      canonicalKey: 'item:makan:recognition:l1-l2:visual',
      sourceKind: 'vocabulary_src',
      sourceRef: 'learning_items/makan',
      capabilityType: 'recognition',
      direction: 'l1-l2',
      modality: 'visual',
      learnerLanguage: 'nl',
      projectionVersion: 'capability-v3',
      lessonId: 'lesson-uuid-1',
      requiredArtifacts: [],
      prerequisiteKeys: [],
    }
    await upsertCapabilitiesSkipIfExists(client, [cap])
    const rows = upsertCalls[0].rows as Array<Record<string, unknown>>
    // Unlike upsertCapabilities, the skip-if-exists path must NOT include
    // retired_at in the payload — new rows get NULL from the DB default;
    // existing rows keep whatever the DB says (preservation).
    expect('retired_at' in rows[0]).toBe(false)
  })

  it('handles an empty array without errors', async () => {
    const { client, upsertCalls } = buildCapabilityUpsertClient()
    const result = await upsertCapabilitiesSkipIfExists(client, [])
    expect(upsertCalls).toHaveLength(0)
    expect(result.size).toBe(0)
  })
})
