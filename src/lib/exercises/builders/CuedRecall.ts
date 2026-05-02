// builder for exerciseType='cued_recall'.
// User sees the user-language meaning, picks the correct Indonesian form.
// Pool option = candidate's base_text; semanticGroup looked up via candidate's
// translation so the group filter still works even though we render base_text.

import type { BuilderInput, BuilderResult } from './types'
import { pickUserLangMeaning, shuffle } from './helpers'
import { audibleTextFieldsOf } from '@/lib/session/collectAudibleTexts'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'

export function buildCuedRecall(input: BuilderInput): BuilderResult {
  if (!input.learningItem) {
    return { kind: 'fail', reasonCode: 'item_not_found', message: 'cued_recall requires a learningItem' }
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
  const promptMeaningText = primary.translation_text

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
    semanticGroup: getSemanticGroup(promptMeaningText, input.userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3, input.learningItem.base_text)
  if (distractors.length < 3) {
    return {
      kind: 'fail',
      reasonCode: 'no_distractor_candidates',
      message: `cascade returned only ${distractors.length}/3 distractors for item ${input.learningItem.id}`,
      payloadSnapshot: { learningItemId: input.learningItem.id, poolSize: pool.length, distractorsFound: distractors.length },
    }
  }
  const options = shuffle([input.learningItem.base_text, ...distractors])
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'meaning_recall' as const,
    exerciseType: 'cued_recall' as const,
    cuedRecallData: {
      promptMeaningText,
      options,
      correctOptionId: input.learningItem.base_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
