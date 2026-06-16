// builder for exerciseType='type_meaning_ex'.
// Contract guarantees learningItem + primaryMeaning are non-null.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildMeaningRecall(input: BuilderInputFor<'type_meaning_ex'>): BuilderResult {
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recall_mode' as const,
    exerciseType: 'type_meaning_ex' as const,
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
