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
  choose_correct_form_ex:   lazy(() => import('./implementations/ContrastPairExercise')),
  choose_meaning_ex: lazy(() => import('./implementations/RecognitionMCQ')),
  choose_form_ex:     lazy(() => import('./implementations/CuedRecallExercise')),
  // PR #4b — Tier 2 (typed + audio MCQ)
  type_form_ex:    lazy(() => import('./implementations/TypedRecall')),
  type_meaning_ex:  lazy(() => import('./implementations/MeaningRecall')),
  choose_meaning_from_audio_ex:   lazy(() => import('./implementations/ListeningMCQ')),
  choose_missing_word_ex:       lazy(() => import('./implementations/ClozeMcq')),
  // PR #4c — Tier 3 (complex configs)
  type_missing_word_ex:                   lazy(() => import('./implementations/Cloze')),
  transform_sentence_ex: lazy(() => import('./implementations/SentenceTransformationExercise')),
  translate_sentence_ex: lazy(() => import('./implementations/ConstrainedTranslationExercise')),
  type_form_from_audio_ex:               lazy(() => import('./implementations/Dictation')),
  // ADR 0019 — morphology segmentation drill.
  decompose_word_ex:       lazy(() => import('./implementations/DecomposeWordExercise')),
}

/**
 * Which PromptCard variant the skeleton should render while a lazy chunk is
 * loading. Prevents layout shift when the real exercise mounts.
 */
export const exerciseSkeletonVariant: Record<ExerciseType, 'word' | 'sentence' | 'audio'> = {
  choose_meaning_ex:         'word',
  choose_form_ex:             'word',
  type_form_ex:            'word',
  type_meaning_ex:          'word',
  type_missing_word_ex:                   'sentence',
  choose_missing_word_ex:               'sentence',
  choose_correct_form_ex:           'word',
  transform_sentence_ex: 'sentence',
  translate_sentence_ex: 'sentence',
  choose_meaning_from_audio_ex:           'audio',
  type_form_from_audio_ex:               'audio',
  speaking:                'word',
  decompose_word_ex:       'word',
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
