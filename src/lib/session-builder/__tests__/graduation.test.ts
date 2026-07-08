import { describe, expect, it } from 'vitest'
import { suppressGraduatedVocabDue } from '../graduation'
import { loadCapabilitySessionPlan } from '../builder'
import type { DueCapability, LearnerCapabilityStateRow } from '../dueFilter'
import type { PlannerCapability } from '../pedagogy'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'

// docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md §4.5 — the 5
// scenarios, plus the recomposition truth-table test (§4.1). Word "kucing" (cat)
// carries vocab modes #1 (recognise_meaning_from_text_cap, receptive scaffold),
// #3 (recognise_meaning_from_audio_cap, aural — never retired) and #6
// (produce_form_from_meaning_cap, productive frontier — never retired).

const now = new Date('2026-07-08T10:00:00.000Z')
const sourceRef = 'learning_items/kucing'
const recogniseKey = 'cap:v1:vocabulary_src:learning_items/kucing:recognise_meaning_from_text_cap:id_to_l1:text:nl'
const audioKey = 'cap:v1:vocabulary_src:learning_items/kucing:recognise_meaning_from_audio_cap:audio_to_l1:audio:nl'
const produceKey = 'cap:v1:vocabulary_src:learning_items/kucing:produce_form_from_meaning_cap:l1_to_id:text:nl'

function vocabCap(overrides: Partial<ProjectedCapability> & { canonicalKey: string; capabilityType: ProjectedCapability['capabilityType'] }): ProjectedCapability {
  return {
    sourceKind: 'vocabulary_src',
    sourceRef,
    skillType: 'recognise_mode',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    requiredArtifacts: [],
    prerequisiteKeys: [],
    projectionVersion: 'capability-v3',
    ...overrides,
  }
}

const recognise = vocabCap({ canonicalKey: recogniseKey, capabilityType: 'recognise_meaning_from_text_cap' })
const audio = vocabCap({ canonicalKey: audioKey, capabilityType: 'recognise_meaning_from_audio_cap', direction: 'audio_to_l1', modality: 'audio' })
const produce = vocabCap({ canonicalKey: produceKey, capabilityType: 'produce_form_from_meaning_cap', direction: 'l1_to_id' })

const capabilitiesByKey = new Map<string, ProjectedCapability>([
  [recogniseKey, recognise],
  [audioKey, audio],
  [produceKey, produce],
])

function due(canonicalKeySnapshot: string, overrides: Partial<DueCapability> = {}): DueCapability {
  return {
    stateId: `state-${canonicalKeySnapshot}`,
    capabilityId: `cap-${canonicalKeySnapshot}`,
    canonicalKeySnapshot,
    nextDueAt: '2026-07-08T00:00:00.000Z',
    stateVersion: 1,
    ...overrides,
  }
}

function stateRow(canonicalKeySnapshot: string, overrides: Partial<LearnerCapabilityStateRow> = {}): LearnerCapabilityStateRow {
  return {
    id: `state-${canonicalKeySnapshot}`,
    userId: 'user-1',
    capabilityId: `cap-${canonicalKeySnapshot}`,
    canonicalKeySnapshot,
    activationState: 'active',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    stability: 1,
    difficulty: 5,
    lastReviewedAt: '2026-07-01T00:00:00.000Z',
    nextDueAt: null,
    reviewCount: 1,
    lapseCount: 0,
    consecutiveFailureCount: 0,
    stateVersion: 1,
    ...overrides,
  }
}

