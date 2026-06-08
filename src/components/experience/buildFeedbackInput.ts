import { resolveSessionAudioUrl } from '@/services/audioService'
import type { FeedbackMapInput, FeedbackProps } from '@/components/exercises/feedbackMapping'
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

/**
 * Attach an audio clip to the feedback's correct-answer card when that answer
 * is Indonesian and a clip already exists for it (reuse — never synthesised
 * here). This is how the learner hears the correct pronunciation on the
 * feedback screen for recall/production exercises (cued_recall, cloze, etc.),
 * where playing the audio on the prompt would have leaked the answer.
 *
 * Indonesian-only and graceful: the L1 (Dutch) answer never gets audio, and a
 * missing clip simply yields no button. The dedup guard avoids a redundant
 * second button when the correct answer is the same Indonesian text already
 * shown (and replayable) on the prompt — e.g. dictation.
 */
export function attachFeedbackAudio(props: FeedbackProps, audioMap: SessionAudioMap): FeedbackProps {
  const answer = props.correctAnswer
  const isVoiceableAnswer =
    answer.lang === 'ID' &&
    answer.text.trim().length > 0 &&
    answer.text !== props.promptShown.text
  if (!isVoiceableAnswer) return props

  const url = resolveSessionAudioUrl(audioMap, answer.text, null)
  return url ? { ...props, answerAudio: { url } } : props
}
