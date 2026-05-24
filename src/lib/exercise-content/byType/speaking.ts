// builder for exerciseType='speaking'.
// Item-anchored: model utterance is the item's base_text. Contract guarantees
// learningItem is non-null. (No cap routes here today — capabilityTypes: [] —
// and the legacy authored exercise_variants path was removed in PR 4.)

import type { BuilderInputFor, BuilderResult } from './types'
import { audibleTextFieldsOf } from '@/lib/session-builder'

export function buildSpeaking(input: BuilderInputFor<'speaking'>): BuilderResult {
  // Item-anchored: model utterance is the item's base_text. Prompt
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
