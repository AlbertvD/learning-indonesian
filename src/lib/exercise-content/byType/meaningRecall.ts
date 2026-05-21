// builder for exerciseType='meaning_recall'.
// Contract guarantees learningItem + primaryMeaning are non-null.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildMeaningRecall(input: BuilderInputFor<'meaning_recall'>): BuilderResult {
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
