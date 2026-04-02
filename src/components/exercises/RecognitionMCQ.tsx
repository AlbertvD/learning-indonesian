import { useState } from 'react'
import { Box, Button, Stack, Text, Badge, Group } from '@mantine/core'
import type { ExerciseItem } from '@/types/learning'
import classes from './RecognitionMCQ.module.css'

interface RecognitionMCQProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function RecognitionMCQ({ exerciseItem, userLanguage, onAnswer }: RecognitionMCQProps) {
  const { learningItem, meanings, contexts, distractors } = exerciseItem
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())

  // Get correct answer and build shuffled options
  const correctMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = correctMeaning?.translation_text ?? ''

  const allOptions = [correctAnswer, ...(distractors ?? [])].slice(0, 4)
  const [shuffledOptions] = useState(() => allOptions.sort(() => Math.random() - 0.5))

  // Get anchor context for feedback
  const anchorContext = contexts.find(c => c.is_anchor_context)

  // Handle option selection
  const handleSelectOption = (option: string) => {
    if (isAnswered) return
    setSelectedOption(option)
    setIsAnswered(true)

    const isCorrect = option === correctAnswer

    // Brief pause before calling onAnswer
    setTimeout(() => {
      const latencyMs = Date.now() - startTime
      onAnswer(isCorrect, latencyMs)
    }, 1500)
  }

  const isCorrect = selectedOption === correctAnswer

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Word to recognize */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">What does this word mean?</Text>
          <Box className={classes.word}>{learningItem.base_text}</Box>
        </Box>

        {/* Multiple choice options */}
        <Stack gap="md">
          {shuffledOptions.map((option) => {
            const isSelected = selectedOption === option
            const isCorrectOption = option === correctAnswer

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

        {/* Feedback section */}
        {isAnswered && (
          <Box className={classes.feedback}>
            <Group mb="md">
              <Badge color={isCorrect ? 'green' : 'red'} size="lg">
                {isCorrect ? '✓ Correct' : '✗ Incorrect'}
              </Badge>
            </Group>

            {!isCorrect && (
              <Box mb="md">
                <Text size="sm" c="dimmed">The correct answer:</Text>
                <Text fw={600} size="lg">{correctAnswer}</Text>
              </Box>
            )}

            {anchorContext && (
              <Box className={classes.context}>
                <Text size="sm" c="dimmed" mb="xs">Example:</Text>
                <Text mb="xs" style={{ fontStyle: 'italic' }}>{anchorContext.source_text}</Text>
                <Text size="sm">{anchorContext.translation_text}</Text>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
