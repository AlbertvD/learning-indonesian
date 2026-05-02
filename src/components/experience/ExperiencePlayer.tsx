import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { PageContainer, PageBody } from '@/components/page/primitives'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { SessionPlan, SessionBlock } from '@/lib/session/sessionPlan'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import type { SessionAudioMap } from '@/services/audioService'
import { SessionAudioProvider } from '@/contexts/SessionAudioContext'
import type { SessionAnswerEvent } from './types'
import { WarmInputBlock } from './blocks/WarmInputBlock'
import { DueReviewBlock } from './blocks/DueReviewBlock'
import { NewIntroductionBlock } from './blocks/NewIntroductionBlock'
import { RecapBlock } from './blocks/RecapBlock'
import classes from './ExperiencePlayer.module.css'

export interface ExperiencePlayerProps {
  plan: SessionPlan
  /** Resolved render contexts keyed by block.id. One entry per plan.blocks.
   *  Blocks with exerciseItem === null are silently skipped — see spec §9.1. */
  contexts: Map<string, CapabilityRenderContext>
  /** Pre-fetched audio lookup. Wraps children in SessionAudioProvider. */
  audioMap: SessionAudioMap
  /** From (profile?.language ?? 'nl') in the host. */
  userLanguage: 'nl' | 'en'
  onAnswer: (event: SessionAnswerEvent) => Promise<void>
  onComplete: () => void
}

export function ExperiencePlayer(props: ExperiencePlayerProps) {
  const { plan, contexts, audioMap, userLanguage, onAnswer, onComplete } = props
  const [answeredBlocks, setAnsweredBlocks] = useState<Set<string>>(() => new Set())
  const [submittingBlockId, setSubmittingBlockId] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)

  // Resolved-block subset and per-kind effective counts. Skipped blocks (those
  // with exerciseItem === null in the resolved context) are excluded from the
  // denominators so the user can complete the session.
  const renderableBlocks = useMemo(
    () => plan.blocks.filter(b => contexts.get(b.id)?.exerciseItem != null),
    [plan.blocks, contexts],
  )
  const effectiveTotal = renderableBlocks.length
  const effectiveDueCount = renderableBlocks.filter(b => b.kind === 'due_review').length
  const effectiveNewCount = renderableBlocks.filter(b => b.kind === 'new_introduction').length
  const progress = effectiveTotal > 0 ? Math.round((answeredBlocks.size / effectiveTotal) * 100) : 100
  const progressStyle = {
    height: `${progress}%`,
    '--mobile-progress': `${progress}%`,
  } as CSSProperties

  const blockPositions = useMemo(() => {
    let due = 0
    let intro = 0
    return new Map(renderableBlocks.map(block => {
      const position = block.kind === 'due_review' ? ++due : ++intro
      return [block.id, position]
    }))
  }, [renderableBlocks])

  const handleAnswerReport = async (block: SessionBlock, answerReport: AnswerReport) => {
    if (answeredBlocks.has(block.id) || submittingBlockId) return
    setSubmittingBlockId(block.id)
    setSubmissionError(null)
    try {
      await onAnswer({
        sessionId: plan.id,
        blockId: block.id,
        blockKind: block.kind,
        capabilityId: block.capabilityId,
        canonicalKeySnapshot: block.canonicalKeySnapshot,
        exerciseType: block.renderPlan.exerciseType,
        pendingActivation: Boolean(block.pendingActivation),
        answerReport,
      })
      setAnsweredBlocks(current => new Set(current).add(block.id))
    } catch {
      setSubmissionError('Je antwoord kon niet worden opgeslagen. Controleer je verbinding en probeer deze kaart opnieuw.')
    } finally {
      setSubmittingBlockId(null)
    }
  }

  // Skip is internal — advances the queue without writing FSRS state, matching
  // legacy Session.tsx:448-450. The host is unaware skip exists.
  const handleSkip = (blockId: string) => {
    setAnsweredBlocks(current => new Set(current).add(blockId))
  }

  const changedCapabilities = renderableBlocks
    .filter(block => answeredBlocks.has(block.id))
    .map(block => ({
      id: block.id,
      kind: block.kind,
      exerciseType: block.renderPlan.exerciseType,
    }))

  return (
    <SessionAudioProvider audioMap={audioMap}>
      <PageContainer size="lg">
        <PageBody>
          <div className={classes.shell} aria-labelledby="experience-warm-title">
            <aside className={classes.rail} aria-label="Sessievoortgang">
              <span>{progress}%</span>
              <div className={classes.progressTrack}>
                <div style={progressStyle} />
              </div>
              <small>{answeredBlocks.size}/{effectiveTotal}</small>
            </aside>

            <div className={classes.flow}>
              <WarmInputBlock title={plan.title} totalBlocks={effectiveTotal} dueCount={effectiveDueCount} newCount={effectiveNewCount} />

              {plan.diagnostics.length > 0 && (
                <section className={classes.diagnostics} aria-label="Sessiediagnostiek">
                  {plan.diagnostics.map((diagnostic, index) => (
                    <p key={`${diagnostic.reason}-${index}`}>
                      <strong>{diagnostic.reason}</strong>: {diagnostic.details}
                    </p>
                  ))}
                </section>
              )}

              {submissionError && (
                <section className={classes.diagnostics} role="alert">
                  <p>{submissionError}</p>
                </section>
              )}

              {renderableBlocks.map(block => {
                const context = contexts.get(block.id)!  // guaranteed by renderableBlocks filter
                return block.kind === 'due_review'
                  ? (
                      <DueReviewBlock
                        key={block.id}
                        block={block}
                        context={context}
                        userLanguage={userLanguage}
                        position={blockPositions.get(block.id) ?? 1}
                        total={effectiveDueCount}
                        answered={answeredBlocks.has(block.id)}
                        submitting={submittingBlockId === block.id}
                        onAnswerReport={report => handleAnswerReport(block, report)}
                        onSkip={handleSkip}
                      />
                    )
                  : (
                      <NewIntroductionBlock
                        key={block.id}
                        block={block}
                        context={context}
                        userLanguage={userLanguage}
                        position={blockPositions.get(block.id) ?? 1}
                        total={effectiveNewCount}
                        answered={answeredBlocks.has(block.id)}
                        submitting={submittingBlockId === block.id}
                        onAnswerReport={report => handleAnswerReport(block, report)}
                        onSkip={handleSkip}
                      />
                    )
              })}

              <RecapBlock
                answeredCount={answeredBlocks.size}
                totalCount={effectiveTotal}
                dueCount={effectiveDueCount}
                newCount={effectiveNewCount}
                changedCapabilities={changedCapabilities}
                onComplete={onComplete}
              />
            </div>
          </div>
        </PageBody>
      </PageContainer>
    </SessionAudioProvider>
  )
}

export type { SessionAnswerEvent }
