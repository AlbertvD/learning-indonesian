import type { CapabilityActivationRequest } from '@/lib/reviews/capabilityReviewProcessor'
import type { ExerciseRenderPlan } from '@/lib/exercises/exerciseRenderPlan'
import type { CapabilityReviewSessionContext, SessionMode, SessionDiagnostic, SessionPlan } from '@/lib/session-builder/model'

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
  mode: SessionMode
  dueCapabilities: DueSessionCapabilityInput[]
  eligibleNewCapabilities: EligibleNewSessionCapabilityInput[]
  practiceReviewCapabilities?: DueSessionCapabilityInput[]
  diagnostics?: SessionDiagnostic[]
  limit: number
}

function diagnosticFor(failure: ResolutionFailure): SessionDiagnostic {
  return {
    severity: 'warn',
    reason: failure.reason,
    details: failure.details,
  }
}

export async function compose(input: ComposeSessionInput): Promise<SessionPlan> {
  const diagnostics: SessionDiagnostic[] = [...(input.diagnostics ?? [])]
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

  if (input.mode !== 'lesson_review') {
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
  }

  for (const review of input.practiceReviewCapabilities ?? []) {
    if (!review.renderPlan) {
      if (review.resolutionFailure) diagnostics.push(diagnosticFor(review.resolutionFailure))
      continue
    }
    blocks.push({
      id: `${input.sessionId}:lesson-review:${review.canonicalKeySnapshot}`,
      kind: 'due_review',
      renderPlan: review.renderPlan,
      capabilityId: review.capabilityId,
      canonicalKeySnapshot: review.canonicalKeySnapshot,
      stateVersion: review.stateVersion,
      reviewContext: review.reviewContext,
    })
  }

  // Interleave by source_ref (Rule B of docs/plans/2026-05-18-capability-staging-gate.md).
  // Prevents two blocks sharing a source_ref from being within
  // INTERLEAVE_WINDOW positions of each other. Greedy single-pass, left-to-right,
  // swap with the nearest later block that doesn't violate the window. Accept
  // violations at end-of-queue or when all remaining blocks share a source_ref.
  // Deterministic: same input yields same output (Karpicke 2009 expanding
  // retrieval — two retrievals within working-memory range aren't real
  // retrieval practice; intervening items are required).
  interleaveBySourceRef(blocks, INTERLEAVE_WINDOW)

  return {
    id: input.sessionId,
    mode: input.mode,
    title: 'Dagelijkse Indonesische oefening',
    blocks: blocks.slice(0, input.limit),
    recapPolicy: 'standard',
    diagnostics,
  }
}

const INTERLEAVE_WINDOW = 3

function interleaveBySourceRef(blocks: SessionPlan['blocks'], window: number): void {
  for (let i = 1; i < blocks.length; i += 1) {
    const current = blocks[i]!
    const recent = new Set<string>()
    for (let k = Math.max(0, i - window); k < i; k += 1) {
      recent.add(blocks[k]!.renderPlan.sourceRef)
    }
    if (!recent.has(current.renderPlan.sourceRef)) continue
    let swapWith = -1
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (!recent.has(blocks[j]!.renderPlan.sourceRef)) {
        swapWith = j
        break
      }
    }
    if (swapWith === -1) continue
    const tmp = blocks[i]!
    blocks[i] = blocks[swapWith]!
    blocks[swapWith] = tmp
  }
}
