import { useState } from 'react'
import { Box, Button, Stack, Text, Alert } from '@mantine/core'
import { IconMicrophone } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './RecognitionMCQ.module.css'

interface SpeakingExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function SpeakingExercise({ exerciseItem, userLanguage, onAnswer }: SpeakingExerciseProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.speakingData
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())

  if (!data) {
    return <div style={{ color: 'red' }}>Missing speaking data</div>
  }

  const handleSubmitAnswer = () => {
    if (isAnswered) return
    setIsAnswered(true)

    // Speaking exercises are not scored automatically yet (requires transcription API).
    // Treat as acknowledged (correct) so FSRS state is not corrupted.
    const FEEDBACK_DELAY_MS = 1500
    setTimeout(() => {
      const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
      onAnswer(true, latencyMs)
    }, FEEDBACK_DELAY_MS)
  }

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        <Alert color="blue" title={t.session.speaking.comingSoon} />

        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">{data.promptText}</Text>
          {data.targetPatternOrScenario && (
            <Text size="sm" c="dimmed">
              {data.targetPatternOrScenario}
            </Text>
          )}
        </Box>

        <Stack gap="md">
          <Button
            onClick={handleSubmitAnswer}
            disabled={isAnswered}
            className={classes.optionButton}
            variant="light"
            fullWidth
            size="lg"
            leftSection={<IconMicrophone size={20} />}
          >
            {t.session.speaking.recordButton}
          </Button>
        </Stack>
      </Stack>
    </Box>
  )
}
