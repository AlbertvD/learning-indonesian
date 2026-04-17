import { Box, Button, Stack, Text, Alert } from '@mantine/core'
import { IconMicrophone } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './RecognitionMCQ.module.css'

interface SpeakingExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  // Kept in the signature so ExerciseShell's dispatch branch compiles;
  // intentionally unused until ASR is wired.
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function SpeakingExercise({ exerciseItem, userLanguage, onAnswer: _onAnswer }: SpeakingExerciseProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.speakingData

  if (!data) {
    return <div style={{ color: 'red' }}>Missing speaking data</div>
  }

  // Defensive no-op: speaking is gated out of session selection in
  // sessionQueue.ts (buildGrammarQueue and the productive-stage selectExercises
  // path both filter it), but if the component is ever reached via a future
  // call path, do NOT invoke onAnswer with wasCorrect=true — that would
  // corrupt FSRS state for the spoken_production skill before ASR exists.
  // The component remains visually functional for admin preview; the record
  // button is a deliberate dead-end click until ASR is wired.
  const handleSubmitAnswer = () => {
    return
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
