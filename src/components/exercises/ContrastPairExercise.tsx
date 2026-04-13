import { useState } from 'react'
import { Box, Button, Divider, Stack, Text, Badge } from '@mantine/core'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './RecognitionMCQ.module.css'

const MAX_FAILURES = 0  // wrong answer finalises immediately — no retry

interface ContrastPairExerciseProps {
  exerciseItem?: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
  previewMode?: boolean
  previewPayload?: Record<string, any>
}

export function ContrastPairExercise({ exerciseItem, userLanguage, onAnswer, previewMode, previewPayload }: ContrastPairExerciseProps) {
  const t = translations[userLanguage]

  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [failureCount, setFailureCount] = useState(0)
  const [showWrong, setShowWrong] = useState(false)
  const [startTime] = useState(() => Date.now())

  if (previewMode && previewPayload) {
    const p = previewPayload
    const options = p.options as string[]
    return (
      <Box className={classes.container}>
        <Stack gap="xl">
          {/* Question half */}
          <Box className={classes.wordSection}>
            <Text size="sm" c="dimmed">{p.promptText}</Text>
          </Box>
          <Stack gap="md">
            {options.map((option) => (
              <Button key={option} className={classes.optionButton} variant="light" size="lg" fullWidth disabled>
                {option}
              </Button>
            ))}
          </Stack>

          <Divider label="Antwoord" labelPosition="center" my="lg" />

          {/* Answer half */}
          <Stack gap="md">
            {options.map((option) => (
              <Button
                key={option}
                className={`${classes.optionButton} ${option === p.correctOptionId ? classes.showCorrect : ''}`}
                variant="light"
                size="lg"
                fullWidth
                disabled
              >
                {option}
              </Button>
            ))}
          </Stack>
          {p.targetMeaning && (
            <Text size="sm" c="dimmed">{t.session.exercise.meaningLabel} {p.targetMeaning}</Text>
          )}
          {p.explanationText && (
            <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)', background: 'var(--card-bg)' }}>
              <Text size="sm">{p.explanationText}</Text>
            </Box>
          )}
        </Stack>
      </Box>
    )
  }

  const data = exerciseItem!.contrastPairData

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

  // Strip legacy prefixes that were authored into promptText before the UI
  // provided its own instruction label ("Kies de juiste optie").
  const displayPrompt = data.promptText
    .replace(/^Pilih yang benar:\s*/i, '')
    .replace(/^Welke zin betekent\s*/i, '')
    .replace(/^Welk woord betekent\s*/i, '')
    .replace(/^Kies de juiste zin:\s*/i, '')

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Instruction + Prompt */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">{t.session.exercise.chooseCorrect}</Text>
          <Text fw={600} size="lg">{displayPrompt}</Text>
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
