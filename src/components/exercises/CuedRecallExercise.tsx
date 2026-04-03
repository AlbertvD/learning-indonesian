import { useState } from 'react'
import { Box, Button, Stack, Text, Badge, Group } from '@mantine/core'
import type { ExerciseItem } from '@/types/learning'
import classes from './RecognitionMCQ.module.css'

interface CuedRecallExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function CuedRecallExercise({ exerciseItem, onAnswer }: CuedRecallExerciseProps) {
  const { learningItem, contexts } = exerciseItem
  const data = exerciseItem.cuedRecallData

  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())

  if (!data) {
    return <div style={{ color: 'red' }}>Missing cued recall data</div>
  }

  // Get anchor context for feedback
  const anchorContext = contexts.find(c => c.is_anchor_context)

  // Handle option selection
  const handleSelectOption = (option: string) => {
    if (isAnswered) return
    setSelectedOption(option)
    setIsAnswered(true)

    const isCorrect = option === data.correctOptionId

    // Brief pause to let user see correct/incorrect feedback
    const FEEDBACK_DELAY_MS = 1500
    setTimeout(() => {
      const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
      onAnswer(isCorrect, latencyMs)
    }, FEEDBACK_DELAY_MS)
  }

  const isCorrect = selectedOption === data.correctOptionId

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Prompt section */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {data.promptMeaningText}
          </Text>
          {data.cueText && (
            <Text size="sm" c="dimmed" mb="xs" style={{ fontStyle: 'italic' }}>
              Cue: {data.cueText}
            </Text>
          )}
        </Box>

        {/* Multiple choice options */}
        <Stack gap="md">
          {data.options.map((option) => {
            const isSelected = selectedOption === option
            const isCorrectOption = option === data.correctOptionId

            let statusClass = ''
            if (isAnswered && isSelected) {
              statusClass = isCorrect ? classes.correct : classes.incorrect
            } else if (isAnswered && isCorrectOption) {
              statusClass = classes.showCorrect
            }

            return (
              <Button
                key={option}
                onClick={() => handleSelectOption(option)}
                disabled={isAnswered}
                className={`${classes.optionButton} ${statusClass}`}
                variant={isSelected ? 'filled' : 'light'}
                fullWidth
                size="lg"
              >
                {option}
              </Button>
            )
          })}
        </Stack>

        {/* Correct badge - underneath options */}
        {isAnswered && isCorrect && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge color="green" size="xl" style={{ fontSize: '16px', padding: '12px 20px' }}>
              ✓ Correct
            </Badge>
          </Box>
        )}

        {/* Feedback section - only for wrong answers */}
        {isAnswered && !isCorrect && (
          <Box className={classes.feedback}>
            <Group mb="md">
              <Badge color="red" size="lg">
                ✗ Incorrect
              </Badge>
            </Group>

            <Box mb="md">
              <Text size="sm" c="dimmed">The correct answer:</Text>
              <Text fw={600} size="lg">
                {learningItem.base_text}
              </Text>
            </Box>

            {data.explanationText && (
              <Box mb="md">
                <Text size="sm" c="dimmed">Explanation:</Text>
                <Text size="sm">{data.explanationText}</Text>
              </Box>
            )}

            {anchorContext && (
              <Box className={classes.context}>
                <Text size="sm" c="dimmed" mb="xs">
                  Example:
                </Text>
                <Text mb="xs" style={{ fontStyle: 'italic' }}>
                  {anchorContext.source_text}
                </Text>
                <Text size="sm">{anchorContext.translation_text}</Text>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
