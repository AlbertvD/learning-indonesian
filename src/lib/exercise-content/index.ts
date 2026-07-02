// Public API barrel for the exercise-content deep module.
//
// Inbound port per target-architecture.md §"Module conventions". External
// consumers import from '@/lib/exercise-content'; internal files remain
// importable by their paths for tests and sibling files inside the module.
//
// Module spec: docs/current-system/modules/exercise-content.md.
// Fold plan: docs/plans/2026-05-21-lib-exercise-content-fold.md.

export {
  createCapabilityContentService,
  resolveCapabilityBlocks,
} from './resolver'
export { GRAMMAR_EXERCISE_TABLES } from './byKind/pattern'
export type {
  CapabilityContentService,
  ResolveOptions,
  ResolutionReasonCode,
  CapabilityRenderContext,
  ResolutionDiagnostic,
} from './resolver'
