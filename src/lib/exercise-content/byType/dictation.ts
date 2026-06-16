// builder for exerciseType='type_form_from_audio_ex'.
// Audio prompt, typed Indonesian answer. Structurally identical to
// type_form_ex; only exerciseType differs so the component renders
// audio-only input. Audio resolution is upstream (SessionAudioContext).

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildDictation(input: BuilderInputFor<'type_form_from_audio_ex'>): BuilderResult {
  // learningItem is non-null by contract (projector narrows).
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'form_recall' as const,
    exerciseType: 'type_form_from_audio_ex' as const,
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
