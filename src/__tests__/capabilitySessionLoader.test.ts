import { describe, expect, it } from 'vitest'
import { loadCapabilitySessionPlan, loadCapabilitySessionPlanForUser, type CapabilitySessionDataAdapter } from '@/lib/session/capabilitySessionLoader'
import type { LearnerCapabilityStateRow } from '@/lib/capabilities/capabilityScheduler'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import type { PlannerCapability, PlannerLearnerCapabilityState } from '@/lib/pedagogy/pedagogyPlanner'
import type { ArtifactIndex } from '@/lib/capabilities/artifactRegistry'

const now = new Date('2026-04-25T10:00:00.000Z')
const sourceRef = 'learning_items/item-1'
const canonicalKey = 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl'

function projectedCapability(overrides: Partial<ProjectedCapability> = {}): ProjectedCapability {
  return {
    canonicalKey,
    sourceKind: 'item',
    sourceRef,
    capabilityType: 'meaning_recall',
    skillType: 'meaning_recall',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
    prerequisiteKeys: [],
    difficultyLevel: overrides.difficultyLevel ?? 2,
    goalTags: overrides.goalTags ?? [],
    projectionVersion: 'capability-v1',
    sourceFingerprint: 'source',
    artifactFingerprint: 'artifact',
    ...overrides,
  }
}

function plannerCapability(overrides: Partial<PlannerCapability> = {}): PlannerCapability {
  const projection = projectedCapability(overrides)
  return {
    id: overrides.id ?? 'capability-1',
    canonicalKey: projection.canonicalKey,
    sourceKind: projection.sourceKind,
    sourceRef: projection.sourceRef,
    capabilityType: projection.capabilityType,
    skillType: projection.skillType,
    readinessStatus: overrides.readinessStatus ?? 'ready',
    publicationStatus: overrides.publicationStatus ?? 'published',
    prerequisiteKeys: projection.prerequisiteKeys,
    requiredSourceProgress: projection.requiredSourceProgress,
    difficultyLevel: projection.difficultyLevel,
    goalTags: projection.goalTags,
  }
}

function activeState(overrides: Partial<LearnerCapabilityStateRow> = {}): LearnerCapabilityStateRow {
  return {
    id: 'state-1',
    userId: 'user-1',
    capabilityId: 'capability-1',
    canonicalKeySnapshot: canonicalKey,
    activationState: 'active',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    stability: 1,
    difficulty: 5,
    lastReviewedAt: '2026-04-24T10:00:00.000Z',
    nextDueAt: '2026-04-25T09:00:00.000Z',
    reviewCount: 1,
    lapseCount: 0,
    consecutiveFailureCount: 0,
    stateVersion: 3,
    ...overrides,
  }
}

function approvedArtifacts(): ArtifactIndex {
  return {
    'meaning:l1': [{ qualityStatus: 'approved', sourceRef }],
    'accepted_answers:l1': [{ qualityStatus: 'approved', sourceRef }],
  }
}

function baseInput(overrides: Partial<Parameters<typeof loadCapabilitySessionPlan>[0]> = {}): Parameters<typeof loadCapabilitySessionPlan>[0] {
  const projection = projectedCapability()
  return {
    enabled: true,
    sessionId: 'session-1',
    mode: 'standard',
    now,
    limit: 15,
    schedulerRows: [],
    plannerInput: {
      userId: 'user-1',
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [],
      learnerCapabilityStates: [],
      sourceProgress: [],
      recentReviewEvidence: [],
    },
    capabilitiesByKey: new Map([[projection.canonicalKey, projection]]),
    readinessByKey: new Map([[projection.canonicalKey, { status: 'ready', allowedExercises: ['meaning_recall'] }]]),
    artifactIndex: approvedArtifacts(),
    ...overrides,
  }
}

