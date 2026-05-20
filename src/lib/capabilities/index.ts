// Public API barrel for the capabilities deep module.
//
// This is the inbound port (per target-architecture.md §2 — hexagonal modules).
// External consumers should import from '@/lib/capabilities'; internal files
// remain importable by their paths for tests and for sibling files inside
// the module itself.
//
// Module spec: docs/current-system/modules/capabilities.md.

// ─── Types & projection-version stamp ──────────────────────────────────────
export {
  CAPABILITY_PROJECTION_VERSION,
  CAPABILITY_SOURCE_KINDS,
  CAPABILITY_TYPES,
} from './capabilityTypes'
export type {
  CapabilitySourceKind,
  CapabilityType,
  CapabilityDirection,
  CapabilityModality,
  LearnerLanguage,
  ArtifactKind,
  CurrentLearningItem,
  CurrentDialogueLine,
  CurrentPodcastSegment,
  CurrentPodcastPhrase,
  CurrentAffixedFormPair,
  CurrentGrammarPattern,
  StagedLessonSnapshot,
  CurrentContentSnapshot,
  ProjectedCapability,
  CapabilityAlias,
  ProjectionDiagnostic,
  CapabilityProjection,
} from './capabilityTypes'

// ─── Projection ────────────────────────────────────────────────────────────
export { projectCapabilities } from './capabilityCatalog'

// ─── Readiness & validation ────────────────────────────────────────────────
export {
  validateCapability,
  validateCapabilities,
  isExposureOnly,
} from './capabilityContracts'
export type {
  CapabilityReadiness,
  CapabilityHealthReport,
  CapabilityValidationInput,
  ExerciseKind,
  ExerciseAvailabilityIndex,
} from './capabilityContracts'

// ─── Artifacts ─────────────────────────────────────────────────────────────
export {
  ARTIFACT_KINDS,
  hasApprovedArtifact,
} from './artifactRegistry'
export type {
  ArtifactIndex,
  ArtifactQualityStatus,
  CapabilityArtifact,
} from './artifactRegistry'

// ─── Canonical keying ──────────────────────────────────────────────────────
export {
  buildCanonicalKey,
  normalizeLessonSourceRef,
} from './canonicalKey'
export type { CanonicalKeyInput } from './canonicalKey'

// ─── Item slug derivation (PR #59) ─────────────────────────────────────────
export { itemSlug } from './itemSlug'

// ─── Render contract (PR #65) — sole source of truth for which exercise ───
// types each cap_type is ready for, which builder receives what input, and
// the runtime projector that narrows raw input to typed builder input.
export {
  RENDER_CONTRACTS,
  projectBuilderInput,
  exerciseTypesForCapability,
  requiredArtifactsFor,
  supportsSourceKind,
} from './renderContracts'
export type {
  RenderContract,
  RawProjectorInput,
  ContractInputShapes,
  BuilderInputFor,
  ProjectorResult,
} from './renderContracts'
