import type { CapabilityActivationRequest } from '@/lib/reviews/capabilityReviewProcessor'
import type { ExerciseRenderPlan } from '@/lib/exercises/exerciseRenderPlan'
import type { CapabilityReviewSessionContext, SessionDiagnostic, SessionPlan } from '@/lib/session/sessionPlan'

interface ResolutionFailure {
  reason: string
  details: string
}

export interface DueSessionCapabilityInput {
  capabilityId: string
  canonicalKeySnapshot: string
  stateVersion: number
  renderPlan?: ExerciseRenderPlan
  reviewContext: CapabilityReviewSessionContext
  resolutionFailure?: ResolutionFailure
}

export interface EligibleNewSessionCapabilityInput {
  capability: {
    id: string
    canonicalKey: string
  }
  renderPlan?: ExerciseRenderPlan
  reviewContext: CapabilityReviewSessionContext
  resolutionFailure?: ResolutionFailure
  activationRequest: CapabilityActivationRequest
}

export interface ComposeSessionInput {
  sessionId: string
  mode: 'standard'
  dueCapabilities: DueSessionCapabilityInput[]
  eligibleNewCapabilities: EligibleNewSessionCapabilityInput[]
  limit: number
}

function diagnosticFor(failure: ResolutionFailure): SessionDiagnostic {
  return {
    severity: 'warn',
    reason: failure.reason,
    details: failure.details,
  }
}

export async function composeSession(input: ComposeSessionInput): Promise<SessionPlan> {
  const diagnostics: SessionDiagnostic[] = []
  const blocks: SessionPlan['blocks'] = []

  for (const due of input.dueCapabilities) {
    if (!due.renderPlan) {
      if (due.resolutionFailure) diagnostics.push(diagnosticFor(due.resolutionFailure))
      continue
    }
    blocks.push({
      id: `${input.sessionId}:due:${due.canonicalKeySnapshot}`,
      kind: 'due_review',
      renderPlan: due.renderPlan,
      capabilityId: due.capabilityId,
      canonicalKeySnapshot: due.canonicalKeySnapshot,
      stateVersion: due.stateVersion,
      reviewContext: due.reviewContext,
    })
  }

  for (const introduction of input.eligibleNewCapabilities) {
    if (!introduction.renderPlan) {
      if (introduction.resolutionFailure) diagnostics.push(diagnosticFor(introduction.resolutionFailure))
      continue
    }
    blocks.push({
      id: `${input.sessionId}:new:${introduction.capability.canonicalKey}`,
      kind: 'new_introduction',
      renderPlan: introduction.renderPlan,
      capabilityId: introduction.capability.id,
      canonicalKeySnapshot: introduction.capability.canonicalKey,
      reviewContext: introduction.reviewContext,
      pendingActivation: {
        capabilityId: introduction.capability.id,
        canonicalKeySnapshot: introduction.capability.canonicalKey,
        activationRequest: introduction.activationRequest,
        requiredActivationOwner: 'review_processor',
      },
    })
  }

  return {
    id: input.sessionId,
    mode: input.mode,
    title: 'Dagelijkse Indonesische oefening',
    blocks: blocks.slice(0, input.limit),
    recapPolicy: 'standard',
    diagnostics,
  }
}