describe('capability session loader', () => {
  it('fails closed when disabled instead of loading capability sessions', async () => {
    await expect(loadCapabilitySessionPlan(baseInput({ enabled: false })))
      .rejects.toThrow('Capability standard session is disabled')
  })

  it('loads due capability rows through scheduler, resolver, and composer', async () => {
    const plan = await loadCapabilitySessionPlan(baseInput({
      schedulerRows: [activeState()],
    }))

    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]).toEqual(expect.objectContaining({
      id: `${plan.id}:due:${canonicalKey}`,
      kind: 'due_review',
      capabilityId: 'capability-1',
      canonicalKeySnapshot: canonicalKey,
      stateVersion: 3,
      reviewContext: expect.objectContaining({
        currentStateVersion: 3,
        schedulerSnapshot: expect.objectContaining({
          activationState: 'active',
          stateVersion: 3,
          reviewCount: 1,
        }),
        artifactVersionSnapshot: expect.objectContaining({
          artifactFingerprint: 'artifact',
          sourceFingerprint: 'source',
        }),
        capabilityReadinessStatus: 'ready',
        capabilityPublicationStatus: 'published',
      }),
      renderPlan: expect.objectContaining({
        capabilityKey: canonicalKey,
        exerciseType: 'meaning_recall',
      }),
    }))
  })

  it('loads eligible new capabilities through planner, resolver, and composer', async () => {
    const plan = await loadCapabilitySessionPlan(baseInput({
      plannerInput: {
        userId: 'user-1',
        preferredSessionSize: 15,
        dueCount: 0,
        readyCapabilities: [plannerCapability()],
        learnerCapabilityStates: [],
        sourceProgress: [],
        recentReviewEvidence: [],
      },
    }))

    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]).toEqual(expect.objectContaining({
      id: `${plan.id}:new:${canonicalKey}`,
      kind: 'new_introduction',
      capabilityId: 'capability-1',
      reviewContext: expect.objectContaining({
        currentStateVersion: 0,
        schedulerSnapshot: expect.objectContaining({
          activationState: 'dormant',
          stateVersion: 0,
          reviewCount: 0,
        }),
      }),
      pendingActivation: expect.objectContaining({
        requiredActivationOwner: 'review_processor',
      }),
    }))
  })

  it('does not reintroduce capabilities that are already active', async () => {
    const learnerCapabilityStates: PlannerLearnerCapabilityState[] = [{
      canonicalKey,
      activationState: 'active',
      reviewCount: 1,
      successfulReviewCount: 1,
    }]

    const plan = await loadCapabilitySessionPlan(baseInput({
      plannerInput: {
        userId: 'user-1',
        preferredSessionSize: 15,
        dueCount: 0,
        readyCapabilities: [plannerCapability()],
        learnerCapabilityStates,
        sourceProgress: [],
        recentReviewEvidence: [],
      },
    }))

    expect(plan.blocks).toEqual([])
  })

  it('emits diagnostics instead of scheduling unresolved capabilities', async () => {
    const plan = await loadCapabilitySessionPlan(baseInput({
      schedulerRows: [activeState()],
      artifactIndex: { 'meaning:l1': [{ qualityStatus: 'approved', sourceRef }] },
    }))

    expect(plan.blocks).toEqual([])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warn',
      reason: 'missing_required_artifact',
    }))
  })

  it('loads user sessions through the production data adapter seam', async () => {
    const adapter: CapabilitySessionDataAdapter = {
      listLearnerCapabilityStates: async () => {
        throw new Error('loadCapabilitySessionPlanForUser should use the full snapshot loader')
      },
      loadCapabilitySessionData: async request => baseInput({
        schedulerRows: [activeState({ userId: request.userId })],
        plannerInput: {
          userId: request.userId,
          preferredSessionSize: request.preferredSessionSize,
          dueCount: 0,
          readyCapabilities: [],
          learnerCapabilityStates: [],
          sourceProgress: [],
          recentReviewEvidence: [],
        },
      }),
    }

    const plan = await loadCapabilitySessionPlanForUser({
      enabled: true,
      sessionId: 'session-1',
      userId: 'user-1',
      mode: 'standard',
      now,
      limit: 15,
      preferredSessionSize: 15,
      adapter,
    })

    expect(plan.blocks[0]).toEqual(expect.objectContaining({
      kind: 'due_review',
      capabilityId: 'capability-1',
    }))
  })

  it('passes decided comeback/recovery posture into the planner before composing new material', async () => {
    const prerequisite = 'cap:v1:item:learning_items/item-1:l1_to_id_choice:l1_to_id:text:nl'
    const formKey = 'cap:v1:item:learning_items/item-1:form_recall:l1_to_id:text:nl'
    const formProjection = projectedCapability({
      canonicalKey: formKey,
      capabilityType: 'form_recall',
      skillType: 'form_recall',
      direction: 'l1_to_id',
      requiredArtifacts: ['meaning:l1', 'base_text', 'accepted_answers:id'],
      prerequisiteKeys: [prerequisite],
    })
    const input = {
      ...baseInput({
        capabilitiesByKey: new Map([[formKey, formProjection]]),
        readinessByKey: new Map([[formKey, { status: 'ready' as const, allowedExercises: ['typed_recall' as const] }]]),
        artifactIndex: {
          'meaning:l1': [{ qualityStatus: 'approved' as const, sourceRef }],
          base_text: [{ qualityStatus: 'approved' as const, sourceRef }],
          'accepted_answers:id': [{ qualityStatus: 'approved' as const, sourceRef }],
        },
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 12,
          dueCount: 2,
          readyCapabilities: [plannerCapability({
            id: 'form-capability',
            canonicalKey: formKey,
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
        },
      }),
      posture: 'light_recovery',
    } as Parameters<typeof loadCapabilitySessionPlan>[0] & { posture: 'light_recovery' }

    const plan = await loadCapabilitySessionPlan(input)

    expect(plan.blocks).toEqual([])
  })

  it('loads lesson practice from selected lesson due, new, and active review candidates only', async () => {
    const selectedDueKey = 'selected-due-key'
    const selectedNewKey = 'selected-new-key'
    const selectedActiveKey = 'selected-active-key'
    const otherDueKey = 'other-due-key'
    const selectedRefs = ['lesson-4', 'learning_items/selected-due', 'learning_items/selected-new', 'learning_items/selected-active']
    const projections = [
      projectedCapability({ canonicalKey: selectedDueKey, sourceRef: 'learning_items/selected-due', requiredArtifacts: [] }),
      projectedCapability({ canonicalKey: selectedNewKey, sourceRef: 'learning_items/selected-new', requiredArtifacts: [] }),
      projectedCapability({ canonicalKey: selectedActiveKey, sourceRef: 'learning_items/selected-active', requiredArtifacts: [] }),
      projectedCapability({ canonicalKey: otherDueKey, sourceRef: 'learning_items/other-due', requiredArtifacts: [] }),
    ]

    const plan = await loadCapabilitySessionPlan(baseInput({
      mode: 'lesson_practice',
      limit: 3,
      schedulerRows: [
        activeState({ id: 'selected-due-state', canonicalKeySnapshot: selectedDueKey, capabilityId: 'selected-due', nextDueAt: '2026-04-25T09:00:00.000Z' }),
        activeState({ id: 'other-due-state', canonicalKeySnapshot: otherDueKey, capabilityId: 'other-due', nextDueAt: '2026-04-25T09:00:00.000Z' }),
        activeState({ id: 'selected-active-state', canonicalKeySnapshot: selectedActiveKey, capabilityId: 'selected-active', nextDueAt: '2026-04-26T09:00:00.000Z' }),
      ],
      plannerInput: {
        userId: 'user-1',
        preferredSessionSize: 3,
        dueCount: 0,
        readyCapabilities: [
          plannerCapability({ id: 'selected-new', canonicalKey: selectedNewKey, sourceRef: 'learning_items/selected-new' }),
          plannerCapability({ id: 'other-new', canonicalKey: 'other-new-key', sourceRef: 'learning_items/other-new' }),
        ],
        learnerCapabilityStates: [],
        sourceProgress: [],
        recentReviewEvidence: [],
        selectedLessonId: 'lesson-4',
        selectedSourceRefs: selectedRefs,
      },
      capabilitiesByKey: new Map(projections.map(projection => [projection.canonicalKey, projection])),
      readinessByKey: new Map(projections.map(projection => [projection.canonicalKey, { status: 'ready' as const, allowedExercises: ['meaning_recall' as const] }])),
      artifactIndex: {},
      selectedLessonId: 'lesson-4',
      selectedSourceRefs: selectedRefs,
    }))

    expect(plan.blocks.map(block => block.renderPlan.sourceRef)).toEqual([
      'learning_items/selected-due',
      'learning_items/selected-new',
      'learning_items/selected-active',
    ])
    expect(plan.blocks[1]?.pendingActivation).toEqual(expect.objectContaining({
      capabilityId: 'selected-new',
    }))
    expect(plan.blocks[2]?.pendingActivation).toBeUndefined()
  })

  it('loads lesson review from selected active capabilities without introducing new ones', async () => {
    const dueKey = 'selected-due-key'
    const activeKey = 'selected-active-key'
    const newKey = 'selected-new-key'
    const selectedRefs = ['learning_items/selected-due', 'learning_items/selected-active', 'learning_items/selected-new']
    const projections = [
      projectedCapability({ canonicalKey: dueKey, sourceRef: 'learning_items/selected-due', requiredArtifacts: [] }),
      projectedCapability({ canonicalKey: activeKey, sourceRef: 'learning_items/selected-active', requiredArtifacts: [] }),
      projectedCapability({ canonicalKey: newKey, sourceRef: 'learning_items/selected-new', requiredArtifacts: [] }),
    ]

    const plan = await loadCapabilitySessionPlan(baseInput({
      mode: 'lesson_review',
      limit: 5,
      schedulerRows: [
        activeState({ id: 'due-state', canonicalKeySnapshot: dueKey, capabilityId: 'due-cap', nextDueAt: '2026-04-25T09:00:00.000Z' }),
        activeState({ id: 'active-state', canonicalKeySnapshot: activeKey, capabilityId: 'active-cap', nextDueAt: '2026-04-26T09:00:00.000Z' }),
      ],
      plannerInput: {
        userId: 'user-1',
        preferredSessionSize: 5,
        dueCount: 0,
        readyCapabilities: [plannerCapability({ id: 'new-cap', canonicalKey: newKey, sourceRef: 'learning_items/selected-new' })],
        learnerCapabilityStates: [],
        sourceProgress: [],
        recentReviewEvidence: [],
        selectedLessonId: 'lesson-4',
        selectedSourceRefs: selectedRefs,
      },
      capabilitiesByKey: new Map(projections.map(projection => [projection.canonicalKey, projection])),
      readinessByKey: new Map(projections.map(projection => [projection.canonicalKey, { status: 'ready' as const, allowedExercises: ['meaning_recall' as const] }])),
      artifactIndex: {},
      selectedLessonId: 'lesson-4',
      selectedSourceRefs: selectedRefs,
    }))

    expect(plan.blocks.map(block => block.renderPlan.sourceRef)).toEqual([
      'learning_items/selected-due',
      'learning_items/selected-active',
    ])
    expect(plan.blocks.every(block => !block.pendingActivation)).toBe(true)
  })

  it('fails closed when lesson mode has no selected lesson scope', async () => {
    const plan = await loadCapabilitySessionPlan(baseInput({
      mode: 'lesson_practice',
      plannerInput: {
        userId: 'user-1',
        preferredSessionSize: 5,
        dueCount: 0,
        readyCapabilities: [plannerCapability()],
        learnerCapabilityStates: [],
        sourceProgress: [],
        recentReviewEvidence: [],
      },
    }))

    expect(plan.blocks).toEqual([])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'critical',
      reason: 'missing_selected_lesson',
    }))
  })
})
