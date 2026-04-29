import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Box, Button, Container, Progress, Stack, Text, Loader, Center, Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { translations } from '@/lib/i18n'
import { buildSessionQueue, type SessionBuildInput, type SessionMode } from '@/lib/sessionQueue'
import { applyPolicies, type SessionPoliciesContext } from '@/lib/sessionPolicies'
import type { ReviewResult, GrammarReviewResult } from '@/lib/reviewHandler'
import { learningItemService } from '@/services/learningItemService'
import { learnerStateService } from '@/services/learnerStateService'
import { grammarStateService } from '@/services/grammarStateService'
import { lessonService } from '@/services/lessonService'
import { fetchSessionAudioMap, type SessionAudioMap } from '@/services/audioService'
import { normalizeTtsText } from '@/lib/ttsNormalize'
import { SessionAudioProvider } from '@/contexts/SessionAudioContext'
import { useListening } from '@/contexts/ListeningContext'
import { goalService } from '@/services/goalService'
import { analyticsService } from '@/services/analyticsService'
import { sessionSummaryService, type SessionImpactMessages } from '@/services/sessionSummaryService'
import { exerciseAvailabilityService } from '@/services/exerciseAvailabilityService'
import { ExerciseShell } from '@/components/exercises/ExerciseShell'
import { ExperiencePlayer, type SessionAnswerEvent } from '@/components/experience/ExperiencePlayer'
import { SessionSummary } from '@/components/SessionSummary'
import { logError } from '@/lib/logger'
import { capabilityMigrationFlags } from '@/lib/featureFlags'
import { loadCapabilitySessionPlanForUser } from '@/lib/session/capabilitySessionLoader'
import { commitCapabilityAnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import { capabilityReviewService } from '@/services/capabilityReviewService'
import { capabilitySessionDataService } from '@/services/capabilitySessionDataService'
import type { CapabilitySessionMode, SessionPlan } from '@/lib/session/sessionPlan'
import type { SessionQueueItem, LearnerItemState, LearnerSkillState, LearnerGrammarState, GrammarPatternWithLesson, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant, WeeklyGoal } from '@/types/learning'
import { startSession, endSession } from '@/lib/session'
import { useSessionBeacon } from '@/lib/useSessionBeacon'
import classes from './Session.module.css'

const VALID_SESSION_MODES: SessionMode[] = ['standard', 'backlog_clear', 'quick', 'lesson_practice', 'lesson_review']

function parseSessionMode(value: string | null): SessionMode {
  return VALID_SESSION_MODES.includes(value as SessionMode) ? value as SessionMode : 'standard'
}

function isLessonScopedSessionMode(mode: SessionMode): boolean {
  return mode === 'lesson_practice' || mode === 'lesson_review'
}

function isCapabilitySessionMode(mode: SessionMode): mode is CapabilitySessionMode {
  return mode === 'standard' || isLessonScopedSessionMode(mode)
}

async function loadSelectedLessonScope(lessonId: string | null): Promise<{
  selectedLessonId?: string
  selectedSourceRefs?: string[]
}> {
  if (!lessonId) return {}
  const lesson = await lessonService.getLesson(lessonId)
  const sourceRef = `lesson-${lesson.order_index}`
  const pageBlocks = await lessonService.getLessonPageBlocks(sourceRef).catch(() => [])
  const selectedSourceRefs = pageBlocks.length > 0
    ? [...new Set(pageBlocks.flatMap(block => block.source_refs?.length ? block.source_refs : [block.source_ref]))]
    : [sourceRef]

  return {
    selectedLessonId: lessonId,
    selectedSourceRefs,
  }
}

export function Session() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, profile } = useAuthStore()
  const { listeningEnabled } = useListening()

  // State
  const [queue, setQueue] = useState<SessionQueueItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [results, setResults] = useState({ correct: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goalImpactMessages, setGoalImpactMessages] = useState<SessionImpactMessages | null>(null)
  const [audioMap, setAudioMap] = useState<SessionAudioMap>(new Map())
  const [capabilityPlan, setCapabilityPlan] = useState<SessionPlan | null>(null)

  const lessonFilter = searchParams.get('lesson')
  const sessionModeParam = searchParams.get('mode')
  const sessionMode = parseSessionMode(sessionModeParam)
  const preferredSessionSize = profile?.preferredSessionSize ?? 15
  const didInit = useRef(false)
  const beforeGoalsRef = useRef<WeeklyGoal[] | null>(null)

  // Mirror sessionId into a ref so the pagehide beacon (which can't depend on
  // re-renders) reads the current value.
  const sessionIdRef = useRef<string | null>(null)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  useSessionBeacon(sessionIdRef)

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
          throw new Error(`startSession failed: ${JSON.stringify(e)}`, { cause: e })
        }
        if (isLessonScopedSessionMode(sessionMode) && !capabilityMigrationFlags.standardSession) {
          setSessionId(sid)
          setError('Deze lessessie kan nog niet veilig worden gestart.')
          setLoading(false)
          return
        }

        if (capabilityMigrationFlags.standardSession && isCapabilitySessionMode(sessionMode)) {
          const lessonScope = isLessonScopedSessionMode(sessionMode)
            ? await loadSelectedLessonScope(lessonFilter)
            : {}
          const capabilityPlan = await loadCapabilitySessionPlanForUser({
            enabled: true,
            sessionId: sid,
            userId: user.id,
            mode: sessionMode,
            now: new Date(),
            limit: preferredSessionSize,
            preferredSessionSize,
            ...lessonScope,
            adapter: capabilitySessionDataService,
          })
          setSessionId(sid)
          setCapabilityPlan(capabilityPlan)
          setResults({ correct: 0, total: capabilityPlan.blocks.length })
          analyticsService.trackSessionStartedFromToday(user.id, sid)
          setLoading(false)
          return
        }

        setSessionId(sid)

        // Track session started event
        analyticsService.trackSessionStartedFromToday(user.id, sid)

        // Load all necessary data
        let items: Awaited<ReturnType<typeof learningItemService.getLearningItems>>
        try {
          items = await learningItemService.getLearningItems()
        } catch (e) {
          throw new Error(`getLearningItems failed: ${JSON.stringify(e)}`, { cause: e })
        }
        if (!items || items.length === 0) {
          setError('Er zijn nog geen leeritems beschikbaar. Neem contact op met de beheerder.')
          setLoading(false)
          return
        }

        let itemStatesArray: Awaited<ReturnType<typeof learnerStateService.getItemStates>>
        let skillStatesArray: Awaited<ReturnType<typeof learnerStateService.getSkillStatesBatch>>
        let lessons: { id: string; order_index: number }[]
        try {
          ;[itemStatesArray, skillStatesArray, lessons] = await Promise.all([
            learnerStateService.getItemStates(user.id),
            learnerStateService.getSkillStatesBatch(user.id),
            lessonService.getLessonsBasic(),
          ])
        } catch (e) {
          throw new Error(`getStates failed: ${JSON.stringify(e)}`, { cause: e })
        }

        // lessonId → order_index for lesson-gated new item introduction
        const lessonOrder: Record<string, number> = {}
        for (const l of lessons) {
          lessonOrder[l.id] = l.order_index
        }

        // Convert arrays to maps
        const itemStates: Record<string, LearnerItemState> = {}
        for (const state of itemStatesArray) {
          itemStates[state.learning_item_id] = state
        }

        // Build meanings, contexts, variants maps (chunked batch queries, 50 IDs at a time)
        const meaningsByItem: Record<string, ItemMeaning[]> = {}
        const contextsByItem: Record<string, ItemContext[]> = {}
        const variantsByItem: Record<string, ItemAnswerVariant[]> = {}
        const exerciseVariantsByContext: Record<string, ExerciseVariant[]> = {}

        const itemIds = items.map(i => i.id)
        const [allMeanings, allContexts, allVariants] = await Promise.all([
          learningItemService.getMeaningsBatch(itemIds),
          learningItemService.getContextsBatch(itemIds),
          learningItemService.getAnswerVariantsBatch(itemIds),
        ])

        // Group by item ID and collect all context IDs
        const allContextIds: string[] = []
        for (const meaning of allMeanings) {
          if (!meaningsByItem[meaning.learning_item_id]) meaningsByItem[meaning.learning_item_id] = []
          meaningsByItem[meaning.learning_item_id].push(meaning)
        }
        for (const context of allContexts) {
          if (!contextsByItem[context.learning_item_id]) contextsByItem[context.learning_item_id] = []
          contextsByItem[context.learning_item_id].push(context)
          allContextIds.push(context.id)
        }
        for (const variant of allVariants) {
          if (!variant.learning_item_id) continue
          if (!variantsByItem[variant.learning_item_id]) variantsByItem[variant.learning_item_id] = []
          variantsByItem[variant.learning_item_id].push(variant)
        }

        // Load published exercise variants for all contexts
        if (allContextIds.length > 0) {
          try {
            const publishedVariants = await learningItemService.getExerciseVariantsByContext(allContextIds)
            for (const variant of publishedVariants) {
              if (!variant.context_id) continue
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

        // Load grammar data (patterns, states, variants)
        let grammarPatterns: GrammarPatternWithLesson[] = []
        const grammarStatesMap: Record<string, LearnerGrammarState> = {}
        const grammarVariantsByPattern: Record<string, ExerciseVariant[]> = {}
        try {
          grammarPatterns = await grammarStateService.getAllGrammarPatterns()
          const patternIds = grammarPatterns.map(p => p.id)

          // Seed grammar states idempotently (new patterns picked up automatically)
          await grammarStateService.seedGrammarStates(user.id, patternIds)

          const [grammarStatesArray, grammarVariants] = await Promise.all([
            grammarStateService.getGrammarStates(user.id),
            grammarStateService.getGrammarVariants(patternIds),
          ])

          for (const state of grammarStatesArray) {
            grammarStatesMap[state.grammar_pattern_id] = state
          }
          for (const variant of grammarVariants) {
            if (!variant.grammar_pattern_id) continue
            if (!grammarVariantsByPattern[variant.grammar_pattern_id]) {
              grammarVariantsByPattern[variant.grammar_pattern_id] = []
            }
            grammarVariantsByPattern[variant.grammar_pattern_id].push(variant)
          }
        } catch (err) {
          // Non-fatal: if grammar data fails, session continues with vocab only
          console.warn('Failed to load grammar data:', err)
        }

        // Pre-fetch audio for all word/phrase base_texts so listening_mcq can be
        // considered during queue-build. Voice-agnostic: each text resolves to
        // the clip from the earliest lesson that has audio for it.
        let preQueueAudioMap: SessionAudioMap = new Map()
        try {
          const wordPhraseTexts = new Set<string>()
          for (const item of items) {
            if (item.item_type === 'word' || item.item_type === 'phrase') {
              wordPhraseTexts.add(normalizeTtsText(item.base_text))
            }
          }
          if (wordPhraseTexts.size > 0) {
            preQueueAudioMap = await fetchSessionAudioMap([...wordPhraseTexts])
          }
        } catch {
          // Non-fatal: without pre-queue audio, listening_mcq simply won't surface
          // this session. Everything else continues.
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
          lessonFilter,
          userLanguage: profile?.language ?? 'nl',
          lessonOrder,
          sessionMode,
          grammarPatterns,
          grammarStates: grammarStatesMap,
          grammarVariantsByPattern,
          audioMap: preQueueAudioMap,
          listeningEnabled,
        }

        const builtQueue = buildSessionQueue(input)
        if (builtQueue.length === 0) {
          setError('Er zijn geen oefeningen beschikbaar voor deze sessie.')
          setLoading(false)
          return
        }

        // Load exercise type availability (cached, 1hr TTL)
        let exerciseTypeAvailability: Record<string, import('@/types/learning').ExerciseTypeAvailability> | undefined
        try {
          exerciseTypeAvailability = await exerciseAvailabilityService.getAllAvailability()
        } catch (err) {
          // Non-fatal: if availability can't be loaded, all types pass through
          console.warn('Failed to load exercise availability:', err)
        }

        // Load grammar patterns for confusion-group interleaving (session policies)
        let itemGrammarPatterns: Record<string, { confusion_group?: string }> | undefined
        try {
          itemGrammarPatterns = await learningItemService.getGrammarPatternsByItem(items.map(i => i.id))
        } catch (err) {
          console.warn('Failed to load grammar patterns:', err)
        }

        // Apply session policies to shape the queue
        const policyContext: SessionPoliciesContext = {
          sessionInteractionCap: preferredSessionSize,
          exerciseTypeAvailability,
          grammarPatterns: itemGrammarPatterns,
        }

        const shapedQueue = applyPolicies(builtQueue, policyContext)
        if (shapedQueue.length === 0) {
          setError('Er zijn geen oefeningen beschikbaar na het toepassen van de sessieregels.')
          setLoading(false)
          return
        }

        setQueue(shapedQueue)
        setResults({ correct: 0, total: shapedQueue.length })
        setLoading(false)

        // Fetch audio for the final session queue (non-blocking — audio degrades
        // gracefully if absent).
        try {
          const textsSet = new Set<string>()
          for (const qItem of shapedQueue) {
            const item = qItem.exerciseItem
            if (item.learningItem?.base_text) textsSet.add(normalizeTtsText(item.learningItem.base_text))
            if (item.contrastPairData) {
              item.contrastPairData.options.forEach(o => textsSet.add(normalizeTtsText(o)))
            }
            if (item.clozeMcqData) {
              const filled = item.clozeMcqData.sentence.replace('___', item.clozeMcqData.correctOptionId)
              textsSet.add(normalizeTtsText(filled))
            }
            if (item.sentenceTransformationData) {
              textsSet.add(normalizeTtsText(item.sentenceTransformationData.sourceSentence))
            }
            if (item.constrainedTranslationData) {
              item.constrainedTranslationData.acceptableAnswers.forEach(a => textsSet.add(normalizeTtsText(a)))
            }
            if (item.cuedRecallData) {
              textsSet.add(normalizeTtsText(item.cuedRecallData.correctOptionId))
            }
          }
          if (textsSet.size > 0) {
            const map = await fetchSessionAudioMap([...textsSet])
            setAudioMap(map)
          }
        } catch {
          // Non-fatal: audio is purely additive, session continues without it
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : JSON.stringify(err)
        console.error('Session init error:', err)
        logError({ page: 'session', action: 'initialize', error: err })
        setError(`Sessie laden mislukt: ${errMsg}`)
        setLoading(false)
      }
    }

    initSession()
  }, [user, navigate, profile?.language, profile?.preferredSessionSize, preferredSessionSize, lessonFilter, sessionMode])

  // How many positions ahead to reinsert a wrong-answer item.
  // 3 means the user sees 2 other items before the retry appears.
  const REQUEUE_OFFSET = 3

  // Handle answer from ExerciseShell (accepts both vocab and grammar review results)
  const handleExerciseAnswer = (_result: ReviewResult | GrammarReviewResult, wasCorrect: boolean) => {
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

  // Handle exercise skip (registry-path ErrorBoundary). Increments session
  // length without re-queuing (re-showing a broken exercise will crash again).
  // Does NOT call processReview — FSRS state untouched.
  const handleExerciseSkipped = () => {
    setResults(r => ({ ...r, total: r.total + 1 }))
  }

  // Fetch goal state before session ends (captured just before the last exercise)
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

  const sessionEndedRef = useRef(false)

  // End session and compute goal impact automatically when all exercises are done.
  // The summary screen stays visible until the user explicitly navigates away.
  useEffect(() => {
    if (!user || !sessionId || currentIndex < queue.length || queue.length === 0) return
    if (sessionEndedRef.current) return
    sessionEndedRef.current = true

    const finishSession = async () => {
      try {
        await endSession(sessionId)

        try {
          const progress = await goalService.getGoalProgress(user.id)
          const afterGoals = progress.state === 'timezone_required' ? null : progress.weeklyGoals
          const messages = await sessionSummaryService.computeSessionImpactMessages(
            user.id,
            sessionId,
            beforeGoalsRef.current,
            afterGoals,
            (profile?.language ?? 'nl') as 'en' | 'nl'
          )
          setGoalImpactMessages(messages)
        } catch (err) {
          console.error('[Session] Failed to compute goal impact:', err)
        }
      } catch (err) {
        logError({ page: 'session', action: 'complete', error: err })
        const t = translations[profile?.language ?? 'nl']
        notifications.show({ color: 'red', title: t.common.error, message: t.common.somethingWentWrong })
      }
    }

    finishSession()
  }, [user, sessionId, currentIndex, queue.length, profile?.language])

  const handleNavigateHome = () => navigate('/')

  const handleCapabilityPlanComplete = async () => {
    if (sessionId) {
      try {
        await endSession(sessionId)
      } catch (err) {
        logError({ page: 'session', action: 'complete-capability-plan', error: err })
      }
    }
    handleNavigateHome()
  }

  const handleCapabilityAnswer = async (event: SessionAnswerEvent) => {
    if (!user || !capabilityPlan) return
    const block = capabilityPlan.blocks.find(candidate => candidate.id === event.blockId)
    if (!block) {
      throw new Error(`Capability session block not found: ${event.blockId}`)
    }

    const result = await commitCapabilityAnswerReport({
      userId: user.id,
      sessionId: event.sessionId,
      sessionItemId: event.blockId,
      attemptNumber: 1,
      idempotencyKey: `${user.id}:${event.sessionId}:${event.blockId}:1`,
      capabilityId: event.capabilityId,
      canonicalKeySnapshot: event.canonicalKeySnapshot,
      answerReport: event.answerReport,
      schedulerSnapshot: block.reviewContext.schedulerSnapshot,
      currentStateVersion: block.reviewContext.currentStateVersion,
      artifactVersionSnapshot: block.reviewContext.artifactVersionSnapshot,
      activationRequest: block.pendingActivation?.activationRequest,
      submittedAt: new Date().toISOString(),
      capabilityReadinessStatus: block.reviewContext.capabilityReadinessStatus,
      capabilityPublicationStatus: block.reviewContext.capabilityPublicationStatus,
    }, { service: capabilityReviewService })

    if (
      result.idempotencyStatus !== 'committed'
      && result.idempotencyStatus !== 'duplicate_returned'
    ) {
      throw new Error(`Capability review commit rejected: ${result.idempotencyStatus}`)
    }

    setResults(r => ({
      total: r.total,
      correct: r.correct + (event.answerReport.wasCorrect ? 1 : 0),
    }))
  }

  // Render states
  if (loading) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader />
          <Text c="dimmed">Sessie laden...</Text>
        </Stack>
      </Center>
    )
  }

  if (error) {
    return (
      <Container size="sm" py="xl">
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Sessiefout">
          {error}
        </Alert>
      </Container>
    )
  }

  if (capabilityPlan) {
    if (capabilityMigrationFlags.experiencePlayerV1) {
      return (
        <ExperiencePlayer
          plan={capabilityPlan}
          onAnswer={handleCapabilityAnswer}
          onComplete={handleCapabilityPlanComplete}
        />
      )
    }

    return (
      <Container size="sm" py="xl">
        <Stack gap="md">
          <Alert color={capabilityPlan.blocks.length > 0 ? 'blue' : 'yellow'} title="Vaardigheidssessieplan">
            {capabilityPlan.blocks.length > 0
              ? `${capabilityPlan.blocks.length} vaardigheidsoefening(en) geladen via scheduler, pedagogische planner, resolver en composer.`
              : `Er zijn geen renderbare vaardigheidsoefeningen gemaakt (${capabilityPlan.diagnostics.length} diagnoses).`}
          </Alert>
          {capabilityPlan.blocks.map(block => (
            <Box
              key={block.id}
              p="md"
              style={{
                border: '1px solid var(--mantine-color-gray-3)',
                borderRadius: 12,
                background: 'var(--mantine-color-white)',
              }}
            >
              <Text fw={700}>{block.kind === 'due_review' ? 'Nu te herhalen' : 'Nieuwe introductie'}</Text>
              <Text size="sm" c="dimmed">{block.renderPlan.exerciseType} · {block.renderPlan.capabilityType}</Text>
              <Text size="xs" c="dimmed">{block.canonicalKeySnapshot}</Text>
            </Box>
          ))}
          {capabilityPlan.diagnostics.map((diagnostic, index) => (
            <Alert key={`${diagnostic.reason}-${index}`} color="yellow" title={diagnostic.reason}>
              {diagnostic.details}
            </Alert>
          ))}
          <Text size="sm" c="dimmed">
            De rijke antwoord- en reviewervaring hoort bij de Experience Player-slice; dit scherm controleert het echte vaardigheidscompositiepad zonder terug te vallen op legacy planning.
          </Text>
          <Button onClick={handleCapabilityPlanComplete}>Sessie afronden</Button>
        </Stack>
      </Container>
    )
  }

  if (queue.length === 0) {
    return (
      <Container size="sm" py="xl">
        <Alert color="yellow" title="Geen oefeningen">
          Er zijn geen oefeningen beschikbaar voor deze sessie. Probeer een andere les of oefenset.
        </Alert>
      </Container>
    )
  }

  // Session is complete — stay on summary until user navigates away
  if (currentIndex >= queue.length) {
    return <SessionSummary results={results} goalImpactMessages={goalImpactMessages ?? undefined} userLanguage={(profile?.language ?? 'nl') as 'en' | 'nl'} onComplete={handleNavigateHome} />
  }

  // Show exercise
  const currentItem = queue[currentIndex]
  const progress = (currentIndex / queue.length) * 100
  const userLang = (profile?.language ?? 'nl') as 'en' | 'nl'
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
            <SessionAudioProvider audioMap={audioMap}>
              <ExerciseShell
                key={currentIndex}
                currentItem={currentItem}
                sessionId={sessionId}
                user={user}
                userLanguage={userLang}
                onAnswer={handleExerciseAnswer}
                onContinueToNext={handleContinueToNext}
                onSkip={handleExerciseSkipped}
              />
            </SessionAudioProvider>
          </Box>
        )}
      </Container>
    </Box>
  )
}
