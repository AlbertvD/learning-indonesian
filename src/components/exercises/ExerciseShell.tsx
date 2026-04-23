import { Suspense, useMemo, useState, useEffect } from 'react'
import { Box, Button, Stack, Text } from '@mantine/core'
import { IconX, IconCheck } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { RecognitionMCQ } from './RecognitionMCQ'
import { CuedRecallExercise } from './CuedRecallExercise'
import { ContrastPairExercise } from './ContrastPairExercise'
import { SentenceTransformationExercise } from './SentenceTransformationExercise'
import { ConstrainedTranslationExercise } from './ConstrainedTranslationExercise'
import { TypedRecall } from './TypedRecall'
import { Cloze } from './Cloze'
import { ClozeMcq } from './ClozeMcq'
import { MeaningRecall } from './MeaningRecall'
import { SpeakingExercise } from './SpeakingExercise'
import { ListeningMCQ } from './ListeningMCQ'
import { Dictation } from './Dictation'
import { FlagButton } from '@/components/exercises/FlagButton'
import { contentFlagService } from '@/services/contentFlagService'
import { useAuthStore } from '@/stores/authStore'
import { processReview, processGrammarReview, type ReviewInput, type GrammarReviewInput } from '@/lib/reviewHandler'
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

interface ExerciseShellProps {
  currentItem: SessionQueueItem
  sessionId: string
  user: User | null
  userLanguage: 'en' | 'nl'
  onAnswer: (result: ReviewResult | GrammarReviewResult, wasCorrect: boolean) => void
  onContinueToNext: () => void
}

