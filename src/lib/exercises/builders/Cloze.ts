// builder for exerciseType='cloze' (typed cloze, not MCQ).
// User sees a sentence with `___` blank, types the missing word.

import type { BuilderInput, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session/collectAudibleTexts'

export function buildCloze(input: BuilderInput): BuilderResult {
  if (!input.learningItem) {
    return { kind: 'fail', reasonCode: 'item_not_found', message: 'cloze requires a learningItem' }
  }
  const clozeContext = input.contexts.find(c => c.context_type === 'cloze')
  if (!clozeContext) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_cloze',
      message: `no cloze-typed context found for item ${input.learningItem.id}`,
      payloadSnapshot: { learningItemId: input.learningItem.id, contextCount: input.contexts.length },
    }
  }
  if (!clozeContext.source_text.includes('___')) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_cloze',
      message: `cloze context missing '___' marker (item ${input.learningItem.id})`,
      payloadSnapshot: { contextId: clozeContext.id, sourceTextSample: clozeContext.source_text.slice(0, 200) },
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
      sentence: clozeContext.source_text,
      targetWord: input.learningItem.base_text,
      translation: clozeContext.translation_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
