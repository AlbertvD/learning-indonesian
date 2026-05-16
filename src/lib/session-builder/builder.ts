import type { ArtifactIndex } from '@/lib/capabilities/artifactRegistry'
import type { CapabilityReadiness } from '@/lib/capabilities/capabilityContracts'
import {
  getDueCapabilities,
  type CapabilitySchedulerReadAdapter,
  type LearnerCapabilityStateRow,
} from '@/lib/capabilities/capabilityScheduler'
import type { ProjectedCapability } from '@/lib/capabilities/capabilityTypes'
import { resolveExercise } from '@/lib/exercises/exerciseResolver'
import { planLearningPath, type PedagogyInput, type PlannerCapability } from '@/lib/session-builder/pedagogy'
import { compose } from '@/lib/session-builder/compose'
import { buildQueueDryingDiagnostic } from '@/lib/session-builder/drying'
import type { CapabilityReviewSessionContext, SessionMode, SessionDiagnostic, SessionPlan } from '@/lib/session-builder/model'
import type { CapabilityScheduleSnapshot } from '@/lib/reviews/capabilityReviewProcessor'

export interface CapabilitySessionLoaderInput {
  enabled: boolean
  sessionId: string
  mode: SessionMode
  now: Date
  limit: number
  schedulerRows: LearnerCapabilityStateRow[]
  plannerInput: Omit<PedagogyInput, 'mode' | 'now'>
  capabilitiesByKey: Map<string, ProjectedCapability>
  readinessByKey: Map<string, CapabilityReadiness>
  artifactIndex: ArtifactIndex
  selectedLessonId?: string
  selectedSourceRefs?: string[]
  // Lesson-activation derivations fed to the queue-drying detector. Both
  // default to null/false when the learner has no activations or has reached
  // the final lesson — drying then stays suppressed by the detector's own
  // rules. See drying.ts and the fold plan §4.1.
  currentLessonId?: string | null
  nextLessonNeedsExposure?: boolean
}

export interface CapabilitySessionDataSnapshot {
  schedulerRows: LearnerCapabilityStateRow[]
  plannerInput: Omit<PedagogyInput, 'mode' | 'now'>
  capabilitiesByKey: Map<string, ProjectedCapability>
  readinessByKey: Map<string, CapabilityReadiness>
  artifactIndex: ArtifactIndex
  currentLessonId: string | null
  nextLessonNeedsExposure: boolean
}

