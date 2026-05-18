// builder for exerciseType='sentence_transformation'.
// Authored only. Contract guarantees learningItem + variant (with matching
// exercise_type) are non-null.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildSentenceTransformation(input: BuilderInputFor<'sentence_transformation'>): BuilderResult {
  const payload = input.variant.payload_json as Record<string, unknown>
  const answerKey = input.variant.answer_key_json as Record<string, unknown> | null
  const sourceSentence = (payload.sourceSentence as string) || ''
  const acceptable = (answerKey?.acceptableAnswers as string[]) || (payload.acceptableAnswers as string[]) || []

  if (!sourceSentence || acceptable.length === 0) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_payload',
      message: `sentence_transformation variant ${input.variant.id} missing sourceSentence/acceptableAnswers`,
      payloadSnapshot: { variantId: input.variant.id, hasSource: !!sourceSentence, acceptableLen: acceptable.length },
    }
  }

  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: [],
    skillType: 'form_recall' as const,
    exerciseType: 'sentence_transformation' as const,
    sentenceTransformationData: {
      sourceSentence,
      transformationInstruction: (payload.transformationInstruction as string) || '',
      acceptableAnswers: acceptable,
      hintText: payload.hintText as string | undefined,
      explanationText: (payload.explanationText as string) || '',
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
