import type { ArtifactIndex } from '@/lib/capabilities/artifactRegistry'
import type { CapabilityReadiness } from '@/lib/capabilities/capabilityContracts'
import {
  getDueCapabilities,
  type CapabilitySchedulerReadAdapter,
  type LearnerCapabilityStateRow,
} from '@/lib/capabilities/capabilityScheduler'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import { resolveExercise } from '@/lib/exercises/exerciseResolver'
import { planLearningPath, type PedagogyInput, type PlannerCapability } from '@/lib/pedagogy/pedagogyPlanner'
import type { SessionPosture } from '@/lib/pedagogy/sessionPosture'
import { composeSession } from '@/lib/session/sessionComposer'
import type { CapabilityReviewSessionContext, SessionPlan } from '@/lib/session/sessionPlan'
import type { CapabilityScheduleSnapshot } from '@/lib/reviews/capabilityReviewProcessor'

export interface CapabilitySessionLoaderInput {
  enabled: boolean
  sessionId: string
  mode: 'standard'
  now: Date
  limit: number
  schedulerRows: LearnerCapabilityStateRow[]
  posture?: SessionPosture
  plannerInput: Omit<PedagogyInput, 'mode' | 'now'>
  capabilitiesByKey: Map<string, ProjectedCapability>
  readinessByKey: Map<string, CapabilityReadiness>
  artifactIndex: ArtifactIndex
}

export interface CapabilitySessionDataSnapshot {
  schedulerRows: LearnerCapabilityStateRow[]
  plannerInput: Omit<PedagogyInput, 'mode' | 'now'>
  capabilitiesByKey: Map<string, ProjectedCapability>
  readinessByKey: Map<string, CapabilityReadiness>
  artifactIndex: ArtifactIndex
}

export interface CapabilitySessionDataRequest {
  userId: string
  mode: 'standard'
  now: Date
  limit: number
  preferredSessionSize: number
}

export interface CapabilitySessionDataAdapter extends CapabilitySchedulerReadAdapter {
  loadCapabilitySessionData(request: CapabilitySessionDataRequest): Promise<CapabilitySessionDataSnapshot>
}

function snapshotFromLearnerRow(row: LearnerCapabilityStateRow): CapabilityScheduleSnapshot {
  return {
    stateVersion: row.stateVersion,
    activationState: row.activationState,
    stability: row.stability,
    difficulty: row.difficulty,
    lastReviewedAt: row.lastReviewedAt,
    nextDueAt: row.nextDueAt,
    reviewCount: row.reviewCount,
    lapseCount: row.lapseCount,
    consecutiveFailureCount: row.consecutiveFailureCount,
  }
}

function dormantSnapshot(): CapabilityScheduleSnapshot {
  return {
    stateVersion: 0,
    activationState: 'dormant',
    reviewCount: 0,
    lapseCount: 0,
    consecutiveFailureCount: 0,
  }
}

function artifactVersionSnapshot(capability: ProjectedCapability | null): Record<string, unknown> {
  if (!capability) return {}
  return {
    capabilityKey: capability.canonicalKey,
    sourceRef: capability.sourceRef,
    projectionVersion: capability.projectionVersion,
    sourceFingerprint: capability.sourceFingerprint,
    artifactFingerprint: capability.artifactFingerprint,
    requiredArtifacts: capability.requiredArtifacts,
  }
}

function reviewContext(input: {
  capability: ProjectedCapability | null
  schedulerSnapshot: CapabilityScheduleSnapshot
}): CapabilityReviewSessionContext {
  return {
    schedulerSnapshot: input.schedulerSnapshot,
    currentStateVersion: input.schedulerSnapshot.stateVersion,
    artifactVersionSnapshot: artifactVersionSnapshot(input.capability),
    capabilityReadinessStatus: 'ready',
    capabilityPublicationStatus: 'published',
  }
}

