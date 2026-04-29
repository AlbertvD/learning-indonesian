import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import { capabilityLabel, exerciseLabel, skillLabel } from '@/lib/session/sessionLabels'
import { CapabilityExerciseFrame } from '../CapabilityExerciseFrame'
import classes from '../ExperiencePlayer.module.css'

interface ReviewBlockProps {
  block: SessionBlock
  position: number
  total: number
  answered: boolean
  submitting: boolean
  onAnswerReport: (report: AnswerReport) => void
}

export function DueReviewBlock({ block, position, total, answered, submitting, onAnswerReport }: ReviewBlockProps) {
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
        answered={answered}
        submitting={submitting}
        prompt="Beantwoord deze herhaling. De reviewverwerker slaat je voortgang veilig op en plant de volgende oefening."
        positiveLabel="Dit wist ik"
        negativeLabel="Nog oefenen"
        completionCopy="Antwoord opgeslagen. Je herhalingsplanning is bijgewerkt."
        onAnswerReport={onAnswerReport}
      />
    </article>
  )
}
