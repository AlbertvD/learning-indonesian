// src/components/progress/FunnelBars.tsx
//
// Presentational: one mastery-progression funnel (Axis 2) as labelled bars —
// the ladder distribution for one content type (vocabulary or grammar). Colour
// follows the engagement research: mastered = green, at-risk = amber. Reused for
// both the Vocabulary (#208) and Grammar (#209) funnels.
import { useT } from '@/hooks/useT'
import type { MasteryFunnel } from '@/lib/analytics/mastery/masteryModel'
import classes from './FunnelBars.module.css'

export interface FunnelBarsProps {
  title: string
  funnel: MasteryFunnel
}

// The progression rungs we surface, in ladder order. `not_assessed` (has state
// but lesson off) is an edge bucket and intentionally not shown.
const RUNGS = ['introduced', 'learning', 'strengthening', 'mastered', 'at_risk'] as const

export function FunnelBars({ title, funnel }: FunnelBarsProps) {
  const T = useT()
  const labelFor: Record<(typeof RUNGS)[number], string> = {
    introduced: T.progress.rungIntroduced,
    learning: T.progress.rungLearning,
    strengthening: T.progress.rungStrengthening,
    mastered: T.progress.rungMastered,
    at_risk: T.progress.rungAtRisk,
  }
  const max = Math.max(1, ...RUNGS.map((r) => funnel[r]))

  return (
    <div className={classes.card}>
      <h3 className={classes.title}>{title}</h3>
      {RUNGS.map((rung) => (
        <div key={rung} className={classes.row}>
          <span className={classes.label}>{labelFor[rung]}</span>
          <span className={classes.track}>
            <span
              className={`${classes.fill} ${classes[rung] ?? ''}`}
              style={{ width: `${(funnel[rung] / max) * 100}%` }}
            />
          </span>
          <span className={classes.count}>{funnel[rung]}</span>
        </div>
      ))}
    </div>
  )
}
