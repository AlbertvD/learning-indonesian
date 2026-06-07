import { describe, expect, it } from 'vitest'
import { loadCapabilitySessionPlan, buildSession, type CapabilitySessionDataAdapter } from '@/lib/session-builder/builder'
import type { LearnerCapabilityStateRow } from '@/lib/session-builder/dueFilter'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import { planLearningPath, type PlannerCapability, type PlannerLearnerCapabilityState } from '@/lib/session-builder/pedagogy'

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
    projectionVersion: 'capability-v3',
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
    lessonId: projection.lessonId ?? null,
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
      activatedLessons: new Set<string>(),
    },
    capabilitiesByKey: new Map([[projection.canonicalKey, projection]]),
    readinessByKey: new Map([[projection.canonicalKey, { status: 'ready', allowedExercises: ['meaning_recall'] }]]),
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
          capabilityKey: canonicalKey,
          projectionVersion: 'capability-v3',
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
        activatedLessons: new Set<string>(),
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
      stability: null,
    }]

    const plan = await loadCapabilitySessionPlan(baseInput({
      plannerInput: {
        userId: 'user-1',
        preferredSessionSize: 15,
        dueCount: 0,
        readyCapabilities: [plannerCapability()],
        learnerCapabilityStates,
        activatedLessons: new Set<string>(),
      },
    }))

    expect(plan.blocks).toEqual([])
  })

  it('emits diagnostics instead of scheduling unresolved capabilities', async () => {
    // Post-4b an "unresolved" capability is one whose readiness is not `ready`
    // (e.g. no compatible exercise for its cap_type) — the retired artifact-bag
    // path no longer exists. The resolver fails it as capability_not_ready and
    // the composer surfaces a diagnostic instead of scheduling a block.
    const projection = projectedCapability()
    const plan = await loadCapabilitySessionPlan(baseInput({
      schedulerRows: [activeState()],
      readinessByKey: new Map([[projection.canonicalKey, {
        status: 'blocked',
        missingArtifacts: [],
        reason: 'no_compatible_exercise_for_capability_type',
      }]]),
    }))

    expect(plan.blocks).toEqual([])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warn',
      reason: 'capability_not_ready',
    }))
  })

  it('loads user sessions through the production data adapter seam', async () => {
    const adapter: CapabilitySessionDataAdapter = {
      listLearnerCapabilityStates: async () => {
        throw new Error('buildSession should use the full snapshot loader')
      },
      loadCapabilitySessionData: async request => {
        const base = baseInput({
          schedulerRows: [activeState({ userId: request.userId })],
          plannerInput: {
            userId: request.userId,
            preferredSessionSize: request.preferredSessionSize,
            dueCount: 0,
            readyCapabilities: [],
            learnerCapabilityStates: [],
            activatedLessons: new Set<string>(),
          },
        })
        return {
          schedulerRows: base.schedulerRows,
          plannerInput: base.plannerInput,
          capabilitiesByKey: base.capabilitiesByKey,
          readinessByKey: base.readinessByKey,
          currentLessonId: null,
          nextLessonNeedsExposure: false,
        }
      },
    }

    const plan = await buildSession({
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
        activatedLessons: new Set<string>(),
        selectedLessonId: 'lesson-4',
        selectedSourceRefs: selectedRefs,
      },
      capabilitiesByKey: new Map(projections.map(projection => [projection.canonicalKey, projection])),
      readinessByKey: new Map(projections.map(projection => [projection.canonicalKey, { status: 'ready' as const, allowedExercises: ['meaning_recall' as const] }])),
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
        activatedLessons: new Set<string>(),
        selectedLessonId: 'lesson-4',
        selectedSourceRefs: selectedRefs,
      },
      capabilitiesByKey: new Map(projections.map(projection => [projection.canonicalKey, projection])),
      readinessByKey: new Map(projections.map(projection => [projection.canonicalKey, { status: 'ready' as const, allowedExercises: ['meaning_recall' as const] }])),
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
        activatedLessons: new Set<string>(),
      },
    }))

    expect(plan.blocks).toEqual([])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'critical',
      reason: 'missing_selected_lesson',
    }))
  })

  describe('lesson-activation gate (Decision 3b / ADR 0006)', () => {
    const lesson1Id = 'lesson-1-uuid'
    const lesson2Id = 'lesson-2-uuid'
    const lesson1Key = 'cap:v1:item:learning_items/lesson-1-word:meaning_recall:id_to_l1:text:nl'
    const lesson2Key = 'cap:v1:item:learning_items/lesson-2-word:meaning_recall:id_to_l1:text:nl'

    it('suppresses lesson-2 caps as eligible introductions when only lesson-1 is activated', async () => {
      // Pre-Decision-3b, vocab caps had null lessonId and bypassed the gate at
      // pedagogy.ts:209 — a learner with only lesson-1 activated would still
      // see lesson-2 vocab in `standard` mode. Post-Decision-3b every lesson-
      // derived cap carries the lesson that introduces it (PR-1 projector +
      // PR-4 CHECK constraint), so the gate fires correctly. This test pins
      // that behaviour.
      const lesson1Projection = projectedCapability({
        canonicalKey: lesson1Key,
        sourceRef: 'learning_items/lesson-1-word',
        lessonId: lesson1Id,
        requiredArtifacts: [],
      })
      const lesson2Projection = projectedCapability({
        canonicalKey: lesson2Key,
        sourceRef: 'learning_items/lesson-2-word',
        lessonId: lesson2Id,
        requiredArtifacts: [],
      })

      const plan = await loadCapabilitySessionPlan(baseInput({
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 15,
          dueCount: 0,
          readyCapabilities: [
            plannerCapability({
              id: 'lesson-1-cap',
              canonicalKey: lesson1Projection.canonicalKey,
              sourceRef: lesson1Projection.sourceRef,
              lessonId: lesson1Id,
            }),
            plannerCapability({
              id: 'lesson-2-cap',
              canonicalKey: lesson2Projection.canonicalKey,
              sourceRef: lesson2Projection.sourceRef,
              lessonId: lesson2Id,
            }),
          ],
          learnerCapabilityStates: [],
          activatedLessons: new Set<string>([lesson1Id]),
        },
        capabilitiesByKey: new Map([
          [lesson1Projection.canonicalKey, lesson1Projection],
          [lesson2Projection.canonicalKey, lesson2Projection],
        ]),
        readinessByKey: new Map([
          [lesson1Projection.canonicalKey, { status: 'ready', allowedExercises: ['meaning_recall'] }],
          [lesson2Projection.canonicalKey, { status: 'ready', allowedExercises: ['meaning_recall'] }],
        ]),
      }))

      expect(plan.blocks).toHaveLength(1)
      expect(plan.blocks[0]?.canonicalKeySnapshot).toBe(lesson1Key)
      expect(plan.blocks.find(block => block.canonicalKeySnapshot === lesson2Key)).toBeUndefined()
    })

    it('still bypasses the activation gate for null-lessonId caps at the planner level (Decision 3b carve-out)', () => {
      // Positive control for the null-bypass at pedagogy.ts:209. Podcast source
      // kinds are the documented carve-out admitted by the schema CHECK
      // constraint `learning_capabilities_lesson_id_required_for_lessons`. The
      // null-bypass below them is defense-in-depth: if a future refactor turns
      // the `lessonId != null` test into a strict check, this assertion fails
      // because the planner would NPE or suppress the cap. We test at the
      // `planLearningPath` level directly because podcast caps are filtered
      // out earlier (as exposure-only, capabilityContracts.ts:13) before they
      // reach `loadCapabilitySessionPlan`, so this is the layer where the
      // null-bypass actually has to hold.
      const podcastKey = 'cap:v1:podcast_segment:podcasts/warung/seg-01:audio_recognition:l1_to_id:audio:nl'
      const podcastCap: PlannerCapability = {
        id: 'podcast-cap',
        canonicalKey: podcastKey,
        sourceKind: 'podcast_segment',
        sourceRef: 'podcasts/warung/seg-01',
        capabilityType: 'audio_recognition',
        skillType: 'recognition',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        prerequisiteKeys: [],
        lessonId: null,
      }

      const plan = planLearningPath({
        userId: 'user-1',
        mode: 'standard',
        now,
        preferredSessionSize: 15,
        dueCount: 0,
        readyCapabilities: [podcastCap],
        learnerCapabilityStates: [],
        activatedLessons: new Set<string>([lesson1Id]),
      })

      expect(plan.eligibleNewCapabilities).toHaveLength(1)
      expect(plan.eligibleNewCapabilities[0]?.capability.canonicalKey).toBe(podcastKey)
      expect(plan.suppressedCapabilities.find(s => s.reason === 'lesson_not_activated')).toBeUndefined()
    })
  })

  describe('lesson-priority candidate ordering (issue #166/#125)', () => {
    // Asserts on the FINAL composed SessionBlock[] (post planner → compose →
    // interleave → slice), not just the planner output — this is what the
    // learner sees and closes the composer swap+slice interaction.
    const lesson1Id = 'lesson-1-uuid'
    const lesson2Id = 'lesson-2-uuid'

    function lessonCap(key: string, lessonId: string, lessonOrder: number): PlannerCapability {
      return {
        ...plannerCapability({ id: key, canonicalKey: key, sourceRef: `learning_items/${key}`, lessonId }),
        lessonOrder,
      }
    }

    it('fills the budget with lower-lesson caps first; later-lesson caps wait', async () => {
      // 3 L1 caps + 2 L2 caps, budget = 3 → the composed session is all L1.
      const caps = [
        lessonCap('l2-a', lesson2Id, 2),
        lessonCap('l1-a', lesson1Id, 1),
        lessonCap('l2-b', lesson2Id, 2),
        lessonCap('l1-b', lesson1Id, 1),
        lessonCap('l1-c', lesson1Id, 1),
      ]
      const projections = caps.map(c => projectedCapability({
        canonicalKey: c.canonicalKey,
        sourceRef: c.sourceRef,
        lessonId: c.lessonId,
        requiredArtifacts: [],
      }))

      const plan = await loadCapabilitySessionPlan(baseInput({
        limit: 3,
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 3,
          dueCount: 0,
          readyCapabilities: caps,
          learnerCapabilityStates: [],
          activatedLessons: new Set<string>([lesson1Id, lesson2Id]),
        },
        capabilitiesByKey: new Map(projections.map(p => [p.canonicalKey, p])),
        readinessByKey: new Map(projections.map(p => [p.canonicalKey, { status: 'ready' as const, allowedExercises: ['meaning_recall' as const] }])),
      }))

      const served = plan.blocks.map(b => b.canonicalKeySnapshot).sort()
      expect(served).toEqual(['l1-a', 'l1-b', 'l1-c'])
      expect(plan.blocks.some(b => b.canonicalKeySnapshot.startsWith('l2'))).toBe(false)
    })
  })

  describe('queue drying diagnostic', () => {
    const currentLessonUuid = 'lesson-current-uuid'

    function dryScenarioInput() {
      // Standard-mode session with no due reviews, current lesson fully
      // introduced (planner has no eligible new capabilities for it), and the
      // next lesson still inactive. This is the wiring's positive case.
      const otherLessonProjection = projectedCapability({
        canonicalKey: 'other-lesson-key',
        sourceRef: 'learning_items/other-lesson',
        lessonId: 'lesson-other-uuid',
        requiredArtifacts: [],
      })
      return baseInput({
        schedulerRows: [],
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 15,
          dueCount: 0,
          // Other-lesson capability is the only ready candidate, but it is
          // suppressed because its lessonId is not in `activatedLessons`.
          readyCapabilities: [plannerCapability({
            id: 'other-lesson-cap',
            canonicalKey: otherLessonProjection.canonicalKey,
            sourceRef: otherLessonProjection.sourceRef,
            lessonId: 'lesson-other-uuid',
          })],
          learnerCapabilityStates: [],
          // current lesson is activated; the suppressed capability belongs to
          // a different (non-activated) lesson.
          activatedLessons: new Set<string>([currentLessonUuid]),
        },
        capabilitiesByKey: new Map([[otherLessonProjection.canonicalKey, otherLessonProjection]]),
        readinessByKey: new Map([[otherLessonProjection.canonicalKey, { status: 'ready', allowedExercises: ['meaning_recall'] }]]),
        currentLessonId: currentLessonUuid,
        nextLessonNeedsExposure: true,
      })
    }

    it('emits the drying diagnostic when the queue is dry and the next lesson needs exposure', async () => {
      const plan = await loadCapabilitySessionPlan(dryScenarioInput())
      expect(plan.diagnostics).toContainEqual(expect.objectContaining({
        severity: 'warn',
        reason: 'learning_pipeline_drying_up',
        details: 'session.pipelineDryingUp',
      }))
    })

    it('does not emit the drying diagnostic when the next lesson is already active', async () => {
      const input = dryScenarioInput()
      const plan = await loadCapabilitySessionPlan({
        ...input,
        nextLessonNeedsExposure: false,
      })
      expect(plan.diagnostics.find(d => d.reason === 'learning_pipeline_drying_up')).toBeUndefined()
    })

    it('does not emit the drying diagnostic in lesson-scoped modes', async () => {
      // lesson_practice would need scope, so we have to provide it.
      const input = dryScenarioInput()
      const selectedRefs = ['lesson-current', 'learning_items/other-lesson']
      const plan = await loadCapabilitySessionPlan({
        ...input,
        mode: 'lesson_practice',
        plannerInput: {
          ...input.plannerInput,
          selectedLessonId: 'lesson-current',
          selectedSourceRefs: selectedRefs,
        },
        selectedLessonId: 'lesson-current',
        selectedSourceRefs: selectedRefs,
      })
      expect(plan.diagnostics.find(d => d.reason === 'learning_pipeline_drying_up')).toBeUndefined()
    })

    it('does not emit the drying diagnostic when the planner still has eligible introductions for the current lesson', async () => {
      // Same scenario, except the "other" capability now belongs to the
      // current lesson — the planner will emit it as eligible, so drying is
      // suppressed.
      const currentLessonProjection = projectedCapability({
        canonicalKey: 'current-lesson-key',
        sourceRef: 'learning_items/current-lesson',
        lessonId: currentLessonUuid,
        requiredArtifacts: [],
      })
      const plan = await loadCapabilitySessionPlan(baseInput({
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 15,
          dueCount: 0,
          readyCapabilities: [plannerCapability({
            id: 'current-lesson-cap',
            canonicalKey: currentLessonProjection.canonicalKey,
            sourceRef: currentLessonProjection.sourceRef,
            lessonId: currentLessonUuid,
          })],
          learnerCapabilityStates: [],
          activatedLessons: new Set<string>([currentLessonUuid]),
        },
        capabilitiesByKey: new Map([[currentLessonProjection.canonicalKey, currentLessonProjection]]),
        readinessByKey: new Map([[currentLessonProjection.canonicalKey, { status: 'ready', allowedExercises: ['meaning_recall'] }]]),
        currentLessonId: currentLessonUuid,
        nextLessonNeedsExposure: true,
      }))
      expect(plan.diagnostics.find(d => d.reason === 'learning_pipeline_drying_up')).toBeUndefined()
    })
  })
})
