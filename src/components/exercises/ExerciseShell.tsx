import { useState, useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import { ExerciseFeedback } from './ExerciseFeedback'
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
  const [showFeedback, setShowFeedback] = useState(false)
  const [lastResult, setLastResult] = useState<ReviewResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [wasCorrect, setWasCorrect] = useState(false)
  const [isFuzzy, setIsFuzzy] = useState(false)

  const exerciseItem = currentItem.exerciseItem

  // Handle answer submission from exercise component
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
      const isRecognitionMCQ = exerciseItem.exerciseType === 'recognition_mcq'

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
      setLastResult(result)
      setWasCorrect(wasCorrect)
      setIsFuzzy(isFuzzy)
      onAnswer(result, wasCorrect)

      // For correct MCQ: skip feedback, go straight to next
      if (isRecognitionMCQ && wasCorrect) {
        setIsProcessing(false)
        onContinueToNext()
      } else {
        // For wrong MCQ or other types: show feedback
        setShowFeedback(true)
        setIsProcessing(false)
      }
    } catch (err) {
      console.error('Review error:', err)
      logError({ page: 'exercise-shell', action: 'processAnswer', error: err })
      notifications.show({
        color: 'red',
        title: 'Error',
        message: 'Failed to process answer. Please try again.',
      })
      setIsProcessing(false)
    }
  }

  // Handle continue from feedback
  const handleContinue = () => {
    setShowFeedback(false)
    setLastResult(null)
    onContinueToNext()
  }

  // Auto-advance after wrong recognition MCQ answer
  useEffect(() => {
    if (!showFeedback || exerciseItem.exerciseType !== 'recognition_mcq' || wasCorrect) {
      return
    }

    // Wrong MCQ: show feedback briefly then advance
    const timer = setTimeout(() => {
      setShowFeedback(false)
      setLastResult(null)
      onContinueToNext()
    }, 800)

    return () => clearTimeout(timer)
  }, [showFeedback, wasCorrect, exerciseItem.exerciseType, onContinueToNext])

  // Render exercise or feedback
  if (showFeedback && lastResult) {
    return (
      <ExerciseFeedback
        exerciseItem={exerciseItem}
        wasCorrect={wasCorrect}
        isFuzzy={isFuzzy}
        userLanguage={userLanguage}
        onContinue={handleContinue}
      />
    )
  }

  // Dispatch to correct exercise component
  switch (exerciseItem.exerciseType) {
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
  }
}
