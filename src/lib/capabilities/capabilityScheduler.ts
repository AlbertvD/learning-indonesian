import type { Grade } from 'ts-fsrs'
import { computeNextState } from '@/lib/fsrs'
import type { CapabilityPublicationStatus, CapabilityReadinessStatus } from '@/services/capabilityService'
import type { SessionMode } from '@/lib/sessionQueue'

export interface LearnerCapabilityStateRow {
  id: string
  userId: string
  capabilityId: string
  canonicalKeySnapshot: string
  activationState: 'dormant' | 'active' | 'suspended' | 'retired'
  readinessStatus: CapabilityReadinessStatus
  publicationStatus: CapabilityPublicationStatus
  stability: number | null
  difficulty: number | null
  lastReviewedAt: string | null
  nextDueAt: string | null
  reviewCount: number
  lapseCount: number
  consecutiveFailureCount: number
  stateVersion: number
}

export interface DueCapability {
  stateId: string
  capabilityId: string
  canonicalKeySnapshot: string
  nextDueAt: string
  stateVersion: number
}

export interface DueCapabilityRequest {
  userId: string
  now: Date
  mode: SessionMode
  limit: number
}

export interface CapabilitySchedulerReadAdapter {
  listLearnerCapabilityStates(request: DueCapabilityRequest): Promise<LearnerCapabilityStateRow[]>
}

export async function getDueCapabilities(
  request: DueCapabilityRequest,
  adapter: CapabilitySchedulerReadAdapter,
): Promise<DueCapability[]> {
  const rows = await adapter.listLearnerCapabilityStates(request)
  return getDueCapabilitiesFromRows({
    now: request.now,
    limit: request.limit,
    rows,
  })
}

export function getDueCapabilitiesFromRows(input: {
  now: Date
  limit: number
  rows: LearnerCapabilityStateRow[]
}): DueCapability[] {
  return input.rows
    .filter(row => (
      row.activationState === 'active'
      && row.readinessStatus === 'ready'
      && row.publicationStatus === 'published'
      && row.nextDueAt != null
      && new Date(row.nextDueAt) <= input.now
    ))
    .sort((a, b) => new Date(a.nextDueAt!).getTime() - new Date(b.nextDueAt!).getTime())
    .slice(0, input.limit)
    .map(row => ({
      stateId: row.id,
      capabilityId: row.capabilityId,
      canonicalKeySnapshot: row.canonicalKeySnapshot,
      nextDueAt: row.nextDueAt!,
      stateVersion: row.stateVersion,
    }))
}

export interface CapabilityReviewPreview {
  state: LearnerCapabilityStateRow
  rating: Grade
  reviewedAt: Date
}

export interface SchedulePreview {
  stateBefore: LearnerCapabilityStateRow
  stateAfter: {
    stability: number
    difficulty: number
    retrievability: number | null
    nextDueAt: string
    lastReviewedAt: string
    stateVersion: number
  }
}

export function previewScheduleUpdate(input: CapabilityReviewPreview): SchedulePreview {
  const next = computeNextState(
    input.state.stability != null && input.state.difficulty != null
      ? {
          stability: input.state.stability,
          difficulty: input.state.difficulty,
          lastReviewedAt: input.state.lastReviewedAt ? new Date(input.state.lastReviewedAt) : null,
        }
      : null,
    input.rating,
    input.reviewedAt,
  )

  return {
    stateBefore: input.state,
    stateAfter: {
      stability: next.stability,
      difficulty: next.difficulty,
      retrievability: next.retrievability,
      nextDueAt: next.nextDueAt.toISOString(),
      lastReviewedAt: input.reviewedAt.toISOString(),
      stateVersion: input.state.stateVersion + 1,
    },
  }
}
