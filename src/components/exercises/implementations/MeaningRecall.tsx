// src/components/exercises/implementations/MeaningRecall.tsx
// User sees Indonesian, types L1 meaning.

import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseTextInput,
  ExerciseSubmitButton,
} from '../primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import { useSessionAudio } from '@/contexts/SessionAudioContext'
import { useAutoplay } from '@/contexts/AutoplayContext'
import { resolveSessionAudioUrl } from '@/services/audioService'
import type { ExerciseComponentProps } from '../registry'

export default function MeaningRecall({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { audioMap } = useSessionAudio()
  const { autoPlay } = useAutoplay()
  const { learningItem: item, meanings } = exerciseItem
  const learningItem = item!

  const langMeanings = meanings.filter(m => m.translation_language === userLanguage)
  const primary = langMeanings.find(m => m.is_primary) ?? langMeanings[0]
  const canonical = primary?.translation_text ?? ''
  const acceptedVariants = langMeanings
    .filter(m => m.id !== primary?.id)
    .map(m => m.translation_text)

  const audioUrl = resolveSessionAudioUrl(audioMap, learningItem.base_text)

  const scoring = useExerciseScoring<string>({
    mode: 'typed',
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
  })

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
        {userLanguage === 'nl' ? 'Wat betekent dit woord?' : 'What does this word mean?'}
      </ExerciseInstruction>
      <ExercisePromptCard
        variant="word"
        audio={audioUrl ? { url: audioUrl, autoplay: autoPlay } : undefined}
      >
        {learningItem.base_text}
      </ExercisePromptCard>
      <ExerciseTextInput
        label={userLanguage === 'nl' ? 'Typ de vertaling...' : 'Type the translation...'}
        placeholder={userLanguage === 'nl' ? 'Typ de vertaling...' : 'Type the translation...'}
        value={scoring.response}
        onChange={scoring.setResponse}
        onSubmit={scoring.submit}
        state={scoring.inputState}
      />
    </ExerciseFrame>
  )
}
