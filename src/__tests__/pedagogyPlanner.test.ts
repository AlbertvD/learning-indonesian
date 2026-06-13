import { describe, expect, it } from 'vitest'
import { planLearningPath, prioritizeCandidates, capabilityFamily, type PlannerCapability } from '@/lib/session-builder/pedagogy'

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
        stability: null,
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
    // preferredSessionSize=1, dueCount=0 → openSlots=1 → maxNewCapabilities=1.
    // Only the first cap in input order fits; the second is suppressed.
    // Both caps use receptive types (Phase ≤ 2) so the staging gate at
    // pedagogy.ts (added 2026-05-18) does not interfere with the budget rule
    // this test exercises. They are DIFFERENT words (distinct source_refs) so
    // sibling-burying (2026-06-09, runs before allocate) doesn't dedupe them —
    // this isolates the budget rule, not the bury rule.
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 1,
      dueCount: 0,
      readyCapabilities: [
        capability({
          id: 'meaning-cap',
          canonicalKey: 'meaning-cap',
          capabilityType: 'meaning_recall',
          skillType: 'meaning_recall',
        }),
        capability({
          id: 'recognition-cap',
          canonicalKey: 'recognition-cap',
          sourceRef: 'learning_items/item-2',
          capabilityType: 'text_recognition',
          skillType: 'recognition',
        }),
      ],
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual(['meaning-cap'])
    expect(plan.suppressedCapabilities).toContainEqual({ canonicalKey: 'recognition-cap', reason: 'load_budget_exhausted' })
  })

  it('fills openSlots with new caps in standard mode when the eligible pool is large enough', () => {
    // Integration guard for docs/plans/2026-05-17-honor-profile-session-size.md.
    // preferredSessionSize=25, dueCount=6 → openSlots=19. With 25 eligible caps
    // (all distinct canonical keys, all meaning_recall to avoid per-type caps
    // being the constraint), the planner must emit exactly 19 new caps.
    const readyCapabilities = Array.from({ length: 25 }, (_, index) => capability({
      id: `cap-${index}`,
      canonicalKey: `cap-${index}`,
      sourceRef: `learning_items/item-${index}`,
      capabilityType: 'meaning_recall',
      skillType: 'meaning_recall',
    }))

    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-05-17T00:00:00.000Z'),
      preferredSessionSize: 25,
      dueCount: 6,
      readyCapabilities,
      learnerCapabilityStates: [],
      activatedLessons: new Set(),
    })

    expect(plan.eligibleNewCapabilities).toHaveLength(19)
    expect(plan.loadBudget.maxNewCapabilities).toBe(19)
    const suppressedForBudget = plan.suppressedCapabilities.filter(item => item.reason === 'load_budget_exhausted')
    expect(suppressedForBudget).toHaveLength(6)
  })
})

