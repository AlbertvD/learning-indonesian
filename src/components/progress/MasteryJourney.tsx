// src/components/progress/MasteryJourney.tsx
//
// The mastery-progression "journey": an item's path across the ladder rungs
// (Introduced → Learning → Strengthening → Mastered), as animated gradient
// segments left→right, with the at-risk count flagged. One component for both
// the Vocabulary and Grammar funnels (#voortgang redesign).
import { useT } from '@/hooks/useT'
import type { MasteryFunnel } from '@/lib/analytics/mastery/masteryModel'
import { InsightTips } from './InsightTips'
import classes from './MasteryJourney.module.css'

export interface MasteryJourneyProps {
  funnel: MasteryFunnel
  /** Noun for the headline, e.g. "woorden" / "onderwerpen". */
  unitLabel: string
}

const RUNGS = ['introduced', 'learning', 'strengthening', 'mastered'] as const

export function MasteryJourney({ funnel, unitLabel }: MasteryJourneyProps) {
  const T = useT()
  const rungLabel: Record<(typeof RUNGS)[number], string> = {
    introduced: T.progress.rungIntroduced,
    learning: T.progress.rungLearning,
    strengthening: T.progress.rungStrengthening,
    mastered: T.progress.rungMastered,
  }
  const total = RUNGS.reduce((s, r) => s + funnel[r], 0) + funnel.at_risk
  const max = Math.max(1, ...RUNGS.map((r) => funnel[r]))

  return (
    <div className={classes.wrap}>
      <div className={classes.headline}>
        <span className={classes.headlineNum}>{funnel.mastered}</span>
        <span className={classes.headlineLabel}>
          {unitLabel} {T.progress.rungMastered.toLowerCase()}
        </span>
        <span className={classes.headlineSub}>
          {total} {unitLabel} {T.progress.totalSeen}
        </span>
      </div>

      <div className={classes.journey}>
        {RUNGS.map((rung) => (
          <div
            key={rung}
            className={classes.seg}
            style={{ ['--fill' as string]: `${(funnel[rung] / max) * 100}%` }}
          >
            <div className={classes.segCount}>{funnel[rung]}</div>
            <div className={classes.segLabel}>{rungLabel[rung]}</div>
            <div className={classes.segBar}>
              <span className={classes.segBarFill} />
            </div>
          </div>
        ))}
      </div>

      {funnel.at_risk > 0 && (
        <>
          <div className={classes.atRisk}>
            ⚠ {funnel.at_risk} {unitLabel} {T.progress.rungAtRisk.toLowerCase()}
          </div>
          <InsightTips area="at_risk" defaultOpen={false} />
        </>
      )}
    </div>
  )
}
