import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import { capabilityLabel, exerciseLabel } from '@/lib/session/sessionLabels'
import { CapabilityExerciseFrame } from '../CapabilityExerciseFrame'
import classes from '../ExperiencePlayer.module.css'

interface NewIntroductionBlockProps {
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

export function NewIntroductionBlock({
  block, context, userLanguage,
  position, total, answered, submitting,
  onAnswerReport, onSkip,
}: NewIntroductionBlockProps) {
  return (
    <article className={`${classes.exercisePanel} ${classes.newPanel}`} aria-labelledby={`${block.id}-title`}>
      <div className={classes.blockHeader}>
        <span className={classes.blockKicker}>Nieuw {position} van {total}</span>
        <span className={classes.kindPill}>Introductie</span>
      </div>
      <h2 id={`${block.id}-title`}>{capabilityLabel(block.renderPlan.capabilityType)}</h2>
      <p className={classes.blockMeta}>
        Eerste oefening met {exerciseLabel(block.renderPlan.exerciseType)}. De reviewverwerker start daarna je persoonlijke planning.
      </p>
      <CapabilityExerciseFrame
        block={block}
        context={context}
        userLanguage={userLanguage}
        onAnswerReport={onAnswerReport}
        onSkip={onSkip}
      />
      {answered && (
        <p className={classes.recorded}>Introductie opgeslagen. Je planning wordt bijgewerkt door de reviewverwerker.</p>
      )}
      {submitting && <span aria-live="polite" className={classes.recorded}>Bezig met opslaan…</span>}
    </article>
  )
}
