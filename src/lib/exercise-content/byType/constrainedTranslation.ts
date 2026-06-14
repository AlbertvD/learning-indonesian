// builder for exerciseType='constrained_translation' (pattern source kind).
// PR 4: reads the typed constrained_translation_exercises row (input.exercise)
// instead of exercise_variants.payload_json. Contract guarantees `exercise` is
// non-null (projector). No learningItem — pattern caps are not item-rooted.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildConstrainedTranslation(input: BuilderInputFor<'constrained_translation'>): BuilderResult {
  const ex = input.exercise

  if (ex.acceptable_answers.length === 0) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_payload',
      message: `constrained_translation exercise ${ex.id} missing acceptable_answers`,
      payloadSnapshot: { exerciseId: ex.id, hasAcceptable: false },
    }
  }

  const exerciseItem = {
    learningItem: null,
    grammarPatternId: ex.grammar_pattern_id,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: [],
    skillType: 'meaning_recall' as const,
    exerciseType: 'constrained_translation' as const,
    constrainedTranslationData: {
      sourceLanguageSentence: ex.source_language_sentence,
      requiredTargetPattern: ex.required_target_pattern,
      patternName: '',
      acceptableAnswers: ex.acceptable_answers,
      disallowedShortcutForms: ex.disallowed_shortcut_forms.length > 0 ? ex.disallowed_shortcut_forms : undefined,
      explanationText: ex.explanation_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
