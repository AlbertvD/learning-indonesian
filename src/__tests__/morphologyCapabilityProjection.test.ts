import { describe, expect, it } from 'vitest'
import { projectCapabilities } from '@/lib/capabilities/capabilityCatalog'
import { validateCapability } from '@/lib/capabilities/capabilityContracts'
import { resolveExercise } from '@/lib/exercises/exerciseResolver'
import { planLearningPath, type PlannerCapability } from '@/lib/pedagogy/pedagogyPlanner'
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
    requiredSourceProgress: capability.requiredSourceProgress,
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
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: patternSourceRef,
        requiredState: 'pattern_noticing_seen',
      },
      goalTags: ['morphology', 'meN-active'],
    }))
    expect(recall).toEqual(expect.objectContaining({
      direction: 'root_to_derived',
      skillType: 'form_recall',
      prerequisiteKeys: [recognition.canonicalKey],
      difficultyLevel: 5,
    }))
  })

  it('keeps morphology readiness artifact-based and exercise-resolvable', () => {
    const recall = projectCapabilities(snapshot).capabilities.find(capability => capability.capabilityType === 'root_derived_recall')!
    const artifactIndex = {
      root_derived_pair: [{ qualityStatus: 'approved' as const, sourceRef: pairSourceRef }],
      allomorph_rule: [{ qualityStatus: 'approved' as const, sourceRef: pairSourceRef }],
    }
    const readiness = validateCapability({ capability: recall, artifacts: artifactIndex })

    expect(readiness).toEqual({ status: 'ready', allowedExercises: ['typed_recall'] })
    expect(resolveExercise({
      capability: recall,
      readiness,
      artifactIndex,
    })).toEqual(expect.objectContaining({
      status: 'resolved',
      plan: expect.objectContaining({
        exerciseType: 'typed_recall',
        capabilityType: 'root_derived_recall',
      }),
    }))
  })

  it('requires pattern noticing and recognition success before root-to-derived practice enters the queue', () => {
    const projection = projectCapabilities(snapshot)
    const recognition = projection.capabilities.find(capability => capability.capabilityType === 'root_derived_recognition')!
    const recall = projection.capabilities.find(capability => capability.capabilityType === 'root_derived_recall')!
    const baseInput = {
      userId: 'user-1',
      mode: 'pattern_workshop' as const,
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 10,
      dueCount: 0,
      readyCapabilities: [asPlannerCapability(recall)],
      sourceProgress: [{
        sourceRef: patternSourceRef,
        sourceSectionRef: 'noticing',
        currentState: 'pattern_noticing_seen' as const,
        completedEventTypes: ['pattern_noticing_seen' as const],
      }],
      recentReviewEvidence: [],
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
        reviewCount: 1,
        successfulReviewCount: 1,
      }],
    })

    expect(beforeRecognition.suppressedCapabilities[0]).toEqual({
      canonicalKey: recall.canonicalKey,
      reason: 'missing_prerequisite',
    })
    expect(afterRecognition.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual([recall.canonicalKey])
    expect(afterRecognition.loadBudget.reason).toBe('pattern_workshop_budget')
  })
})
