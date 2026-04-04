import { useState } from 'react'
import { Box, Button, Stack, Text, Alert } from '@mantine/core'
import { IconMicrophone } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import classes from './RecognitionMCQ.module.css'

interface SpeakingExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function SpeakingExercise({ exerciseItem, onAnswer }: SpeakingExerciseProps) {
  const data = exerciseItem.speakingData
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())

  if (!data) {
    return <div style={{ color: 'red' }}>Missing speaking data</div>
  }

  // Handle answer submission (disabled for now)
  const handleSubmitAnswer = () => {
    if (isAnswered) return
    setIsAnswered(true)

    // Speaking exercises are not scored automatically yet (requires transcription API).
    // Treat as acknowledged (correct) so FSRS state is not corrupted.
    const wasCorrect = true

    const FEEDBACK_DELAY_MS = 1500
    setTimeout(() => {
      const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
      onAnswer(wasCorrect, latencyMs)
    }, FEEDBACK_DELAY_MS)
  }

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Alert: Speaking not yet available in sessions */}
        <Alert color="blue" title="Speaking Exercises Coming Soon">
          Speaking exercises are disabled for now but will be available in a future update.
        </Alert>

        {/* Prompt section */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {data.promptText}
          </Text>
          {data.targetPatternOrScenario && (
            <Text size="sm" c="dimmed">
              Target: {data.targetPatternOrScenario}
            </Text>
          )}
        </Box>

        {/* Recording button (disabled) */}
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
            Record Answer
          </Button>

          <Text size="xs" c="dimmed" ta="center">
            Click the button above to record your response.
          </Text>
        </Stack>
      </Stack>
    </Box>
  )
}
