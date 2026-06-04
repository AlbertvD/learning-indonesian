import {
  exerciseTypesForCapability,
  type CapabilityReadiness,
  type ProjectedCapability,
} from '@/lib/capabilities'
import type { ExerciseRenderPlan } from './exerciseRenderPlan'
import type { ExerciseType } from '../../types/learning'

export type ExerciseResolutionFailureReason =
  | 'capability_not_ready'
  | 'no_supported_exercise_family'
  | 'fallback_blocked'
  | 'device_constraints_blocked'

export type ExerciseResolutionResult =
  | { status: 'resolved'; plan: ExerciseRenderPlan }
  | {
      status: 'failed'
      reason: ExerciseResolutionFailureReason
      details: string
    }

export interface ExerciseResolutionInput {
  capability: ProjectedCapability
  readiness: CapabilityReadiness
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

  // Slice 4b: the legacy artifact re-check is gone — readiness is decided
  // solely by validateCapability's typed-contract routing upstream, and the
  // capability_artifacts bag no longer exists. The resolver trusts the
  // readiness.allowedExercises it received.
  return {
    status: 'resolved',
    plan: {
      capabilityKey: input.capability.canonicalKey,
      sourceRef: input.capability.sourceRef,
      exerciseType,
      capabilityType: input.capability.capabilityType,
      skillType: input.capability.skillType,
    },
  }
}
