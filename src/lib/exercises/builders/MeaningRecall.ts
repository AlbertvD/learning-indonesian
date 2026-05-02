// builder for exerciseType='meaning_recall'.
// Input: learningItem + meanings. Picks user-lang meaning; fails if none.

import type { BuilderInput, BuilderResult } from './types'
import { pickUserLangMeaning } from './helpers'
import { audibleTextFieldsOf } from '@/lib/session/collectAudibleTexts'

export function buildMeaningRecall(input: BuilderInput): BuilderResult {
  if (!input.learningItem) {
    return { kind: 'fail', reasonCode: 'item_not_found', message: 'meaning_recall requires a learningItem' }
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
    skillType: 'meaning_recall' as const,
    exerciseType: 'meaning_recall' as const,
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
