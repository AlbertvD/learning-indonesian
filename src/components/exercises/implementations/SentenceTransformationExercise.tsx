// src/components/exercises/implementations/SentenceTransformationExercise.tsx
// Grammar exercise — user transforms a source Indonesian sentence per an
// instruction (e.g. "use past tense"). Uses retry-with-hint config:
// allowRetry=true, maxFailures=2, hintAfter=2.

import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseTextInput,
  ExerciseSubmitButton,
  ExerciseHint,
} from '../primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import { useSessionAudio } from '@/contexts/SessionAudioContext'
import { useAutoplay } from '@/contexts/AutoplayContext'
import { resolveSessionAudioUrl } from '@/services/audioService'
import type { ExerciseComponentProps } from '../registry'

export default function SentenceTransformationExercise({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { audioMap } = useSessionAudio()
  const { autoPlay } = useAutoplay()
  const data = exerciseItem.sentenceTransformationData
  const sourceAudioUrl = data ? resolveSessionAudioUrl(audioMap, data.sourceSentence) : undefined

  const acceptable = data?.acceptableAnswers ?? []
  const scoring = useExerciseScoring<string>({
    mode: 'typed',
    checkCorrect: (response) => {
      if (acceptable.length === 0) return { isCorrect: false, isFuzzy: false }
      const r = checkAnswer(response, acceptable[0], acceptable)
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
    allowRetry: true,
    maxFailures: 2,
    hintAfter: 2,
  })

  if (!data) {
    return <div style={{ color: 'red' }}>Missing sentence transformation data</div>
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
          {t.session.exercise.checkAnswer}
        </ExerciseSubmitButton>
      }
    >
      <ExerciseInstruction>
        {t.session.exercise.transformPrefix} {data.transformationInstruction}
      </ExerciseInstruction>
      <ExercisePromptCard
        variant="transform"
        audio={sourceAudioUrl ? { url: sourceAudioUrl, autoplay: autoPlay } : undefined}
      >
        {data.sourceSentence}
      </ExercisePromptCard>
      {scoring.showHint && data.hintText && (
        <ExerciseHint>
          {t.session.exercise.hintPrefix} {data.hintText}
        </ExerciseHint>
      )}
      <ExerciseTextInput
        label={t.session.exercise.typeAnswer}
        placeholder={t.session.exercise.typeAnswer}
        value={scoring.response}
        onChange={scoring.setResponse}
        onSubmit={scoring.submit}
        state={scoring.inputState}
      />
    </ExerciseFrame>
  )
}
