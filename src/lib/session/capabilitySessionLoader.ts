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
import { composeSession } from '@/lib/session/sessionComposer'
import type { SessionPlan } from '@/lib/session/sessionPlan'

export interface CapabilitySessionLoaderInput {
  enabled: boolean
  sessionId: string
  mode: 'standard'
  now: Date
  limit: number
  schedulerRows: LearnerCapabilityStateRow[]
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

  const dueCapabilities = dueList.map(due => {
    const capability = input.capabilitiesByKey.get(due.canonicalKeySnapshot)
    const readiness = input.readinessByKey.get(due.canonicalKeySnapshot)
    if (!capability || !readiness) {
      return {
        capabilityId: due.capabilityId,
        canonicalKeySnapshot: due.canonicalKeySnapshot,
        stateVersion: due.stateVersion,
        resolutionFailure: { reason: 'missing_capability_projection', details: 'Capability projection or readiness was not loaded.' },
      }
    }
    const resolution = resolveExercise({ capability, readiness, artifactIndex: input.artifactIndex })
    return resolution.status === 'resolved'
      ? {
          capabilityId: due.capabilityId,
          canonicalKeySnapshot: due.canonicalKeySnapshot,
          stateVersion: due.stateVersion,
          renderPlan: resolution.plan,
        }
      : {
          capabilityId: due.capabilityId,
          canonicalKeySnapshot: due.canonicalKeySnapshot,
          stateVersion: due.stateVersion,
          resolutionFailure: { reason: resolution.reason, details: resolution.details },
        }
  })

  const learningPlan = planLearningPath({
    ...input.plannerInput,
    mode: input.mode,
    now: input.now,
  })
  const eligibleNewCapabilities = learningPlan.eligibleNewCapabilities.map(eligible => {
    const capability = input.capabilitiesByKey.get(eligible.capability.canonicalKey)
    const readiness = input.readinessByKey.get(eligible.capability.canonicalKey)
    if (!capability || !readiness) {
      return {
        capability: { id: eligible.capability.id, canonicalKey: eligible.capability.canonicalKey },
        activationRequest: { reason: 'eligible_new_capability' as const },
        resolutionFailure: { reason: 'missing_capability_projection', details: 'Capability projection or readiness was not loaded.' },
      }
    }
    const resolution = resolveExercise({ capability, readiness, artifactIndex: input.artifactIndex })
    return resolution.status === 'resolved'
      ? {
          capability: { id: eligible.capability.id, canonicalKey: eligible.capability.canonicalKey },
          activationRequest: { reason: 'eligible_new_capability' as const },
          renderPlan: resolution.plan,
        }
      : {
          capability: { id: eligible.capability.id, canonicalKey: eligible.capability.canonicalKey },
          activationRequest: { reason: 'eligible_new_capability' as const },
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
