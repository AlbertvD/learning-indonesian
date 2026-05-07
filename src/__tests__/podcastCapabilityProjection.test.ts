import { describe, expect, it } from 'vitest'
import { projectCapabilities } from '@/lib/capabilities/capabilityCatalog'
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
    const projection = projectCapabilities(snapshot)
    const segment = projection.capabilities.find(capability => capability.sourceKind === 'podcast_segment')

    expect(segment).toEqual(expect.objectContaining({
      sourceRef: segmentSourceRef,
      capabilityType: 'podcast_gist',
      direction: 'audio_to_l1',
      modality: 'audio',
      requiredArtifacts: ['audio_segment', 'transcript_segment', 'podcast_gist_prompt'],
      goalTags: ['podcast', 'guided_transcript'],
    }))
    expect(isExposureOnly(segment!)).toBe(true)
    expect(validateCapability({
      capability: segment!,
      artifacts: {
        audio_segment: [{ qualityStatus: 'approved', sourceRef: segmentSourceRef }],
        transcript_segment: [{ qualityStatus: 'approved', sourceRef: segmentSourceRef }],
        podcast_gist_prompt: [{ qualityStatus: 'approved', sourceRef: segmentSourceRef }],
      },
    }).status).toBe('exposure_only')
  })

  it('projects mined phrases with meaning-recall metadata, but treats them as exposure-only', () => {
    const projection = projectCapabilities(snapshot)
    const phrase = projection.capabilities.find(capability => capability.sourceKind === 'podcast_phrase')!

    expect(phrase).toEqual(expect.objectContaining({
      sourceRef: phraseSourceRef,
      capabilityType: 'meaning_recall',
      modality: 'mixed',
      requiredArtifacts: ['timecoded_phrase', 'translation:l1'],
    }))
    // After retirement #6, the source-kind alone marks the capability as
    // exposure-only — the source-progress 'exposure_only' field retired.
    expect(isExposureOnly(phrase)).toBe(true)

    const readiness = validateCapability({
      capability: phrase,
      artifacts: {
        timecoded_phrase: [{ qualityStatus: 'approved', sourceRef: phraseSourceRef }],
        'translation:l1': [{ qualityStatus: 'approved', sourceRef: phraseSourceRef }],
      },
    })
    expect(readiness.status).toBe('exposure_only')
  })

})