export async function loadCapabilitySessionPlan(input: CapabilitySessionLoaderInput): Promise<SessionPlan> {
  if (!input.enabled) {
    throw new Error('Capability standard session is disabled')
  }

  const dueList = await getDueCapabilities({
    userId: input.plannerInput.userId,
    now: input.now,
    mode: input.mode,
    limit: input.limit,
  }, {
    listLearnerCapabilityStates: async () => input.schedulerRows,
  })

  const stateById = new Map(input.schedulerRows.map(row => [row.id, row]))
  const dueCapabilities = dueList.map(due => {
    const stateRow = stateById.get(due.stateId)
    const capability = input.capabilitiesByKey.get(due.canonicalKeySnapshot)
    const readiness = input.readinessByKey.get(due.canonicalKeySnapshot)
    const context = reviewContext({
      capability: capability ?? null,
      schedulerSnapshot: stateRow ? snapshotFromLearnerRow(stateRow) : {
        stateVersion: due.stateVersion,
        activationState: 'active',
        reviewCount: 0,
        lapseCount: 0,
        consecutiveFailureCount: 0,
      },
    })
    if (!capability || !readiness) {
      return {
        capabilityId: due.capabilityId,
        canonicalKeySnapshot: due.canonicalKeySnapshot,
        stateVersion: due.stateVersion,
        reviewContext: context,
        resolutionFailure: { reason: 'missing_capability_projection', details: 'Capability projection or readiness was not loaded.' },
      }
    }
    const resolution = resolveExercise({ capability, readiness, artifactIndex: input.artifactIndex })
    return resolution.status === 'resolved'
      ? {
          capabilityId: due.capabilityId,
          canonicalKeySnapshot: due.canonicalKeySnapshot,
          stateVersion: due.stateVersion,
          reviewContext: context,
          renderPlan: resolution.plan,
        }
      : {
          capabilityId: due.capabilityId,
          canonicalKeySnapshot: due.canonicalKeySnapshot,
          stateVersion: due.stateVersion,
          reviewContext: context,
          resolutionFailure: { reason: resolution.reason, details: resolution.details },
        }
  })

  const learningPlan = planLearningPath({
    ...input.plannerInput,
    mode: input.mode,
    posture: input.posture,
    now: input.now,
  })
  const eligibleNewCapabilities = learningPlan.eligibleNewCapabilities.map(eligible => {
    const capability = input.capabilitiesByKey.get(eligible.capability.canonicalKey)
    const readiness = input.readinessByKey.get(eligible.capability.canonicalKey)
    if (!capability || !readiness) {
      return {
        capability: { id: eligible.capability.id, canonicalKey: eligible.capability.canonicalKey },
        activationRequest: { reason: 'eligible_new_capability' as const },
        reviewContext: reviewContext({ capability: capability ?? null, schedulerSnapshot: dormantSnapshot() }),
        resolutionFailure: { reason: 'missing_capability_projection', details: 'Capability projection or readiness was not loaded.' },
      }
    }
    const context = reviewContext({ capability, schedulerSnapshot: dormantSnapshot() })
    const resolution = resolveExercise({ capability, readiness, artifactIndex: input.artifactIndex })
    return resolution.status === 'resolved'
      ? {
          capability: { id: eligible.capability.id, canonicalKey: eligible.capability.canonicalKey },
          activationRequest: { reason: 'eligible_new_capability' as const },
          reviewContext: context,
          renderPlan: resolution.plan,
        }
      : {
          capability: { id: eligible.capability.id, canonicalKey: eligible.capability.canonicalKey },
          activationRequest: { reason: 'eligible_new_capability' as const },
          reviewContext: context,
          resolutionFailure: { reason: resolution.reason, details: resolution.details },
        }
  })

  return composeSession({
    sessionId: input.sessionId,
    mode: input.mode,
    dueCapabilities,
    eligibleNewCapabilities,
    limit: input.limit,
  })
}

export async function loadCapabilitySessionPlanForUser(input: {
  enabled: boolean
  sessionId: string
  userId: string
  mode: 'standard'
  now: Date
  limit: number
  preferredSessionSize: number
  adapter: CapabilitySessionDataAdapter
}): Promise<SessionPlan> {
  if (!input.enabled) {
    throw new Error('Capability standard session is disabled')
  }

  const snapshot = await input.adapter.loadCapabilitySessionData({
    userId: input.userId,
    mode: input.mode,
    now: input.now,
    limit: input.limit,
    preferredSessionSize: input.preferredSessionSize,
  })

  return loadCapabilitySessionPlan({
    enabled: input.enabled,
    sessionId: input.sessionId,
    mode: input.mode,
    now: input.now,
    limit: input.limit,
    schedulerRows: snapshot.schedulerRows,
    plannerInput: snapshot.plannerInput,
    capabilitiesByKey: snapshot.capabilitiesByKey,
    readinessByKey: snapshot.readinessByKey,
    artifactIndex: snapshot.artifactIndex,
  })
}

export type { PlannerCapability }
