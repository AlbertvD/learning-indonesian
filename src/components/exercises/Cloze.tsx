import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge, Group } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import classes from './Cloze.module.css'

interface ClozeProps {
  exerciseItem: ExerciseItem
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function Cloze({ exerciseItem, onAnswer }: ClozeProps) {
  const { learningItem } = exerciseItem
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Get cloze context
  const clozeContext = exerciseItem.clozeContext

  // Focus input on mount
  useEffect(() => {
    if (clozeContext) {
      inputRef.current?.focus()
    }
  }, [clozeContext])

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

  if (!clozeContext) {
    return (
      <Box className={classes.container}>
        <Text c="red">Error: No cloze context available</Text>
      </Box>
    )
  }

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Cloze sentence */}
        <Box className={classes.sentenceSection}>
          <Box className={classes.sentence}>
            <Text component="span" mr="xs">{clozeContext.sentence.split(learningItem.base_text)[0]}</Text>
            <Text component="span" className={classes.blank}>___</Text>
            {clozeContext.sentence.split(learningItem.base_text)[1] && (
              <Text component="span" ml="xs">{clozeContext.sentence.split(learningItem.base_text)[1]}</Text>
            )}
          </Box>
          <Text size="sm" c="dimmed" mt="md">{clozeContext.translation}</Text>
        </Box>

        {/* Input field */}
        <Box>
          <TextInput
            ref={inputRef}
            placeholder="Fill in the blank..."
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

            {isCorrect && (
              <Box className={classes.sentenceCorrect}>
                <Text size="sm" c="dimmed" mb="xs">Complete sentence:</Text>
                <Box className={classes.completeSentence}>
                  {clozeContext.sentence.split(learningItem.base_text)[0]}
                  <Text component="span" fw={600} c="green">{learningItem.base_text}</Text>
                  {clozeContext.sentence.split(learningItem.base_text)[1]}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
