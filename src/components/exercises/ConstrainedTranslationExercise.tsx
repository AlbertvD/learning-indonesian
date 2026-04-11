import { useState, useRef, useEffect } from 'react'
import { Box, Button, TextInput, Stack, Text, Badge } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import classes from './TypedRecall.module.css'

interface ConstrainedTranslationExerciseProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function ConstrainedTranslationExercise({
  exerciseItem,
  userLanguage,
  onAnswer,
}: ConstrainedTranslationExerciseProps) {
  const t = translations[userLanguage]
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const data = exerciseItem.constrainedTranslationData

  if (!data) {
    return <div style={{ color: 'red' }}>Missing constrained translation data</div>
  }

  const isClozeMode = !!data.targetSentenceWithBlank && !!data.blankAcceptableAnswers?.length

  const handleSubmit = () => {
    if (isAnswered || !response.trim()) return

    let isCorrect = false
    let isFuzzy = false

    if (isClozeMode) {
      const answers = data.blankAcceptableAnswers!
      const result = checkAnswer(response, answers[0], answers)
      isCorrect = result.isCorrect
      isFuzzy = result.isFuzzy
    } else {
      const result = checkAnswer(response, data.acceptableAnswers[0], data.acceptableAnswers)
      isCorrect = result.isCorrect
      isFuzzy = result.isFuzzy

      if (isCorrect && data.disallowedShortcutForms) {
        const normalized = response.toLowerCase().trim()
        for (const shortcut of data.disallowedShortcutForms) {
          if (normalized === shortcut.toLowerCase()) {
            isCorrect = false
            break
          }
        }
      }
    }

    setIsAnswered(true)

    const FEEDBACK_DELAY_MS = isCorrect ? 1500 : 0
    setTimeout(() => {
      const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
      onAnswer(isCorrect, isFuzzy, latencyMs, response)
    }, FEEDBACK_DELAY_MS)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnswered) {
      handleSubmit()
    }
  }

  const result = isClozeMode
    ? checkAnswer(response, data.blankAcceptableAnswers![0], data.blankAcceptableAnswers!)
    : checkAnswer(response, data.acceptableAnswers[0], data.acceptableAnswers)
  const isCorrect = result.isCorrect

  // Cloze mode: sentence with blank
  if (isClozeMode) {
    const parts = data.targetSentenceWithBlank!.split('___')
    const correctWord = data.blankAcceptableAnswers![0]

    return (
      <Box className={classes.container}>
        <Stack gap="xl">
          {/* Sentence with blank */}
          <Box className={classes.promptSection}>
            <Text size="sm" c="dimmed" mb="xs">{t.session.exercise.chooseWord}</Text>
            <Box style={{ fontSize: '1.1rem', lineHeight: 1.6, fontWeight: 500 }}>
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
                  color: isAnswered ? (isCorrect ? 'var(--success)' : 'var(--danger)') : 'inherit',
                }}
              >
                {isAnswered ? (isCorrect ? response : correctWord) : (response || '\u00A0')}
              </Box>
              {parts[1] ?? ''}
            </Box>
            {isAnswered && (
              <Text size="sm" c="dimmed" mt="xs" style={{ fontStyle: 'italic' }}>
                {data.sourceLanguageSentence}
              </Text>
            )}
          </Box>

          {/* Input */}
          {!isAnswered && (
            <Box>
              <TextInput
                ref={inputRef}
                placeholder={t.session.exercise.typeAnswer}
                value={response}
                onChange={(e) => setResponse(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                size="lg"
                className={classes.input}
                aria-label="Answer input"
              />
            </Box>
          )}

          {/* Submit */}
          {!isAnswered && (
            <Button
              onClick={handleSubmit}
              disabled={!response.trim()}
              size="lg"
              fullWidth
              rightSection={<IconArrowRight size={18} />}
            >
              {t.session.exercise.checkAnswer}
            </Button>
          )}

          {/* Result */}
          {isAnswered && (
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
                  <Text size="xl" fw={700}>{correctWord}</Text>
                </Box>
              )}
            </Box>
          )}
        </Stack>
      </Box>
    )
  }

  // Full-sentence translation mode (legacy / structural patterns)
  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        <Box className={classes.promptSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {data.sourceLanguageSentence.includes(' ')
              ? t.session.exercise.translateInstruction
              : t.session.exercise.translateWord}
          </Text>
          <Box className={classes.translation}>{data.sourceLanguageSentence}</Box>
        </Box>

        <Box>
          <TextInput
            ref={inputRef}
            placeholder={t.session.exercise.typeAnswer}
            value={response}
            onChange={(e) => setResponse(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isAnswered}
            size="lg"
            className={classes.input}
            aria-label="Answer input"
          />
        </Box>

        {!isAnswered && (
          <Button
            onClick={handleSubmit}
            disabled={!response.trim()}
            size="lg"
            fullWidth
            rightSection={<IconArrowRight size={18} />}
          >
            {t.session.exercise.checkAnswer}
          </Button>
        )}

        {isAnswered && (
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
                <Text size="xl" fw={700}>{data.acceptableAnswers[0]}</Text>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
