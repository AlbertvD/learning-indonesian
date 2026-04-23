// src/components/exercises/feedbackMapping.ts
// Pure-function adapter from ExerciseItem + commit state to ExerciseFeedback
// props. Keeps per-exercise content logic out of the shell and off the
// primitive. Audio URLs are resolved upstream (session owns audioMap).
//
// See docs/plans/2026-04-23-exercise-framework-design.md §7.6 + §8

import type { ExerciseItem } from '@/types/learning'
import type {
  ExerciseFeedbackProps,
  FeedbackLayout,
  FeedbackDirection,
  PillLanguage,
} from './primitives'

export interface FeedbackMapInput {
  item: ExerciseItem
  /** What the user typed or picked; null for auto-commit-without-response paths. */
  response: string | null
  outcome: 'correct' | 'fuzzy' | 'wrong'
  userLanguage: 'en' | 'nl'
  /** Whether this is a grammar-pattern exercise. `cloze_mcq` uses this to pick
   *  between vocab-pair (vocab context) and grammar-reveal (grammar pattern). */
  isGrammar?: boolean
  /** Optional list of accepted answer variants beyond the canonical one. */
  acceptedVariants?: string[]
  /** Pre-resolved audio URL for the prompt (session layer owns audioMap). */
  promptAudioUrl?: string
  /** Whether the Supabase processReview threw (renders warning chip). */
  commitFailed?: boolean
}

export type FeedbackProps = Omit<ExerciseFeedbackProps, 'onContinue' | 'continueLabel' | 'copy'>

/**
 * Build feedback-screen props from an ExerciseItem + commit state.
 * Dispatches on exerciseType. Grammar-tagged cloze_mcq routes to
 * grammar-reveal; vocab cloze_mcq uses vocab-pair.
 */
