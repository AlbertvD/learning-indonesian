import { useState } from 'react'
import { Box, Button, Stack, Text } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { RecognitionMCQ } from './RecognitionMCQ'
import { CuedRecallExercise } from './CuedRecallExercise'
import { ContrastPairExercise } from './ContrastPairExercise'
import { SentenceTransformationExercise } from './SentenceTransformationExercise'
import { ConstrainedTranslationExercise } from './ConstrainedTranslationExercise'
import { TypedRecall } from './TypedRecall'
import { Cloze } from './Cloze'
import { SpeakingExercise } from './SpeakingExercise'
import { processReview, type ReviewInput } from '@/lib/reviewHandler'
import { logError } from '@/lib/logger'
import type { SessionQueueItem } from '@/types/learning'
import type { ReviewResult } from '@/lib/reviewHandler'
import type { User } from '@supabase/supabase-js'

interface ExerciseShellProps {
  currentItem: SessionQueueItem
  sessionId: string
  user: User | null
  userLanguage: 'en' | 'nl'
  accountAgeDays?: number
  onAnswer: (result: ReviewResult, wasCorrect: boolean) => void
  onContinueToNext: () => void
}

export function ExerciseShell({
  currentItem,
  sessionId,
  user,
  userLanguage,
  accountAgeDays = 0,
  onAnswer,
  onContinueToNext,
}: ExerciseShellProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [waitingForContinue, setWaitingForContinue] = useState(false)

  const exerciseItem = currentItem.exerciseItem

  // Handle answer submission from exercise component.
  // The exercise component shows inline feedback for its delay window,
  // then calls this. We persist the review and advance immediately.
  const handleAnswerFromExercise = async (
    wasCorrect: boolean,
    isFuzzy: boolean,
    latencyMs: number,
    rawResponse: string | null = null
  ) => {
    if (isProcessing || !sessionId || !user) return

    setIsProcessing(true)

    try {
      const normalizedResponse = rawResponse ? rawResponse.toLowerCase().trim() : null
      const reviewInput: ReviewInput = {
        userId: user.id,
        sessionId,
        exerciseItem,
        currentItemState: currentItem.learnerItemState,
        currentSkillState: currentItem.learnerSkillState,
        wasCorrect,
        isFuzzy,
        hintUsed: false,
        latencyMs,
        rawResponse,
        normalizedResponse,
        accountAgeDays,
      }

      const result = await processReview(reviewInput)
      onAnswer(result, wasCorrect)
      setIsProcessing(false)

      if (wasCorrect) {
        onContinueToNext()
      } else {
        // Wrong answer: show the Continue button so the user can absorb
        // the correct answer before moving on.
        setWaitingForContinue(true)
      }
    } catch (err) {
      logError({ page: 'exercise-shell', action: 'processAnswer', error: err })
      notifications.show({
        color: 'red',
        title: 'Error',
        message: 'Failed to process answer. Please try again.',
      })
      setIsProcessing(false)
    }
  }

  const handleContinue = () => {
    setWaitingForContinue(false)
    onContinueToNext()
  }

  const exerciseNode = (() => { switch (exerciseItem.exerciseType) {
    case 'recognition_mcq':
      return (
        <RecognitionMCQ
          key={`${currentItem.exerciseItem.learningItem.id}-${exerciseItem.exerciseType}`}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, latencyMs) => {
            handleAnswerFromExercise(wasCorrect, false, latencyMs, null)
          }}
        />
      )

    case 'cued_recall':
      return (
        <CuedRecallExercise
          key={`${currentItem.exerciseItem.learningItem.id}-${exerciseItem.exerciseType}`}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, latencyMs) => {
            handleAnswerFromExercise(wasCorrect, false, latencyMs, null)
          }}
        />
      )

    case 'contrast_pair':
      return (
        <ContrastPairExercise
          key={`${currentItem.exerciseItem.learningItem.id}-${exerciseItem.exerciseType}`}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, latencyMs) => {
            handleAnswerFromExercise(wasCorrect, false, latencyMs, null)
          }}
        />
      )

    case 'sentence_transformation':
      return (
        <SentenceTransformationExercise
          key={`${currentItem.exerciseItem.learningItem.id}-${exerciseItem.exerciseType}`}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, isFuzzy, latencyMs, rawResponse) => {
            handleAnswerFromExercise(wasCorrect, isFuzzy, latencyMs, rawResponse)
          }}
        />
      )

    case 'constrained_translation':
      return (
        <ConstrainedTranslationExercise
          key={`${currentItem.exerciseItem.learningItem.id}-${exerciseItem.exerciseType}`}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, isFuzzy, latencyMs, rawResponse) => {
            handleAnswerFromExercise(wasCorrect, isFuzzy, latencyMs, rawResponse)
          }}
        />
      )

    case 'typed_recall':
      return (
        <TypedRecall
          key={`${currentItem.exerciseItem.learningItem.id}-${exerciseItem.exerciseType}`}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, isFuzzy, latencyMs, rawResponse) => {
            handleAnswerFromExercise(wasCorrect, isFuzzy, latencyMs, rawResponse)
          }}
        />
      )

    case 'cloze':
      return (
        <Cloze
          key={`${currentItem.exerciseItem.learningItem.id}-${exerciseItem.exerciseType}`}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, isFuzzy, latencyMs, rawResponse) => {
            handleAnswerFromExercise(wasCorrect, isFuzzy, latencyMs, rawResponse)
          }}
        />
      )

    case 'speaking':
      return (
        <SpeakingExercise
          key={`${currentItem.exerciseItem.learningItem.id}-${exerciseItem.exerciseType}`}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, latencyMs) => {
            handleAnswerFromExercise(wasCorrect, false, latencyMs, null)
          }}
        />
      )

    default:
      return (
        <div style={{ padding: '20px', color: 'red' }}>
          Unsupported exercise type: {exerciseItem.exerciseType}
        </div>
      )
  } })()

  if (waitingForContinue) {
    const { learningItem, meanings } = exerciseItem
    const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
      ?? meanings.find(m => m.translation_language === userLanguage)
    const translation = primaryMeaning?.translation_text ?? ''

    return (
      <Stack gap="xl" style={{ padding: '24px 0' }}>
        {/* Wrong answer banner */}
        <Box style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'var(--danger-subtle)',
          border: '1px solid var(--danger-border)',
          borderRadius: 'var(--r-md)',
        }}>
          <IconX size={18} color="var(--danger)" />
          <Text fw={600} style={{ color: 'var(--danger)' }}>Fout</Text>
        </Box>

        {/* Two cards */}
        <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)' }}>
            <Text size="xs" c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }} mb={8}>Gevraagd</Text>
            <Text fw={600} size="lg">{translation}</Text>
          </Box>
          <Box style={{ padding: '16px', border: '1px solid var(--accent-primary-border)', borderRadius: 'var(--r-md)' }}>
            <Text size="xs" c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }} mb={8}>Correct antwoord</Text>
            <Text fw={700} size="lg" style={{ color: 'var(--accent-primary)' }}>{learningItem.base_text}</Text>
          </Box>
        </Box>

        {/* Continue */}
        <Button onClick={handleContinue} size="lg" fullWidth variant="filled">
          Doorgaan
        </Button>
      </Stack>
    )
  }

  return <>{exerciseNode}</>
}
