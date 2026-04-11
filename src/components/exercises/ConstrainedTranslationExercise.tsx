import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import classes from './TypedRecall.module.css'

interface ConstrainedTranslationExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function ConstrainedTranslationExercise({
  exerciseItem,
  userLanguage,
  onAnswer,
}: ConstrainedTranslationExerciseProps) {
  const t = translations[userLanguage]
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const data = exerciseItem.constrainedTranslationData

  if (!data) {
    return <div style={{ color: 'red' }}>Missing constrained translation data</div>
  }

  // Check the answer against acceptable answers
  const handleSubmit = () => {
    if (isAnswered || !response.trim()) return

    let isCorrect = false
    let isFuzzy = false

    // Check against acceptable answers
    const result = checkAnswer(response, data.acceptableAnswers[0], data.acceptableAnswers)
    isCorrect = result.isCorrect
    isFuzzy = result.isFuzzy

    // Check for disallowed shortcuts
    if (isCorrect && data.disallowedShortcutForms) {
      const normalized = response.toLowerCase().trim()
      for (const shortcut of data.disallowedShortcutForms) {
        if (normalized === shortcut.toLowerCase()) {
          isCorrect = false
          break
        }
      }
    }

    setIsAnswered(true)

    const FEEDBACK_DELAY_MS = isCorrect ? 1500 : 0
    setTimeout(() => {
      const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
      onAnswer(isCorrect, isFuzzy, latencyMs, response)
    }, FEEDBACK_DELAY_MS)
  }

  // Allow Enter key to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnswered) {
      handleSubmit()
    }
  }

  const result = checkAnswer(response, data.acceptableAnswers[0], data.acceptableAnswers)
  const isCorrect = result.isCorrect

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Prompt section */}
        <Box className={classes.promptSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {t.session.exercise.translateInstruction}
          </Text>
          <Box className={classes.translation}>{data.sourceLanguageSentence}</Box>
          <Text size="sm" c="dimmed" mt="xs">
            {t.session.exercise.requiredPattern} {data.requiredTargetPattern}
          </Text>
        </Box>

        {/* Input field */}
        <Box>
          <TextInput
            ref={inputRef}
            placeholder={t.session.exercise.typeAnswer}
            value={response}
            onChange={(e) => setResponse(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isAnswered}
            size="lg"
            className={classes.input}
            aria-label="Answer input"
          />
        </Box>

        {/* Submit button */}
        {!isAnswered && (
          <Button
            onClick={handleSubmit}
            disabled={!response.trim()}
            size="lg"
            fullWidth
            rightSection={<IconArrowRight size={18} />}
          >
            {t.session.exercise.checkAnswer}
          </Button>
        )}

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
                <Text size="xl" fw={700}>{data.acceptableAnswers[0]}</Text>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
