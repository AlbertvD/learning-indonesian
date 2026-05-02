// builder for exerciseType='typed_recall'.
// User sees the meaning, types the Indonesian form. Needs a user-lang meaning
// (for the prompt) and answer_variants (for fuzzy-match acceptance).

import type { BuilderInput, BuilderResult } from './types'
import { pickUserLangMeaning } from './helpers'
import { audibleTextFieldsOf } from '@/lib/session/collectAudibleTexts'

export function buildTypedRecall(input: BuilderInput): BuilderResult {
  if (!input.learningItem) {
    return { kind: 'fail', reasonCode: 'item_not_found', message: 'typed_recall requires a learningItem' }
  }
  const primary = pickUserLangMeaning(input.meanings, input.userLanguage)
  if (!primary) {
    return {
      kind: 'fail',
      reasonCode: 'no_meaning_in_lang',
      message: `no ${input.userLanguage} meaning for item ${input.learningItem.id}`,
      payloadSnapshot: { learningItemId: input.learningItem.id, userLanguage: input.userLanguage },
    }
  }
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
