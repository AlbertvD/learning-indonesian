import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import classes from './TypedRecall.module.css'

const HINT_AFTER_FAILURES = 2  // hint appears after this many wrong attempts
const MAX_FAILURES = 5         // give up and finalize as wrong after this many

interface SentenceTransformationExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function SentenceTransformationExercise({
  exerciseItem,
  userLanguage,
  onAnswer,
}: SentenceTransformationExerciseProps) {
  const t = translations[userLanguage]
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [failureCount, setFailureCount] = useState(0)
  const [showWrong, setShowWrong] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const data = exerciseItem.sentenceTransformationData

  if (!data) {
    return <div style={{ color: 'red' }}>Missing sentence transformation data</div>
  }

  const handleSubmit = () => {
    if (isAnswered || showWrong || !response.trim()) return

    const result = checkAnswer(response, data.acceptableAnswers[0], data.acceptableAnswers)
    const latencyMs = Date.now() - startTime

    if (result.isCorrect) {
      setIsAnswered(true)
      setTimeout(() => onAnswer(true, result.isFuzzy, latencyMs, response), 1500)
      return
    }

    const newFailureCount = failureCount + 1
    setFailureCount(newFailureCount)

    if (newFailureCount >= MAX_FAILURES) {
      setIsAnswered(true)
      onAnswer(false, result.isFuzzy, latencyMs, response)
      return
    }

    // Show brief wrong indicator, then reset for retry
    setShowWrong(true)
    setTimeout(() => {
      setShowWrong(false)
      setResponse('')
      inputRef.current?.focus()
    }, 800)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnswered && !showWrong) {
      handleSubmit()
    }
  }

  const result = checkAnswer(response, data.acceptableAnswers[0], data.acceptableAnswers)
  const isCorrect = result.isCorrect
  const showHint = data.hintText && failureCount >= HINT_AFTER_FAILURES

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Prompt section */}
        <Box className={classes.promptSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {t.session.exercise.transformPrefix} {data.transformationInstruction}
          </Text>
          <Box className={classes.translation}>{data.sourceSentence}</Box>
        </Box>

        {/* Hint — only after HINT_AFTER_FAILURES wrong attempts */}
        {showHint && (
          <Box style={{ padding: '8px 12px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '4px' }}>
            <Text size="sm" c="dimmed">{t.session.exercise.hintPrefix} {data.hintText}</Text>
          </Box>
        )}

        {/* Input field */}
        <Box>
          <TextInput
            ref={inputRef}
            placeholder={t.session.exercise.typeAnswer}
            value={response}
            onChange={(e) => setResponse(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isAnswered || showWrong}
            size="lg"
            className={classes.input}
            aria-label="Answer input"
          />
        </Box>

        {/* Wrong-answer flash (retry mode) */}
        {showWrong && (
          <Box style={{ textAlign: 'center' }}>
            <Badge color="red" size="xl" style={{ fontSize: '16px', padding: '12px 20px' }}>
              ✗ {t.session.exercise.tryAgain}
            </Badge>
          </Box>
        )}

        {/* Submit button */}
        {!isAnswered && !showWrong && (
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

        {/* Final result feedback (correct, or max failures reached) */}
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
