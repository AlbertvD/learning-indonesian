import { describe, expect, it } from 'vitest'
import { composeSession } from '@/lib/session/sessionComposer'

describe('capability session composer', () => {
  it('orders due review items before eligible new introductions', async () => {
    const plan = await composeSession({
      sessionId: 'session-1',
      mode: 'standard',
      dueCapabilities: [{
        capabilityId: 'capability-due',
        canonicalKeySnapshot: 'due-key',
        stateVersion: 2,
        renderPlan: { capabilityKey: 'due-key', sourceRef: 'source-1', exerciseType: 'meaning_recall', capabilityType: 'meaning_recall', skillType: 'meaning_recall', requiredArtifacts: [] },
      }],
      eligibleNewCapabilities: [{
        capability: { id: 'capability-new', canonicalKey: 'new-key' },
        renderPlan: { capabilityKey: 'new-key', sourceRef: 'source-2', exerciseType: 'recognition_mcq', capabilityType: 'text_recognition', skillType: 'recognition', requiredArtifacts: [] },
        activationRequest: { reason: 'eligible_new_capability' },
      }],
      limit: 10,
    })

    expect(plan.blocks.map(block => block.kind)).toEqual(['due_review', 'new_introduction'])
    expect(plan.blocks[1]).toEqual(expect.objectContaining({
      pendingActivation: expect.objectContaining({
        requiredActivationOwner: 'review_processor',
      }),
    }))
  })

  it('omits failed resolutions instead of falling back to legacy content', async () => {
    const plan = await composeSession({
      sessionId: 'session-1',
      mode: 'standard',
      dueCapabilities: [{
        capabilityId: 'capability-due',
        canonicalKeySnapshot: 'due-key',
        stateVersion: 2,
        resolutionFailure: { reason: 'missing_required_artifact', details: 'missing' },
      }],
      eligibleNewCapabilities: [],
      limit: 10,
    })

    expect(plan.blocks).toEqual([])
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warn', reason: 'missing_required_artifact' }),
    ]))
  })
})
