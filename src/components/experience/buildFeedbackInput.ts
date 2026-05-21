import { resolveSessionAudioUrl } from '@/services/audioService'
import type { FeedbackMapInput } from '@/components/exercises/feedbackMapping'
import type { SessionBlock } from '@/lib/session-builder'
import type { CapabilityRenderContext } from '@/lib/capabilities'
import type { SessionAudioMap } from '@/services/audioService'

const GRAMMAR_CAPABILITY_TYPES = new Set(['pattern_recognition', 'pattern_contrast'])

export function buildFeedbackInput(args: {
  block: SessionBlock
  context: CapabilityRenderContext
  response: string | null
  outcome: 'fuzzy' | 'wrong'
  userLanguage: 'nl' | 'en'
  audioMap: SessionAudioMap
  commitFailed: boolean
}): FeedbackMapInput {
  const { block, context, response, outcome, userLanguage, audioMap, commitFailed } = args
  const item = context.exerciseItem!
  const isGrammar = GRAMMAR_CAPABILITY_TYPES.has(block.renderPlan.capabilityType)
  const acceptedVariants = item.answerVariants
    .filter(v => v.is_accepted)
    .map(v => v.variant_text)

  let promptAudioUrl: string | undefined
  const exerciseType = block.renderPlan.exerciseType
  if (exerciseType === 'listening_mcq' || exerciseType === 'dictation') {
    const baseText = item.learningItem?.base_text
    if (baseText) {
      promptAudioUrl = resolveSessionAudioUrl(audioMap, baseText, null)
    }
  }

  return { item, response, outcome, userLanguage, isGrammar, acceptedVariants, promptAudioUrl, commitFailed }
}
