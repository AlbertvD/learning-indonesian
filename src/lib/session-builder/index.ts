// Public API barrel for the session-builder module.
//
// Internal helpers (resolveCandidate, loadCapabilitySessionPlan, the planner /
// load-budget machinery) remain importable from their files for tests; the
// barrel only re-exports the surface other parts of the codebase consume.

export { buildSession, type CapabilitySessionDataAdapter, type CapabilitySessionDataRequest, type CapabilitySessionDataSnapshot } from '@/lib/session-builder/builder'
export { compose } from '@/lib/session-builder/compose'
export { sessionBuilderAdapter, createSessionBuilderAdapter } from '@/lib/session-builder/adapter'
export { audibleTextFieldsOf, collectAudibleTexts } from '@/lib/session-builder/audibleTexts'
export { capabilityDisplay, exerciseLabel, skillLabel, CAPABILITY_DISPLAY, type CapabilityDisplay } from '@/lib/session-builder/labels'
export type {
  SessionMode,
  SessionPlan,
  SessionBlock,
  SessionDiagnostic,
  CapabilityReviewSessionContext,
  PendingActivationSessionItem,
} from '@/lib/session-builder/model'
