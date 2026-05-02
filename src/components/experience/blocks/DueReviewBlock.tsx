import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import { capabilityLabel, exerciseLabel, skillLabel } from '@/lib/session/sessionLabels'
import { CapabilityExerciseFrame } from '../CapabilityExerciseFrame'
import classes from '../ExperiencePlayer.module.css'

interface ReviewBlockProps {
  block: SessionBlock
  context: CapabilityRenderContext
  userLanguage: 'nl' | 'en'
  position: number
  total: number
  answered: boolean
  submitting: boolean
  onAnswerReport: (report: AnswerReport) => void
  onSkip: (blockId: string) => void
}

export function DueReviewBlock({
  block, context, userLanguage,
  position, total, answered, submitting,
  onAnswerReport, onSkip,
}: ReviewBlockProps) {
  return (
    <article className={classes.exercisePanel} aria-labelledby={`${block.id}-title`}>
      <div className={classes.blockHeader}>
        <span className={classes.blockKicker}>Herhaling {position} van {total}</span>
        <span className={classes.kindPill}>Nu te herhalen</span>
      </div>
      <h2 id={`${block.id}-title`}>{exerciseLabel(block.renderPlan.exerciseType)}</h2>
      <p className={classes.blockMeta}>{capabilityLabel(block.renderPlan.capabilityType)} - {skillLabel(block.renderPlan.skillType)}</p>
      <CapabilityExerciseFrame
        block={block}
        context={context}
        userLanguage={userLanguage}
        onAnswerReport={onAnswerReport}
        onSkip={onSkip}
      />
      {answered && (
        <p className={classes.recorded}>Antwoord opgeslagen. Je herhalingsplanning is bijgewerkt.</p>
      )}
      {submitting && <span aria-live="polite" className={classes.recorded}>Bezig met opslaan…</span>}
    </article>
  )
}
