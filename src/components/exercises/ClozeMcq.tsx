import { useState } from 'react'
import { Box, Stack, Text } from '@mantine/core'
import type { ExerciseItem } from '@/types/learning'
import classes from './RecognitionMCQ.module.css'

interface ClozeMcqProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function ClozeMcq({ exerciseItem, userLanguage, onAnswer }: ClozeMcqProps) {
  const data = exerciseItem.clozeMcqData
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())

  if (!data) {
    return <div style={{ color: 'red' }}>Missing cloze MCQ data</div>
  }

  const handleSelectOption = (option: string) => {
    if (isAnswered) return
    setSelectedOption(option)
    setIsAnswered(true)

    const isCorrect = option === data.correctOptionId
    const FEEDBACK_DELAY_MS = isCorrect ? 1500 : 0
    setTimeout(() => {
      const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
      onAnswer(isCorrect, latencyMs)
    }, FEEDBACK_DELAY_MS)
  }

  const isCorrect = selectedOption === data.correctOptionId

  // Split sentence on ___ to render the blank inline
  const parts = data.sentence.split('___')

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Sentence with blank */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {userLanguage === 'nl' ? 'Kies het juiste woord' : 'Choose the correct word'}
          </Text>
          <Box className={classes.word} style={{ fontSize: '1.1rem', lineHeight: 1.6, fontWeight: 500 }}>
            {parts[0]}
            <Box
              component="span"
              style={{
                display: 'inline-block',
                minWidth: 80,
                borderBottom: '2px solid var(--accent-primary)',
                margin: '0 4px',
                verticalAlign: 'bottom',
                textAlign: 'center',
                color: isAnswered ? (isCorrect ? 'var(--success)' : 'var(--danger)') : 'transparent',
              }}
            >
              {isAnswered ? selectedOption : '_'}
            </Box>
            {parts[1] ?? ''}
          </Box>
          {data.translation && (
            <Text size="sm" c="dimmed" mt="xs" style={{ fontStyle: 'italic' }}>
              {data.translation}
            </Text>
          )}
        </Box>

        {/* Options */}
        <Stack gap="md">
          {data.options.map((option) => {
            const isSelected = selectedOption === option
            const isCorrectOption = option === data.correctOptionId

            let statusClass = ''
            if (isAnswered && isSelected) {
              statusClass = isCorrect ? classes.correct : classes.incorrect
            } else if (isAnswered && isCorrectOption) {
              statusClass = classes.correct
            }

            return (
              <button
                key={option}
                className={`${classes.option} ${statusClass}`}
                onClick={() => handleSelectOption(option)}
                disabled={isAnswered}
              >
                {option}
              </button>
            )
          })}
        </Stack>
      </Stack>
    </Box>
  )
}
