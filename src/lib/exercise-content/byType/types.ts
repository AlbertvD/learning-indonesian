// Shared types for lib/exercise-content byType packagers.
//
// The per-builder input shape is BuilderInputFor<T> from the capabilities
// deep module's renderContracts. The dispatch site (resolver via byType/index)
// constructs a RawProjectorInput and hands it to buildForExerciseType which
// runs projectBuilderInput<T>() before dispatching. After projection, each
// builder is statically guaranteed every field its contract requires is
// non-null — no more per-builder `if (!input.X) return fail` guards.

// Import ResolutionReasonCode from the leaf module rather than via the
// exercise-content barrel — keeps the dependency graph acyclic.
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
