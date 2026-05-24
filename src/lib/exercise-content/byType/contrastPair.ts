// builder for exerciseType='contrast_pair' (pattern source kind).
// PR 4: reads the typed contrast_pair_exercises row (input.exercise) instead of
// exercise_variants.payload_json. Contract guarantees `exercise` is non-null
// (projector). No learningItem — pattern caps are not item-rooted.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildContrastPair(input: BuilderInputFor<'contrast_pair'>): BuilderResult {
  const ex = input.exercise

  // options is jsonb [{id, text}, ...] (audit I2). ContrastPairExercise compares
  // option values directly to correctOptionId, so normalise both to plain text.
  const rawOpts = ex.options ?? []
  const optionTexts = rawOpts.map(o => o.text)
  if (optionTexts.length !== 2) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_payload',
      message: `contrast_pair exercise ${ex.id} expects 2 options, got ${optionTexts.length}`,
      payloadSnapshot: { exerciseId: ex.id, optionCount: optionTexts.length },
    }
  }
  const correctText = rawOpts.find(o => o.id === ex.correct_option_id)?.text ?? ex.correct_option_id

  const exerciseItem = {
    learningItem: null,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: [],
    skillType: 'recognition' as const,
    exerciseType: 'contrast_pair' as const,
    contrastPairData: {
      promptText: ex.prompt_text,
      targetMeaning: ex.target_meaning,
      options: optionTexts as [string, string],
      correctOptionId: correctText,
      explanationText: ex.explanation_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
