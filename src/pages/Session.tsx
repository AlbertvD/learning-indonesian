import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Box, Container, Progress, Stack, Text, Loader, Center, Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { buildSessionQueue, type SessionBuildInput } from '@/lib/sessionEngine'
import { processReview, type ReviewInput } from '@/lib/reviewHandler'
import { learningItemService } from '@/services/learningItemService'
import { learnerStateService } from '@/services/learnerStateService'
import { RecognitionMCQ } from '@/components/exercises/RecognitionMCQ'
import { TypedRecall } from '@/components/exercises/TypedRecall'
import { Cloze } from '@/components/exercises/Cloze'
import { ExerciseFeedback } from '@/components/exercises/ExerciseFeedback'
import { SessionSummary } from '@/components/SessionSummary'
import { logError } from '@/lib/logger'
import type { SessionQueueItem } from '@/types/learning'
import type { ReviewResult } from '@/lib/reviewHandler'
import { startSession, endSession } from '@/lib/session'
import classes from './Session.module.css'

export function Session() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, profile } = useAuthStore()

  // State
  const [queue, setQueue] = useState<SessionQueueItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [lastResult, setLastResult] = useState<ReviewResult | null>(null)
  const [results, setResults] = useState({ correct: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastWasCorrect, setLastWasCorrect] = useState(false)

  const lessonFilter = searchParams.get('lesson')
  const preferredSessionSize = profile?.preferredSessionSize ?? 15

  // Initialize session
  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    const initSession = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create session in DB
        const sid = await startSession(user.id, 'learning')
        setSessionId(sid)

        // Load all necessary data
        const items = await learningItemService.getLearningItems()
        if (!items || items.length === 0) {
          setError('No learning items available. Please contact administrator.')
          setLoading(false)
          return
        }

        const [itemStatesArray, skillStatesArray] = await Promise.all([
          learnerStateService.getItemStates(user.id),
          learnerStateService.getSkillStatesBatch(user.id, items.map(i => i.id)),
        ])

        // Convert arrays to maps
        const itemStates: Record<string, any> = {}
        for (const state of itemStatesArray) {
          itemStates[state.learning_item_id] = state
        }

        // Build meanings, contexts, variants maps
        const meaningsByItem: Record<string, any> = {}
        const contextsByItem: Record<string, any> = {}
        const variantsByItem: Record<string, any> = {}

        for (const item of items) {
          // Get meanings
          const meanings = await learningItemService.getMeanings(item.id)
          if (meanings.length > 0) {
            meaningsByItem[item.id] = meanings
          }

          // Get contexts
          const contexts = await learningItemService.getContexts(item.id)
          if (contexts.length > 0) {
            contextsByItem[item.id] = contexts
          }

          // Get variants
          const variants = await learningItemService.getAnswerVariants(item.id)
          if (variants.length > 0) {
            variantsByItem[item.id] = variants
          }
        }

        // Convert skill states to map
        const skillStatesMap: Record<string, any[]> = {}
        for (const state of skillStatesArray) {
          if (!skillStatesMap[state.learning_item_id]) {
            skillStatesMap[state.learning_item_id] = []
          }
          skillStatesMap[state.learning_item_id].push(state)
        }

        // Build session queue
        const input: SessionBuildInput = {
          allItems: items,
          meaningsByItem,
          contextsByItem,
          variantsByItem,
          itemStates,
          skillStates: skillStatesMap,
          preferredSessionSize,
          lessonFilter,
          userLanguage: profile?.language ?? 'en',
        }

        const builtQueue = buildSessionQueue(input)
        if (builtQueue.length === 0) {
          setError('No exercises available for this session.')
          setLoading(false)
          return
        }

        setQueue(builtQueue)
        setResults({ correct: 0, total: builtQueue.length })
        setLoading(false)
      } catch (err) {
        console.error('Session init error:', err)
        logError({ page: 'session', action: 'initialize', error: err })
        setError('Failed to load session. Please try again.')
        setLoading(false)
      }
    }

    initSession()
  }, [user, navigate, profile?.language, profile?.preferredSessionSize, preferredSessionSize, lessonFilter])

  // Handle answer
  const handleAnswer = async (
    wasCorrect: boolean,
    isFuzzy: boolean,
    latencyMs: number,
    rawResponse: string | null = null
  ) => {
    if (!sessionId || !user || currentIndex >= queue.length) return

    try {
      const item = queue[currentIndex]
      const normalizedResponse = rawResponse ? rawResponse.toLowerCase().trim() : null

      const reviewInput: ReviewInput = {
        userId: user.id,
        sessionId,
        exerciseItem: item.exerciseItem,
        currentItemState: item.learnerItemState,
        currentSkillState: item.learnerSkillState,
        wasCorrect,
        isFuzzy,
        hintUsed: false,
        latencyMs,
        rawResponse,
        normalizedResponse,
      }

      const result = await processReview(reviewInput)
      setLastResult(result)
      setShowFeedback(true)

      // Update results
      if (wasCorrect) {
        setResults(r => ({ ...r, correct: r.correct + 1 }))
      }
    } catch (err) {
      console.error('Review error:', err)
      logError({ page: 'session', action: 'processAnswer', error: err })
      notifications.show({
        color: 'red',
        title: 'Error',
        message: 'Failed to process answer. Please try again.',
      })
    }
  }

  // Handle continue from feedback
  const handleContinue = () => {
    setShowFeedback(false)
    setCurrentIndex(i => i + 1)
  }

  // Handle session completion
  const handleSessionComplete = async () => {
    if (!sessionId) return

    try {
      await endSession(sessionId)
      navigate('/')
    } catch (err) {
      console.error('Session completion error:', err)
      logError({ page: 'session', action: 'complete', error: err })
    }
  }

  // Render states
  if (loading) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader />
          <Text c="dimmed">Loading session...</Text>
        </Stack>
      </Center>
    )
  }

  if (error) {
    return (
      <Container size="sm" py="xl">
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Session Error">
          {error}
        </Alert>
      </Container>
    )
  }

  if (queue.length === 0) {
    return (
      <Container size="sm" py="xl">
        <Alert color="yellow" title="No Exercises">
          No exercises available for this session. Please try another lesson or practice set.
        </Alert>
      </Container>
    )
  }

  // Session is complete
  if (currentIndex >= queue.length) {
    return <SessionSummary results={results} onComplete={handleSessionComplete} />
  }

  // Show exercise or feedback
  const currentItem = queue[currentIndex]
  const progress = (currentIndex / queue.length) * 100

  // Wrap handleAnswer to track correctness
  const handleAnswerWrapper = async (
    wasCorrect: boolean,
    isFuzzy: boolean,
    latencyMs: number,
    rawResponse: string | null = null
  ) => {
    setLastWasCorrect(wasCorrect)
    await handleAnswer(wasCorrect, isFuzzy, latencyMs, rawResponse)
  }

  return (
    <Box className={classes.container}>
      <Container size="md">
        {/* Progress bar */}
        <Box mb="lg">
          <Box mb="xs" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text size="sm" fw={500}>
              Exercise {currentIndex + 1} of {queue.length}
            </Text>
            <Text size="sm" c="dimmed">
              {results.correct}/{results.total} correct
            </Text>
          </Box>
          <Progress value={progress} size="md" radius="md" />
        </Box>

        {/* Exercise or feedback */}
        {!showFeedback ? (
          <Box className={classes.exercise}>
            {currentItem.exerciseItem.exerciseType === 'recognition_mcq' && (
              <RecognitionMCQ
                exerciseItem={currentItem.exerciseItem}
                userLanguage={profile?.language ?? 'en'}
                onAnswer={(wasCorrect, latencyMs) => {
                  setLastWasCorrect(wasCorrect)
                  handleAnswer(wasCorrect, false, latencyMs, null)
                }}
              />
            )}
            {currentItem.exerciseItem.exerciseType === 'typed_recall' && (
              <TypedRecall
                exerciseItem={currentItem.exerciseItem}
                userLanguage={profile?.language ?? 'en'}
                onAnswer={handleAnswerWrapper}
              />
            )}
            {currentItem.exerciseItem.exerciseType === 'cloze' && (
              <Cloze
                exerciseItem={currentItem.exerciseItem}
                onAnswer={handleAnswerWrapper}
              />
            )}
          </Box>
        ) : lastResult ? (
          <ExerciseFeedback
            exerciseItem={currentItem.exerciseItem}
            wasCorrect={lastWasCorrect}
            userLanguage={profile?.language ?? 'en'}
            onContinue={handleContinue}
          />
        ) : null}
      </Container>
    </Box>
  )
}
