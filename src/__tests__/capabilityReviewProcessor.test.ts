import { describe, expect, it, vi } from 'vitest'
import { createCapabilityReviewService } from '@/services/capabilityReviewService'
import {
  commitCapabilityAnswerReport,
  type CapabilityAnswerReportCommand,
} from '@/lib/reviews/capabilityReviewProcessor'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

function command(overrides: Partial<CapabilityAnswerReportCommand> = {}): CapabilityAnswerReportCommand {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    sessionItemId: 'capability:item-1:meaning',
    attemptNumber: 1,
    idempotencyKey: 'session-1:capability:item-1:meaning:1',
    capabilityId: 'capability-1',
    canonicalKeySnapshot: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
    answerReport: {
      wasCorrect: true,
      hintUsed: false,
      isFuzzy: false,
      rawResponse: 'eten',
      normalizedResponse: 'eten',
      latencyMs: 1200,
    },
    schedulerSnapshot: {
      stateVersion: 2,
      activationState: 'active',
      stability: 2.4,
      difficulty: 5,
      lastReviewedAt: '2026-04-24T00:00:00.000Z',
      nextDueAt: '2026-04-25T00:00:00.000Z',
      reviewCount: 3,
      lapseCount: 0,
      consecutiveFailureCount: 0,
    },
    currentStateVersion: 2,
    artifactVersionSnapshot: { artifactFingerprint: 'artifact-v1' },
    submittedAt: '2026-04-25T12:00:00.000Z',
    capabilityReadinessStatus: 'ready',
    capabilityPublicationStatus: 'published',
    ...overrides,
  }
}

describe('capability review processor', () => {
  it('rejects stale scheduler snapshots without calling the commit service', async () => {
    const service = { commitCapabilityAnswerReport: vi.fn() }

    const result = await commitCapabilityAnswerReport(command({ currentStateVersion: 3 }), { service })

    expect(result.idempotencyStatus).toBe('rejected_stale')
    expect(result.reviewEventId).toBeNull()
    expect(service.commitCapabilityAnswerReport).not.toHaveBeenCalled()
  })

  it('rejects non-ready or unpublished capabilities before activation or review', async () => {
    const service = { commitCapabilityAnswerReport: vi.fn() }

    const result = await commitCapabilityAnswerReport(command({
      capabilityReadinessStatus: 'blocked',
      capabilityPublicationStatus: 'published',
    }), { service })

    expect(result.idempotencyStatus).toBe('rejected_invalid_outcome')
    expect(result.reviewEventId).toBeNull()
    expect(service.commitCapabilityAnswerReport).not.toHaveBeenCalled()
  })

  it.each(['suspended', 'retired'] as const)('fails closed for %s learner capability states', async (activationState) => {
    const service = { commitCapabilityAnswerReport: vi.fn() }

    const result = await commitCapabilityAnswerReport(command({
      schedulerSnapshot: {
        ...command().schedulerSnapshot,
        activationState,
      },
    }), { service })

    expect(result.idempotencyStatus).toBe('rejected_invalid_outcome')
    expect(service.commitCapabilityAnswerReport).not.toHaveBeenCalled()
  })

  it('forwards the command to the commit service when validation passes', async () => {
    const service = {
      commitCapabilityAnswerReport: vi.fn(async (forwarded: CapabilityAnswerReportCommand) => ({
        idempotencyStatus: 'committed' as const,
        reviewEventId: 'review-1',
        schedule: forwarded.schedulerSnapshot,
        masteryRefreshQueued: true,
      })),
    }

    const result = await commitCapabilityAnswerReport(command({
      schedulerSnapshot: {
        ...command().schedulerSnapshot,
        activationSource: 'admin_backfill',
      },
    }), { service })

    expect(service.commitCapabilityAnswerReport).toHaveBeenCalledTimes(1)
    expect(service.commitCapabilityAnswerReport).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      capabilityId: 'capability-1',
      idempotencyKey: 'session-1:capability:item-1:meaning:1',
      schedulerSnapshot: expect.objectContaining({
        stateVersion: 2,
        activationSource: 'admin_backfill',
      }),
    }))
    const forwardedCommand = service.commitCapabilityAnswerReport.mock.calls[0][0]
    expect(forwardedCommand).not.toHaveProperty('rating')
    expect(forwardedCommand).not.toHaveProperty('stateAfter')
    expect(result.idempotencyStatus).toBe('committed')
  })

  it('forwards activationRequest for an eligible dormant capability', async () => {
    const service = {
      commitCapabilityAnswerReport: vi.fn(async () => ({
        idempotencyStatus: 'committed' as const,
        reviewEventId: 'review-1',
        schedule: command().schedulerSnapshot,
        masteryRefreshQueued: false,
      })),
    }

    await commitCapabilityAnswerReport(command({
      schedulerSnapshot: {
        stateVersion: 0,
        activationState: 'dormant',
        reviewCount: 0,
        lapseCount: 0,
        consecutiveFailureCount: 0,
      },
      currentStateVersion: 0,
      activationRequest: { reason: 'eligible_new_capability', plannerRunId: 'planner-1' },
    }), { service })

    expect(service.commitCapabilityAnswerReport).toHaveBeenCalledWith(expect.objectContaining({
      activationRequest: expect.objectContaining({ reason: 'eligible_new_capability' }),
      schedulerSnapshot: expect.objectContaining({ activationState: 'dormant', stateVersion: 0 }),
    }))
  })

  it('returns duplicate RPC results without recomputing a second write result', async () => {
    const service = {
      commitCapabilityAnswerReport: vi.fn(async () => ({
        idempotencyStatus: 'duplicate_returned' as const,
        reviewEventId: 'review-1',
        schedule: command().schedulerSnapshot,
        masteryRefreshQueued: false,
      })),
    }

    const result = await commitCapabilityAnswerReport(command(), { service })

    expect(result.idempotencyStatus).toBe('duplicate_returned')
    expect(service.commitCapabilityAnswerReport).toHaveBeenCalledTimes(1)
  })
})

describe('capability review service', () => {
  it('commits through the trusted edge function instead of the browser RPC client', async () => {
    const invoke = vi.fn(async () => ({
      data: {
        idempotencyStatus: 'committed',
        reviewEventId: 'review-1',
        schedule: command().schedulerSnapshot,
        masteryRefreshQueued: true,
      },
      error: null,
    }))
    const service = createCapabilityReviewService({ functions: { invoke } })

    await service.commitCapabilityAnswerReport(command())

    expect(invoke).toHaveBeenCalledWith('commit-capability-answer-report', {
      body: {
        plan: expect.objectContaining({
          userId: 'user-1',
          idempotencyKey: 'session-1:capability:item-1:meaning:1',
        }),
      },
    })
    expect(invoke).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      body: expect.objectContaining({
        userId: 'user-1',
      }),
    }))
  })
})
