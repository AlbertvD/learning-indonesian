import type { ExerciseType } from '../../types/learning'
import type { ArtifactKind, CapabilityProjection, ProjectedCapability } from './capabilityTypes'
import { type ArtifactIndex, hasApprovedArtifact } from './artifactRegistry'

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

const exerciseByCapability: Partial<Record<ProjectedCapability['capabilityType'], ExerciseKind[]>> = {
  text_recognition: ['recognition_mcq'],
  meaning_recall: ['meaning_recall'],
  form_recall: ['typed_recall'],
  contextual_cloze: ['cloze'],
  audio_recognition: ['listening_mcq'],
  dictation: ['dictation'],
  podcast_gist: ['listening_mcq'],
  pattern_recognition: ['cloze'],
  pattern_contrast: ['contrast_pair'],
  root_derived_recognition: ['typed_recall'],
  root_derived_recall: ['typed_recall'],
}

function requiredArtifactsFor(capability: ProjectedCapability): ArtifactKind[] {
  if (capability.capabilityType === 'contextual_cloze') {
    return ['cloze_context', 'cloze_answer', 'translation:l1']
  }
  if (capability.capabilityType === 'pattern_recognition') {
    return ['pattern_explanation:l1', 'pattern_example']
  }
  return capability.requiredArtifacts
}

export function validateCapability(input: CapabilityValidationInput): CapabilityReadiness {
  if (input.capability.requiredSourceProgress?.kind === 'none' && input.capability.requiredSourceProgress.reason === 'exposure_only') {
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

  const requiredArtifacts = requiredArtifactsFor(input.capability)
  const missingArtifacts = requiredArtifacts.filter(kind => !hasApprovedArtifact({
    index: input.artifacts,
    kind,
    capabilityKey: input.capability.canonicalKey,
    sourceRef: input.capability.sourceRef,
  }))

  if (missingArtifacts.length > 0) {
    return {
      status: 'blocked',
      missingArtifacts,
      reason: `Missing approved artifacts: ${missingArtifacts.join(', ')}`,
    }
  }

  const allowedExercises = exerciseByCapability[input.capability.capabilityType] ?? []
  const availableExercises = allowedExercises.filter(kind => input.exerciseAvailability?.[kind] !== false)

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
