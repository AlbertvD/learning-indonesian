import { useState } from 'react'
import { Box, Stack, Text } from '@mantine/core'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import classes from './RecognitionMCQ.module.css'

const MAX_FAILURES = 1  // allow one retry before finalizing as wrong

interface ClozeMcqProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function ClozeMcq({ exerciseItem, userLanguage, onAnswer }: ClozeMcqProps) {
  const t = translations[userLanguage]
  const data = exerciseItem.clozeMcqData
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [failureCount, setFailureCount] = useState(0)
  const [showWrong, setShowWrong] = useState(false)
  const [startTime] = useState(() => Date.now())

  if (!data) {
    return <div style={{ color: 'red' }}>Missing cloze MCQ data</div>
  }

  const handleSelectOption = (option: string) => {
    if (isAnswered || showWrong) return
    const isCorrect = option === data.correctOptionId

    if (isCorrect) {
      setSelectedOption(option)
      setIsAnswered(true)
      setTimeout(() => {
        const latencyMs = Date.now() - startTime - 1500
        onAnswer(true, latencyMs)
      }, 1500)
      return
    }

    const newFailureCount = failureCount + 1
    setFailureCount(newFailureCount)

    if (newFailureCount > MAX_FAILURES) {
      setSelectedOption(option)
      setIsAnswered(true)
      setTimeout(() => onAnswer(false, Date.now() - startTime), 0)
      return
    }

    // Brief wrong flash, then allow retry
    setSelectedOption(option)
    setShowWrong(true)
    setTimeout(() => {
      setShowWrong(false)
      setSelectedOption(null)
    }, 800)
  }

  const isCorrect = selectedOption === data.correctOptionId
  const parts = data.sentence.split('___')

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        {/* Sentence with blank — no translation before answering */}
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">{t.session.exercise.chooseWord}</Text>
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
          {/* Translation shown only after answering */}
          {isAnswered && data.translation && (
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
            if (showWrong && isSelected) {
              statusClass = classes.incorrect
            } else if (isAnswered && isSelected) {
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