export function ExerciseShell({
  currentItem,
  sessionId,
  user,
  userLanguage,
  onAnswer,
  onContinueToNext,
}: ExerciseShellProps) {
  const { user: authUser, profile } = useAuthStore()
  const t = translations[userLanguage]
  const [isProcessing, setIsProcessing] = useState(false)
  const [waitingForContinue, setWaitingForContinue] = useState(false)
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false)
  const [currentFlag, setCurrentFlag] = useState<ContentFlag | null>(null)

  const exerciseItem = currentItem.exerciseItem
  const isGrammar = currentItem.source === 'grammar'
  // Narrowed so TypeScript knows this is only set for grammar items
  const grammarPatternId = currentItem.source === 'grammar' ? currentItem.grammarPatternId : null

  // Stable key for exercise components: grammar uses patternId, vocab uses itemId
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

  // Handle answer submission from exercise component.
  // For wrong answers: immediately show the wrong-answer screen so the user
  // sees the correct answer right away, while processReview runs in the background.
  // For correct answers: advance immediately after processReview completes.
  const handleAnswerFromExercise = async (
    wasCorrect: boolean,
    isFuzzy: boolean,
    latencyMs: number,
    rawResponse: string | null = null
  ) => {
    if (isProcessing || !sessionId || !user) return

    setIsProcessing(true)

    // Show feedback screen immediately for wrong answers — don't wait for the network call.
    // For correct answers, show after processReview completes (button enabled immediately).
    // Doorgaan button stays disabled (isProcessing=true) until save completes.
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

      if (wasCorrect) {
        // Correct answer: auto-advance, no separate feedback screen needed.
        onContinueToNext()
      } else {
        // Wrong answer: waitingForContinue was already set above; now Doorgaan is enabled.
        setLastAnswerCorrect(false)
        setWaitingForContinue(true)
      }
    } catch (err) {
      logError({ page: 'exercise-shell', action: 'processAnswer', error: err })
      notifications.show({
        color: 'red',
        title: t.common.error,
        message: t.common.somethingWentWrong,
      })
      setIsProcessing(false)
      setWaitingForContinue(false)
    }
  }

  const handleContinue = () => {
    if (isProcessing) return
    setWaitingForContinue(false)
    onContinueToNext()
  }

  // Registry-backed path — routes registered types through the new primitive
  // library via Suspense + ErrorBoundary. Thin wrappers report an
  // `AnswerOutcome` shape that's translated into the existing processReview
  // flow via handleAnswerFromExercise below. Unregistered types fall through
  // to the legacy switch.
  const handleAnswerOutcome = (outcome: AnswerOutcome) => {
    if ('skipped' in outcome) {
      // Error-recovery path from <ExerciseErrorBoundary>. Synthesize a wrong
      // result just enough to keep session progressing — does NOT call
      // processReview (no review_events row written for skipped items).
      // Session's handleExerciseAnswer will increment total; re-queue is
      // acceptable because the next attempt may succeed if the underlying
      // data race resolves.
      setLastAnswerCorrect(false)
      setWaitingForContinue(false)
      onContinueToNext()
      return
    }
    // TypeScript now knows outcome is ExerciseAnswerReport.
    handleAnswerFromExercise(
      outcome.wasCorrect,
      outcome.isFuzzy,
      outcome.latencyMs,
      outcome.rawResponse,
    )
  }

  // Memoize to keep the component reference stable across renders (React 19
  // compiler flags inline `resolveExerciseComponent(...)` calls in JSX).
  const LazyExercise = useMemo(
    () => resolveExerciseComponent(exerciseItem.exerciseType),
    [exerciseItem.exerciseType],
  )
  if (LazyExercise) {
    const registryNode = (
      <ExerciseErrorBoundary
        exerciseType={exerciseItem.exerciseType}
        onAnswer={handleAnswerOutcome}
        userLanguage={userLanguage}
      >
        <Suspense fallback={<ExerciseSkeleton variant={exerciseSkeletonVariant[exerciseItem.exerciseType]} />}>
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
    )
    // Short-circuit registry path straight through the feedback-gate logic
    // below. We still want the legacy feedback screen for now (PR #5 will
    // cut it over to <ExerciseFeedback>).
    if (!waitingForContinue) {
      if (!profile?.isAdmin || !authUser) return <>{registryNode}</>
      return (
        <Box style={{ position: 'relative' }}>
          {registryNode}
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
  }

  const exerciseNode = (() => { switch (exerciseItem.exerciseType) {
    case 'recognition_mcq':
      return (
        <RecognitionMCQ
          key={exerciseKey}
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
          key={exerciseKey}
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
          key={exerciseKey}
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
          key={exerciseKey}
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
          key={exerciseKey}
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
          key={exerciseKey}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, isFuzzy, latencyMs, rawResponse) => {
            handleAnswerFromExercise(wasCorrect, isFuzzy, latencyMs, rawResponse)
          }}
        />
      )

    case 'meaning_recall':
      return (
        <MeaningRecall
          key={exerciseKey}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, isFuzzy, latencyMs, rawResponse) => {
            handleAnswerFromExercise(wasCorrect, isFuzzy, latencyMs, rawResponse)
          }}
        />
      )

    case 'cloze_mcq':
      return (
        <ClozeMcq
          key={exerciseKey}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, latencyMs) => {
            handleAnswerFromExercise(wasCorrect, false, latencyMs, null)
          }}
        />
      )

    case 'cloze':
      return (
        <Cloze
          key={exerciseKey}
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
          key={exerciseKey}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, latencyMs) => {
            handleAnswerFromExercise(wasCorrect, false, latencyMs, null)
          }}
        />
      )

    case 'listening_mcq':
      return (
        <ListeningMCQ
          key={exerciseKey}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, latencyMs) => {
            handleAnswerFromExercise(wasCorrect, false, latencyMs, null)
          }}
        />
      )

    case 'dictation':
      return (
        <Dictation
          key={exerciseKey}
          exerciseItem={exerciseItem}
          userLanguage={userLanguage}
          onAnswer={(wasCorrect, isFuzzy, latencyMs, rawResponse) => {
            handleAnswerFromExercise(wasCorrect, isFuzzy, latencyMs, rawResponse)
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
    const t = translations[userLanguage]
    const accentColor = lastAnswerCorrect ? 'var(--success)' : 'var(--danger)'
    const subtleBg = lastAnswerCorrect ? 'var(--success-subtle)' : 'var(--danger-subtle)'
    const borderColor = lastAnswerCorrect ? 'var(--success-border)' : 'var(--danger-border)'

    if (!isGrammar) {
      // Vocab feedback screen (correct or wrong)
      const primaryMeaning = exerciseItem.meanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? exerciseItem.meanings.find(m => m.translation_language === userLanguage)
      const translation = primaryMeaning?.translation_text ?? ''
      const correctAnswer = exerciseItem.learningItem?.base_text ?? ''

      return (
        <Stack gap="xl" style={{ padding: '24px 0' }}>
          <Box style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            background: subtleBg,
            border: `1px solid ${borderColor}`,
            borderRadius: 'var(--r-md)',
          }}>
            {lastAnswerCorrect
              ? <IconCheck size={18} color={accentColor} />
              : <IconX size={18} color={accentColor} />}
            <Text fw={600} style={{ color: accentColor }}>
              {lastAnswerCorrect ? t.session.feedback.correct : t.session.feedback.incorrect}
            </Text>
          </Box>
          <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)' }}>
              <Text size="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }} mb={8}>
                {userLanguage === 'nl' ? 'Gevraagd' : 'Asked'}
              </Text>
              <Text fw={600} size="lg">{translation}</Text>
            </Box>
            <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)' }}>
              <Text size="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }} mb={8}>
                {t.session.exercise.correctAnswerLabel}
              </Text>
              <Text fw={700} size="lg" style={{ color: 'var(--accent-primary)' }}>{correctAnswer}</Text>
            </Box>
          </Box>
          <Button onClick={handleContinue} size="lg" fullWidth variant="filled" loading={isProcessing}>
            {t.session.feedback.continue}
          </Button>
        </Stack>
      )
    }

    // Grammar feedback screen (correct or wrong) — always show answer + explanation
    let correctAnswer: string
    let explanationText = ''
    let targetMeaning = ''

    switch (exerciseItem.exerciseType) {
      case 'contrast_pair':
        correctAnswer = exerciseItem.contrastPairData?.correctOptionId ?? ''
        explanationText = exerciseItem.contrastPairData?.explanationText ?? ''
        targetMeaning = exerciseItem.contrastPairData?.targetMeaning ?? ''
        break
      case 'sentence_transformation':
        correctAnswer = exerciseItem.sentenceTransformationData?.acceptableAnswers[0] ?? ''
        explanationText = exerciseItem.sentenceTransformationData?.explanationText ?? ''
        break
      case 'constrained_translation':
        correctAnswer = exerciseItem.constrainedTranslationData?.acceptableAnswers[0] ?? ''
        explanationText = exerciseItem.constrainedTranslationData?.explanationText ?? ''
        break
      case 'cloze_mcq':
        correctAnswer = exerciseItem.clozeMcqData?.correctOptionId ?? ''
        explanationText = exerciseItem.clozeMcqData?.explanationText ?? ''
        break
      default:
        correctAnswer = ''
    }

    return (
      <Stack gap="xl" style={{ padding: '24px 0' }}>
        <Box style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: subtleBg,
          border: `1px solid ${borderColor}`,
          borderRadius: 'var(--r-md)',
        }}>
          {lastAnswerCorrect
            ? <IconCheck size={18} color={accentColor} />
            : <IconX size={18} color={accentColor} />}
          <Text fw={600} style={{ color: accentColor }}>
            {lastAnswerCorrect ? t.session.feedback.correct : t.session.feedback.incorrect}
          </Text>
        </Box>

        <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)' }}>
          <Text size="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }} mb={8}>
            {t.session.exercise.correctAnswerLabel}
          </Text>
          <Text fw={700} size="lg" style={{ color: 'var(--accent-primary)' }}>{correctAnswer}</Text>
          {targetMeaning && (
            <Text size="sm" c="dimmed" mt={6}>
              {t.session.exercise.meaningLabel} {targetMeaning}
            </Text>
          )}
        </Box>

        {explanationText && (
          <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)', background: 'var(--card-bg)' }}>
            <Text size="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }} mb={8}>
              {t.session.exercise.explanationLabel}
            </Text>
            <Text size="sm">{explanationText}</Text>
          </Box>
        )}

        <Button onClick={handleContinue} size="lg" fullWidth variant="filled" loading={isProcessing}>
          {t.session.feedback.continue}
        </Button>
      </Stack>
    )
  }

  if (!profile?.isAdmin || !authUser) return <>{exerciseNode}</>
  // Vocab exercises require a learningItem; grammar exercises use grammarPatternId
  if (!isGrammar && !exerciseItem.learningItem) return <>{exerciseNode}</>

  return (
    <Box style={{ position: 'relative' }}>
      {exerciseNode}
      <FlagButton
        userId={authUser.id}
        learningItemId={isGrammar ? null : exerciseItem.learningItem!.id}
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
