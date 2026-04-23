// src/components/exercises/implementations/Cloze.tsx
// Sentence with a blank; user types the target word inline. Uses the
// `sentence` PromptCard variant with an inline <ExerciseTextInput>.

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
import { IconMessage2 } from '@tabler/icons-react'
import type { ExerciseComponentProps } from '../registry'

export default function Cloze({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { clozeContext, answerVariants } = exerciseItem

  const targetWord = clozeContext?.targetWord ?? ''
  const variants = (answerVariants ?? []).map(v => v.variant_text)

  const scoring = useExerciseScoring<string>({
    mode: 'typed',
    checkCorrect: (response) => {
      const r = checkAnswer(response, targetWord, variants)
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

  if (!clozeContext) {
    return <div style={{ color: 'red' }}>Error: missing cloze context</div>
  }

  const { sentence, translation } = clozeContext
  const parts = sentence.split('___')

  const inlineInput = (
    <span style={{ lineHeight: 1.6 }}>
      {parts[0]}
      <ExerciseTextInput
        inline
        hintedAnswerLength={targetWord.length}
        label={t.session.recall.placeholder}
        value={scoring.response}
        onChange={scoring.setResponse}
        onSubmit={scoring.submit}
        state={scoring.inputState}
        autoFocus
      />
      {parts[1] ?? ''}
    </span>
  )

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
      <ExerciseInstruction
        icon={translation ? <IconMessage2 size={16} /> : undefined}
      >
        {translation ?? t.session.exercise.completeSentence}
      </ExerciseInstruction>
      <ExercisePromptCard variant="sentence">
        {inlineInput}
      </ExercisePromptCard>
    </ExerciseFrame>
  )
}
