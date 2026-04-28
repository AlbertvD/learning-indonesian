import { describe, expect, it } from 'vitest'
import { planLearningPath, type PlannerCapability } from '@/lib/pedagogy/pedagogyPlanner'

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
    requiredSourceProgress: { kind: 'none', reason: 'legacy_projection' },
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
      sourceProgress: [],
      recentReviewEvidence: [],
    })

    expect(plan.eligibleNewCapabilities).toHaveLength(1)
    expect(plan.eligibleNewCapabilities[0]?.activationRecommendation.requiredActivationOwner).toBe('review_processor')
    expect(plan.suppressedCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalKey: 'blocked', reason: 'capability_not_ready' }),
    ]))
  })

  it('suppresses new capabilities in backlog clear mode', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'backlog_clear',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 12,
      readyCapabilities: [capability()],
      learnerCapabilityStates: [],
      sourceProgress: [],
      recentReviewEvidence: [],
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('load_budget_exhausted')
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
      sourceProgress: [],
      recentReviewEvidence: [],
    })

    expect(plan.eligibleNewCapabilities[0]?.activationRecommendation.reason).toBe('eligible_new_capability')
    expect(learnerCapabilityStates).toHaveLength(0)
  })

  it('does not let recognition evidence bypass heard-once audio exposure', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability({
        capabilityType: 'audio_recognition',
        requiredSourceProgress: {
          kind: 'source_progress',
          sourceRef: 'learning_items/item-1',
          requiredState: 'heard_once',
        },
      })],
      learnerCapabilityStates: [],
      sourceProgress: [],
      recentReviewEvidence: [{ capabilityKey: 'text-cap', sourceRef: 'learning_items/item-1', skillType: 'recognition', successfulReviews: 3 }],
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('missing_source_progress')
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
      sourceProgress: [],
      recentReviewEvidence: [],
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
      sourceProgress: [],
      recentReviewEvidence: [],
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('missing_prerequisite')
  })

  it('fails closed when difficulty is missing while a difficulty ceiling is active', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [capability({ canonicalKey: 'unknown-difficulty', difficultyLevel: undefined })],
      learnerCapabilityStates: [],
      sourceProgress: [],
      recentReviewEvidence: [],
      maxNewDifficultyLevel: 5,
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]).toEqual({
      canonicalKey: 'unknown-difficulty',
      reason: 'difficulty_jump',
    })
  })

  it('owns usefulness, difficulty jump, and recent failure suppression gates', () => {
    const now = new Date('2026-04-25T00:00:00.000Z')
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now,
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [
        capability({ id: 'too-hard', canonicalKey: 'too-hard', difficultyLevel: 8 }),
        capability({ id: 'fatigued', canonicalKey: 'fatigued', sourceRef: 'learning_items/item-2', difficultyLevel: 2 }),
        capability({ id: 'off-path', canonicalKey: 'off-path', sourceRef: 'learning_items/item-3', difficultyLevel: 2 }),
        capability({ id: 'goal-match', canonicalKey: 'goal-match', sourceRef: 'learning_items/item-4', goalTags: ['daily-focus'], difficultyLevel: 2 }),
      ],
      learnerCapabilityStates: [],
      sourceProgress: [],
      recentReviewEvidence: [],
      currentSourceRefs: ['learning_items/item-2'],
      activeGoalTags: ['daily-focus'],
      maxNewDifficultyLevel: 5,
      recentFailures: [{
        canonicalKey: 'fatigued',
        failedAt: now.toISOString(),
        consecutiveFailures: 2,
      }],
    })

    expect(plan.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual(['goal-match'])
    expect(plan.suppressedCapabilities).toEqual(expect.arrayContaining([
      { canonicalKey: 'too-hard', reason: 'difficulty_jump' },
      { canonicalKey: 'fatigued', reason: 'recent_failure_fatigue' },
      { canonicalKey: 'off-path', reason: 'not_useful_for_current_path' },
    ]))
  })

  it('uses posture budgets to avoid brand-new production during light recovery', () => {
    const prerequisite = 'cap:v1:item:learning_items/item-1:l1_to_id_choice:l1_to_id:text:nl'
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      posture: 'light_recovery',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 12,
      dueCount: 2,
      readyCapabilities: [capability({
        canonicalKey: 'new-form-recall',
        capabilityType: 'form_recall',
        skillType: 'form_recall',
        prerequisiteKeys: [prerequisite],
      })],
      learnerCapabilityStates: [{
        canonicalKey: prerequisite,
        activationState: 'active',
        reviewCount: 1,
        successfulReviewCount: 1,
      }],
      sourceProgress: [],
      recentReviewEvidence: [],
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities).toEqual([
      { canonicalKey: 'new-form-recall', reason: 'load_budget_exhausted' },
    ])
    expect(plan.loadBudget.maxNewProductionTasks).toBe(0)
  })

  it('allows bridge choice evidence to satisfy vocabulary source-progress gates for production', () => {
    const prerequisite = 'cap:v1:item:learning_items/item-1:l1_to_id_choice:l1_to_id:text:nl'
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 12,
      dueCount: 0,
      readyCapabilities: [capability({
        canonicalKey: 'new-form-recall',
        capabilityType: 'form_recall',
        skillType: 'form_recall',
        prerequisiteKeys: [prerequisite],
        requiredSourceProgress: {
          kind: 'source_progress',
          sourceRef: 'learning_items/item-1',
          requiredState: 'intro_completed',
        },
      })],
      learnerCapabilityStates: [{
        canonicalKey: prerequisite,
        activationState: 'active',
        reviewCount: 1,
        successfulReviewCount: 1,
      }],
      sourceProgress: [],
      recentReviewEvidence: [{
        capabilityKey: prerequisite,
        sourceRef: 'learning_items/item-1',
        skillType: 'meaning_recall',
        capabilityType: 'l1_to_id_choice',
        successfulReviews: 1,
      }],
    })

    expect(plan.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual(['new-form-recall'])
  })

  it('prefers the safe Dutch-to-Indonesian bridge over another meaning recall when balanced budget is tight', () => {
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      posture: 'balanced',
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
      sourceProgress: [],
      recentReviewEvidence: [],
    })

    expect(plan.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual(['choice-cap'])
    expect(plan.suppressedCapabilities).toContainEqual({ canonicalKey: 'meaning-cap', reason: 'load_budget_exhausted' })
  })
})
