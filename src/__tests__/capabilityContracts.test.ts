import { describe, expect, it } from 'vitest'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import { validateCapabilities, validateCapability } from '@/lib/capabilities/capabilityContracts'

// Slice 4b: readiness no longer reads the capability_artifacts bag. A capability
// is `ready` iff some exercise type serves its capability_type AND supports its
// source_kind (RENDER_CONTRACTS routing); `blocked` only when no compatible
// exercise exists. `requiredArtifacts` on the projection is retained in memory
// for the (Slice-5-owned) legacy staging regeneration but is NOT consulted here.
const baseCapability: ProjectedCapability = {
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
}

describe('capability contract validation (post-4b: readiness off the typed contract, not artifacts)', () => {
  it('readies a cap with a compatible exercise', () => {
    expect(validateCapability({ capability: baseCapability })).toEqual({
      status: 'ready',
      allowedExercises: ['meaning_recall'],
    })
  })

  it('maps Dutch-to-Indonesian choice to cued recall', () => {
    const bridgeCapability = {
      ...baseCapability,
      canonicalKey: 'cap:v1:item:learning_items/item-1:l1_to_id_choice:l1_to_id:text:nl',
      capabilityType: 'l1_to_id_choice' as const,
      direction: 'l1_to_id' as const,
    }

    expect(validateCapability({ capability: bridgeCapability })).toEqual({
      status: 'ready',
      allowedExercises: ['cued_recall'],
    })
  })

  // PARITY GUARD (4b.4 layer 1): a cap that historically carried a non-empty
  // required_artifacts list readies WITHOUT any artifact bag — proving the
  // readiness decision no longer depends on capability_artifacts. This is the
  // unit-level half of the inert-change proof (the other two layers are the
  // Capability Gate assertion + the check-supabase-deep ready-count parity).
  it('readies an audio cap that historically required [audio_clip, meaning:l1] with no artifacts present', () => {
    expect(validateCapability({
      capability: {
        ...baseCapability,
        canonicalKey: 'cap:v1:item:learning_items/item-1:audio_recognition:audio_to_l1:audio:nl',
        capabilityType: 'audio_recognition',
        direction: 'audio_to_l1',
        modality: 'audio',
        requiredArtifacts: ['audio_clip', 'meaning:l1'],
      },
    })).toEqual({
      status: 'ready',
      allowedExercises: ['listening_mcq'],
    })
  })

  it('readies a dialogue_line contextual_cloze cap (structure lives in the typed dialogue_clozes table)', () => {
    expect(validateCapability({
      capability: {
        ...baseCapability,
        canonicalKey: 'cap:v1:dialogue_line:lesson-9/section-1/line-3:contextual_cloze:id_to_l1:text:none',
        sourceKind: 'dialogue_line',
        sourceRef: 'lesson-9/section-1/line-3',
        capabilityType: 'contextual_cloze',
        requiredArtifacts: [],
      },
    })).toEqual({
      status: 'ready',
      allowedExercises: ['cloze'],
    })
  })

  it('blocks a cap whose capability_type has no exercise for its source_kind', () => {
    // meaning_recall is served only by the item-only `meaning_recall` exercise;
    // a meaning_recall cap on a non-item source kind has no compatible exercise.
    const result = validateCapability({
      capability: { ...baseCapability, sourceKind: 'pattern' },
    })

    expect(result).toEqual({
      status: 'blocked',
      missingArtifacts: [],
      reason: 'no_compatible_exercise_for_capability_type',
    })
  })

  it('treats podcast source kinds as exposure-only', () => {
    expect(validateCapability({
      capability: { ...baseCapability, sourceKind: 'podcast_segment', capabilityType: 'podcast_gist' },
    }).status).toBe('exposure_only')
  })

  it.each([
    ['exposure_only', 'exposure_only'],
    ['deprecated', 'deprecated'],
    ['unknown', 'unknown'],
  ] as const)('honours the %s readiness override', (readinessOverride, expected) => {
    expect(validateCapability({
      capability: baseCapability,
      readinessOverride,
    }).status).toBe(expected)
  })

  it('counts blocked and unknown findings as critical in health reports', () => {
    const report = validateCapabilities({
      projection: {
        projectionVersion: 'capability-v3',
        capabilities: [{ ...baseCapability, sourceKind: 'pattern' }],
        aliases: [],
        diagnostics: [],
      },
    })

    expect(report.criticalCount).toBe(1)
  })
})
