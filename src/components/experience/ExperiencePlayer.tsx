import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { SessionPlan, SessionBlock } from '@/lib/session/sessionPlan'
import type { SessionAnswerEvent } from './types'
import { WarmInputBlock } from './blocks/WarmInputBlock'
import { DueReviewBlock } from './blocks/DueReviewBlock'
import { NewIntroductionBlock } from './blocks/NewIntroductionBlock'
import { RecapBlock } from './blocks/RecapBlock'
import classes from './ExperiencePlayer.module.css'

export function ExperiencePlayer(props: {
  plan: SessionPlan
  onAnswer: (event: SessionAnswerEvent) => Promise<void>
  onComplete: () => void
}) {
  const { plan, onAnswer, onComplete } = props
  const [answeredBlocks, setAnsweredBlocks] = useState<Set<string>>(() => new Set())
  const [submittingBlockId, setSubmittingBlockId] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const dueCount = plan.blocks.filter(block => block.kind === 'due_review').length
  const newCount = plan.blocks.filter(block => block.kind === 'new_introduction').length
  const progress = plan.blocks.length > 0 ? Math.round((answeredBlocks.size / plan.blocks.length) * 100) : 100
  const progressStyle = {
    height: `${progress}%`,
    '--mobile-progress': `${progress}%`,
  } as CSSProperties

  const blockPositions = useMemo(() => {
    let due = 0
    let intro = 0
    return new Map(plan.blocks.map(block => {
      const position = block.kind === 'due_review' ? ++due : ++intro
      return [block.id, position]
    }))
  }, [plan.blocks])

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

  const changedCapabilities = plan.blocks
    .filter(block => answeredBlocks.has(block.id))
    .map(block => ({
      id: block.id,
      kind: block.kind,
      exerciseType: block.renderPlan.exerciseType,
    }))

  return (
    <main className={classes.root} aria-labelledby="experience-warm-title">
      <div className={classes.shell}>
        <aside className={classes.rail} aria-label="Sessievoortgang">
          <span>{progress}%</span>
          <div className={classes.progressTrack}>
            <div style={progressStyle} />
          </div>
          <small>{answeredBlocks.size}/{plan.blocks.length}</small>
        </aside>

        <div className={classes.flow}>
          <WarmInputBlock title={plan.title} totalBlocks={plan.blocks.length} dueCount={dueCount} newCount={newCount} />

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

          {plan.blocks.map(block => (
            block.kind === 'due_review'
              ? (
                  <DueReviewBlock
                    key={block.id}
                    block={block}
                    position={blockPositions.get(block.id) ?? 1}
                    total={dueCount}
                    answered={answeredBlocks.has(block.id)}
                    submitting={submittingBlockId === block.id}
                    onAnswerReport={report => handleAnswerReport(block, report)}
                  />
                )
              : (
                  <NewIntroductionBlock
                    key={block.id}
                    block={block}
                    position={blockPositions.get(block.id) ?? 1}
                    total={newCount}
                    answered={answeredBlocks.has(block.id)}
                    submitting={submittingBlockId === block.id}
                    onAnswerReport={report => handleAnswerReport(block, report)}
                  />
                )
          ))}

          <RecapBlock
            answeredCount={answeredBlocks.size}
            totalCount={plan.blocks.length}
            dueCount={dueCount}
            newCount={newCount}
            changedCapabilities={changedCapabilities}
            onComplete={onComplete}
          />
        </div>
      </div>
    </main>
  )
}

export type { SessionAnswerEvent }
