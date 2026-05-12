/**
 * CS3 — exercise candidate payload validator.
 *
 * Extracted from capability-stage-legacy.ts:566–579 + the per-candidate
 * payload presence + answer-key extraction loop at legacy 597–618.
 *
 * Two sub-checks:
 *   1. Candidate has `payload` field (warning in legacy at 600–604, error here).
 *   2. Exercise type is recognized — grammar set (contrast_pair,
 *      sentence_transformation, constrained_translation, cloze_mcq) or vocab
 *      family. Unknown types fail.
 *
 * `extractAnswerKey` returns the answer_key_json that the projector / adapter
 * write into `exercise_variants`. Pulled out as a pure helper so projectors/
 * grammar.ts and tests can call it directly.
 */

import type { ValidationFinding } from '../model'

export const GRAMMAR_EXERCISE_TYPES = new Set([
  'contrast_pair',
  'sentence_transformation',
  'constrained_translation',
  'cloze_mcq',
])

const VOCAB_EXERCISE_TYPES = new Set([
  'cloze',
  'recognition_mcq',
  'cued_recall',
])

export interface CandidateLike {
  exercise_type?: string
  grammar_pattern_slug?: string | null
  payload?: Record<string, unknown> | null
  review_status?: string
}

export function validateCandidatePayload(candidates: CandidateLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const [idx, candidate] of candidates.entries()) {
    const exerciseType = candidate.exercise_type
    const slug = `candidate[${idx}]:${exerciseType ?? '?'}`
    const ctx = { itemSlug: slug }

    if (typeof exerciseType !== 'string' || exerciseType.trim().length === 0) {
      findings.push({
        gate: 'CS3',
        severity: 'error',
        message: `Candidate is missing required field exercise_type`,
        context: ctx,
      })
      continue
    }

    if (
      !GRAMMAR_EXERCISE_TYPES.has(exerciseType) &&
      !VOCAB_EXERCISE_TYPES.has(exerciseType)
    ) {
      findings.push({
        gate: 'CS3',
        severity: 'error',
        message: `Candidate exercise_type "${exerciseType}" is not in the grammar or vocab whitelists`,
        context: ctx,
      })
      continue
    }

    if (!candidate.payload || typeof candidate.payload !== 'object') {
      findings.push({
        gate: 'CS3',
        severity: 'error',
        message: `Candidate (exercise_type "${exerciseType}") is missing required field payload`,
        context: ctx,
      })
    }
  }

  return findings
}

/**
 * Extract `answer_key_json` from a candidate's payload. Mirrors
 * capability-stage-legacy.ts:613–618.
 */
export function extractAnswerKey(
  exerciseType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (exerciseType === 'contrast_pair' || exerciseType === 'cloze_mcq') {
    return { correctOptionId: payload.correctOptionId }
  }
  if (
    exerciseType === 'sentence_transformation' ||
    exerciseType === 'constrained_translation'
  ) {
    return { acceptableAnswers: payload.acceptableAnswers ?? [] }
  }
  return {}
}