describe('suppressGraduatedVocabDue', () => {
  it('1 — excludes #1 due entry when #6 has mastery strength; last review 60d ago pins the recency-free fix', () => {
    // reviewCount=4, stability=14, consecutiveFailureCount=0 → hasMasteryStrength.
    // lastReviewedAt is 60 DAYS before "now" — well past isCapabilityMastered's
    // 30-day recency window. If this helper mistakenly used isCapabilityMastered
    // instead of hasMasteryStrength, the suppression would NOT fire; it must
    // fire anyway, proving the recency-free extraction is actually wired in.
    const orderedDue = [due(recogniseKey), due(audioKey), due(produceKey)]
    const schedulerRows = [
      stateRow(produceKey, {
        reviewCount: 4,
        stability: 14,
        consecutiveFailureCount: 0,
        lastReviewedAt: '2026-05-09T00:00:00.000Z', // 60 days before 2026-07-08
      }),
    ]

    const result = suppressGraduatedVocabDue(orderedDue, capabilitiesByKey, schedulerRows)

    // #1 (recognise) is gone; #3 (audio) and #6 (produce) — never suppressed — remain.
    expect(result.map(d => d.canonicalKeySnapshot)).toEqual([audioKey, produceKey])
  })

  it('2 — #6 below mastery strength (reviewCount < 4) → no suppression', () => {
    const orderedDue = [due(recogniseKey)]
    const schedulerRows = [stateRow(produceKey, { reviewCount: 3, stability: 14, consecutiveFailureCount: 0 })]

    const result = suppressGraduatedVocabDue(orderedDue, capabilitiesByKey, schedulerRows)

    expect(result.map(d => d.canonicalKeySnapshot)).toEqual([recogniseKey])
  })

  it('3 — lapse: #6 consecutiveFailureCount > 0 breaks the strength bar → #1 reappears', () => {
    const orderedDue = [due(recogniseKey)]
    // Otherwise well past the bar (reviewCount/stability), but a current failure
    // makes hasMasteryStrength false — the rule is stateless, so #1 un-suppresses
    // on the very next build with no reconciliation needed.
    const schedulerRows = [stateRow(produceKey, { reviewCount: 6, stability: 20, consecutiveFailureCount: 1 })]

    const result = suppressGraduatedVocabDue(orderedDue, capabilitiesByKey, schedulerRows)

    expect(result.map(d => d.canonicalKeySnapshot)).toEqual([recogniseKey])
  })

  it('4a — missing #6 scheduler state (never introduced/reviewed yet) → never suppress', () => {
    const orderedDue = [due(recogniseKey)]

    const result = suppressGraduatedVocabDue(orderedDue, capabilitiesByKey, [])

    expect(result.map(d => d.canonicalKeySnapshot)).toEqual([recogniseKey])
  })

  it('4b — non-vocab family (grammar_pattern_src) → untouched even given a strong same-shaped scheduler row', () => {
    const grammarKey = 'cap:v1:grammar_pattern_src:grammar_patterns/l6-pattern:recognise_grammar_pattern_cap:none:text:nl'
    const grammarCap: ProjectedCapability = {
      canonicalKey: grammarKey,
      sourceKind: 'grammar_pattern_src',
      sourceRef: 'grammar_patterns/l6-pattern',
      capabilityType: 'recognise_grammar_pattern_cap',
      skillType: 'recognise_mode',
      direction: 'none',
      modality: 'text',
      learnerLanguage: 'nl',
      requiredArtifacts: [],
      prerequisiteKeys: [],
      projectionVersion: 'capability-v3',
    }
    const byKey = new Map([...capabilitiesByKey, [grammarKey, grammarCap] as const])
    const orderedDue = [due(grammarKey)]
    const schedulerRows = [stateRow(produceKey, { reviewCount: 6, stability: 20, consecutiveFailureCount: 0 })]

    const result = suppressGraduatedVocabDue(orderedDue, byKey, schedulerRows)

    expect(result.map(d => d.canonicalKeySnapshot)).toEqual([grammarKey])
  })

  it('4c — other vocab types (#3 aural, #6 itself) are never suppressed even when #6 is strong', () => {
    const orderedDue = [due(audioKey), due(produceKey)]
    const schedulerRows = [stateRow(produceKey, { reviewCount: 6, stability: 20, consecutiveFailureCount: 0 })]

    const result = suppressGraduatedVocabDue(orderedDue, capabilitiesByKey, schedulerRows)

    expect(result.map(d => d.canonicalKeySnapshot)).toEqual([audioKey, produceKey])
  })

  it('is pure — does not mutate the input due list', () => {
    const orderedDue = [due(recogniseKey), due(audioKey)]
    const snapshot = [...orderedDue]
    const schedulerRows = [stateRow(produceKey, { reviewCount: 6, stability: 20, consecutiveFailureCount: 0 })]

    suppressGraduatedVocabDue(orderedDue, capabilitiesByKey, schedulerRows)

    expect(orderedDue).toEqual(snapshot)
  })
})

