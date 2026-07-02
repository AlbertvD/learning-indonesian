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
  /** Whether this is a grammar-pattern exercise. `choose_missing_word_ex` uses this to pick
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
 * Dispatches on exerciseType. Grammar-tagged choose_missing_word_ex routes to
 * grammar-reveal; vocab choose_missing_word_ex uses vocab-pair.
 */
export function feedbackPropsFor(input: FeedbackMapInput): FeedbackProps {
  const { item, response, outcome, userLanguage, isGrammar, acceptedVariants, promptAudioUrl, commitFailed } = input
  const L1: PillLanguage = userLanguage.toUpperCase() as PillLanguage
  const primaryMeaning = item.meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? item.meanings.find(m => m.translation_language === userLanguage)
  const L1Text = primaryMeaning?.translation_text ?? ''

  switch (item.exerciseType) {
    case 'choose_meaning_ex': {
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

    case 'choose_form_ex': {
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

    case 'type_form_ex': {
      // word_form_pair_src sub-branch — morphology drills. Renders in the
      // grammar-reveal layout so the allomorph rule surfaces as the
      // explanation card (ExerciseFeedback.tsx:274 only renders `explanation`
      // under grammar-reveal). Added 2026-05-21 per
      // docs/plans/2026-05-21-affixed-form-pair-runtime.md.
      const affixData = item.affixedFormPairData
      if (affixData) {
        return {
          outcome,
          layout: 'grammar-reveal',
          direction: 'L1→ID',
          promptShown: { text: affixData.promptText, lang: 'ID', role: 'shown' },
          correctAnswer: { text: affixData.acceptedAnswer, lang: 'ID', role: 'target' },
          userAnswer: response ? { text: response, lang: 'ID', role: 'typed' } : undefined,
          acceptedVariants: [],
          explanation: affixData.allomorphRule,
          commitFailed,
        }
      }
      // L1 → ID typed (item path)
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

    case 'type_meaning_ex': {
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

    case 'choose_meaning_from_audio_ex': {
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

    case 'type_form_from_audio_ex': {
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
        // Both prompt and answer are the Indonesian word — without this the
        // learner never sees what it means (2026-07-02 owner request).
        meaning: L1Text || undefined,
        commitFailed,
      }
    }

    case 'type_missing_word_ex': {
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

    case 'choose_missing_word_ex': {
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

    case 'choose_correct_form_ex': {
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

    case 'transform_sentence_ex': {
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

    case 'translate_sentence_ex': {
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

    case 'decompose_word_ex': {
      // ADR 0019 — morphology segmentation. The word was shown; the learner
      // picked a breakdown. grammar-reveal so the formation rule surfaces as the
      // explanation card, like the type_form_ex word_form_pair branch.
      const d = item.decomposeData
      return {
        outcome,
        layout: 'grammar-reveal',
        direction: 'ID→ID',
        promptShown: { text: d?.word ?? '', lang: 'ID', role: 'shown' },
        correctAnswer: { text: d?.correctOptionId ?? '', lang: 'ID', role: 'target' },
        userAnswer: response ? { text: response, lang: 'ID', role: 'picked' } : undefined,
        acceptedVariants: [],
        explanation: d?.explanationText,
        commitFailed,
      }
    }
  }
}
