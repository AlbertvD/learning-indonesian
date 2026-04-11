import { useState } from 'react'
import { Box, Button, Stack, Text, Badge } from '@mantine/core'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './RecognitionMCQ.module.css'

const MAX_FAILURES = 1  // allow one retry before finalizing as wrong

interface ContrastPairExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function ContrastPairExercise({ exerciseItem, userLanguage, onAnswer }: ContrastPairExerciseProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.contrastPairData

  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [failureCount, setFailureCount] = useState(0)
  const [showWrong, setShowWrong] = useState(false)
  const [startTime] = useState(() => Date.now())

  if (!data) {
    return <div style={{ color: 'red' }}>Missing contrast pair data</div>
  }

  const handleSelectOption = (option: string) => {
    if (isAnswered || showWrong) return
    const isCorrect = option === data.correctOptionId

    if (isCorrect) {
      setSelectedOption(option)
      setIsAnswered(true)
      setTimeout(() => {
        const latencyMs = Date.now() - startTime - 1500
        onAnswer(true, latencyMs)
      }, 1500)
      return
    }

    const newFailureCount = failureCount + 1
    setFailureCount(newFailureCount)

    if (newFailureCount > MAX_FAILURES) {
      setSelectedOption(option)
      setIsAnswered(true)
      setTimeout(() => onAnswer(false, Date.now() - startTime), 0)
      return
    }

    // Brief wrong flash, then allow retry
    setSelectedOption(option)
    setShowWrong(true)
    setTimeout(() => {
      setShowWrong(false)
      setSelectedOption(null)
    }, 800)
  }

  const isCorrect = selectedOption === data.correctOptionId

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Prompt */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">{data.promptText}</Text>
        </Box>

        {/* Options */}
        <Stack gap="md">
          {data.options.map((option) => {
            const isSelected = selectedOption === option
            const isCorrectOption = option === data.correctOptionId

            let statusClass = ''
            if (showWrong && isSelected) {
              statusClass = classes.incorrect
            } else if (isAnswered && isSelected) {
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
                variant={isSelected && !showWrong ? 'filled' : 'light'}
                fullWidth
                size="lg"
              >
                {option}
              </Button>
            )
          })}
        </Stack>

        {/* Correct-answer feedback (shown for 1500ms before advancing) */}
        {isAnswered && isCorrect && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge color="green" size="xl" style={{ fontSize: '16px', padding: '12px 20px' }}>
              ✓ {t.session.feedback.correct}
            </Badge>
            {data.targetMeaning && (
              <Box mt="md">
                <Text size="sm" c="dimmed">{t.session.exercise.meaningLabel} {data.targetMeaning}</Text>
              </Box>
            )}
          </Box>
        )}

        {/* Wrong final answer — ExerciseShell takes over immediately, this won't be seen */}
        {isAnswered && !isCorrect && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge color="red" size="xl" style={{ fontSize: '16px', padding: '12px 20px' }}>
              ✗ {t.session.feedback.incorrect}
            </Badge>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
