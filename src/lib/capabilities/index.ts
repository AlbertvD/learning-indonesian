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
  deriveSkillTypeFromCapabilityType,
  isAudioPromptCapabilityType,
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
  CapabilityReadinessStatus,
  CapabilityPublicationStatus,
  LearningCapabilityRow,
} from './capabilityTypes'
export type { CapabilityRenderContext, ResolutionDiagnostic } from './renderContext'

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
} from './capabilityContracts'

// ─── Artifacts ─────────────────────────────────────────────────────────────
// Slice 4b retired capability_artifacts; Slice 5b (#147 5b.7) retired the last
// consumer of ARTIFACT_KINDS (the legacy staging regeneration) and deleted
// artifactRegistry.ts. The `ArtifactKind` *type* survives in capabilityTypes.ts
// (it still types capability.requiredArtifacts + the render contracts); only the
// runtime ARTIFACT_KINDS array is gone.

// ─── Canonical keying ──────────────────────────────────────────────────────
export {
  buildCanonicalKey,
  normalizeLessonSourceRef,
  patternSlugFromSourceRef,
} from './canonicalKey'
export type { CanonicalKeyInput } from './canonicalKey'

// ─── Item slug derivation (PR #59) ─────────────────────────────────────────
export { itemSlug } from './itemSlug'

// ─── Alternative-answer separator convention (PR #129) — the single ─────────
// definition shared by the runtime grader and the pipeline gate/health check.
export {
  splitAlternatives,
  classifyDutchSeparator,
  classifyIndonesianSeparator,
  canonicaliseDutchSeparator,
  DUTCH_COMMA_EXEMPTIONS,
} from './separatorConvention'
export type { SeparatorViolation } from './separatorConvention'

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
  PatternExerciseInput,
  ContractInputShapes,
  BuilderInputFor,
  ProjectorResult,
} from './renderContracts'
