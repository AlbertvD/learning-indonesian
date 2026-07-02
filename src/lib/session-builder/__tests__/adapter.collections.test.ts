import { describe, expect, it } from 'vitest'
import { createSessionBuilderAdapter } from '@/lib/session-builder/adapter'

// Post-RPC-cutover (docs/plans/2026-07-02-session-data-narrowing-rpc.md):
// loadCapabilitySessionData is now a single `.rpc('get_session_build_data', ...)`
// call returning one jsonb payload. This mock captures the RPC args (so a test
// can assert on them) and resolves with a caller-supplied payload shaped like
// the RPC's jsonb_build_object output.
function mockRpcClient(payload: Record<string, unknown>) {
  let capturedArgs: Record<string, unknown> | undefined
  return {
    client: {
      schema: () => ({
        from: () => { throw new Error('loadCapabilitySessionData should call .rpc(), not .from()') },
        rpc: (fn: string, args: Record<string, unknown>) => {
          expect(fn).toBe('get_session_build_data')
          capturedArgs = args
          return Promise.resolve({ data: payload, error: null })
        },
      }),
    },
    getCapturedArgs: () => capturedArgs,
  }
}

const baseRequest = {
  userId: 'user-1',
  mode: 'standard' as const,
  now: new Date('2026-04-25T00:00:00.000Z'),
  limit: 100,
  preferredSessionSize: 15,
}

const emptyPayload = {
  capabilities: [],
  learner_states: [],
  activated_lesson_ids: [],
  lessons: [],
  reviewed_today_capability_ids: [],
  activated_member_refs: [],
}

describe('session-builder adapter — RPC wiring (get_session_build_data)', () => {
  it('resolves plannerInput.activatedCollectionRefs from the RPC activated_member_refs field', async () => {
    const { client } = mockRpcClient({
      ...emptyPayload,
      activated_member_refs: ['learning_items/yang', 'learning_items/di'],
    })
    const adapter = createSessionBuilderAdapter(client as any)

    const snapshot = await adapter.loadCapabilitySessionData(baseRequest)

    expect(snapshot.plannerInput.activatedCollectionRefs).toEqual(
      new Set(['learning_items/yang', 'learning_items/di']),
    )
  })

  it('resolves an empty set when the RPC returns no activated member refs', async () => {
    const { client } = mockRpcClient(emptyPayload)
    const adapter = createSessionBuilderAdapter(client as any)

    const snapshot = await adapter.loadCapabilitySessionData(baseRequest)

    expect(snapshot.plannerInput.activatedCollectionRefs).toEqual(new Set())
  })

  it('passes p_user_id, p_mode, p_selected_source_refs, and p_day_start (browser-local midnight) to the RPC', async () => {
    const { client, getCapturedArgs } = mockRpcClient(emptyPayload)
    const adapter = createSessionBuilderAdapter(client as any)

    await adapter.loadCapabilitySessionData({
      ...baseRequest,
      mode: 'affix_practice',
      selectedSourceRefs: ['affixed_form_pairs/meN-ajar'],
      now: new Date('2026-04-25T13:30:00.000Z'),
    })

    const args = getCapturedArgs()
    expect(args).toEqual(expect.objectContaining({
      p_user_id: 'user-1',
      p_mode: 'affix_practice',
      p_selected_source_refs: ['affixed_form_pairs/meN-ajar'],
    }))
    // p_day_start is browser-local midnight for request.now, ISO-serialized.
    const expectedDayStart = new Date('2026-04-25T13:30:00.000Z')
    expectedDayStart.setHours(0, 0, 0, 0)
    expect(args?.p_day_start).toBe(expectedDayStart.toISOString())
  })

  it('defaults p_selected_source_refs to [] when the request has none', async () => {
    const { client, getCapturedArgs } = mockRpcClient(emptyPayload)
    const adapter = createSessionBuilderAdapter(client as any)

    await adapter.loadCapabilitySessionData(baseRequest)

    expect(getCapturedArgs()?.p_selected_source_refs).toEqual([])
  })

  it('assembles capabilitiesByKey, schedulerRows, and reviewedTodayRefs from the RPC payload', async () => {
    const { client } = mockRpcClient({
      capabilities: [{
        id: 'cap-1',
        canonical_key: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
        source_kind: 'vocabulary_src',
        source_ref: 'learning_items/makan',
        capability_type: 'recall_meaning_from_text_cap',
        direction: 'id_to_l1',
        modality: 'text',
        learner_language: 'nl',
        projection_version: 'capability-v3',
        readiness_status: 'ready',
        publication_status: 'published',
        lesson_id: 'lesson-1',
        prerequisite_keys: [],
      }],
      learner_states: [{
        id: 'state-1',
        user_id: 'user-1',
        capability_id: 'cap-1',
        canonical_key_snapshot: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
        activation_state: 'active',
        stability: 2,
        difficulty: 5,
        last_reviewed_at: '2026-04-24T10:00:00.000Z',
        next_due_at: '2026-04-25T09:00:00.000Z',
        review_count: 1,
        lapse_count: 0,
        consecutive_failure_count: 0,
        state_version: 1,
      }],
      activated_lesson_ids: ['lesson-1'],
      lessons: [{ id: 'lesson-1', order_index: 1 }],
      reviewed_today_capability_ids: ['cap-1'],
      activated_member_refs: [],
    })
    const adapter = createSessionBuilderAdapter(client as any)

    const snapshot = await adapter.loadCapabilitySessionData(baseRequest)

    expect(snapshot.capabilitiesByKey.has('cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl')).toBe(true)
    expect(snapshot.schedulerRows).toHaveLength(1)
    expect(snapshot.schedulerRows[0]?.capabilityId).toBe('cap-1')
    expect(snapshot.reviewedTodayRefs).toEqual(new Set(['learning_items/makan']))
    expect(snapshot.plannerInput.activatedLessons).toEqual(new Set(['lesson-1']))
    expect(snapshot.currentLessonId).toBe('lesson-1')
  })

  it('propagates an RPC error instead of swallowing it', async () => {
    const client = {
      schema: () => ({
        from: () => { throw new Error('should not call .from()') },
        rpc: () => Promise.resolve({ data: null, error: new Error('rpc failed') }),
      }),
    }
    const adapter = createSessionBuilderAdapter(client as any)

    await expect(adapter.loadCapabilitySessionData(baseRequest)).rejects.toThrow('rpc failed')
  })
})
