// builder for exerciseType='speaking'.
// Authored payload OR fall back to learningItem.base_text as the model
// utterance. Contract guarantees learningItem is non-null; variant is
// nullable (item-anchored fallback path).

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildSpeaking(input: BuilderInputFor<'speaking'>): BuilderResult {
  // Authored path
  if (input.variant && input.variant.exercise_type === 'speaking') {
    const payload = input.variant.payload_json as Record<string, unknown>
    const exerciseItem = {
      learningItem: input.learningItem,
      meanings: input.meanings,
      contexts: input.contexts,
      answerVariants: [],
      skillType: 'spoken_production' as const,
      exerciseType: 'speaking' as const,
      speakingData: {
        promptText: (payload.promptText as string) || '',
        targetPatternOrScenario: payload.targetPatternOrScenario as string | undefined,
      },
    }
    return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
  }

  // Item-anchored fallback: model utterance is the item's base_text. Prompt
  // is the user-language meaning; falls back to base_text if no meaning
  // available (the speaking component shows the prompt for context only).
  const exerciseItem = {
    learningItem: input.learningItem,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: [],
    skillType: 'spoken_production' as const,
    exerciseType: 'speaking' as const,
    speakingData: {
      promptText: input.meanings.find(m => m.translation_language === input.userLanguage)?.translation_text ?? input.learningItem.base_text,
      targetPatternOrScenario: input.learningItem.base_text,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
