// src/components/progress/MasteryLadder.tsx
//
// The mastery ladder — Woordenschat/Grammatica/Morfologie's "journey" viz,
// replacing MasteryJourney's chevron funnel (voortgang-hub-redesign,
// docs/plans/2026-07-09-voortgang-hub-redesign.md). Real-life-ability framing
// (Net ontmoet → Aan het oefenen → Kun je gebruiken → Zit erin) on one
// connected ramp, above an achievement headline. The at-risk callout moved
// OUT of this component to a sibling ListCard owned by MasteryFunnelPanel —
// this component renders no at-risk affordance and takes no click handler.
import { useT } from '@/hooks/useT'
import type { MasteryFunnel } from '@/lib/analytics/mastery/masteryModel'
import classes from './MasteryLadder.module.css'

export interface MasteryLadderProps {
  funnel: MasteryFunnel
  /** Noun for the headline/eyebrow, e.g. "woorden" / "patronen" / "affixen". */
  unitLabel: string
}

const RUNGS = ['introduced', 'learning', 'strengthening', 'mastered'] as const
const STOP_CLASS = [classes.s1, classes.s2, classes.s3, classes.s4]

export function MasteryLadder({ funnel, unitLabel }: MasteryLadderProps) {
  const T = useT()

  const rungLabel: Record<(typeof RUNGS)[number], string> = {
    introduced: T.progress.ladderNetOntmoet,
    learning: T.progress.ladderAanHetOefenen,
    strengthening: T.progress.ladderKunJeGebruiken,
    mastered: T.progress.ladderZitErin,
  }

  return (
    <div className={classes.wrap}>
      <div className={classes.card}>
        <div className={classes.eyebrow}>
          <span>{T.progress.ladderEyebrow(unitLabel)}</span>
        </div>
        <div className={classes.ladder}>
          {RUNGS.map((rung, i) => (
            <div key={rung} className={`${classes.stop} ${STOP_CLASS[i]}`}>
              <div className={classes.count}>{funnel[rung]}</div>
              <div className={classes.node} />
              <div className={classes.lbl}>{rungLabel[rung]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
