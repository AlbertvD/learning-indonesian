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
  exerciseItem, userLanguage, onAnswer, onEvent,
}: ExerciseComponentProps) {
  const { audioMap } = useSessionAudio()
  const { learningItem: item, meanings, distractors } = exerciseItem
  const learningItem = item!
  const audioUrl = resolveSessionAudioUrl(audioMap, learningItem.base_text, null)

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
  // A real playback failure (404/network) must not soft-lock the learner
  // behind permanently-disabled options — throw during render so the
  // surrounding ExerciseErrorBoundary (CapabilityExerciseFrame) takes over
  // with its existing friendly skip + FSRS-consistent accounting, instead of
  // a parallel escape mechanism here.
  const [audioFailed, setAudioFailed] = useState(false)

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

  if (audioFailed) {
    throw new Error('Audio playback failed for choose_meaning_from_audio_ex')
  }

  if (!audioUrl) {
    return (
      <ExerciseFrame userLanguage={userLanguage} variant="session">
        <ExerciseInstruction>
          {userLanguage === 'nl' ? 'Audio niet beschikbaar' : 'Audio not available'}
        </ExerciseInstruction>
      </ExerciseFrame>
    )
  }

  return (
    <ExerciseFrame userLanguage={userLanguage} variant="session">
      <ExerciseInstruction>
        {userLanguage === 'nl' ? 'Luister en kies de juiste vertaling' : 'Listen and choose the correct translation'}
      </ExerciseInstruction>
      <ExercisePromptCard userLanguage={userLanguage}
        variant="audio"
        revealSlot={scoring.isAnswered ? learningItem.base_text : undefined}
      >
        <ExerciseAudioButton
          variant="primary"
          audioUrl={audioUrl}
          autoplay
          onPlay={() => { hasPlayedRef.current = true; setHasPlayed(true) }}
          onError={() => setAudioFailed(true)}
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
