/**
 * CS24 — produce-exercise EFFECTIVENESS gate (distinct from CS13 shape).
 *
 * CS13 certifies a grammar exercise's typed-row *shape* (Zod, NOT NULL shadow).
 * This gate certifies a different invariant: that a PRODUCE exercise is one the
 * runtime grader can actually grade. The two produce types
 * (`transform_sentence_ex`, `translate_sentence_ex`) are typed answers checked by
 * `checkAnswer`, whose normalization erases case, punctuation, and treats "/" as
 * an OR-separator. A produce exercise whose only difference from its prompt lives
 * in those erased characters is silently ungradeable — it accepts the unchanged
 * prompt (capitalization-only "fixes", punctuation-only question forms, verbatim
 * source as an accepted answer) or accepts a fragment (slash word-group lists).
 *
 * The JUDGMENT is NOT made here. It is owned by the grading module
 * (`findIneffectiveProduceReason`, `@/lib/answerNormalization`) — the dual of
 * `checkAnswer`, using the grader's OWN `normalizeAnswer` so the gate can never
 * drift from the matcher it protects. This file is a THIN adapter: map each
 * produce candidate to (source, acceptableAnswers) and ask the module. This
 * mirrors CS19, which shares its separator predicate with the runtime grader
 * and HC24. The live-DB twin is HC35 (catches legacy rows CS24 cannot see —
 * already-published candidates are not re-projected here).
 *
 * Severity ERROR: an ineffective produce exercise is a correctness defect (the
 * learner is told "correct" without performing the transformation), not a smell.
 */

import { findIneffectiveProduceReason } from '@/lib/answerNormalization'
import type { ValidationFinding } from '../model'
import type { CandidateLike } from './candidatePayload'
import { GRAMMAR_EXERCISE_TYPES, extractAnswerKey } from './candidatePayload'
import { buildGrammarExerciseRow } from '../projectors/grammarExerciseRows'

/** The two produce exercise types and the typed-row column that holds the prompt
 *  the learner transforms. `checkAnswer` compares the typed answer against
 *  `acceptable_answers`; gradeability is a property of that pair. */
const PRODUCE_SOURCE_COLUMN: Record<string, string> = {
  transform_sentence_ex: 'source_sentence',
  translate_sentence_ex: 'source_language_sentence',
}

const REASON_MESSAGE: Record<string, string> = {
  answer_equals_prompt:
    'an acceptable answer normalizes identically to the prompt — the grader (which lowercases + strips punctuation) accepts the unchanged prompt, so the transformation is untested',
  slash_fragments_answer:
    'an acceptable answer contains "/", which the grader reads as OR-alternatives — a single fragment is accepted as the whole answer',
}

export function validateGrammarExerciseEffectiveness(candidates: CandidateLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const [idx, candidate] of candidates.entries()) {
    const exerciseType = candidate.exercise_type
    if (typeof exerciseType !== 'string') continue
    const sourceColumn = PRODUCE_SOURCE_COLUMN[exerciseType]
    if (!sourceColumn || !GRAMMAR_EXERCISE_TYPES.has(exerciseType)) continue
    // Mirror projectGrammar's write filter (same as CS13).
    if (candidate.review_status !== 'pending_review' && candidate.review_status !== 'approved') continue
    if (!candidate.payload || typeof candidate.payload !== 'object') continue

    const built = buildGrammarExerciseRow(exerciseType, candidate.payload, extractAnswerKey(exerciseType, candidate.payload))
    if (!built) continue
    const columns = built.columns as Record<string, unknown>
    const source = columns[sourceColumn]
    const acceptable = columns.acceptable_answers
    if (typeof source !== 'string' || !Array.isArray(acceptable)) continue // CS13 owns the shape failure

    const reason = findIneffectiveProduceReason(source, acceptable as string[])
    if (reason) {
      findings.push({
        gate: 'CS24',
        severity: 'error',
        message: `Ineffective produce exercise ${exerciseType}: ${REASON_MESSAGE[reason]}.`,
        context: { itemSlug: `candidate[${idx}]:${exerciseType}`, table: built.table },
      })
    }
  }

  return findings
}
