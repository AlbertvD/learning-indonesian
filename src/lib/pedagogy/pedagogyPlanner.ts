import type {
  CapabilitySourceKind,
  CapabilitySourceProgressRequirement,
  CapabilityType,
} from '@/lib/capabilities/capabilityTypes'
import type { SkillType } from '@/types/learning'
import { decideLoadBudget, type LoadBudgetDecision, type PlannerSessionMode } from '@/lib/pedagogy/loadBudgets'
import type { SessionPosture } from '@/lib/pedagogy/sessionPosture'
import { isSourceProgressSatisfied, type LearnerSourceProgress, type ReviewEvidence } from '@/lib/pedagogy/sourceProgressGates'
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
  requiredSourceProgress?: CapabilitySourceProgressRequirement
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
  | 'missing_source_progress'
  | 'missing_prerequisite'
  | 'difficulty_jump'
  | 'recent_failure_fatigue'
  | 'not_useful_for_current_path'
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
  mode: PlannerSessionMode
  posture?: SessionPosture
  now: Date
  preferredSessionSize: number
  dueCount: number
  readyCapabilities: PlannerCapability[]
  learnerCapabilityStates: readonly PlannerLearnerCapabilityState[]
  sourceProgress: LearnerSourceProgress[]
  recentReviewEvidence: ReviewEvidence[]
  currentSourceRefs?: string[]
  activeGoalTags?: string[]
  maxNewDifficultyLevel?: number
  recentFailures?: Array<{
    canonicalKey: string
    failedAt: string
    consecutiveFailures: number
  }>
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

function isSourceSwitch(capability: PlannerCapability, currentSourceRefs?: string[]): boolean {
  return Boolean(currentSourceRefs?.length) && !currentSourceRefs!.includes(capability.sourceRef)
}

function isUsefulForCurrentPath(input: {
  capability: PlannerCapability
  currentSourceRefs?: string[]
  activeGoalTags?: string[]
}): boolean {
  const sourceRefs = input.currentSourceRefs ?? []
  const goalTags = input.activeGoalTags ?? []
  if (sourceRefs.length === 0 && goalTags.length === 0) return true

  return (
    sourceRefs.includes(input.capability.sourceRef)
    || goalTags.some(tag => input.capability.goalTags?.includes(tag))
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

function isAllowedInSessionMode(input: {
  capability: PlannerCapability
  mode: PlannerSessionMode
}): boolean {
  if (input.capability.sourceKind === 'podcast_phrase') {
    return input.mode === 'podcast'
  }
  return true
}

export function planLearningPath(input: PedagogyInput): LearningPlan {
  const loadBudget = decideLoadBudget({
    mode: input.mode,
    posture: input.posture,
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
  let sourceSwitchCount = 0

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
    const state = stateByKey.get(capability.canonicalKey)
    if (state && state.activationState !== 'dormant') {
      suppress('already_active_or_retired')
      continue
    }
    if (capability.prerequisiteKeys.some(key => !satisfiedKeys.has(key))) {
      suppress('missing_prerequisite')
      continue
    }
    if (
      input.maxNewDifficultyLevel != null
      && (capability.difficultyLevel == null || capability.difficultyLevel > input.maxNewDifficultyLevel)
    ) {
      suppress('difficulty_jump')
      continue
    }
    if (hasRecentFailureFatigue({ capability, now: input.now, recentFailures: input.recentFailures })) {
      suppress('recent_failure_fatigue')
      continue
    }
    if (!isAllowedInSessionMode({ capability, mode: input.mode })) {
      suppress('wrong_session_mode')
      continue
    }
    if (!isUsefulForCurrentPath({
      capability,
      currentSourceRefs: input.currentSourceRefs,
      activeGoalTags: input.activeGoalTags,
    })) {
      suppress('not_useful_for_current_path')
      continue
    }
    const sourceGate = isSourceProgressSatisfied({
      requiredSourceProgress: capability.requiredSourceProgress,
      sourceProgress: input.sourceProgress,
      evidence: input.recentReviewEvidence,
      allowEvidenceBypass: capability.capabilityType === 'form_recall',
    })
    if (!sourceGate.satisfied) {
      suppress('missing_source_progress')
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
    if (isSourceSwitch(capability, input.currentSourceRefs) && sourceSwitchCount >= loadBudget.maxSourceSwitches) {
      suppress('load_budget_exhausted')
      continue
    }

    if (isPattern(capability)) patternCount += 1
    if (isNewProductionTask(capability)) productionTaskCount += 1
    if (isHiddenAudioTask(capability)) hiddenAudioTaskCount += 1
    if (isSourceSwitch(capability, input.currentSourceRefs)) sourceSwitchCount += 1
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
