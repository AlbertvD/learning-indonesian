import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '@mantine/core'
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  LoadingState,
} from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import {
  buildSession,
  collectAudibleTexts,
  sessionBuilderAdapter,
  type SessionMode,
  type SessionPlan,
} from '@/lib/session-builder'
import { translations } from '@/lib/i18n'
import { getLessonSourceRefsByLessonId } from '@/lib/lessons'
import { fetchSessionAudioMap, type SessionAudioMap } from '@/services/audioService'
import { ExperiencePlayer, type SessionAnswerEvent } from '@/components/experience/ExperiencePlayer'
import { resolveCapabilityBlocks, type CapabilityRenderContext } from '@/lib/exercise-content'
import { logError } from '@/lib/logger'
import { commitCapabilityAnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import { capabilityReviewService } from '@/services/capabilityReviewService'

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
  // Lesson scope = the lesson's ready+published capability source_refs, keyed by
  // learning_capabilities.lesson_id (ADR 0006). Replaces the retired
  // lesson_page_blocks fan-out; the session-builder match is unchanged.
  const selectedSourceRefs = await getLessonSourceRefsByLessonId(lessonId).catch(() => [])
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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capabilityPlan, setCapabilityPlan] = useState<SessionPlan | null>(null)
  const [capabilityContexts, setCapabilityContexts] = useState<Map<string, CapabilityRenderContext> | null>(null)
  const [capabilityAudioMap, setCapabilityAudioMap] = useState<SessionAudioMap | null>(null)
  const [dryingDismissed, setDryingDismissed] = useState(false)

  const lessonFilter = searchParams.get('lesson')
  const sessionModeParam = searchParams.get('mode')
  const sessionMode = parseSessionMode(sessionModeParam)
  const preferredSessionSize = profile?.preferredSessionSize ?? 15
  // ?force_capability=<canonical_key> — admin-only dev bypass for the per-PR E2E
  // gate (plan §3.8). Routes through the real renderer + real review-event commit
  // path; the only thing skipped is the planner. Gated on profile.isAdmin so a
  // non-admin who guesses the URL gets the normal session.
  const forceCapabilityKey = searchParams.get('force_capability')
  const allowForceCapability =
    forceCapabilityKey != null
    && profile?.isAdmin === true
    && (import.meta.env.DEV === true || import.meta.env.VITE_ALLOW_FORCE_CAPABILITY === 'true')
  const didInit = useRef(false)

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

        // Mint a client-side sessionId. Retirement #5 (2026-05-07): the
        // commit_capability_answer_report RPC materialises the
        // learning_sessions row lazily on the first answer; no DB write at
        // session start. See docs/plans/2026-05-07-retire-session-lifecycle.md.
        const sid = crypto.randomUUID()
        const lessonScope = isLessonScopedSessionMode(sessionMode)
          ? await loadSelectedLessonScope(lessonFilter)
          : null
        if (isLessonScopedSessionMode(sessionMode) && !lessonScope) {
          setError('Deze les is nog niet klaar om te oefenen.')
          setLoading(false)
          return
        }
        const capabilityPlan = await buildSession({
          enabled: true,
          sessionId: sid,
          userId: user.id,
          mode: sessionMode,
          now: new Date(),
          limit: preferredSessionSize,
          preferredSessionSize,
          ...(lessonScope ?? {}),
          ...(allowForceCapability && forceCapabilityKey ? { forceCapabilityKey } : {}),
          adapter: sessionBuilderAdapter,
        })
        setCapabilityPlan(capabilityPlan)

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
            ? await fetchSessionAudioMap(audioTexts.map((text) => ({ text, voiceId: null })))
            : new Map() as SessionAudioMap
          setCapabilityAudioMap(audioMap)
        } catch (err) {
          logError({ page: 'session', action: 'resolveCapabilityBlocks', error: err })
          setCapabilityContexts(new Map())
          setCapabilityAudioMap(new Map() as SessionAudioMap)
        }

        setLoading(false)
      } catch (err) {
        logError({ page: 'session', action: 'initialize', error: err })
        const lang = (profile?.language ?? 'nl') as 'en' | 'nl'
        setError(translations[lang].session.failedToLoadSession)
        setLoading(false)
      }
    }

    initSession()
  }, [user, navigate, profile?.language, profile?.preferredSessionSize, preferredSessionSize, lessonFilter, sessionMode, forceCapabilityKey, allowForceCapability])

  const handleNavigateHome = () => navigate('/')

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
    const dryingDiagnostic = capabilityPlan.diagnostics.find(
      d => d.reason === 'learning_pipeline_drying_up'
    )
    const userLanguage = (profile?.language ?? 'nl') as 'en' | 'nl'
    return (
      <>
        {dryingDiagnostic && !dryingDismissed && (
          <PageContainer size="md">
            <PageBody>
              <Alert
                color="blue"
                icon={<IconInfoCircle size={16} />}
                withCloseButton
                closeButtonLabel={userLanguage === 'nl' ? 'Sluiten' : 'Close'}
                onClose={() => setDryingDismissed(true)}
                data-testid="drying-alert"
              >
                {translations[userLanguage].session.pipelineDryingUp}
              </Alert>
            </PageBody>
          </PageContainer>
        )}
        <ExperiencePlayer
          plan={capabilityPlan}
          contexts={capabilityContexts}
          audioMap={capabilityAudioMap}
          userLanguage={userLanguage}
          onAnswer={handleCapabilityAnswer}
          onComplete={handleNavigateHome}
        />
      </>
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
