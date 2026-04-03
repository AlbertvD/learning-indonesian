import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge, Group } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import classes from './TypedRecall.module.css'

interface ConstrainedTranslationExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function ConstrainedTranslationExercise({
  exerciseItem,
  onAnswer,
}: ConstrainedTranslationExerciseProps) {
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { contexts } = exerciseItem
  const data = exerciseItem.constrainedTranslationData

  if (!data) {
    return <div style={{ color: 'red' }}>Missing constrained translation data</div>
  }

  // Get anchor context for feedback
  const anchorContext = contexts.find(c => c.is_anchor_context)

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

    // Brief pause to let user see correct/incorrect feedback
    const FEEDBACK_DELAY_MS = 1500
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
            Translate using the required grammar pattern:
          </Text>
          <Box className={classes.translation}>{data.sourceLanguageSentence}</Box>
          <Text size="sm" c="dimmed" mt="xs">
            Required pattern: {data.requiredTargetPattern}
          </Text>
        </Box>

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

        {/* Feedback section */}
        {isAnswered && (
          <Box className={classes.feedback}>
            <Group mb="md">
              <Badge color={isCorrect ? 'green' : 'red'} size="lg">
                {isCorrect ? '✓ Correct' : '✗ Incorrect'}
              </Badge>
              {!isCorrect && result.isFuzzy && <Badge variant="light" color="yellow">Close</Badge>}
            </Group>

            <Box mb="md">
              <Text size="sm" c="dimmed" mb="xs">
                Your answer:
              </Text>
              <Text fw={600} className={isCorrect ? classes.correctAnswer : classes.incorrectAnswer}>
                {response}
              </Text>
            </Box>

            {!isCorrect && (
              <Box mb="md">
                <Text size="sm" c="dimmed" mb="xs">
                  Accepted answer:
                </Text>
                <Text fw={600} size="lg" className={classes.correctAnswer}>
                  {data.acceptableAnswers[0]}
                </Text>
              </Box>
            )}

            <Box mb="md">
              <Text size="sm" c="dimmed" mb="xs">
                Explanation:
              </Text>
              <Text size="sm">{data.explanationText}</Text>
            </Box>

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
