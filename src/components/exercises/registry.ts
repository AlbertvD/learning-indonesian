// src/components/exercises/registry.ts
// Exercise-type → component registry with React.lazy. All 12 exercise types
// are mapped. The dispatcher (CapabilityExerciseFrame) renders `null` for
// any unmapped type, silent-skipping the block per spec §9.1.
//
// See docs/plans/2026-04-23-exercise-framework-design.md §7.2

import { lazy, type LazyExoticComponent, type ComponentType } from 'react'
import type { ExerciseType, ExerciseItem } from '@/types/learning'

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Raw answer data that exercise components emit. The dispatcher
 * (CapabilityExerciseFrame) translates this into the AnswerReport the player
 * ships to the server via answerCommitService. Exercise components stay
 * grader-agnostic — they call useExerciseScoring with the right grader plugged
 * into `config.checkCorrect` and report the outcome here.
 */
export interface ExerciseAnswerReport {
  wasCorrect: boolean
  isFuzzy: boolean
  latencyMs: number
  rawResponse: string | null
}

/**
 * Discriminated union returned by exercise components. The `{skipped: true}`
 * branch lets <ExerciseErrorBoundary> (and explicit skip handlers) report a
 * skip without fabricating an answer. The dispatcher reads `outcome.skipped`
 * to distinguish session-length accounting from review-commit paths.
 */
export type AnswerOutcome =
  | { skipped: true, reviewRecorded: false }
  | ExerciseAnswerReport

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
 * Exercise-type → lazy component. All 12 types are mapped today; an unmapped
 * type causes the dispatcher to render nothing and silent-skip the block.
 */
export const exerciseRegistry: Partial<Record<ExerciseType, LazyExercise>> = {
  // PR #4a — Tier 1 (simplest)
  speaking:        lazy(() => import('./implementations/SpeakingExercise')),
  contrast_pair:   lazy(() => import('./implementations/ContrastPairExercise')),
  recognition_mcq: lazy(() => import('./implementations/RecognitionMCQ')),
  cued_recall:     lazy(() => import('./implementations/CuedRecallExercise')),
  // PR #4b — Tier 2 (typed + audio MCQ)
  typed_recall:    lazy(() => import('./implementations/TypedRecall')),
  meaning_recall:  lazy(() => import('./implementations/MeaningRecall')),
  listening_mcq:   lazy(() => import('./implementations/ListeningMCQ')),
  cloze_mcq:       lazy(() => import('./implementations/ClozeMcq')),
  // PR #4c — Tier 3 (complex configs)
  cloze:                   lazy(() => import('./implementations/Cloze')),
  sentence_transformation: lazy(() => import('./implementations/SentenceTransformationExercise')),
  constrained_translation: lazy(() => import('./implementations/ConstrainedTranslationExercise')),
  dictation:               lazy(() => import('./implementations/Dictation')),
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
 * Returns the lazy component for a type, or `null` if not mapped. The
 * dispatcher (CapabilityExerciseFrame) silent-skips the block when null.
 */
export function resolveExerciseComponent(type: ExerciseType): LazyExercise | null {
  return exerciseRegistry[type] ?? null
}

// Re-export the lazy helper for implementations to use.
export { lazy }
