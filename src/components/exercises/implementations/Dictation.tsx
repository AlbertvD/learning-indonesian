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
  exerciseItem, userLanguage, onAnswer, onEvent,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { audioMap } = useSessionAudio()
  const { learningItem: item, meanings, answerVariants } = exerciseItem
  const learningItem = item!
  const audioUrl = resolveSessionAudioUrl(audioMap, learningItem.base_text, null)
  const variants = (answerVariants ?? []).map(v => v.variant_text)
  // L1 meaning for the post-answer reveal — dictation is the only typed exercise
  // where the learner would otherwise never see what the word means.
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const meaningText = primaryMeaning?.translation_text

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
      <ExerciseFrame userLanguage={userLanguage} variant="session">
        <ExerciseInstruction>
          {userLanguage === 'nl' ? 'Audio niet beschikbaar' : 'Audio not available'}
        </ExerciseInstruction>
      </ExerciseFrame>
    )
  }

  return (
    <ExerciseFrame userLanguage={userLanguage}
      variant="session"
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
      {/* isProcessing is the correct-path pause (1.5s before auto-advance) —
          without it the reveal only flashes during the commit roundtrip and
          the learner never actually reads the transcript + meaning. */}
      <ExercisePromptCard userLanguage={userLanguage}
        variant="audio"
        revealSlot={scoring.isAnswered || scoring.isProcessing ? learningItem.base_text : undefined}
        revealMeta={scoring.isAnswered || scoring.isProcessing ? meaningText : undefined}
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
