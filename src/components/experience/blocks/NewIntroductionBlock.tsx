import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import { CapabilityExerciseFrame } from '../CapabilityExerciseFrame'
import classes from '../ExperiencePlayer.module.css'

interface NewIntroductionBlockProps {
  block: SessionBlock
  position: number
  total: number
  answered: boolean
  submitting: boolean
  onAnswerReport: (report: AnswerReport) => void
}

export function NewIntroductionBlock({ block, position, total, answered, submitting, onAnswerReport }: NewIntroductionBlockProps) {
  return (
    <article className={`${classes.exercisePanel} ${classes.newPanel}`} aria-labelledby={`${block.id}-title`}>
      <div className={classes.blockHeader}>
        <span className={classes.blockKicker}>Nieuw {position} van {total}</span>
        <span className={classes.kindPill}>Introductie</span>
      </div>
      <h2 id={`${block.id}-title`}>{block.renderPlan.capabilityType.replaceAll('_', ' ')}</h2>
      <p className={classes.blockMeta}>
        Eerste blootstelling gebruikt {block.renderPlan.exerciseType.replaceAll('_', ' ')} en wacht op activatie door de reviewverwerker.
      </p>
      <p className={classes.capabilityKey}>{block.canonicalKeySnapshot}</p>
      <CapabilityExerciseFrame
        block={block}
        answered={answered}
        submitting={submitting}
        prompt="Bekijk deze introductie. Een echte eerste herhaling moet nog door de reviewverwerker worden geactiveerd en opgeslagen."
        positiveLabel="Voelt bekend"
        negativeLabel="Rustig opbouwen"
        completionCopy="Preview-zelfcheck opgeslagen. Activatie blijft eigendom van de reviewverwerker."
        onAnswerReport={onAnswerReport}
      />
    </article>
  )
}
