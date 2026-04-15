// src/components/exercises/DialogueShadowing.tsx
//
// Two-speaker dialogue exercise with shadowing mode.
// Shows a conversation between speakers A and B. The learner must produce
// one of the turns (the target turn). Other turns are shown as context.
//
// Phase 1: Text-only shadowing (learner types the target turn).
// Phase 2+: Audio playback, record-and-compare (requires speech API).

import { useState, useRef, useEffect } from 'react'
import { Box, Text, Stack, Badge, Button, Group, Paper, Alert } from '@mantine/core'
import { IconMessageCircle, IconUser, IconMicrophone } from '@tabler/icons-react'
import { checkAnswer } from '@/lib/answerNormalization'
import type { ExerciseItem, DialogueTurn } from '@/types/learning'
import { translations } from '@/lib/i18n'

interface DialogueShadowingProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

function SpeakerBadge({ speaker }: { speaker: 'A' | 'B' }) {
  return (
    <Badge
      variant="filled"
      color={speaker === 'A' ? 'blue' : 'teal'}
      size="sm"
      leftSection={<IconUser size={12} />}
    >
      {speaker === 'A' ? 'Speaker A' : 'Speaker B'}
    </Badge>
  )
}

function DialogueBubble({
  turn,
  isTarget,
  showTranslation,
  children,
}: {
  turn: DialogueTurn
  isTarget: boolean
  showTranslation: boolean
  children?: React.ReactNode
}) {
  const isLeft = turn.speaker === 'A'

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isLeft ? 'flex-start' : 'flex-end',
        maxWidth: '85%',
        alignSelf: isLeft ? 'flex-start' : 'flex-end',
      }}
    >
      <SpeakerBadge speaker={turn.speaker} />
      <Paper
        p="sm"
        mt={4}
        style={{
          background: isTarget
            ? 'var(--mantine-color-yellow-0)'
            : isLeft
              ? 'var(--card-bg)'
              : 'var(--mantine-color-blue-0)',
          border: isTarget
            ? '2px dashed var(--mantine-color-yellow-6)'
            : '1px solid var(--card-border)',
          borderRadius: 'var(--r-md)',
          minWidth: 120,
        }}
      >
        {isTarget && children ? (
          children
        ) : (
          <Text size="md" fw={isTarget ? 600 : 400}>
            {turn.text}
          </Text>
        )}
        {showTranslation && turn.translation && (
          <Text size="xs" c="dimmed" mt={4} style={{ fontStyle: 'italic' }}>
            {turn.translation}
          </Text>
        )}
      </Paper>
    </Box>
  )
}

export function DialogueShadowing({ exerciseItem, userLanguage, onAnswer }: DialogueShadowingProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.dialogueShadowingData

  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const startTime = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    startTime.current = Date.now()
    // Focus the input after a short delay to let the dialogue render
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  if (!data) {
    return <Text c="red">Error: Missing dialogue shadowing data</Text>
  }

  const { turns, targetTurnIndex, scenarioDescription } = data
  const targetTurn = turns[targetTurnIndex]

  if (!targetTurn) {
    return <Text c="red">Error: Invalid target turn index</Text>
  }

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (submitted || !value.trim()) return

    const result = checkAnswer(value, targetTurn.text, [])

    setIsCorrect(result.isCorrect)
    setSubmitted(true)

    const FEEDBACK_DELAY_MS = result.isCorrect ? 1500 : 0
    setTimeout(() => {
      const latency = Date.now() - startTime.current - FEEDBACK_DELAY_MS
      onAnswer(result.isCorrect, result.isFuzzy, latency, value)
    }, FEEDBACK_DELAY_MS)
  }

  return (
    <Stack gap="md">
      {/* Scenario description */}
      {scenarioDescription && (
        <Alert color="blue" variant="light" icon={<IconMessageCircle size={16} />}>
          <Text size="sm">{scenarioDescription}</Text>
        </Alert>
      )}

      {/* Audio placeholder */}
      {data.audioUrl && (
        <Group justify="center">
          <Button variant="light" leftSection={<IconMicrophone size={16} />} disabled>
            {userLanguage === 'nl' ? 'Audio afspelen' : 'Play audio'}
          </Button>
        </Group>
      )}

      {/* Dialogue turns */}
      <Stack gap="sm" style={{ display: 'flex', flexDirection: 'column' }}>
        {turns.map((turn, idx) => (
          <DialogueBubble
            key={idx}
            turn={turn}
            isTarget={idx === targetTurnIndex}
            showTranslation={submitted || idx !== targetTurnIndex}
          >
            {idx === targetTurnIndex && (
              <Box>
                {!submitted ? (
                  <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.currentTarget.value)}
                    placeholder={userLanguage === 'nl' ? 'Typ het antwoord...' : 'Type your answer...'}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '2px solid var(--mantine-color-gray-4)',
                      outline: 'none',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      padding: '4px 0',
                    }}
                  />
                ) : (
                  <Box>
                    <Text
                      size="md"
                      fw={600}
                      style={{
                        color: isCorrect
                          ? 'var(--mantine-color-green-7)'
                          : 'var(--mantine-color-red-7)',
                      }}
                    >
                      {value}
                    </Text>
                    {!isCorrect && (
                      <Text size="sm" c="dimmed" mt={4}>
                        {t.session.exercise.correctAnswerLabel}: {targetTurn.text}
                      </Text>
                    )}
                  </Box>
                )}
              </Box>
            )}
          </DialogueBubble>
        ))}
      </Stack>

      {/* Submit / feedback */}
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
        <Box style={{ textAlign: 'center', marginTop: '16px' }}>
          <Badge
            color={isCorrect ? 'green' : 'red'}
            size="xl"
            style={{ fontSize: '16px', padding: '12px 20px' }}
          >
            {isCorrect ? t.session.feedback.correct : t.session.feedback.incorrect}
          </Badge>
        </Box>
      )}
    </Stack>
  )
}
