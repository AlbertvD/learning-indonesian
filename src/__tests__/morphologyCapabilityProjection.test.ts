import { describe, expect, it } from 'vitest'
import { projectCapabilities } from '@/lib/capabilities/capabilityCatalog'
import { validateCapability } from '@/lib/capabilities/capabilityContracts'
import { resolveExercise } from '@/lib/exercises/exerciseResolver'
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
    difficultyLevel: capability.difficultyLevel,
    goalTags: capability.goalTags,
  }
}

describe('morphology capability projection', () => {
  it('projects meN pairs as recognition and root-to-derived recall facets', () => {
    const projection = projectCapabilities(snapshot)
    const recognition = projection.capabilities.find(capability => capability.capabilityType === 'root_derived_recognition')!
    const recall = projection.capabilities.find(capability => capability.capabilityType === 'root_derived_recall')!

    expect(recognition).toEqual(expect.objectContaining({
      sourceKind: 'affixed_form_pair',
      sourceRef: pairSourceRef,
      direction: 'derived_to_root',
      skillType: 'recognition',
      requiredArtifacts: ['root_derived_pair', 'allomorph_rule'],
      goalTags: ['morphology', 'meN-active'],
    }))
    expect(recall).toEqual(expect.objectContaining({
      direction: 'root_to_derived',
      skillType: 'form_recall',
      prerequisiteKeys: [recognition.canonicalKey],
      difficultyLevel: 5,
    }))
  })

  it('blocks morphology readiness until a renderer for affixed_form_pair source kinds ships', () => {
    // Per PR #65 (renderContracts.ts), every contract's supportedSourceKinds
    // is currently ['item'] — codifying capabilityContentService.ts:240's
    // existing rejection of non-item source kinds at the contract layer.
    // Morphology caps have sourceKind='affixed_form_pair', so they're marked
    // `blocked` at validateCapability instead of passing as `ready` and then
    // silently dropping downstream. When the future capabilityContentService
    // fold widens supportedSourceKinds, this test restores the resolved-plan
    // assertion against the new contract entry.
    const recall = projectCapabilities(snapshot).capabilities.find(capability => capability.capabilityType === 'root_derived_recall')!
    const artifactIndex = {
      root_derived_pair: [{ qualityStatus: 'approved' as const, sourceRef: pairSourceRef }],
      allomorph_rule: [{ qualityStatus: 'approved' as const, sourceRef: pairSourceRef }],
    }
    const readiness = validateCapability({ capability: recall, artifacts: artifactIndex })
    expect(readiness.status).toBe('blocked')
    if (readiness.status === 'blocked') {
      expect(readiness.reason).toMatch(/no_compatible_exercise_for_capability_type/)
    }
    expect(resolveExercise({
      capability: recall,
      readiness,
      artifactIndex,
    })).toEqual({
      status: 'failed',
      reason: 'capability_not_ready',
      details: 'Capability readiness is blocked',
    })
  })

  it('requires pattern noticing and recognition success before root-to-derived practice enters the queue', () => {
    const projection = projectCapabilities(snapshot)
    const recognition = projection.capabilities.find(capability => capability.capabilityType === 'root_derived_recognition')!
    const recall = projection.capabilities.find(capability => capability.capabilityType === 'root_derived_recall')!
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
