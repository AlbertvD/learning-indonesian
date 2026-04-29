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
import type { CapabilityReviewSessionContext, CapabilitySessionMode, SessionDiagnostic, SessionPlan } from '@/lib/session/sessionPlan'
import type { CapabilityScheduleSnapshot } from '@/lib/reviews/capabilityReviewProcessor'

export interface CapabilitySessionLoaderInput {
  enabled: boolean
  sessionId: string
  mode: CapabilitySessionMode
  now: Date
  limit: number
  schedulerRows: LearnerCapabilityStateRow[]
  posture?: SessionPosture
  plannerInput: Omit<PedagogyInput, 'mode' | 'now'>
  capabilitiesByKey: Map<string, ProjectedCapability>
  readinessByKey: Map<string, CapabilityReadiness>
  artifactIndex: ArtifactIndex
  selectedLessonId?: string
  selectedSourceRefs?: string[]
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
  mode: CapabilitySessionMode
  now: Date
  limit: number
  preferredSessionSize: number
  selectedLessonId?: string
  selectedSourceRefs?: string[]
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

function isLessonScopedMode(mode: CapabilitySessionMode): boolean {
  return mode === 'lesson_practice' || mode === 'lesson_review'
}

function lessonScope(input: {
  mode: CapabilitySessionMode
  selectedLessonId?: string
  selectedSourceRefs?: string[]
  plannerInput: Omit<PedagogyInput, 'mode' | 'now'>
}): { selectedLessonId?: string; selectedSourceRefs: string[]; valid: boolean } {
  const selectedLessonId = input.selectedLessonId ?? input.plannerInput.selectedLessonId
  const selectedSourceRefs = input.selectedSourceRefs ?? input.plannerInput.selectedSourceRefs ?? []
  return {
    selectedLessonId,
    selectedSourceRefs,
    valid: !isLessonScopedMode(input.mode) || (Boolean(selectedLessonId) && selectedSourceRefs.length > 0),
  }
}

function isCapabilityInScope(input: {
  mode: CapabilitySessionMode
  capability: ProjectedCapability | undefined
  selectedSourceRefs: string[]
}): boolean {
  if (!isLessonScopedMode(input.mode)) return true
  return Boolean(input.capability && input.selectedSourceRefs.includes(input.capability.sourceRef))
}

function missingLessonScopePlan(input: {
  sessionId: string
  mode: CapabilitySessionMode
  limit: number
}): Promise<SessionPlan> {
  const diagnostics: SessionDiagnostic[] = [{
    severity: 'critical',
    reason: 'missing_selected_lesson',
    details: 'Lesson practice needs a selected lesson before a session can be built.',
  }]
  return composeSession({
    sessionId: input.sessionId,
    mode: input.mode,
    dueCapabilities: [],
    eligibleNewCapabilities: [],
    diagnostics,
    limit: input.limit,
  })
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

  const scope = lessonScope(input)
  if (!scope.valid) {
    return missingLessonScopePlan({
      sessionId: input.sessionId,
      mode: input.mode,
      limit: input.limit,
    })
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
  const dueKeys = new Set(dueList.map(due => due.canonicalKeySnapshot))
  const scopedDueList = dueList.filter(due => isCapabilityInScope({
    mode: input.mode,
    capability: input.capabilitiesByKey.get(due.canonicalKeySnapshot),
    selectedSourceRefs: scope.selectedSourceRefs,
  }))

  const dueCapabilities = scopedDueList.map(due => {
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

  const activePracticeReviewCapabilities = isLessonScopedMode(input.mode)
    ? input.schedulerRows
        .filter(row => (
          row.activationState === 'active'
          && row.readinessStatus === 'ready'
          && row.publicationStatus === 'published'
          && !dueKeys.has(row.canonicalKeySnapshot)
          && (input.mode === 'lesson_practice' || row.reviewCount > 0)
          && isCapabilityInScope({
            mode: input.mode,
            capability: input.capabilitiesByKey.get(row.canonicalKeySnapshot),
            selectedSourceRefs: scope.selectedSourceRefs,
          })
        ))
        .sort((a, b) => {
          const aDue = a.nextDueAt ? new Date(a.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER
          const bDue = b.nextDueAt ? new Date(b.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER
          return aDue - bDue || b.consecutiveFailureCount - a.consecutiveFailureCount
        })
        .map(row => {
          const capability = input.capabilitiesByKey.get(row.canonicalKeySnapshot)
          const readiness = input.readinessByKey.get(row.canonicalKeySnapshot)
          const context = reviewContext({
            capability: capability ?? null,
            schedulerSnapshot: snapshotFromLearnerRow(row),
          })
          if (!capability || !readiness) {
            return {
              capabilityId: row.capabilityId,
              canonicalKeySnapshot: row.canonicalKeySnapshot,
              stateVersion: row.stateVersion,
              reviewContext: context,
              resolutionFailure: { reason: 'missing_capability_projection', details: 'Capability projection or readiness was not loaded.' },
            }
          }
          const resolution = resolveExercise({ capability, readiness, artifactIndex: input.artifactIndex })
          return resolution.status === 'resolved'
            ? {
                capabilityId: row.capabilityId,
                canonicalKeySnapshot: row.canonicalKeySnapshot,
                stateVersion: row.stateVersion,
                reviewContext: context,
                renderPlan: resolution.plan,
              }
            : {
                capabilityId: row.capabilityId,
                canonicalKeySnapshot: row.canonicalKeySnapshot,
                stateVersion: row.stateVersion,
                reviewContext: context,
                resolutionFailure: { reason: resolution.reason, details: resolution.details },
              }
        })
    : []

  const learningPlan = planLearningPath({
    ...input.plannerInput,
    mode: input.mode,
    posture: input.posture,
    now: input.now,
    dueCount: dueCapabilities.length,
    selectedLessonId: scope.selectedLessonId,
    selectedSourceRefs: scope.selectedSourceRefs,
  })
  const eligibleNewCapabilities = input.mode === 'lesson_review' ? [] : learningPlan.eligibleNewCapabilities.map(eligible => {
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
    practiceReviewCapabilities: activePracticeReviewCapabilities,
    limit: input.limit,
  })
}

export async function loadCapabilitySessionPlanForUser(input: {
  enabled: boolean
  sessionId: string
  userId: string
  mode: CapabilitySessionMode
  now: Date
  limit: number
  preferredSessionSize: number
  selectedLessonId?: string
  selectedSourceRefs?: string[]
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
    selectedLessonId: input.selectedLessonId,
    selectedSourceRefs: input.selectedSourceRefs,
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
    selectedLessonId: input.selectedLessonId,
    selectedSourceRefs: input.selectedSourceRefs,
  })
}

export type { PlannerCapability }
