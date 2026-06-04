import { describe, expect, it } from 'vitest'
import { resolveExercise } from '@/lib/exercises/exerciseResolver'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'

// Slice 4b: the resolver no longer re-checks capability_artifacts — readiness
// (decided by validateCapability's typed-contract routing) is the sole gate.
// `requiredArtifacts` is retained on ProjectedCapability for the Slice-5-owned
// staging regeneration but plays no part in resolution.
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
    projectionVersion: 'capability-v3',
    ...overrides,
  }
}

describe('exercise resolver', () => {
  it('refuses blocked readiness', () => {
    expect(resolveExercise({
      capability: capability(),
      readiness: { status: 'blocked', missingArtifacts: [], reason: 'no_compatible_exercise_for_capability_type' },
    })).toEqual(expect.objectContaining({
      status: 'failed',
      reason: 'capability_not_ready',
    }))
  })

  it('resolves supported capability families to render plans', () => {
    expect(resolveExercise({
      capability: capability(),
      readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
    })).toEqual({
      status: 'resolved',
      plan: expect.objectContaining({
        exerciseType: 'meaning_recall',
        capabilityKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
      }),
    })
  })

  it('resolves Dutch-to-Indonesian choice through cued recall', () => {
    expect(resolveExercise({
      capability: capability({
        canonicalKey: 'cap:v1:item:learning_items/item-1:l1_to_id_choice:l1_to_id:text:nl',
        capabilityType: 'l1_to_id_choice' as any,
        skillType: 'meaning_recall',
        direction: 'l1_to_id',
      }),
      readiness: { status: 'ready', allowedExercises: ['cued_recall'] },
    })).toEqual({
      status: 'resolved',
      plan: expect.objectContaining({
        exerciseType: 'cued_recall',
        capabilityType: 'l1_to_id_choice',
        skillType: 'meaning_recall',
      }),
    })
  })

  it('fails closed when no supported family exists', () => {
    expect(resolveExercise({
      capability: capability({ capabilityType: 'pattern_contrast', requiredArtifacts: [] }),
      readiness: { status: 'ready', allowedExercises: [] },
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
      }),
      readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
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
    })

    expect(resolveExercise({
      capability: podcast,
      readiness: { status: 'ready', allowedExercises: ['listening_mcq'] },
    })).toEqual(expect.objectContaining({
      status: 'resolved',
      plan: expect.objectContaining({ exerciseType: 'listening_mcq' }),
    }))
    expect(resolveExercise({
      capability: morphology,
      readiness: { status: 'ready', allowedExercises: ['typed_recall'] },
    })).toEqual(expect.objectContaining({
      status: 'resolved',
      plan: expect.objectContaining({ exerciseType: 'typed_recall' }),
    }))
  })
})
