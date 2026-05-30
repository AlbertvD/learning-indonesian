/**
 * CS15 — Item distractor coverage validator (post-write, item kind).
 *
 * Relocates `checkVocabCoverage` from `lint-staging.ts` (item kind, Slice 1,
 * ADR 0013 §6) into the Capability Gate post-write layer.
 *
 * The original lint-staging check verified that every exercise candidate's
 * Indonesian fields only referenced words in the known vocabulary pool. The
 * DB-resident re-expression shifts the intent to what matters post-Slice 1:
 * every word/phrase item that was written to the DB for this lesson MUST have
 * at least one distractor set generated (i.e. a row in one of the three
 * curated-distractor tables keyed by capability_id).
 *
 * This is the "coverage" gate: if the generator silently skipped an item (e.g.
 * because ANTHROPIC_API_KEY was absent and the no-op path ran), this finding
 * surfaces it immediately post-write rather than waiting for a learner to hit
 * an empty distractor set at runtime.
 *
 * Runs as a DB-aware check (takes the written item caps and queries the distractor
 * table counts) so it is correctly placed in the post-write gate layer.
 *
 * Severity: WARNING (not error) — the runtime falls back to pickDistractorCascade
 * when curated rows are absent, so the app does not break. But missing coverage
 * is always a content-quality issue and should be surfaced.
 */

import type { ValidationFinding } from '../model'

export interface ItemCapForCoverageCheck {
  /** canonical_key of the capability tied to this item (for context). */
  capabilityKey: string
  /** normalized_text of the item (for the finding message). */
  normalizedText: string
  /** true if at least one curated distractor row exists for this capability. */
  hasDistractors: boolean
}

/**
 * Validates that every item capability has curated distractors written.
 *
 * @param itemCaps - item capabilities for this lesson with distractor presence flag.
 *                   Caller builds this from the written caps + distractor rows.
 */
export function validateItemCoverage(itemCaps: ItemCapForCoverageCheck[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const cap of itemCaps) {
    if (!cap.hasDistractors) {
      findings.push({
        gate: 'CS15',
        severity: 'warning',
        message:
          `Item "${cap.normalizedText}" has no curated distractor rows after publish. ` +
          `The runtime will fall back to pickDistractorCascade. ` +
          `Re-run with ANTHROPIC_API_KEY set, or check generateItemDistractors logs.`,
        context: { capabilityKey: cap.capabilityKey, itemSlug: cap.normalizedText },
      })
    }
  }

  return findings
}
