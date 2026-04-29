import type { ArtifactKind, ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import type { ExerciseType } from '@/types/learning'

export interface ExerciseRenderPlan {
  capabilityKey: string
  sourceRef: string
  exerciseType: ExerciseType
  capabilityType: ProjectedCapability['capabilityType']
  skillType: ProjectedCapability['skillType']
  requiredArtifacts: ArtifactKind[]
}
