import type { ExerciseType } from '../../types/learning'
import type { ArtifactKind, CapabilityProjection, ProjectedCapability } from './capabilityTypes'
import {
  exerciseTypesForCapability,
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
  // for this source kind return [] here. Slice 4b: readiness is decided purely
  // by this typed-contract routing — the legacy `capability_artifacts` bag and
  // the `required_artifacts` column are gone, and every render contract's
  // per-source-kind artifact list collapsed to []. Structure for each rendered
  // exercise is now guaranteed by the typed satellite tables + their pre-write
  // validators + the live health checks (HC15/HC17/HC19/HC20), not an artifact
  // bag. `cloze` accepts item + dialogue_line; `typed_recall` accepts item +
  // affixed_form_pair; the 4 grammar exercises + cloze_mcq accept pattern.
  const candidateExercises = exerciseTypesForCapability(input.capability.capabilityType)
    .filter(et => supportsSourceKind(et, input.capability.sourceKind))

  if (candidateExercises.length === 0) {
    return {
      status: 'blocked',
      missingArtifacts: [],
      reason: 'no_compatible_exercise_for_capability_type',
    }
  }

  return {
    status: 'ready',
    allowedExercises: [...candidateExercises],
  }
}

export function validateCapabilities(input: {
  projection: CapabilityProjection
}): CapabilityHealthReport {
  const results = input.projection.capabilities.map(capability => ({
    canonicalKey: capability.canonicalKey,
    readiness: validateCapability({ capability }),
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
