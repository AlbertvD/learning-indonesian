import { resolveSessionAudioUrl } from '@/services/audioService'
import { acceptedVariantTexts } from '@/lib/answerNormalization'
import type { FeedbackMapInput, FeedbackProps } from '@/components/exercises/feedbackMapping'
import type { SessionBlock } from '@/lib/session-builder'
import type { CapabilityRenderContext } from '@/lib/capabilities'
import type { SessionAudioMap } from '@/services/audioService'

// ADR 0017: produce_grammar_pattern_cap (transform/translate exercises) is a
// grammar cap too — it drives the grammar feedback flow like recognise/contrast.
const GRAMMAR_CAPABILITY_TYPES = new Set(['recognise_grammar_pattern_cap', 'contrast_grammar_pattern_cap', 'produce_grammar_pattern_cap'])

export function buildFeedbackInput(args: {
  block: SessionBlock
  context: CapabilityRenderContext
  response: string | null
  outcome: 'correct' | 'fuzzy' | 'wrong'
  userLanguage: 'nl' | 'en'
  audioMap: SessionAudioMap
  commitFailed: boolean
}): FeedbackMapInput {
  const { block, context, response, outcome, userLanguage, audioMap, commitFailed } = args
  const item = context.exerciseItem!
  const isGrammar = GRAMMAR_CAPABILITY_TYPES.has(block.renderPlan.capabilityType)
  const exerciseType = block.renderPlan.exerciseType
  // Variants shown as "Ook goed" must match the ANSWER's language: only
  // type_meaning_ex / type_meaning_from_audio_ex answer in L1; every other
  // variant-consuming type answers in Indonesian. The unfiltered list mixed
  // "here"/"hier" into dictation. type_meaning_from_audio_ex (four-card ladder
  // PR-B) is added alongside type_meaning_ex — its typed answer is also an L1
  // meaning, not an Indonesian form.
  const answerLanguage = (exerciseType === 'type_meaning_ex' || exerciseType === 'type_meaning_from_audio_ex') ? userLanguage : 'id'
  const acceptedVariants = acceptedVariantTexts(item.answerVariants, answerLanguage)

  let promptAudioUrl: string | undefined
  if (exerciseType === 'choose_meaning_from_audio_ex' || exerciseType === 'type_form_from_audio_ex' || exerciseType === 'type_meaning_from_audio_ex') {
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
 * feedback screen for recall/production exercises (choose_form_ex, cloze, etc.),
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
