// src/components/exercises/Cloze.tsx
import { useState, useRef, useEffect } from 'react'
import { Box, Text, TextInput, Stack, Badge, Button, Group } from '@mantine/core'
import { IconMessage2 } from '@tabler/icons-react'
import { checkAnswer } from '@/lib/answerNormalization'
import type { ExerciseItem } from '@/types/learning'
import classes from './Cloze.module.css'

interface ClozeProps {
  exerciseItem: ExerciseItem
  userLanguage: string
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function Cloze({ exerciseItem, onAnswer }: ClozeProps) {
  const { clozeContext, answerVariants } = exerciseItem
  const [value, setValue] = useState('')
  const [submitted, setShowFeedback] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const startTime = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus on mount and capture start time (must be before early return to satisfy rules-of-hooks)
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

    const FEEDBACK_DELAY_MS = result.isCorrect ? 1500 : 2000
    setTimeout(() => {
      const latency = Date.now() - startTime.current - FEEDBACK_DELAY_MS
      onAnswer(result.isCorrect, result.isFuzzy, latency, value)
    }, FEEDBACK_DELAY_MS)
  }

  return (
    <Stack gap="xl">
      <Box ta="center" py="xl">
        <Text size="xl" fw={600} mb="lg" style={{ lineHeight: 1.6 }}>
          {parts[0]}
          <TextInput
            ref={inputRef}
            component="span"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            disabled={submitted}
            variant="unstyled"
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
              borderBottom: '2px solid var(--mantine-color-gray-4)',
              textAlign: 'center',
              margin: '0 8px',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              color: submitted ? (isCorrect ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)') : 'inherit'
            }}
          />
          {parts[1]}
        </Text>

        <Group justify="center" gap="xs" c="dimmed">
          <IconMessage2 size={16} />
          <Text size="sm" style={{ fontStyle: 'italic' }}>{translation}</Text>
        </Group>
      </Box>

      {!submitted ? (
        <Button
          size="md"
          onClick={() => handleSubmit()}
          disabled={!value.trim()}
          variant="filled"
          color="cyan"
        >
          Check
        </Button>
      ) : (
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
              <Text size="xl" fw={700}>{targetWord}</Text>
            </Box>
          )}
        </Box>
      )}
    </Stack>
  )
}
