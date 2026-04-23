// src/components/exercises/registryMeta.ts
// Synchronous manifest of migration flags. Eagerly evaluated — no chunk load
// needed — so Session can read it at session-start to decide whether the
// whole session uses <ExerciseFeedback> or the legacy feedback screen.
//
// Flip an entry to `true` when that exercise type's implementation has fully
// migrated to primitives and is ready to use the new feedback screen.
// Delete this file in PR #7 once all 12 are migrated.
//
// See docs/plans/2026-04-23-exercise-framework-design.md §7.5

import type { ExerciseType } from '@/types/learning'

export const usesNewFeedback: Record<ExerciseType, boolean> = {
  recognition_mcq:         false,
  cued_recall:             false,
  contrast_pair:           false,
  sentence_transformation: false,
  constrained_translation: false,
  typed_recall:            false,
  meaning_recall:          false,
  cloze:                   false,
  cloze_mcq:               false,
  speaking:                false,
  listening_mcq:           false,
  dictation:               false,
}

/**
 * Returns true iff every exercise type in the session queue has migrated.
 * Used by Session to lock the feedback path for the whole session (prevents
 * mid-session UX inconsistency).
 */
export function sessionAllMigrated(types: ExerciseType[]): boolean {
  return types.every(t => usesNewFeedback[t])
}
