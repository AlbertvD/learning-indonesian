import { useMemo, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { notifications } from '@mantine/notifications'
import { Progress, Text, Group, Stack, VisuallyHidden } from '@mantine/core'
import { AdminFlagOverlay } from './AdminFlagOverlay'
import { PageContainer, PageBody } from '@/components/page/primitives'
import { ExerciseFeedback } from '@/components/exercises/primitives'
import { feedbackPropsFor } from '@/components/exercises/feedbackMapping'
import { buildFeedbackInput, attachFeedbackAudio } from './buildFeedbackInput'
import { resolveExerciseComponent } from '@/components/exercises/registry'
import { SessionAudioProvider } from '@/contexts/SessionAudioContext'
import { logError } from '@/lib/logger'
import { useAuthStore } from '@/stores/authStore'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { SessionPlan, SessionBlock } from '@/lib/session-builder'
import type { CapabilityRenderContext } from '@/lib/capabilities'
import type { SessionAudioMap } from '@/services/audioService'
import { translations, type Translations } from '@/lib/i18n'
import { feedbackCopyFor } from './feedbackCopy'
import { RecapScreen, type EmptySessionReason } from './RecapScreen'
import { CapabilityExerciseFrame } from './CapabilityExerciseFrame'
import type { SessionAnswerEvent } from './types'

export interface ExperiencePlayerProps {
  plan: SessionPlan
  contexts: Map<string, CapabilityRenderContext>
  audioMap: SessionAudioMap
  userLanguage: 'nl' | 'en'
  onAnswer: (event: SessionAnswerEvent) => Promise<void>
  // Fired ONCE when the card queue is exhausted (every renderable block answered
  // or skipped) — i.e. when the cards run out, not when the learner taps the
  // recap button. This is what records the session as completed (streak +
  // daily-activity count). Gating completion on the recap button made it
  // unreliable: a learner who left the recap any other way never counted.
  onComplete: () => void
  // Fired when the learner leaves the recap screen (the "Terug naar dashboard"
  // button). Navigation only — completion has already been recorded via onComplete.
  onExit: () => void
  // Why an empty plan came up empty — passed through to RecapScreen (MAJ-3).
  emptyReason?: EmptySessionReason
}

interface FeedbackState {
  block: SessionBlock
  context: CapabilityRenderContext
  outcome: 'correct' | 'fuzzy' | 'wrong'
  response: string | null
  commitFailed: boolean
}

interface SessionHeaderProps {
  position: number
  queueLength: number
  correctCount: number
  totalUniqueCaps: number
  progress: number
  diagnostics: SessionPlan['diagnostics']
  T: Translations
  /** Admin flag affordance. Lives in the header chrome row — not overlaid on
   *  the exercise — so long instructions can never collide with it and the
   *  learner's text column keeps its full measure (2026-07-02 type audit). */
  flagSlot?: ReactNode
}

function SessionHeader({ position, queueLength, correctCount, totalUniqueCaps, progress, diagnostics, T, flagSlot }: SessionHeaderProps) {
  return (
    <Stack gap="xs" mb="md">
      <Group justify="space-between">
        <Text fz="var(--ex-fs-chrome)" c="dimmed">{T.session.exerciseOf} {position + 1} {T.session.of} {queueLength}</Text>
        <Group gap={4}>
          <Text fz="var(--ex-fs-chrome)" c="dimmed">{correctCount}/{totalUniqueCaps} {T.session.correct}</Text>
          {flagSlot}
        </Group>
      </Group>
      <Progress value={progress} size="sm" />
      {diagnostics.length > 0 && (
        <details>
          {diagnostics.map((d, i) => (
            <p key={`${d.reason}-${i}`}>
              <strong>{d.reason}</strong>: {d.details}
            </p>
          ))}
        </details>
      )}
    </Stack>
  )
}

/**
 * Picks the re-insertion spacing for a wrong-answered block: a random integer
 * in [3, 6]. After `currentIndex + 1 + offset`, the re-shown block will sit
 * that many capabilities ahead of the next card the learner sees.
 */
function pickRedrillOffset(): number {
  return 3 + Math.floor(Math.random() * 4)
}

export function ExperiencePlayer(props: ExperiencePlayerProps) {
  const { plan, contexts, audioMap, userLanguage, onAnswer, onComplete, onExit, emptyReason } = props
  const { profile } = useAuthStore()

  const renderableBlocks = useMemo(() => {
    const out: SessionBlock[] = []
    for (const b of plan.blocks) {
      const ctx = contexts.get(b.id)
      if (!ctx?.exerciseItem) continue
      if (!resolveExerciseComponent(b.renderPlan.exerciseType)) continue
      out.push(b)
    }
    return out
  }, [plan.blocks, contexts])

  const registryMissCount = useMemo(
    () => plan.blocks.filter(b => {
      const ctx = contexts.get(b.id)
      if (!ctx?.exerciseItem) return false
      return !resolveExerciseComponent(b.renderPlan.exerciseType)
    }).length,
    [plan.blocks, contexts],
  )

  useEffect(() => {
    if (registryMissCount > 0) {
      logError({
        page: 'session',
        action: 'registryMissing',
        error: new Error(`Filtered ${registryMissCount} block(s) with missing exercise registry entry`),
      })
    }
  }, [registryMissCount])

  const uniqueCapabilityIds = useMemo(() => {
    const ids = new Set<string>()
    for (const b of renderableBlocks) ids.add(b.capabilityId)
    return ids
  }, [renderableBlocks])

  const [queue, setQueue] = useState<SessionBlock[]>(() => renderableBlocks)
  const [position, setPosition] = useState(0)
  const [answeredBlocks, setAnsweredBlocks] = useState<Set<string>>(() => new Set())
  const [skippedBlocks, setSkippedBlocks] = useState<Set<string>>(() => new Set())
  const [skippedCapabilityIds, setSkippedCapabilityIds] = useState<Set<string>>(() => new Set())
  const [correctCapabilityIds, setCorrectCapabilityIds] = useState<Set<string>>(() => new Set())
  const [commitFailedBlocks, setCommitFailedBlocks] = useState<Set<string>>(() => new Set())
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Guards the one-shot completion fire (see the exhaustion effect below).
  const completedRef = useRef(false)
  // CRIT-1 (docs/audits/2026-07-02-a11y-i18n-audit.md): correct answers
  // auto-advance with zero non-visual feedback -- wrong/fuzzy get a rich
  // aria-live="assertive" announcement via ExerciseFeedback, but a correct
  // answer never mounts that component. This visually-hidden aria-live="polite"
  // region fires "Correct"/i18n equivalent alongside the existing state
  // transition -- it does NOT add any delay to the auto-advance (the 1500ms
  // correct-answer pause already happened inside useExerciseScoring before
  // onAnswer/handleAnswerReport is even called). `id` forces a fresh child
  // node on every correct answer so screen readers re-announce even when two
  // consecutive correct answers produce the identical announcement text.
  const [correctAnnouncement, setCorrectAnnouncement] = useState<{ text: string; id: number } | null>(null)
  const announceIdRef = useRef(0)

  // Reset queue when renderableBlocks changes (new session plan).
  useEffect(() => {
    setQueue(renderableBlocks)
    setPosition(0)
    setAnsweredBlocks(new Set())
    setSkippedBlocks(new Set())
    setSkippedCapabilityIds(new Set())
    setCorrectCapabilityIds(new Set())
    setCommitFailedBlocks(new Set())
    setFeedback(null)
    completedRef.current = false
  }, [renderableBlocks])

  const queueLength = queue.length
  const currentBlock = queue[position]
  const isComplete = position >= queueLength

  // Record completion the moment the cards run out — NOT when the learner taps
  // the recap button. A session with at least one renderable card that the
  // learner has worked all the way through is "finished"; fire onComplete once.
  // (An empty session — zero renderable blocks — has nothing to record.)
  useEffect(() => {
    if (isComplete && queueLength > 0 && !completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }, [isComplete, queueLength, onComplete])
  const totalUniqueCaps = uniqueCapabilityIds.size
  const correctCount = correctCapabilityIds.size
  const progress = totalUniqueCaps === 0
    ? 100
    : Math.round(((correctCount + skippedCapabilityIds.size) / totalUniqueCaps) * 100)

  const { copy: feedbackCopy, continueLabel } = feedbackCopyFor(userLanguage)
  const T = translations[userLanguage]

  async function handleAnswerReport(report: AnswerReport) {
    if (!currentBlock || submitting) return
    const isDrillReshow = answeredBlocks.has(currentBlock.id)
    const wasCorrect = report.wasCorrect && !report.isFuzzy
    let commitFailed = false

    // Drill re-shows do not commit again: the original wrong answer already
    // posted a review event (the lapse). Subsequent in-session drills are
    // UI-only — committing again with a stale schedulerSnapshot would be
    // rejected as stale by the server.
    if (!isDrillReshow) {
      setSubmitting(true)
      try {
        await onAnswer({
          sessionId: plan.id,
          blockId: currentBlock.id,
          blockKind: currentBlock.kind,
          capabilityId: currentBlock.capabilityId,
          canonicalKeySnapshot: currentBlock.canonicalKeySnapshot,
          exerciseType: currentBlock.renderPlan.exerciseType,
          answerReport: report,
          pendingActivation: Boolean(currentBlock.pendingActivation),
        })
      } catch (err) {
        commitFailed = true
        logError({ page: 'session', action: 'commitAnswer', error: err })
        if (wasCorrect) {
          // Honest, not a phantom retry promise: no retry/outbox exists for a
          // failed commit anywhere in the app, so the learner needs to know
          // this specific review will not count — not that it'll be "handled
          // later" (2026-07-02 UX audit MAJ-4).
          notifications.show({
            color: 'yellow',
            title: T.session.commitFailedTitle,
            message: T.session.commitFailedMessage,
          })
        }
      }
      setSubmitting(false)
      setAnsweredBlocks(s => { const n = new Set(s); n.add(currentBlock.id); return n })
      if (commitFailed) {
        setCommitFailedBlocks(s => { const n = new Set(s); n.add(currentBlock.id); return n })
      }
    }

    if (wasCorrect) {
      setCorrectCapabilityIds(s => { const n = new Set(s); n.add(currentBlock.capabilityId); return n })
      // Dictation gets a real correct screen (2026-07-02 owner decision): the
      // meaning only surfaces post-answer there, and the auto-advance pause was
      // too brief to read it. The card's own assertive badge announces the
      // outcome, so the polite announcement below is skipped on this path.
      if (currentBlock.renderPlan.exerciseType === 'type_form_from_audio_ex') {
        setFeedback({
          block: currentBlock,
          context: contexts.get(currentBlock.id)!,
          outcome: 'correct',
          response: report.rawResponse,
          commitFailed,
        })
      } else {
        announceIdRef.current += 1
        setCorrectAnnouncement({ text: feedbackCopy.announceCorrect, id: announceIdRef.current })
        setPosition(p => p + 1)
      }
    } else {
      // Wrong / fuzzy: re-queue this block 3–6 capabilities later and show
      // the Doorgaan feedback card. No max cap — the block stays in the
      // queue until the learner gets it right (or skips it).
      const blockToRequeue = currentBlock
      const insertPos = position
      const offset = pickRedrillOffset()
      setQueue(q => {
        const insertAt = Math.min(insertPos + 1 + offset, q.length)
        return [...q.slice(0, insertAt), blockToRequeue, ...q.slice(insertAt)]
      })
      setFeedback({
        block: currentBlock,
        context: contexts.get(currentBlock.id)!,
        outcome: report.isFuzzy ? 'fuzzy' : 'wrong',
        response: report.rawResponse,
        commitFailed,
      })
    }
  }

  function handleSkip(blockId: string) {
    if (!currentBlock || currentBlock.id !== blockId) return
    setAnsweredBlocks(s => { const n = new Set(s); n.add(blockId); return n })
    setSkippedBlocks(s => { const n = new Set(s); n.add(blockId); return n })
    setSkippedCapabilityIds(s => { const n = new Set(s); n.add(currentBlock.capabilityId); return n })
    setPosition(p => p + 1)
  }

  function handleContinue() {
    setFeedback(null)
    setPosition(p => p + 1)
  }

  if (isComplete) {
    return (
      <SessionAudioProvider audioMap={audioMap}>
        <PageContainer size="md">
          <PageBody>
            <RecapScreen
              renderableBlocks={renderableBlocks}
              answeredBlocks={answeredBlocks}
              skippedBlocks={skippedBlocks}
              commitFailedBlocks={commitFailedBlocks}
              onExit={onExit}
              userLanguage={userLanguage}
              emptyReason={emptyReason}
            />
          </PageBody>
        </PageContainer>
      </SessionAudioProvider>
    )
  }

  const feedbackInput = feedback
    ? buildFeedbackInput({
        block: feedback.block,
        context: feedback.context,
        response: feedback.response,
        outcome: feedback.outcome,
        userLanguage,
        audioMap,
        commitFailed: feedback.commitFailed,
      })
    : null

  return (
    <SessionAudioProvider audioMap={audioMap}>
      <PageContainer size="md">
        <PageBody>
          <VisuallyHidden role="status" aria-live="polite">
            {correctAnnouncement && <span key={correctAnnouncement.id}>{correctAnnouncement.text}</span>}
          </VisuallyHidden>
          <SessionHeader
            position={position}
            queueLength={queueLength}
            correctCount={correctCount}
            totalUniqueCaps={totalUniqueCaps}
            progress={progress}
            diagnostics={profile?.isAdmin ? plan.diagnostics : []}
            T={T}
            flagSlot={
              <AdminFlagOverlay
                key={currentBlock.id}
                capabilityId={currentBlock.capabilityId}
                exerciseType={currentBlock.renderPlan.exerciseType}
              />
            }
          />
          {feedbackInput
            ? (
                <ExerciseFeedback
                  {...attachFeedbackAudio(feedbackPropsFor(feedbackInput), audioMap)}
                  copy={feedbackCopy}
                  continueLabel={continueLabel}
                  onContinue={handleContinue}
                />
              )
            : (
                <CapabilityExerciseFrame
                  key={`${currentBlock.id}-${position}`}
                  block={currentBlock}
                  context={contexts.get(currentBlock.id)!}
                  userLanguage={userLanguage}
                  onAnswerReport={handleAnswerReport}
                  onSkip={handleSkip}
                />
              )}
        </PageBody>
      </PageContainer>
    </SessionAudioProvider>
  )
}

export type { SessionAnswerEvent }
