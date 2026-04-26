import { describe, expect, it } from 'vitest'
import { resolveExercise } from '@/lib/exercises/exerciseResolver'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'

function capability(overrides: Partial<ProjectedCapability> = {}): ProjectedCapability {
  return {
    canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
    sourceKind: 'item',
    sourceRef: 'learning_items/item-1',
    capabilityType: 'meaning_recall',
    skillType: 'meaning_recall',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
    prerequisiteKeys: [],
    difficultyLevel: overrides.difficultyLevel ?? 2,
    goalTags: overrides.goalTags ?? [],
    projectionVersion: 'capability-v1',
    sourceFingerprint: 'source',
    artifactFingerprint: 'artifact',
    ...overrides,
  }
}

describe('exercise resolver', () => {
  it('refuses blocked readiness', () => {
    expect(resolveExercise({
      capability: capability(),
      readiness: { status: 'blocked', missingArtifacts: ['meaning:l1'], reason: 'missing' },
      artifactIndex: {},
    })).toEqual(expect.objectContaining({
      status: 'failed',
      reason: 'capability_not_ready',
    }))
  })

  it('returns missing artifact failures explicitly', () => {
    expect(resolveExercise({
      capability: capability(),
      readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
      artifactIndex: { 'meaning:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }] },
    })).toEqual(expect.objectContaining({
      status: 'failed',
      reason: 'missing_required_artifact',
      missingArtifacts: ['accepted_answers:l1'],
    }))
  })

  it('resolves supported capability families to render plans', () => {
    expect(resolveExercise({
      capability: capability(),
      readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
      artifactIndex: {
        'meaning:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
        'accepted_answers:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
      },
    })).toEqual({
      status: 'resolved',
      plan: expect.objectContaining({
        exerciseType: 'meaning_recall',
        capabilityKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
      }),
    })
  })

  it('fails closed when no supported family exists', () => {
    expect(resolveExercise({
      capability: capability({ capabilityType: 'pattern_contrast', requiredArtifacts: [] }),
      readiness: { status: 'ready', allowedExercises: [] },
      artifactIndex: {},
    })).toEqual(expect.objectContaining({
      status: 'failed',
      reason: 'no_supported_exercise_family',
    }))
  })

  it('fails closed when readiness allows an exercise for a different capability trace', () => {
    expect(resolveExercise({
      capability: capability({
        capabilityType: 'audio_recognition',
        skillType: 'recognition',
        direction: 'audio_to_l1',
        modality: 'audio',
        requiredArtifacts: ['audio_clip', 'meaning:l1'],
      }),
      readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
      artifactIndex: {
        audio_clip: [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
        'meaning:l1': [{ qualityStatus: 'approved', sourceRef: 'learning_items/item-1' }],
      },
    })).toEqual(expect.objectContaining({
      status: 'failed',
      reason: 'no_supported_exercise_family',
    }))
  })

  it('resolves podcast gist and morphology recall through the same compatibility table', () => {
    const podcast = capability({
      canonicalKey: 'cap:v1:podcast_segment:podcast-warung/segment-1:podcast_gist:audio_to_l1:audio:none',
      sourceKind: 'podcast_segment',
      sourceRef: 'podcast-warung/segment-1',
      capabilityType: 'podcast_gist',
      skillType: 'recognition',
      direction: 'audio_to_l1',
      modality: 'audio',
      learnerLanguage: 'none',
      requiredArtifacts: ['audio_segment', 'transcript_segment', 'podcast_gist_prompt'],
    })
    const morphology = capability({
      canonicalKey: 'cap:v1:affixed_form_pair:lesson-9/morphology/men-baca:root_derived_recall:root_to_derived:text:none',
      sourceKind: 'affixed_form_pair',
      sourceRef: 'lesson-9/morphology/men-baca',
      capabilityType: 'root_derived_recall',
      skillType: 'form_recall',
      direction: 'root_to_derived',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts: ['root_derived_pair', 'allomorph_rule'],
    })

    expect(resolveExercise({
      capability: podcast,
      readiness: { status: 'ready', allowedExercises: ['listening_mcq'] },
      artifactIndex: {
        audio_segment: [{ qualityStatus: 'approved', sourceRef: podcast.sourceRef }],
        transcript_segment: [{ qualityStatus: 'approved', sourceRef: podcast.sourceRef }],
        podcast_gist_prompt: [{ qualityStatus: 'approved', sourceRef: podcast.sourceRef }],
      },
    })).toEqual(expect.objectContaining({
      status: 'resolved',
      plan: expect.objectContaining({ exerciseType: 'listening_mcq' }),
    }))
    expect(resolveExercise({
      capability: morphology,
      readiness: { status: 'ready', allowedExercises: ['typed_recall'] },
      artifactIndex: {
        root_derived_pair: [{ qualityStatus: 'approved', sourceRef: morphology.sourceRef }],
        allomorph_rule: [{ qualityStatus: 'approved', sourceRef: morphology.sourceRef }],
      },
    })).toEqual(expect.objectContaining({
      status: 'resolved',
      plan: expect.objectContaining({ exerciseType: 'typed_recall' }),
    }))
  })
})
