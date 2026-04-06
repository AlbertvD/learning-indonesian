import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Box, Container, Progress, Stack, Text, Loader, Center, Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { translations } from '@/lib/i18n'
import { buildSessionQueue, type SessionBuildInput, type SessionMode } from '@/lib/sessionEngine'
import { applyPolicies, type SessionPoliciesContext } from '@/lib/sessionPolicies'
import type { ReviewResult } from '@/lib/reviewHandler'
import { learningItemService } from '@/services/learningItemService'
import { learnerStateService } from '@/services/learnerStateService'
import { lessonService } from '@/services/lessonService'
import { goalService } from '@/services/goalService'
import { analyticsService } from '@/services/analyticsService'
import { sessionSummaryService, type SessionImpactMessages } from '@/services/sessionSummaryService'
import { exerciseAvailabilityService } from '@/services/exerciseAvailabilityService'
import { ExerciseShell } from '@/components/exercises/ExerciseShell'
import { SessionSummary } from '@/components/SessionSummary'
import { logError } from '@/lib/logger'
import type { SessionQueueItem, LearnerItemState, LearnerSkillState, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant, WeeklyGoal } from '@/types/learning'
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
  const [accountAgeDays, setAccountAgeDays] = useState(0)

  const lessonFilter = searchParams.get('lesson')
  const sessionModeParam = searchParams.get('mode')
  const sessionMode: SessionMode = (['backlog_clear', 'recall_sprint', 'push_to_productive', 'quick'].includes(sessionModeParam ?? ''))
    ? sessionModeParam as SessionMode
    : 'standard'
  const preferredSessionSize = profile?.preferredSessionSize ?? 15
  const dailyNewItemsLimit = profile?.dailyNewItemsLimit ?? 10
  const didInit = useRef(false)
  const beforeGoalsRef = useRef<WeeklyGoal[] | null>(null)

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
        let lessonsBasic: { id: string; order_index: number }[]
        try {
          ;[itemStatesArray, skillStatesArray, lessonsBasic] = await Promise.all([
            learnerStateService.getItemStates(user.id),
            learnerStateService.getSkillStatesBatch(user.id),
            lessonService.getLessonsBasic(),
          ])
        } catch (e) {
          throw new Error(`getStates failed: ${JSON.stringify(e)}`)
        }

        // lessonId → order_index for lesson-gated new item introduction
        const lessonOrder: Record<string, number> = {}
        for (const l of lessonsBasic) {
          lessonOrder[l.id] = l.order_index
        }

        // Convert arrays to maps
        const itemStates: Record<string, LearnerItemState> = {}
        for (const state of itemStatesArray) {
          itemStates[state.learning_item_id] = state
        }

        // Build meanings, contexts, variants maps (parallel individual queries)
        const meaningsByItem: Record<string, ItemMeaning[]> = {}
        const contextsByItem: Record<string, ItemContext[]> = {}
        const variantsByItem: Record<string, ItemAnswerVariant[]> = {}
        const exerciseVariantsByContext: Record<string, ExerciseVariant[]> = {}

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

        // Group by item ID and collect all context IDs
        const allContextIds: string[] = []
        for (const { item, meanings, contexts, variants } of results) {
          if (meanings.length > 0) {
            meaningsByItem[item.id] = meanings
          }
          if (contexts.length > 0) {
            contextsByItem[item.id] = contexts
            allContextIds.push(...contexts.map(c => c.id))
          }
          if (variants.length > 0) {
            variantsByItem[item.id] = variants
          }
        }

        // Load published exercise variants for all contexts
        if (allContextIds.length > 0) {
          try {
            const publishedVariants = await learningItemService.getExerciseVariantsByContext(allContextIds)
            for (const variant of publishedVariants) {
              if (!exerciseVariantsByContext[variant.context_id]) {
                exerciseVariantsByContext[variant.context_id] = []
              }
              exerciseVariantsByContext[variant.context_id].push(variant)
            }
          } catch (err) {
            // Log but don't fail if exercise variants not available
            console.warn('Failed to load exercise variants:', err)
          }
        }

        // Convert skill states to map
        const skillStatesMap: Record<string, LearnerSkillState[]> = {}
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
          exerciseVariantsByContext,
          itemStates,
          skillStates: skillStatesMap,
          preferredSessionSize,
          dailyNewItemsLimit,
          lessonFilter,
          userLanguage: profile?.language ?? 'en',
          lessonOrder,
          sessionMode,
        }

        const builtQueue = buildSessionQueue(input)
        if (builtQueue.length === 0) {
          setError('No exercises available for this session.')
          setLoading(false)
          return
        }

        // Account age: used by reviewHandler to cap early FSRS intervals
        let ageDays = 0
        if (user.created_at) {
          ageDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24))
        }
        setAccountAgeDays(ageDays)

        // Load exercise type availability (cached, 1hr TTL)
        let exerciseTypeAvailability: Record<string, import('@/types/learning').ExerciseTypeAvailability> | undefined
        try {
          exerciseTypeAvailability = await exerciseAvailabilityService.getAllAvailability()
        } catch (err) {
          // Non-fatal: if availability can't be loaded, all types pass through
          console.warn('Failed to load exercise availability:', err)
        }

        // Load grammar patterns for confusion-group interleaving
        let grammarPatterns: Record<string, { confusion_group?: string }> | undefined
        try {
          grammarPatterns = await learningItemService.getGrammarPatternsByItem(items.map(i => i.id))
        } catch (err) {
          console.warn('Failed to load grammar patterns:', err)
        }

        // Apply session policies to shape the queue
        const policyContext: SessionPoliciesContext = {
          sessionInteractionCap: preferredSessionSize,
          exerciseTypeAvailability,
          grammarPatterns,
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

  // How many positions ahead to reinsert a wrong-answer item.
  // 3 means the user sees 2 other items before the retry appears.
  const REQUEUE_OFFSET = 3

  // Handle answer from ExerciseShell
  const handleExerciseAnswer = (_result: ReviewResult, wasCorrect: boolean) => {
    if (wasCorrect) {
      setResults(r => ({ ...r, correct: r.correct + 1 }))
    } else {
      // Requeue the item a few positions later so the user revisits it
      // before the session ends. Increment total so the score reflects attempts.
      setQueue(q => {
        const item = q[currentIndex]
        const insertAt = Math.min(currentIndex + REQUEUE_OFFSET, q.length)
        const next = [...q]
        next.splice(insertAt, 0, item)
        return next
      })
      setResults(r => ({ ...r, total: r.total + 1 }))
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
              accountAgeDays={accountAgeDays}
              onAnswer={handleExerciseAnswer}
              onContinueToNext={handleContinueToNext}
            />
          </Box>
        )}
      </Container>
    </Box>
  )
}
