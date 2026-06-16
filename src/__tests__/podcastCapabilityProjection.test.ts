import { describe, expect, it } from 'vitest'
// Decision 4 (capability-stage fold): podcast capability emission moved out of
// the shared catalog into scripts/lib/pipeline/podcast-stage/podcastProjectionRules.
// These tests target the moved rule directly.
import { projectPodcastCapabilities } from '../../scripts/lib/pipeline/podcast-stage/podcastProjectionRules'
import { isExposureOnly, validateCapability } from '@/lib/capabilities/capabilityContracts'
import type { CurrentContentSnapshot } from '@/lib/capabilities/capabilityTypes'

const segmentSourceRef = 'podcast-warung-market/segment-1'
const phraseSourceRef = 'podcast-warung-market/phrase-apa-kabar'

const snapshot: CurrentContentSnapshot = {
  learningItems: [],
  grammarPatterns: [],
  podcastSegments: [{
    id: 'segment-1',
    sourceRef: segmentSourceRef,
    hasAudio: true,
    transcript: 'Apa kabar, Bu? Baik, terima kasih.',
    gistPrompt: 'What is the social function of apa kabar?',
    exposureOnly: true,
  }],
  podcastPhrases: [{
    id: 'phrase-apa-kabar',
    sourceRef: phraseSourceRef,
    segmentSourceRef,
    text: 'Apa kabar?',
    translation: 'Hoe gaat het?',
  }],
}

describe('podcast capability projection', () => {
  it('projects guided transcript segments as exposure-only via source kind', () => {
    const capabilities = projectPodcastCapabilities(snapshot)
    const segment = capabilities.find(capability => capability.sourceKind === 'podcast_segment_src')

    expect(segment).toEqual(expect.objectContaining({
      sourceRef: segmentSourceRef,
      capabilityType: 'recognise_gist_from_audio_cap',
      direction: 'audio_to_l1',
      modality: 'audio',
      requiredArtifacts: ['audio_segment', 'transcript_segment', 'podcast_gist_prompt'],
    }))
    expect(isExposureOnly(segment!)).toBe(true)
    expect(validateCapability({
      capability: segment!,
    }).status).toBe('exposure_only')
  })

  it('projects mined phrases with meaning-recall metadata, but treats them as exposure-only', () => {
    const capabilities = projectPodcastCapabilities(snapshot)
    const phrase = capabilities.find(capability => capability.sourceKind === 'podcast_phrase_src')!

    expect(phrase).toEqual(expect.objectContaining({
      sourceRef: phraseSourceRef,
      capabilityType: 'recall_meaning_from_text_cap',
      modality: 'mixed',
      requiredArtifacts: ['timecoded_phrase', 'translation:l1'],
    }))
    // After retirement #6, the source-kind alone marks the capability as
    // exposure-only — the source-progress 'exposure_only' field retired.
    expect(isExposureOnly(phrase)).toBe(true)

    const readiness = validateCapability({
      capability: phrase,
    })
    expect(readiness.status).toBe('exposure_only')
  })

})
