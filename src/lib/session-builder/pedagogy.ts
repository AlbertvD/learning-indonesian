import type {
  CapabilitySourceKind,
  CapabilityType,
} from '@/lib/capabilities'
import type { SkillType } from '@/types/learning'
import { decideLoadBudget, type LoadBudgetDecision } from '@/lib/session-builder/loadBudget'
import type { SessionMode } from '@/lib/session-builder/model'
import type { CapabilityPublicationStatus, CapabilityReadinessStatus } from '@/lib/capabilities'

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
  // NULL is reserved for podcast source kinds (ADR 0006). Every other source
  // kind has a non-null lessonId enforced by the schema CHECK constraint
  // `learning_capabilities_lesson_id_required_for_lessons`; those caps are
  // gated by `activatedLessons` in PedagogyInput.
  lessonId?: string | null
}

export interface PlannerLearnerCapabilityState {
  canonicalKey: string
  activationState: 'dormant' | 'active' | 'suspended' | 'retired'
  reviewCount: number
  successfulReviewCount: number
  // FSRS stability in days. Null when the capability has never been reviewed
  // (the row may exist as dormant with no FSRS state yet). Used by the
  // staging gate to admit productive capabilities only when a sibling
  // capability sharing the same source_ref has stabilised — see
  // docs/plans/2026-05-18-capability-staging-gate.md.
  stability: number | null
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
  | 'productive_capability_not_unlocked'

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
  // unless its lessonId is in this set. Per ADR 0006 (Decision 3b), the only
  // capabilities with null lessonId are podcast source kinds — those bypass
  // this gate and rely on `isAllowedInSessionMode` for mode admission.
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

// Receptive-before-productive staging. Phase 3+4 capabilities require a
// sibling for the same source_ref to have stabilised before they unlock.
// Conservative classification per docs/plans/2026-05-18-capability-staging-gate.md §3:
// types that *can* render as Phase 4 are classified at Phase 4 even when an
// MCQ resolution is possible. The switch is exhaustive over CapabilityType so
// any new type added to capabilityTypes.ts will fail compilation here.
function capabilityPhase(type: CapabilityType): 1 | 2 | 3 | 4 {
  switch (type) {
    case 'text_recognition':
    case 'audio_recognition':
    case 'podcast_gist':
      return 1
    case 'meaning_recall':
      return 2
    case 'l1_to_id_choice':
    case 'pattern_contrast':
      return 3
    case 'form_recall':
    case 'contextual_cloze':
    case 'dictation':
    case 'root_derived_recognition':
    case 'root_derived_recall':
    case 'pattern_recognition':
      return 4
  }
}

// Stability threshold for "this trace exists." Operationally, FSRS initialises
// stability around 0.21d after a first "good" answer; after a successful
// re-review the next day, stability climbs past 1d. So `>= 1d` means
// "at least one successful retrieval after the introduction." Tune from
// review-event aggregates over weeks.
const STAGING_STABILITY_THRESHOLD_DAYS = 1

function buildUnlockedSourceRefs(input: {
  readyCapabilities: readonly PlannerCapability[]
  learnerCapabilityStates: readonly PlannerLearnerCapabilityState[]
}): Set<string> {
  const capabilityByCanonicalKey = new Map(input.readyCapabilities.map(cap => [cap.canonicalKey, cap]))
  const unlocked = new Set<string>()
  for (const state of input.learnerCapabilityStates) {
    if (state.activationState !== 'active') continue
    if ((state.stability ?? 0) < STAGING_STABILITY_THRESHOLD_DAYS) continue
    if (state.successfulReviewCount < 1) continue
    const cap = capabilityByCanonicalKey.get(state.canonicalKey)
    if (cap) unlocked.add(cap.sourceRef)
  }
  return unlocked
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
  const unlockedSourceRefs = buildUnlockedSourceRefs({
    readyCapabilities: input.readyCapabilities,
    learnerCapabilityStates: input.learnerCapabilityStates,
  })
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
    // Receptive-before-productive staging gate. Phase 3+4 candidates only
    // unlock once a sibling capability sharing the same source_ref has
    // stabilised (active + stability >= 1d + at least one successful review).
    // See docs/plans/2026-05-18-capability-staging-gate.md §4. Phase 1+2
    // candidates always pass this gate; they are the path to unlocking
    // their own siblings.
    //
    // Carve-outs for source kinds that have no Phase 1/2 sibling at the
    // same source_ref:
    //   - affixed_form_pair: both root_derived_recognition + root_derived_recall
    //     are productive; their own prerequisite chain (encoded in
    //     prerequisiteKeys) already enforces a within-pattern learning order.
    //   - dialogue_line: each dialogue line has exactly one productive
    //     contextual_cloze cap; the source_ref `lesson-N/section-M/line-K`
    //     is unique to that line. Receptive items on the same lesson live at
    //     different source_refs (`learning_items/<slug>`), so they would not
    //     unlock under the source_ref-keyed gate even if the dialogue line's
    //     vocabulary has been seen. The lesson_activation gate below
    //     (Decision 3b / ADR 0006) is the actual readiness lever for
    //     dialogue lines.
    //   - pattern: grammar has no Phase 1/2 ladder — its only two types
    //     (pattern_contrast = Phase 3, pattern_recognition = Phase 4) are both
    //     productive and share the pattern's own source_ref, so nothing ever
    //     populates `unlockedSourceRefs` for it. The staging gate originally
    //     excluded pattern on the premise that "pattern types are inert at
    //     runtime" (staging-gate plan 2026-05-18 §3.2); that premise expired
    //     when Slice 2 (#100) + PR 4 made pattern caps renderable. Without
    //     this carve-out all ~194 published pattern caps are permanently
    //     orphan-suppressed (live DB 2026-06-07: 0 activated / 0 practiced —
    //     issue #166). lesson_activation below is the readiness lever.
    //   Without these carve-outs, every cap of these kinds is permanently
    //   orphan-suppressed.
    if (
      capability.sourceKind !== 'affixed_form_pair'
      && capability.sourceKind !== 'dialogue_line'
      && capability.sourceKind !== 'pattern'
      && capabilityPhase(capability.capabilityType) >= 3
      && !unlockedSourceRefs.has(capability.sourceRef)
    ) {
      suppress('productive_capability_not_unlocked')
      continue
    }
    if (!isAllowedInSessionMode(capability)) {
      suppress('wrong_session_mode')
      continue
    }
    // Lesson-activation gate. Per ADR 0006 (Decision 3b) every lesson-derived
    // capability has a non-null lessonId; the schema CHECK constraint
    // `learning_capabilities_lesson_id_required_for_lessons` (scripts/migration.sql)
    // enforces this. The `!= null` test below is retained only because podcast
    // source kinds (`podcast_segment`, `podcast_phrase`) are the documented
    // carve-out and remain null-lesson by design — they bypass this gate and
    // rely on `isAllowedInSessionMode` above to gate them by mode. For every
    // other source kind, the schema guarantees lessonId is non-null and the
    // gate fires whenever the learner has not activated that lesson.
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
