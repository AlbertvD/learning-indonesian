import type { CapabilityActivationRequest, CapabilityScheduleSnapshot } from '@/lib/reviews/capabilityReviewProcessor'
import type { ExerciseRenderPlan } from '@/lib/exercises/exerciseRenderPlan'
import type { CapabilityPublicationStatus, CapabilityReadinessStatus, CapabilitySourceKind } from '@/lib/capabilities'

export type SessionMode = 'standard' | 'lesson_practice' | 'lesson_review' | 'affix_practice'

// ── Capability family axis (shared home) ─────────────────────────────────────
// Keyed on source_kind ALONE — capability_type is the wrong axis because
// `produce_form_from_context_cap` attaches to both `item` and `dialogue_line`.
// Lives here (not in pedagogy.ts) so both the planner's within-lesson round-robin
// AND the composer's grammar due-floor can read it without a sideways import.
// Exhaustive over CapabilitySourceKind: a new source kind fails compilation here.
export type CapabilityFamily = 'vocab' | 'cloze' | 'grammar' | 'morphology' | 'podcast'

export function capabilityFamily(sourceKind: CapabilitySourceKind): CapabilityFamily {
  switch (sourceKind) {
    case 'vocabulary_src':
      return 'vocab'
    case 'dialogue_line_src':
      return 'cloze'
    case 'grammar_pattern_src':
      return 'grammar'
    case 'word_form_pair_src':
      return 'morphology'
    case 'podcast_segment_src':
    case 'podcast_phrase_src':
      return 'podcast'
  }
}

// ── Session scoping predicates (single source of truth) ──────────────────────
// A scoped session restricts the queue to a subset of caps; an unscoped session
// (standard) draws from the whole queue. Two scope shapes exist:
//  - LESSON-scoped (lesson_practice/lesson_review): a lesson id + its source_refs.
//  - SOURCE-REF-scoped (affix_practice): source_refs only — an affix spans many
//    lessons (meN- = L9/L13/L14/…), so it has no single lessonId. The affix label
//    travels in the URL; the Session page resolves it to source_refs before build.
// The builder + planner ask "is this mode scoped at all?" via `isScopedMode`, and
// only the genuine lesson branches additionally require a lessonId.

export function isLessonScopedMode(mode: SessionMode): boolean {
  return mode === 'lesson_practice' || mode === 'lesson_review'
}

export function isSourceRefScopedMode(mode: SessionMode): boolean {
  return mode === 'affix_practice'
}

export function isScopedMode(mode: SessionMode): boolean {
  return isLessonScopedMode(mode) || isSourceRefScopedMode(mode)
}

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
  mode: SessionMode
  title: string
  blocks: SessionBlock[]
  recapPolicy: 'standard'
  diagnostics: SessionDiagnostic[]
}
