import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  LoadingState,
} from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { type SessionMode } from '@/lib/sessionQueue'
import { lessonService } from '@/services/lessonService'
import { fetchSessionAudioMap, type SessionAudioMap } from '@/services/audioService'
import { analyticsService } from '@/services/analyticsService'
import { ExperiencePlayer, type SessionAnswerEvent } from '@/components/experience/ExperiencePlayer'
import { resolveCapabilityBlocks, type CapabilityRenderContext } from '@/services/capabilityContentService'
import { collectAudibleTexts } from '@/lib/session/collectAudibleTexts'
import { logError } from '@/lib/logger'
import { loadCapabilitySessionPlanForUser } from '@/lib/session/capabilitySessionLoader'
import { commitCapabilityAnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import { capabilityReviewService } from '@/services/capabilityReviewService'
import { capabilitySessionDataService } from '@/services/capabilitySessionDataService'
import type { SessionPlan } from '@/lib/session/sessionPlan'
import { startSession, endSession } from '@/lib/session'
import { useSessionBeacon } from '@/lib/useSessionBeacon'

const VALID_SESSION_MODES: SessionMode[] = ['standard', 'lesson_practice', 'lesson_review']

function parseSessionMode(value: string | null): SessionMode {
  return VALID_SESSION_MODES.includes(value as SessionMode) ? value as SessionMode : 'standard'
}

function isLessonScopedSessionMode(mode: SessionMode): boolean {
  return mode === 'lesson_practice' || mode === 'lesson_review'
}

async function loadSelectedLessonScope(lessonId: string | null): Promise<{
  selectedLessonId: string
  selectedSourceRefs: string[]
} | null> {
  if (!lessonId) return null
  const lesson = await lessonService.getLesson(lessonId)
  const sourceRef = `lesson-${lesson.order_index}`
  const pageBlocks = await lessonService.getLessonPageBlocks(sourceRef).catch(() => [])
  if (pageBlocks.length === 0) return null
  const selectedSourceRefs = [...new Set(pageBlocks.flatMap(block => block.source_refs?.length ? block.source_refs : [block.source_ref]))]
  if (selectedSourceRefs.length === 0) return null

  return {
    selectedLessonId: lessonId,
    selectedSourceRefs,
  }
}

export function Session() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, profile } = useAuthStore()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capabilityPlan, setCapabilityPlan] = useState<SessionPlan | null>(null)
  const [capabilityContexts, setCapabilityContexts] = useState<Map<string, CapabilityRenderContext> | null>(null)
  const [capabilityAudioMap, setCapabilityAudioMap] = useState<SessionAudioMap | null>(null)

  const lessonFilter = searchParams.get('lesson')
  const sessionModeParam = searchParams.get('mode')
  const sessionMode = parseSessionMode(sessionModeParam)
  const preferredSessionSize = profile?.preferredSessionSize ?? 15
  const didInit = useRef(false)

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
        const lessonScope = isLessonScopedSessionMode(sessionMode)
          ? await loadSelectedLessonScope(lessonFilter)
          : null
        if (isLessonScopedSessionMode(sessionMode) && !lessonScope) {
          setSessionId(sid)
          setError('Deze les is nog niet klaar om te oefenen.')
          setLoading(false)
          return
        }
        const capabilityPlan = await loadCapabilitySessionPlanForUser({
          enabled: true,
          sessionId: sid,
          userId: user.id,
          mode: sessionMode,
          now: new Date(),
          limit: preferredSessionSize,
          preferredSessionSize,
          ...(lessonScope ?? {}),
          adapter: capabilitySessionDataService,
        })
        setSessionId(sid)
        setCapabilityPlan(capabilityPlan)
        analyticsService.trackSessionStartedFromToday(user.id, sid)

        // Resolve render contexts + fetch audio map. ExperiencePlayer is
        // presentational and depends on both being present before mount.
        // Failures degrade gracefully — silent-skipped blocks don't block the
        // user, and missing audio just hides the play button.
        try {
          const contexts = await resolveCapabilityBlocks(capabilityPlan.blocks, {
            userId: user.id,
            userLanguage: (profile?.language ?? 'nl') as 'en' | 'nl',
            sessionId: sid,
          })
          setCapabilityContexts(contexts)

          const audioTexts = collectAudibleTexts(contexts.values())
          const audioMap = audioTexts.length > 0
            ? await fetchSessionAudioMap(audioTexts)
            : new Map() as SessionAudioMap
          setCapabilityAudioMap(audioMap)
        } catch (err) {
          logError({ page: 'session', action: 'resolveCapabilityBlocks', error: err })
          setCapabilityContexts(new Map())
          setCapabilityAudioMap(new Map() as SessionAudioMap)
        }

        setLoading(false)
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
  }

  // Render states
  if (loading) {
    return (
      <PageContainer size="md">
        <PageBody>
          <LoadingState caption="Sessie laden..." />
        </PageBody>
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer size="sm">
        <PageBody>
          <Alert icon={<IconAlertCircle size={16} />} color="red" title="Sessiefout">
            {error}
          </Alert>
        </PageBody>
      </PageContainer>
    )
  }

  if (capabilityPlan) {
    // ExperiencePlayer is presentational — the host owns the fetches.
    // While contexts/audio resolve, render the loading alert.
    if (!capabilityContexts || !capabilityAudioMap) {
      return (
        <PageContainer size="sm">
          <PageBody>
            <Alert color="blue" title="Sessie laden">Inhoud wordt voorbereid…</Alert>
          </PageBody>
        </PageContainer>
      )
    }
    return (
      <ExperiencePlayer
        plan={capabilityPlan}
        contexts={capabilityContexts}
        audioMap={capabilityAudioMap}
        userLanguage={(profile?.language ?? 'nl') as 'en' | 'nl'}
        onAnswer={handleCapabilityAnswer}
        onComplete={handleCapabilityPlanComplete}
      />
    )
  }

  return (
    <PageContainer size="sm">
      <PageBody>
        <Alert color="yellow" title="Geen oefeningen">
          Er zijn geen oefeningen beschikbaar voor deze sessie. Probeer een andere les of oefenset.
        </Alert>
      </PageBody>
    </PageContainer>
  )
}
