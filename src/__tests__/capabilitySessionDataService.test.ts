import { describe, expect, it, vi } from 'vitest'
import { createCapabilitySessionDataService } from '@/services/capabilitySessionDataService'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

function query(data: unknown[] = []) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data, error: null }),
  }
  return chain
}

describe('capability session data service', () => {
  it('derives planner dueCount from schedulable due rows only', async () => {
    const service = createCapabilitySessionDataService({
      schema: () => ({
        from: (table: string) => {
          if (table === 'learning_capabilities') {
            return query([{
              id: 'capability-1',
              canonical_key: 'capability-key',
              source_kind: 'item',
              source_ref: 'learning_items/item-1',
              capability_type: 'text_recognition',
              direction: 'id_to_l1',
              modality: 'text',
              learner_language: 'nl',
              projection_version: 'capability-v1',
              readiness_status: 'ready',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              metadata_json: {
                skillType: 'recognition',
                requiredArtifacts: [],
                prerequisiteKeys: [],
                requiredSourceProgress: {
                  kind: 'source_progress',
                  sourceRef: 'learning_items/item-1',
                  requiredState: 'section_exposed',
                },
                difficultyLevel: 1,
                goalTags: [],
              },
            }, {
              id: 'capability-2',
              canonical_key: 'blocked-key',
              source_kind: 'item',
              source_ref: 'learning_items/item-2',
              capability_type: 'text_recognition',
              direction: 'id_to_l1',
              modality: 'text',
              learner_language: 'nl',
              projection_version: 'capability-v1',
              readiness_status: 'blocked',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              metadata_json: {
                skillType: 'recognition',
                requiredArtifacts: [],
                prerequisiteKeys: [],
                requiredSourceProgress: {
                  kind: 'source_progress',
                  sourceRef: 'learning_items/item-2',
                  requiredState: 'section_exposed',
                },
                difficultyLevel: 1,
                goalTags: [],
              },
            }])
          }
          if (table === 'learner_capability_state') {
            return query([{
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
            }])
          }
          if (table === 'capability_artifacts') return query([])
          if (table === 'learner_source_progress_state') return query([])
          return query([])
        },
      }),
    })

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
    const service = createCapabilitySessionDataService({
      schema: () => ({
        from: (table: string) => {
          if (table === 'learning_capabilities') {
            return query([{
              id: 'capability-1',
              canonical_key: 'capability-key',
              source_kind: 'item',
              source_ref: 'learning_items/item-1',
              capability_type: 'text_recognition',
              direction: 'id_to_l1',
              modality: 'text',
              learner_language: 'nl',
              projection_version: 'capability-v1',
              readiness_status: 'ready',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              metadata_json: {
                skillType: 'recognition',
                requiredArtifacts: [],
                prerequisiteKeys: [],
                requiredSourceProgress: {
                  kind: 'source_progress',
                  sourceRef: 'learning_items/item-1',
                  requiredState: 'section_exposed',
                },
                difficultyLevel: 7,
                goalTags: ['travel'],
              },
            }])
          }
          if (table === 'learner_capability_state') {
            return query([{
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
            }])
          }
          if (table === 'capability_artifacts') return query([])
          if (table === 'learner_source_progress_state') {
            return query([{
              user_id: 'user-1',
              source_ref: 'learning_items/item-1',
              source_section_ref: '__lesson__',
              current_state: 'section_exposed',
              completed_event_types: ['section_exposed'],
            }])
          }
          return query([])
        },
      }),
    })

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    })

    expect(snapshot.plannerInput.readyCapabilities[0]).toEqual(expect.objectContaining({
      difficultyLevel: 7,
      goalTags: ['travel'],
    }))
    expect(snapshot.plannerInput.currentSourceRefs).toEqual(['learning_items/item-1'])
    expect(snapshot.plannerInput.maxNewDifficultyLevel).toBe(5)
    expect(snapshot.plannerInput.recentFailures).toEqual([{
      canonicalKey: 'capability-key',
      failedAt: '2026-04-25T11:30:00.000Z',
      consecutiveFailures: 2,
    }])
    expect(snapshot.plannerInput.learnerCapabilityStates[0]?.successfulReviewCount).toBe(0)
  })

  it('fails closed when lesson-sequenced capabilities lack source progress metadata', async () => {
    const service = createCapabilitySessionDataService({
      schema: () => ({
        from: (table: string) => {
          if (table === 'learning_capabilities') {
            return query([{
              id: 'capability-1',
              canonical_key: 'capability-key',
              source_kind: 'item',
              source_ref: 'learning_items/item-1',
              capability_type: 'form_recall',
              direction: 'l1_to_id',
              modality: 'text',
              learner_language: 'nl',
              projection_version: 'capability-v1',
              readiness_status: 'ready',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              metadata_json: {
                skillType: 'form_recall',
                requiredArtifacts: [],
                prerequisiteKeys: [],
                difficultyLevel: 3,
                goalTags: [],
              },
            }])
          }
          if (table === 'learner_capability_state') return query([])
          if (table === 'capability_artifacts') return query([])
          if (table === 'learner_source_progress_state') return query([])
          return query([])
        },
      }),
    })

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    })

    expect(snapshot.capabilitiesByKey.has('capability-key')).toBe(false)
    expect(snapshot.readinessByKey.get('capability-key')).toEqual({
      status: 'unknown',
      reason: 'Capability metadata is incomplete for safe rendering.',
    })
    expect(snapshot.plannerInput.readyCapabilities).toEqual([])
  })

  it('fails closed when source progress metadata is malformed or points to another source', async () => {
    const service = createCapabilitySessionDataService({
      schema: () => ({
        from: (table: string) => {
          if (table === 'learning_capabilities') {
            return query([{
              id: 'capability-1',
              canonical_key: 'bad-state',
              source_kind: 'item',
              source_ref: 'learning_items/item-1',
              capability_type: 'audio_recognition',
              direction: 'audio_to_l1',
              modality: 'audio',
              learner_language: 'nl',
              projection_version: 'capability-v1',
              readiness_status: 'ready',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              metadata_json: {
                skillType: 'recognition',
                requiredArtifacts: [],
                prerequisiteKeys: [],
                requiredSourceProgress: {
                  kind: 'source_progress',
                  sourceRef: 'learning_items/item-1',
                  requiredState: 'teleported',
                },
                difficultyLevel: 2,
                goalTags: [],
              },
            }, {
              id: 'capability-2',
              canonical_key: 'wrong-source',
              source_kind: 'item',
              source_ref: 'learning_items/item-2',
              capability_type: 'form_recall',
              direction: 'l1_to_id',
              modality: 'text',
              learner_language: 'nl',
              projection_version: 'capability-v1',
              readiness_status: 'ready',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              metadata_json: {
                skillType: 'form_recall',
                requiredArtifacts: [],
                prerequisiteKeys: [],
                requiredSourceProgress: {
                  kind: 'source_progress',
                  sourceRef: 'learning_items/other-item',
                  requiredState: 'intro_completed',
                },
                difficultyLevel: 3,
                goalTags: [],
              },
            }])
          }
          if (table === 'learner_capability_state') return query([])
          if (table === 'capability_artifacts') return query([])
          if (table === 'learner_source_progress_state') return query([])
          return query([])
        },
      }),
    })

    const snapshot = await service.loadCapabilitySessionData({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 15,
      preferredSessionSize: 15,
    })

    expect(snapshot.capabilitiesByKey.size).toBe(0)
    expect(snapshot.readinessByKey.get('bad-state')?.status).toBe('unknown')
    expect(snapshot.readinessByKey.get('wrong-source')?.status).toBe('unknown')
    expect(snapshot.plannerInput.readyCapabilities).toEqual([])
  })
})
