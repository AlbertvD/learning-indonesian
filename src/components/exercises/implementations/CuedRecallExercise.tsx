// src/components/exercises/implementations/CuedRecallExercise.tsx
// Shows L1 meaning + optional cue, user picks the correct Indonesian word.
// Direction: L1 → ID.

import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOptionGroup,
  ExerciseOption,
} from '../primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import { translations } from '@/lib/i18n'
import type { ExerciseComponentProps } from '../registry'

export default function CuedRecallExercise({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.cuedRecallData

  const scoring = useExerciseScoring<string>({
    mode: 'tap',
    checkCorrect: (response) => ({
      isCorrect: response === data?.correctOptionId,
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

  if (!data) {
    return <div style={{ color: 'red' }}>Missing cued recall data</div>
  }

  return (
    <ExerciseFrame variant="session" adminOverlay={adminOverlay}>
      <ExerciseInstruction>{t.session.exercise.chooseIndonesian}</ExerciseInstruction>
      <ExercisePromptCard
        variant="word"
        meta={data.cueText || undefined}
      >
        {data.promptMeaningText}
      </ExercisePromptCard>
      <ExerciseOptionGroup>
        {data.options.map(opt => (
          <ExerciseOption
            key={opt}
            state={scoring.optionState(opt, data.correctOptionId)}
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