describe('vocab graduation wired through loadCapabilitySessionPlan (integration, §4.5.5)', () => {
  const newKey = 'cap:v1:vocabulary_src:learning_items/anjing:recognise_meaning_from_text_cap:id_to_l1:text:nl'
  const newCandidateProjection = vocabCap({
    canonicalKey: newKey,
    sourceRef: 'learning_items/anjing',
    capabilityType: 'recognise_meaning_from_text_cap',
  })
  const newCandidate: PlannerCapability = {
    id: 'capability-anjing',
    canonicalKey: newKey,
    sourceKind: 'vocabulary_src',
    sourceRef: 'learning_items/anjing',
    capabilityType: 'recognise_meaning_from_text_cap',
    skillType: 'recognise_mode',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    prerequisiteKeys: [],
    lessonId: null,
  }

  function baseSnapshot() {
    return {
      capabilitiesByKey: new Map<string, ProjectedCapability>([
        ...capabilitiesByKey,
        [newKey, newCandidateProjection],
      ]),
      readinessByKey: new Map([
        [recogniseKey, { status: 'ready' as const, allowedExercises: ['choose_meaning_ex' as const] }],
        [newKey, { status: 'ready' as const, allowedExercises: ['choose_meaning_ex' as const] }],
      ]),
    }
  }

  it('a graduated #1 drops out of dueCount/backlogDueCount and frees the slot for a new introduction', async () => {
    // preferredSessionSize=1, limit=1: WITHOUT suppression, #1 is due, dueCount=1,
    // openSlots=max(0, 1-1)=0 → no new introduction. The graduated #6 state below
    // makes #1's due entry vanish → dueCount=0 → openSlots=1 → the ready new
    // candidate (a different word) gets introduced instead.
    const snapshot = baseSnapshot()
    const plan = await loadCapabilitySessionPlan({
      enabled: true,
      sessionId: 'session-1',
      mode: 'standard',
      now,
      limit: 1,
      schedulerRows: [
        stateRow(recogniseKey, { nextDueAt: '2026-07-08T09:00:00.000Z' }), // due
        stateRow(produceKey, {
          reviewCount: 4,
          stability: 14,
          consecutiveFailureCount: 0,
          lastReviewedAt: '2026-05-09T00:00:00.000Z',
          nextDueAt: '2026-08-01T00:00:00.000Z', // not itself due — irrelevant to graduation
        }),
      ],
      plannerInput: {
        userId: 'user-1',
        preferredSessionSize: 1,
        dueCount: 0,
        readyCapabilities: [newCandidate],
        learnerCapabilityStates: [],
        activatedLessons: new Set<string>(),
      },
      capabilitiesByKey: snapshot.capabilitiesByKey,
      readinessByKey: snapshot.readinessByKey,
    })

    expect(plan.backlogDueCount).toBe(0) // #1 shed BEFORE the backlog count is taken
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]).toEqual(expect.objectContaining({
      kind: 'new_introduction',
      canonicalKeySnapshot: newKey,
    }))
    expect(plan.blocks.some(b => b.canonicalKeySnapshot === recogniseKey)).toBe(false)
  })

  it('control: without #6 mastery strength, #1 stays due and the slot budget stays exhausted', async () => {
    const snapshot = baseSnapshot()
    const plan = await loadCapabilitySessionPlan({
      enabled: true,
      sessionId: 'session-1',
      mode: 'standard',
      now,
      limit: 1,
      schedulerRows: [
        stateRow(recogniseKey, { nextDueAt: '2026-07-08T09:00:00.000Z' }), // due
        stateRow(produceKey, { reviewCount: 1, stability: 1, consecutiveFailureCount: 0 }), // NOT yet at strength
      ],
      plannerInput: {
        userId: 'user-1',
        preferredSessionSize: 1,
        dueCount: 0,
        readyCapabilities: [newCandidate],
        learnerCapabilityStates: [],
        activatedLessons: new Set<string>(),
      },
      capabilitiesByKey: snapshot.capabilitiesByKey,
      readinessByKey: snapshot.readinessByKey,
    })

    expect(plan.backlogDueCount).toBe(1)
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]).toEqual(expect.objectContaining({
      kind: 'due_review',
      canonicalKeySnapshot: recogniseKey,
    }))
  })
})

