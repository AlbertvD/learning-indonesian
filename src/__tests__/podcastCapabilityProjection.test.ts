import { describe, expect, it } from 'vitest'
import { projectCapabilities } from '@/lib/capabilities/capabilityCatalog'
import { validateCapability } from '@/lib/capabilities/capabilityContracts'
import { resolveExercise } from '@/lib/exercises/exerciseResolver'
import { planLearningPath, type PlannerCapability } from '@/lib/pedagogy/pedagogyPlanner'
import type { CurrentContentSnapshot, ProjectedCapability } from '@/lib/capabilities/capabilityTypes'

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

function asPlannerCapability(capability: ProjectedCapability): PlannerCapability {
  return {
    id: capability.canonicalKey,
    canonicalKey: capability.canonicalKey,
    sourceKind: capability.sourceKind,
    sourceRef: capability.sourceRef,
    capabilityType: capability.capabilityType,
    skillType: capability.skillType,
    readinessStatus: 'ready',
    publicationStatus: 'published',
    prerequisiteKeys: capability.prerequisiteKeys,
    requiredSourceProgress: capability.requiredSourceProgress,
    difficultyLevel: capability.difficultyLevel,
    goalTags: capability.goalTags,
  }
}

describe('podcast capability projection', () => {
  it('projects guided transcript segments as exposure-only gist capabilities', () => {
    const projection = projectCapabilities(snapshot)
    const segment = projection.capabilities.find(capability => capability.sourceKind === 'podcast_segment')

    expect(segment).toEqual(expect.objectContaining({
      sourceRef: segmentSourceRef,
      capabilityType: 'podcast_gist',
      direction: 'audio_to_l1',
      modality: 'audio',
      requiredArtifacts: ['audio_segment', 'transcript_segment', 'podcast_gist_prompt'],
      requiredSourceProgress: { kind: 'none', reason: 'exposure_only' },
      goalTags: ['podcast', 'guided_transcript'],
    }))
    expect(validateCapability({
      capability: segment!,
      artifacts: {
        audio_segment: [{ qualityStatus: 'approved', sourceRef: segmentSourceRef }],
        transcript_segment: [{ qualityStatus: 'approved', sourceRef: segmentSourceRef }],
        podcast_gist_prompt: [{ qualityStatus: 'approved', sourceRef: segmentSourceRef }],
      },
    }).status).toBe('exposure_only')
  })

  it('projects mined phrases behind heard-once source progress and ordinary meaning recall', () => {
    const projection = projectCapabilities(snapshot)
    const phrase = projection.capabilities.find(capability => capability.sourceKind === 'podcast_phrase')!

    expect(phrase).toEqual(expect.objectContaining({
      sourceRef: phraseSourceRef,
      capabilityType: 'meaning_recall',
      modality: 'mixed',
      requiredArtifacts: ['timecoded_phrase', 'translation:l1'],
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: segmentSourceRef,
        requiredState: 'heard_once',
      },
    }))

    const readiness = validateCapability({
      capability: phrase,
      artifacts: {
        timecoded_phrase: [{ qualityStatus: 'approved', sourceRef: phraseSourceRef }],
        'translation:l1': [{ qualityStatus: 'approved', sourceRef: phraseSourceRef }],
      },
    })
    expect(readiness).toEqual({ status: 'ready', allowedExercises: ['meaning_recall'] })
    expect(resolveExercise({
      capability: phrase,
      readiness,
      artifactIndex: {
        timecoded_phrase: [{ qualityStatus: 'approved', sourceRef: phraseSourceRef }],
        'translation:l1': [{ qualityStatus: 'approved', sourceRef: phraseSourceRef }],
      },
    })).toEqual(expect.objectContaining({
      status: 'resolved',
      plan: expect.objectContaining({ exerciseType: 'meaning_recall' }),
    }))
  })

  it('lets podcast mode budget mined phrases only after the source segment has been heard', () => {
    const phrase = projectCapabilities(snapshot).capabilities.find(capability => capability.sourceKind === 'podcast_phrase')!
    const withoutExposure = planLearningPath({
      userId: 'user-1',
      mode: 'podcast',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 10,
      dueCount: 0,
      readyCapabilities: [asPlannerCapability(phrase)],
      learnerCapabilityStates: [],
      sourceProgress: [],
      recentReviewEvidence: [],
    })
    const withExposure = planLearningPath({
      userId: 'user-1',
      mode: 'podcast',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 10,
      dueCount: 0,
      readyCapabilities: [asPlannerCapability(phrase)],
      learnerCapabilityStates: [],
      sourceProgress: [{
        sourceRef: segmentSourceRef,
        sourceSectionRef: 'segment-1',
        currentState: 'heard_once',
        completedEventTypes: ['heard_once'],
      }],
      recentReviewEvidence: [],
    })

    expect(withoutExposure.suppressedCapabilities[0]).toEqual({
      canonicalKey: phrase.canonicalKey,
      reason: 'missing_source_progress',
    })
    expect(withExposure.eligibleNewCapabilities.map(item => item.capability.canonicalKey)).toEqual([phrase.canonicalKey])
    expect(withExposure.loadBudget.reason).toBe('podcast_phrase_budget')
  })

  it('prevents heard podcast phrases from leaking into standard sessions', () => {
    const phrase = projectCapabilities(snapshot).capabilities.find(capability => capability.sourceKind === 'podcast_phrase')!
    const plan = planLearningPath({
      userId: 'user-1',
      mode: 'standard',
      now: new Date('2026-04-25T00:00:00.000Z'),
      preferredSessionSize: 10,
      dueCount: 0,
      readyCapabilities: [asPlannerCapability(phrase)],
      learnerCapabilityStates: [],
      sourceProgress: [{
        sourceRef: segmentSourceRef,
        sourceSectionRef: 'segment-1',
        currentState: 'heard_once',
        completedEventTypes: ['heard_once'],
      }],
      recentReviewEvidence: [],
    })

    expect(plan.eligibleNewCapabilities).toEqual([])
    expect(plan.suppressedCapabilities[0]).toEqual({
      canonicalKey: phrase.canonicalKey,
      reason: 'wrong_session_mode',
    })
  })
})
