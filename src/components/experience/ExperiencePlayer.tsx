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
import type { SessionPlan, SessionBlock } from '@/lib/session/sessionPlan'
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
  currentIndex: number
  total: number
  correctCount: number
  progress: number
  diagnostics: SessionPlan['diagnostics']
}

function SessionHeader({ currentIndex, total, correctCount, progress, diagnostics }: SessionHeaderProps) {
  return (
    <Stack gap="xs" mb="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Oefening {currentIndex + 1} van {total}</Text>
        <Text size="sm" c="dimmed">{correctCount}/{currentIndex} correct</Text>
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

  const effectiveTotal = renderableBlocks.length

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answeredBlocks, setAnsweredBlocks] = useState<Set<string>>(() => new Set())
  const [skippedBlocks, setSkippedBlocks] = useState<Set<string>>(() => new Set())
  const [commitFailedBlocks, setCommitFailedBlocks] = useState<Set<string>>(() => new Set())
  const [correctCount, setCorrectCount] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isComplete = currentIndex >= effectiveTotal
  const currentBlock = renderableBlocks[currentIndex]
  const progress = effectiveTotal === 0 ? 100 : Math.round((currentIndex / effectiveTotal) * 100)

  const { copy: feedbackCopy, continueLabel } = feedbackCopyFor(userLanguage)

  async function handleAnswerReport(report: AnswerReport) {
    if (!currentBlock || submitting) return
    setSubmitting(true)
    const wasCorrect = report.wasCorrect && !report.isFuzzy
    let commitFailed = false
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
    if (report.wasCorrect) setCorrectCount(n => n + 1)

    if (wasCorrect) {
      setCurrentIndex(i => i + 1)
    } else {
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
    setCurrentIndex(i => i + 1)
  }

  function handleContinue() {
    setFeedback(null)
    setCurrentIndex(i => i + 1)
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
            currentIndex={currentIndex}
            total={effectiveTotal}
            correctCount={correctCount}
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
                  key={currentBlock.id}
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
