/**
 * Task 6b: idempotent item write functions — TDD tests.
 *
 * Covers:
 *   1. upsertItemDistractors — skip-if-exists on capability_id (all 3 tables)
 *   2. deleteItemDistractors — removes rows for given capabilityIds from all 3 tables
 *   3. upsertLearningItemIdempotent — on conflict(normalized_text) updates only
 *      translation_nl / translation_en; preserves pos and all other columns
 *   4. upsertCapabilitiesSkipIfExists — INSERT ... ON CONFLICT DO NOTHING;
 *      an existing row survives untouched (FSRS state / corrections preserved)
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

/** Records every insert call per table; simulates skip-if-exists by tracking
 *  which capability_ids are already "in the DB". */
function buildDistractorClient(
  existingCapabilityIds: Set<string> = new Set(),
) {
  const inserted: Record<string, Array<Record<string, unknown>>> = {
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
        insert: (rows: Array<Record<string, unknown>>, opts: Record<string, unknown>) => {
          // ignoreDuplicates mirrors ON CONFLICT DO NOTHING: skip rows whose
          // capability_id is already in existingCapabilityIds.
          const toWrite = opts?.ignoreDuplicates
            ? rows.filter(
                (r) => !existingCapabilityIds.has(r.capability_id as string),
              )
            : rows
          inserted[table] ??= []
          inserted[table].push(...toWrite)
          // Return data mirroring PostgREST "INSERT ... ON CONFLICT DO NOTHING RETURNING *":
          // only the rows that were actually inserted are returned. The function
          // uses this count (from the recognition table) to compute written vs skipped.
          return {
            select: () => ({
              then: (cb: (v: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
                cb({ data: toWrite, error: null }),
            }),
          }
        },
        delete: () => ({
          in: (_col: string, ids: string[]) => {
            deleted[table] ??= []
            deleted[table].push(...ids)
            return { then: (cb: (v: { error: null }) => unknown) => cb({ error: null }) }
          },
        }),
        upsert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => ({
              data: {
                id: 'item-uuid',
                normalized_text: payload.normalized_text as string,
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  } as never

  return { client, inserted, deleted }
}

/** Captures the upsert payload for upsertLearningItemIdempotent to assert
 *  column-restricted UPDATE mechanic. */
function buildItemUpsertCapturingClient() {
  const calls: Array<{
    payload: Record<string, unknown>
    options: Record<string, unknown>
  }> = []

  const client = {
    schema: () => ({
      from: () => ({
        upsert: (payload: Record<string, unknown>, options: Record<string, unknown>) => {
          calls.push({ payload, options })
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: 'item-uuid',
                  normalized_text: payload.normalized_text as string,
                },
                error: null,
              }),
            }),
          }
        },
      }),
    }),
  } as never

  return { client, calls }
}

/** Captures insert calls for upsertCapabilitiesSkipIfExists. */
function buildCapabilitySkipClient(existingKeys: Set<string> = new Set()) {
  const calls: Array<{ rows: Array<Record<string, unknown>>; options: Record<string, unknown> }> = []
  const client = {
    schema: () => ({
      from: () => ({
        insert: (rows: Array<Record<string, unknown>>, options: Record<string, unknown>) => {
          calls.push({ rows, options })
          // Simulate DB skip: return only non-existing rows
          const returned = rows.filter(
            (r) => !existingKeys.has(r.canonical_key as string),
          )
          return {
            select: () => ({
              then: (cb: (v: { data: Array<{ id: string; canonical_key: string }>; error: null }) => unknown) =>
                cb({
                  data: returned.map((r) => ({
                    id: `cap-${r.canonical_key as string}`,
                    canonical_key: r.canonical_key as string,
                  })),
                  error: null,
                }),
            }),
          }
        },
      }),
    }),
  } as never
  return { client, calls }
}

// ---------------------------------------------------------------------------
// 1. upsertItemDistractors — skip-if-exists
// ---------------------------------------------------------------------------

