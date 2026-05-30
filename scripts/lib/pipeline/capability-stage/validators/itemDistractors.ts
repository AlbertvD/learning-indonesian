/**
 * CS16 — Item distractor quality validator (post-write, item kind).
 *
 * Relocates `checkVocabEnrichments` §12 from `lint-staging.ts` (item kind,
 * Slice 1, ADR 0013 §6) into the Capability Gate post-write layer.
 *
 * The original lint-staging check ran against the staging-file `vocab-enrichments.ts`
 * array. This validator runs against the three curated-distractor tables JUST
 * written by the in-stage generator — `recognition_mcq_distractors`,
 * `cued_recall_distractors`, `cloze_mcq_item_distractors` — using the DB pool
 * for in-pool checks.
 *
 * Rules (mirroring lint-staging.ts checkVocabEnrichments ~:947, linguist-reviewer.md §12):
 *   1. Every array has exactly 3 items.                            (error)
 *   2. No distractor equals the answer.                           (error)
 *   3. No duplicate within an array (case-insensitive trim).      (warning)
 *   4. All Indonesian-language distractors exist in the DB pool   (warning)
 *      — pool source is `learning_items.translation_nl/en` NOT
 *        `item_meanings` (PR 1 stopped writing item_meanings for items).
 *   5. No morphological variant of the answer in cued_recall /    (warning)
 *      cloze arrays (linguist-reviewer.md §12 :283).
 *
 * "In-pool" for Indonesian distractors means the distractor text exists as a
 * `normalized_text` in `learning_items` (the DB pool built post-write, which
 * includes this lesson's just-written rows — the becak ordering guarantee from
 * ADR 0013).
 *
 * POS-class matching (same word-class check) is intentionally OMITTED here:
 * the validator is pure (no Supabase client needed). POS data lives in the DB;
 * the caller that invokes this validator should pre-build the posByNormalizedText
 * map and pass it in to enable POS checking, OR the POS check can be added as
 * a separate DB-aware call in the gate. For Slice 1 the pure distractor-shape
 * checks are the primary quality gate; POS cross-check is left as a follow-up.
 */

import type { ValidationFinding } from '../model'
import { stripAffixes } from '../../../affix'

export interface DistractorSetRow {
  /** canonical_key of the capability this distractor set belongs to. */
  capabilityKey: string
  /** normalized_text of the answer item (the word being tested). */
  answerText: string
  /** Array name, for error messages. */
  arrayName: 'recognition_distractors_nl' | 'cued_recall_distractors_id' | 'cloze_distractors_id'
  /** The distractors as written. */
  distractors: string[]
  /** Whether this array contains Indonesian-language entries (false = Dutch NL). */
  isIndonesian: boolean
}

export interface ValidateItemDistractorsInput {
  sets: DistractorSetRow[]
  /** All normalized_text values in the DB learning_items pool (post-write, incl. this lesson). */
  poolNormalizedTexts: Set<string>
}

/**
 * Validates the shape and quality of curated distractor sets.
 *
 * Pure — no DB, no I/O. Caller builds sets + poolNormalizedTexts from the DB
 * (post-write, so this lesson's items are in the pool).
 */
export function validateItemDistractors(input: ValidateItemDistractorsInput): ValidationFinding[] {
  const { sets, poolNormalizedTexts } = input
  const findings: ValidationFinding[] = []

  for (const { capabilityKey, answerText, arrayName, distractors, isIndonesian } of sets) {
    const ctx = { capabilityKey, itemSlug: answerText }
    const ref = `${arrayName} for "${answerText}"`

    // Rule 1: array must have exactly 3 items.
    if (!Array.isArray(distractors) || distractors.length !== 3) {
      findings.push({
        gate: 'CS16',
        severity: 'error',
        message:
          `${ref}: expected exactly 3 distractors, got ` +
          `${Array.isArray(distractors) ? distractors.length : 'non-array'}.`,
        context: ctx,
      })
      continue // further checks are meaningless on wrong-length arrays
    }

    const answerKey = answerText.toLowerCase().trim()
    const seen = new Set<string>()

    for (const d of distractors) {
      const key = String(d).toLowerCase().trim()

      // Rule 2: distractor must not equal the answer.
      if (key === answerKey) {
        findings.push({
          gate: 'CS16',
          severity: 'error',
          message: `${ref}: distractor "${d}" equals the answer "${answerText}".`,
          context: ctx,
        })
      }

      // Rule 3: no intra-array duplicate.
      if (seen.has(key)) {
        findings.push({
          gate: 'CS16',
          severity: 'warning',
          message: `${ref}: duplicate distractor "${d}" within array.`,
          context: ctx,
        })
      }
      seen.add(key)

      // Rule 4: Indonesian distractors must be in the learning_items pool.
      // Pool is `normalized_text` values, which are lowercased. Single-word
      // only (phrases are harder to look up and produce many false positives).
      if (isIndonesian && !poolNormalizedTexts.has(key) && key.split(/\s+/).length === 1 && key.length > 2) {
        findings.push({
          gate: 'CS16',
          severity: 'warning',
          message:
            `${ref}: distractor "${d}" not found in the learning_items pool ` +
            `(normalized_text). Add it to a lesson's vocabulary or use a pool word.`,
          context: ctx,
        })
      }
    }

    // Rule 5: morphological-variant check for Indonesian cued_recall / cloze arrays.
    if (isIndonesian && (arrayName === 'cued_recall_distractors_id' || arrayName === 'cloze_distractors_id')) {
      const answerRoot = stripAffixes(answerKey)
      if (answerRoot.length >= 3) {
        for (const d of distractors) {
          const distractorRoot = stripAffixes(String(d).toLowerCase().trim())
          if (distractorRoot === answerRoot && distractorRoot.length >= 3) {
            findings.push({
              gate: 'CS16',
              severity: 'warning',
              message:
                `${ref}: distractor "${d}" is a morphological variant of ` +
                `answer "${answerText}" (shared root "${answerRoot}"). ` +
                `Per linguist-reviewer.md §12: cued_recall/cloze distractors ` +
                `must not share a root with the answer.`,
              context: ctx,
            })
          }
        }
      }
    }
  }

  return findings
}
