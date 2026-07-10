/**
 * CS25 — curated distractor register-twin guard (item distractor rows, post-write).
 *
 * Spreektaal (docs/plans/2026-07-09-spreektaal-lesson-woven-core.md §4): "the
 * formal item's #2 MCQ (choose_form_ex — prompt 'niet', choose the Indonesian)
 * can now draw the informal twin from the runtime distractor pool — two
 * correct choices... Curated distractor sets get the same rule as a pipeline
 * validator check." The RUNTIME guard (the read-time pool path) lands
 * separately in `src/lib/exercise-content/byKind/item.ts` /
 * `byType/cuedRecall.ts`. This is the CURATED-set half: the pointer rows
 * `seedDistractors.ts`/`planDistractorWrites` write to the `distractors` table
 * at publish time must never point an exercise's answer at its own register
 * twin — that is a second correct option disguised as a wrong one.
 *
 * A distractor row is a register-twin violation when EITHER:
 *   (a) the distractor item's text IS the answer item's register_counterpart
 *       (fires when the ANSWER is itself informal, e.g. answer=nggak,
 *       register_counterpart=tidak, and the distractor drawn is tidak); OR
 *   (b) the distractor item is itself register='informal' AND its
 *       register_counterpart resolves back to the answer item (fires when the
 *       ANSWER is formal, e.g. answer=tidak, and the distractor drawn is
 *       nggak, whose register_counterpart=tidak).
 *
 * Both sides of every comparison route through the canonical `itemSlug()`
 * mint (`@/lib/capabilities`) — never a bespoke lowercase/trim (same mandate
 * as the Lesson Gate's GT9 register_counterpart resolution) — because
 * `register_counterpart` is raw authored text (trimmed, not slugged, at
 * projection time: `lesson-stage/projectSections.ts`), while the item texts
 * being compared against are `learning_items.normalized_text` /
 * `base_text`, which may differ only in case.
 *
 * Severity ERROR: a duplicated correct option is a grading-correctness
 * defect, not a smell (mirrors CS24's severity rationale for the same class
 * of "learner is told correct without being tested" failure).
 *
 * Pure — the caller resolves the answer item, the distractor item, and both
 * items' register columns from the DB (mirrors CS15's
 * `ItemCapForCoverageCheck` pre-resolved-row pattern) and passes flat rows in.
 */

import { itemSlug } from '@/lib/capabilities'
import type { ValidationFinding } from '../model'

export interface DistractorRegisterTwinCheckRow {
  /** canonical_key (or another stable id) of the exercise capability this
   *  distractor row belongs to — carried through to the finding's context. */
  capabilityKey: string
  /** The answer item's `normalized_text` / `base_text`. */
  answerNormalizedText: string
  /** The answer item's `register_counterpart` (null unless the answer itself
   *  is register='informal'). Raw authored text — NOT pre-slugged. */
  answerRegisterCounterpart: string | null
  /** The distractor item's `normalized_text` / `base_text` (the wrong-option
   *  pointer target in the `distractors` row). */
  distractorNormalizedText: string
  /** The distractor item's `register` column. */
  distractorRegister: 'informal' | null
  /** The distractor item's `register_counterpart` (null unless the distractor
   *  itself is register='informal'). Raw authored text — NOT pre-slugged. */
  distractorRegisterCounterpart: string | null
}

/**
 * Validates that no curated distractor row pairs an answer item with its own
 * register twin (formal<->informal near-duplicate correct answer).
 *
 * @param rows - one row per (capability, distractor item_id) pointer, with
 *               the answer + distractor items' register columns already
 *               resolved by the caller.
 */
export function validateNoRegisterTwinDistractors(
  rows: DistractorRegisterTwinCheckRow[],
): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const row of rows) {
    const answerSlug = itemSlug(row.answerNormalizedText)
    const distractorSlug = itemSlug(row.distractorNormalizedText)

    // (a) the distractor IS the answer's own register_counterpart (answer is
    //     informal; the formal twin was drawn as a "wrong" option).
    const distractorIsAnswersCounterpart =
      row.answerRegisterCounterpart != null
      && itemSlug(row.answerRegisterCounterpart) === distractorSlug

    // (b) the distractor is itself informal, and ITS register_counterpart
    //     resolves back to the answer (answer is formal; the informal twin
    //     was drawn as a "wrong" option).
    const distractorIsInformalTwinOfAnswer =
      row.distractorRegister === 'informal'
      && row.distractorRegisterCounterpart != null
      && itemSlug(row.distractorRegisterCounterpart) === answerSlug

    if (distractorIsAnswersCounterpart || distractorIsInformalTwinOfAnswer) {
      findings.push({
        gate: 'CS25',
        severity: 'error',
        message:
          `Curated distractor "${row.distractorNormalizedText}" for item "${row.answerNormalizedText}" ` +
          `is its register twin (spec §4) — a near-duplicate CORRECT answer disguised as a wrong option.`,
        context: { capabilityKey: row.capabilityKey, itemSlug: row.answerNormalizedText },
      })
    }
  }

  return findings
}
