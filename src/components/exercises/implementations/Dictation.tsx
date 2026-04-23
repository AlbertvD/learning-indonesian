// src/components/exercises/implementations/Dictation.tsx
// Audio → user types what they heard. Gated: submit blocked until the clip
// has played at least once.

import { useRef, useState } from 'react'
import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseTextInput,
  ExerciseSubmitButton,
  ExerciseAudioButton,
} from '../primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import { useSessionAudio } from '@/contexts/SessionAudioContext'
import { resolveSessionAudioUrl } from '@/services/audioService'
import type { ExerciseComponentProps } from '../registry'

export default function Dictation({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { audioMap } = useSessionAudio()
  const { learningItem: item, answerVariants } = exerciseItem
  const learningItem = item!
  const audioUrl = resolveSessionAudioUrl(audioMap, learningItem.base_text)
  const variants = (answerVariants ?? []).map(v => v.variant_text)

  const hasPlayedRef = useRef(false)
  const [, setHasPlayedTick] = useState(0)

  const scoring = useExerciseScoring<string>({
    mode: 'typed',
    checkCorrect: (response) => {
      const r = checkAnswer(response, learningItem.base_text, variants)
      return { isCorrect: r.isCorrect, isFuzzy: r.isFuzzy }
    },
    onAnswer: async (result) => {
      onAnswer({
        wasCorrect: result.outcome === 'correct' || result.outcome === 'fuzzy',
        isFuzzy: result.outcome === 'fuzzy',
        latencyMs: result.latencyMs,
        rawResponse: result.response,
      })
    },
    onEvent,
    // Submit blocked until the clip has played once.
    gate: () => hasPlayedRef.current,
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
    <ExerciseFrame
      variant="session"
      adminOverlay={adminOverlay}
      footer={
        <ExerciseSubmitButton
          onClick={scoring.submit}
          disabled={!scoring.canSubmit}
          loading={scoring.isProcessing}
        >
          {t.session.feedback.check}
        </ExerciseSubmitButton>
      }
    >
      <ExerciseInstruction>
        {userLanguage === 'nl' ? 'Luister en typ wat je hoort' : 'Listen and type what you hear'}
      </ExerciseInstruction>
      <ExercisePromptCard
        variant="audio"
        revealSlot={scoring.isAnswered ? learningItem.base_text : undefined}
      >
        <ExerciseAudioButton
          variant="primary"
          audioUrl={audioUrl}
          autoplay
          onPlay={() => {
            hasPlayedRef.current = true
            // Force a re-render so `canSubmit` recomputes with the open gate.
            setHasPlayedTick(n => n + 1)
          }}
          aria-label={userLanguage === 'nl' ? 'Speel audio af' : 'Play audio'}
        />
      </ExercisePromptCard>
      <ExerciseTextInput
        label={t.session.recall.placeholder}
        placeholder={t.session.recall.placeholder}
        value={scoring.response}
        onChange={scoring.setResponse}
        onSubmit={scoring.submit}
        state={scoring.inputState}
      />
    </ExerciseFrame>
  )
}
