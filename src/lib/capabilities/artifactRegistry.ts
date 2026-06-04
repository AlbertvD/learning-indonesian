import type { ArtifactKind } from './capabilityTypes'

// Slice 4b retired the `capability_artifacts` table and its readiness machinery
// (ArtifactIndex / CapabilityArtifact / hasApprovedArtifact). `ARTIFACT_KINDS`
// is retained because the legacy staging regeneration (buildArtifactsForCapability
// in scripts/lib/content-pipeline-output.ts) still references it; that whole
// regeneration — and this const with it — is retired by Slice 5 (#147).
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
