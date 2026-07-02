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
import { useListening } from '@/contexts/ListeningContext'
import {
  buildSession,
  collectAudibleTexts,
  sessionBuilderAdapter,
  isLessonScopedMode,
  isSourceRefScopedMode,
  type SessionMode,
  type SessionPlan,
} from '@/lib/session-builder'
import { translations } from '@/lib/i18n'
import { getLessonSourceRefsByLessonId } from '@/lib/lessons'
import { loadSelectedAffixScope } from '@/lib/morphology'
import { fetchSessionAudioMap, type SessionAudioMap } from '@/services/audioService'
import { ExperiencePlayer, type SessionAnswerEvent } from '@/components/experience/ExperiencePlayer'
import { resolveCapabilityBlocks, type CapabilityRenderContext } from '@/lib/exercise-content'
import { logError } from '@/lib/logger'
import { commitCapabilityAnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import { capabilityReviewService } from '@/services/capabilityReviewService'
import { markSessionComplete } from '@/services/sessionService'

const VALID_SESSION_MODES: SessionMode[] = ['standard', 'lesson_practice', 'lesson_review', 'affix_practice']

function parseSessionMode(value: string | null): SessionMode {
  return VALID_SESSION_MODES.includes(value as SessionMode) ? value as SessionMode : 'standard'
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
  const { listeningEnabled } = useListening()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capabilityPlan, setCapabilityPlan] = useState<SessionPlan | null>(null)
  const [capabilityContexts, setCapabilityContexts] = useState<Map<string, CapabilityRenderContext> | null>(null)
  const [capabilityAudioMap, setCapabilityAudioMap] = useState<SessionAudioMap | null>(null)
  const [dryingDismissed, setDryingDismissed] = useState(false)

  const lessonFilter = searchParams.get('lesson')
  const affixFilter = searchParams.get('affix')
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
  // The client-minted sessionId, kept so onComplete can mark the session finished.
  const sessionIdRef = useRef<string | null>(null)

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
        sessionIdRef.current = sid
        // Resolve the session scope. Lesson modes need a lesson id + its
        // source_refs; the affix mode (capstone item F′) resolves the affix
        // label in the URL to source_refs ONLY (an affix spans many lessons).
        // Both mirror loadSelectedLessonScope; an unresolved scope is a friendly
        // error, not a broken session.
        let scope: { selectedLessonId?: string; selectedSourceRefs: string[] } | null = null
        if (isLessonScopedMode(sessionMode)) {
          scope = await loadSelectedLessonScope(lessonFilter)
          if (!scope) {
            setError('Deze les is nog niet klaar om te oefenen.')
            setLoading(false)
            return
          }
        } else if (isSourceRefScopedMode(sessionMode)) {
          scope = await loadSelectedAffixScope(affixFilter)
          if (!scope) {
            setError('Dit voorvoegsel heeft nog geen oefeningen.')
            setLoading(false)
            return
          }
        }
        const capabilityPlan = await buildSession({
          enabled: true,
          sessionId: sid,
          userId: user.id,
          mode: sessionMode,
          now: new Date(),
          limit: preferredSessionSize,
          preferredSessionSize,
          listeningEnabled,
          ...(scope ?? {}),
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
  }, [user, navigate, profile?.language, profile?.preferredSessionSize, preferredSessionSize, lessonFilter, affixFilter, sessionMode, forceCapabilityKey, allowForceCapability, listeningEnabled])

  // Session finished (queue exhausted) — fired by ExperiencePlayer the moment the
  // cards run out, NOT on the recap button. Marks the session complete so it
  // counts toward the streak + daily-activity. Best-effort: a failure must not
  // trap the learner (it does not navigate; the recap stays visible).
  const handleSessionComplete = async () => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      await markSessionComplete(sid)
    } catch (err) {
      logError({ page: 'session', action: 'markSessionComplete', error: err })
    }
  }

  // Recap "Terug naar dashboard" button — navigation only; completion already
  // recorded by handleSessionComplete when the cards ran out.
  const handleExit = () => navigate('/')

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
          onComplete={handleSessionComplete}
          onExit={handleExit}
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
