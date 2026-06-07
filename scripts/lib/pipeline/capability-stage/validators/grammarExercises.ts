/**
 * CS13 — grammar-exercise typed-row shape validator (PR 4).
 *
 * Pre-write gate over the projectable grammar candidates (pending_review /
 * approved — the rows runner step 10 will write). Each candidate's payload is
 * mapped to its typed-table columns via buildGrammarExerciseRow, then validated
 * by a PER-TABLE Zod schema. There is intentionally NO shared `options`
 * validator: per audit I2, contrast_pair_exercises.options is [{id,text}] while
 * cloze_mcq_exercises.options is string[] — a shared helper would silently
 * accept the wrong shape. Fails CRITICAL (severity error → aborts publish),
 * mirroring the DB NOT NULL constraints it shadows.
 *
 * Already-`published` candidates are not re-projected by projectGrammar, so they
 * are out of scope here; the one-shot bridge validates the existing 716.
 */

import { z } from 'zod'
import type { ValidationFinding } from '../model'
import type { CandidateLike } from './candidatePayload'
import { GRAMMAR_EXERCISE_TYPES, extractAnswerKey } from './candidatePayload'
import { buildGrammarExerciseRow } from '../projectors/grammarExerciseRows'

const nonEmpty = z.string().min(1)
const nonEmptyArray = z.array(nonEmpty).min(1)

/** F4: soft conciseness cap for grammar explanation_text. Over this, a WARNING
 *  (never an error/drop) surfaces a verbose explanation for review — the A/B
 *  showed explanations drifting to 260–304 chars; a terse one or two sentences
 *  (~≤160) teaches better. Tunable. */
export const GRAMMAR_EXPLANATION_SOFT_MAX = 220

const contrastPairSchema = z.object({
  prompt_text: nonEmpty,
  target_meaning: nonEmpty,
  options: z.array(z.object({ id: nonEmpty, text: nonEmpty })).min(2),
  correct_option_id: nonEmpty,
  explanation_text: nonEmpty,
}).refine(
  (r) => r.options.some((o) => o.id === r.correct_option_id),
  { message: 'correct_option_id must match one of options[].id' },
)

const sentenceTransformationSchema = z.object({
  source_sentence: nonEmpty,
  transformation_instruction: nonEmpty,
  hint_text: z.string().nullable(),
  acceptable_answers: nonEmptyArray,
  explanation_text: nonEmpty,
})

const constrainedTranslationSchema = z.object({
  source_language_sentence: nonEmpty,
  required_target_pattern: nonEmpty,
  disallowed_shortcut_forms: z.array(z.string()),  // may be empty (DB default '{}')
  acceptable_answers: nonEmptyArray,
  explanation_text: nonEmpty,
})

const clozeMcqSchema = z.object({
  sentence: nonEmpty,
  translation: nonEmpty,
  options: nonEmptyArray,  // string[] (audit I2 — differs from contrast_pair)
  correct_option_id: nonEmpty,
  explanation_text: nonEmpty,
}).refine(
  (r) => r.options.includes(r.correct_option_id),
  { message: 'correct_option_id must be one of options' },
)

/**
 * Per-type Zod schema over the typed-table columns produced by
 * buildGrammarExerciseRow. EXPORTED (Slice 2 Task 4) so the in-stage generator
 * (`generateGrammarExercises.ts`) validates its LLM output against the exact
 * same DDL-shadowing schemas the CS13 pre-write gate uses — one home, no drift.
 */
export const SCHEMA_BY_TYPE: Record<string, z.ZodTypeAny> = {
  contrast_pair: contrastPairSchema,
  sentence_transformation: sentenceTransformationSchema,
  constrained_translation: constrainedTranslationSchema,
  cloze_mcq: clozeMcqSchema,
}

export function validateGrammarExercises(candidates: CandidateLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const [idx, candidate] of candidates.entries()) {
    const exerciseType = candidate.exercise_type
    if (typeof exerciseType !== 'string' || !GRAMMAR_EXERCISE_TYPES.has(exerciseType)) continue
    // Only the rows the writer will actually project (mirror projectGrammar's filter).
    if (candidate.review_status !== 'pending_review' && candidate.review_status !== 'approved') continue
    if (!candidate.payload || typeof candidate.payload !== 'object') continue  // CS3 already flagged this

    const slug = `candidate[${idx}]:${exerciseType}`
    const answerKey = extractAnswerKey(exerciseType, candidate.payload)
    const built = buildGrammarExerciseRow(exerciseType, candidate.payload, answerKey)
    if (!built) continue

    const schema = SCHEMA_BY_TYPE[exerciseType]
    const parsed = schema.safeParse(built.columns)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
      findings.push({
        gate: 'CS13',
        severity: 'error',
        message: `Grammar exercise ${exerciseType} fails typed-row shape (${built.table}): ${issues}`,
        context: { itemSlug: slug, table: built.table },
      })
      continue
    }

    // F4 (soft, warning-only): flag a verbose explanation for review. Never an
    // error — a long explanation is suboptimal pedagogy, not invalid data.
    const explanation = (built.columns as Record<string, unknown>).explanation_text
    if (typeof explanation === 'string' && explanation.length > GRAMMAR_EXPLANATION_SOFT_MAX) {
      findings.push({
        gate: 'CS13',
        severity: 'warning',
        message: `Grammar exercise ${exerciseType} explanation_text is verbose (${explanation.length} chars > ${GRAMMAR_EXPLANATION_SOFT_MAX}); aim for one or two short sentences (F4).`,
        context: { itemSlug: slug, table: built.table },
      })
    }
  }

  return findings
}
