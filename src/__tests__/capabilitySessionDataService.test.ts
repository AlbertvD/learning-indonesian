import { describe, expect, it, vi } from 'vitest'
import { createSessionBuilderAdapter } from '@/lib/session-builder/adapter'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

// Post-RPC-cutover (docs/plans/2026-07-02-session-data-narrowing-rpc.md):
// loadCapabilitySessionData is now a single `.rpc('get_session_build_data', ...)`
// call returning one jsonb payload shaped like the RPC's jsonb_build_object
// output. This mock resolves that call with a caller-supplied payload and fails
// loudly if the adapter falls back to `.from()` (it must not — the six-query
// fan-out is deleted).
function rpcClient(payload: Record<string, unknown>) {
  return {
    schema: () => ({
      from: () => { throw new Error('loadCapabilitySessionData should call .rpc(), not .from()') },
      rpc: () => Promise.resolve({ data: payload, error: null }),
    }),
  }
}

const emptyPayload = {
  capabilities: [],
  learner_states: [],
  activated_lesson_ids: [],
  lessons: [],
  reviewed_today_capability_ids: [],
  activated_member_refs: [],
}

describe('capability session data service', () => {
  it('derives planner dueCount from schedulable due rows only', async () => {
    const service = createSessionBuilderAdapter(rpcClient({
      ...emptyPayload,
      // The RPC's candidate_caps predicate requires readiness_status='ready' AND
      // publication_status='published' at the top level (in addition to the A-E
      // OR), so a 'blocked' capability never appears in the payload's
      // `capabilities` array — same as the old query's `.eq('readiness_status',
      // 'ready')` filter. capability-2 (blocked) is therefore absent here.
      capabilities: [{
        id: 'capability-1',
        canonical_key: 'capability-key',
        source_kind: 'vocabulary_src',
        source_ref: 'learning_items/item-1',
        capability_type: 'recognise_meaning_from_text_cap',
        direction: 'id_to_l1',
        modality: 'text',
        learner_language: 'nl',
        projection_version: 'capability-v2',
        readiness_status: 'ready',
        publication_status: 'published',
        lesson_id: 'lesson-uuid-1',
        prerequisite_keys: [],
      }],
      // learner_states is the learner's FULL state set (clause A is
      // unconditional) — includes state-2, which points at the blocked
      // capability-2 and is not in `capabilities`. The adapter's existing
      // capabilityById.has(...) filter drops it, exactly as before.
      learner_states: [{
        id: 'state-1',
        user_id: 'user-1',
        capability_id: 'capability-1',
        canonical_key_snapshot: 'capability-key',
        activation_state: 'active',
        stability: 1,
        difficulty: 5,
        last_reviewed_at: '2026-04-24T00:00:00.000Z',
        next_due_at: '2026-04-25T00:00:00.000Z',
        review_count: 2,
        lapse_count: 0,
        consecutive_failure_count: 0,
        state_version: 1,
      }, {
        id: 'state-2',
        user_id: 'user-1',
        capability_id: 'capability-2',
        canonical_key_snapshot: 'blocked-key',
        activation_state: 'active',
        stability: 1,
        difficulty: 5,
        last_reviewed_at: '2026-04-24T00:00:00.000Z',
        next_due_at: '2026-04-25T00:00:00.000Z',
        review_count: 2,
        lapse_count: 0,
        consecutive_failure_count: 0,
        state_version: 1,
      }, {
        id: 'state-3',
        user_id: 'user-1',
        capability_id: 'capability-1',
        canonical_key_snapshot: 'capability-key',
        activation_state: 'suspended',
        stability: 1,
        difficulty: 5,
        last_reviewed_at: '2026-04-24T00:00:00.000Z',
        next_due_at: '2026-04-25T00:00:00.000Z',
        review_count: 2,
        lapse_count: 0,
        consecutive_failure_count: 0,
        state_version: 1,
      }],
    }))

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    })

    expect(snapshot.plannerInput.dueCount).toBe(1)
  })

  it('passes production planner gates from metadata and learner state', async () => {
    const service = createSessionBuilderAdapter(rpcClient({
      ...emptyPayload,
      capabilities: [{
        id: 'capability-1',
        canonical_key: 'capability-key',
        source_kind: 'vocabulary_src',
        source_ref: 'learning_items/item-1',
        capability_type: 'recognise_meaning_from_text_cap',
        direction: 'id_to_l1',
        modality: 'text',
        learner_language: 'nl',
        projection_version: 'capability-v2',
        readiness_status: 'ready',
        publication_status: 'published',
        lesson_id: 'lesson-uuid-1',
        prerequisite_keys: [],
      }],
      learner_states: [{
        id: 'state-1',
        user_id: 'user-1',
        capability_id: 'capability-1',
        canonical_key_snapshot: 'capability-key',
        activation_state: 'active',
        stability: 1,
        difficulty: 5,
        last_reviewed_at: '2026-04-25T11:30:00.000Z',
        next_due_at: '2026-04-26T00:00:00.000Z',
        review_count: 3,
        lapse_count: 1,
        consecutive_failure_count: 2,
        state_version: 1,
      }],
      activated_lesson_ids: ['lesson-uuid-1'],
    }))

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    })

    expect(snapshot.plannerInput.readyCapabilities[0]).toEqual(expect.objectContaining({
      lessonId: 'lesson-uuid-1',
    }))
    expect(snapshot.plannerInput.activatedLessons).toEqual(new Set(['lesson-uuid-1']))
    expect(snapshot.plannerInput.recentFailures).toEqual([{
      canonicalKey: 'capability-key',
      failedAt: '2026-04-25T11:30:00.000Z',
      consecutiveFailures: 2,
    }])
    expect(snapshot.plannerInput.learnerCapabilityStates[0]?.successfulReviewCount).toBe(0)
  })

  it('loads Dutch-to-Indonesian choice as ready planner material', async () => {
    const service = createSessionBuilderAdapter(rpcClient({
      ...emptyPayload,
      capabilities: [{
        id: 'choice-capability',
        canonical_key: 'cap:v1:vocabulary_src:learning_items/item-1:recognise_form_from_meaning_cap:l1_to_id:text:nl',
        source_kind: 'vocabulary_src',
        source_ref: 'learning_items/item-1',
        capability_type: 'recognise_form_from_meaning_cap',
        direction: 'l1_to_id',
        modality: 'text',
        learner_language: 'nl',
        projection_version: 'capability-v2',
        readiness_status: 'ready',
        publication_status: 'published',
        lesson_id: 'lesson-uuid-1',
        prerequisite_keys: ['text-recognition-key'],
      }],
    }))

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    })

    expect(snapshot.readinessByKey.get('cap:v1:vocabulary_src:learning_items/item-1:recognise_form_from_meaning_cap:l1_to_id:text:nl')).toEqual({
      status: 'ready',
      allowedExercises: ['choose_form_ex'],
    })
    expect(snapshot.plannerInput.readyCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        canonicalKey: 'cap:v1:vocabulary_src:learning_items/item-1:recognise_form_from_meaning_cap:l1_to_id:text:nl',
        capabilityType: 'recognise_form_from_meaning_cap',
        // cap-v2 Slice 1 mis-level fix: recognise_form_from_meaning_cap is recognition, not recall.
        skillType: 'recognise_mode',
      }),
    ]))
  })

  it('carries selected lesson scope into the planner snapshot', async () => {
    const service = createSessionBuilderAdapter(rpcClient(emptyPayload))

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'lesson_practice',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
      selectedLessonId: 'lesson-4',
      selectedSourceRefs: ['lesson-4', 'learning_items/makan'],
    })

    expect(snapshot.plannerInput.selectedLessonId).toBe('lesson-4')
    expect(snapshot.plannerInput.selectedSourceRefs).toEqual(['lesson-4', 'learning_items/makan'])
  })

  it('exposes the activated-lessons set so the planner can gate lesson-scoped capabilities', async () => {
    const service = createSessionBuilderAdapter(rpcClient({
      ...emptyPayload,
      activated_lesson_ids: ['lesson-a', 'lesson-b'],
    }))

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    })

    expect(snapshot.plannerInput.activatedLessons).toEqual(new Set(['lesson-a', 'lesson-b']))
  })

  it('resolves reviewedTodayRefs from today\'s review events via capability_id → source_ref', async () => {
    const service = createSessionBuilderAdapter(rpcClient({
      ...emptyPayload,
      capabilities: [{
        id: 'capability-1',
        canonical_key: 'capability-key',
        source_kind: 'vocabulary_src',
        source_ref: 'learning_items/paman',
        capability_type: 'recognise_meaning_from_text_cap',
        direction: 'id_to_l1',
        modality: 'text',
        learner_language: 'nl',
        projection_version: 'capability-v3',
        readiness_status: 'ready',
        publication_status: 'published',
        lesson_id: 'lesson-uuid-1',
        prerequisite_keys: [],
      }],
      // The RPC's reviewed_today CTE is `select distinct e.capability_id`, so
      // repeat reviews of the same capability today collapse to one entry —
      // the adapter's Set-based accumulation is idempotent over this either way.
      reviewed_today_capability_ids: ['capability-1'],
    }))

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    })

    expect(snapshot.reviewedTodayRefs).toEqual(new Set(['learning_items/paman']))
  })

  describe('lesson progression (drying inputs)', () => {
    function adapterFor(input: {
      activations: Array<{ lesson_id: string }>
      lessons: Array<{ id: string; order_index: number }>
    }) {
      return createSessionBuilderAdapter(rpcClient({
        ...emptyPayload,
        activated_lesson_ids: input.activations.map(a => a.lesson_id),
        lessons: input.lessons,
      }))
    }

    const loadRequest = {
      userId: 'user-1',
      mode: 'standard' as const,
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    }

    it('reports null/false when the learner has no activations', async () => {
      const snapshot = await adapterFor({
        activations: [],
        lessons: [
          { id: 'lesson-1-uuid', order_index: 1 },
          { id: 'lesson-2-uuid', order_index: 2 },
        ],
      }).loadCapabilitySessionData(loadRequest)
      expect(snapshot.currentLessonId).toBeNull()
      expect(snapshot.nextLessonNeedsExposure).toBe(false)
    })

    it('picks the highest-order_index activated lesson as the current lesson', async () => {
      const snapshot = await adapterFor({
        activations: [
          { lesson_id: 'lesson-1-uuid' },
          { lesson_id: 'lesson-2-uuid' },
        ],
        lessons: [
          { id: 'lesson-1-uuid', order_index: 1 },
          { id: 'lesson-2-uuid', order_index: 2 },
          { id: 'lesson-3-uuid', order_index: 3 },
        ],
      }).loadCapabilitySessionData(loadRequest)
      expect(snapshot.currentLessonId).toBe('lesson-2-uuid')
      expect(snapshot.nextLessonNeedsExposure).toBe(true)
    })

    it('reports nextLessonNeedsExposure=false when the next lesson is already activated', async () => {
      const snapshot = await adapterFor({
        activations: [
          { lesson_id: 'lesson-1-uuid' },
          { lesson_id: 'lesson-2-uuid' },
        ],
        lessons: [
          { id: 'lesson-1-uuid', order_index: 1 },
          { id: 'lesson-2-uuid', order_index: 2 },
        ],
      }).loadCapabilitySessionData(loadRequest)
      expect(snapshot.currentLessonId).toBe('lesson-2-uuid')
      expect(snapshot.nextLessonNeedsExposure).toBe(false)
    })

    it('reports nextLessonNeedsExposure=false on the final lesson (no order_index + 1 exists)', async () => {
      const snapshot = await adapterFor({
        activations: [{ lesson_id: 'lesson-3-uuid' }],
        lessons: [
          { id: 'lesson-1-uuid', order_index: 1 },
          { id: 'lesson-2-uuid', order_index: 2 },
          { id: 'lesson-3-uuid', order_index: 3 },
        ],
      }).loadCapabilitySessionData(loadRequest)
      expect(snapshot.currentLessonId).toBe('lesson-3-uuid')
      expect(snapshot.nextLessonNeedsExposure).toBe(false)
    })
  })
})
