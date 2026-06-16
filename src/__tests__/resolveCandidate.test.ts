import { describe, expect, it } from 'vitest'
import { resolveCandidate } from '@/lib/session-builder/builder'
import type { CapabilityReadiness } from '@/lib/capabilities/capabilityContracts'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import type { CapabilityReviewSessionContext } from '@/lib/session-builder/model'

const canonicalKey = 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl'
const sourceRef = 'learning_items/item-1'

function projection(): ProjectedCapability {
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
  }
}

function readiness(): CapabilityReadiness {
  return { status: 'ready', allowedExercises: ['type_meaning_ex'] }
}

function context(): CapabilityReviewSessionContext {
  return {
    schedulerSnapshot: {
      stateVersion: 1,
      activationState: 'active',
      reviewCount: 0,
      lapseCount: 0,
      consecutiveFailureCount: 0,
    },
    currentStateVersion: 1,
    artifactVersionSnapshot: {},
    capabilityReadinessStatus: 'ready',
    capabilityPublicationStatus: 'published',
  }
}

describe('resolveCandidate', () => {
  it('returns a resolved candidate with renderPlan when projection and readiness are present', () => {
    const outcome = resolveCandidate({ canonicalKey, context: context() }, {
      capabilitiesByKey: new Map([[canonicalKey, projection()]]),
      readinessByKey: new Map([[canonicalKey, readiness()]]),
    })

    expect('renderPlan' in outcome).toBe(true)
    if ('renderPlan' in outcome) {
      expect(outcome.renderPlan).toEqual(expect.objectContaining({
        capabilityKey: canonicalKey,
        exerciseType: 'type_meaning_ex',
      }))
    }
  })

  it('returns a failed candidate with missing_capability_projection when projection or readiness is absent', () => {
    const outcome = resolveCandidate({ canonicalKey, context: context() }, {
      capabilitiesByKey: new Map(),
      readinessByKey: new Map(),
    })

    expect('resolutionFailure' in outcome).toBe(true)
    if ('resolutionFailure' in outcome) {
      expect(outcome.resolutionFailure.reason).toBe('missing_capability_projection')
    }
  })

  it('preserves the meta object on the outcome so callers can read their own fields', () => {
    const outcome = resolveCandidate({
      canonicalKey,
      context: context(),
      capabilityId: 'capability-1',
      stateVersion: 7,
    }, {
      capabilitiesByKey: new Map([[canonicalKey, projection()]]),
      readinessByKey: new Map([[canonicalKey, readiness()]]),
    })

    expect(outcome.meta.canonicalKey).toBe(canonicalKey)
    expect(outcome.meta).toEqual(expect.objectContaining({
      capabilityId: 'capability-1',
      stateVersion: 7,
    }))
  })
})
