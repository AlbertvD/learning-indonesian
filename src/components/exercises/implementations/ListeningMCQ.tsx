// src/components/exercises/implementations/ListeningMCQ.tsx
// Audio prompt, user picks the correct L1 translation.

import { useRef, useState } from 'react'
import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOptionGroup,
  ExerciseOption,
  ExerciseAudioButton,
} from '../primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import { useSessionAudio } from '@/contexts/SessionAudioContext'
import { resolveSessionAudioUrl } from '@/services/audioService'
import type { ExerciseComponentProps } from '../registry'

export default function ListeningMCQ({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const { audioMap } = useSessionAudio()
  const { learningItem: item, meanings, distractors } = exerciseItem
  const learningItem = item!
  const audioUrl = resolveSessionAudioUrl(audioMap, learningItem.base_text)

  const correct = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = correct?.translation_text ?? ''

  const [shuffledOptions] = useState(() => {
    const all = [correctAnswer, ...(distractors ?? [])].slice(0, 4)
    return [...all].sort(() => Math.random() - 0.5)
  })

  // Listening gate — options disabled until the clip has played at least once.
  // If no audio URL is available, the early-return below handles it — state
  // here stays false, so no setState-in-effect churn.
  const hasPlayedRef = useRef(false)
  const [hasPlayed, setHasPlayed] = useState(false)

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

  if (!audioUrl) {
    return (
      <ExerciseFrame variant="session">
        <ExerciseInstruction>
          {userLanguage === 'nl' ? 'Audio niet beschikbaar' : 'Audio not available'}
        </ExerciseInstruction>
      </ExerciseFrame>
    )
  }

  return (
    <ExerciseFrame variant="session" adminOverlay={adminOverlay}>
      <ExerciseInstruction>
        {userLanguage === 'nl' ? 'Luister en kies de juiste vertaling' : 'Listen and choose the correct translation'}
      </ExerciseInstruction>
      <ExercisePromptCard
        variant="audio"
        revealSlot={scoring.isAnswered ? learningItem.base_text : undefined}
      >
        <ExerciseAudioButton
          variant="primary"
          audioUrl={audioUrl}
          autoplay
          onPlay={() => { hasPlayedRef.current = true; setHasPlayed(true) }}
          aria-label={userLanguage === 'nl' ? 'Speel audio af' : 'Play audio'}
        />
      </ExercisePromptCard>
      <ExerciseOptionGroup>
        {shuffledOptions.map(opt => (
          <ExerciseOption
            key={opt}
            state={!hasPlayed ? 'disabled' : scoring.optionState(opt, correctAnswer)}
            variant="word"
            onClick={() => scoring.selectOption(opt)}
          >
            {opt}
          </ExerciseOption>
        ))}
      </ExerciseOptionGroup>
    </ExerciseFrame>
  )
}
