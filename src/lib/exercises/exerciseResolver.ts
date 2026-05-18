import {
  exerciseTypesForCapability,
  hasApprovedArtifact,
  type ArtifactIndex,
  type ArtifactKind,
  type CapabilityReadiness,
  type ProjectedCapability,
} from '@/lib/capabilities'
import type { ExerciseRenderPlan } from './exerciseRenderPlan'
import type { ExerciseType } from '../../types/learning'

export type ExerciseResolutionFailureReason =
  | 'capability_not_ready'
  | 'missing_required_artifact'
  | 'no_supported_exercise_family'
  | 'fallback_blocked'
  | 'device_constraints_blocked'

export type ExerciseResolutionResult =
  | { status: 'resolved'; plan: ExerciseRenderPlan }
  | {
      status: 'failed'
      reason: ExerciseResolutionFailureReason
      details: string
      missingArtifacts?: ArtifactKind[]
    }

export interface ExerciseResolutionInput {
  capability: ProjectedCapability
  readiness: CapabilityReadiness
  artifactIndex: ArtifactIndex
}

function firstCompatibleExercise(input: {
  capability: ProjectedCapability
  allowedExercises: ExerciseType[]
}): ExerciseType | null {
  // No sourceKind filter here — the validator is the sole runtime gate for
  // "cap is eligible for an exercise." The resolver trusts the
  // readiness.allowedExercises array it receives; that array already
  // reflects the source-kind filtering done at the validator layer. This
  // avoids the very anti-pattern PR #65 exists to close (two layers
  // gating on the same thing, then disagreeing).
  const compatible = exerciseTypesForCapability(input.capability.capabilityType)
  return input.allowedExercises.find(exercise => compatible.includes(exercise)) ?? null
}

export function resolveExercise(input: ExerciseResolutionInput): ExerciseResolutionResult {
  if (input.readiness.status !== 'ready') {
    return {
      status: 'failed',
      reason: 'capability_not_ready',
      details: `Capability readiness is ${input.readiness.status}`,
    }
  }

  const exerciseType = firstCompatibleExercise({
    capability: input.capability,
    allowedExercises: input.readiness.allowedExercises,
  })
  if (!exerciseType) {
    return {
      status: 'failed',
      reason: 'no_supported_exercise_family',
      details: `No supported exercise family is available for ${input.capability.capabilityType}.`,
    }
  }

  // Re-verify required artifacts as defence-in-depth (validateCapability
  // already gates the union of contract + capability artifacts upstream).
  // Use the capability's declared requiredArtifacts here — preserves
  // existing exerciseResolver.test.ts:146-168 assertions that pass
  // synthetic readiness objects with cap-specific artifacts. The contract
  // requirements are caught upstream by the validator.
  const missingArtifacts = input.capability.requiredArtifacts.filter(artifactKind => !hasApprovedArtifact({
    index: input.artifactIndex,
    kind: artifactKind,
    capabilityKey: input.capability.canonicalKey,
    sourceRef: input.capability.sourceRef,
  }))
  if (missingArtifacts.length > 0) {
    return {
      status: 'failed',
      reason: 'missing_required_artifact',
      details: `Missing approved artifacts: ${missingArtifacts.join(', ')}`,
      missingArtifacts,
    }
  }

  return {
    status: 'resolved',
    plan: {
      capabilityKey: input.capability.canonicalKey,
      sourceRef: input.capability.sourceRef,
      exerciseType,
      capabilityType: input.capability.capabilityType,
      skillType: input.capability.skillType,
      requiredArtifacts: input.capability.requiredArtifacts,
    },
  }
}
