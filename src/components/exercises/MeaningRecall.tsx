import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import classes from './TypedRecall.module.css'

interface MeaningRecallProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function MeaningRecall({ exerciseItem, userLanguage, onAnswer }: MeaningRecallProps) {
  const t = translations[userLanguage]
  const { meanings } = exerciseItem
  const learningItem = exerciseItem.learningItem!
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  const langMeanings = meanings.filter(m => m.translation_language === userLanguage)
  const primaryMeaning = langMeanings.find(m => m.is_primary) ?? langMeanings[0]
  const canonicalAnswer = primaryMeaning?.translation_text ?? ''
  const acceptedVariants = langMeanings
    .filter(m => m.id !== primaryMeaning?.id)
    .map(m => m.translation_text)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    if (isAnswered || !response.trim()) return

    const result = checkAnswer(response, canonicalAnswer, acceptedVariants)

    setIsAnswered(true)

    const FEEDBACK_DELAY_MS = result.isCorrect ? 1500 : 0
    setTimeout(() => {
      const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
      onAnswer(result.isCorrect, result.isFuzzy, latencyMs, response)
    }, FEEDBACK_DELAY_MS)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnswered) {
      handleSubmit()
    }
  }

  const result = checkAnswer(response, canonicalAnswer, acceptedVariants)
  const isCorrect = result.isCorrect

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Indonesian word to translate */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {userLanguage === 'nl' ? 'Wat betekent dit woord?' : 'What does this word mean?'}
          </Text>
          <Box className={classes.word}>{learningItem.base_text}</Box>
        </Box>

        {/* Answer input */}
        <Stack gap="md">
          <TextInput
            ref={inputRef}
            value={response}
            onChange={e => setResponse(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={userLanguage === 'nl' ? 'Typ de vertaling...' : 'Type the translation...'}
            disabled={isAnswered}
            size="lg"
            styles={{
              input: {
                textAlign: 'center',
                fontSize: '1.1rem',
                ...(isAnswered && {
                  borderColor: isCorrect ? 'var(--success)' : 'var(--danger)',
                  color: isCorrect ? 'var(--success)' : 'var(--danger)',
                }),
              },
            }}
          />

          {isAnswered && (
            <Badge
              color={isCorrect ? 'green' : 'red'}
              size="lg"
              style={{ alignSelf: 'center' }}
            >
              {isCorrect
                ? (result.isFuzzy ? t.session.feedback.almostCorrect : t.session.feedback.correct)
                : canonicalAnswer}
            </Badge>
          )}

          {!isAnswered && (
            <Button
              onClick={handleSubmit}
              disabled={!response.trim()}
              size="lg"
              rightSection={<IconArrowRight size={18} />}
            >
              {t.session.feedback.check}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  )
}
