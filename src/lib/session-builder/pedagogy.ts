import type {
  CapabilitySourceKind,
  CapabilityType,
} from '@/lib/capabilities/capabilityTypes'
import type { SkillType } from '@/types/learning'
import { decideLoadBudget, type LoadBudgetDecision } from '@/lib/session-builder/loadBudget'
import type { SessionMode } from '@/lib/session-builder/model'
import type { CapabilityPublicationStatus, CapabilityReadinessStatus } from '@/services/capabilityService'

export interface PlannerCapability {
  id: string
  canonicalKey: string
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  skillType: SkillType
  readinessStatus: CapabilityReadinessStatus
  publicationStatus: CapabilityPublicationStatus
  prerequisiteKeys: string[]
  // NULL = capability is not lesson-scoped (podcast, cross-lesson). Otherwise
  // gated by `activatedLessons` in PedagogyInput.
  lessonId?: string | null
  difficultyLevel?: number
  goalTags?: string[]
}

export interface PlannerLearnerCapabilityState {
  canonicalKey: string
  activationState: 'dormant' | 'active' | 'suspended' | 'retired'
  reviewCount: number
  successfulReviewCount: number
}

export type PlannerReason =
  | 'eligible_new_capability'
  | 'capability_not_ready'
  | 'capability_not_published'
  | 'already_active_or_retired'
  | 'lesson_not_activated'
  | 'missing_prerequisite'
  | 'recent_failure_fatigue'
  | 'wrong_session_mode'
  | 'load_budget_exhausted'

export interface EligibleCapability {
  capability: PlannerCapability
  activationRecommendation: {
    recommended: true
    reason: PlannerReason
    requiredActivationOwner: 'review_processor'
  }
}

export interface SuppressedCapability {
  canonicalKey: string
  reason: PlannerReason
}

export interface LearningPlan {
  eligibleNewCapabilities: EligibleCapability[]
  suppressedCapabilities: SuppressedCapability[]
  loadBudget: LoadBudgetDecision
  reasons: PlannerReason[]
}

export interface PedagogyInput {
  userId: string
  mode: SessionMode
  now: Date
  preferredSessionSize: number
  dueCount: number
  readyCapabilities: PlannerCapability[]
  learnerCapabilityStates: readonly PlannerLearnerCapabilityState[]
  // Set of lesson_ids the learner has activated. Replaces the source-progress
  // gate retired in #6. A capability with non-null lessonId is suppressed
  // unless its lessonId is in this set. Cross-lesson capabilities (lessonId
  // null) bypass the gate.
  activatedLessons: ReadonlySet<string>
  recentFailures?: Array<{
    canonicalKey: string
    failedAt: string
    consecutiveFailures: number
  }>
  selectedLessonId?: string
  selectedSourceRefs?: string[]
}

function isPattern(capability: PlannerCapability): boolean {
  return (
    capability.sourceKind === 'pattern'
    || capability.sourceKind === 'affixed_form_pair'
    || capability.capabilityType.includes('pattern')
    || capability.capabilityType.startsWith('root_derived_')
  )
}

function isNewProductionTask(capability: PlannerCapability): boolean {
  return (
    capability.capabilityType === 'form_recall'
    || capability.capabilityType === 'dictation'
    || capability.capabilityType === 'contextual_cloze'
    || capability.capabilityType === 'root_derived_recall'
  )
}

function isHiddenAudioTask(capability: PlannerCapability): boolean {
  return (
    capability.capabilityType === 'audio_recognition'
    || capability.capabilityType === 'dictation'
    || capability.capabilityType === 'podcast_gist'
  )
}

function hasRecentFailureFatigue(input: {
  capability: PlannerCapability
  now: Date
  recentFailures?: PedagogyInput['recentFailures']
}): boolean {
  const failures = input.recentFailures ?? []
  const recentWindowMs = 60 * 60 * 1000
  return failures.some(failure => (
    failure.canonicalKey === input.capability.canonicalKey
    && failure.consecutiveFailures >= 2
    && input.now.getTime() - new Date(failure.failedAt).getTime() <= recentWindowMs
  ))
}

function isAllowedInSessionMode(capability: PlannerCapability): boolean {
  // podcast_phrase capabilities have no live session mode today; the only
  // mode that admitted them was the unwired 'podcast' mode (retired with the
  // posture system). Suppress them everywhere until a podcast surface ships.
  return capability.sourceKind !== 'podcast_phrase'
}

