import type {
  CapabilityDirection,
  CapabilityModality,
  CapabilitySourceKind,
  CapabilityType,
  LearnerLanguage,
} from '@/lib/capabilities'

// Shared type vocabulary used across session-builder, reviews, and other
// consumers. The runtime methods that used to live here (listCapabilities,
// getCapabilityByCanonicalKey, upsertCapability) had no production callers
// and were removed; capability writes go through the capability-stage
// pipeline, capability reads go through capabilityContentService.

export type CapabilityReadinessStatus = 'ready' | 'blocked' | 'exposure_only' | 'deprecated' | 'unknown'
export type CapabilityPublicationStatus = 'draft' | 'published' | 'retired'

export interface LearningCapabilityRow {
  id?: string
  canonical_key: string
  source_kind: CapabilitySourceKind
  source_ref: string
  capability_type: CapabilityType
  direction: CapabilityDirection
  modality: CapabilityModality
  learner_language: LearnerLanguage
  projection_version: string
  readiness_status: CapabilityReadinessStatus
  publication_status: CapabilityPublicationStatus
  source_fingerprint?: string | null
  artifact_fingerprint?: string | null
  metadata_json: Record<string, unknown>
  created_at?: string
  updated_at?: string
}
