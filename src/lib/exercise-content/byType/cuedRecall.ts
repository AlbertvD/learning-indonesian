// builder for exerciseType='choose_form_ex'.
//
// Item path: user sees the user-language meaning, picks the correct Indonesian
// form. Pool option = candidate's base_text; semanticGroup looked up via
// candidate's translation so the group filter still works even though we render
// base_text.
//
// word_form_pair_src path (morphology phase-b): the recognise_word_form_link_cap
// MCQ — "which affix formed this word?" (prompt = derived form, options = catalog
// affixes, distractors derived deterministically from the affix catalog, no stored
// row). The per-pair allomorph MCQ was retired (2026-06-17 cap-model fix):
// nasalization is taught at the rule tier (grammar_pattern_src recognise/contrast/
// produce, ADR 0017), not per word_form_pair.

import type { BuilderInputFor, BuilderResult } from './types'
import type { ExerciseItem, LearningItem } from '@/types/learning'
import { shuffle } from './helpers'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'
import { distractorAffixes, itemSlug } from '@/lib/capabilities'

// Register-pair distractor guard (spec docs/plans/2026-07-09-spreektaal-
// lesson-woven-core.md §4): a candidate that IS the answer's
// register_counterpart, or that NAMES the answer as ITS register_counterpart,
// is the same word in the other register — presenting it as a wrong option
// would give the MCQ two correct choices (the formal item's choose_form_ex
// draws from the same lesson's item pool, which now includes its informal
// twin). Resolved through itemSlug (the canonical base_text mint), never a
// bespoke compare, so slug edge cases can't diverge from the seed-time
// validator. Inert while the register/register_counterpart columns don't
// exist (both undefined on every row until the parallel schema PR lands).
function isRegisterTwin(candidate: LearningItem, answer: LearningItem): boolean {
  const candidateNamesAnswer = candidate.register_counterpart != null
    && itemSlug(candidate.register_counterpart) === answer.normalized_text
  const answerNamesCandidate = answer.register_counterpart != null
    && itemSlug(answer.register_counterpart) === candidate.normalized_text
  return candidateNamesAnswer || answerNamesCandidate
}

export function buildCuedRecall(input: BuilderInputFor<'choose_form_ex'>): BuilderResult {
  // word_form_pair_src path — input.affixedFormPair is populated; learningItem null.
  if (input.affixedFormPair) {
    const { derived, direction, affix } = input.affixedFormPair
    // Only recognise_word_form_link_cap (direction=derived_to_root) renders here;
    // produce_derived_form_cap renders typed (type_form_ex). Fail loud on any other
    // direction reaching this builder — the per-pair allomorph MCQ was retired.
    if (direction !== 'derived_to_root') {
      return {
        kind: 'fail',
        reasonCode: 'malformed_payload',
        message: `choose_form_ex word_form_pair_src cap has unexpected direction "${direction}" — only derived_to_root (recognise_word_form_link_cap) renders here`,
        payloadSnapshot: { sourceRef: input.affixedFormPair.sourceRef, direction },
      }
    }
    if (!affix) {
      return {
        kind: 'fail',
        reasonCode: 'malformed_payload',
        message: 'choose_form_ex word_form_pair_src cap has no affix — cannot build catalog distractors',
        payloadSnapshot: { sourceRef: input.affixedFormPair.sourceRef, direction },
      }
    }
    // recognise_word_form_link_cap — "which affix formed this word?"
    const promptMeaningText = derived
    const correctOptionId = affix
    const distractors = distractorAffixes(affix).slice(0, 3)

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
      .filter(i => i.id !== learningItem.id && i.base_text && !isRegisterTwin(i, learningItem))
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
