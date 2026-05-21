// builder for exerciseType='recognition_mcq'.
// User sees the Indonesian word, picks the user-language meaning from 4 options.
// Pool option = each candidate's user-language translation.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'

export function buildRecognitionMCQ(input: BuilderInputFor<'recognition_mcq'>): BuilderResult {
  // learningItem and primaryMeaning are non-null by contract (projector narrows).
  const correctAnswer = input.primaryMeaning.translation_text

  // Pool option = candidate's user-language translation.
  const pool: DistractorCandidate[] = input.poolItems
    .filter(i => i.id !== input.learningItem.id)
    .flatMap(i => {
      const ms = input.poolMeaningsByItem.get(i.id) ?? []
      const t = (ms.find(m => m.translation_language === input.userLanguage && m.is_primary)
        ?? ms.find(m => m.translation_language === input.userLanguage))?.translation_text
      if (!t || t === correctAnswer) return []
      return [{
        id: i.id,
        option: t,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: getSemanticGroup(t, input.userLanguage),
      }]
    })

  const target = {
    itemType: input.learningItem.item_type,
    pos: input.learningItem.pos ?? null,
    level: input.learningItem.level,
    semanticGroup: getSemanticGroup(correctAnswer, input.userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3, correctAnswer)
  if (distractors.length < 3) {
    return {
      kind: 'fail',
      reasonCode: 'no_distractor_candidates',
      message: `cascade returned only ${distractors.length}/3 distractors for item ${input.learningItem.id}`,
      payloadSnapshot: { learningItemId: input.learningItem.id, poolSize: pool.length, distractorsFound: distractors.length },
    }
  }
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recognition' as const,
    exerciseType: 'recognition_mcq' as const,
    distractors,
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
