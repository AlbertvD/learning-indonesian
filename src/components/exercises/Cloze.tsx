// src/components/exercises/Cloze.tsx
import { useState, useRef, useEffect } from 'react'
import { Box, Text, TextInput, Stack, Paper, Button, Group } from '@mantine/core'
import { IconCheck, IconX, IconMessage2 } from '@tabler/icons-react'
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
  const [isFuzzy, setIsFuzzy] = useState(false)
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

    const latency = Date.now() - startTime.current
    setIsCorrect(result.isCorrect)
    setIsFuzzy(result.isFuzzy)
    setShowFeedback(true)
    onAnswer(result.isCorrect, result.isFuzzy, latency, value)
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
        <Paper withBorder p="md" radius="md" bg={isCorrect ? 'rgba(64, 192, 87, 0.1)' : 'rgba(250, 82, 82, 0.1)'}>
          <Group justify="space-between">
            <Group>
              {isCorrect ? (
                <IconCheck color="var(--mantine-color-green-6)" />
              ) : (
                <IconX color="var(--mantine-color-red-6)" />
              )}
              <Box>
                <Text fw={600} size="sm" c={isCorrect ? 'green.7' : 'red.7'}>
                  {isCorrect ? (isFuzzy ? 'Close enough!' : 'Correct!') : 'Not quite'}
                </Text>
                <Text size="xs" c="dimmed">
                  The answer was: <Text component="span" fw={700} c="dark">{targetWord}</Text>
                </Text>
              </Box>
            </Group>
          </Group>
        </Paper>
      )}
    </Stack>
  )
}
