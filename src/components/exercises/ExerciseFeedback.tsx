import { Box, Button, Stack, Text, Badge, Group } from '@mantine/core'
import { IconCheck, IconX } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './ExerciseFeedback.module.css'

interface ExerciseFeedbackProps {
  exerciseItem: ExerciseItem
  wasCorrect: boolean
  isFuzzy?: boolean
  userAnswer?: string
  userLanguage?: 'en' | 'nl'
  onContinue: () => void
}

/**
 * Shared feedback component shown after every exercise.
 * Displays result (correct/incorrect), correct answer, and example context.
 */
export function ExerciseFeedback({
  exerciseItem,
  wasCorrect,
  isFuzzy,
  userAnswer,
  userLanguage = 'en',
  onContinue,
}: ExerciseFeedbackProps) {
  const t = translations[userLanguage]
  const { meanings, contexts, exerciseType } = exerciseItem
  const learningItem = exerciseItem.learningItem!
  const isRecognitionMCQ = exerciseType === 'recognition_mcq'

  // Get the primary meaning for display
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const translation = primaryMeaning?.translation_text ?? ''

  // Get anchor context for display
  const anchorContext = contexts.find(c => c.is_anchor_context)

  return (
    <Box className={classes.container}>
      <Stack gap="lg">
        {/* Result banner */}
        <Group>
          <Badge
            size="xl"
            color={wasCorrect ? 'green' : 'red'}
            leftSection={wasCorrect ? <IconCheck size={14} /> : <IconX size={14} />}
          >
            {wasCorrect ? t.session.feedback.correct : t.session.feedback.incorrect}
          </Badge>
          {isFuzzy && (
            <Badge variant="light" color="yellow">
              Close match
            </Badge>
          )}
        </Group>

        {/* User's answer (for recall-type exercises) */}
        {userAnswer && (
          <Box>
            <Text size="sm" c="dimmed">{t.session.feedback.yourAnswer}</Text>
            <Text fw={600} className={wasCorrect ? classes.correct : classes.incorrect}>
              {userAnswer}
            </Text>
          </Box>
        )}

        {/* Correct answer - only show for non-MCQ or if MCQ was wrong */}
        {(!isRecognitionMCQ || !wasCorrect) && (
          <Box className={classes.answerBox}>
            <Text size="sm" c="dimmed">{t.session.feedback.theWord}</Text>
            <Group>
              <Text fw={700} size="lg" className={classes.correctAnswer}>
                {learningItem.base_text}
              </Text>
              <Text c="dimmed">{translation}</Text>
            </Group>
          </Box>
        )}

        {/* Example context - only show for non-MCQ exercises */}
        {!isRecognitionMCQ && anchorContext && (
          <Box className={classes.contextBox}>
            <Text size="sm" c="dimmed" mb="xs">{t.session.feedback.example}</Text>
            <Text size="sm" style={{ fontStyle: 'italic' }} mb="xs">
              {anchorContext.source_text}
            </Text>
            <Text size="sm">{anchorContext.translation_text}</Text>
          </Box>
        )}

        {/* Continue button */}
        <Button
          onClick={onContinue}
          size="lg"
          fullWidth
          className={classes.continueButton}
        >
          {t.session.feedback.continue}
        </Button>
      </Stack>
    </Box>
  )
}
