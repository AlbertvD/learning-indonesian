// src/components/exercises/Cloze.tsx
import { useState, useRef, useEffect } from 'react'
import { Box, Text, Stack, Badge, Button, Group } from '@mantine/core'
import { IconMessage2 } from '@tabler/icons-react'
import { checkAnswer } from '@/lib/answerNormalization'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './Cloze.module.css'

interface ClozeProps {
  exerciseItem: ExerciseItem
  userLanguage: string
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function Cloze({ exerciseItem, userLanguage, onAnswer }: ClozeProps) {
  const t = translations[userLanguage as 'en' | 'nl'] ?? translations['nl']
  const { clozeContext, answerVariants } = exerciseItem
  const [value, setValue] = useState('')
  const [submitted, setShowFeedback] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const startTime = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    startTime.current = Date.now()
    inputRef.current?.focus()
  }, [])

  if (!clozeContext) {
    return <Text c="red">Error: Missing cloze context</Text>
  }

  const { sentence, targetWord, translation } = clozeContext
  const parts = sentence.split('___')

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (submitted || !value.trim()) return

    const result = checkAnswer(
      value,
      targetWord,
      answerVariants.map(v => v.variant_text)
    )

    setIsCorrect(result.isCorrect)
    setShowFeedback(true)

    const FEEDBACK_DELAY_MS = result.isCorrect ? 1500 : 0
    setTimeout(() => {
      const latency = Date.now() - startTime.current - FEEDBACK_DELAY_MS
      onAnswer(result.isCorrect, result.isFuzzy, latency, value)
    }, FEEDBACK_DELAY_MS)
  }

  return (
    <Stack gap="xl">
      <Box ta="center" py="xl">
        {/* Translation shown pre-answer so the learner knows what meaning to express */}
        {!submitted && translation && (
          <Group justify="center" gap="xs" c="dimmed" mb="md">
            <IconMessage2 size={16} />
            <Text size="sm" style={{ fontStyle: 'italic' }}>{translation}</Text>
          </Group>
        )}
        <Text size="xl" fw={600} mb="lg" style={{ lineHeight: 1.6 }}>
          {parts[0]}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            disabled={submitted}
            className={`${classes.input} ${submitted ? (isCorrect ? classes.correct : classes.incorrect) : ''}`}
            placeholder="..."
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              display: 'inline-block',
              width: `${Math.max(3, targetWord.length)}ch`,
              background: 'transparent',
              border: 'none',
              borderBottom: '2px solid var(--mantine-color-gray-4)',
              outline: 'none',
              textAlign: 'center',
              margin: '0 8px',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              fontFamily: 'inherit',
              color: submitted ? (isCorrect ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)') : 'inherit'
            }}
          />
          {parts[1]}
        </Text>

        {/* Translation shown only after answering */}
        {submitted && translation && (
          <Group justify="center" gap="xs" c="dimmed">
            <IconMessage2 size={16} />
            <Text size="sm" style={{ fontStyle: 'italic' }}>{translation}</Text>
          </Group>
        )}
      </Box>

      {!submitted ? (
        <Button
          size="md"
          onClick={() => handleSubmit()}
          disabled={!value.trim()}
          variant="filled"
          color="cyan"
        >
          {t.session.feedback.check}
        </Button>
      ) : (
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
              <Text size="xl" fw={700}>{targetWord}</Text>
            </Box>
          )}
        </Box>
      )}
    </Stack>
  )
}
