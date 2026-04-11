import { useState, useEffect } from 'react'
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
import { ClozeMcq } from './ClozeMcq'
import { MeaningRecall } from './MeaningRecall'
import { SpeakingExercise } from './SpeakingExercise'
import { FlagButton } from '@/components/exercises/FlagButton'
import { contentFlagService } from '@/services/contentFlagService'
import { useAuthStore } from '@/stores/authStore'
import { processReview, processGrammarReview, type ReviewInput, type GrammarReviewInput } from '@/lib/reviewHandler'
import { translations } from '@/lib/i18n'
import { logError } from '@/lib/logger'
import type { SessionQueueItem, ContentFlag } from '@/types/learning'
import type { ReviewResult, GrammarReviewResult } from '@/lib/reviewHandler'
import type { User } from '@supabase/supabase-js'

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
  const [currentFlag, setCurrentFlag] = useState<ContentFlag | null>(null)

  const exerciseItem = currentItem.exerciseItem
  const isGrammar = currentItem.source === 'grammar'

  // Stable key for exercise components: grammar uses patternId, vocab uses itemId
  const exerciseKey = isGrammar
    ? `grammar-${currentItem.grammarPatternId}-${exerciseItem.exerciseType}`
    : `${exerciseItem.learningItem?.id ?? 'unknown'}-${exerciseItem.exerciseType}`

  useEffect(() => {
    if (isGrammar || !profile?.isAdmin || !authUser || !exerciseItem.learningItem) return
    contentFlagService
      .getFlagForItem(authUser.id, exerciseItem.learningItem.id, exerciseItem.exerciseType)
      .then(flag => setCurrentFlag(flag))
      .catch(() => {})
  }, [isGrammar, profile?.isAdmin, authUser, exerciseItem.learningItem?.id, exerciseItem.exerciseType])

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

    // Show wrong-answer screen immediately — don't wait for the network call.
    // Doorgaan button stays disabled (isProcessing=true) until save completes.
    if (!wasCorrect) {
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
        onContinueToNext()
      }
      // Wrong answer: waitingForContinue is already true; Doorgaan is now enabled.
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

    default:
      return (
        <div style={{ padding: '20px', color: 'red' }}>
          Unsupported exercise type: {exerciseItem.exerciseType}
        </div>
      )
  } })()

  if (waitingForContinue) {
    // Derive what to show in the "correct answer" card, based on exercise type and source.
    let correctAnswer = ''
    if (isGrammar) {
      switch (exerciseItem.exerciseType) {
        case 'contrast_pair':
          correctAnswer = exerciseItem.contrastPairData?.correctOptionId ?? ''
          break
        case 'sentence_transformation':
          correctAnswer = exerciseItem.sentenceTransformationData?.acceptableAnswers[0] ?? ''
          break
        case 'constrained_translation':
          correctAnswer = exerciseItem.constrainedTranslationData?.acceptableAnswers[0] ?? ''
          break
        case 'cloze_mcq':
          correctAnswer = exerciseItem.clozeMcqData?.correctOptionId ?? ''
          break
        default:
          correctAnswer = ''
      }
    } else {
      const primaryMeaning = exerciseItem.meanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? exerciseItem.meanings.find(m => m.translation_language === userLanguage)
      const translation = primaryMeaning?.translation_text ?? ''
      correctAnswer = exerciseItem.learningItem?.base_text ?? ''

      return (
        <Stack gap="xl" style={{ padding: '24px 0' }}>
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
          <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)' }}>
              <Text size="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }} mb={8}>Gevraagd</Text>
              <Text fw={600} size="lg">{translation}</Text>
            </Box>
            <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)' }}>
              <Text size="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }} mb={8}>Correct antwoord</Text>
              <Text fw={700} size="lg" style={{ color: 'var(--accent-primary)' }}>{correctAnswer}</Text>
            </Box>
          </Box>
          <Button onClick={handleContinue} size="lg" fullWidth variant="filled" loading={isProcessing}>
            Doorgaan
          </Button>
        </Stack>
      )
    }

    // Grammar wrong-answer screen: single card with correct answer only
    return (
      <Stack gap="xl" style={{ padding: '24px 0' }}>
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
        <Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)' }}>
          <Text size="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }} mb={8}>Correct antwoord</Text>
          <Text fw={700} size="lg" style={{ color: 'var(--accent-primary)' }}>{correctAnswer}</Text>
        </Box>
        <Button onClick={handleContinue} size="lg" fullWidth variant="filled" loading={isProcessing}>
          Doorgaan
        </Button>
      </Stack>
    )
  }

  // Grammar exercises don't have content flags — FlagButton is vocab-only
  if (isGrammar || !profile?.isAdmin || !authUser || !exerciseItem.learningItem) return <>{exerciseNode}</>

  return (
    <Box style={{ position: 'relative' }}>
      {exerciseNode}
      <FlagButton
        userId={authUser.id}
        learningItemId={exerciseItem.learningItem.id}
        exerciseType={exerciseItem.exerciseType}
        exerciseVariantId={null}
        existingFlag={currentFlag}
        onFlagged={setCurrentFlag}
        onUnflagged={() => setCurrentFlag(null)}
      />
    </Box>
  )
}
