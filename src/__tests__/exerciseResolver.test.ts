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
    sourceKind: 'vocabulary_src',
    sourceRef: 'learning_items/item-1',
    capabilityType: 'recall_meaning_from_text_cap',
    skillType: 'recall_mode',
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
      readiness: { status: 'ready', allowedExercises: ['type_meaning_ex'] },
    })).toEqual({
      status: 'resolved',
      plan: expect.objectContaining({
        exerciseType: 'type_meaning_ex',
        capabilityKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
      }),
    })
  })

  it('resolves Dutch-to-Indonesian choice through cued recall', () => {
    expect(resolveExercise({
      capability: capability({
        canonicalKey: 'cap:v1:item:learning_items/item-1:recognise_form_from_meaning_cap:l1_to_id:text:nl',
        capabilityType: 'recognise_form_from_meaning_cap' as any,
        skillType: 'recall_mode',
        direction: 'l1_to_id',
      }),
      readiness: { status: 'ready', allowedExercises: ['choose_form_ex'] },
    })).toEqual({
      status: 'resolved',
      plan: expect.objectContaining({
        exerciseType: 'choose_form_ex',
        capabilityType: 'recognise_form_from_meaning_cap',
        skillType: 'recall_mode',
      }),
    })
  })

  it('fails closed when no supported family exists', () => {
    expect(resolveExercise({
      capability: capability({ capabilityType: 'contrast_grammar_pattern_cap', requiredArtifacts: [] }),
      readiness: { status: 'ready', allowedExercises: [] },
    })).toEqual(expect.objectContaining({
      status: 'failed',
      reason: 'no_supported_exercise_family',
    }))
  })

  it('fails closed when readiness allows an exercise for a different capability trace', () => {
    expect(resolveExercise({
      capability: capability({
        capabilityType: 'recognise_meaning_from_audio_cap',
        skillType: 'recognise_mode',
        direction: 'audio_to_l1',
        modality: 'audio',
      }),
      readiness: { status: 'ready', allowedExercises: ['type_meaning_ex'] },
    })).toEqual(expect.objectContaining({
      status: 'failed',
      reason: 'no_supported_exercise_family',
    }))
  })

  it('resolves podcast gist and morphology recall through the same compatibility table', () => {
    const podcast = capability({
      canonicalKey: 'cap:v1:podcast_segment_src:podcast-warung/segment-1:recognise_gist_from_audio_cap:audio_to_l1:audio:none',
      sourceKind: 'podcast_segment_src',
      sourceRef: 'podcast-warung/segment-1',
      capabilityType: 'recognise_gist_from_audio_cap',
      skillType: 'recognise_mode',
      direction: 'audio_to_l1',
      modality: 'audio',
      learnerLanguage: 'none',
    })
    const morphology = capability({
      canonicalKey: 'cap:v1:word_form_pair_src:lesson-9/morphology/men-baca:produce_derived_form_cap:root_to_derived:text:none',
      sourceKind: 'word_form_pair_src',
      sourceRef: 'lesson-9/morphology/men-baca',
      capabilityType: 'produce_derived_form_cap',
      skillType: 'produce_mode',
      direction: 'root_to_derived',
      modality: 'text',
      learnerLanguage: 'none',
    })

    expect(resolveExercise({
      capability: podcast,
      readiness: { status: 'ready', allowedExercises: ['choose_meaning_from_audio_ex'] },
    })).toEqual(expect.objectContaining({
      status: 'resolved',
      plan: expect.objectContaining({ exerciseType: 'choose_meaning_from_audio_ex' }),
    }))
    expect(resolveExercise({
      capability: morphology,
      readiness: { status: 'ready', allowedExercises: ['type_form_ex'] },
    })).toEqual(expect.objectContaining({
      status: 'resolved',
      plan: expect.objectContaining({ exerciseType: 'type_form_ex' }),
    }))
  })
})
