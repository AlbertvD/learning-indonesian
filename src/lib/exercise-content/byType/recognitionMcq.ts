// builder for exerciseType='choose_meaning_ex'.
// User sees the Indonesian word, picks the user-language meaning from 4 options.
// Pool option = each candidate's user-language translation.

import type { BuilderInputFor, BuilderResult } from './types'
import type { ExerciseItem } from '@/types/learning'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'
import { shuffle } from './helpers'
import { pickMeaningDistractors } from '../morphologyDistractors'

export function buildRecognitionMCQ(input: BuilderInputFor<'choose_meaning_ex'>): BuilderResult {
  // ADR 0021 — morphology MEANING card (word_form_pair_src path): "what does
  // <derived> mean?". Prompt = the derived form, options = its gloss + deterministic
  // distractors (root meaning + family + pool). Rendered via cuedRecallData (the
  // learningItem-less prompt+options shape), since there is no learningItem here.
  if (input.affixedFormPair) {
    const afp = input.affixedFormPair
    const correctGloss = afp.derivedGloss
    if (!correctGloss) {
      return {
        kind: 'fail',
        reasonCode: 'malformed_payload',
        message: `choose_meaning_ex word_form_pair_src cap has no derived gloss — meaning card has no answer`,
        payloadSnapshot: { sourceRef: afp.sourceRef, derived: afp.derived },
      }
    }
    const distractors = pickMeaningDistractors({
      correctGloss,
      rootMeaning: afp.rootMeaning ?? null,
      siblingGlosses: afp.siblingGlosses ?? [],
      poolGlosses: afp.poolGlosses ?? [],
    })
    if (distractors.length < 3) {
      return {
        kind: 'fail',
        reasonCode: 'no_distractor_candidates',
        message: `choose_meaning_ex word_form_pair_src cap produced only ${distractors.length}/3 meaning distractors for "${afp.derived}"`,
        payloadSnapshot: { sourceRef: afp.sourceRef, derived: afp.derived, distractorsFound: distractors.length },
      }
    }
    const options = shuffle([correctGloss, ...distractors])
    const exerciseItem: ExerciseItem = {
      learningItem: null,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: 'recognise_mode',
      exerciseType: 'choose_meaning_ex',
      cuedRecallData: { promptMeaningText: afp.derived, options, correctOptionId: correctGloss },
    }
    return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
  }

  // Item path — learningItem + primaryMeaning are non-null by contract (the
  // projector narrows when the word_form_pair_src path is not active).
  if (!input.learningItem || !input.primaryMeaning) {
    return {
      kind: 'fail',
      reasonCode: 'item_not_found',
      message: 'choose_meaning_ex item path requires a learningItem + primaryMeaning',
      payloadSnapshot: {},
    }
  }
  // Capture as non-null locals — TS loses property-narrowing on `input.x` inside
  // the pool closures below, so bind once here.
  const learningItem = input.learningItem
  const primaryMeaning = input.primaryMeaning
  const correctAnswer = primaryMeaning.translation_text

  // Prefer curated distractors when the pipeline has seeded a row for this cap.
  // Fall back to pickDistractorCascade over the pool when absent (deploy-order-
  // independent: pre-seeding renders the same pool-based behaviour as before).
  const capabilityId = input.block?.capabilityId
  const curatedRow = capabilityId
    ? (input.curatedRecognitionDistractors.get(capabilityId) ?? null)
    : null

  let distractors: string[]
  if (curatedRow && curatedRow.length >= 3) {
    // Curated path: use exactly 3 curated NL wrong-option strings.
    distractors = curatedRow.slice(0, 3)
  } else {
    // Pool fallback path (unchanged behaviour from before Task 8).
    const pool: DistractorCandidate[] = input.poolItems
      .filter(i => i.id !== learningItem.id)
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
      itemType: learningItem.item_type,
      pos: learningItem.pos ?? null,
      level: learningItem.level,
      semanticGroup: getSemanticGroup(correctAnswer, input.userLanguage),
    }
    const poolDistractors = pickDistractorCascade(target, pool, 3, correctAnswer)
    if (poolDistractors.length < 3) {
      return {
        kind: 'fail',
        reasonCode: 'no_distractor_candidates',
        message: `cascade returned only ${poolDistractors.length}/3 distractors for item ${learningItem.id}`,
        payloadSnapshot: { learningItemId: learningItem.id, poolSize: pool.length, distractorsFound: poolDistractors.length },
      }
    }
    distractors = poolDistractors
  }
  const exerciseItem = {
    learningItem: learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recognise_mode' as const,
    exerciseType: 'choose_meaning_ex' as const,
    distractors,
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
