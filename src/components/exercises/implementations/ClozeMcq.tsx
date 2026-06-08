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
    throw new Error('ClozeMcq exercise is missing required data payload')
  }

  const parts = data.sentence.split('___')
  // Render the blank as a boxed "slot" — identical to the type-variant cloze
  // input (ExerciseTextInput `.inline`): a neutral, baseline-aligned, single-
  // line fillable box that clearly marks where the word goes. Sized to the
  // longest option so it doesn't jump when filled. Fills with the selected
  // word post-commit; empty (just the box) while unanswered.
  const slotCh = Math.max(4, ...data.options.map((o) => o.length)) + 1
  // Non-breaking space while empty so the inline-block box keeps a full one-line
  // height (an empty span collapses to ~6px and reads as a sliver, not a field).
  const blankText = scoring.isAnswered ? (scoring.result?.response ?? ' ') : ' '
  const sentenceWithBlank = (
    <span style={{ lineHeight: 1.9 }}>
      {parts[0]}
      <span style={{
        display: 'inline-block',
        verticalAlign: 'baseline',
        whiteSpace: 'nowrap',
        minWidth: `${slotCh}ch`,
        margin: '0 4px',
        padding: '4px 10px',
        textAlign: 'center',
        background: 'var(--ex-option-bg)',
        border: '1.5px solid var(--ex-fg-muted)',
        borderRadius: 'var(--r-sm)',
        color: 'var(--ex-fg)',
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
