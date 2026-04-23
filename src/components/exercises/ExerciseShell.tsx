// src/components/exercises/ExerciseShell.tsx
// Post-migration shell — dispatches to the registered exercise via React.lazy
// wrapped in ExerciseErrorBoundary + Suspense(Skeleton), then renders
// <ExerciseFeedback> on wrong/fuzzy commits. Legacy switch + legacy feedback
// block removed in PR #7; legacy exercise components remain in the repo for
// tests + ContentReview's admin preview (separate concern).

import { Suspense, useMemo, useState, useEffect } from 'react'
import { Box } from '@mantine/core'
import { FlagButton } from '@/components/exercises/primitives'
import { contentFlagService } from '@/services/contentFlagService'
import { useAuthStore } from '@/stores/authStore'
import {
  processReview,
  processGrammarReview,
  type ReviewInput,
  type GrammarReviewInput,
} from '@/lib/reviewHandler'
import { translations } from '@/lib/i18n'
import { logError } from '@/lib/logger'
import type { SessionQueueItem, ContentFlag } from '@/types/learning'
import type { ReviewResult, GrammarReviewResult } from '@/lib/reviewHandler'
import type { User } from '@supabase/supabase-js'
import {
  resolveExerciseComponent,
  exerciseSkeletonVariant,
  type AnswerOutcome,
} from './registry'
import { ExerciseErrorBoundary } from './ExerciseErrorBoundary'
import { ExerciseSkeleton } from './ExerciseSkeleton'
import { feedbackPropsFor } from './feedbackMapping'
import { ExerciseFeedback, type FeedbackCopy } from './primitives'
import { useSessionAudio } from '@/contexts/SessionAudioContext'
import { resolveSessionAudioUrl } from '@/services/audioService'

interface ExerciseShellProps {
  currentItem: SessionQueueItem
  sessionId: string
  user: User | null
  userLanguage: 'en' | 'nl'
  onAnswer: (result: ReviewResult | GrammarReviewResult, wasCorrect: boolean) => void
  onContinueToNext: () => void
  /**
   * Called when the <ExerciseErrorBoundary> catches an error. Session
   * increments session-length counter without re-queuing and without writing
   * a review_events row (FSRS untouched). Optional; default is a no-op +
   * onContinueToNext().
   */
  onSkip?: () => void
}

