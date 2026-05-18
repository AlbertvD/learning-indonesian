// builder for exerciseType='cloze' (typed cloze, not MCQ).
// User sees a sentence with `___` blank, types the missing word.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildCloze(input: BuilderInputFor<'cloze'>): BuilderResult {
  // learningItem and clozeContext are non-null by contract (projector narrows).
  if (!input.clozeContext.source_text.includes('___')) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_cloze',
      message: `cloze context missing '___' marker (item ${input.learningItem.id})`,
      payloadSnapshot: { contextId: input.clozeContext.id, sourceTextSample: input.clozeContext.source_text.slice(0, 200) },
    }
  }
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'form_recall' as const,
    exerciseType: 'cloze' as const,
    clozeContext: {
      sentence: input.clozeContext.source_text,
      targetWord: input.learningItem.base_text,
      translation: input.clozeContext.translation_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
