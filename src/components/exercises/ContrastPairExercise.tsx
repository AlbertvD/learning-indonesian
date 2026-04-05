import { useState } from 'react'
import { Box, Button, Stack, Text, Badge } from '@mantine/core'
import type { ExerciseItem } from '@/types/learning'
import classes from './RecognitionMCQ.module.css'

interface ContrastPairExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function ContrastPairExercise({ exerciseItem, onAnswer }: ContrastPairExerciseProps) {
  const data = exerciseItem.contrastPairData

  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())

  if (!data) {
    return <div style={{ color: 'red' }}>Missing contrast pair data</div>
  }

  // Handle option selection
  const handleSelectOption = (option: string) => {
    if (isAnswered) return
    setSelectedOption(option)
    setIsAnswered(true)

    const isCorrect = option === data.correctOptionId

    const FEEDBACK_DELAY_MS = isCorrect ? 1500 : 0
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
            {data.promptText}
          </Text>
          <Text size="sm" c="dimmed">
            Meaning: {data.targetMeaning}
          </Text>
        </Box>

        {/* Two contrast options */}
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

        {/* Result feedback */}
        {isAnswered && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge
              color={isCorrect ? 'green' : 'red'}
              size="xl"
              style={{ fontSize: '16px', padding: '12px 20px' }}
            >
              {isCorrect ? '✓ Correct' : '✗ Incorrect'}
            </Badge>
            {!isCorrect && (
              <Box mt="lg">
                <Text size="sm" c="dimmed" mb="xs">Correct answer</Text>
                <Text size="xl" fw={700}>{data.correctOptionId}</Text>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
