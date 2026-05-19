import { useMemo, useState, useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import { Progress, Text, Group, Stack } from '@mantine/core'
import { PageContainer, PageBody } from '@/components/page/primitives'
import { ExerciseFeedback } from '@/components/exercises/primitives'
import { feedbackPropsFor } from '@/components/exercises/feedbackMapping'
import { buildFeedbackInput } from './buildFeedbackInput'
import { resolveExerciseComponent } from '@/components/exercises/registry'
import { SessionAudioProvider } from '@/contexts/SessionAudioContext'
import { logError } from '@/lib/logger'
import { useAuthStore } from '@/stores/authStore'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { SessionPlan, SessionBlock } from '@/lib/session-builder'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import type { SessionAudioMap } from '@/services/audioService'
import { feedbackCopyFor } from './feedbackCopy'
import { RecapScreen } from './RecapScreen'
import { CapabilityExerciseFrame } from './CapabilityExerciseFrame'
import type { SessionAnswerEvent } from './types'

export interface ExperiencePlayerProps {
  plan: SessionPlan
  contexts: Map<string, CapabilityRenderContext>
  audioMap: SessionAudioMap
  userLanguage: 'nl' | 'en'
  onAnswer: (event: SessionAnswerEvent) => Promise<void>
  onComplete: () => void
}

interface FeedbackState {
  block: SessionBlock
  context: CapabilityRenderContext
  outcome: 'fuzzy' | 'wrong'
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
}

function SessionHeader({ position, queueLength, correctCount, totalUniqueCaps, progress, diagnostics }: SessionHeaderProps) {
  return (
    <Stack gap="xs" mb="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Oefening {position + 1} van {queueLength}</Text>
        <Text size="sm" c="dimmed">{correctCount}/{totalUniqueCaps} correct</Text>
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
  const { plan, contexts, audioMap, userLanguage, onAnswer, onComplete } = props
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
  }, [renderableBlocks])

  const queueLength = queue.length
  const currentBlock = queue[position]
  const isComplete = position >= queueLength
  const totalUniqueCaps = uniqueCapabilityIds.size
  const correctCount = correctCapabilityIds.size
  const progress = totalUniqueCaps === 0
    ? 100
    : Math.round(((correctCount + skippedCapabilityIds.size) / totalUniqueCaps) * 100)

  const { copy: feedbackCopy, continueLabel } = feedbackCopyFor(userLanguage)

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
          notifications.show({
            color: 'yellow',
            title: 'Antwoord niet opgeslagen',
            message: 'We proberen het later opnieuw.',
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
      setPosition(p => p + 1)
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
              onComplete={onComplete}
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
          <SessionHeader
            position={position}
            queueLength={queueLength}
            correctCount={correctCount}
            totalUniqueCaps={totalUniqueCaps}
            progress={progress}
            diagnostics={profile?.isAdmin ? plan.diagnostics : []}
          />
          {feedbackInput
            ? (
                <ExerciseFeedback
                  {...feedbackPropsFor(feedbackInput)}
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
