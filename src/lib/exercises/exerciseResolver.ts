import type { ArtifactKind, ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import { hasApprovedArtifact, type ArtifactIndex } from '@/lib/capabilities/artifactRegistry'
import type { CapabilityReadiness } from '@/lib/capabilities/capabilityContracts'
import type { ExerciseRenderPlan } from '@/lib/exercises/exerciseRenderPlan'
import type { ExerciseType } from '@/types/learning'

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

const compatibleExercisesByCapability: Partial<Record<ProjectedCapability['capabilityType'], ExerciseType[]>> = {
  text_recognition: ['recognition_mcq'],
  meaning_recall: ['meaning_recall'],
  form_recall: ['typed_recall', 'cued_recall'],
  contextual_cloze: ['cloze', 'cloze_mcq'],
  audio_recognition: ['listening_mcq'],
  dictation: ['dictation'],
  podcast_gist: ['listening_mcq'],
  pattern_recognition: ['cloze', 'cloze_mcq'],
  pattern_contrast: ['contrast_pair'],
  root_derived_recognition: ['typed_recall', 'cued_recall'],
  root_derived_recall: ['typed_recall', 'cued_recall'],
}

function firstCompatibleExercise(input: {
  capability: ProjectedCapability
  allowedExercises: ExerciseType[]
}): ExerciseType | null {
  const compatible = compatibleExercisesByCapability[input.capability.capabilityType] ?? []
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
