// Shared types for capabilityContentService builders.
//
// The per-builder input shape is BuilderInputFor<T> from the capabilities
// deep module's renderContracts. The dispatch site (capabilityContentService)
// constructs a RawProjectorInput and hands it to buildForExerciseType which
// runs projectBuilderInput<T>() before dispatching. After projection, each
// builder is statically guaranteed every field its contract requires is
// non-null — no more per-builder `if (!input.X) return fail` guards.

// Import from the leaf module rather than the service re-export — keeps the
// dependency graph acyclic. The service still re-exports for back-compat.
import type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'
import type { ExerciseItem } from '@/types/learning'

export type { BuilderInputFor, RawProjectorInput } from '@/lib/capabilities'

export type BuilderResult =
  | {
      kind: 'ok'
      exerciseItem: ExerciseItem
      audibleTexts: string[]
    }
  | {
      kind: 'fail'
      reasonCode: ResolutionReasonCode
      message: string
      payloadSnapshot?: unknown
    }