export function feedbackPropsFor(input: FeedbackMapInput): FeedbackProps {
  const { item, response, outcome, userLanguage, isGrammar, acceptedVariants, promptAudioUrl, commitFailed } = input
  const L1: PillLanguage = userLanguage.toUpperCase() as PillLanguage
  const primaryMeaning = item.meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? item.meanings.find(m => m.translation_language === userLanguage)
  const L1Text = primaryMeaning?.translation_text ?? ''

  switch (item.exerciseType) {
    case 'recognition_mcq': {
      // ID → L1 MCQ
      const base = item.learningItem?.base_text ?? ''
      return {
        outcome,
        layout: 'vocab-pair',
        direction: 'ID→L1',
        promptShown: { text: base, lang: 'ID', role: 'shown' },
        correctAnswer: { text: L1Text, lang: L1, role: 'target' },
        userAnswer: response ? { text: response, lang: L1, role: 'picked' } : undefined,
        acceptedVariants,
        commitFailed,
      }
    }

    case 'cued_recall': {
      // L1 cue → ID
      const prompt = item.cuedRecallData?.promptMeaningText ?? ''
      const correct = item.cuedRecallData?.correctOptionId ?? ''
      return {
        outcome,
        layout: 'vocab-pair',
        direction: 'L1→ID',
        promptShown: { text: prompt, lang: L1, role: 'shown' },
        correctAnswer: { text: correct, lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'picked' } : undefined,
        acceptedVariants,
        commitFailed,
      }
    }

    case 'typed_recall': {
      // L1 → ID typed
      const base = item.learningItem?.base_text ?? ''
      return {
        outcome,
        layout: 'vocab-pair',
        direction: 'L1→ID',
        promptShown: { text: L1Text, lang: L1, role: 'shown' },
        correctAnswer: { text: base, lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'typed' } : undefined,
        acceptedVariants,
        commitFailed,
      }
    }

    case 'meaning_recall': {
      // ID → L1 typed
      const base = item.learningItem?.base_text ?? ''
      return {
        outcome,
        layout: 'vocab-pair',
        direction: 'ID→L1',
        promptShown: { text: base, lang: 'ID', role: 'shown' },
        correctAnswer: { text: L1Text, lang: L1, role: 'target' },
        userAnswer: response ? { text: response, lang: L1, role: 'typed' } : undefined,
        acceptedVariants,
        commitFailed,
      }
    }

    case 'listening_mcq': {
      // audio → L1
      const base = item.learningItem?.base_text ?? ''
      return {
        outcome,
        layout: 'vocab-pair',
        direction: 'audio→ID',
        promptShown: { text: base, lang: 'ID', role: 'heard' },
        correctAnswer: { text: L1Text, lang: L1, role: 'target' },
        userAnswer: response ? { text: response, lang: L1, role: 'picked' } : undefined,
        audio: promptAudioUrl ? { url: promptAudioUrl } : undefined,
        commitFailed,
      }
    }

    case 'dictation': {
      // audio → ID typed
      const base = item.learningItem?.base_text ?? ''
      return {
        outcome,
        layout: 'vocab-pair',
        direction: 'audio→ID',
        promptShown: { text: base, lang: 'ID', role: 'heard' },
        correctAnswer: { text: base, lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'typed' } : undefined,
        acceptedVariants,
        audio: promptAudioUrl ? { url: promptAudioUrl } : undefined,
        commitFailed,
      }
    }

    case 'cloze': {
      // Sentence with blank; ID → ID typed
      const target = item.clozeContext?.targetWord ?? ''
      const sentence = item.clozeContext?.sentence ?? ''
      const filled = sentence.replace('___', target)
      return {
        outcome,
        layout: 'vocab-pair',
        direction: 'ID→ID',
        promptShown: { text: filled, lang: 'ID', role: 'shown' },
        correctAnswer: { text: target, lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'typed' } : undefined,
        acceptedVariants,
        commitFailed,
      }
    }

    case 'cloze_mcq': {
      // Sentence with blank, MCQ — vocab (no grammar pattern) vs grammar
      const sentence = item.clozeMcqData?.sentence ?? ''
      const correct = item.clozeMcqData?.correctOptionId ?? ''
      const filled = sentence.replace('___', correct)
      const layout: FeedbackLayout = isGrammar ? 'grammar-reveal' : 'vocab-pair'
      return {
        outcome,
        layout,
        direction: 'ID→ID',
        promptShown: { text: filled, lang: 'ID', role: 'shown' },
        correctAnswer: { text: correct, lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'picked' } : undefined,
        meaning: item.clozeMcqData?.translation ?? undefined,
        explanation: item.clozeMcqData?.explanationText ?? undefined,
        commitFailed,
      }
    }

    case 'contrast_pair': {
      const correct = item.contrastPairData?.correctOptionId ?? ''
      return {
        outcome,
        layout: 'grammar-reveal',
        direction: 'ID→ID',
        promptShown: { text: item.contrastPairData?.promptText ?? '', lang: 'ID', role: 'shown' },
        correctAnswer: { text: correct, lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'picked' } : undefined,
        meaning: item.contrastPairData?.targetMeaning ?? undefined,
        explanation: item.contrastPairData?.explanationText ?? undefined,
        commitFailed,
      }
    }

    case 'sentence_transformation': {
      const target = item.sentenceTransformationData?.acceptableAnswers[0] ?? ''
      return {
        outcome,
        layout: 'grammar-reveal',
        direction: 'ID→ID',
        promptShown: { text: item.sentenceTransformationData?.sourceSentence ?? '', lang: 'ID', role: 'shown' },
        correctAnswer: { text: target, lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'typed' } : undefined,
        acceptedVariants: item.sentenceTransformationData?.acceptableAnswers.slice(1),
        explanation: item.sentenceTransformationData?.explanationText ?? undefined,
        commitFailed,
      }
    }

    case 'constrained_translation': {
      const data = item.constrainedTranslationData
      const isCloze = !!data?.targetSentenceWithBlank && !!data?.blankAcceptableAnswers?.length
      const acceptable = isCloze ? (data?.blankAcceptableAnswers ?? []) : (data?.acceptableAnswers ?? [])
      const target = acceptable[0] ?? ''
      const prompt = isCloze
        ? (data?.targetSentenceWithBlank ?? '').replace('___', target)
        : (data?.sourceLanguageSentence ?? '')
      const direction: FeedbackDirection = isCloze ? 'ID→ID' : 'L1→ID'
      return {
        outcome,
        layout: 'grammar-reveal',
        direction,
        promptShown: { text: prompt, lang: isCloze ? 'ID' : L1, role: 'shown' },
        correctAnswer: { text: target, lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'typed' } : undefined,
        acceptedVariants: acceptable.slice(1),
        explanation: data?.explanationText ?? undefined,
        commitFailed,
      }
    }

    case 'speaking': {
      // Speaking doesn't commit via the normal path, but provide a sane
      // shape in case feedback is ever invoked.
      return {
        outcome,
        layout: 'vocab-pair',
        direction: 'ID→ID',
        promptShown: { text: item.speakingData?.promptText ?? '', lang: 'ID', role: 'shown' },
        correctAnswer: { text: item.speakingData?.targetPatternOrScenario ?? '', lang: 'ID', role: 'target' },
        commitFailed,
      }
    }
  }
}
