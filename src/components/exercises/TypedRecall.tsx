import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge, Group } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import classes from './TypedRecall.module.css'

interface TypedRecallProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function TypedRecall({ exerciseItem, userLanguage, onAnswer }: TypedRecallProps) {
  const { learningItem, meanings, contexts } = exerciseItem
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Get the primary meaning in user's language
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const translation = primaryMeaning?.translation_text ?? ''

  // Get anchor context for feedback
  const anchorContext = contexts.find(c => c.is_anchor_context)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Check the answer
  const handleSubmit = () => {
    if (isAnswered || !response.trim()) return

    const variants = (exerciseItem.answerVariants ?? []).map(v => v.variant_text)
    const result = checkAnswer(response, learningItem.base_text, variants)
    const isCorrect = result.isCorrect
    const isFuzzy = result.isFuzzy

    setIsAnswered(true)

    // Brief pause before calling onAnswer
    setTimeout(() => {
      const latencyMs = Date.now() - startTime
      onAnswer(isCorrect, isFuzzy, latencyMs, response)
    }, 1500)
  }

  // Allow Enter key to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnswered) {
      handleSubmit()
    }
  }

  const variants = (exerciseItem.answerVariants ?? []).map(v => v.variant_text)
  const result = checkAnswer(response, learningItem.base_text, variants)
  const isCorrect = result.isCorrect

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Translation prompt */}
        <Box className={classes.promptSection}>
          <Text size="sm" c="dimmed" mb="xs">Type the Indonesian word for:</Text>
          <Box className={classes.translation}>{translation}</Box>
        </Box>

        {/* Input field */}
        <Box>
          <TextInput
            ref={inputRef}
            placeholder="Enter your answer..."
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
              {!isCorrect && result.isFuzzy && (
                <Badge variant="light" color="yellow">Close</Badge>
              )}
            </Group>

            <Box mb="md">
              <Text size="sm" c="dimmed" mb="xs">Your answer:</Text>
              <Text fw={600} className={isCorrect ? classes.correctAnswer : classes.incorrectAnswer}>
                {response}
              </Text>
            </Box>

            {!isCorrect && (
              <Box mb="md">
                <Text size="sm" c="dimmed" mb="xs">The correct answer:</Text>
                <Text fw={600} size="lg" className={classes.correctAnswer}>
                  {learningItem.base_text}
                </Text>
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
