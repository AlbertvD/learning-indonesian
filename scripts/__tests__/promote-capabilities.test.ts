import { describe, expect, it } from 'vitest'
import {
  parsePromoteCapabilitiesArgs,
  planCapabilityPromotion,
} from '../promote-capabilities'

describe('capability promotion planner', () => {
  it('promotes only capabilities with ready contracts and allowed exercises', () => {
    const plan = planCapabilityPromotion({
      capabilities: [
        { id: 'cap-ready', canonical_key: 'cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl' },
        { id: 'cap-blocked', canonical_key: 'cap:v1:item:learning_items/x:dictation:id_audio_to_text:audio:nl' },
      ],
      healthResults: [
        {
          canonicalKey: 'cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl',
          readiness: { status: 'ready', allowedExercises: ['meaning_recall'] },
        },
        {
          canonicalKey: 'cap:v1:item:learning_items/x:dictation:id_audio_to_text:audio:nl',
          readiness: { status: 'blocked', missingArtifacts: ['audio_clip'], reason: 'missing audio_clip' },
        },
      ],
    })

    expect(plan.promotions).toEqual([
      {
        capabilityId: 'cap-ready',
        canonicalKey: 'cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        allowedExercises: ['meaning_recall'],
      },
    ])
    expect(plan.blocked).toEqual([
      {
        capabilityId: 'cap-blocked',
        canonicalKey: 'cap:v1:item:learning_items/x:dictation:id_audio_to_text:audio:nl',
        readinessStatus: 'blocked',
        reason: 'missing audio_clip',
      },
    ])
  })

  it('blocks ready health rows with no exercise path', () => {
    const plan = planCapabilityPromotion({
      capabilities: [
        { id: 'cap-no-exercise', canonical_key: 'cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl' },
      ],
      healthResults: [
        {
          canonicalKey: 'cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl',
          readiness: { status: 'ready', allowedExercises: [] },
        },
      ],
    })

    expect(plan.promotions).toEqual([])
    expect(plan.blocked).toEqual([
      {
        capabilityId: 'cap-no-exercise',
        canonicalKey: 'cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl',
        readinessStatus: 'blocked',
        reason: 'No allowed exercise path for ready capability.',
      },
    ])
  })

  it('requires a lesson and mutually exclusive dry-run/apply mode', () => {
    expect(parsePromoteCapabilitiesArgs(['--lesson', '1', '--dry-run'])).toEqual({
      lesson: 1,
      sourceRef: 'lesson-1',
      apply: false,
    })
    expect(parsePromoteCapabilitiesArgs(['--lesson', '1', '--apply'])).toEqual({
      lesson: 1,
      sourceRef: 'lesson-1',
      apply: true,
    })
    expect(() => parsePromoteCapabilitiesArgs(['--lesson', '1', '--apply', '--dry-run'])).toThrow('Use either --apply or --dry-run, not both')
    expect(() => parsePromoteCapabilitiesArgs(['--bogus'])).toThrow('Unknown argument: --bogus')
  })
})
