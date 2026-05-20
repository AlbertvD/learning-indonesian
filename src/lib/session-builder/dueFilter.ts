import type { CapabilityPublicationStatus, CapabilityReadinessStatus } from '@/services/capabilityService'
import type { SessionMode } from './model'

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

