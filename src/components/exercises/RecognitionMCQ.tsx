import { useState } from 'react'
import { Box, Button, Stack, Text, Badge } from '@mantine/core'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './RecognitionMCQ.module.css'

const MAX_FAILURES = 1  // allow one retry before finalizing as wrong

interface RecognitionMCQProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function RecognitionMCQ({ exerciseItem, userLanguage, onAnswer }: RecognitionMCQProps) {
  const t = translations[userLanguage]
  const { learningItem: learningItem_, meanings, distractors } = exerciseItem
  const learningItem = learningItem_!
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [failureCount, setFailureCount] = useState(0)
  const [showWrong, setShowWrong] = useState(false)
  const [startTime] = useState(() => Date.now())

  const correctMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = correctMeaning?.translation_text ?? ''

  const allOptions = [correctAnswer, ...(distractors ?? [])].slice(0, 4)
  const [shuffledOptions] = useState(() => allOptions.sort(() => Math.random() - 0.5))

  const handleSelectOption = (option: string) => {
    if (isAnswered || showWrong) return
    const isCorrect = option === correctAnswer

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

    setSelectedOption(option)
    setShowWrong(true)
    setTimeout(() => {
      setShowWrong(false)
      setSelectedOption(null)
    }, 800)
  }

  const isCorrect = selectedOption === correctAnswer

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Word to recognize */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">{t.session.recognition.question}</Text>
          <Box className={classes.word}>{learningItem.base_text}</Box>
        </Box>

        {/* Multiple choice options */}
        <Stack gap="md">
          {shuffledOptions.map((option) => {
            const isSelected = selectedOption === option
            const isCorrectOption = option === correctAnswer

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

        {/* Result feedback */}
        {isAnswered && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge
              color={isCorrect ? 'green' : 'red'}
              size="xl"
              style={{ fontSize: '16px', padding: '12px 20px' }}
            >
              {isCorrect ? `✓ ${t.session.feedback.correct}` : `✗ ${t.session.feedback.incorrect}`}
            </Badge>
            {!isCorrect && (
              <Box mt="lg">
                <Text size="sm" c="dimmed" mb="xs">{t.session.exercise.correctAnswerLabel}</Text>
                <Text size="xl" fw={700}>{correctAnswer}</Text>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
