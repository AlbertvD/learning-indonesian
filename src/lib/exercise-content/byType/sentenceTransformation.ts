// builder for exerciseType='sentence_transformation' (pattern source kind).
// PR 4: reads the typed sentence_transformation_exercises row (input.exercise)
// instead of exercise_variants.payload_json. Contract guarantees `exercise` is
// non-null (projector). No learningItem — pattern caps are not item-rooted.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildSentenceTransformation(input: BuilderInputFor<'sentence_transformation'>): BuilderResult {
  const ex = input.exercise

  if (!ex.source_sentence || ex.acceptable_answers.length === 0) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_payload',
      message: `sentence_transformation exercise ${ex.id} missing source_sentence/acceptable_answers`,
      payloadSnapshot: { exerciseId: ex.id, hasSource: !!ex.source_sentence, acceptableLen: ex.acceptable_answers.length },
    }
  }

  const exerciseItem = {
    learningItem: null,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: [],
    skillType: 'form_recall' as const,
    exerciseType: 'sentence_transformation' as const,
    sentenceTransformationData: {
      sourceSentence: ex.source_sentence,
      transformationInstruction: ex.transformation_instruction,
      acceptableAnswers: ex.acceptable_answers,
      hintText: ex.hint_text ?? undefined,
      explanationText: ex.explanation_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
