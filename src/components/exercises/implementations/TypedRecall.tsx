// src/components/exercises/implementations/TypedRecall.tsx
// Two paths:
//  - Item-sourced (existing): user sees L1 translation, types Indonesian.
//  - Affixed_form_pair-sourced (added 2026-05-21 per
//    docs/plans/2026-05-21-affixed-form-pair-runtime.md): user sees one side
//    of the morphology pair (root or derived), types the other.
// Branching is gated on exerciseItem.affixedFormPairData; primitives + scoring
// hook are identical between branches.

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

export default function TypedRecall({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { learningItem, meanings, answerVariants, affixedFormPairData } = exerciseItem

  // Resolve prompt + accepted answer + variants from whichever source path is
  // active. The word_form_pair_src path has no learningItem / meanings /
  // variants; the item path has them.
  let promptText: string
  let acceptedAnswer: string
  let acceptedVariants: string[]
  if (affixedFormPairData) {
    promptText = affixedFormPairData.promptText
    acceptedAnswer = affixedFormPairData.acceptedAnswer
    acceptedVariants = []
  } else {
    const item = learningItem!
    const primary = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
      ?? meanings.find(m => m.translation_language === userLanguage)
    promptText = primary?.translation_text ?? ''
    acceptedAnswer = item.base_text
    acceptedVariants = (answerVariants ?? []).map(v => v.variant_text)
  }

  const scoring = useExerciseScoring<string>({
    mode: 'typed',
    checkCorrect: (response) => {
      const r = checkAnswer(response, acceptedAnswer, acceptedVariants)
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
          {t.session.recall.checkAnswer}
        </ExerciseSubmitButton>
      }
    >
      <ExerciseInstruction>{t.session.recall.question}</ExerciseInstruction>
      <ExercisePromptCard variant="word">{promptText}</ExercisePromptCard>
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
