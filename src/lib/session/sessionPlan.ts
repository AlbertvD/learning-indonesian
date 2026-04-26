import type { CapabilityActivationRequest, CapabilityScheduleSnapshot } from '@/lib/reviews/capabilityReviewProcessor'
import type { ExerciseRenderPlan } from '@/lib/exercises/exerciseRenderPlan'
import type { CapabilityPublicationStatus, CapabilityReadinessStatus } from '@/services/capabilityService'

export interface PendingActivationSessionItem {
  capabilityId: string
  canonicalKeySnapshot: string
  activationRequest: CapabilityActivationRequest
  requiredActivationOwner: 'review_processor'
}

export interface CapabilityReviewSessionContext {
  schedulerSnapshot: CapabilityScheduleSnapshot
  currentStateVersion: number
  artifactVersionSnapshot: Record<string, unknown>
  capabilityReadinessStatus: CapabilityReadinessStatus
  capabilityPublicationStatus: CapabilityPublicationStatus
}

export interface SessionBlock {
  id: string
  kind: 'due_review' | 'new_introduction'
  renderPlan: ExerciseRenderPlan
  capabilityId: string
  canonicalKeySnapshot: string
  stateVersion?: number
  reviewContext: CapabilityReviewSessionContext
  pendingActivation?: PendingActivationSessionItem
}

export interface SessionDiagnostic {
  severity: 'warn' | 'critical'
  reason: string
  details: string
}

export interface SessionPlan {
  id: string
  mode: 'standard'
  title: string
  blocks: SessionBlock[]
  recapPolicy: 'standard'
  diagnostics: SessionDiagnostic[]
}
