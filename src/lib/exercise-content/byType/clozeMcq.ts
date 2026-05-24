// builder for exerciseType='cloze_mcq'.
//
// Two paths (PR 4):
//   1. Pattern-sourced: input.exercise is a typed cloze_mcq_exercises row
//      (sentence + options string[] + correct_option_id). No learningItem.
//   2. Item-sourced runtime: no exercise; build the cloze sentence from a
//      cloze-typed context and pull distractors from the cascade.
//      Originally extracted from sessionQueue.ts (retired in #7).
//
// Contract: exactly one of (exercise) OR (learningItem + clozeContext) is set —
// the projector enforces it. The legacy exercise_variants authored path is
// gone (PR 4 removed the variant slot).

import type { BuilderInputFor, BuilderResult } from './types'
import { pickUserLangMeaning, shuffle } from './helpers'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'

export function buildClozeMcq(input: BuilderInputFor<'cloze_mcq'>): BuilderResult {
  // Pattern-sourced path — typed cloze_mcq_exercises row.
  if (input.exercise) {
    const ex = input.exercise
    if (!ex.sentence || ex.options.length === 0 || !ex.correct_option_id) {
      return {
        kind: 'fail',
        reasonCode: 'malformed_payload',
        message: `cloze_mcq exercise ${ex.id} missing sentence/options/correct_option_id`,
        payloadSnapshot: { exerciseId: ex.id, hasSentence: !!ex.sentence, optionsLength: ex.options.length, hasCorrect: !!ex.correct_option_id },
      }
    }
    const exerciseItem = {
      learningItem: null,
      meanings: input.meanings,
      contexts: input.contexts,
      answerVariants: input.answerVariants,
      skillType: 'recognition' as const,
      exerciseType: 'cloze_mcq' as const,
      clozeMcqData: {
        sentence: ex.sentence,
        translation: ex.translation,
        options: ex.options,
        correctOptionId: ex.correct_option_id,
        explanationText: ex.explanation_text || undefined,
      },
    }
    return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
  }

  // Item-sourced runtime path — by projector invariant, learningItem +
  // clozeContext are non-null here.
  if (!input.learningItem || !input.clozeContext) {
    // Defensive: projector should have caught this. Treat as a contract
    // invariant violation so future debugging surfaces the right layer.
    return {
      kind: 'fail',
      reasonCode: 'malformed_cloze',
      message: `projector invariant violated: cloze_mcq has neither a pattern exercise nor item learningItem+clozeContext`,
      payloadSnapshot: { hasLearningItem: !!input.learningItem, hasClozeContext: !!input.clozeContext },
    }
  }
  const learningItem = input.learningItem
  const clozeContext = input.clozeContext
  const primary = pickUserLangMeaning(input.meanings, input.userLanguage)
  const targetTranslation = primary?.translation_text ?? ''
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
    semanticGroup: getSemanticGroup(targetTranslation, input.userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3, learningItem.base_text)
  if (distractors.length < 3) {
    return {
      kind: 'fail',
      reasonCode: 'no_distractor_candidates',
      message: `runtime cloze_mcq cascade returned only ${distractors.length}/3 distractors for item ${learningItem.id}`,
      payloadSnapshot: { learningItemId: learningItem.id, poolSize: pool.length, distractorsFound: distractors.length },
    }
  }
  const options = shuffle([learningItem.base_text, ...distractors])
  const exerciseItem = {
    learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recognition' as const,
    exerciseType: 'cloze_mcq' as const,
    clozeMcqData: {
      sentence: clozeContext.source_text,
      translation: clozeContext.translation_text,
      options,
      correctOptionId: learningItem.base_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
