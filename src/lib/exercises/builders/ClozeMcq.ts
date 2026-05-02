// builder for exerciseType='cloze_mcq'.
//
// Two paths per spec §6.2:
//   1. Authored: variant.payload_json carries sentence + options + correct.
//   2. Runtime: no active variant — build cloze sentence from a cloze-typed
//      context and pull distractors from the cascade. Mirrors legacy
//      makeClozeMcq at sessionQueue.ts:984-1027.
//
// The authored path is tried first.

import type { BuilderInput, BuilderResult } from './types'
import { pickUserLangMeaning, shuffle } from './helpers'
import { audibleTextFieldsOf } from '@/lib/session/collectAudibleTexts'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'

export function buildClozeMcq(input: BuilderInput): BuilderResult {
  if (!input.learningItem) {
    return { kind: 'fail', reasonCode: 'item_not_found', message: 'cloze_mcq requires a learningItem' }
  }

  // Authored path
  if (input.variant && input.variant.exercise_type === 'cloze_mcq') {
    const payload = input.variant.payload_json as Record<string, unknown>
    const answerKey = input.variant.answer_key_json as Record<string, unknown> | null
    const sentence = (payload.sentence as string) || (input.contexts.find(c => c.context_type === 'cloze')?.source_text) || ''
    const options = (payload.options as string[]) || []
    const correctOptionId = (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || ''
    if (!sentence || options.length === 0 || !correctOptionId) {
      return {
        kind: 'fail',
        reasonCode: 'malformed_payload',
        message: `cloze_mcq variant ${input.variant.id} missing sentence/options/correctOptionId`,
        payloadSnapshot: { variantId: input.variant.id, hasSentence: !!sentence, optionsLength: options.length, hasCorrect: !!correctOptionId },
      }
    }
    const exerciseItem = {
      learningItem: input.learningItem,
      meanings: input.meanings,
      contexts: input.contexts,
      answerVariants: input.answerVariants,
      skillType: 'recognition' as const,
      exerciseType: 'cloze_mcq' as const,
      clozeMcqData: {
        sentence,
        translation: (payload.translation as string | null) ?? null,
        options,
        correctOptionId,
        explanationText: (payload.explanationText as string) || undefined,
      },
    }
    return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
  }

  // Runtime path
  const clozeContext = input.contexts.find(c => c.context_type === 'cloze')
  if (!clozeContext) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_cloze',
      message: `no cloze context for runtime cloze_mcq (item ${input.learningItem.id})`,
      payloadSnapshot: { learningItemId: input.learningItem.id, contextCount: input.contexts.length },
    }
  }
  const primary = pickUserLangMeaning(input.meanings, input.userLanguage)
  const targetTranslation = primary?.translation_text ?? ''
  const pool: DistractorCandidate[] = input.poolItems
    .filter(i => i.id !== input.learningItem!.id && i.base_text)
    .map(i => {
      const ms = input.poolMeaningsByItem.get(i.id) ?? []
      const t = (ms.find(m => m.translation_language === input.userLanguage && m.is_primary)
        ?? ms.find(m => m.translation_language === input.userLanguage))?.translation_text
      return {
        id: i.id,
        option: i.base_text,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: t ? getSemanticGroup(t, input.userLanguage) : null,
      }
    })
  const target = {
    itemType: input.learningItem.item_type,
    pos: input.learningItem.pos ?? null,
    level: input.learningItem.level,
    semanticGroup: getSemanticGroup(targetTranslation, input.userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3, input.learningItem.base_text)
  if (distractors.length < 3) {
    return {
      kind: 'fail',
      reasonCode: 'no_distractor_candidates',
      message: `runtime cloze_mcq cascade returned only ${distractors.length}/3 distractors for item ${input.learningItem.id}`,
      payloadSnapshot: { learningItemId: input.learningItem.id, poolSize: pool.length, distractorsFound: distractors.length },
    }
  }
  const options = shuffle([input.learningItem.base_text, ...distractors])
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recognition' as const,
    exerciseType: 'cloze_mcq' as const,
    clozeMcqData: {
      sentence: clozeContext.source_text,
      translation: clozeContext.translation_text,
      options,
      correctOptionId: input.learningItem.base_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
