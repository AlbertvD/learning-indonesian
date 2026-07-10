import { describe, expect, it, vi } from 'vitest'
import { loadCapabilitySessionPlan, buildSession, type CapabilitySessionDataAdapter } from '@/lib/session-builder/builder'
import type { LearnerCapabilityStateRow } from '@/lib/session-builder/dueFilter'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import type { CapabilityReadiness } from '@/lib/capabilities'
import { planLearningPath, type PlannerCapability, type PlannerLearnerCapabilityState } from '@/lib/session-builder/pedagogy'
import { logError } from '@/lib/logger'

// The spreektaalEnabled ref-set read's failure path (below) logs via logError
// rather than swallowing silently (CLAUDE.md Logging) — mocked so the assertion
// doesn't depend on a real Supabase write succeeding in the test environment.
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

const now = new Date('2026-04-25T10:00:00.000Z')
const sourceRef = 'learning_items/item-1'
const canonicalKey = 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl'

function projectedCapability(overrides: Partial<ProjectedCapability> = {}): ProjectedCapability {
  return {
    canonicalKey,
    sourceKind: 'vocabulary_src',
    sourceRef,
    capabilityType: 'recall_meaning_from_text_cap',
    skillType: 'recall_mode',
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
    readinessByKey: new Map([[projection.canonicalKey, { status: 'ready', allowedExercises: ['type_meaning_ex'] }]]),
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
        exerciseType: 'type_meaning_ex',
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
          reviewedTodayRefs: new Set<string>(),
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

  // Round 2.4b -- CRIT-2 (docs/audits/2026-07-02-a11y-i18n-audit.md): the Profile
  // "disable listening exercises" toggle, wired via buildSession's listeningEnabled
  // param -> excludeListeningCapabilities (listeningFilter.ts).
  describe('listeningEnabled -- "disable listening exercises" opt-out', () => {
    const audioKey = 'cap:v1:item:learning_items/audio-word:recognise_meaning_from_audio_cap:audio_to_l1:audio:nl'
    const audioProjection = projectedCapability({
      canonicalKey: audioKey,
      sourceRef: 'learning_items/audio-word',
      capabilityType: 'recognise_meaning_from_audio_cap',
      skillType: 'recognise_mode',
      direction: 'audio_to_l1',
      modality: 'audio',
      requiredArtifacts: [],
    })
    const newIntroKey = 'cap:v1:item:learning_items/audio-new:recognise_meaning_from_audio_cap:audio_to_l1:audio:nl'
    const newIntroProjection = projectedCapability({
      canonicalKey: newIntroKey,
      sourceRef: 'learning_items/audio-new',
      capabilityType: 'recognise_meaning_from_audio_cap',
      skillType: 'recognise_mode',
      direction: 'audio_to_l1',
      modality: 'audio',
      requiredArtifacts: [],
    })

    function adapterWithAudioAndText(): CapabilitySessionDataAdapter {
      return {
        listLearnerCapabilityStates: async () => {
          throw new Error('buildSession should use the full snapshot loader')
        },
        loadCapabilitySessionData: async request => ({
          schedulerRows: [
            activeState({ userId: request.userId }), // text -- capability-1 / canonicalKey (default)
            activeState({
              userId: request.userId,
              id: 'audio-state',
              capabilityId: 'audio-capability',
              canonicalKeySnapshot: audioKey,
            }),
          ],
          plannerInput: {
            userId: request.userId,
            preferredSessionSize: request.preferredSessionSize,
            dueCount: 0,
            readyCapabilities: [plannerCapability({
              id: 'audio-new-capability',
              canonicalKey: newIntroKey,
              sourceRef: newIntroProjection.sourceRef,
              capabilityType: 'recognise_meaning_from_audio_cap',
              skillType: 'recognise_mode',
            })],
            learnerCapabilityStates: [],
            activatedLessons: new Set<string>(),
          },
          capabilitiesByKey: new Map([
            [canonicalKey, projectedCapability()],
            [audioKey, audioProjection],
            [newIntroKey, newIntroProjection],
          ]),
          readinessByKey: new Map([
            [canonicalKey, { status: 'ready', allowedExercises: ['type_meaning_ex'] }],
            [audioKey, { status: 'ready', allowedExercises: ['type_meaning_from_audio_ex'] }],
            [newIntroKey, { status: 'ready', allowedExercises: ['type_meaning_from_audio_ex'] }],
          ]),
          currentLessonId: null,
          nextLessonNeedsExposure: false,
          reviewedTodayRefs: new Set<string>(),
        }),
      }
    }

    it('excludes audio-modality blocks (due + new-introduction) when the preference is off', async () => {
      const plan = await buildSession({
        enabled: true,
        sessionId: 'session-1',
        userId: 'user-1',
        mode: 'standard',
        now,
        limit: 15,
        preferredSessionSize: 15,
        listeningEnabled: false,
        adapter: adapterWithAudioAndText(),
      })

      expect(plan.blocks.some(b => b.canonicalKeySnapshot === audioKey)).toBe(false)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === newIntroKey)).toBe(false)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === canonicalKey)).toBe(true)
    })

    it('leaves audio-modality blocks in the plan when the preference is on (default)', async () => {
      const plan = await buildSession({
        enabled: true,
        sessionId: 'session-1',
        userId: 'user-1',
        mode: 'standard',
        now,
        limit: 15,
        preferredSessionSize: 15,
        adapter: adapterWithAudioAndText(),
      })

      expect(plan.blocks.some(b => b.canonicalKeySnapshot === audioKey)).toBe(true)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === newIntroKey)).toBe(true)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === canonicalKey)).toBe(true)
    })
  })

  // Spec docs/plans/2026-07-09-spreektaal-lesson-woven-core.md §5: the
  // "Spreektaal (informele woorden) oefenen" Profile toggle, wired via
  // buildSession's spreektaalEnabled param -> excludeSpreektaalCapabilities
  // (spreektaalFilter.ts). Unlike listeningEnabled, register isn't part of the
  // capability projection, so this needs one extra adapter read
  // (loadInformalItemSourceRefs) to learn which source_refs are informal.
  describe('spreektaalEnabled -- "Spreektaal (informele woorden) oefenen" opt-out', () => {
    const informalKey = 'cap:v1:item:learning_items/nggak:recognise_meaning_from_text_cap:id_to_l1:text:nl'
    const informalProjection = projectedCapability({
      canonicalKey: informalKey,
      sourceRef: 'learning_items/nggak',
      capabilityType: 'recognise_meaning_from_text_cap',
      skillType: 'recognise_mode',
      requiredArtifacts: [],
    })
    const newIntroKey = 'cap:v1:item:learning_items/aja:recognise_meaning_from_text_cap:id_to_l1:text:nl'
    const newIntroProjection = projectedCapability({
      canonicalKey: newIntroKey,
      sourceRef: 'learning_items/aja',
      capabilityType: 'recognise_meaning_from_text_cap',
      skillType: 'recognise_mode',
      requiredArtifacts: [],
    })

    function adapterWithInformalAndFormal(
      loadInformalItemSourceRefs: () => Promise<Set<string>>,
    ): CapabilitySessionDataAdapter & { loadInformalItemSourceRefs: () => Promise<Set<string>> } {
      return {
        listLearnerCapabilityStates: async () => {
          throw new Error('buildSession should use the full snapshot loader')
        },
        loadCapabilitySessionData: async request => ({
          schedulerRows: [
            activeState({ userId: request.userId }), // formal -- capability-1 / canonicalKey (default)
            activeState({
              userId: request.userId,
              id: 'informal-state',
              capabilityId: 'informal-capability',
              canonicalKeySnapshot: informalKey,
            }),
          ],
          plannerInput: {
            userId: request.userId,
            preferredSessionSize: request.preferredSessionSize,
            dueCount: 0,
            readyCapabilities: [plannerCapability({
              id: 'informal-new-capability',
              canonicalKey: newIntroKey,
              sourceRef: newIntroProjection.sourceRef,
              capabilityType: 'recognise_meaning_from_text_cap',
              skillType: 'recognise_mode',
            })],
            learnerCapabilityStates: [],
            activatedLessons: new Set<string>(),
          },
          capabilitiesByKey: new Map([
            [canonicalKey, projectedCapability()],
            [informalKey, informalProjection],
            [newIntroKey, newIntroProjection],
          ]),
          readinessByKey: new Map([
            [canonicalKey, { status: 'ready', allowedExercises: ['type_meaning_ex'] }],
            [informalKey, { status: 'ready', allowedExercises: ['choose_meaning_ex'] }],
            [newIntroKey, { status: 'ready', allowedExercises: ['choose_meaning_ex'] }],
          ]),
          currentLessonId: null,
          nextLessonNeedsExposure: false,
          reviewedTodayRefs: new Set<string>(),
        }),
        loadInformalItemSourceRefs,
      }
    }

    it('excludes informal-item blocks (due + new-introduction) when the preference is off', async () => {
      const plan = await buildSession({
        enabled: true,
        sessionId: 'session-1',
        userId: 'user-1',
        mode: 'standard',
        now,
        limit: 15,
        preferredSessionSize: 15,
        spreektaalEnabled: false,
        adapter: adapterWithInformalAndFormal(async () => new Set(['learning_items/nggak', 'learning_items/aja'])),
      })

      expect(plan.blocks.some(b => b.canonicalKeySnapshot === informalKey)).toBe(false)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === newIntroKey)).toBe(false)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === canonicalKey)).toBe(true)
    })

    it('leaves informal-item blocks in the plan when the preference is on (default), and never reads the ref set', async () => {
      let refsCalled = false
      const plan = await buildSession({
        enabled: true,
        sessionId: 'session-1',
        userId: 'user-1',
        mode: 'standard',
        now,
        limit: 15,
        preferredSessionSize: 15,
        adapter: adapterWithInformalAndFormal(async () => {
          refsCalled = true
          return new Set(['learning_items/nggak', 'learning_items/aja'])
        }),
      })

      expect(refsCalled).toBe(false)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === informalKey)).toBe(true)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === newIntroKey)).toBe(true)
    })

    it('degrades to a no-op (does not throw, does not filter) when the ref-set read fails -- merge-safety before the register/register_counterpart columns exist -- and logs it (never silently swallowed)', async () => {
      vi.mocked(logError).mockClear()
      const readError = new Error('column "register" does not exist')
      const plan = await buildSession({
        enabled: true,
        sessionId: 'session-1',
        userId: 'user-1',
        mode: 'standard',
        now,
        limit: 15,
        preferredSessionSize: 15,
        spreektaalEnabled: false,
        adapter: adapterWithInformalAndFormal(async () => {
          throw readError
        }),
      })

      expect(vi.mocked(logError)).toHaveBeenCalledWith(expect.objectContaining({
        page: 'session-builder',
        action: 'loadInformalItemSourceRefs',
        error: readError,
      }))
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === informalKey)).toBe(true)
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === canonicalKey)).toBe(true)
    })
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
      readinessByKey: new Map(projections.map(projection => [projection.canonicalKey, { status: 'ready' as const, allowedExercises: ['type_meaning_ex' as const] }])),
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
      readinessByKey: new Map(projections.map(projection => [projection.canonicalKey, { status: 'ready' as const, allowedExercises: ['type_meaning_ex' as const] }])),
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

  // ── Affix-scoped session (source-ref-only scope, capstone item F′) ─────────
  // The affix mode is scoped by source_refs ALONE (an affix spans many lessons,
  // so it has no single selectedLessonId). These four regressions guard the
  // round-2/3 finding: a non-lesson scoped mode must NOT bypass scoping and ship
  // the whole global queue + out-of-scope new caps + a dead practice-review pass.
  describe('affix-scoped session (mode=affix_practice)', () => {
    const inDueKey = 'affix-in-due-key'
    const outDueKey = 'affix-out-due-key'
    const inNewKey = 'affix-in-new-key'
    const outNewKey = 'affix-out-new-key'
    const inActiveKey = 'affix-in-active-key'
    const affixRefs = [
      'affixed_form_pairs/meN-ajar',
      'affixed_form_pairs/meN-tulis',
      'affixed_form_pairs/meN-baca',
      'affixed_form_pairs/meN-dengar',
    ]
    // An affix cap: word_form_pair_src, null lessonId so the lesson-activation
    // gate is bypassed and these tests isolate the SCOPE behaviour.
    const affixCap = (key: string, ref: string): ProjectedCapability =>
      projectedCapability({
        canonicalKey: key,
        sourceKind: 'word_form_pair_src',
        sourceRef: ref,
        capabilityType: 'recognise_word_form_link_cap',
        requiredArtifacts: [],
      })
    const affixPlanner = (id: string, key: string, ref: string): PlannerCapability => ({
      id,
      canonicalKey: key,
      sourceKind: 'word_form_pair_src',
      sourceRef: ref,
      capabilityType: 'recognise_word_form_link_cap',
      skillType: 'recognise_mode',
      readinessStatus: 'ready',
      publicationStatus: 'published',
      prerequisiteKeys: [],
      lessonId: null,
    })

    it('(i) filters DUE caps to the affix source_refs and stays valid without a selectedLessonId', async () => {
      const projections = [
        affixCap(inDueKey, 'affixed_form_pairs/meN-ajar'),
        affixCap(outDueKey, 'learning_items/some-other-word'),
      ]
      const plan = await loadCapabilitySessionPlan(baseInput({
        mode: 'affix_practice',
        limit: 10,
        schedulerRows: [
          activeState({ id: 'in-due-state', canonicalKeySnapshot: inDueKey, capabilityId: 'in-due', nextDueAt: '2026-04-25T09:00:00.000Z' }),
          activeState({ id: 'out-due-state', canonicalKeySnapshot: outDueKey, capabilityId: 'out-due', nextDueAt: '2026-04-25T08:00:00.000Z' }),
        ],
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 10,
          dueCount: 0,
          readyCapabilities: [],
          learnerCapabilityStates: [],
          activatedLessons: new Set<string>(),
          selectedSourceRefs: affixRefs,
        },
        capabilitiesByKey: new Map(projections.map(p => [p.canonicalKey, p])),
        readinessByKey: new Map(projections.map(p => [p.canonicalKey, { status: 'ready' as const, allowedExercises: ['choose_form_ex' as const] }])),
        selectedSourceRefs: affixRefs,
      }))
      // No missing_selected_lesson diagnostic — the source-ref-only scope is valid.
      expect(plan.diagnostics).not.toContainEqual(expect.objectContaining({ reason: 'missing_selected_lesson' }))
      expect(plan.blocks.map(b => b.renderPlan.sourceRef)).toEqual(['affixed_form_pairs/meN-ajar'])
    })

    it('(ii) scopes NEW introductions to the affix — out-of-scope caps are suppressed', async () => {
      const projections = [
        affixCap(inNewKey, 'affixed_form_pairs/meN-tulis'),
        affixCap(outNewKey, 'learning_items/some-other-word'),
      ]
      const plan = await loadCapabilitySessionPlan(baseInput({
        mode: 'affix_practice',
        limit: 10,
        schedulerRows: [],
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 10,
          dueCount: 0,
          readyCapabilities: [
            affixPlanner('in-new', inNewKey, 'affixed_form_pairs/meN-tulis'),
            affixPlanner('out-new', outNewKey, 'learning_items/some-other-word'),
          ],
          learnerCapabilityStates: [],
          activatedLessons: new Set<string>(),
          selectedSourceRefs: affixRefs,
        },
        capabilitiesByKey: new Map(projections.map(p => [p.canonicalKey, p])),
        readinessByKey: new Map(projections.map(p => [p.canonicalKey, { status: 'ready' as const, allowedExercises: ['choose_form_ex' as const] }])),
        selectedSourceRefs: affixRefs,
      }))
      expect(plan.blocks.map(b => b.renderPlan.sourceRef)).toEqual(['affixed_form_pairs/meN-tulis'])
      expect(plan.blocks[0]?.pendingActivation).toEqual(expect.objectContaining({ capabilityId: 'in-new' }))
    })

    it('(iii) surfaces active-but-not-due affix caps via the practice-review pass', async () => {
      const projections = [affixCap(inActiveKey, 'affixed_form_pairs/meN-baca')]
      const plan = await loadCapabilitySessionPlan(baseInput({
        mode: 'affix_practice',
        limit: 10,
        schedulerRows: [
          // active, reviewed once, due in the FUTURE → not due, but in scope.
          activeState({ id: 'in-active-state', canonicalKeySnapshot: inActiveKey, capabilityId: 'in-active', reviewCount: 2, nextDueAt: '2026-04-28T09:00:00.000Z' }),
        ],
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 10,
          dueCount: 0,
          readyCapabilities: [],
          learnerCapabilityStates: [],
          activatedLessons: new Set<string>(),
          selectedSourceRefs: affixRefs,
        },
        capabilitiesByKey: new Map(projections.map(p => [p.canonicalKey, p])),
        readinessByKey: new Map(projections.map(p => [p.canonicalKey, { status: 'ready' as const, allowedExercises: ['choose_form_ex' as const] }])),
        selectedSourceRefs: affixRefs,
      }))
      expect(plan.blocks.map(b => b.renderPlan.sourceRef)).toEqual(['affixed_form_pairs/meN-baca'])
    })

    it('(iv) fills open budget slots with in-scope new caps after the due cap', async () => {
      const dueKey = 'affix-budget-due'
      const newKeys = ['affix-budget-new-1', 'affix-budget-new-2', 'affix-budget-new-3']
      const projections = [
        affixCap(dueKey, 'affixed_form_pairs/meN-ajar'),
        affixCap(newKeys[0]!, 'affixed_form_pairs/meN-tulis'),
        affixCap(newKeys[1]!, 'affixed_form_pairs/meN-baca'),
        affixCap(newKeys[2]!, 'affixed_form_pairs/meN-dengar'),
      ]
      const plan = await loadCapabilitySessionPlan(baseInput({
        mode: 'affix_practice',
        limit: 3,
        schedulerRows: [
          activeState({ id: 'budget-due-state', canonicalKeySnapshot: dueKey, capabilityId: 'budget-due', nextDueAt: '2026-04-25T09:00:00.000Z' }),
        ],
        plannerInput: {
          userId: 'user-1',
          preferredSessionSize: 3,
          dueCount: 1,
          readyCapabilities: newKeys.map((k, i) => affixPlanner(`budget-new-${i}`, k, projections[i + 1]!.sourceRef)),
          learnerCapabilityStates: [],
          activatedLessons: new Set<string>(),
          selectedSourceRefs: affixRefs,
        },
        capabilitiesByKey: new Map(projections.map(p => [p.canonicalKey, p])),
        readinessByKey: new Map(projections.map(p => [p.canonicalKey, { status: 'ready' as const, allowedExercises: ['choose_form_ex' as const] }])),
        selectedSourceRefs: affixRefs,
      }))
      // 1 due + open slots (3 - 1 = 2) filled with new in-scope caps = 3 total.
      expect(plan.blocks).toHaveLength(3)
      expect(plan.blocks[0]?.renderPlan.sourceRef).toBe('affixed_form_pairs/meN-ajar')
      expect(plan.blocks.filter(b => b.pendingActivation)).toHaveLength(2)
    })
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
          [lesson1Projection.canonicalKey, { status: 'ready', allowedExercises: ['type_meaning_ex'] }],
          [lesson2Projection.canonicalKey, { status: 'ready', allowedExercises: ['type_meaning_ex'] }],
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
      const podcastKey = 'cap:v1:podcast_segment_src:podcasts/warung/seg-01:recognise_meaning_from_audio_cap:l1_to_id:audio:nl'
      const podcastCap: PlannerCapability = {
        id: 'podcast-cap',
        canonicalKey: podcastKey,
        sourceKind: 'podcast_segment_src',
        sourceRef: 'podcasts/warung/seg-01',
        capabilityType: 'recognise_meaning_from_audio_cap',
        skillType: 'recognise_mode',
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
        readinessByKey: new Map(projections.map(p => [p.canonicalKey, { status: 'ready' as const, allowedExercises: ['type_meaning_ex' as const] }])),
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
        readinessByKey: new Map([[otherLessonProjection.canonicalKey, { status: 'ready', allowedExercises: ['type_meaning_ex'] }]]),
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
        readinessByKey: new Map([[currentLessonProjection.canonicalKey, { status: 'ready', allowedExercises: ['type_meaning_ex'] }]]),
        currentLessonId: currentLessonUuid,
        nextLessonNeedsExposure: true,
      }))
      expect(plan.diagnostics.find(d => d.reason === 'learning_pipeline_drying_up')).toBeUndefined()
    })
  })

  // Part A — the grammar due-floor wired end-to-end through the builder. The unit
  // tests (session-builder/__tests__/grammarDueFloor.test.ts) cover the pure
  // selection; this proves the builder calls it in standard mode with correct
  // family resolution, and that session size is preserved.
  // docs/plans/2026-07-05-grammar-exposure-session-quota-design.md §4A.
  describe('grammar due-floor (Part A)', () => {
    // 5 vocab words, each MORE overdue (2 days) than a single grammar cap (1h).
    // Distinct source_refs so sibling-burying doesn't collapse them.
    const vocab = Array.from({ length: 5 }, (_, i) => ({
      key: `vocab-key-${i}`,
      ref: `learning_items/vocab-${i}`,
      capId: `vocab-cap-${i}`,
    }))
    const grammarKey = 'grammar-key'
    const grammarRef = 'grammar_patterns/l6-pattern'

    const projections = new Map<string, ProjectedCapability>()
    const readiness = new Map<string, CapabilityReadiness>()
    for (const v of vocab) {
      projections.set(v.key, projectedCapability({ canonicalKey: v.key, sourceRef: v.ref, requiredArtifacts: [] }))
      readiness.set(v.key, { status: 'ready', allowedExercises: ['type_meaning_ex'] })
    }
    projections.set(grammarKey, projectedCapability({
      canonicalKey: grammarKey,
      sourceKind: 'grammar_pattern_src',
      sourceRef: grammarRef,
      capabilityType: 'recognise_grammar_pattern_cap',
      skillType: 'recognise_mode',
      requiredArtifacts: [],
    }))
    readiness.set(grammarKey, { status: 'ready', allowedExercises: ['choose_missing_word_ex'] })
    const schedulerRows = [
      ...vocab.map((v, i) => activeState({
        id: `vocab-state-${i}`, capabilityId: v.capId, canonicalKeySnapshot: v.key,
        nextDueAt: '2026-04-23T08:00:00.000Z', // 2 days overdue
      })),
      activeState({
        id: 'grammar-state', capabilityId: 'grammar-cap', canonicalKeySnapshot: grammarKey,
        nextDueAt: '2026-04-25T09:00:00.000Z', // 1h overdue — sorts BELOW all vocab
      }),
    ]

    it('promotes a less-overdue grammar cap into a vocab-dominated standard session, holding session size', async () => {
      // limit 5, 6 due caps. A plain most-overdue slice keeps the 5 vocab and drops
      // grammar. The 20% floor (floor(5*0.2)=1) reserves one slot for grammar.
      const plan = await loadCapabilitySessionPlan(baseInput({
        limit: 5,
        plannerInput: {
          userId: 'user-1', preferredSessionSize: 5, dueCount: 0,
          readyCapabilities: [], learnerCapabilityStates: [], activatedLessons: new Set<string>(),
        },
        schedulerRows,
        capabilitiesByKey: projections,
        readinessByKey: readiness,
      }))

      // Session size preserved exactly at the preset limit.
      expect(plan.blocks).toHaveLength(5)
      // Grammar was promoted despite sorting below all 5 vocab.
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === grammarKey)).toBe(true)
      // Exactly one vocab was displaced to make room (4 of 5 remain).
      expect(plan.blocks.filter(b => b.canonicalKeySnapshot.startsWith('vocab-key-'))).toHaveLength(4)
    })

    it('does not run the floor in lesson-scoped modes (legacy behaviour preserved)', async () => {
      // Same due pool, lesson_practice scoped to the vocab only → grammar (out of
      // scope) must NOT be pulled in by the floor.
      const selectedRefs = ['lesson-x', ...vocab.map(v => v.ref)]
      const plan = await loadCapabilitySessionPlan(baseInput({
        mode: 'lesson_practice', limit: 5,
        plannerInput: {
          userId: 'user-1', preferredSessionSize: 5, dueCount: 0,
          readyCapabilities: [], learnerCapabilityStates: [], activatedLessons: new Set<string>(),
          selectedLessonId: 'lesson-x', selectedSourceRefs: selectedRefs,
        },
        schedulerRows,
        capabilitiesByKey: projections,
        readinessByKey: readiness,
        selectedLessonId: 'lesson-x', selectedSourceRefs: selectedRefs,
      }))
      expect(plan.blocks.some(b => b.canonicalKeySnapshot === grammarKey)).toBe(false)
    })
  })

  describe('sibling burying — one capability per source_ref per build', () => {
    const ref = 'learning_items/item-1' // the shared default sourceRef
    const keyA = 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl'
    const keyB = 'cap:v1:item:learning_items/item-1:recognise_meaning_from_text_cap:id_to_l1:text:nl'
    const projA = projectedCapability({ canonicalKey: keyA, capabilityType: 'recall_meaning_from_text_cap', skillType: 'recall_mode' })
    const projB = projectedCapability({ canonicalKey: keyB, capabilityType: 'recognise_meaning_from_text_cap', skillType: 'recognise_mode' })
    const capabilitiesByKey = new Map([[keyA, projA], [keyB, projB]])
    const readinessByKey: Map<string, CapabilityReadiness> = new Map([
      [keyA, { status: 'ready', allowedExercises: ['type_meaning_ex'] }],
      [keyB, { status: 'ready', allowedExercises: ['choose_meaning_ex'] }],
    ])
    // A is more overdue than B (a full day earlier → an older 24h bucket), so it
    // sorts ahead of B regardless of the within-bucket shuffle and wins the
    // word's single slot.
    const stateA = activeState({ id: 'state-1', capabilityId: 'capability-1', canonicalKeySnapshot: keyA, nextDueAt: '2026-04-23T08:00:00.000Z' })
    const stateB = activeState({ id: 'state-2', capabilityId: 'capability-2', canonicalKeySnapshot: keyB, nextDueAt: '2026-04-25T09:00:00.000Z' })

    it('serves at most one due sibling of a word, keeping the most-overdue', async () => {
      const plan = await loadCapabilitySessionPlan(baseInput({
        schedulerRows: [stateA, stateB],
        capabilitiesByKey,
        readinessByKey,
      }))
      const due = plan.blocks.filter(b => b.kind === 'due_review')
      expect(due).toHaveLength(1)
      expect(due[0].capabilityId).toBe('capability-1')
    })

    it('buries every sibling of a word already reviewed today', async () => {
      const plan = await loadCapabilitySessionPlan(baseInput({
        schedulerRows: [stateA, stateB],
        capabilitiesByKey,
        readinessByKey,
        reviewedTodayRefs: new Set([ref]),
      }))
      expect(plan.blocks.filter(b => b.kind === 'due_review')).toHaveLength(0)
    })

    // Cross-pass regression for the 2026-06-09 bury-before-allocate move: the
    // due pass's claimed refs must still reach the planner (via usedSourceRefs),
    // so a word served as a due review this build is NOT also introduced.
    // keyB (recognise_meaning_from_text_cap) is a DORMANT new-intro candidate for the SAME word.
    const newIntroPlannerInput = {
      userId: 'user-1',
      preferredSessionSize: 15,
      dueCount: 0,
      readyCapabilities: [plannerCapability({
        id: 'capability-2', canonicalKey: keyB, sourceRef: ref, capabilityType: 'recognise_meaning_from_text_cap', lessonId: null,
      })],
      learnerCapabilityStates: [],
      activatedLessons: new Set<string>(),
    }

    it('introduces the dormant sibling when the word is NOT served as a due review', async () => {
      const plan = await loadCapabilitySessionPlan(baseInput({
        schedulerRows: [], // no due → word is free this build
        capabilitiesByKey,
        readinessByKey,
        plannerInput: newIntroPlannerInput,
      }))
      expect(plan.blocks.some(b => b.kind === 'new_introduction' && b.capabilityId === 'capability-2')).toBe(true)
    })

    it('does NOT introduce the dormant sibling when the word IS served as a due review this build', async () => {
      const plan = await loadCapabilitySessionPlan(baseInput({
        schedulerRows: [stateA], // keyA (meaning_recall) is active/due → served
        capabilitiesByKey,
        readinessByKey,
        plannerInput: newIntroPlannerInput,
      }))
      expect(plan.blocks.filter(b => b.kind === 'due_review')).toHaveLength(1)
      expect(plan.blocks.some(b => b.capabilityId === 'capability-2')).toBe(false)
      expect(plan.blocks.filter(b => b.kind === 'new_introduction')).toHaveLength(0)
    })
  })
})
