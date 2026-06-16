// builder for exerciseType='choose_meaning_from_audio_ex'.
// Identical shape to choose_meaning_ex; the component reads exerciseType to
// decide whether to hide the Indonesian text and play audio instead.
// Audio resolution is upstream (SessionAudioContext).

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'

export function buildListeningMCQ(input: BuilderInputFor<'choose_meaning_from_audio_ex'>): BuilderResult {
  // learningItem and primaryMeaning are non-null by contract (projector narrows).
  const correctAnswer = input.primaryMeaning.translation_text

  // Prefer curated distractors (cap-v2): recognise_meaning_from_audio_cap caps carry meaning
  // distractors in the same map as choose_meaning_ex. Fall back to the pool
  // cascade when a cap has no curated row (rare — undersupplied Pool(N)).
  const capabilityId = input.block?.capabilityId
  const curatedRow = capabilityId
    ? (input.curatedRecognitionDistractors.get(capabilityId) ?? null)
    : null

  let distractors: string[]
  if (curatedRow && curatedRow.length >= 3) {
    distractors = curatedRow.slice(0, 3)
  } else {
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
    const poolDistractors = pickDistractorCascade(target, pool, 3, correctAnswer)
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
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recognition' as const,
    exerciseType: 'choose_meaning_from_audio_ex' as const,
    distractors,
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
