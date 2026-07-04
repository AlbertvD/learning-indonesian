// src/components/progress/GrowthCurveCard.tsx
//
// Groei tab, growth curve: the mastery funnel reconstructed over the last 12 weeks
// — one climbing line per rung (introduced/learning/strengthening/mastered), NOT
// mastered-only (user direction 2026-06-30). A bucket toggle switches
// vocab/grammar/morphology; the legend chips toggle each rung line on/off ("a line
// per state, select which to show"). Read-only over analytics.mastery
// (getFunnelSeries, direct import). Each point is a snapshot, so summing is not
// double-counting; the headline is the honest net delta of mastered.
import { useEffect, useMemo, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { IconChartLine } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import { getFunnelSeries, type FunnelWeek } from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { TrendChart, type TrendSeries } from './TrendChart'
import classes from './GroeiCard.module.css'

const WEEKS = 12
type Bucket = 'vocabulary' | 'grammar' | 'morphology'
const RUNGS = ['introduced', 'learning', 'strengthening', 'mastered'] as const
type Rung = (typeof RUNGS)[number]

// New scheme (main.tsx tokens): a warm progression that ends on success —
// neutral → light tamarind → tamarind accent → success green (mastered).
// Replaces the pre-retune cool gray/blue/indigo/teal palette.
const RUNG_COLOR: Record<Rung, string> = {
  introduced: 'var(--text-secondary)',
  learning: 'var(--mantine-color-tamarind-4)',
  strengthening: 'var(--accent-primary)',
  mastered: 'var(--success)',
}

export interface GrowthCurveCardProps {
  userId: string
  /** Which content bucket to plot. Supplied by the host Progress tab
   * (Woordenschat/Grammatica/Morfologie) — no in-card toggle. */
  bucket: Bucket
}

export function GrowthCurveCard({ userId, bucket }: GrowthCurveCardProps) {
  const T = useT()
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const [series, setSeries] = useState<FunnelWeek[] | null>(null)
  const [hidden, setHidden] = useState<Set<Rung>>(new Set())

  useEffect(() => {
    let active = true
    getFunnelSeries(userId, timezone, WEEKS)
      .then((v) => active && setSeries(v))
      .catch((err) => {
        logError({ page: 'progress', action: 'funnelSeries', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      })
    return () => {
      active = false
    }
  }, [userId, timezone, T.common.error, T.common.somethingWentWrong])

  const rungLabel: Record<Rung, string> = {
    introduced: T.progress.rungIntroduced,
    learning: T.progress.rungLearning,
    strengthening: T.progress.rungStrengthening,
    mastered: T.progress.rungMastered,
  }

  const lines: TrendSeries[] = useMemo(() => {
    if (!series) return []
    return RUNGS.map((rung) => ({
      key: rung,
      label: rungLabel[rung],
      color: RUNG_COLOR[rung],
      values: series.map((w) => w[bucket][rung]),
      hidden: hidden.has(rung),
    }))
    // rungLabel is derived from T; safe to omit (stable within a render language).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, bucket, hidden])

  if (!series) return null

  // Net mastered delta over the window (snapshot diff — not a flow sum).
  const masteredNow = series.length ? series[series.length - 1][bucket].mastered : 0
  const priorIdx = Math.max(0, series.length - 5)
  const masteredPrior = series.length ? series[priorIdx][bucket].mastered : 0
  const delta = masteredNow - masteredPrior
  const hasData = series.some((w) => RUNGS.some((r) => w[bucket][r] > 0))

  const toggle = (rung: Rung) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(rung)) next.delete(rung)
      else next.add(rung)
      return next
    })

  return (
    <div className={classes.card}>
      <div className={classes.head}>
        <IconChartLine size={18} className={classes.icon} />
        <div>
          <h3 className={classes.title}>{T.progress.growthCurveTitle}</h3>
          <p className={classes.subtitle}>{T.progress.growthCurveSubtitle}</p>
        </div>
      </div>

      {!hasData ? (
        <p className={classes.empty}>{T.progress.growthCurveEmpty}</p>
      ) : (
        <>
          {delta > 0 && (
            <div className={classes.headline}>
              <span className={classes.hero}>+{delta}</span>
              <span className={classes.heroUnit}>{rungLabel.mastered.toLowerCase()}</span>
              <span className={classes.nudge}>{T.progress.growthNudge}</span>
            </div>
          )}
          <TrendChart xLabels={series.map((w) => w.weekStart)} series={lines} />
          <div className={classes.legend}>
            {RUNGS.map((rung) => (
              <button
                key={rung}
                type="button"
                className={`${classes.legendChip} ${hidden.has(rung) ? classes.legendOff : ''}`}
                onClick={() => toggle(rung)}
                aria-pressed={!hidden.has(rung)}
              >
                <span className={classes.swatch} style={{ background: RUNG_COLOR[rung] }} />
                {rungLabel[rung]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
