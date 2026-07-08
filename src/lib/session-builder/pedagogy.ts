import type {
  CapabilitySourceKind,
  CapabilityType,
} from '@/lib/capabilities'
import type { SkillType } from '@/types/learning'
import { decideLoadBudget, type LoadBudgetDecision } from '@/lib/session-builder/loadBudget'
import { partitionBuried } from '@/lib/session-builder/siblingBury'
import { isScopedMode, isSourceRefScopedMode, capabilityFamily } from '@/lib/session-builder/model'
import type { SessionMode, CapabilityFamily } from '@/lib/session-builder/model'
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
  // The owning lesson's `order_index` (`lessons.order_index`, NOT NULL DEFAULT 0).
  // Primary key of the new-introduction ordering policy (the `prioritize` stage):
  // candidates sort lesson-major so lower lessons are introduced first. Null only
  // for podcast/null-lesson caps, which sort last. Populated by the adapter from
  // the lessons rows it already loads — no new query. See
  // docs/plans/2026-06-07-lesson-priority-candidate-ordering-design.md.
  lessonOrder?: number | null
}

// `capabilityFamily` (+ the `CapabilityFamily` type) moved to `./model` so the
// composer's grammar due-floor can share the axis without a sideways import.
// Re-exported here for existing importers.
export { capabilityFamily } from '@/lib/session-builder/model'
export type { CapabilityFamily } from '@/lib/session-builder/model'

// Stable final tiebreak between families when lessonOrder + within-family rank
// are equal. Order is cosmetic (determinism only), not pedagogic.
const FAMILY_TIEBREAK: Record<CapabilityFamily, number> = {
  vocab: 0,
  cloze: 1,
  grammar: 2,
  morphology: 3,
  podcast: 4,
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
  | 'sibling_buried'

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
  // Set of capability source_refs that belong to a collection the learner has
  // activated (collections feature, spec §5). For item caps the form is
  // `learning_items/<normalized_text>` — matching PlannerCapability.sourceRef and
  // the HC9 invariant. A cap in this set is RESCUED from the lesson-activation
  // gate below: a gap word homed on the un-activated "Common Words" lesson still
  // surfaces when its collection is activated. Resolved by `lib/collections`;
  // optional (empty = no collections active) so non-collection callers are
  // unaffected.
  activatedCollectionRefs?: ReadonlySet<string>
  recentFailures?: Array<{
    canonicalKey: string
    failedAt: string
    consecutiveFailures: number
  }>
  selectedLessonId?: string
  selectedSourceRefs?: string[]
  // Sibling-bury seed: source_refs already spoken-for today — prior-session
  // reviews UNION the due + practice capabilities selected earlier in THIS build
  // (the builder accumulates both into one set and passes it here). A candidate
  // whose source_ref is in this set is buried (deferred to a later day) before
  // budget allocation, so the freed slots fill with other words. See
  // docs/plans/2026-06-09-sibling-bury-before-allocate-fix.md.
  usedSourceRefs?: ReadonlySet<string>
}

function isPattern(capability: PlannerCapability): boolean {
  return (
    capability.sourceKind === 'grammar_pattern_src'
    || capability.sourceKind === 'word_form_pair_src'
    || capability.capabilityType.includes('pattern')
    || capability.capabilityType === 'recognise_word_form_link_cap'
    || capability.capabilityType === 'produce_derived_form_cap'
  )
}

function isNewProductionTask(capability: PlannerCapability): boolean {
  return (
    capability.capabilityType === 'produce_form_from_meaning_cap'
    || capability.capabilityType === 'produce_form_from_audio_cap'
    || capability.capabilityType === 'produce_form_from_context_cap'
    || capability.capabilityType === 'produce_derived_form_cap'
  )
}

