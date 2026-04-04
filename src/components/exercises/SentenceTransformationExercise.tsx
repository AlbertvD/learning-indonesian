import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import classes from './TypedRecall.module.css'

interface SentenceTransformationExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function SentenceTransformationExercise({
  exerciseItem,
  onAnswer,
}: SentenceTransformationExerciseProps) {
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const data = exerciseItem.sentenceTransformationData

  if (!data) {
    return <div style={{ color: 'red' }}>Missing sentence transformation data</div>
  }

  // Check the answer against acceptable answers
  const handleSubmit = () => {
    if (isAnswered || !response.trim()) return

    const result = checkAnswer(response, data.acceptableAnswers[0], data.acceptableAnswers)
    const isCorrect = result.isCorrect
    const isFuzzy = result.isFuzzy

    setIsAnswered(true)

    const FEEDBACK_DELAY_MS = isCorrect ? 1500 : 2000
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
            Transform: {data.transformationInstruction}
          </Text>
          <Box className={classes.translation}>{data.sourceSentence}</Box>
        </Box>

        {/* Hint if provided */}
        {data.hintText && (
          <Box style={{ padding: '8px 12px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <Text size="sm">Hint: {data.hintText}</Text>
          </Box>
        )}

        {/* Input field */}
        <Box>
          <TextInput
            ref={inputRef}
            placeholder="Type your answer"
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
            Check Answer
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
              {isCorrect ? '✓ Correct' : '✗ Incorrect'}
            </Badge>
            {!isCorrect && (
              <Box mt="lg">
                <Text size="sm" c="dimmed" mb="xs">Correct answer</Text>
                <Text size="xl" fw={700}>{data.acceptableAnswers[0]}</Text>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
