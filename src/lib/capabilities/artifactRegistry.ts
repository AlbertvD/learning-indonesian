import type { ArtifactKind } from '@/lib/capabilities/capabilityTypes'

export type ArtifactQualityStatus = 'draft' | 'approved' | 'blocked' | 'deprecated'

export interface CapabilityArtifact {
  qualityStatus: ArtifactQualityStatus
  capabilityKey?: string
  sourceRef?: string
  value?: unknown
}

export type ArtifactIndex = Partial<Record<ArtifactKind, CapabilityArtifact[]>>

export const ARTIFACT_KINDS = [
  'meaning:l1',
  'meaning:nl',
  'meaning:en',
  'translation:l1',
  'accepted_answers:l1',
  'accepted_answers:id',
  'base_text',
  'cloze_context',
  'cloze_answer',
  'exercise_variant',
  'audio_clip',
  'audio_segment',
  'transcript_segment',
  'root_derived_pair',
  'allomorph_rule',
  'pattern_explanation:l1',
  'pattern_example',
  'minimal_pair',
  'dialogue_speaker_context',
  'podcast_gist_prompt',
  'timecoded_phrase',
  'production_rubric',
] as const satisfies readonly ArtifactKind[]

export function hasApprovedArtifact(input: {
  index: ArtifactIndex
  kind: ArtifactKind
  capabilityKey: string
  sourceRef: string
}): boolean {
  return input.index[input.kind]?.some(artifact => (
    artifact.qualityStatus === 'approved'
    && (artifact.capabilityKey === input.capabilityKey || artifact.sourceRef === input.sourceRef)
  )) ?? false
}
