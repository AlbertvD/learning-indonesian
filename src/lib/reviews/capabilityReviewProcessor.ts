import { Rating } from 'ts-fsrs'
import { computeNextState, inferRating } from '@/lib/fsrs'
import type { CapabilityReadinessStatus, CapabilityPublicationStatus } from '@/services/capabilityService'

export interface AnswerReport {
  wasCorrect: boolean
  hintUsed: boolean
  isFuzzy: boolean
  rawResponse: string | null
  normalizedResponse: string | null
  latencyMs: number | null
}

export interface ValidatedReviewOutcome {
  rating: 1 | 2 | 3 | 4
  wasCorrect: boolean
  validatedBy: string
  adapterValidated: boolean
}

export interface CapabilityScheduleSnapshot {
  stateVersion: number
  activationState: 'dormant' | 'active' | 'suspended' | 'retired'
  activationSource?: 'review_processor' | 'admin_backfill' | 'legacy_migration'
  stability?: number | null
  difficulty?: number | null
  retrievability?: number | null
  lastReviewedAt?: string | null
  nextDueAt?: string | null
  reviewCount: number
  lapseCount: number
  consecutiveFailureCount: number
}

export interface CapabilityActivationRequest {
  reason: 'eligible_new_capability' | 'intro_completion_review'
  plannerRunId?: string
  sourceProgressSnapshot?: Record<string, unknown>
}

export interface CapabilityAnswerReportCommand {
  userId: string
  sessionId: string
  sessionItemId: string
  attemptNumber: number
  idempotencyKey: string
  capabilityId: string
  canonicalKeySnapshot: string
  answerReport: AnswerReport
  precomputedOutcome?: ValidatedReviewOutcome
  schedulerSnapshot: CapabilityScheduleSnapshot
  currentStateVersion?: number
  artifactVersionSnapshot: Record<string, unknown>
  activationRequest?: CapabilityActivationRequest
  submittedAt: string
  capabilityReadinessStatus?: CapabilityReadinessStatus
  capabilityPublicationStatus?: CapabilityPublicationStatus
}

export interface CapabilityReviewCommitPlan extends CapabilityAnswerReportCommand {
  rating: 1 | 2 | 3 | 4
  stateBefore: CapabilityScheduleSnapshot
  stateAfter: CapabilityScheduleSnapshot
  fsrsAlgorithmVersion: 'ts-fsrs:language-learning-v1'
}

export interface CapabilityReviewCommitResult {
  idempotencyStatus: 'committed' | 'duplicate_returned' | 'rejected_stale' | 'rejected_invalid_outcome'
  reviewEventId: string | null
  activatedCapabilityStateId?: string
  schedule: CapabilityScheduleSnapshot
  masteryRefreshQueued: boolean
}

interface CapabilityReviewProcessorDeps {
  service: {
    commitCapabilityAnswerReport(plan: CapabilityReviewCommitPlan): Promise<CapabilityReviewCommitResult>
  }
}

class StaleSchedulerSnapshotError extends Error {
  constructor() {
    super('Scheduler snapshot is stale')
  }
}

class InvalidReviewOutcomeError extends Error {}

function ensureCapabilityCanBeReviewed(command: CapabilityAnswerReportCommand): void {
  if (
    command.capabilityReadinessStatus
    && command.capabilityReadinessStatus !== 'ready'
  ) {
    throw new InvalidReviewOutcomeError('Capability is not ready for review')
  }
  if (
    command.capabilityPublicationStatus
    && command.capabilityPublicationStatus !== 'published'
  ) {
    throw new InvalidReviewOutcomeError('Capability is not published for review')
  }
  if (
    command.schedulerSnapshot.activationState === 'dormant'
    && !command.activationRequest
  ) {
    throw new InvalidReviewOutcomeError('Dormant capabilities require an activation request')
  }
  if (
    command.schedulerSnapshot.activationState === 'suspended'
    || command.schedulerSnapshot.activationState === 'retired'
  ) {
    throw new InvalidReviewOutcomeError('Suspended or retired capabilities cannot be reviewed')
  }
}

function resolveOutcome(command: CapabilityAnswerReportCommand): ValidatedReviewOutcome {
  if (command.precomputedOutcome) {
    if (!command.precomputedOutcome.adapterValidated) {
      throw new InvalidReviewOutcomeError('Precomputed outcomes must be validated by an approved scoring adapter')
    }
    return command.precomputedOutcome
  }

  const rating = inferRating(command.answerReport)
  return {
    rating: rating as 1 | 2 | 3 | 4,
    wasCorrect: command.answerReport.wasCorrect,
    validatedBy: 'capability-review-processor',
    adapterValidated: true,
  }
}

function currentFsrsState(snapshot: CapabilityScheduleSnapshot) {
  if (snapshot.activationState === 'dormant' || snapshot.stability == null || snapshot.difficulty == null) {
    return null
  }

  return {
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    lastReviewedAt: snapshot.lastReviewedAt ? new Date(snapshot.lastReviewedAt) : null,
  }
}

export function planCapabilityReviewCommit(command: CapabilityAnswerReportCommand): CapabilityReviewCommitPlan {
  if (
    command.currentStateVersion != null
    && command.currentStateVersion !== command.schedulerSnapshot.stateVersion
  ) {
    throw new StaleSchedulerSnapshotError()
  }

  ensureCapabilityCanBeReviewed(command)
  const outcome = resolveOutcome(command)
  const reviewedAt = new Date(command.submittedAt)
  const nextFsrs = computeNextState(currentFsrsState(command.schedulerSnapshot), outcome.rating, reviewedAt)
  const isFailure = outcome.rating === Rating.Again

  return {
    ...command,
    rating: outcome.rating,
    stateBefore: command.schedulerSnapshot,
    stateAfter: {
      stateVersion: command.schedulerSnapshot.stateVersion + 1,
      activationState: 'active',
      activationSource: command.schedulerSnapshot.activationState === 'dormant'
        ? 'review_processor'
        : command.schedulerSnapshot.activationSource,
      stability: nextFsrs.stability,
      difficulty: nextFsrs.difficulty,
      retrievability: nextFsrs.retrievability,
      lastReviewedAt: command.submittedAt,
      nextDueAt: nextFsrs.nextDueAt.toISOString(),
      reviewCount: command.schedulerSnapshot.reviewCount + 1,
      lapseCount: command.schedulerSnapshot.lapseCount + (isFailure && command.schedulerSnapshot.reviewCount > 0 ? 1 : 0),
      consecutiveFailureCount: isFailure ? command.schedulerSnapshot.consecutiveFailureCount + 1 : 0,
    },
    fsrsAlgorithmVersion: 'ts-fsrs:language-learning-v1',
  }
}

export async function commitCapabilityAnswerReport(
  command: CapabilityAnswerReportCommand,
  deps: CapabilityReviewProcessorDeps,
): Promise<CapabilityReviewCommitResult> {
  try {
    const plan = planCapabilityReviewCommit(command)
    return await deps.service.commitCapabilityAnswerReport(plan)
  } catch (error) {
    if (error instanceof StaleSchedulerSnapshotError) {
      return {
        idempotencyStatus: 'rejected_stale',
        reviewEventId: null,
        schedule: command.schedulerSnapshot,
        masteryRefreshQueued: false,
      }
    }
    if (error instanceof InvalidReviewOutcomeError) {
      return {
        idempotencyStatus: 'rejected_invalid_outcome',
        reviewEventId: null,
        schedule: command.schedulerSnapshot,
        masteryRefreshQueued: false,
      }
    }
    throw error
  }
}