// Plan: docs/plans/2026-05-18-capability-staging-gate.md (§4, §7.1)
describe('pedagogy planner — receptive-before-productive staging gate', () => {
  // Build a productive (Phase 4) candidate that shares a sourceRef with the
  // hypothetical receptive sibling at 'cap:receptive'.
  const sharedSourceRef = 'learning_items/test-item'
  const productive = (overrides: Partial<PlannerCapability> = {}): PlannerCapability => capability({
    id: 'productive-cap',
    canonicalKey: 'cap:productive',
    capabilityType: 'form_recall',
    skillType: 'meaning_recall',
    sourceRef: sharedSourceRef,
    ...overrides,
  })

  const baseInput = {
    userId: 'user-1',
    mode: 'standard' as const,
    now: new Date('2026-05-18T00:00:00.000Z'),
    preferredSessionSize: 25,
    dueCount: 0,
    activatedLessons: new Set<string>(),
  }

  it('suppresses a Phase-4 candidate when no sibling state exists', () => {
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [productive()],
      learnerCapabilityStates: [],
    })
    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('productive_capability_not_unlocked')
  })

  it('suppresses a Phase-4 candidate when the sibling is dormant', () => {
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [productive()],
      learnerCapabilityStates: [{
        canonicalKey: 'cap:receptive',
        activationState: 'dormant',
        reviewCount: 0,
        successfulReviewCount: 0,
        stability: null,
      }],
    })
    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('productive_capability_not_unlocked')
  })

  it('suppresses a Phase-4 candidate when sibling stability is below 1 day', () => {
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [productive()],
      learnerCapabilityStates: [{
        canonicalKey: 'cap:receptive',
        activationState: 'active',
        reviewCount: 1,
        successfulReviewCount: 1,
        stability: 0.5,
      }],
      // sibling lookup must also find the receptive cap in the planner pool:
      // sourceRef matching is what links the productive candidate to the state.
    })
    // No sibling capability in readyCapabilities, so canonicalKey → sourceRef
    // mapping fails — the gate still suppresses.
    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('productive_capability_not_unlocked')
  })

  it('suppresses a Phase-4 candidate when sibling has zero successful reviews', () => {
    const receptive = capability({
      id: 'receptive-cap',
      canonicalKey: 'cap:receptive',
      capabilityType: 'text_recognition',
      sourceRef: sharedSourceRef,
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [receptive, productive()],
      learnerCapabilityStates: [{
        canonicalKey: 'cap:receptive',
        activationState: 'active',
        reviewCount: 0,
        successfulReviewCount: 0,
        stability: 2.0,
      }],
    })
    // The receptive cap is suppressed as 'already_active_or_retired'; the
    // productive cap is suppressed by the staging gate because the sibling
    // has no successful review yet.
    const productiveSuppression = plan.suppressedCapabilities.find(s => s.canonicalKey === 'cap:productive')
    expect(productiveSuppression?.reason).toBe('productive_capability_not_unlocked')
  })

  it('admits a Phase-4 candidate when the sibling is fully unlocked', () => {
    const receptive = capability({
      id: 'receptive-cap',
      canonicalKey: 'cap:receptive',
      capabilityType: 'text_recognition',
      sourceRef: sharedSourceRef,
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [receptive, productive()],
      learnerCapabilityStates: [{
        canonicalKey: 'cap:receptive',
        activationState: 'active',
        reviewCount: 2,
        successfulReviewCount: 1,
        stability: 1.0,
      }],
    })
    const eligibleKeys = plan.eligibleNewCapabilities.map(e => e.capability.canonicalKey)
    expect(eligibleKeys).toContain('cap:productive')
  })

  it('admits a Phase-3 candidate when the sibling is fully unlocked', () => {
    const receptive = capability({
      id: 'receptive-cap',
      canonicalKey: 'cap:receptive',
      capabilityType: 'text_recognition',
      sourceRef: sharedSourceRef,
    })
    const productiveMcq = capability({
      id: 'mcq-cap',
      canonicalKey: 'cap:mcq',
      capabilityType: 'l1_to_id_choice',
      sourceRef: sharedSourceRef,
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [receptive, productiveMcq],
      learnerCapabilityStates: [{
        canonicalKey: 'cap:receptive',
        activationState: 'active',
        reviewCount: 3,
        successfulReviewCount: 2,
        stability: 5.0,
      }],
    })
    const eligibleKeys = plan.eligibleNewCapabilities.map(e => e.capability.canonicalKey)
    expect(eligibleKeys).toContain('cap:mcq')
  })

  it('does not gate Phase-1 candidates regardless of sibling state', () => {
    const newReceptive = capability({
      id: 'new-receptive',
      canonicalKey: 'cap:new-receptive',
      capabilityType: 'text_recognition',
      sourceRef: 'learning_items/other-item',
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [newReceptive],
      learnerCapabilityStates: [],
    })
    expect(plan.eligibleNewCapabilities).toHaveLength(1)
    expect(plan.eligibleNewCapabilities[0]?.capability.canonicalKey).toBe('cap:new-receptive')
  })

  it('does not gate Phase-2 candidates regardless of sibling state', () => {
    const newMeaning = capability({
      id: 'new-meaning',
      canonicalKey: 'cap:new-meaning',
      capabilityType: 'meaning_recall',
      sourceRef: 'learning_items/other-item',
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [newMeaning],
      learnerCapabilityStates: [],
    })
    expect(plan.eligibleNewCapabilities).toHaveLength(1)
    expect(plan.eligibleNewCapabilities[0]?.capability.canonicalKey).toBe('cap:new-meaning')
  })

  it('suppresses orphan productive caps of source kinds that DO have a Phase 1/2 ladder', () => {
    // An `item` productive cap (form_recall, Phase 4) at a source_ref whose
    // receptive sibling has not stabilised stays locked — this is the staging
    // gate's intended behaviour for source kinds that have a receptive ladder.
    const orphan = capability({
      id: 'orphan-cap',
      canonicalKey: 'cap:orphan',
      sourceKind: 'item',
      capabilityType: 'form_recall',
      sourceRef: 'learning_items/orphan-item',
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [orphan],
      learnerCapabilityStates: [],
    })
    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]?.reason).toBe('productive_capability_not_unlocked')
  })

  it('exempts pattern (grammar) from the staging gate', () => {
    // Grammar has no Phase 1/2 ladder — its only two types (pattern_contrast,
    // pattern_recognition) are both productive and share the pattern's own
    // source_ref, so `unlockedSourceRefs` never contains it. The staging gate
    // used to orphan-suppress pattern on the now-expired premise that pattern
    // types were inert at runtime; Slice 2 (#100) made them renderable. The
    // carve-out unlocks the ~194 published pattern caps (issue #166).
    const patternRecognition = capability({
      id: 'pattern-recognition',
      canonicalKey: 'cap:pattern:recognition',
      sourceKind: 'pattern',
      capabilityType: 'pattern_recognition',
      sourceRef: 'patterns/test-pattern',
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [patternRecognition],
      learnerCapabilityStates: [],
    })
    expect(plan.eligibleNewCapabilities.map(e => e.capability.canonicalKey)).toContain('cap:pattern:recognition')
  })

  it('exempts affixed_form_pair (morphology) from the staging gate', () => {
    // Morphology has no Phase 1/2 ladder — every cap is productive
    // (root_derived_recognition + root_derived_recall). The carve-out keeps
    // the within-pattern prerequisite chain as the sequencing mechanism.
    const morphologyRecognition = capability({
      id: 'morph-recognition',
      canonicalKey: 'cap:morph:recognition',
      sourceKind: 'affixed_form_pair',
      capabilityType: 'root_derived_recognition',
      sourceRef: 'morphology/test-pattern',
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [morphologyRecognition],
      learnerCapabilityStates: [],
    })
    // Should admit despite Phase 4 classification + no sibling state, because
    // the source_kind exempts it from the staging gate.
    expect(plan.eligibleNewCapabilities.map(e => e.capability.canonicalKey)).toContain('cap:morph:recognition')
  })

  it('exempts dialogue_line from the staging gate (PR-C of lib/exercise-content fold)', () => {
    // Each dialogue line has exactly one productive cap (contextual_cloze)
    // and no Phase 1/2 sibling at the same source_ref. Receptive items on
    // the same lesson live at different source_refs (learning_items/<slug>),
    // so the staging gate's source_ref-keyed sibling lookup never matches.
    // Without this carve-out every dialogue_line cap is permanently orphan-
    // suppressed. lesson_activation is the actual readiness lever for these
    // caps (Decision 3b / ADR 0006).
    const dialogueCloze = capability({
      id: 'dialogue-cloze-1',
      canonicalKey: 'cap:dialogue:l9-s1-l10',
      sourceKind: 'dialogue_line',
      capabilityType: 'contextual_cloze',
      sourceRef: 'lesson-9/section-1/line-10',
      lessonId: 'lesson-9-uuid',
    })
    const plan = planLearningPath({
      ...baseInput,
      readyCapabilities: [dialogueCloze],
      learnerCapabilityStates: [],
      activatedLessons: new Set(['lesson-9-uuid']),
    })
    expect(plan.eligibleNewCapabilities.map(e => e.capability.canonicalKey)).toContain('cap:dialogue:l9-s1-l10')
  })
})

