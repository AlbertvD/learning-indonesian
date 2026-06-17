// builder for exerciseType='choose_form_ex'.
//
// Item path: user sees the user-language meaning, picks the correct Indonesian
// form. Pool option = candidate's base_text; semanticGroup looked up via
// candidate's translation so the group filter still works even though we render
// base_text.
//
// word_form_pair_src path (morphology phase-b): the two recognise-level MCQ caps.
// Distractors are derived deterministically from the affix catalog (no stored
// distractor row). Which MCQ is selected by the pair's direction:
//   - derived_to_root → recognise_word_form_link_cap: "which affix formed this
//     word?" — prompt = derived form, options = catalog affixes.
//   - root_to_derived → recognise_allomorph_from_root_cap: "pick the correct form
//     of this root" — prompt = root, options = the root under each allomorph class.

import type { BuilderInputFor, BuilderResult } from './types'
import type { ExerciseItem } from '@/types/learning'
import { shuffle } from './helpers'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'
import { distractorAffixes, allomorphClassesFor } from '@/lib/capabilities/affixCatalog'

export function buildCuedRecall(input: BuilderInputFor<'choose_form_ex'>): BuilderResult {
  // word_form_pair_src path — input.affixedFormPair is populated; learningItem null.
  if (input.affixedFormPair) {
    const { root, derived, direction, affix, allomorphClass } = input.affixedFormPair
    if (!affix) {
      return {
        kind: 'fail',
        reasonCode: 'malformed_payload',
        message: 'choose_form_ex word_form_pair_src cap has no affix — cannot build catalog distractors',
        payloadSnapshot: { sourceRef: input.affixedFormPair.sourceRef, direction },
      }
    }

    let promptMeaningText: string
    let correctOptionId: string
    let distractors: string[]
    if (direction === 'derived_to_root') {
      // recognise_word_form_link_cap — "which affix formed this word?"
      promptMeaningText = derived
      correctOptionId = affix
      distractors = distractorAffixes(affix).slice(0, 3)
    } else {
      // recognise_allomorph_from_root_cap — "pick the correct form of this root".
      // Wrong options = the root under the OTHER allomorph classes (naive concat,
      // which is exactly the un-applied sandhi the learner must reject).
      promptMeaningText = root
      correctOptionId = derived
      const wrong = allomorphClassesFor(affix)
        .filter((c) => c !== (allomorphClass ?? ''))
        .map((c) => `${c}${root}`)
        .filter((form) => form !== derived)
      distractors = [...new Set(wrong)].slice(0, 3)
    }

    if (distractors.length === 0) {
      return {
        kind: 'fail',
        reasonCode: 'no_distractor_candidates',
        message: `choose_form_ex word_form_pair_src cap produced no distractors for affix "${affix}" (${direction})`,
        payloadSnapshot: { sourceRef: input.affixedFormPair.sourceRef, affix, direction },
      }
    }

    const options = shuffle([correctOptionId, ...distractors])
    const exerciseItem: ExerciseItem = {
      learningItem: null,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: 'recognise_mode',
      exerciseType: 'choose_form_ex',
      cuedRecallData: { promptMeaningText, options, correctOptionId },
    }
    return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
  }

  // Item path — learningItem + primaryMeaning are non-null by contract (the
  // projector narrows when the word_form_pair_src path is not active).
  const learningItem = input.learningItem
  const primaryMeaning = input.primaryMeaning
  if (!learningItem || !primaryMeaning) {
    return {
      kind: 'fail',
      reasonCode: 'item_not_found',
      message: 'choose_form_ex item path requires a learningItem + primaryMeaning',
      payloadSnapshot: {},
    }
  }
  const promptMeaningText = primaryMeaning.translation_text

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
      .filter(i => i.id !== learningItem.id && i.base_text)
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
      itemType: learningItem.item_type,
      pos: learningItem.pos ?? null,
      level: learningItem.level,
      semanticGroup: getSemanticGroup(promptMeaningText, input.userLanguage),
    }
    const poolDistractors = pickDistractorCascade(target, pool, 3, learningItem.base_text)
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
  const options = shuffle([learningItem.base_text, ...distractors])
  const exerciseItem = {
    learningItem: learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recall_mode' as const,
    exerciseType: 'choose_form_ex' as const,
    cuedRecallData: {
      promptMeaningText,
      options,
      correctOptionId: learningItem.base_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