describe('hasMasteryStrength / isCapabilityMastered recomposition (§4.1, truth-table parity)', () => {
  // The Slice 2 extraction (mastered.ts) must not change isCapabilityMastered's
  // observable behaviour for ANY input — only hasMasteryStrength is new surface.
  // This exercises the pre-extraction truth table directly against the
  // post-extraction composition, at the boundary values that mattered
  // (thresholds, the at_risk override, and the recency window).
  it('matches the pre-extraction truth table across boundary + interior cases', async () => {
    const { isCapabilityMastered, hasMasteryStrength } = await import('@/lib/analytics/mastery/mastered')
    const referenceNow = new Date('2026-07-08T00:00:00.000Z')

    function legacyIsCapabilityMastered(input: {
      reviewCount: number
      stability?: number | null
      lastReviewedAt?: string | null
      lapseCount: number
      consecutiveFailureCount: number
    }): boolean {
      if (input.consecutiveFailureCount > 0) return false
      if (input.reviewCount < 4) return false
      if ((input.stability ?? 0) < 14) return false
      if (!input.lastReviewedAt) return false
      const ageMs = referenceNow.getTime() - new Date(input.lastReviewedAt).getTime()
      return ageMs >= 0 && ageMs <= 30 * 24 * 60 * 60 * 1000
    }

    const cases = [
      { reviewCount: 4, stability: 14, lastReviewedAt: '2026-07-01T00:00:00.000Z', lapseCount: 0, consecutiveFailureCount: 0 }, // exact thresholds, recent
      { reviewCount: 3, stability: 14, lastReviewedAt: '2026-07-01T00:00:00.000Z', lapseCount: 0, consecutiveFailureCount: 0 }, // reviewCount below bar
      { reviewCount: 4, stability: 13.9, lastReviewedAt: '2026-07-01T00:00:00.000Z', lapseCount: 0, consecutiveFailureCount: 0 }, // stability below bar
      { reviewCount: 6, stability: 20, lastReviewedAt: '2026-05-09T00:00:00.000Z', lapseCount: 0, consecutiveFailureCount: 0 }, // strong but stale (60d) — mastered=false, strength=true
      { reviewCount: 6, stability: 20, lastReviewedAt: null, lapseCount: 0, consecutiveFailureCount: 0 }, // never reviewed
      { reviewCount: 6, stability: 20, lastReviewedAt: '2026-07-01T00:00:00.000Z', lapseCount: 3, consecutiveFailureCount: 1 }, // currently failing (at_risk)
      { reviewCount: 6, stability: 20, lastReviewedAt: '2026-07-01T00:00:00.000Z', lapseCount: 3, consecutiveFailureCount: 0 }, // past lapse, self-healed — mastered=true
      { reviewCount: 0, stability: null, lastReviewedAt: null, lapseCount: 0, consecutiveFailureCount: 0 }, // never reviewed at all
    ]

    for (const input of cases) {
      expect(isCapabilityMastered(input, referenceNow)).toBe(legacyIsCapabilityMastered(input))
    }

    // The recency-free strength core must diverge from `mastered` exactly at the
    // "strong but stale" case — this is the whole reason graduation uses it.
    const strongButStale = cases[3]!
    expect(hasMasteryStrength(strongButStale)).toBe(true)
    expect(isCapabilityMastered(strongButStale, referenceNow)).toBe(false)
  })
})