// NET-NEW (issue #166/#125): the prioritize stage's ordering contract. The
// existing suites above assert eligible *membership* only (order-insensitive
// .toContain / single-element .toEqual), so none of them would catch a broken
// or no-op `prioritize`. These are the load-bearing ordering tests.
describe('capabilityFamily — source-kind-keyed taxonomy', () => {
  it('maps every source kind to exactly one family', () => {
    expect(capabilityFamily('item')).toBe('vocab')
    expect(capabilityFamily('dialogue_line')).toBe('cloze')
    expect(capabilityFamily('pattern')).toBe('grammar')
    expect(capabilityFamily('affixed_form_pair')).toBe('morphology')
    expect(capabilityFamily('podcast_segment')).toBe('podcast')
    expect(capabilityFamily('podcast_phrase')).toBe('podcast')
  })
})

describe('prioritizeCandidates — lesson-major + within-lesson family round-robin', () => {
  const cap = (overrides: Partial<PlannerCapability>): PlannerCapability =>
    capability({ ...overrides })
  const keys = (caps: PlannerCapability[]) => caps.map(c => c.canonicalKey)

  it('orders lesson-major (lower lessonOrder first)', () => {
    const out = prioritizeCandidates([
      cap({ canonicalKey: 'l3', lessonOrder: 3 }),
      cap({ canonicalKey: 'l1', lessonOrder: 1 }),
      cap({ canonicalKey: 'l2', lessonOrder: 2 }),
    ])
    expect(keys(out)).toEqual(['l1', 'l2', 'l3'])
  })

  it('round-robins families within a lesson so scarce families interleave with vocab', () => {
    // L1: 3 vocab (item) + 2 grammar (pattern). Rank within each family is by
    // canonicalKey; the sort then emits rank0 of each family, then rank1, …
    const out = prioritizeCandidates([
      cap({ canonicalKey: 'cap:vocab:3', lessonOrder: 1, sourceKind: 'item' }),
      cap({ canonicalKey: 'cap:gram:2', lessonOrder: 1, sourceKind: 'pattern', capabilityType: 'pattern_contrast' }),
      cap({ canonicalKey: 'cap:vocab:1', lessonOrder: 1, sourceKind: 'item' }),
      cap({ canonicalKey: 'cap:gram:1', lessonOrder: 1, sourceKind: 'pattern', capabilityType: 'pattern_contrast' }),
      cap({ canonicalKey: 'cap:vocab:2', lessonOrder: 1, sourceKind: 'item' }),
    ])
    expect(keys(out)).toEqual(['cap:vocab:1', 'cap:gram:1', 'cap:vocab:2', 'cap:gram:2', 'cap:vocab:3'])
  })

  it('keeps lesson priority above family interleave (all L1 before any L2)', () => {
    const out = prioritizeCandidates([
      cap({ canonicalKey: 'l2:gram', lessonOrder: 2, sourceKind: 'pattern', capabilityType: 'pattern_contrast' }),
      cap({ canonicalKey: 'l1:vocab', lessonOrder: 1, sourceKind: 'item' }),
      cap({ canonicalKey: 'l1:gram', lessonOrder: 1, sourceKind: 'pattern', capabilityType: 'pattern_contrast' }),
    ])
    expect(keys(out)).toEqual(['l1:vocab', 'l1:gram', 'l2:gram'])
  })

  it('sorts null-lessonOrder caps last', () => {
    const out = prioritizeCandidates([
      cap({ canonicalKey: 'no-lesson', lessonOrder: null, sourceKind: 'podcast_segment', capabilityType: 'audio_recognition' }),
      cap({ canonicalKey: 'l1', lessonOrder: 1 }),
    ])
    expect(keys(out)).toEqual(['l1', 'no-lesson'])
  })

  it('is deterministic — output is independent of input array order', () => {
    const input = [
      cap({ canonicalKey: 'cap:vocab:1', lessonOrder: 1, sourceKind: 'item' }),
      cap({ canonicalKey: 'cap:gram:1', lessonOrder: 1, sourceKind: 'pattern', capabilityType: 'pattern_contrast' }),
      cap({ canonicalKey: 'cap:vocab:2', lessonOrder: 1, sourceKind: 'item' }),
      cap({ canonicalKey: 'l2', lessonOrder: 2, sourceKind: 'item' }),
    ]
    const forward = keys(prioritizeCandidates(input))
    const reversed = keys(prioritizeCandidates([...input].reverse()))
    expect(reversed).toEqual(forward)
  })
})

