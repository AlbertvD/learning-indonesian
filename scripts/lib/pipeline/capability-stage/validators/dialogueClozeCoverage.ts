import type { ValidationFinding } from '../model'

/**
 * CS22 (Slice 3) — dialogue-cloze coverage gate. The DB-state-aware successor of
 * lint-staging's `checkDialogueClozes` (which is relocated OFF the staging
 * pre-flight in this slice).
 *
 * Input: the in-stage Mode-2 generator's `failedLineRefs` — ELIGIBLE dialogue
 * lines whose generated cloze failed defensive sanitization, so no
 * `dialogue_clozes` row landed. Each is a coverage gap (the same "this dialogue
 * line should have a cloze but doesn't" information the old check surfaced).
 *
 * Severity `error` → the runner's final status becomes `partial` (graceful, like
 * CS18 pattern coverage): the runtime renders the clozes that DID land, and the
 * gap is surfaced for a re-publish / `--regenerate`, never silently dropped (m-2).
 * Ineligible lines are validly skipped by the generator and are NOT flagged here.
 */
export function validateDialogueClozeCoverage(failedLineRefs: readonly string[]): ValidationFinding[] {
  return failedLineRefs.map((sourceLineRef) => ({
    gate: 'CS22' as const,
    severity: 'error' as const,
    message:
      `dialogue_line "${sourceLineRef}" is cloze-eligible but in-stage generation produced no valid ` +
      `dialogue_clozes row (sanitization failed) — no cloze landed; re-publish or --regenerate this line`,
    context: { sourceLineRef },
  }))
}
