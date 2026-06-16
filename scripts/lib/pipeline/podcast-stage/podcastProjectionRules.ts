/**
 * podcast-stage/podcastProjectionRules.ts — extracted verbatim from
 * `src/lib/capabilities/capabilityCatalog.ts:164–192` (the two podcast
 * `for` loops over `podcastSegments` and `podcastPhrases`) per fold
 * Decision 4.
 *
 * Pure function: input snapshot → ProjectedCapability[]. The four callers
 * of `projectCapabilities` get a one-line additive update — they call
 * `projectPodcastCapabilities` alongside the shared catalog and concatenate
 * the resulting capability arrays. See INVENTORY.md for the rest of the
 * podcast deep module's planned shape (loader, runner, adapter, agents,
 * validators).
 */

import {
  buildCanonicalKey,
  CAPABILITY_PROJECTION_VERSION,
  type ArtifactKind,
  type CapabilityDirection,
  type CapabilityModality,
  type CapabilitySourceKind,
  type CapabilityType,
  type CurrentContentSnapshot,
  type LearnerLanguage,
  type ProjectedCapability,
} from '@/lib/capabilities'
import type { SkillType } from '@/types/learning'

interface CapabilityDraft {
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  skillType: SkillType
  direction: CapabilityDirection
  modality: CapabilityModality
  learnerLanguage: LearnerLanguage
  requiredArtifacts: ArtifactKind[]
  prerequisiteKeys?: string[]
}

function createCapability(draft: CapabilityDraft): ProjectedCapability {
  return {
    ...draft,
    canonicalKey: buildCanonicalKey(draft),
    prerequisiteKeys: draft.prerequisiteKeys ?? [],
    projectionVersion: CAPABILITY_PROJECTION_VERSION,
  }
}

/**
 * Pure rule function. Reads only `podcastSegments` + `podcastPhrases` from
 * the shared `CurrentContentSnapshot`; everything else is ignored. Returns
 * a stable-ordered list of ProjectedCapability rows for podcast segments
 * (recognise_gist_from_audio_cap) + podcast phrases (meaning_recall).
 */
export function projectPodcastCapabilities(
  input: Pick<CurrentContentSnapshot, 'podcastSegments' | 'podcastPhrases'>,
): ProjectedCapability[] {
  const capabilities: ProjectedCapability[] = []

  for (const segment of input.podcastSegments ?? []) {
    capabilities.push(createCapability({
      sourceKind: 'podcast_segment_src',
      sourceRef: segment.sourceRef,
      capabilityType: 'recognise_gist_from_audio_cap',
      skillType: 'recognition',
      direction: 'audio_to_l1',
      modality: 'audio',
      learnerLanguage: 'none',
      requiredArtifacts: ['audio_segment', 'transcript_segment', 'podcast_gist_prompt'],
    }))
  }

  for (const phrase of input.podcastPhrases ?? []) {
    capabilities.push(createCapability({
      sourceKind: 'podcast_phrase_src',
      sourceRef: phrase.sourceRef,
      capabilityType: 'recall_meaning_from_text_cap',
      skillType: 'meaning_recall',
      direction: 'id_to_l1',
      modality: 'mixed',
      learnerLanguage: 'none',
      requiredArtifacts: ['timecoded_phrase', 'translation:l1'],
    }))
  }

  capabilities.sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey))
  return capabilities
}
