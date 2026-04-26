import type { CapabilitySourceProgressRequirement } from '@/lib/capabilities/capabilityTypes'
import type { SourceProgressEventType, SourceProgressStateValue } from '@/services/sourceProgressService'

export interface LearnerSourceProgress {
  sourceRef: string
  sourceSectionRef: string
  currentState: SourceProgressStateValue
  completedEventTypes: SourceProgressEventType[]
}

export interface ReviewEvidence {
  capabilityKey: string
  sourceRef: string
  skillType: string
  successfulReviews: number
}

export type SourceProgressGateReason =
  | 'no_source_progress_required'
  | 'satisfied_by_source_progress'
  | 'satisfied_by_evidence'
  | 'missing_source_progress'

export interface SourceProgressGateResult {
  satisfied: boolean
  reason: SourceProgressGateReason
}

const statesSatisfyingRequirement: Record<SourceProgressEventType, SourceProgressStateValue[]> = {
  opened: ['opened', 'section_exposed', 'intro_completed', 'heard_once', 'pattern_noticing_seen', 'guided_practice_completed', 'lesson_completed'],
  section_exposed: ['section_exposed', 'intro_completed', 'guided_practice_completed', 'lesson_completed'],
  intro_completed: ['intro_completed', 'guided_practice_completed', 'lesson_completed'],
  heard_once: ['heard_once', 'lesson_completed'],
  pattern_noticing_seen: ['pattern_noticing_seen', 'guided_practice_completed', 'lesson_completed'],
  guided_practice_completed: ['guided_practice_completed', 'lesson_completed'],
  lesson_completed: ['lesson_completed'],
}

function satisfiesRequiredState(progress: LearnerSourceProgress, requiredState: SourceProgressEventType): boolean {
  const satisfyingStates = statesSatisfyingRequirement[requiredState]
  return (
    satisfyingStates.includes(progress.currentState)
    || progress.completedEventTypes.some(eventType => satisfyingStates.includes(eventType))
  )
}

export function isSourceProgressSatisfied(input: {
  requiredSourceProgress?: CapabilitySourceProgressRequirement
  sourceProgress: LearnerSourceProgress[]
  evidence: ReviewEvidence[]
  allowEvidenceBypass?: boolean
}): SourceProgressGateResult {
  const required = input.requiredSourceProgress
  if (!required || required.kind === 'none') {
    return { satisfied: true, reason: 'no_source_progress_required' }
  }

  const progress = input.sourceProgress.find(row => (
    row.sourceRef === required.sourceRef
    || `${row.sourceRef}/${row.sourceSectionRef}` === required.sourceRef
  ))
  if (progress && satisfiesRequiredState(progress, required.requiredState)) {
    return { satisfied: true, reason: 'satisfied_by_source_progress' }
  }

  if (input.allowEvidenceBypass && input.evidence.some(evidence => (
    evidence.sourceRef === required.sourceRef
    && evidence.skillType === 'recognition'
    && evidence.successfulReviews > 0
  ))) {
    return { satisfied: true, reason: 'satisfied_by_evidence' }
  }

  return { satisfied: false, reason: 'missing_source_progress' }
}