export function ExerciseShell({
  currentItem,
  sessionId,
  user,
  userLanguage,
  onAnswer,
  onContinueToNext,
  onSkip,
}: ExerciseShellProps) {
  const { user: authUser, profile } = useAuthStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [waitingForContinue, setWaitingForContinue] = useState(false)
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false)
  const [lastFuzzy, setLastFuzzy] = useState(false)
  const [lastResponse, setLastResponse] = useState<string | null>(null)
  const [lastCommitFailed, setLastCommitFailed] = useState(false)
  const [currentFlag, setCurrentFlag] = useState<ContentFlag | null>(null)
  const { audioMap } = useSessionAudio()

  const exerciseItem = currentItem.exerciseItem
  const isGrammar = currentItem.source === 'grammar'
  const grammarPatternId = currentItem.source === 'grammar' ? currentItem.grammarPatternId : null

  const exerciseKey = isGrammar
    ? `grammar-${grammarPatternId}-${exerciseItem.exerciseType}`
    : `${exerciseItem.learningItem?.id ?? 'unknown'}-${exerciseItem.exerciseType}`

  useEffect(() => {
    if (!profile?.isAdmin || !authUser) return
    if (grammarPatternId) {
      contentFlagService
        .getFlagForGrammarPattern(authUser.id, grammarPatternId, exerciseItem.exerciseType)
        .then(flag => setCurrentFlag(flag))
        .catch(() => {})
    } else if (exerciseItem.learningItem) {
      contentFlagService
        .getFlagForItem(authUser.id, exerciseItem.learningItem.id, exerciseItem.exerciseType)
        .then(flag => setCurrentFlag(flag))
        .catch(() => {})
    }
  }, [grammarPatternId, profile?.isAdmin, authUser, exerciseItem.learningItem?.id, exerciseItem.exerciseType])

  // Core commit flow — translates the thin wrapper's ExerciseAnswerReport into
  // a processReview call, routes the result to Session, and decides between
  // auto-advance (exact correct) vs show-feedback (fuzzy / wrong).
  const handleAnswerFromExercise = async (
    wasCorrect: boolean,
    isFuzzy: boolean,
    latencyMs: number,
    rawResponse: string | null = null,
  ) => {
    if (isProcessing || !sessionId || !user) return

    setIsProcessing(true)
    setLastResponse(rawResponse)
    setLastFuzzy(isFuzzy)
    setLastCommitFailed(false)

    if (!wasCorrect) {
      setLastAnswerCorrect(false)
      setWaitingForContinue(true)
    }

    try {
      const normalizedResponse = rawResponse ? rawResponse.toLowerCase().trim() : null
      let result: ReviewResult | GrammarReviewResult

      if (currentItem.source === 'grammar') {
        const grammarInput: GrammarReviewInput = {
          userId: user.id,
          sessionId,
          grammarPatternId: currentItem.grammarPatternId,
          exerciseType: exerciseItem.exerciseType,
          currentState: currentItem.grammarState,
          wasCorrect,
          hintUsed: false,
          latencyMs,
          rawResponse,
          normalizedResponse,
        }
        result = await processGrammarReview(grammarInput)
      } else {
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
        }
        result = await processReview(reviewInput)
      }

      onAnswer(result, wasCorrect)
      setIsProcessing(false)

      if (wasCorrect && !isFuzzy) {
        onContinueToNext()
      } else if (wasCorrect && isFuzzy) {
        // Fuzzy always shows feedback (design §6.9).
        setLastAnswerCorrect(true)
        setWaitingForContinue(true)
      } else {
        setLastAnswerCorrect(false)
        setWaitingForContinue(true)
      }
    } catch (err) {
      logError({ page: 'exercise-shell', action: 'processAnswer', error: err })
      setLastCommitFailed(true)
      setIsProcessing(false)
      if (!wasCorrect || isFuzzy) {
        setLastAnswerCorrect(wasCorrect)
        setWaitingForContinue(true)
      }
    }
  }

  const handleContinue = () => {
    if (isProcessing) return
    setWaitingForContinue(false)
    onContinueToNext()
  }

  const handleAnswerOutcome = (outcome: AnswerOutcome) => {
    if ('skipped' in outcome) {
      onSkip?.()
      setLastAnswerCorrect(false)
      setWaitingForContinue(false)
      onContinueToNext()
      return
    }
    handleAnswerFromExercise(
      outcome.wasCorrect,
      outcome.isFuzzy,
      outcome.latencyMs,
      outcome.rawResponse,
    )
  }

  // Stabilize the lazy reference across renders — React 19 compiler flags
  // inline `resolveExerciseComponent(...)` calls in JSX as component-created-
  // during-render, even though the registry is static.
  const LazyExercise = useMemo(
    () => resolveExerciseComponent(exerciseItem.exerciseType),
    [exerciseItem.exerciseType],
  )

  // Feedback screen takes over the surface on fuzzy/wrong commits.
  if (waitingForContinue) {
    const t = translations[userLanguage]
    const outcome: 'correct' | 'fuzzy' | 'wrong' =
      lastAnswerCorrect && !lastFuzzy ? 'correct' :
      lastAnswerCorrect && lastFuzzy ? 'fuzzy' :
      'wrong'
    const promptAudioUrl = exerciseItem.learningItem?.base_text
      ? resolveSessionAudioUrl(audioMap, exerciseItem.learningItem.base_text)
      : undefined
    const feedbackProps = feedbackPropsFor({
      item: exerciseItem,
      response: lastResponse,
      outcome,
      userLanguage,
      isGrammar,
      promptAudioUrl,
      commitFailed: lastCommitFailed,
    })
    const copy: FeedbackCopy = {
      outcomeCorrect:      t.session.feedback.correct,
      outcomeAlmost:       t.session.feedback.almostCorrect ?? t.session.feedback.correct,
      outcomeWrong:        t.session.feedback.incorrect,
      announceCorrect:     t.session.feedback.correct,
      announceWrong:       `${t.session.feedback.incorrect}. ${t.session.exercise.correctAnswerLabel}: {x}.`,
      announceFuzzy:       `${t.session.feedback.almostCorrect ?? t.session.feedback.correct} — {x}.`,
      roleLabelHeard:      userLanguage === 'nl' ? 'Je hoorde' : 'You heard',
      roleLabelShown:      userLanguage === 'nl' ? 'Je zag' : 'You saw',
      roleLabelSaid:       userLanguage === 'nl' ? 'Het woord was' : 'The word was',
      roleLabelTarget:     t.session.exercise.correctAnswerLabel,
      roleLabelYourAnswer: userLanguage === 'nl' ? 'Jouw antwoord' : 'Your answer',
      roleLabelMeaning:    t.session.exercise.meaningLabel,
      roleLabelExplanation: t.session.exercise.explanationLabel,
      alsoAccepted:        userLanguage === 'nl' ? 'Ook goed' : 'Also accepted',
      replayAudio:         userLanguage === 'nl' ? 'Herhaal audio' : 'Replay audio',
      commitFailed:        userLanguage === 'nl'
        ? 'Kon beoordeling niet opslaan — we gaan toch door.'
        : "Couldn't save review — continuing anyway.",
      emptyAnswer:         userLanguage === 'nl' ? '(geen antwoord)' : '(no answer)',
    }
    return (
      <ExerciseFeedback
        {...feedbackProps}
        onContinue={handleContinue}
        continueLabel={t.session.feedback.continue}
        copy={copy}
      />
    )
  }

  // Defensive fallback — only reachable if a new ExerciseType is added to the
  // union without a corresponding registry entry. The check is TypeScript-
  // enforceable later by converting exerciseRegistry to Record<> (vs Partial<>).
  const exerciseNode: React.ReactNode = LazyExercise ? (
    <ExerciseErrorBoundary
      exerciseType={exerciseItem.exerciseType}
      onAnswer={handleAnswerOutcome}
      userLanguage={userLanguage}
    >
      <Suspense fallback={<ExerciseSkeleton variant={exerciseSkeletonVariant[exerciseItem.exerciseType]} />}>
        {/* TODO: wire `onEvent` to analyticsService.trackExerciseEvent once a
            sink exists. Hook events (exercise_shown, answer_committed,
            exercise_commit_failed) are currently dropped. */}
        {/* eslint-disable-next-line react-hooks/static-components -- LazyExercise
            is a React.lazy reference stable per exerciseType via useMemo above;
            the compiler can't statically verify this. */}
        <LazyExercise
          key={exerciseKey}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={handleAnswerOutcome}
        />
      </Suspense>
    </ExerciseErrorBoundary>
  ) : (
    <div style={{ padding: '20px', color: 'red' }}>
      Unsupported exercise type: {exerciseItem.exerciseType}. Add an entry to
      src/components/exercises/registry.ts.
    </div>
  )

  if (!profile?.isAdmin || !authUser) return <>{exerciseNode}</>

  return (
    <Box style={{ position: 'relative' }}>
      {exerciseNode}
      <FlagButton
        userId={authUser.id}
        learningItemId={isGrammar ? null : exerciseItem.learningItem?.id ?? null}
        grammarPatternId={grammarPatternId}
        exerciseType={exerciseItem.exerciseType}
        exerciseVariantId={null}
        existingFlag={currentFlag}
        onFlagged={setCurrentFlag}
        onUnflagged={() => setCurrentFlag(null)}
      />
    </Box>
  )
}
