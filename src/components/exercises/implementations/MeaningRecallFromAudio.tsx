// src/components/exercises/implementations/MeaningRecallFromAudio.tsx
// Four-card ladder PR-B (docs/plans/2026-07-09-vocab-four-card-ladder.md §2.3):
// ear-only typed meaning recall for recognise_meaning_from_audio_cap (#3′).
// Audio-only prompt (composed from Dictation's audio shell: autoplay, replay
// button, submit gated on hasPlayed) + MeaningRecall's grading (typed L1
// meaning, langMeanings accepted-answer path) — the exercise ear cannot
// delegate to the eyes, so no Indonesian text of the word is ever shown
// before the answer is committed. The word may surface as a reveal AFTER
// answering (Dictation precedent), never in the prompt itself.

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

export default function MeaningRecallFromAudio({
  exerciseItem, userLanguage, onAnswer, onEvent,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { audioMap } = useSessionAudio()
  const { learningItem: item, meanings } = exerciseItem
  const learningItem = item!
  const audioUrl = resolveSessionAudioUrl(audioMap, learningItem.base_text, null)

  // Grading — copied verbatim from MeaningRecall.tsx:27-33 (the live seam);
  // do NOT hand-roll a translation_nl + answerVariants lookup.
  const langMeanings = meanings.filter(m => m.translation_language === userLanguage)
  const primary = langMeanings.find(m => m.is_primary) ?? langMeanings[0]
  const canonical = primary?.translation_text ?? ''
  const acceptedVariants = langMeanings
    .filter(m => m.id !== primary?.id)
    .map(m => m.translation_text)

  const hasPlayedRef = useRef(false)
  const [, setHasPlayedTick] = useState(0)

  const scoring = useExerciseScoring<string>({
    mode: 'typed',
    // Short pulse only, mirroring Dictation: the wrong-answer path shows a
    // full Doorgaan feedback card, so the default 1.5s pre-commit pause on
    // the correct path would just delay auto-advance.
    correctDelayMs: 500,
    checkCorrect: (response) => {
      const r = checkAnswer(response, canonical, acceptedVariants)
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
    // Submit blocked until the clip has played once — the word is audio-only,
    // there is nothing else to answer from.
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
        {userLanguage === 'nl' ? 'Luister en typ de betekenis' : 'Listen and type the meaning'}
      </ExerciseInstruction>
      {/* isProcessing is the correct-path pause (500ms before auto-advance) —
          without it the reveal only flashes during the commit roundtrip.
          Reveal shows the ID word ONLY after answering — never before, per
          the audio-only design (the ear cannot delegate to the eyes). */}
      <ExercisePromptCard userLanguage={userLanguage}
        variant="audio"
        revealSlot={scoring.isAnswered || scoring.isProcessing ? learningItem.base_text : undefined}
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