describe('sibling-burying before budget allocation (fill-to-size)', () => {
  const now = new Date('2026-06-09T00:00:00.000Z')

  // The direct regression for the 2026-06-09 "no cards" bug: when the
  // top-ranked candidates are all siblings of words already spoken-for today,
  // burying must run BEFORE allocateBudget so the freed slots fill with fresh
  // words — the session reaches preferredSessionSize instead of collapsing.
  it('fills preferredSessionSize from fresh words when the top-ranked candidates are all buried', () => {
    const todaysWords = ['a', 'b', 'c'].map((r, i) => capability({
      id: `today-${i}`, canonicalKey: `cap:today:${r}`, sourceRef: `learning_items/${r}`,
    }))
    const freshWords = ['d', 'e', 'f', 'g', 'h'].map((r, i) => capability({
      id: `fresh-${i}`, canonicalKey: `cap:fresh:${r}`, sourceRef: `learning_items/${r}`,
    }))
    const plan = planLearningPath({
      userId: 'u', mode: 'standard', now, preferredSessionSize: 3, dueCount: 0,
      readyCapabilities: [...todaysWords, ...freshWords],
      learnerCapabilityStates: [], activatedLessons: new Set(),
      usedSourceRefs: new Set(['learning_items/a', 'learning_items/b', 'learning_items/c']),
    })

    expect(plan.eligibleNewCapabilities).toHaveLength(3)
    const eligibleRefs = plan.eligibleNewCapabilities.map(e => e.capability.sourceRef)
    expect(eligibleRefs).not.toContain('learning_items/a')
    expect(eligibleRefs).not.toContain('learning_items/b')
    expect(eligibleRefs).not.toContain('learning_items/c')
    expect(plan.suppressedCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalKey: 'cap:today:a', reason: 'sibling_buried' }),
      expect.objectContaining({ canonicalKey: 'cap:today:b', reason: 'sibling_buried' }),
      expect.objectContaining({ canonicalKey: 'cap:today:c', reason: 'sibling_buried' }),
    ]))
  })

  it('buries within-batch siblings: at most one eligible per source_ref', () => {
    const siblings = [1, 2, 3].map(n => capability({
      id: `sib-${n}`, canonicalKey: `cap:same:${n}`, sourceRef: 'learning_items/word',
    }))
    const plan = planLearningPath({
      userId: 'u', mode: 'standard', now, preferredSessionSize: 15, dueCount: 0,
      readyCapabilities: siblings, learnerCapabilityStates: [], activatedLessons: new Set(),
    })

    const eligibleRefs = plan.eligibleNewCapabilities.map(e => e.capability.sourceRef)
    expect(eligibleRefs.filter(r => r === 'learning_items/word')).toHaveLength(1)
    expect(plan.suppressedCapabilities.filter(s => s.reason === 'sibling_buried')).toHaveLength(2)
  })
})

