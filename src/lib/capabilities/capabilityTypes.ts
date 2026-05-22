import type { SkillType } from '../../types/learning'

export const CAPABILITY_PROJECTION_VERSION = 'capability-v3' as const

export type CapabilitySourceKind =
  | 'item'
  | 'pattern'
  | 'dialogue_line'
  | 'podcast_segment'
  | 'podcast_phrase'
  | 'affixed_form_pair'

/**
 * Runtime list of every CapabilitySourceKind. The `as const satisfies` clause
 * keeps this array type-locked to the union — when a new source kind is added
 * to the union, TS flags this array as incomplete. Mirrors the ARTIFACT_KINDS
 * pattern in artifactRegistry.ts.
 *
 * Used by capabilityContentService's canonical-key decoder so that the
 * whitelist of accepted source kinds widens automatically when the catalog
 * adds a new kind.
 */
export const CAPABILITY_SOURCE_KINDS = [
  'item',
  'pattern',
  'dialogue_line',
  'podcast_segment',
  'podcast_phrase',
  'affixed_form_pair',
] as const satisfies readonly CapabilitySourceKind[]

export type CapabilityType =
  | 'text_recognition'
  | 'meaning_recall'
  | 'l1_to_id_choice'
  | 'form_recall'
  | 'contextual_cloze'
  | 'audio_recognition'
  | 'dictation'
  | 'podcast_gist'
  | 'pattern_recognition'
  | 'pattern_contrast'
  | 'root_derived_recognition'
  | 'root_derived_recall'

export const CAPABILITY_TYPES = [
  'text_recognition',
  'meaning_recall',
  'l1_to_id_choice',
  'form_recall',
  'contextual_cloze',
  'audio_recognition',
  'dictation',
  'podcast_gist',
  'pattern_recognition',
  'pattern_contrast',
  'root_derived_recognition',
  'root_derived_recall',
] as const satisfies readonly CapabilityType[]

export type CapabilityDirection =
  | 'id_to_l1'
  | 'l1_to_id'
  | 'audio_to_l1'
  | 'audio_to_id'
  | 'root_to_derived'
  | 'derived_to_root'
  | 'none'

export type CapabilityModality = 'text' | 'audio' | 'mixed' | 'none'
export type LearnerLanguage = 'nl' | 'en' | 'none'

export type ArtifactKind =
  | 'meaning:l1'
  | 'meaning:nl'
  | 'meaning:en'
  | 'translation:l1'
  | 'accepted_answers:l1'
  | 'accepted_answers:id'
  | 'base_text'
  | 'cloze_context'
  | 'cloze_answer'
  | 'exercise_variant'
  | 'audio_clip'
  | 'audio_segment'
  | 'transcript_segment'
  | 'root_derived_pair'
  | 'allomorph_rule'
  | 'pattern_explanation:l1'
  | 'pattern_example'
  | 'minimal_pair'
  | 'dialogue_speaker_context'
  | 'podcast_gist_prompt'
  | 'timecoded_phrase'
  | 'production_rubric'

export interface CurrentLearningItem {
  id: string
  baseText: string
  meanings: Array<{ language: 'nl' | 'en'; text: string }>
  acceptedAnswers?: {
    id?: string[]
    l1?: string[]
  }
  hasAudio?: boolean
}

export interface CurrentDialogueLine {
  id: string
  sourceRef: string
  text: string
  translation?: string
}

export interface CurrentPodcastSegment {
  id: string
  sourceRef: string
  hasAudio: boolean
  transcript?: string
  gistPrompt?: string
  exposureOnly?: boolean
}

export interface CurrentPodcastPhrase {
  id: string
  sourceRef: string
  text: string
  translation?: string
  segmentSourceRef?: string
}

export interface CurrentAffixedFormPair {
  id: string
  sourceRef: string
  root: string
  derived: string
  allomorphRule?: string
  patternSourceRef?: string
}

export interface CurrentGrammarPattern {
  id: string
  sourceRef: string
  name: string
  examples: string[]
}

export interface StagedLessonSnapshot {
  lessonId: string
  unitSlugs: string[]
}

export interface CurrentContentSnapshot {
  learningItems: CurrentLearningItem[]
  grammarPatterns: CurrentGrammarPattern[]
  stagedLessons?: StagedLessonSnapshot[]
  dialogueLines?: CurrentDialogueLine[]
  podcastSegments?: CurrentPodcastSegment[]
  podcastPhrases?: CurrentPodcastPhrase[]
  affixedFormPairs?: CurrentAffixedFormPair[]
}

export interface ProjectedCapability {
  canonicalKey: string
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  skillType: SkillType
  direction: CapabilityDirection
  modality: CapabilityModality
  learnerLanguage: LearnerLanguage
  requiredArtifacts: ArtifactKind[]
  prerequisiteKeys: string[]
  // NULL = capability is not lesson-scoped (podcast or cross-lesson). NOT
  // NULL = capability is owned by that lesson and only eligible for new-
  // capability introduction once the learner has activated it.
  lessonId?: string | null
  projectionVersion: typeof CAPABILITY_PROJECTION_VERSION
}

export interface CapabilityAlias {
  oldCanonicalKey: string
  newCanonicalKey: string
  reason: string
  migrationConfidence: 'exact' | 'high' | 'medium' | 'low' | 'inferred' | 'manual_required'
}

export interface ProjectionDiagnostic {
  severity: 'info' | 'warn' | 'critical'
  message: string
  sourceRef?: string
}

export interface CapabilityProjection {
  projectionVersion: typeof CAPABILITY_PROJECTION_VERSION
  capabilities: ProjectedCapability[]
  aliases: CapabilityAlias[]
  diagnostics: ProjectionDiagnostic[]
}

// ─── DB-row shape and lifecycle enums ──────────────────────────────────────
//
// Mirrors learning_capabilities rows. Lives here (the lib layer) rather than
// in services/ so consumers in lib/ can depend on these types without
// inverting the architectural arrow.

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
  lesson_id: string | null
  prerequisite_keys: string[]
  required_artifacts: ArtifactKind[]
  created_at?: string
  updated_at?: string
}

// Maps capability_type to the SkillType that the renderer uses to pick the
// answer-feedback flow. Was previously stored on metadata_json.skillType; now
// derived at read-time per Decision F. Closed mapping — TS exhaustiveness
// catches any new capability_type that needs a skill assignment.
export function deriveSkillTypeFromCapabilityType(capabilityType: CapabilityType): SkillType {
  switch (capabilityType) {
    case 'text_recognition':
    case 'audio_recognition':
    case 'pattern_recognition':
    case 'pattern_contrast':
    case 'root_derived_recognition':
    case 'podcast_gist':
      return 'recognition'
    case 'meaning_recall':
    case 'l1_to_id_choice':
      return 'meaning_recall'
    case 'form_recall':
    case 'dictation':
    case 'root_derived_recall':
    case 'contextual_cloze':
      return 'form_recall'
  }
}
