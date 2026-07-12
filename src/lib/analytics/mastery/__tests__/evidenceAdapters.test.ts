import { describe, it, expect } from 'vitest'
import { adaptMasteryEvidenceRpc, adaptFunnelSeriesEventRow } from '../masteryModel'

// Adapter-shape tests (docs/plans/2026-07-11-mastery-evidence-rpc-narrowing.md
// §6): RPC jsonb (snake_case, as Postgres returns it) → the row-typed shapes
// masteryModel's derivers consume.

describe('adaptMasteryEvidenceRpc', () => {
  it('maps a full payload snake_case → the row-typed shape', () => {
    const result = adaptMasteryEvidenceRpc({
      states: [{
        capability_id: 'cap-1',
        review_count: 3,
        lapse_count: 1,
        consecutive_failure_count: 0,
        stability: 12.5,
        last_reviewed_at: '2026-07-01T00:00:00.000Z',
      }],
      capabilities: [{
        id: 'cap-1',
        canonical_key: 'k1',
        source_kind: 'vocabulary_src',
        source_ref: 'learning_items/makan',
        capability_type: 'recognise_meaning_from_text_cap',
        modality: 'text',
        readiness_status: 'ready',
        publication_status: 'published',
        lesson_id: 'lesson-1',
      }],
      activated_lesson_ids: ['lesson-1', 'lesson-2'],
      lessons: [{ id: 'lesson-1', order_index: 1 }, { id: 'lesson-2', order_index: 2 }],
    } as never)

    expect(result.states).toHaveLength(1)
    expect(result.states[0]).toMatchObject({ capability_id: 'cap-1', review_count: 3 })
    expect(result.capabilities).toHaveLength(1)
    expect(result.capabilities[0]).toMatchObject({ id: 'cap-1', source_kind: 'vocabulary_src' })
    expect(result.activatedLessons).toEqual(new Set(['lesson-1', 'lesson-2']))
    expect(result.lessonOrderById).toEqual(new Map([['lesson-1', 1], ['lesson-2', 2]]))
  })

  it('preserves a null stability (not coerced to 0 or dropped)', () => {
    const result = adaptMasteryEvidenceRpc({
      states: [{
        capability_id: 'cap-1',
        review_count: 0,
        lapse_count: 0,
        consecutive_failure_count: 0,
        stability: null,
        last_reviewed_at: null,
      }],
    } as never)
    expect(result.states[0]!.stability).toBeNull()
    expect(result.states[0]!.last_reviewed_at).toBeNull()
  })

  it('defaults every key to empty when the payload has explicit empty arrays', () => {
    const result = adaptMasteryEvidenceRpc({ states: [], capabilities: [], activated_lesson_ids: [], lessons: [] })
    expect(result).toEqual({
      states: [],
      capabilities: [],
      activatedLessons: new Set(),
      lessonOrderById: new Map(),
    })
  })

  it('defaults every key to empty when keys are MISSING from the payload entirely', () => {
    expect(adaptMasteryEvidenceRpc({})).toEqual({
      states: [],
      capabilities: [],
      activatedLessons: new Set(),
      lessonOrderById: new Map(),
    })
  })

  it('defaults every key to empty for a null/undefined payload (RPC returned no rows)', () => {
    expect(adaptMasteryEvidenceRpc(null)).toEqual({
      states: [],
      capabilities: [],
      activatedLessons: new Set(),
      lessonOrderById: new Map(),
    })
    expect(adaptMasteryEvidenceRpc(undefined)).toEqual({
      states: [],
      capabilities: [],
      activatedLessons: new Set(),
      lessonOrderById: new Map(),
    })
  })
})

describe('adaptFunnelSeriesEventRow', () => {
  it('maps a full row, unpacking state_after_json into camelCase fields', () => {
    const event = adaptFunnelSeriesEventRow({
      id: 'evt-1',
      capability_id: 'cap-1',
      created_at: '2026-07-01T00:00:00.000Z',
      state_after_json: {
        reviewCount: 5,
        lapseCount: 1,
        consecutiveFailureCount: 0,
        stability: 14.2,
        lastReviewedAt: '2026-07-01T00:00:00.000Z',
      },
    })
    expect(event).toEqual({
      id: 'evt-1',
      capabilityId: 'cap-1',
      createdAt: '2026-07-01T00:00:00.000Z',
      reviewCount: 5,
      lapseCount: 1,
      consecutiveFailureCount: 0,
      stability: 14.2,
      lastReviewedAt: '2026-07-01T00:00:00.000Z',
    })
  })

  it('preserves a null stability from state_after_json (not coerced to 0)', () => {
    const event = adaptFunnelSeriesEventRow({
      id: 'evt-1',
      capability_id: 'cap-1',
      created_at: '2026-07-01T00:00:00.000Z',
      state_after_json: { reviewCount: 1, lapseCount: 0, consecutiveFailureCount: 0, stability: null, lastReviewedAt: null },
    })
    expect(event.stability).toBeNull()
    expect(event.lastReviewedAt).toBeNull()
  })

  it('defaults every counter to 0/null when state_after_json is null (missing keys)', () => {
    const event = adaptFunnelSeriesEventRow({
      id: 'evt-1',
      capability_id: 'cap-1',
      created_at: '2026-07-01T00:00:00.000Z',
      state_after_json: null,
    })
    expect(event).toEqual({
      id: 'evt-1',
      capabilityId: 'cap-1',
      createdAt: '2026-07-01T00:00:00.000Z',
      reviewCount: 0,
      lapseCount: 0,
      consecutiveFailureCount: 0,
      stability: null,
      lastReviewedAt: null,
    })
  })
})
