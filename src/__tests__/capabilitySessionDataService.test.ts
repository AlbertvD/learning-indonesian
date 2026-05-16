import { describe, expect, it, vi } from 'vitest'
import { createSessionBuilderAdapter } from '@/lib/session-builder/adapter'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

function query(data: unknown[] = []) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data, error: null }),
  }
  return chain
}

describe('capability session data service', () => {
  it('derives planner dueCount from schedulable due rows only', async () => {
    const service = createSessionBuilderAdapter({
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
              projection_version: 'capability-v2',
              readiness_status: 'ready',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              lesson_id: 'lesson-uuid-1',
              metadata_json: {
                skillType: 'recognition',
                requiredArtifacts: [],
                prerequisiteKeys: [],
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
              projection_version: 'capability-v2',
              readiness_status: 'blocked',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              lesson_id: 'lesson-uuid-1',
              metadata_json: {
                skillType: 'recognition',
                requiredArtifacts: [],
                prerequisiteKeys: [],
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
          if (table === 'learner_lesson_activation') return query([])
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
    const service = createSessionBuilderAdapter({
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
              projection_version: 'capability-v2',
              readiness_status: 'ready',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              lesson_id: 'lesson-uuid-1',
              metadata_json: {
                skillType: 'recognition',
                requiredArtifacts: [],
                prerequisiteKeys: [],
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
          if (table === 'learner_lesson_activation') {
            return query([{ lesson_id: 'lesson-uuid-1' }])
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
    const service = createSessionBuilderAdapter({
      schema: () => ({
        from: (table: string) => {
          if (table === 'learning_capabilities') {
            return query([{
              id: 'choice-capability',
              canonical_key: 'cap:v1:item:learning_items/item-1:l1_to_id_choice:l1_to_id:text:nl',
              source_kind: 'item',
              source_ref: 'learning_items/item-1',
              capability_type: 'l1_to_id_choice',
              direction: 'l1_to_id',
              modality: 'text',
              learner_language: 'nl',
              projection_version: 'capability-v2',
              readiness_status: 'ready',
              publication_status: 'published',
              source_fingerprint: 'source',
              artifact_fingerprint: 'artifact',
              lesson_id: 'lesson-uuid-1',
              metadata_json: {
                skillType: 'meaning_recall',
                requiredArtifacts: ['meaning:l1', 'base_text'],
                prerequisiteKeys: ['text-recognition-key'],
                difficultyLevel: 2,
                goalTags: [],
              },
            }])
          }
          if (table === 'capability_artifacts') {
            return query([{
              capability_id: 'choice-capability',
              artifact_kind: 'meaning:l1',
              quality_status: 'approved',
              artifact_json: { value: 'eten' },
            }, {
              capability_id: 'choice-capability',
              artifact_kind: 'base_text',
              quality_status: 'approved',
              artifact_json: { value: 'makan' },
            }])
          }
          if (table === 'learner_capability_state') return query([])
          if (table === 'learner_lesson_activation') return query([])
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

    expect(snapshot.readinessByKey.get('cap:v1:item:learning_items/item-1:l1_to_id_choice:l1_to_id:text:nl')).toEqual({
      status: 'ready',
      allowedExercises: ['cued_recall'],
    })
    expect(snapshot.plannerInput.readyCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        canonicalKey: 'cap:v1:item:learning_items/item-1:l1_to_id_choice:l1_to_id:text:nl',
        capabilityType: 'l1_to_id_choice',
        skillType: 'meaning_recall',
      }),
    ]))
  })

  it('carries selected lesson scope into the planner snapshot', async () => {
    const service = createSessionBuilderAdapter({
      schema: () => ({
        from: () => query([]),
      }),
    })

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
    const service = createSessionBuilderAdapter({
      schema: () => ({
        from: (table: string) => {
          if (table === 'learner_lesson_activation') {
            return query([
              { lesson_id: 'lesson-a' },
              { lesson_id: 'lesson-b' },
            ])
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

    expect(snapshot.plannerInput.activatedLessons).toEqual(new Set(['lesson-a', 'lesson-b']))
  })

  describe('lesson progression (drying inputs)', () => {
    function adapterFor(input: {
      activations: Array<{ lesson_id: string }>
      lessons: Array<{ id: string; order_index: number }>
    }) {
      return createSessionBuilderAdapter({
        schema: () => ({
          from: (table: string) => {
            if (table === 'learner_lesson_activation') return query(input.activations)
            if (table === 'lessons') return query(input.lessons)
            return query([])
          },
        }),
      })
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
