import { describe, expect, it, vi } from 'vitest'
import { createCapabilityReviewService } from '@/services/capabilityReviewService'
import {
  commitCapabilityAnswerReport,
  planCapabilityReviewCommit,
  type CapabilityAnswerReportCommand,
} from '@/lib/reviews/capabilityReviewProcessor'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn() },
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

  it('rejects caller-provided outcomes unless an approved adapter validated them', () => {
    expect(() => planCapabilityReviewCommit(command({
      precomputedOutcome: {
        rating: 3,
        wasCorrect: true,
        validatedBy: 'unapproved-adapter',
        adapterValidated: false,
      },
    }))).toThrow('Precomputed outcomes must be validated')
  })

  it('computes stateAfter with a state version increment and commits through the service', async () => {
    const service = {
      commitCapabilityAnswerReport: vi.fn(async (commitPlan) => ({
        idempotencyStatus: 'committed' as const,
        reviewEventId: 'review-1',
        schedule: commitPlan.stateAfter,
        masteryRefreshQueued: true,
      })),
    }

    const result = await commitCapabilityAnswerReport(command(), { service })

    expect(service.commitCapabilityAnswerReport).toHaveBeenCalledWith(expect.objectContaining({
      rating: 3,
      stateBefore: expect.objectContaining({ stateVersion: 2 }),
      stateAfter: expect.objectContaining({
        stateVersion: 3,
        reviewCount: 4,
        activationState: 'active',
      }),
    }))
    expect(result.idempotencyStatus).toBe('committed')
  })

  it('uses submittedAt as the review time for both lastReviewedAt and nextDueAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))

    try {
      const plan = planCapabilityReviewCommit(command({
        submittedAt: '2026-04-25T12:00:00.000Z',
      }))

      expect(plan.stateAfter.lastReviewedAt).toBe('2026-04-25T12:00:00.000Z')
      expect(plan.stateAfter.nextDueAt?.startsWith('2026-')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('plans first-review activation for an eligible dormant capability', () => {
    const plan = planCapabilityReviewCommit(command({
      schedulerSnapshot: {
        stateVersion: 0,
        activationState: 'dormant',
        reviewCount: 0,
        lapseCount: 0,
        consecutiveFailureCount: 0,
      },
      currentStateVersion: 0,
      activationRequest: {
        reason: 'eligible_new_capability',
        plannerRunId: 'planner-1',
      },
    }))

    expect(plan.stateAfter.activationState).toBe('active')
    expect(plan.stateAfter.activationSource).toBe('review_processor')
    expect(plan.activationRequest?.reason).toBe('eligible_new_capability')
  })

  it('preserves existing activation provenance on normal reviews', () => {
    const plan = planCapabilityReviewCommit(command({
      schedulerSnapshot: {
        ...command().schedulerSnapshot,
        activationSource: 'admin_backfill',
      },
    }))

    expect(plan.stateAfter.activationSource).toBe('admin_backfill')
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
  it('calls the schema-qualified commit RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        idempotencyStatus: 'committed',
        reviewEventId: 'review-1',
        schedule: command().schedulerSnapshot,
        masteryRefreshQueued: true,
      },
      error: null,
    }))
    const schema = vi.fn(() => ({ rpc }))
    const service = createCapabilityReviewService({ schema })

    await service.commitCapabilityAnswerReport(planCapabilityReviewCommit(command()))

    expect(schema).toHaveBeenCalledWith('indonesian')
    expect(rpc).toHaveBeenCalledWith('commit_capability_answer_report', {
      p_command: expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: 'session-1:capability:item-1:meaning:1',
      }),
    })
  })
})
