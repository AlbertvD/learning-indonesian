// src/components/exercises/implementations/RecognitionMCQ.tsx
// Shows the Indonesian base_text, user picks the correct L1 meaning.
// Direction: ID → L1 (typically nl/en).

import { useState } from 'react'
import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOptionGroup,
  ExerciseOption,
} from '../primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import { translations } from '@/lib/i18n'
import { useSessionAudio } from '@/contexts/SessionAudioContext'
import { useAutoplay } from '@/contexts/AutoplayContext'
import { resolveSessionAudioUrl } from '@/services/audioService'
import type { ExerciseComponentProps } from '../registry'

export default function RecognitionMCQ({
  exerciseItem, userLanguage, onAnswer, onEvent,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { audioMap } = useSessionAudio()
  const { autoPlay } = useAutoplay()
  const { learningItem: item, meanings, distractors, cuedRecallData } = exerciseItem

  // ADR 0021 — morphology MEANING card: no learningItem; prompt + options come from
  // cuedRecallData (already includes the correct gloss + shuffled distractors). The
  // prompt is the Indonesian derived form; no audio (morphology pairs carry none).
  const isAffixed = !item && !!cuedRecallData
  const learningItem = item ?? null
  const audioUrl = learningItem ? resolveSessionAudioUrl(audioMap, learningItem.base_text, null) : null

  // Canonical correct meaning in the user's language (item path).
  const correctMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = isAffixed ? cuedRecallData!.correctOptionId : (correctMeaning?.translation_text ?? '')
  const promptText = isAffixed ? cuedRecallData!.promptMeaningText : (learningItem?.base_text ?? '')

  // Shuffle once on mount — useState(initializer) runs the randomization
  // exactly once; subsequent renders read the cached value without re-running
  // Math.random (which React 19's compiler would flag as impure during render).
  // The affixed path's options are pre-shuffled by the builder; use them as-is.
  const [shuffledOptions] = useState(() => {
    if (isAffixed) return cuedRecallData!.options
    const all = [correctAnswer, ...(distractors ?? [])].slice(0, 4)
    return [...all].sort(() => Math.random() - 0.5)
  })

  const scoring = useExerciseScoring<string>({
    mode: 'tap',
    checkCorrect: (response) => ({
      isCorrect: response === correctAnswer,
      isFuzzy: false,
    }),
    onAnswer: async (result) => {
      onAnswer({
        wasCorrect: result.outcome === 'correct' || result.outcome === 'fuzzy',
        isFuzzy: result.outcome === 'fuzzy',
        latencyMs: result.latencyMs,
        rawResponse: result.response,
      })
    },
    onEvent,
  })

  const isSentenceType =
    learningItem?.item_type === 'sentence' || learningItem?.item_type === 'dialogue_chunk'

  return (
    <ExerciseFrame userLanguage={userLanguage} variant="session">
      <ExerciseInstruction>{t.session.recognition.question}</ExerciseInstruction>
      <ExercisePromptCard userLanguage={userLanguage}
        variant={isSentenceType ? 'sentence' : 'word'}
        audio={audioUrl ? { url: audioUrl, autoplay: autoPlay } : undefined}
      >
        {promptText}
      </ExercisePromptCard>
      <ExerciseOptionGroup>
        {shuffledOptions.map(opt => (
          <ExerciseOption
            key={opt}
            state={scoring.optionState(opt, correctAnswer)}
            variant={isSentenceType ? 'sentence' : 'word'}
            onClick={() => scoring.selectOption(opt)}
          >
            {opt}
          </ExerciseOption>
        ))}
      </ExerciseOptionGroup>
    </ExerciseFrame>
  )
}
