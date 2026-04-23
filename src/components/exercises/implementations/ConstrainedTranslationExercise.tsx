// src/components/exercises/implementations/ConstrainedTranslationExercise.tsx
// Grammar exercise — translate L1 sentence into Indonesian with a pattern
// constraint. Two sub-modes:
//   cloze-mode:       carrier sentence with one blank, typed answer is the blank
//   full-sentence:    L1 sentence → full Indonesian translation
// disallowedShortcutForms: correct-match that matches a shortcut becomes wrong
// (prevents low-effort answers that bypass the pattern lesson).

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
import type { ExerciseComponentProps } from '../registry'

export default function ConstrainedTranslationExercise({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.constrainedTranslationData

  const isClozeMode = !!data?.targetSentenceWithBlank && !!data?.blankAcceptableAnswers?.length
  const acceptableAnswers = isClozeMode
    ? (data?.blankAcceptableAnswers ?? [])
    : (data?.acceptableAnswers ?? [])
  const disallowed = data?.disallowedShortcutForms ?? []

  const scoring = useExerciseScoring<string>({
    mode: 'typed',
    checkCorrect: (response) => {
      if (acceptableAnswers.length === 0) return { isCorrect: false, isFuzzy: false }
      const r = checkAnswer(response, acceptableAnswers[0], acceptableAnswers)
      // Shortcut-form guard — a "correct" answer that's actually a disallowed
      // shortcut is downgraded to wrong.
      if (r.isCorrect && !isClozeMode && disallowed.length > 0) {
        const normalized = response.toLowerCase().trim()
        if (disallowed.some(s => normalized === s.toLowerCase())) {
          return { isCorrect: false, isFuzzy: false }
        }
      }
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

  if (!data) {
    return <div style={{ color: 'red' }}>Missing constrained translation data</div>
  }

  // Cloze sub-mode — sentence with blank, inline input inside the flowing text
  if (isClozeMode) {
    const parts = (data.targetSentenceWithBlank ?? '').split('___')
    const firstCorrect = data.blankAcceptableAnswers?.[0] ?? ''
    const inline = (
      <span style={{ lineHeight: 1.6 }}>
        {parts[0]}
        <ExerciseTextInput
          inline
          hintedAnswerLength={firstCorrect.length}
          label={t.session.exercise.typeAnswer}
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
            {t.session.exercise.checkAnswer}
          </ExerciseSubmitButton>
        }
      >
        <ExerciseInstruction>{t.session.exercise.chooseWord}</ExerciseInstruction>
        <ExercisePromptCard
          variant="sentence"
          meta={data.sourceLanguageSentence}
        >
          {inline}
        </ExercisePromptCard>
      </ExerciseFrame>
    )
  }

  // Full-sentence mode — translate the whole thing
  const instruction = data.sourceLanguageSentence.includes(' ')
    ? t.session.exercise.translateInstruction
    : t.session.exercise.translateWord

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
      <ExerciseInstruction>{instruction}</ExerciseInstruction>
      <ExercisePromptCard variant="sentence">
        {data.sourceLanguageSentence}
      </ExercisePromptCard>
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
