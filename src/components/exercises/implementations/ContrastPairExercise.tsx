// src/components/exercises/implementations/ContrastPairExercise.tsx
// Grammar exercise — user picks between two semantically-similar options to
// test discrimination (e.g. belum vs tidak). Uses the `sentence` PromptCard
// variant for the question; pair-style visual comes from the option group.

import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOptionGroup,
  ExerciseOption,
} from '../primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import { translations } from '@/lib/i18n'
import { useSessionAudio } from '@/contexts/SessionAudioContext'
import { resolveSessionAudioUrl } from '@/services/audioService'
import type { ExerciseComponentProps } from '../registry'

export default function ContrastPairExercise({
  exerciseItem, userLanguage, onAnswer, onEvent, adminOverlay,
}: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const { audioMap } = useSessionAudio()
  const data = exerciseItem.contrastPairData

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
    return <div style={{ color: 'red' }}>Missing contrast pair data</div>
  }

  // Strip legacy prompt prefixes — the instruction label above carries them now.
  const displayPrompt = data.promptText
    .replace(/^Pilih yang benar:\s*/i, '')
    .replace(/^Welke zin betekent\s*/i, '')
    .replace(/^Welk woord betekent\s*/i, '')
    .replace(/^Kies de juiste zin:\s*/i, '')

  return (
    <ExerciseFrame variant="session" adminOverlay={adminOverlay}>
      <ExerciseInstruction>{t.session.exercise.chooseCorrect}</ExerciseInstruction>
      <ExercisePromptCard variant="sentence">
        {displayPrompt}
      </ExercisePromptCard>
      <ExerciseOptionGroup>
        {data.options.map(opt => {
          const audioUrl = resolveSessionAudioUrl(audioMap, opt)
          return (
            <ExerciseOption
              key={opt}
              state={scoring.optionState(opt, data.correctOptionId)}
              variant="sentence"
              onClick={() => scoring.selectOption(opt)}
              audio={audioUrl ? { url: audioUrl } : undefined}
            >
              {opt}
            </ExerciseOption>
          )
        })}
      </ExerciseOptionGroup>
    </ExerciseFrame>
  )
}
