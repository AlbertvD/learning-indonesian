import { describe, expect, it } from 'vitest'
import {
  isConcreteArtifactPayload,
  planArtifactApproval,
  parseApproveArtifactsArgs,
} from '../approve-staged-capability-artifacts'

describe('staged capability artifact approval', () => {
  it('blocks generated placeholder artifacts from approval', () => {
    const plan = planArtifactApproval({
      assets: [
        {
          asset_key: 'asset-1',
          capability_key: 'cap-1',
          artifact_kind: 'meaning:l1',
          quality_status: 'draft',
          payload_json: { placeholder: true, reason: 'Generated scaffold only' },
        },
      ],
    })

    expect(plan.approved).toEqual([])
    expect(plan.blocked).toEqual([
      expect.objectContaining({
        assetKey: 'asset-1',
        reason: 'placeholder_payload',
      }),
    ])
  })

  it('approves concrete reviewed payloads', () => {
    const plan = planArtifactApproval({
      assets: [
        {
          asset_key: 'asset-2',
          capability_key: 'cap-2',
          artifact_kind: 'base_text',
          quality_status: 'draft',
          payload_json: { value: 'akhir', reviewedBy: 'human' },
        },
      ],
    })

    expect(plan.approved).toEqual([
      expect.objectContaining({
        assetKey: 'asset-2',
        qualityStatus: 'approved',
      }),
    ])
    expect(plan.blocked).toEqual([])
  })

  it('requires artifact-kind specific concrete values', () => {
    expect(isConcreteArtifactPayload('accepted_answers:id', { values: ['akhir'] })).toBe(true)
    expect(isConcreteArtifactPayload('accepted_answers:id', { values: [] })).toBe(false)
    expect(isConcreteArtifactPayload('cloze_context', { sentence: '___ pasar', answer: 'di' })).toBe(true)
    expect(isConcreteArtifactPayload('audio_clip', { storagePath: 'audio/akhir.mp3' })).toBe(true)
    expect(isConcreteArtifactPayload('meaning:l1', { value: '' })).toBe(false)
  })

  it('parses lesson scope and dry-run/apply mode safely', () => {
    expect(parseApproveArtifactsArgs(['--lesson', '1', '--dry-run'])).toEqual({
      lesson: 1,
      apply: false,
      stagingPath: 'scripts/data/staging/lesson-1/exercise-assets.ts',
    })
    expect(parseApproveArtifactsArgs(['--lesson', '1', '--apply'])).toEqual({
      lesson: 1,
      apply: true,
      stagingPath: 'scripts/data/staging/lesson-1/exercise-assets.ts',
    })
    expect(() => parseApproveArtifactsArgs(['--lesson', '1', '--apply', '--dry-run'])).toThrow('Use either --apply or --dry-run, not both')
    expect(() => parseApproveArtifactsArgs(['--bogus'])).toThrow('Unknown argument: --bogus')
  })
})
