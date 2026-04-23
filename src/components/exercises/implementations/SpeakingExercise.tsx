// src/components/exercises/implementations/SpeakingExercise.tsx
// Speaking is gated out of session selection (sessionQueue.ts filters it
// before dispatch). This implementation renders a "coming soon" notice
// through the primitive library so that if the type ever reaches the
// registry it degrades gracefully. Never commits via onAnswer.

import { IconMicrophone } from '@tabler/icons-react'
import { Alert } from '@mantine/core'
import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOptionGroup,
  ExerciseOption,
} from '../primitives'
import { translations } from '@/lib/i18n'
import type { ExerciseComponentProps } from '../registry'

export default function SpeakingExercise({ exerciseItem, userLanguage }: ExerciseComponentProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.speakingData

  if (!data) {
    return <div style={{ color: 'red' }}>Missing speaking data</div>
  }

  return (
    <ExerciseFrame variant="session">
      <Alert color="blue" title={t.session.speaking.comingSoon} />
      <ExerciseInstruction icon={<IconMicrophone size={20} />}>
        {data.promptText}
      </ExerciseInstruction>
      {data.targetPatternOrScenario && (
        <ExercisePromptCard variant="sentence">
          {data.targetPatternOrScenario}
        </ExercisePromptCard>
      )}
      <ExerciseOptionGroup aria-label={t.session.speaking.recordButton}>
        {/* Dead-end button — speaking never commits until ASR lands. */}
        <ExerciseOption state="disabled" variant="word" onClick={() => {}}>
          {t.session.speaking.recordButton}
        </ExerciseOption>
      </ExerciseOptionGroup>
    </ExerciseFrame>
  )
}
