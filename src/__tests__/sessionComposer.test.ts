import { describe, expect, it } from 'vitest'
import { composeSession } from '@/lib/session/sessionComposer'
import type { CapabilityScheduleSnapshot } from '@/lib/reviews/capabilityReviewProcessor'

const activeSnapshot: CapabilityScheduleSnapshot = {
  stateVersion: 2,
  activationState: 'active',
  stability: 1,
  difficulty: 5,
  lastReviewedAt: '2026-04-24T10:00:00.000Z',
  nextDueAt: '2026-04-25T10:00:00.000Z',
  reviewCount: 1,
  lapseCount: 0,
  consecutiveFailureCount: 0,
}

const dormantSnapshot: CapabilityScheduleSnapshot = {
  stateVersion: 0,
  activationState: 'dormant',
  reviewCount: 0,
  lapseCount: 0,
  consecutiveFailureCount: 0,
}

describe('capability session composer', () => {
  it('orders due review items before eligible new introductions', async () => {
    const plan = await composeSession({
      sessionId: 'session-1',
      mode: 'standard',
      dueCapabilities: [{
        capabilityId: 'capability-due',
        canonicalKeySnapshot: 'due-key',
        stateVersion: 2,
        reviewContext: {
          schedulerSnapshot: activeSnapshot,
          currentStateVersion: 2,
          artifactVersionSnapshot: { artifactFingerprint: 'due-artifact' },
          capabilityReadinessStatus: 'ready',
          capabilityPublicationStatus: 'published',
        },
        renderPlan: { capabilityKey: 'due-key', sourceRef: 'source-1', exerciseType: 'meaning_recall', capabilityType: 'meaning_recall', skillType: 'meaning_recall', requiredArtifacts: [] },
      }],
      eligibleNewCapabilities: [{
        capability: { id: 'capability-new', canonicalKey: 'new-key' },
        renderPlan: { capabilityKey: 'new-key', sourceRef: 'source-2', exerciseType: 'recognition_mcq', capabilityType: 'text_recognition', skillType: 'recognition', requiredArtifacts: [] },
        activationRequest: { reason: 'eligible_new_capability' },
        reviewContext: {
          schedulerSnapshot: dormantSnapshot,
          currentStateVersion: 0,
          artifactVersionSnapshot: { artifactFingerprint: 'new-artifact' },
          capabilityReadinessStatus: 'ready',
          capabilityPublicationStatus: 'published',
        },
      }],
      limit: 10,
    })

    expect(plan.blocks.map(block => block.kind)).toEqual(['due_review', 'new_introduction'])
    expect(plan.blocks[1]).toEqual(expect.objectContaining({
      pendingActivation: expect.objectContaining({
        requiredActivationOwner: 'review_processor',
      }),
      reviewContext: expect.objectContaining({
        schedulerSnapshot: expect.objectContaining({ activationState: 'dormant' }),
        currentStateVersion: 0,
        artifactVersionSnapshot: { artifactFingerprint: 'new-artifact' },
      }),
    }))
    expect(plan.title).toBe('Dagelijkse Indonesische oefening')
  })

  it('omits failed resolutions instead of falling back to legacy content', async () => {
    const plan = await composeSession({
      sessionId: 'session-1',
      mode: 'standard',
      dueCapabilities: [{
        capabilityId: 'capability-due',
        canonicalKeySnapshot: 'due-key',
        stateVersion: 2,
        reviewContext: {
          schedulerSnapshot: activeSnapshot,
          currentStateVersion: 2,
          artifactVersionSnapshot: {},
          capabilityReadinessStatus: 'ready',
          capabilityPublicationStatus: 'published',
        },
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

  it('keeps a clean short session instead of padding to the limit', async () => {
    const plan = await composeSession({
      sessionId: 'session-1',
      mode: 'standard',
      dueCapabilities: [],
      eligibleNewCapabilities: [{
        capability: { id: 'capability-new', canonicalKey: 'new-key' },
        renderPlan: { capabilityKey: 'new-key', sourceRef: 'source-2', exerciseType: 'recognition_mcq', capabilityType: 'text_recognition', skillType: 'recognition', requiredArtifacts: [] },
        activationRequest: { reason: 'eligible_new_capability' },
        reviewContext: {
          schedulerSnapshot: dormantSnapshot,
          currentStateVersion: 0,
          artifactVersionSnapshot: {},
          capabilityReadinessStatus: 'ready',
          capabilityPublicationStatus: 'published',
        },
      }],
      limit: 5,
    })

    expect(plan.blocks).toHaveLength(1)
  })

  it('carries queue-drying diagnostics into the session plan', async () => {
    const plan = await composeSession({
      sessionId: 'session-1',
      mode: 'standard',
      dueCapabilities: [],
      eligibleNewCapabilities: [],
      diagnostics: [{
        severity: 'warn',
        reason: 'learning_pipeline_drying_up',
        details: 'session.pipelineDryingUp',
      }],
      limit: 5,
    })

    expect(plan.diagnostics).toEqual([{
      severity: 'warn',
      reason: 'learning_pipeline_drying_up',
      details: 'session.pipelineDryingUp',
    }])
  })

  it('composes lesson practice with due reviews, new introductions, and extra selected reviews', async () => {
    const plan = await composeSession({
      sessionId: 'session-1',
      mode: 'lesson_practice',
      dueCapabilities: [{
        capabilityId: 'capability-due',
        canonicalKeySnapshot: 'due-key',
        stateVersion: 2,
        reviewContext: {
          schedulerSnapshot: activeSnapshot,
          currentStateVersion: 2,
          artifactVersionSnapshot: {},
          capabilityReadinessStatus: 'ready',
          capabilityPublicationStatus: 'published',
        },
        renderPlan: { capabilityKey: 'due-key', sourceRef: 'lesson-4/due', exerciseType: 'meaning_recall', capabilityType: 'meaning_recall', skillType: 'meaning_recall', requiredArtifacts: [] },
      }],
      eligibleNewCapabilities: [{
        capability: { id: 'capability-new', canonicalKey: 'new-key' },
        renderPlan: { capabilityKey: 'new-key', sourceRef: 'lesson-4/new', exerciseType: 'recognition_mcq', capabilityType: 'text_recognition', skillType: 'recognition', requiredArtifacts: [] },
        activationRequest: { reason: 'eligible_new_capability' },
        reviewContext: {
          schedulerSnapshot: dormantSnapshot,
          currentStateVersion: 0,
          artifactVersionSnapshot: {},
          capabilityReadinessStatus: 'ready',
          capabilityPublicationStatus: 'published',
        },
      }],
      practiceReviewCapabilities: [{
        capabilityId: 'capability-active',
        canonicalKeySnapshot: 'active-key',
        stateVersion: 2,
        reviewContext: {
          schedulerSnapshot: activeSnapshot,
          currentStateVersion: 2,
          artifactVersionSnapshot: {},
          capabilityReadinessStatus: 'ready',
          capabilityPublicationStatus: 'published',
        },
        renderPlan: { capabilityKey: 'active-key', sourceRef: 'lesson-4/active', exerciseType: 'meaning_recall', capabilityType: 'meaning_recall', skillType: 'meaning_recall', requiredArtifacts: [] },
      }],
      limit: 5,
    })

    expect(plan.mode).toBe('lesson_practice')
    expect(plan.blocks.map(block => block.renderPlan.sourceRef)).toEqual([
      'lesson-4/due',
      'lesson-4/new',
      'lesson-4/active',
    ])
    expect(plan.blocks[1]?.pendingActivation).toBeDefined()
    expect(plan.blocks[2]?.pendingActivation).toBeUndefined()
  })
})
