// src/components/exercises/implementations/ClozeMcq.tsx
// Sentence with a blank + MCQ options. Can be vocab (sentence context around
// a target word) or grammar (contrasting particles). The payload shape is
// identical; `grammarPatternId` distinguishes the two at the feedback layer.

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

export default function ClozeMcq({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.clozeMcqData

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
    return <div style={{ color: 'red' }}>Missing cloze MCQ data</div>
  }

  const parts = data.sentence.split('___')
  // Show the sentence with the blank rendered as an inline underline. The
  // blank fills with the selected option text post-commit.
  const blankText = scoring.isAnswered ? (scoring.result?.response ?? '') : '___'
  const sentenceWithBlank = (
    <span style={{ lineHeight: 1.6 }}>
      {parts[0]}
      <span style={{
        display: 'inline-block',
        minWidth: '4ch',
        borderBottom: '2px solid var(--accent-primary)',
        margin: '0 4px',
        textAlign: 'center',
      }}>{blankText}</span>
      {parts[1] ?? ''}
    </span>
  )

  return (
    <ExerciseFrame variant="session" adminOverlay={adminOverlay}>
      <ExerciseInstruction>{t.session.exercise.completeSentence}</ExerciseInstruction>
      <ExercisePromptCard
        variant="sentence"
        meta={data.translation ?? undefined}
      >
        {sentenceWithBlank}
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
