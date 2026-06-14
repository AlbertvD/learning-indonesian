// builder for exerciseType='cloze_mcq'.
//
// PATTERN-ONLY (cap-v2 #161): input.exercise is a typed cloze_mcq_exercises row
// (sentence + options string[] + correct_option_id). The former item-sourced
// runtime path (build a cloze from an item_contexts carrier + cascade distractors)
// is removed — item cloze is now typed-only (it routes to the `cloze` builder, not
// cloze_mcq). cloze_mcq serves only pattern_recognition.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildClozeMcq(input: BuilderInputFor<'cloze_mcq'>): BuilderResult {
  // Pattern-sourced — typed cloze_mcq_exercises row (contract guarantees non-null,
  // like the other grammar exercises; the projector's needsPatternExercise guard).
  const ex = input.exercise
  if (!ex.sentence || ex.options.length === 0 || !ex.correct_option_id) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_payload',
      message: `cloze_mcq exercise ${ex.id} missing sentence/options/correct_option_id`,
      payloadSnapshot: { exerciseId: ex.id, hasSentence: !!ex.sentence, optionsLength: ex.options.length, hasCorrect: !!ex.correct_option_id },
    }
  }
  const exerciseItem = {
    learningItem: null,
    grammarPatternId: ex.grammar_pattern_id,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recognition' as const,
    exerciseType: 'cloze_mcq' as const,
    clozeMcqData: {
      sentence: ex.sentence,
      translation: ex.translation,
      options: ex.options,
      correctOptionId: ex.correct_option_id,
      explanationText: ex.explanation_text || undefined,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
