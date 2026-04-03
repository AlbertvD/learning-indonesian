import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Box, Container, Progress, Stack, Text, Loader, Center, Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { translations } from '@/lib/i18n'
import { buildSessionQueue, type SessionBuildInput } from '@/lib/sessionEngine'
import { applyPolicies, type SessionPoliciesContext } from '@/lib/sessionPolicies'
import type { ReviewResult } from '@/lib/reviewHandler'
import { learningItemService } from '@/services/learningItemService'
import { learnerStateService } from '@/services/learnerStateService'
import { goalService } from '@/services/goalService'
import { analyticsService } from '@/services/analyticsService'
import { sessionSummaryService, type SessionImpactMessages } from '@/services/sessionSummaryService'
import { ExerciseShell } from '@/components/exercises/ExerciseShell'
import { SessionSummary } from '@/components/SessionSummary'
import { logError } from '@/lib/logger'
import type { SessionQueueItem } from '@/types/learning'
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
  const [results, setResults] = useState({ correct: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goalImpactMessages, setGoalImpactMessages] = useState<SessionImpactMessages | null>(null)

  const lessonFilter = searchParams.get('lesson')
  const preferredSessionSize = profile?.preferredSessionSize ?? 15
  const didInit = useRef(false)
  const beforeGoalsRef = useRef<any>(null)

  // Initialize session
  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    if (didInit.current) return
    didInit.current = true

    const initSession = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create session in DB
        let sid: string
        try {
          sid = await startSession(user.id, 'learning')
        } catch (e) {
          throw new Error(`startSession failed: ${JSON.stringify(e)}`)
        }
        setSessionId(sid)

        // Track session started event
        analyticsService.trackSessionStartedFromToday(user.id, sid)

        // Load all necessary data
        let items: Awaited<ReturnType<typeof learningItemService.getLearningItems>>
        try {
          items = await learningItemService.getLearningItems()
        } catch (e) {
          throw new Error(`getLearningItems failed: ${JSON.stringify(e)}`)
        }
        if (!items || items.length === 0) {
          setError('No learning items available. Please contact administrator.')
          setLoading(false)
          return
        }

        let itemStatesArray: Awaited<ReturnType<typeof learnerStateService.getItemStates>>
        let skillStatesArray: Awaited<ReturnType<typeof learnerStateService.getSkillStatesBatch>>
        try {
          ;[itemStatesArray, skillStatesArray] = await Promise.all([
            learnerStateService.getItemStates(user.id),
            learnerStateService.getSkillStatesBatch(user.id),
          ])
        } catch (e) {
          throw new Error(`getStates failed: ${JSON.stringify(e)}`)
        }

        // Convert arrays to maps
        const itemStates: Record<string, any> = {}
        for (const state of itemStatesArray) {
          itemStates[state.learning_item_id] = state
        }

        // Build meanings, contexts, variants maps (parallel individual queries)
        const meaningsByItem: Record<string, any> = {}
        const contextsByItem: Record<string, any> = {}
        const variantsByItem: Record<string, any> = {}

        // Run all queries in parallel to avoid URL length limits
        const results = await Promise.all(
          items.map(item =>
            Promise.all([
              learningItemService.getMeanings(item.id),
              learningItemService.getContexts(item.id),
              learningItemService.getAnswerVariants(item.id),
            ]).then(([meanings, contexts, variants]) => ({ item, meanings, contexts, variants }))
          )
        )

        // Group by item ID
        for (const { item, meanings, contexts, variants } of results) {
          if (meanings.length > 0) {
            meaningsByItem[item.id] = meanings
          }
          if (contexts.length > 0) {
            contextsByItem[item.id] = contexts
          }
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

        // Calculate learner metrics for policies
        // Account age: use earliest item introduction date or default to 0
        let accountAgeDays = 0
        if (itemStatesArray.length > 0) {
          const earliestIntroducedDate = itemStatesArray
            .filter(s => s.introduced_at)
            .map(s => new Date(s.introduced_at!).getTime())
            .reduce((min, time) => Math.min(min, time), Date.now())
          accountAgeDays = Math.floor((Date.now() - earliestIntroducedDate) / (1000 * 60 * 60 * 24))
        }

        const stableItemCount = itemStatesArray.filter(
          s => s.stage !== 'new' && !s.suspended,
        ).length

        // Apply session policies to shape the queue
        const policyContext: SessionPoliciesContext = {
          accountAgeDays,
          stableItemCount,
          sessionInteractionCap: preferredSessionSize,
          // exerciseTypeAvailability and grammarPatterns will be loaded from DB in Phase 2+
        }

        const shapedQueue = applyPolicies(builtQueue, policyContext)
        if (shapedQueue.length === 0) {
          setError('No exercises available after applying session policies.')
          setLoading(false)
          return
        }

        setQueue(shapedQueue)
        setResults({ correct: 0, total: shapedQueue.length })
        setLoading(false)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : JSON.stringify(err)
        console.error('Session init error:', err)
        logError({ page: 'session', action: 'initialize', error: err })
        setError(`Failed to load session: ${errMsg}`)
        setLoading(false)
      }
    }

    initSession()
  }, [user, navigate, profile?.language, profile?.preferredSessionSize, preferredSessionSize, lessonFilter])

  // Handle answer from ExerciseShell
  const handleExerciseAnswer = (_result: ReviewResult, wasCorrect: boolean) => {
    if (wasCorrect) {
      setResults(r => ({ ...r, correct: r.correct + 1 }))
    }
  }

  // Handle continue to next exercise
  const handleContinueToNext = () => {
    setCurrentIndex(i => i + 1)
  }

  // Fetch goal state before session ends
  useEffect(() => {
    if (!user || currentIndex < queue.length) return

    const fetchBeforeGoals = async () => {
      try {
        const progress = await goalService.getGoalProgress(user.id)
        if (progress.state === 'timezone_required') {
          beforeGoalsRef.current = null
        } else {
          beforeGoalsRef.current = progress.weeklyGoals
        }
      } catch (err) {
        console.error('[Session] Failed to fetch before goals:', err)
        beforeGoalsRef.current = null
      }
    }

    fetchBeforeGoals()
  }, [user, currentIndex, queue.length])

  // Handle session completion
  const handleSessionComplete = async () => {
    if (!sessionId || !user) return

    try {
      // End the session first
      await endSession(sessionId)

      // Fetch after goal state and compute impact messages
      try {
        const progress = await goalService.getGoalProgress(user.id)
        const afterGoals = progress.state === 'timezone_required' ? null : progress.weeklyGoals
        const beforeGoals = beforeGoalsRef.current

        const messages = await sessionSummaryService.computeSessionImpactMessages(
          user.id,
          sessionId,
          beforeGoals,
          afterGoals
        )
        setGoalImpactMessages(messages)
      } catch (err) {
        console.error('[Session] Failed to compute goal impact:', err)
        // Don't block navigation if goal computation fails
      }

      // Navigate home after a short delay to allow messages to display
      setTimeout(() => {
        navigate('/')
      }, 500)
    } catch (err) {
      logError({ page: 'session', action: 'complete', error: err })
      const t = translations[profile?.language ?? 'en']
      notifications.show({ color: 'red', title: t.common.error, message: t.common.somethingWentWrong })
      navigate('/')
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
    return <SessionSummary results={results} goalImpactMessages={goalImpactMessages ?? undefined} onComplete={handleSessionComplete} />
  }

  // Show exercise
  const currentItem = queue[currentIndex]
  const progress = (currentIndex / queue.length) * 100
  const userLang = (profile?.language ?? 'en') as 'en' | 'nl'
  const t = translations[userLang]

  return (
    <Box className={classes.container}>
      <Container size="md">
        {/* Progress bar */}
        <Box mb="lg">
          <Box mb="xs" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text size="sm" fw={500}>
              {t.session.exerciseOf} {currentIndex + 1} {t.session.of} {queue.length}
            </Text>
            <Text size="sm" c="dimmed">
              {results.correct}/{results.total} {t.session.correct}
            </Text>
          </Box>
          <Progress value={progress} size="md" radius="md" />
        </Box>

        {/* Exercise shell handles exercise rendering and feedback */}
        {sessionId && user && (
          <Box className={classes.exercise}>
            <ExerciseShell
              key={currentIndex}
              currentItem={currentItem}
              sessionId={sessionId}
              user={user}
              userLanguage={userLang}
              onAnswer={handleExerciseAnswer}
              onContinueToNext={handleContinueToNext}
            />
          </Box>
        )}
      </Container>
    </Box>
  )
}
