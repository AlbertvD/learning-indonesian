import { describe, expect, it } from 'vitest'
import { planLearningPath, type PlannerCapability } from '@/lib/session-builder/pedagogy'

function capability(overrides: Partial<PlannerCapability> = {}): PlannerCapability {
  return {
    id: 'capability-1',
    canonicalKey: 'cap:v1:item:learning_items/item-1:text_recognition:id_to_l1:text:nl',
    sourceKind: 'item',
    sourceRef: 'learning_items/item-1',
    capabilityType: 'text_recognition',
    skillType: 'recognition',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    prerequisiteKeys: [],
    lessonId: null,
    ...overrides,
  }
}

describe('pedagogy planner', () => {
  it('recommends only ready published dormant capabilities whose gates pass', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [
        capability(),
        capability({ id: 'capability-2', canonicalKey: 'blocked', readinessStatus: 'blocked' }),
      ],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities).toHaveLength(1)
    expect(plan.eligibleNewCapabilities[0]?.activationRecommendation.requiredActivationOwner).toBe('review_processor')
    expect(plan.suppressedCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalKey: 'blocked', reason: 'capability_not_ready' }),
    ]))
  })

  it('does not activate or mutate learner state', () => {
    const learnerCapabilityStates = Object.freeze([] as const)
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability()],
      learnerCapabilityStates,
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities[0]?.activationRecommendation.reason).toBe('eligible_new_capability')
    expect(learnerCapabilityStates).toHaveLength(0)
  })

  it('suppresses lesson-scoped capabilities whose lesson is not activated', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability({ lessonId: 'lesson-uuid' })],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('lesson_not_activated')
  })

  it('admits a lesson-scoped capability once its lesson is activated', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability({ lessonId: 'lesson-uuid' })],
      learnerCapabilityStates: [],
      activatedLessons: new Set(['lesson-uuid']),
    })

    expect(plan.eligibleNewCapabilities).toHaveLength(1)
  })

  it('admits cross-lesson (null lessonId) capabilities without checking activation', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability({ lessonId: null })],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities).toHaveLength(1)
  })

  it('requires successful prerequisite evidence rather than any review attempt', () => {
    const prerequisite = 'cap:v1:item:learning_items/item-1:text_recognition:id_to_l1:text:nl'
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability({
        canonicalKey: 'form-capability',
        capabilityType: 'form_recall',
        prerequisiteKeys: [prerequisite],
      })],
      learnerCapabilityStates: [{
        canonicalKey: prerequisite,
        activationState: 'active',
        reviewCount: 1,
        successfulReviewCount: 0,
      }],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]).toEqual({
      canonicalKey: 'form-capability',
      reason: 'missing_prerequisite',
    })
  })

  it('fails closed if prerequisite success evidence is omitted', () => {
    const prerequisite = 'cap:v1:item:learning_items/item-1:text_recognition:id_to_l1:text:nl'
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability({
        canonicalKey: 'form-capability',
        capabilityType: 'form_recall',
        prerequisiteKeys: [prerequisite],
      })],
      learnerCapabilityStates: [{
        canonicalKey: prerequisite,
        activationState: 'active',
        reviewCount: 1,
      } as any],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('missing_prerequisite')
  })

  it('owns recent failure suppression gate', () => {
    const now = new Date('2026-04-25T00:00:00.000Z')
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now,
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [
        capability({ id: 'fatigued', canonicalKey: 'fatigued', sourceRef: 'learning_items/item-2' }),
        capability({ id: 'fresh', canonicalKey: 'fresh', sourceRef: 'learning_items/item-3' }),
      ],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
      recentFailures: [{
        canonicalKey: 'fatigued',
        failedAt: now.toISOString(),
        consecutiveFailures: 2,
      }],
    })

    expect(plan.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual(['fresh'])
    expect(plan.suppressedCapabilities).toContainEqual({
      canonicalKey: 'fatigued',
      reason: 'recent_failure_fatigue',
    })
  })

  it('filters lesson practice new candidates to selected lesson source refs', () => {
    const selected = capability({
      id: 'selected',
      canonicalKey: 'selected',
      sourceRef: 'learning_items/lesson-4-makan',
    })
    const otherLesson = capability({
      id: 'other',
      canonicalKey: 'other',
      sourceRef: 'learning_items/lesson-5-minum',
    })

    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'lesson_practice',
      selectedLessonId: 'lesson-4',
      selectedSourceRefs: ['lesson-4', 'learning_items/lesson-4-makan'],
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [otherLesson, selected],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual(['selected'])
    expect(plan.suppressedCapabilities).toContainEqual({
      canonicalKey: 'other',
      reason: 'wrong_session_mode',
    })
  })

  it('fails closed for lesson practice when no selected lesson is supplied', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'lesson_practice',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability()],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]).toEqual({
      canonicalKey: 'cap:v1:item:learning_items/item-1:text_recognition:id_to_l1:text:nl',
      reason: 'wrong_session_mode',
    })
  })

  it('never introduces new capabilities during lesson review', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'lesson_review',
      selectedLessonId: 'lesson-4',
      selectedSourceRefs: ['learning_items/item-1'],
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability()],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]).toEqual({
      canonicalKey: 'cap:v1:item:learning_items/item-1:text_recognition:id_to_l1:text:nl',
      reason: 'load_budget_exhausted',
    })
  })

  it('walks ready capabilities in input order and exhausts budget without reordering', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 4,
      dueCount: 0,
      readyCapabilities: [
        capability({
          id: 'meaning-cap',
          canonicalKey: 'meaning-cap',
          capabilityType: 'meaning_recall',
          skillType: 'meaning_recall',
        }),
        capability({
          id: 'choice-cap',
          canonicalKey: 'choice-cap',
          capabilityType: 'l1_to_id_choice',
          skillType: 'meaning_recall',
        }),
      ],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual(['meaning-cap'])
    expect(plan.suppressedCapabilities).toContainEqual({ canonicalKey: 'choice-cap', reason: 'load_budget_exhausted' })
  })
})
