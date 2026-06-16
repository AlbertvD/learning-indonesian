import { describe, expect, it } from 'vitest'
import { projectCapabilities } from '@/lib/capabilities/capabilityCatalog'
import { validateCapability } from '@/lib/capabilities/capabilityContracts'
import { planLearningPath, type PlannerCapability } from '@/lib/session-builder/pedagogy'
import type { CurrentContentSnapshot, ProjectedCapability } from '@/lib/capabilities/capabilityTypes'

const pairSourceRef = 'lesson-9/morphology/meN-baca-membaca'
const patternSourceRef = 'lesson-9/pattern-men-active'

const snapshot: CurrentContentSnapshot = {
  learningItems: [],
  grammarPatterns: [],
  affixedFormPairs: [{
    id: 'men-baca-membaca',
    sourceRef: pairSourceRef,
    patternSourceRef,
    root: 'baca',
    derived: 'membaca',
    allomorphRule: 'meN- becomes mem- before roots beginning with b.',
  }],
}

function asPlannerCapability(capability: ProjectedCapability): PlannerCapability {
  return {
    id: capability.canonicalKey,
    canonicalKey: capability.canonicalKey,
    sourceKind: capability.sourceKind,
    sourceRef: capability.sourceRef,
    capabilityType: capability.capabilityType,
    skillType: capability.skillType,
    readinessStatus: 'ready',
    publicationStatus: 'published',
    prerequisiteKeys: capability.prerequisiteKeys,
    lessonId: capability.lessonId ?? null,
  }
}

describe('morphology capability projection', () => {
  it('projects meN pairs as recognition and root-to-derived recall facets', () => {
    const projection = projectCapabilities(snapshot)
    const recognition = projection.capabilities.find(capability => capability.capabilityType === 'recognise_word_form_link_cap')!
    const recall = projection.capabilities.find(capability => capability.capabilityType === 'produce_derived_form_cap')!

    expect(recognition).toEqual(expect.objectContaining({
      sourceKind: 'word_form_pair_src',
      sourceRef: pairSourceRef,
      direction: 'derived_to_root',
      skillType: 'recognition',
      // PR 3 slice: word_form_pair_src caps render from the typed
      // `affixed_form_pairs` table; readiness no longer depends on
      // capability_artifacts (mirror of item + dialogue_line, Decision R).
      requiredArtifacts: [],
    }))
    expect(recall).toEqual(expect.objectContaining({
      direction: 'root_to_derived',
      skillType: 'form_recall',
      requiredArtifacts: [],
      prerequisiteKeys: [recognition.canonicalKey],
    }))
  })

  it('marks morphology produce_derived_form_cap ready via typed_recall with NO capability_artifacts (PR 3 slice: structure lives in the typed affixed_form_pairs table + validateAffixedFormPairs + HC17)', () => {
    const recall = projectCapabilities(snapshot).capabilities.find(capability => capability.capabilityType === 'produce_derived_form_cap')!
    const readiness = validateCapability({ capability: recall })
    expect(readiness.status).toBe('ready')
    if (readiness.status === 'ready') {
      expect(readiness.allowedExercises).toEqual(['typed_recall'])
    }
  })

  it('marks morphology recognise_word_form_link_cap ready via typed_recall with NO capability_artifacts (PR 3 slice)', () => {
    const recognition = projectCapabilities(snapshot).capabilities.find(capability => capability.capabilityType === 'recognise_word_form_link_cap')!
    const readiness = validateCapability({ capability: recognition })
    expect(readiness.status).toBe('ready')
    if (readiness.status === 'ready') {
      expect(readiness.allowedExercises).toEqual(['typed_recall'])
    }
  })

  it('requires pattern noticing and recognition success before root-to-derived practice enters the queue', () => {
    const projection = projectCapabilities(snapshot)
    const recognition = projection.capabilities.find(capability => capability.capabilityType === 'recognise_word_form_link_cap')!
    const recall = projection.capabilities.find(capability => capability.capabilityType === 'produce_derived_form_cap')!
    const baseInput = {
      userId: 'user-1',
      mode: 'standard' as const,
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 10,
      dueCount: 0,
      // Include both caps in the ready pool to match production behaviour:
      // adapter.ts:262-264 selects every ready+published capability, not a
      // subset. The sibling lookup in the staging gate (added 2026-05-18)
      // depends on the sibling existing in the projection.
      readyCapabilities: [asPlannerCapability(recognition), asPlannerCapability(recall)],
      activatedLessons: new Set<string>(),
    }

    const beforeRecognition = planLearningPath({
      ...baseInput,
      learnerCapabilityStates: [],
    })
    const afterRecognition = planLearningPath({
      ...baseInput,
      learnerCapabilityStates: [{
        canonicalKey: recognition.canonicalKey,
        activationState: 'active',
        reviewCount: 2,
        successfulReviewCount: 1,
        // stability >= 1d satisfies the receptive-before-productive staging
        // gate (2026-05-18). The test's prerequisite-chain assertion still
        // holds; this just supplies the additional gate input.
        stability: 2.0,
      }],
    })

    expect(beforeRecognition.suppressedCapabilities[0]).toEqual({
      canonicalKey: recall.canonicalKey,
      reason: 'missing_prerequisite',
    })
    expect(afterRecognition.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual([recall.canonicalKey])
    expect(afterRecognition.loadBudget.reason).toBe('standard_daily_budget')
  })
})
