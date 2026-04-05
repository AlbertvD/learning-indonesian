import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import classes from './TypedRecall.module.css'

interface TypedRecallProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function TypedRecall({ exerciseItem, userLanguage, onAnswer }: TypedRecallProps) {
  const t = translations[userLanguage]
  const { learningItem, meanings } = exerciseItem
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Get the primary meaning in user's language
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const translation = primaryMeaning?.translation_text ?? ''

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

  const variants = (exerciseItem.answerVariants ?? []).map(v => v.variant_text)
  const result = checkAnswer(response, learningItem.base_text, variants)
  const isCorrect = result.isCorrect

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Translation prompt */}
        <Box className={classes.promptSection}>
          <Text size="sm" c="dimmed" mb="xs">{t.session.recall.question}</Text>
          <Box className={classes.translation}>{translation}</Box>
        </Box>

        {/* Input field */}
        <Box>
          <TextInput
            ref={inputRef}
            placeholder={t.session.recall.placeholder}
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
            {t.session.recall.checkAnswer}
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
                <Text size="xl" fw={700}>{learningItem.base_text}</Text>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
