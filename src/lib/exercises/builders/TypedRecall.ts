// builder for exerciseType='typed_recall'.
// User sees the meaning, types the Indonesian form. Needs a user-lang meaning
// (for the prompt) and answer_variants (for fuzzy-match acceptance).

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildTypedRecall(input: BuilderInputFor<'typed_recall'>): BuilderResult {
  // learningItem and primaryMeaning are non-null by contract (projector narrows).
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'form_recall' as const,
    exerciseType: 'typed_recall' as const,
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
