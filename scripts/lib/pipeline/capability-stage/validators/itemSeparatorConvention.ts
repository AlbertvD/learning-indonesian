/**
 * CS19 — alternative-answer separator convention validator (pre-write, item kind).
 *
 * Guards the LIVE answer-bearing write surfaces against a non-canonical
 * separator that would reach the learner as one unmatchable blob once the
 * grader stops splitting on comma (plan §2c; CONTEXT.md → Typed Artifact):
 *
 *   - `learning_items.translation_nl` (Dutch) — the LIVE item-meaning read path
 *     (Decision R; byKind/item.ts:36). ERROR-level: a ";" or a comma-as-OR list
 *     here is learner-breaking. Only word/phrase items are checked — a
 *     sentence/dialogue_chunk "translation" is a full clause that legitimately
 *     contains commas/semicolons as punctuation, so it is skipped (and after
 *     ADR 0014 those item kinds are not harvested at all).
 *   - Indonesian-side answers (`item_answer_variants` / `accepted_answers:id`)
 *     — WARN-level only: Indonesian has verbless equative clauses ("dia guru" =
 *     "he is a teacher") so short comma-segments are normal and must never
 *     error; only a ";" (an unambiguous non-canonical separator) warns.
 *
 * The detection logic is the SHARED `classifyDutchSeparator` /
 * `classifyIndonesianSeparator` from `@/lib/capabilities` — the same definition
 * the runtime grader's `splitAlternatives` and the HC24 health check consume, so
 * the gate and the grader can never drift.
 *
 * Pairs with the generator's `normaliseDutchTranslation` (";"->"/",
 * generate-staging-files.ts), so CS19 mostly catches legacy / hand-authored
 * regressions — new generator output already lands canonical "/".
 */

import type { ValidationFinding } from '../model'
import {
  classifyDutchSeparator,
  classifyIndonesianSeparator,
  DUTCH_COMMA_EXEMPTIONS,
} from '@/lib/capabilities'

export interface ItemForSeparatorCheck {
  base_text: string
  item_type: string
  translation_nl?: string | null
}

/** An Indonesian-side accepted-answer value to warn-check (item_answer_variants
 *  / accepted_answers:id). Empty in the current pipeline — no in-stage writer of
 *  item_answer_variants — but the validator accepts it so the warn path is
 *  exercised by tests and ready when such a writer lands. */
export interface IndonesianAnswerForSeparatorCheck {
  itemRef: string
  value: string
}

export function validateItemSeparatorConvention(
  items: ItemForSeparatorCheck[],
  indonesianAnswers: IndonesianAnswerForSeparatorCheck[] = [],
  exempt: ReadonlySet<string> = DUTCH_COMMA_EXEMPTIONS,
): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const item of items) {
    // Only lexical meanings carry the convention. A sentence / dialogue_chunk
    // "translation" is a full clause whose commas/semicolons are punctuation.
    if (item.item_type !== 'word' && item.item_type !== 'phrase') continue
    const nl = item.translation_nl
    if (!nl || nl.trim().length === 0) continue // CS4b owns missing-translation

    const violation = classifyDutchSeparator(nl, exempt)
    if (violation) {
      findings.push({
        gate: 'CS19',
        severity: 'error',
        message:
          `Item "${item.base_text}" (${item.item_type}) translation_nl ` +
          `"${nl}" uses a non-canonical alternatives separator ` +
          `(${violation === 'semicolon' ? '";"' : 'comma-as-OR'}). The canonical ` +
          `separator is "/" — the grader no longer splits on comma, so this value ` +
          `reaches the learner as one unmatchable answer. Re-author to "/".`,
        context: { itemSlug: item.base_text.slice(0, 40) },
      })
    }
  }

  for (const ans of indonesianAnswers) {
    const violation = classifyIndonesianSeparator(ans.value)
    if (violation) {
      findings.push({
        gate: 'CS19',
        severity: 'warning',
        message:
          `Indonesian answer for "${ans.itemRef}" ("${ans.value}") uses ";" as a ` +
          `separator. The canonical separator is "/". (Warn-only: Indonesian ` +
          `verbless comma-segments are legitimate, so only ";" is flagged.)`,
        context: { itemSlug: ans.itemRef.slice(0, 40) },
      })
    }
  }

  return findings
}
