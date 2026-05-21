// builder for exerciseType='typed_recall'.
//
// Item path: user sees the meaning, types the Indonesian form. Needs a
// user-lang meaning (for the prompt) and answer_variants (for fuzzy-match
// acceptance).
//
// affixed_form_pair path (added 2026-05-21 per
// docs/plans/2026-05-21-affixed-form-pair-runtime.md): user sees one side
// of the pair (root or derived per the cap's direction), types the other.
// No meaning lookup; no answer_variants. The allomorph rule is carried on
// the exerciseItem for the wrong-answer Doorgaan screen via feedbackMapping.

import type { BuilderInputFor, BuilderResult } from './types'
import type { ExerciseItem } from '@/types/learning'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildTypedRecall(input: BuilderInputFor<'typed_recall'>): BuilderResult {
  // affixed_form_pair path — input.affixedFormPair is populated; input.learningItem is null.
  if (input.affixedFormPair) {
    const { root, derived, direction, allomorphRule } = input.affixedFormPair
    const isRootToDerived = direction === 'root_to_derived'
    const promptText = isRootToDerived
      ? `Form the meN- form of: ${root}`
      : `What is the root of: ${derived}`
    const acceptedAnswer = isRootToDerived ? derived : root
    const exerciseItem: ExerciseItem = {
      learningItem: null,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: isRootToDerived ? 'form_recall' : 'recognition',
      exerciseType: 'typed_recall',
      affixedFormPairData: {
        promptText,
        acceptedAnswer,
        direction,
        allomorphRule,
        root,
        derived,
      },
    }
    return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
  }

  // Item path — learningItem and primaryMeaning are non-null by contract
  // (the projector narrows when the affixed_form_pair path is not active).
  const exerciseItem: ExerciseItem = {
    learningItem: input.learningItem!,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'form_recall',
    exerciseType: 'typed_recall',
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