export interface CapabilitySessionDataRequest {
  userId: string
  mode: SessionMode
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

function isLessonScopedMode(mode: SessionMode): boolean {
  return mode === 'lesson_practice' || mode === 'lesson_review'
}

function lessonScope(input: {
  mode: SessionMode
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
  mode: SessionMode
  capability: ProjectedCapability | undefined
  selectedSourceRefs: string[]
}): boolean {
  if (!isLessonScopedMode(input.mode)) return true
  return Boolean(input.capability && input.selectedSourceRefs.includes(input.capability.sourceRef))
}

function missingLessonScopePlan(input: {
  sessionId: string
  mode: SessionMode
  limit: number
}): Promise<SessionPlan> {
  const diagnostics: SessionDiagnostic[] = [{
    severity: 'critical',
    reason: 'missing_selected_lesson',
    details: 'Lesson practice needs a selected lesson before a session can be built.',
  }]
  return compose({
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

interface CandidateBase {
  canonicalKey: string
  context: CapabilityReviewSessionContext
}

interface ResolvedCandidate<T> {
  meta: T
  renderPlan: import('@/lib/exercises/exerciseRenderPlan').ExerciseRenderPlan
  reviewContext: CapabilityReviewSessionContext
}

interface FailedCandidate<T> {
  meta: T
  resolutionFailure: { reason: string; details: string }
  reviewContext: CapabilityReviewSessionContext
}

type CandidateOutcome<T> = ResolvedCandidate<T> | FailedCandidate<T>

function resolveCandidate<T extends CandidateBase>(
  meta: T,
  ctx: {
    capabilitiesByKey: Map<string, ProjectedCapability>
    readinessByKey: Map<string, CapabilityReadiness>
    artifactIndex: ArtifactIndex
  },
): CandidateOutcome<T> {
  const capability = ctx.capabilitiesByKey.get(meta.canonicalKey)
  const readiness = ctx.readinessByKey.get(meta.canonicalKey)
  if (!capability || !readiness) {
    return {
      meta,
      reviewContext: meta.context,
      resolutionFailure: {
        reason: 'missing_capability_projection',
        details: 'Capability projection or readiness was not loaded.',
      },
    }
  }
  const resolution = resolveExercise({ capability, readiness, artifactIndex: ctx.artifactIndex })
  if (resolution.status === 'resolved') {
    return { meta, reviewContext: meta.context, renderPlan: resolution.plan }
  }
  return {
    meta,
    reviewContext: meta.context,
    resolutionFailure: { reason: resolution.reason, details: resolution.details },
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

  const resolveCtx = {
    capabilitiesByKey: input.capabilitiesByKey,
    readinessByKey: input.readinessByKey,
    artifactIndex: input.artifactIndex,
  }

  const dueCapabilities = scopedDueList.map(due => {
    const stateRow = stateById.get(due.stateId)
    const capability = input.capabilitiesByKey.get(due.canonicalKeySnapshot)
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
    const outcome = resolveCandidate({
      capabilityId: due.capabilityId,
      canonicalKey: due.canonicalKeySnapshot,
      stateVersion: due.stateVersion,
      context,
    }, resolveCtx)
    return {
      capabilityId: outcome.meta.capabilityId,
      canonicalKeySnapshot: outcome.meta.canonicalKey,
      stateVersion: outcome.meta.stateVersion,
      reviewContext: outcome.reviewContext,
      ...('renderPlan' in outcome ? { renderPlan: outcome.renderPlan } : { resolutionFailure: outcome.resolutionFailure }),
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
          const context = reviewContext({
            capability: capability ?? null,
            schedulerSnapshot: snapshotFromLearnerRow(row),
          })
          const outcome = resolveCandidate({
            capabilityId: row.capabilityId,
            canonicalKey: row.canonicalKeySnapshot,
            stateVersion: row.stateVersion,
            context,
          }, resolveCtx)
          return {
            capabilityId: outcome.meta.capabilityId,
            canonicalKeySnapshot: outcome.meta.canonicalKey,
            stateVersion: outcome.meta.stateVersion,
            reviewContext: outcome.reviewContext,
            ...('renderPlan' in outcome ? { renderPlan: outcome.renderPlan } : { resolutionFailure: outcome.resolutionFailure }),
          }
        })
    : []

  const learningPlan = planLearningPath({
    ...input.plannerInput,
    mode: input.mode,
    now: input.now,
    dueCount: dueCapabilities.length,
    selectedLessonId: scope.selectedLessonId,
    selectedSourceRefs: scope.selectedSourceRefs,
  })
  const eligibleNewCapabilities = input.mode === 'lesson_review' ? [] : learningPlan.eligibleNewCapabilities.map(eligible => {
    const capability = input.capabilitiesByKey.get(eligible.capability.canonicalKey)
    const context = reviewContext({ capability: capability ?? null, schedulerSnapshot: dormantSnapshot() })
    const outcome = resolveCandidate({
      capabilityId: eligible.capability.id,
      canonicalKey: eligible.capability.canonicalKey,
      context,
    }, resolveCtx)
    const base = {
      capability: { id: outcome.meta.capabilityId, canonicalKey: outcome.meta.canonicalKey },
      activationRequest: { reason: 'eligible_new_capability' as const },
      reviewContext: outcome.reviewContext,
    }
    return 'renderPlan' in outcome
      ? { ...base, renderPlan: outcome.renderPlan }
      : { ...base, resolutionFailure: outcome.resolutionFailure }
  })

  const extraDiagnostics: SessionDiagnostic[] = []
  // Compute eligibility precisely from the planner output rather than a
  // cheaper adapter approximation: an "eligible introduction" for the
  // current lesson is a capability the planner is willing to surface, not
  // just one that exists. See plan §4.1 Part 2 ("Use option 2").
  const currentLessonId = input.currentLessonId ?? null
  const currentLessonHasEligibleIntroductions = currentLessonId != null
    && learningPlan.eligibleNewCapabilities.some(eligible => (
      eligible.capability.lessonId === currentLessonId
    ))
  const dryingDiagnostic = buildQueueDryingDiagnostic({
    dueCount: dueCapabilities.length,
    preferredSessionSize: input.plannerInput.preferredSessionSize,
    goodCandidateCount: dueCapabilities.length + eligibleNewCapabilities.length,
    currentLessonHasEligibleIntroductions,
    nextLessonNeedsExposure: input.nextLessonNeedsExposure ?? false,
    mode: input.mode,
  })
  if (dryingDiagnostic) extraDiagnostics.push(dryingDiagnostic)

  return compose({
    sessionId: input.sessionId,
    mode: input.mode,
    dueCapabilities,
    eligibleNewCapabilities,
    practiceReviewCapabilities: activePracticeReviewCapabilities,
    diagnostics: extraDiagnostics,
    limit: input.limit,
  })
}

export async function buildSession(input: {
  enabled: boolean
  sessionId: string
  userId: string
  mode: SessionMode
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
    currentLessonId: snapshot.currentLessonId,
    nextLessonNeedsExposure: snapshot.nextLessonNeedsExposure,
  })
}

// Internal export for tests to exercise the resolver loop directly.
export { resolveCandidate }
export type { CandidateOutcome }
export type { PlannerCapability }
