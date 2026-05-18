import type { ExerciseType } from '../../types/learning'
import type { ArtifactKind, CapabilityProjection, ProjectedCapability } from './capabilityTypes'
import { type ArtifactIndex, hasApprovedArtifact } from './artifactRegistry'
import {
  exerciseTypesForCapability,
  requiredArtifactsFor as artifactsForExercise,
  supportsSourceKind,
} from './renderContracts'

/**
 * Replaces the retired `requiredSourceProgress.kind === 'none' && reason ===
 * 'exposure_only'` field-based escape hatch. Podcast capabilities are
 * inherently exposure-only (the podcast plays through, then the capability
 * retires); they should never enter spaced practice. Source-kind alone is
 * the load-bearing signal.
 */
export function isExposureOnly(capability: Pick<ProjectedCapability, 'sourceKind'>): boolean {
  return capability.sourceKind === 'podcast_segment'
    || capability.sourceKind === 'podcast_phrase'
}

export type ExerciseKind = ExerciseType
export type ExerciseAvailabilityIndex = Partial<Record<ExerciseKind, boolean>>

export type CapabilityReadiness =
  | { status: 'ready'; allowedExercises: ExerciseKind[] }
  | { status: 'blocked'; missingArtifacts: ArtifactKind[]; reason: string }
  | { status: 'exposure_only'; reason: string }
  | { status: 'deprecated'; replacementKey?: string }
  | { status: 'unknown'; reason: string }

export interface CapabilityHealthReport {
  readyCount: number
  blockedCount: number
  exposureOnlyCount: number
  deprecatedCount: number
  unknownCount: number
  criticalCount: number
  results: Array<{
    canonicalKey: string
    readiness: CapabilityReadiness
  }>
}

export interface CapabilityValidationInput {
  capability: ProjectedCapability
  artifacts: ArtifactIndex
  exerciseAvailability?: ExerciseAvailabilityIndex
  readinessOverride?: 'exposure_only' | 'deprecated' | 'unknown'
  replacementKey?: string
}

export function validateCapability(input: CapabilityValidationInput): CapabilityReadiness {
  if (isExposureOnly(input.capability)) {
    return { status: 'exposure_only', reason: 'Capability is exposure-only and cannot be scheduled for review.' }
  }
  if (input.readinessOverride === 'exposure_only') {
    return { status: 'exposure_only', reason: 'Capability is exposure-only and cannot be scheduled for review.' }
  }
  if (input.readinessOverride === 'deprecated') {
    return { status: 'deprecated', replacementKey: input.replacementKey }
  }
  if (input.readinessOverride === 'unknown') {
    return { status: 'unknown', reason: 'Capability readiness is unknown and fails closed.' }
  }

  // Inverted lookup against RENDER_CONTRACTS: which exercise types name this
  // cap_type AND support its source kind? Cap_types that no exercise serves
  // — pattern_recognition, pattern_contrast — return [] here. Cap_types
  // whose source kind no current exercise supports — contextual_cloze
  // (dialogue_line), root_derived_* (affixed_form_pair) — also return []
  // until the capabilityContentService fold widens supportedSourceKinds.
  const candidateExercises = exerciseTypesForCapability(input.capability.capabilityType)
    .filter(et => supportsSourceKind(et, input.capability.sourceKind))

  if (candidateExercises.length === 0) {
    return {
      status: 'blocked',
      missingArtifacts: [],
      reason: 'no_compatible_exercise_for_capability_type',
    }
  }

  // An exercise is render-ready if the union of (a) its contract-declared
  // required artifacts and (b) the capability's catalog-declared required
  // artifacts are all approved.
  //
  // Why both: the contract declares what the BUILDER reads; the catalog
  // declares what the CAP_TYPE needs (which may be stricter for certain
  // cap_types served by a looser builder — e.g. typed_recall serves both
  // form_recall (needs accepted_answers:id) and root_derived_recall (needs
  // root_derived_pair). The contract holds the builder's strict minimum;
  // capability.requiredArtifacts holds the cap-type's additional asks.
  const checkArtifact = (kind: ArtifactKind) => hasApprovedArtifact({
    index: input.artifacts,
    kind,
    capabilityKey: input.capability.canonicalKey,
    sourceRef: input.capability.sourceRef,
  })

  const readyExercises = candidateExercises.filter(et => {
    const required = new Set<ArtifactKind>([
      ...artifactsForExercise(et),
      ...input.capability.requiredArtifacts,
    ])
    return [...required].every(checkArtifact)
  })

  if (readyExercises.length === 0) {
    // Report the union of missing artifacts across all candidate exercises.
    const missing = new Set<ArtifactKind>()
    for (const et of candidateExercises) {
      const required = new Set<ArtifactKind>([
        ...artifactsForExercise(et),
        ...input.capability.requiredArtifacts,
      ])
      for (const kind of required) if (!checkArtifact(kind)) missing.add(kind)
    }
    return {
      status: 'blocked',
      missingArtifacts: Array.from(missing),
      reason: `Missing approved artifacts: ${Array.from(missing).join(', ')}`,
    }
  }

  const availableExercises = readyExercises.filter(kind => input.exerciseAvailability?.[kind] !== false)
  if (availableExercises.length === 0) {
    return {
      status: 'blocked',
      missingArtifacts: [],
      reason: 'No available exercise family for ready capability',
    }
  }

  return {
    status: 'ready',
    allowedExercises: availableExercises,
  }
}

export function validateCapabilities(input: {
  projection: CapabilityProjection
  artifacts: ArtifactIndex
}): CapabilityHealthReport {
  const results = input.projection.capabilities.map(capability => ({
    canonicalKey: capability.canonicalKey,
    readiness: validateCapability({ capability, artifacts: input.artifacts }),
  }))

  return {
    readyCount: results.filter(result => result.readiness.status === 'ready').length,
    blockedCount: results.filter(result => result.readiness.status === 'blocked').length,
    exposureOnlyCount: results.filter(result => result.readiness.status === 'exposure_only').length,
    deprecatedCount: results.filter(result => result.readiness.status === 'deprecated').length,
    unknownCount: results.filter(result => result.readiness.status === 'unknown').length,
    criticalCount: results.filter(result => result.readiness.status === 'blocked' || result.readiness.status === 'unknown').length,
    results,
  }
}