describe('pedagogy planner — listening-disabled gating', () => {
  const now = new Date('2026-04-25T00:00:00.000Z')

  // Audio-prompt capability types: dictation / audio_recognition / podcast_gist.
  // audio_recognition is Phase 1 (recognition) — not staging-gated — so it is
  // admitted by default and the listening gate is the only thing that removes it.
  function audioCap(n: number): PlannerCapability {
    return capability({
      id: `audio-${n}`,
      canonicalKey: `cap:audio:${n}`,
      sourceRef: `learning_items/audio-${n}`,
      capabilityType: 'audio_recognition',
      skillType: 'recognition',
    })
  }
  function textCap(n: number): PlannerCapability {
    return capability({
      id: `text-${n}`,
      canonicalKey: `cap:text:${n}`,
      sourceRef: `learning_items/text-${n}`,
      capabilityType: 'text_recognition',
      skillType: 'recognition',
    })
  }

  it('admits audio-prompt new capabilities by default (listeningEnabled omitted)', () => {
    const plan = planLearningPath({
      userId: 'u', mode: 'standard', now, preferredSessionSize: 15, dueCount: 0,
      readyCapabilities: [audioCap(1)], learnerCapabilityStates: [], activatedLessons: new Set(),
    })
    expect(plan.eligibleNewCapabilities.map(e => e.capability.canonicalKey)).toEqual(['cap:audio:1'])
  })

  it('suppresses audio-prompt new capabilities when listeningEnabled is false', () => {
    const plan = planLearningPath({
      userId: 'u', mode: 'standard', now, preferredSessionSize: 15, dueCount: 0,
      readyCapabilities: [audioCap(1), textCap(1)], learnerCapabilityStates: [],
      activatedLessons: new Set(), listeningEnabled: false,
    })
    expect(plan.eligibleNewCapabilities.map(e => e.capability.canonicalKey)).toEqual(['cap:text:1'])
    expect(plan.suppressedCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalKey: 'cap:audio:1', reason: 'listening_disabled' }),
    ]))
  })

  it('still fills to preferredSessionSize from non-audio caps when audio is disabled', () => {
    // 2 audio + 5 text candidates, session size 4. With audio suppressed at the
    // gate (before allocation), the budget backfills 4 text caps — not 2.
    const readyCapabilities = [
      audioCap(1), audioCap(2),
      ...[1, 2, 3, 4, 5].map(textCap),
    ]
    const plan = planLearningPath({
      userId: 'u', mode: 'standard', now, preferredSessionSize: 4, dueCount: 0,
      readyCapabilities, learnerCapabilityStates: [],
      activatedLessons: new Set(), listeningEnabled: false,
    })
    expect(plan.eligibleNewCapabilities).toHaveLength(4)
    expect(plan.eligibleNewCapabilities.every(e => e.capability.canonicalKey.startsWith('cap:text:'))).toBe(true)
  })
})
