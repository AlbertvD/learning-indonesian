/**
 * Normalize a raw exercise response for FSRS / review-event writes.
 *
 * Lifted from ExerciseShell.tsx:116 during PR-2 of the
 * capabilityContentService spec so both the legacy ExerciseShell and the new
 * CapabilityExerciseFrame dispatcher produce identical AnswerReport.normalizedResponse
 * values for the same raw input — preventing fuzzy-match / duplicate-attempt
 * detection from drifting between the two paths.
 *
 * Behaviour: lowercase + trim, with null guard.
 */
export function normalizeAnswerResponse(rawResponse: string | null | undefined): string | null {
  return rawResponse ? rawResponse.toLowerCase().trim() : null
}
