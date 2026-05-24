/**
 * grammarExerciseRows — pure mapper from a grammar exercise candidate's
 * `payload_json` + `answer_key_json` (the exercise_variants shape) to the typed
 * grammar-exercise table columns (PR 4, target plan Decision B).
 *
 * SINGLE SOURCE OF TRUTH for the payload→typed-columns transform: both the
 * capability-stage writer (runner step 10, future candidate publishes) and the
 * one-shot bridge (scripts/migrate-typed-tables-pr4-grammar.ts, existing 716
 * rows) call this so the two paths can never drift. The per-table Zod validator
 * (validators/grammarExercises.ts) validates the output of this mapper.
 *
 * Column names mirror scripts/migration.sql:2483-2600 exactly. `options` shapes
 * differ per audit I2: contrast_pair = [{id,text}], cloze_mcq = string[]. The
 * answer key (correct/acceptable answers) is read from answer_key_json first,
 * falling back to payload_json — matching the legacy byType builders.
 */

export const GRAMMAR_EXERCISE_TABLE: Record<string, string> = {
  contrast_pair: 'contrast_pair_exercises',
  sentence_transformation: 'sentence_transformation_exercises',
  constrained_translation: 'constrained_translation_exercises',
  cloze_mcq: 'cloze_mcq_exercises',
}

export interface GrammarExerciseRow {
  /** Target typed table. */
  table: string
  /** Typed columns (excluding grammar_pattern_id / lesson_id / is_active, which
   *  the caller supplies from the variant's keys). */
  columns: Record<string, unknown>
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Build the typed-table columns for one grammar exercise. Returns null for a
 * non-grammar exercise_type (the caller skips it). Does NOT validate — feed the
 * result to validateGrammarExerciseRow / the DB NOT NULL constraints.
 */
export function buildGrammarExerciseRow(
  exerciseType: string,
  payload: Record<string, unknown>,
  answerKey: Record<string, unknown> | null | undefined,
): GrammarExerciseRow | null {
  const ak = answerKey ?? {}
  switch (exerciseType) {
    case 'contrast_pair':
      return {
        table: GRAMMAR_EXERCISE_TABLE.contrast_pair,
        columns: {
          prompt_text: str(payload.promptText),
          target_meaning: str(payload.targetMeaning),
          options: Array.isArray(payload.options) ? payload.options : [],
          correct_option_id: str(ak.correctOptionId ?? payload.correctOptionId),
          explanation_text: str(payload.explanationText),
        },
      }
    case 'sentence_transformation':
      return {
        table: GRAMMAR_EXERCISE_TABLE.sentence_transformation,
        columns: {
          source_sentence: str(payload.sourceSentence),
          transformation_instruction: str(payload.transformationInstruction),
          hint_text: typeof payload.hintText === 'string' ? payload.hintText : null,
          acceptable_answers: strArray(ak.acceptableAnswers ?? payload.acceptableAnswers),
          explanation_text: str(payload.explanationText),
        },
      }
    case 'constrained_translation':
      return {
        table: GRAMMAR_EXERCISE_TABLE.constrained_translation,
        columns: {
          source_language_sentence: str(payload.sourceLanguageSentence),
          required_target_pattern: str(payload.requiredTargetPattern),
          disallowed_shortcut_forms: strArray(ak.disallowedShortcutForms ?? payload.disallowedShortcutForms),
          acceptable_answers: strArray(ak.acceptableAnswers ?? payload.acceptableAnswers),
          explanation_text: str(payload.explanationText),
        },
      }
    case 'cloze_mcq':
      return {
        table: GRAMMAR_EXERCISE_TABLE.cloze_mcq,
        columns: {
          sentence: str(payload.sentence),
          translation: str(payload.translation),
          options: strArray(payload.options),
          correct_option_id: str(ak.correctOptionId ?? payload.correctOptionId),
          explanation_text: str(payload.explanationText),
        },
      }
    default:
      return null
  }
}