describe('upsertItemDistractors', () => {
  it('writes all three tables for a new capability_id', async () => {
    const { client, inserted } = buildDistractorClient()
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
    expect(inserted.recognition_mcq_distractors).toHaveLength(1)
    expect(inserted.recognition_mcq_distractors[0]).toMatchObject({
      capability_id: 'cap-1',
      distractors: ['eten', 'drinken', 'slapen'],
    })
    expect(inserted.cued_recall_distractors).toHaveLength(1)
    expect(inserted.cued_recall_distractors[0]).toMatchObject({
      capability_id: 'cap-1',
      distractors: ['makan', 'minum', 'tidur'],
    })
    expect(inserted.cloze_mcq_item_distractors).toHaveLength(1)
    expect(inserted.cloze_mcq_item_distractors[0]).toMatchObject({
      capability_id: 'cap-1',
      distractors: ['jalan', 'duduk', 'berdiri'],
    })
  })

  it('skips a capability_id that already has rows in all three tables', async () => {
    // All three tables already have cap-1
    const { client, inserted } = buildDistractorClient(new Set(['cap-1']))
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
    expect(inserted.recognition_mcq_distractors).toHaveLength(0)
    expect(inserted.cued_recall_distractors).toHaveLength(0)
    expect(inserted.cloze_mcq_item_distractors).toHaveLength(0)
  })

  it('writes new caps and skips existing caps in a mixed batch', async () => {
    const { client, inserted } = buildDistractorClient(new Set(['cap-1']))
    const rows: ItemDistractorRow[] = [
      {
        capability_id: 'cap-1', // existing → skip
        recognition: ['A', 'B', 'C'],
        cued_recall: ['D', 'E', 'F'],
        cloze: ['G', 'H', 'I'],
      },
      {
        capability_id: 'cap-2', // new → write
        recognition: ['J', 'K', 'L'],
        cued_recall: ['M', 'N', 'O'],
        cloze: ['P', 'Q', 'R'],
      },
    ]
    const result = await upsertItemDistractors(client, rows)
    expect(result.written).toBe(1)
    expect(result.skipped).toBe(1)
    // Only cap-2 should appear in the inserts
    expect(inserted.recognition_mcq_distractors).toHaveLength(1)
    expect(inserted.recognition_mcq_distractors[0].capability_id).toBe('cap-2')
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
// 3. upsertLearningItemIdempotent — translation-only UPDATE on conflict
// ---------------------------------------------------------------------------

describe('upsertLearningItemIdempotent', () => {
  it('sends a full payload for a new item (INSERT path)', async () => {
    const { client, calls } = buildItemUpsertCapturingClient()
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
    expect(calls).toHaveLength(1)
    // Full payload on insert
    const payload = calls[0].payload as Record<string, unknown>
    expect(payload.base_text).toBe('makan')
    expect(payload.pos).toBe('verb')
    expect(payload.translation_nl).toBe('eten')
    expect(payload.translation_en).toBe('to eat')
    expect(payload.is_active).toBe(true)
  })

  it('uses column-restricted UPDATE on conflict — only translation columns in updateColumns', async () => {
    const { client, calls } = buildItemUpsertCapturingClient()
    const input: LearningItemInput = {
      base_text: 'makan',
      item_type: 'word',
      language: 'id',
      level: 'A1',
      source_type: 'lesson',
      pos: 'verb',
      translation_nl: 'eten (nieuw)',
      translation_en: 'to eat (new)',
    }
    await upsertLearningItemIdempotent(client, input)
    expect(calls).toHaveLength(1)
    const options = calls[0].options as Record<string, unknown>
    // onConflict must target normalized_text
    expect(options.onConflict).toBe('normalized_text')
    // ignoreDuplicates must be false (we DO update on conflict)
    expect(options.ignoreDuplicates).toBeFalsy()
    // The update column list must include ONLY the lesson-derived columns
    const updateColumns = options.update as string | undefined
    // updateColumns should reference translation_nl and translation_en
    expect(updateColumns).toBeDefined()
    expect(updateColumns).toContain('translation_nl')
    expect(updateColumns).toContain('translation_en')
    // pos must NOT be in the update set
    expect(updateColumns).not.toContain('pos')
    // level must NOT be in the update set (capability-authored)
    expect(updateColumns).not.toContain('level')
    // base_text must NOT be in the update set (would silently clobber)
    expect(updateColumns).not.toContain('base_text')
  })

  it('preserves pos when updating translations on an existing row', async () => {
    // Simulate: row exists with pos='noun' and translation_nl='oud'.
    // Re-publish with new translation_nl; pos must survive.
    // We verify this at the adapter boundary: the upsert options restrict which
    // columns are updated on conflict. The actual DB merge is Postgres-side;
    // here we assert the correct conflict + update options are sent so the DB
    // preserves pos.
    const { client, calls } = buildItemUpsertCapturingClient()
    const input: LearningItemInput = {
      base_text: 'buku',
      item_type: 'word',
      language: 'id',
      level: 'A1',
      source_type: 'lesson',
      pos: null, // projector emits null pos (enrichment is lesson-stage's job)
      translation_nl: 'boek (bijgewerkt)',
      translation_en: 'book (updated)',
    }
    await upsertLearningItemIdempotent(client, input)

    const options = calls[0].options as Record<string, unknown>
    // The update option set must not include pos, so Postgres keeps the
    // existing DB value when the incoming pos is null.
    expect(options.update).not.toContain('pos')
    // Translation refresh is included
    expect(options.update as string).toContain('translation_nl')
  })
})

// ---------------------------------------------------------------------------
// 4. upsertCapabilitiesSkipIfExists — INSERT ... ON CONFLICT DO NOTHING
// ---------------------------------------------------------------------------

describe('upsertCapabilitiesSkipIfExists', () => {
  it('inserts a new capability and returns its id', async () => {
    const { client, calls } = buildCapabilitySkipClient()
    const cap: CapabilityInput = {
      canonicalKey: 'item:makan:recognition:l1-l2:visual',
      sourceKind: 'item',
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
    expect(calls).toHaveLength(1)
    // Must use ignoreDuplicates (ON CONFLICT DO NOTHING) so existing rows survive
    expect(calls[0].options.ignoreDuplicates).toBe(true)
    // Must conflict on canonical_key
    expect(calls[0].options.onConflict).toBe('canonical_key')
    expect(result.size).toBe(1)
    expect(result.has('item:makan:recognition:l1-l2:visual')).toBe(true)
  })

  it('returns empty map entry for an existing capability (skipped)', async () => {
    const existingKey = 'item:makan:recognition:l1-l2:visual'
    const { client } = buildCapabilitySkipClient(new Set([existingKey]))
    const cap: CapabilityInput = {
      canonicalKey: existingKey,
      sourceKind: 'item',
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

  it('does NOT set retired_at: null (preserves the existing DB value)', async () => {
    const { client, calls } = buildCapabilitySkipClient()
    const cap: CapabilityInput = {
      canonicalKey: 'item:makan:recognition:l1-l2:visual',
      sourceKind: 'item',
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
    const rows = calls[0].rows as Array<Record<string, unknown>>
    // Unlike upsertCapabilities, the skip-if-exists path must NOT include
    // retired_at in the payload — we are not resurrecting any cap; a new cap
    // starts with retired_at=null from the DB default; an existing cap keeps
    // whatever the DB says (preservation).
    expect('retired_at' in rows[0]).toBe(false)
  })

  it('handles an empty array without errors', async () => {
    const { client, calls } = buildCapabilitySkipClient()
    const result = await upsertCapabilitiesSkipIfExists(client, [])
    expect(calls).toHaveLength(0)
    expect(result.size).toBe(0)
  })
})
