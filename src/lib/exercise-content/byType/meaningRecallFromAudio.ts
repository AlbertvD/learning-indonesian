// builder for exerciseType='type_meaning_from_audio_ex'.
// Contract guarantees learningItem + primaryMeaning are non-null (same shape
// as buildMeaningRecall/buildListeningMCQ). Four-card ladder PR-B
// (docs/plans/2026-07-09-vocab-four-card-ladder.md §2.3): ear-only typed
// meaning recall for recognise_meaning_from_audio_cap (#3′) — hear the word,
// type its L1 meaning. No Indonesian text of the word is ever surfaced by
// this packager; the component reveals it only after the answer is committed.

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildMeaningRecallFromAudio(input: BuilderInputFor<'type_meaning_from_audio_ex'>): BuilderResult {
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'recall_mode' as const,
    exerciseType: 'type_meaning_from_audio_ex' as const,
  }
  // audibleTextFieldsOf always harvests learningItem.base_text, so the
  // Indonesian clip preloads even though this packager never puts the word
  // into any *Data prompt field.
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
