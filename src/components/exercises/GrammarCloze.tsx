// src/components/exercises/GrammarCloze.tsx
//
// Grammar cloze exercise: a sentence with a grammar-pattern blank.
// The learner types the correct grammatical form (e.g. "sudah" vs "belum").
// Similar to regular Cloze but uses grammar pattern metadata for explanation.

import { useState, useRef, useEffect } from 'react'
import { Box, Text, Stack, Badge, Button, Group } from '@mantine/core'
import { IconMessage2, IconBook2 } from '@tabler/icons-react'
import { checkAnswer } from '@/lib/answerNormalization'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './Cloze.module.css'

interface GrammarClozeProps {
  exerciseItem: ExerciseItem
  userLanguage: string
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function GrammarCloze({ exerciseItem, userLanguage, onAnswer }: GrammarClozeProps) {
  const t = translations[userLanguage as 'en' | 'nl'] ?? translations['nl']
  const data = exerciseItem.grammarClozeData
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const startTime = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    startTime.current = Date.now()
    inputRef.current?.focus()
  }, [])

  if (!data) {
    return <Text c="red">Error: Missing grammar cloze data</Text>
  }

  const { sentence, targetForm, translation, patternName, acceptableAnswers, explanationText } = data
  const parts = sentence.split('___')

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (submitted || !value.trim()) return

    const result = checkAnswer(
      value,
      targetForm,
      acceptableAnswers,
    )

    setIsCorrect(result.isCorrect)
    setSubmitted(true)

    const FEEDBACK_DELAY_MS = result.isCorrect ? 1500 : 0
    setTimeout(() => {
      const latency = Date.now() - startTime.current - FEEDBACK_DELAY_MS
      onAnswer(result.isCorrect, result.isFuzzy, latency, value)
    }, FEEDBACK_DELAY_MS)
  }

  return (
    <Stack gap="xl">
      {/* Grammar pattern badge */}
      <Group justify="center">
        <Badge variant="light" color="violet" size="lg" leftSection={<IconBook2 size={14} />}>
          {patternName}
        </Badge>
      </Group>

      <Box ta="center" py="xl">
        {/* Translation shown pre-answer */}
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
              width: `${Math.max(3, targetForm.length)}ch`,
              background: 'transparent',
              border: 'none',
              borderBottom: '2px solid var(--mantine-color-gray-4)',
              outline: 'none',
              textAlign: 'center',
              margin: '0 8px',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              fontFamily: 'inherit',
              color: submitted ? (isCorrect ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)') : 'inherit',
            }}
          />
          {parts[1]}
        </Text>
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
            {isCorrect ? `${t.session.feedback.correct}` : `${t.session.feedback.incorrect}`}
          </Badge>
          {!isCorrect && (
            <Box mt="lg">
              <Text size="sm" c="dimmed" mb="xs">{t.session.exercise.correctAnswerLabel}</Text>
              <Text size="xl" fw={700}>{targetForm}</Text>
            </Box>
          )}
          {/* Always show explanation for grammar exercises */}
          {explanationText && (
            <Box mt="lg" p="md" style={{ border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)', textAlign: 'left' }}>
              <Text size="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }} mb={8}>
                {t.session.exercise.explanationLabel}
              </Text>
              <Text size="sm">{explanationText}</Text>
            </Box>
          )}
        </Box>
      )}
    </Stack>
  )
}
