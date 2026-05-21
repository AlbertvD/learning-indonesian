// src/lib/capabilities/renderContext.ts
//
// Shape of the render-time context that capability resolution emits per
// session block. Lives in the lib layer (not services/) so session-builder
// and other lib consumers can depend on it without crossing back through
// services/. Services that produce these values import from here.

import type { ExerciseItem, ExerciseType } from '@/types/learning'
import type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'

export interface ResolutionDiagnostic {
  reasonCode: ResolutionReasonCode
  message: string
  capabilityKey: string
  capabilityId: string
  exerciseType: ExerciseType
  blockId: string
  payloadSnapshot?: unknown
}

export interface CapabilityRenderContext {
  blockId: string
  capabilityId: string
  exerciseItem: ExerciseItem | null
  audibleTexts: string[]
  diagnostic: ResolutionDiagnostic | null
}
