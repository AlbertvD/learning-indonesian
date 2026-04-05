import { useState, useRef, useEffect } from 'react'
import { Box, Button } from '@mantine/core'
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
  const exerciseContainerRef = useRef<HTMLDivElement>(null)
  const [overlayInsets, setOverlayInsets] = useState<{ left: number; right: number }>({ left: 64, right: 64 })

  // When the continue overlay appears, measure the first interactive button inside
  // the exercise component to align the overlay with actual answer box edges.
  useEffect(() => {
    if (!waitingForContinue || !exerciseContainerRef.current) return
    const btn = exerciseContainerRef.current.querySelector('button')
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setOverlayInsets({
      left: rect.left,
      right: window.innerWidth - rect.right,
    })
  }, [waitingForContinue])

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

  return (
    <>
      <div ref={exerciseContainerRef}>
        {exerciseNode}
      </div>
      {waitingForContinue && (
        <Box
          style={{
            position: 'fixed',
            top: '50%',
            left: overlayInsets.left,
            right: overlayInsets.right,
            transform: 'translateY(-50%)',
            zIndex: 200,
            borderRadius: 'var(--mantine-radius-md)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <Button
            onClick={handleContinue}
            size="lg"
            fullWidth
            variant="filled"
            style={{ minHeight: 50 }}
          >
            Doorgaan
          </Button>
        </Box>
      )}
    </>
  )
}
