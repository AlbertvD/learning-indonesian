import type { ProjectedCapability } from '@/lib/capabilities'
import type { ExerciseType } from '@/types/learning'

export interface ExerciseRenderPlan {
  capabilityKey: string
  sourceRef: string
  exerciseType: ExerciseType
  capabilityType: ProjectedCapability['capabilityType']
  skillType: ProjectedCapability['skillType']
}