function isLessonScopedMode(mode: SessionMode): boolean {
  return mode === 'lesson_practice' || mode === 'lesson_review'
}

function isInSelectedLessonScope(input: {
  capability: PlannerCapability
  selectedLessonId?: string
  selectedSourceRefs?: string[]
}): boolean {
  return Boolean(input.selectedLessonId)
    && Boolean(input.selectedSourceRefs?.length)
    && input.selectedSourceRefs!.includes(input.capability.sourceRef)
}

export function planLearningPath(input: PedagogyInput): LearningPlan {
  const loadBudget = decideLoadBudget({
    mode: input.mode,
    preferredSessionSize: input.preferredSessionSize,
    dueCount: input.dueCount,
  })
  const stateByKey = new Map(input.learnerCapabilityStates.map(state => [state.canonicalKey, state]))
  const satisfiedKeys = new Set(input.learnerCapabilityStates
    .filter(state => state.activationState === 'active' && state.successfulReviewCount > 0)
    .map(state => state.canonicalKey))
  const eligibleNewCapabilities: EligibleCapability[] = []
  const suppressedCapabilities: SuppressedCapability[] = []
  let patternCount = 0
  let productionTaskCount = 0
  let hiddenAudioTaskCount = 0

  for (const capability of input.readyCapabilities) {
    const suppress = (reason: PlannerReason): void => {
      suppressedCapabilities.push({ canonicalKey: capability.canonicalKey, reason })
    }

    if (capability.readinessStatus !== 'ready') {
      suppress('capability_not_ready')
      continue
    }
    if (capability.publicationStatus !== 'published') {
      suppress('capability_not_published')
      continue
    }
    if (
      isLessonScopedMode(input.mode)
      && !isInSelectedLessonScope({
        capability,
        selectedLessonId: input.selectedLessonId,
        selectedSourceRefs: input.selectedSourceRefs,
      })
    ) {
      suppress('wrong_session_mode')
      continue
    }
    const state = stateByKey.get(capability.canonicalKey)
    if (state && state.activationState !== 'dormant') {
      suppress('already_active_or_retired')
      continue
    }
    if (capability.prerequisiteKeys.some(key => !satisfiedKeys.has(key))) {
      suppress('missing_prerequisite')
      continue
    }
    if (hasRecentFailureFatigue({ capability, now: input.now, recentFailures: input.recentFailures })) {
      suppress('recent_failure_fatigue')
      continue
    }
    if (!isAllowedInSessionMode(capability)) {
      suppress('wrong_session_mode')
      continue
    }
    // Lesson-activation gate (replaces source-progress gate, retirement #6).
    // Cross-lesson capabilities (null lessonId) bypass; podcast capabilities
    // never set lessonId either, so the mode gate above handles them.
    if (capability.lessonId != null && !input.activatedLessons.has(capability.lessonId)) {
      suppress('lesson_not_activated')
      continue
    }
    if (!loadBudget.allowNewCapabilities || eligibleNewCapabilities.length >= loadBudget.maxNewCapabilities) {
      suppress('load_budget_exhausted')
      continue
    }
    if (isPattern(capability) && patternCount >= loadBudget.maxNewPatterns) {
      suppress('load_budget_exhausted')
      continue
    }
    if (isNewProductionTask(capability) && productionTaskCount >= loadBudget.maxNewProductionTasks) {
      suppress('load_budget_exhausted')
      continue
    }
    if (isHiddenAudioTask(capability) && hiddenAudioTaskCount >= loadBudget.maxHiddenAudioTasks) {
      suppress('load_budget_exhausted')
      continue
    }

    if (isPattern(capability)) patternCount += 1
    if (isNewProductionTask(capability)) productionTaskCount += 1
    if (isHiddenAudioTask(capability)) hiddenAudioTaskCount += 1
    eligibleNewCapabilities.push({
      capability,
      activationRecommendation: {
        recommended: true,
        reason: 'eligible_new_capability',
        requiredActivationOwner: 'review_processor',
      },
    })
  }

  return {
    eligibleNewCapabilities,
    suppressedCapabilities,
    loadBudget,
    reasons: Array.from(new Set([
      ...eligibleNewCapabilities.map(item => item.activationRecommendation.reason),
      ...suppressedCapabilities.map(item => item.reason),
    ])),
  }
}
