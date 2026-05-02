// builder for exerciseType='contrast_pair'.
// Authored only — payload comes from exercise_variants.payload_json.
// Mirrors makePublishedExercise's contrast_pair branch at sessionQueue.ts:973-994.

import type { BuilderInput, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session/collectAudibleTexts'

export function buildContrastPair(input: BuilderInput): BuilderResult {
  if (!input.learningItem) {
    return { kind: 'fail', reasonCode: 'item_not_found', message: 'contrast_pair requires a learningItem (PR-2 scope)' }
  }
  if (!input.variant || input.variant.exercise_type !== 'contrast_pair') {
    return {
      kind: 'fail',
      reasonCode: 'no_active_variant',
      message: `no active contrast_pair variant for item ${input.learningItem.id}`,
      payloadSnapshot: { learningItemId: input.learningItem.id },
    }
  }
  const payload = input.variant.payload_json as Record<string, unknown>
  const answerKey = input.variant.answer_key_json as Record<string, unknown> | null

  // Grammar contrast_pair payloads store options as [{id, text}] objects.
  // ContrastPairExercise compares option values directly to correctOptionId,
  // so we normalise both to plain text strings here.
  const rawOpts = (payload.options ?? []) as Array<{ id: string; text: string } | string>
  const correctId = (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || ''
  const optionTexts = rawOpts.map(o => typeof o === 'string' ? o : o.text)
  if (optionTexts.length !== 2) {
    return {
      kind: 'fail',
      reasonCode: 'malformed_payload',
      message: `contrast_pair variant ${input.variant.id} expects 2 options, got ${optionTexts.length}`,
      payloadSnapshot: { variantId: input.variant.id, optionCount: optionTexts.length },
    }
  }
  const correctText = (() => {
    const match = rawOpts.find(o => typeof o !== 'string' && o.id === correctId)
    return match && typeof match !== 'string' ? match.text : correctId
  })()

  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: [],
    skillType: 'recognition' as const,
    exerciseType: 'contrast_pair' as const,
    contrastPairData: {
      promptText: (payload.promptText as string) || '',
      targetMeaning: (payload.targetMeaning as string) || '',
      options: optionTexts as [string, string],
      correctOptionId: correctText,
      explanationText: (payload.explanationText as string) || '',
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
