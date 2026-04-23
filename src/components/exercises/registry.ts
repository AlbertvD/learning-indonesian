// src/components/exercises/registry.ts
// Exercise-type → component registry with React.lazy. Empty at creation —
// each migration PR fills in one entry. ExerciseShell falls through to its
// legacy switch for unmapped types.
//
// See docs/plans/2026-04-23-exercise-framework-design.md §7.2

import { lazy, type LazyExoticComponent, type ComponentType } from 'react'
import type { ExerciseType, ExerciseItem } from '@/types/learning'
import type { ReviewResult, GrammarReviewResult } from '@/lib/reviewHandler'

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Discriminated union returned by exercise components. The `{skipped: true}`
 * branch lets <ExerciseErrorBoundary> report a skip without fabricating a
 * ReviewResult. Session reads `outcome.skipped` to distinguish session-length
 * accounting from FSRS write paths.
 */
export type AnswerOutcome =
  | { skipped: true, reviewRecorded: false }
  | ReviewResult
  | GrammarReviewResult

export interface ExerciseEventPayload {
  type: string
  payload?: Record<string, unknown>
}

/** Contract every exercise implementation must conform to. */
export interface ExerciseComponentProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (outcome: AnswerOutcome) => void
  onEvent?: (event: ExerciseEventPayload) => void
  adminOverlay?: React.ReactNode
}

export type LazyExercise = LazyExoticComponent<ComponentType<ExerciseComponentProps>>

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Exercise-type → lazy component. Entries fill in per migration PR (#4a/b/c).
 * While `undefined`, ExerciseShell falls back to its legacy switch for that
 * exercise type.
 */
export const exerciseRegistry: Partial<Record<ExerciseType, LazyExercise>> = {
  // PR #4a — Tier 1 (simplest): Speaking, ContrastPair, RecognitionMCQ, CuedRecall
  // PR #4b — Tier 2 (typed): ClozeMcq, ListeningMCQ, TypedRecall, MeaningRecall
  // PR #4c — Tier 3 (complex): ConstrainedTranslation, SentenceTransformation, Cloze, Dictation
}

/**
 * Which PromptCard variant the skeleton should render while a lazy chunk is
 * loading. Prevents layout shift when the real exercise mounts.
 */
export const exerciseSkeletonVariant: Record<ExerciseType, 'word' | 'sentence' | 'audio'> = {
  recognition_mcq:         'word',
  cued_recall:             'word',
  typed_recall:            'word',
  meaning_recall:          'word',
  cloze:                   'sentence',
  cloze_mcq:               'sentence',
  contrast_pair:           'word',
  sentence_transformation: 'sentence',
  constrained_translation: 'sentence',
  listening_mcq:           'audio',
  dictation:               'audio',
  speaking:                'word',
}

/**
 * Returns the lazy component for a type, or `null` if not yet migrated. Caller
 * (ExerciseShell) falls back to legacy switch when null.
 */
export function resolveExerciseComponent(type: ExerciseType): LazyExercise | null {
  return exerciseRegistry[type] ?? null
}

// Re-export the lazy helper for implementations to use.
export { lazy }
