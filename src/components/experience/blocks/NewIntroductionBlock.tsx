import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import { capabilityLabel, exerciseLabel } from '@/lib/session/sessionLabels'
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
      <h2 id={`${block.id}-title`}>{capabilityLabel(block.renderPlan.capabilityType)}</h2>
      <p className={classes.blockMeta}>
        Eerste oefening met {exerciseLabel(block.renderPlan.exerciseType)}. De reviewverwerker start daarna je persoonlijke planning.
      </p>
      <CapabilityExerciseFrame
        block={block}
        answered={answered}
        submitting={submitting}
        prompt="Maak rustig kennis met deze nieuwe vaardigheid. Je antwoord bepaalt hoe voorzichtig de planning begint."
        positiveLabel="Voelt bekend"
        negativeLabel="Rustig opbouwen"
        completionCopy="Introductie opgeslagen. Je planning wordt bijgewerkt door de reviewverwerker."
        onAnswerReport={onAnswerReport}
      />
    </article>
  )
}
