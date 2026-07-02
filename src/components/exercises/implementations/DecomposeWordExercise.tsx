// src/components/exercises/implementations/DecomposeWordExercise.tsx
// ADR 0019 — morphology segmentation drill. Shows a derived word; the learner
// picks its correct morpheme breakdown (e.g. membelikan → "mem + beli + kan").
// Serves recognise_word_form_link_cap on word_form_pair_src.

import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOptionGroup,
  ExerciseOption,
} from '../primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import type { ExerciseComponentProps } from '../registry'

export default function DecomposeWordExercise({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const data = exerciseItem.decomposeData
  const instruction = userLanguage === 'nl'
    ? 'Kies de juiste opbouw van het woord'
    : 'Pick the correct breakdown of the word'

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
    throw new Error('DecomposeWord exercise is missing required data payload')
  }

  return (
    <ExerciseFrame userLanguage={userLanguage} variant="session" adminOverlay={adminOverlay}>
      <ExerciseInstruction>{instruction}</ExerciseInstruction>
      <ExercisePromptCard userLanguage={userLanguage} variant="word">
        {data.word}
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