function isHiddenAudioTask(capability: PlannerCapability): boolean {
  return (
    capability.capabilityType === 'recognise_meaning_from_audio_cap'
    || capability.capabilityType === 'produce_form_from_audio_cap'
    || capability.capabilityType === 'recognise_gist_from_audio_cap'
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
  // podcast_phrase_src capabilities have no live session mode today; the only
  // mode that admitted them was the unwired 'podcast' mode (retired with the
  // posture system). Suppress them everywhere until a podcast surface ships.
  return capability.sourceKind !== 'podcast_phrase_src'
}

// Receptive-before-productive staging. Phase 3+4 capabilities require a
// sibling for the same source_ref to have stabilised before they unlock.
// Conservative classification per docs/plans/2026-05-18-capability-staging-gate.md §3:
// types that *can* render as Phase 4 are classified at Phase 4 even when an
// MCQ resolution is possible. The switch is exhaustive over CapabilityType so
// any new type added to capabilityTypes.ts will fail compilation here.
export function capabilityPhase(type: CapabilityType): 1 | 2 | 3 | 4 {
  switch (type) {
    case 'recognise_meaning_from_text_cap':
    case 'recognise_meaning_from_audio_cap':
    case 'recognise_gist_from_audio_cap':
      return 1
    case 'recall_meaning_from_text_cap':
      return 2
    case 'recognise_form_from_meaning_cap':
    case 'contrast_grammar_pattern_cap':
    case 'recognise_grammar_pattern_cap':
      // ADR 0017: recognise_grammar_pattern_cap sits with contrast at Phase 3.
      // For grammar this is coherence only — the actual recognise → contrast →
      // produce sequencing is carried by prerequisiteKeys, and grammar is exempt
      // from the source_ref-keyed staging gate (no Phase 1/2 ladder).
      return 3
    case 'produce_form_from_meaning_cap':
    case 'produce_form_from_context_cap':
    case 'produce_form_from_audio_cap':
    case 'recognise_word_form_link_cap':
    case 'produce_derived_form_cap':
    case 'produce_grammar_pattern_cap':
      // word_form_pair_src is exempt from the source_ref-keyed staging gate
      // (ADR 0007:44 / 0018), so the phase value never gates it. Grouping keeps the
      // morphology caps together.
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

// Scope membership for a NEW introduction. Source-ref-keyed so it covers BOTH
// lesson scope and affix scope — the affix mode has no selectedLessonId, so the
// (former) Boolean(selectedLessonId) requirement is gone; the lesson modes still
// pass their lessonId down via selectedSourceRefs derived from that lesson.
function isInSelectedScope(input: {
  capability: PlannerCapability
  selectedSourceRefs?: string[]
}): boolean {
  return Boolean(input.selectedSourceRefs?.length)
    && input.selectedSourceRefs!.includes(input.capability.sourceRef)
}

// Shared context the gate stage reads. Derived once per plan from PedagogyInput.
interface GateContext {
  mode: SessionMode
  now: Date
  recentFailures?: PedagogyInput['recentFailures']
  activatedLessons: ReadonlySet<string>
  activatedCollectionRefs: ReadonlySet<string>
  selectedSourceRefs?: string[]
  satisfiedKeys: ReadonlySet<string>
  unlockedSourceRefs: ReadonlySet<string>
  stateByKey: ReadonlyMap<string, PlannerLearnerCapabilityState>
}

// ── Stage 1: gate ──────────────────────────────────────────────────────────
// The suppression-rule engine. Partitions ready capabilities into those that
// could be introduced (gate-passing) and those suppressed-with-reason. Does NOT
// decide order or budget — those are the prioritize + allocate stages. Walks in
// input order; suppression reasons are emitted in that order.
function gateCandidates(
  readyCapabilities: readonly PlannerCapability[],
  ctx: GateContext,
): { gatePassing: PlannerCapability[]; suppressed: SuppressedCapability[] } {
  const gatePassing: PlannerCapability[] = []
  const suppressed: SuppressedCapability[] = []

  for (const capability of readyCapabilities) {
    const suppress = (reason: PlannerReason): void => {
      suppressed.push({ canonicalKey: capability.canonicalKey, reason })
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
      isScopedMode(ctx.mode)
      && !isInSelectedScope({
        capability,
        selectedSourceRefs: ctx.selectedSourceRefs,
      })
    ) {
      suppress('wrong_session_mode')
      continue
    }
    const state = ctx.stateByKey.get(capability.canonicalKey)
    if (state && state.activationState !== 'dormant') {
      suppress('already_active_or_retired')
      continue
    }
    // Affix-trainer relaxation: in affix_practice mode the learner has explicitly
    // chosen to drill this affix, so we DON'T require its grammar pattern to have
    // been formally studied first — recognising "berjalan = ber- + jalan" is itself
    // how you meet the pattern, and gating an affix drill behind a separate grammar
    // lesson is the circular over-strictness that left the trainer with "no cards".
    // The root-vocab prerequisite is KEPT (you still build the affixed form on a base
    // word you actually know — ADR 0018), as is the within-pair recognise→produce
    // ladder. So an affix drill surfaces the forms whose roots you know, immediately.
    const prereqKeys = isSourceRefScopedMode(ctx.mode)
      ? capability.prerequisiteKeys.filter(key => !key.includes(':grammar_pattern_src:'))
      : capability.prerequisiteKeys
    if (prereqKeys.some(key => !ctx.satisfiedKeys.has(key))) {
      suppress('missing_prerequisite')
      continue
    }
    if (hasRecentFailureFatigue({ capability, now: ctx.now, recentFailures: ctx.recentFailures })) {
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
    //   - word_form_pair_src: both recognise_word_form_link_cap + produce_derived_form_cap
    //     are productive; their own prerequisite chain (encoded in
    //     prerequisiteKeys) already enforces a within-pattern learning order.
    //   - dialogue_line: each dialogue line has exactly one productive
    //     produce_form_from_context_cap cap; the source_ref `lesson-N/section-M/line-K`
    //     is unique to that line. Receptive items on the same lesson live at
    //     different source_refs (`learning_items/<slug>`), so they would not
    //     unlock under the source_ref-keyed gate even if the dialogue line's
    //     vocabulary has been seen. The lesson_activation gate below
    //     (Decision 3b / ADR 0006) is the actual readiness lever for
    //     dialogue lines.
    //   - pattern: grammar has no Phase 1/2 ladder — its only two types
    //     (contrast_grammar_pattern_cap = Phase 3, recognise_grammar_pattern_cap = Phase 4) are both
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
      capability.sourceKind !== 'word_form_pair_src'
      && capability.sourceKind !== 'dialogue_line_src'
      && capability.sourceKind !== 'grammar_pattern_src'
      && capabilityPhase(capability.capabilityType) >= 3
      && !ctx.unlockedSourceRefs.has(capability.sourceRef)
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
    // source kinds (`podcast_segment_src`, `podcast_phrase_src`) are the documented
    // carve-out and remain null-lesson by design — they bypass this gate and
    // rely on `isAllowedInSessionMode` above to gate them by mode. For every
    // other source kind, the schema guarantees lessonId is non-null and the
    // gate fires whenever the learner has not activated that lesson.
    //
    // Collections gate-OR (spec §5): a cap is suppressed only if its lesson is
    // not activated AND its word is in NO activated collection. This rescues
    // gap-word caps homed on the un-activated "Common Words" lesson when the
    // learner activates a collection containing the word. Clause ORDER is
    // load-bearing — the collection membership is an OR with the lesson gate,
    // not a separate suppression.
    if (
      capability.lessonId != null
      && !ctx.activatedLessons.has(capability.lessonId)
      && !ctx.activatedCollectionRefs.has(capability.sourceRef)
    ) {
      suppress('lesson_not_activated')
      continue
    }

    gatePassing.push(capability)
  }

  return { gatePassing, suppressed }
}

// ── Stage 2: prioritize ────────────────────────────────────────────────────
// The new-introduction ordering policy (the restored `orderedReadyCapabilities`
// concept). Pure + deterministic — same set in, same order out, independent of
// input array order. Sort key, in priority order:
//   1. lessonOrder ASC      → soft lesson priority (L1 before L2). Soft-spill
//      falls out: a lesson with no gate-passing candidate contributes nothing,
//      so the next lesson becomes the lowest available.
//   2. rankWithinLessonFamily ASC → within-lesson family round-robin so scarce
//      families (grammar/cloze/morphology) interleave with the ~50:1 vocab
//      majority instead of trailing all of it. Rank is assigned deterministically
//      (by canonicalKey within each (lessonOrder, family) group) so the result
//      does not depend on DB row order.
//   3. FAMILY_TIEBREAK, then canonicalKey → stable, total deterministic order.
// Scoped to new introductions in non-single-lesson candidate sets; a no-op when
// the gate already narrowed to one lesson (lesson_practice/lesson_review).
export function prioritizeCandidates(candidates: readonly PlannerCapability[]): PlannerCapability[] {
  const groups = new Map<string, PlannerCapability[]>()
  for (const cap of candidates) {
    const key = `${cap.lessonOrder ?? Infinity}::${capabilityFamily(cap.sourceKind)}`
    const group = groups.get(key)
    if (group) group.push(cap)
    else groups.set(key, [cap])
  }
  const rankByKey = new Map<string, number>()
  for (const group of groups.values()) {
    group.sort((a, b) => {
      // Receptive rungs (Phase 1/2) before productive (Phase 3/4) WITHIN a word, so
      // sibling-burying (1 cap/word/day, keeps the top-ranked) introduces a word's
      // rungs in pedagogical order. The raw canonical_key is alphabetical by
      // capability_type, which placed `recognise_meaning_from_audio` (listening, P1)
      // behind `produce_form_from_audio` (P4) — starving listening to 1/288 introduced
      // (2026-06-24). canonical_key still breaks ties within a phase (determinism).
      const phaseDelta = capabilityPhase(a.capabilityType) - capabilityPhase(b.capabilityType)
      if (phaseDelta !== 0) return phaseDelta
      return compareCanonicalKey(a, b)
    })
    group.forEach((cap, index) => rankByKey.set(cap.canonicalKey, index))
  }

  return [...candidates].sort((a, b) => {
    const lessonDelta = (a.lessonOrder ?? Infinity) - (b.lessonOrder ?? Infinity)
    if (lessonDelta !== 0) return lessonDelta
    const rankDelta = rankByKey.get(a.canonicalKey)! - rankByKey.get(b.canonicalKey)!
    if (rankDelta !== 0) return rankDelta
    const familyDelta = FAMILY_TIEBREAK[capabilityFamily(a.sourceKind)] - FAMILY_TIEBREAK[capabilityFamily(b.sourceKind)]
    if (familyDelta !== 0) return familyDelta
    return compareCanonicalKey(a, b)
  })
}

function compareCanonicalKey(a: PlannerCapability, b: PlannerCapability): number {
  return a.canonicalKey < b.canonicalKey ? -1 : a.canonicalKey > b.canonicalKey ? 1 : 0
}

// ── Stage 3: allocate ──────────────────────────────────────────────────────
// Fills the load budget from the prioritized list, applying the per-type
// ceilings. The budget math is unchanged from the pre-decomposition loop; the
// only difference is it now consumes an explicitly-ordered list. Overflow is
// suppressed as load_budget_exhausted in prioritized order.
function allocateBudget(
  prioritized: readonly PlannerCapability[],
  loadBudget: LoadBudgetDecision,
): { eligible: EligibleCapability[]; suppressed: SuppressedCapability[] } {
  const eligible: EligibleCapability[] = []
  const suppressed: SuppressedCapability[] = []
  let patternCount = 0
  let productionTaskCount = 0
  let hiddenAudioTaskCount = 0

  for (const capability of prioritized) {
    const suppress = (): void => {
      suppressed.push({ canonicalKey: capability.canonicalKey, reason: 'load_budget_exhausted' })
    }
    if (!loadBudget.allowNewCapabilities || eligible.length >= loadBudget.maxNewCapabilities) {
      suppress()
      continue
    }
    if (isPattern(capability) && patternCount >= loadBudget.maxNewPatterns) {
      suppress()
      continue
    }
    if (isNewProductionTask(capability) && productionTaskCount >= loadBudget.maxNewProductionTasks) {
      suppress()
      continue
    }
    if (isHiddenAudioTask(capability) && hiddenAudioTaskCount >= loadBudget.maxHiddenAudioTasks) {
      suppress()
      continue
    }

    if (isPattern(capability)) patternCount += 1
    if (isNewProductionTask(capability)) productionTaskCount += 1
    if (isHiddenAudioTask(capability)) hiddenAudioTaskCount += 1
    eligible.push({
      capability,
      activationRecommendation: {
        recommended: true,
        reason: 'eligible_new_capability',
        requiredActivationOwner: 'review_processor',
      },
    })
  }

  return { eligible, suppressed }
}

// Orchestrator: gate → prioritize → allocate. Each stage is a pure function;
// this composes them and merges the two suppression lists.
export function planLearningPath(input: PedagogyInput): LearningPlan {
  const loadBudget = decideLoadBudget({
    mode: input.mode,
    preferredSessionSize: input.preferredSessionSize,
    dueCount: input.dueCount,
  })
  const ctx: GateContext = {
    mode: input.mode,
    now: input.now,
    recentFailures: input.recentFailures,
    activatedLessons: input.activatedLessons,
    activatedCollectionRefs: input.activatedCollectionRefs ?? new Set(),
    selectedSourceRefs: input.selectedSourceRefs,
    stateByKey: new Map(input.learnerCapabilityStates.map(state => [state.canonicalKey, state])),
    satisfiedKeys: new Set(input.learnerCapabilityStates
      .filter(state => state.activationState === 'active' && state.successfulReviewCount > 0)
      .map(state => state.canonicalKey)),
    unlockedSourceRefs: buildUnlockedSourceRefs({
      readyCapabilities: input.readyCapabilities,
      learnerCapabilityStates: input.learnerCapabilityStates,
    }),
  }

  const { gatePassing, suppressed: gateSuppressed } = gateCandidates(input.readyCapabilities, ctx)
  const prioritized = prioritizeCandidates(gatePassing)

  // C1 production fast-path (docs/plans/2026-07-08-affix-production-fastpath.md):
  // in affix_practice mode, produce_derived_form_cap candidates are exempt from
  // the new-introduction sibling-bury rule below. WHY: drill semantics — the
  // learner explicitly chose this affix, so reaching the produce form in the
  // SAME round its recognise sibling was reviewed is the point (recognise→
  // produce same day), not a bug. The prereq ladder is untouched and still
  // enforces order (the produce cap's prerequisiteKeys require its recognise
  // sibling to be active + have >=1 successful review — satisfiedKeys above,
  // sourced from PERSISTED state from the prior round's atomic commit, ADR
  // 0004). recognise_word_form_link_cap (the sibling type) is deliberately NOT
  // exempt, so it stays subject to the bury rule like everything else. Type-
  // narrowed (not sourceKind-wide) per architect sign-off — tighter blast
  // radius, self-documenting; the recognise type never needs unburying.
  const isFastPathExempt = (candidate: PlannerCapability): boolean => (
    ctx.mode === 'affix_practice' && candidate.capabilityType === 'produce_derived_form_cap'
  )
  const exemptCandidates = prioritized.filter(isFastPathExempt)
  const buryableCandidates = prioritized.filter(candidate => !isFastPathExempt(candidate))

  // Sibling-bury BEFORE budget allocation (not after): at most one cap per
  // source_ref per day. Walking the prioritized order keeps the highest-priority
  // sibling of a not-today word; siblings of words already spoken-for today
  // (input.usedSourceRefs) are buried. Burying here — rather than trimming the
  // post-budget eligible list — lets allocateBudget fill the freed slots from the
  // next-ranked NEW words, so the session reaches preferredSessionSize instead of
  // collapsing. See docs/plans/2026-06-09-sibling-bury-before-allocate-fix.md.
  // Only the non-exempt candidates are subject to burying (fast-path carve-out
  // above); siblingBury.ts itself is untouched — it stays the shared surface for
  // the due/practice passes (`buryThinSiblings` in builder.ts), which must keep
  // full bury semantics.
  const usedRefs = new Set(input.usedSourceRefs ?? [])
  const { kept: nonBuriedCandidates, buried } = partitionBuried(buryableCandidates, cap => cap.sourceRef, usedRefs)
  // Recombine exempt + kept candidates, then re-derive from `prioritized` by
  // membership so the concatenated result preserves the original prioritized
  // order (rather than appending exempt items out of place).
  const keptKeys = new Set([...exemptCandidates, ...nonBuriedCandidates].map(cap => cap.canonicalKey))
  const nonBuried = prioritized.filter(cap => keptKeys.has(cap.canonicalKey))
  const buriedSuppressed: SuppressedCapability[] = buried.map(cap => ({
    canonicalKey: cap.canonicalKey, reason: 'sibling_buried',
  }))

  const { eligible, suppressed: budgetSuppressed } = allocateBudget(nonBuried, loadBudget)

  const suppressedCapabilities = [...gateSuppressed, ...buriedSuppressed, ...budgetSuppressed]
  return {
    eligibleNewCapabilities: eligible,
    suppressedCapabilities,
    loadBudget,
    reasons: Array.from(new Set([
      ...eligible.map(item => item.activationRecommendation.reason),
      ...suppressedCapabilities.map(item => item.reason),
    ])),
  }
}
