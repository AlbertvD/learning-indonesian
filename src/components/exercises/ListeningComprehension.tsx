// src/components/exercises/ListeningComprehension.tsx
//
// Listening comprehension exercise: listen to audio and answer a question.
// Phase 1: placeholder with transcript shown. Audio playback is a future addition
// once dialogue audio per section is available in the content pipeline.

import { useState, useRef, useEffect } from 'react'
import { Box, Text, Stack, Badge, Button, Group, Paper, Alert } from '@mantine/core'
import { IconHeadphones, IconVolume } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './RecognitionMCQ.module.css'

interface ListeningComprehensionProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function ListeningComprehension({ exerciseItem, userLanguage, onAnswer }: ListeningComprehensionProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.listeningComprehensionData

  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const startTime = useRef(0)

  useEffect(() => {
    startTime.current = Date.now()
  }, [])

  if (!data) {
    return <Text c="red">Error: Missing listening comprehension data</Text>
  }

  const { questionText, options, correctOptionId, transcriptText, explanationText } = data
  const isCorrect = selectedOption === correctOptionId

  const handleSelect = (option: string) => {
    if (submitted) return
    setSelectedOption(option)
    setSubmitted(true)

    const wasCorrect = option === correctOptionId

    const FEEDBACK_DELAY_MS = wasCorrect ? 1500 : 0
    setTimeout(() => {
      const latency = Date.now() - startTime.current - FEEDBACK_DELAY_MS
      onAnswer(wasCorrect, latency)
    }, FEEDBACK_DELAY_MS)
  }

  return (
    <Stack gap="lg">
      {/* Audio section */}
      <Alert
        color="blue"
        variant="light"
        icon={<IconHeadphones size={20} />}
        title={userLanguage === 'nl' ? 'Luisteroefening' : 'Listening Exercise'}
      >
        <Group gap="xs">
          <Button
            variant="light"
            size="sm"
            leftSection={<IconVolume size={16} />}
            disabled
          >
            {userLanguage === 'nl' ? 'Afspelen' : 'Play'}
          </Button>
          <Text size="xs" c="dimmed">
            {userLanguage === 'nl'
              ? 'Audio wordt binnenkort beschikbaar'
              : 'Audio coming soon'}
          </Text>
        </Group>
      </Alert>

      {/* Show transcript as fallback when audio is not available */}
      {transcriptText && (
        <Box>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowTranscript(!showTranscript)}
          >
            {showTranscript
              ? (userLanguage === 'nl' ? 'Transcript verbergen' : 'Hide transcript')
              : (userLanguage === 'nl' ? 'Transcript tonen' : 'Show transcript')}
          </Button>
          {showTranscript && (
            <Paper p="sm" mt="xs" withBorder>
              <Text size="sm" style={{ fontStyle: 'italic' }}>{transcriptText}</Text>
            </Paper>
          )}
        </Box>
      )}

      {/* Question */}
      <Box ta="center">
        <Text size="lg" fw={600}>{questionText}</Text>
      </Box>

      {/* Options */}
      <Stack gap="sm">
        {options.map((option, idx) => {
          const isSelected = selectedOption === option
          const isCorrectOption = option === correctOptionId

          let buttonColor = undefined
          let buttonVariant: 'light' | 'filled' | 'outline' = 'outline'

          if (submitted) {
            if (isCorrectOption) {
              buttonColor = 'green'
              buttonVariant = 'filled'
            } else if (isSelected && !isCorrectOption) {
              buttonColor = 'red'
              buttonVariant = 'filled'
            }
          }

          return (
            <Button
              key={idx}
              variant={buttonVariant}
              color={buttonColor}
              size="lg"
              fullWidth
              onClick={() => handleSelect(option)}
              disabled={submitted && !isSelected && !isCorrectOption}
              className={classes.optionButton}
            >
              {option}
            </Button>
          )
        })}
      </Stack>

      {/* Feedback */}
      {submitted && (
        <Box style={{ textAlign: 'center', marginTop: '16px' }}>
          <Badge
            color={isCorrect ? 'green' : 'red'}
            size="xl"
            style={{ fontSize: '16px', padding: '12px 20px' }}
          >
            {isCorrect ? t.session.feedback.correct : t.session.feedback.incorrect}
          </Badge>
          {explanationText && (
            <Paper p="sm" mt="md" withBorder>
              <Text size="sm">{explanationText}</Text>
            </Paper>
          )}
        </Box>
      )}
    </Stack>
  )
}
