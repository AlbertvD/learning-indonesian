// builder for exerciseType='cloze' (typed cloze, not MCQ).
// User sees a sentence with `___` blank, types the missing word.
//
// Two source-kind paths post the 2026-05-21 lib/exercise-content fold PR-B:
//   - item-sourced: sentence + translation come from input.clozeContext;
//     targetWord = input.learningItem.base_text.
//   - dialogue_line-sourced: sentence + translation + targetWord all come
//     from input.dialogueLine (assembled by adapter.fetchForDialogueLineBlocks
//     from cloze_context + cloze_answer + translation:l1 artifacts).
//
// The projector enforces "exactly one of learningItem / dialogueLine is
// non-null" before this packager runs (renderContracts.ts projectBuilderInput).

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildCloze(input: BuilderInputFor<'cloze'>): BuilderResult {
  // Dialogue-line path: input fields come from artifact payloads.
  if (input.dialogueLine) {
    if (!input.dialogueLine.sourceText.includes('___')) {
      return {
        kind: 'fail',
        reasonCode: 'malformed_cloze',
        message: `dialogue_line cloze source_text missing '___' marker (sourceRef ${input.dialogueLine.sourceRef})`,
        payloadSnapshot: {
          sourceRef: input.dialogueLine.sourceRef,
          sourceTextSample: input.dialogueLine.sourceText.slice(0, 200),
        },
      }
    }
    const exerciseItem = {
      learningItem: null,
      meanings: input.meanings,
      contexts: input.contexts,
      answerVariants: input.answerVariants,
      skillType: 'form_recall' as const,
      exerciseType: 'cloze' as const,
      clozeContext: {
        sentence: input.dialogueLine.sourceText,
        targetWord: input.dialogueLine.targetWord,
        translation: input.dialogueLine.translation,
        speaker: input.dialogueLine.speaker,
      },
    }
    return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
  }

  // Item-sourced path: projector guarantees both learningItem and clozeContext
  // are non-null when dialogueLine is null. The `!` asserts that to TS.
  const learningItem = input.learningItem!
  const clozeContext = input.clozeContext!
  if (!clozeContext.source_text.includes('___')) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_cloze',
      message: `cloze context missing '___' marker (item ${learningItem.id})`,
      payloadSnapshot: { contextId: clozeContext.id, sourceTextSample: clozeContext.source_text.slice(0, 200) },
    }
  }
  const exerciseItem = {
    learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'form_recall' as const,
    exerciseType: 'cloze' as const,
    clozeContext: {
      sentence: clozeContext.source_text,
      targetWord: learningItem.base_text,
      translation: clozeContext.translation_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
