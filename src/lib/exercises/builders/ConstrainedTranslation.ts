// builder for exerciseType='constrained_translation'.
// Authored only. Contract guarantees learningItem + variant (with matching
// exercise_type) are non-null.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildConstrainedTranslation(input: BuilderInputFor<'constrained_translation'>): BuilderResult {
  const payload = input.variant.payload_json as Record<string, unknown>
  const answerKey = input.variant.answer_key_json as Record<string, unknown> | null
  const acceptable = (answerKey?.acceptableAnswers as string[]) || (payload.acceptableAnswers as string[]) || []

  if (acceptable.length === 0) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_payload',
      message: `constrained_translation variant ${input.variant.id} missing acceptableAnswers`,
      payloadSnapshot: { variantId: input.variant.id, hasAcceptable: false },
    }
  }

  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: [],
    skillType: 'meaning_recall' as const,
    exerciseType: 'constrained_translation' as const,
    constrainedTranslationData: {
      sourceLanguageSentence: (payload.sourceLanguageSentence as string) || '',
      requiredTargetPattern: (payload.requiredTargetPattern as string) || '',
      patternName: '',
      acceptableAnswers: acceptable,
      disallowedShortcutForms: (answerKey?.disallowedShortcutForms as string[] | undefined)
        ?? (payload.disallowedShortcutForms as string[] | undefined),
      explanationText: (payload.explanationText as string) || '',
      targetSentenceWithBlank: payload.targetSentenceWithBlank as string | undefined,
      blankAcceptableAnswers: payload.blankAcceptableAnswers as string[] | undefined,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
