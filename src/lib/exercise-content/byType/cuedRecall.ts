// builder for exerciseType='choose_form_ex'.
// User sees the user-language meaning, picks the correct Indonesian form.
// Pool option = candidate's base_text; semanticGroup looked up via candidate's
// translation so the group filter still works even though we render base_text.

import type { BuilderInputFor, BuilderResult } from './types'
import { shuffle } from './helpers'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'

export function buildCuedRecall(input: BuilderInputFor<'choose_form_ex'>): BuilderResult {
  // learningItem and primaryMeaning are non-null by contract (projector narrows).
  const promptMeaningText = input.primaryMeaning.translation_text

  // Prefer curated distractors when the pipeline has seeded a row for this cap.
  // Fall back to pickDistractorCascade over the pool when absent (deploy-order-
  // independent: pre-seeding renders the same pool-based behaviour as before).
  const capabilityId = input.block?.capabilityId
  const curatedRow = capabilityId
    ? (input.curatedCuedRecallDistractors.get(capabilityId) ?? null)
    : null

  let distractors: string[]
  if (curatedRow && curatedRow.length >= 3) {
    // Curated path: use exactly 3 curated Indonesian wrong-option strings.
    distractors = curatedRow.slice(0, 3)
  } else {
    // Pool fallback path (unchanged behaviour from before Task 8).
    const pool: DistractorCandidate[] = input.poolItems
      .filter(i => i.id !== input.learningItem.id && i.base_text)
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
    const poolDistractors = pickDistractorCascade(target, pool, 3, input.learningItem.base_text)
    if (poolDistractors.length < 3) {
      return {
        kind: 'fail',
        reasonCode: 'no_distractor_candidates',
        message: `cascade returned only ${poolDistractors.length}/3 distractors for item ${input.learningItem.id}`,
        payloadSnapshot: { learningItemId: input.learningItem.id, poolSize: pool.length, distractorsFound: poolDistractors.length },
      }
    }
    distractors = poolDistractors
  }
  const options = shuffle([input.learningItem.base_text, ...distractors])
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recall_mode' as const,
    exerciseType: 'choose_form_ex' as const,
    cuedRecallData: {
      promptMeaningText,
      options,
      correctOptionId: input.learningItem.base_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
