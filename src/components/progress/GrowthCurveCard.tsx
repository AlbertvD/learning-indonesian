// src/components/progress/GrowthCurveCard.tsx
//
// "Groei over tijd" — a single climbing area: the count of usable words/
// patterns/affixes (strengthening + mastered) reconstructed over the last 12
// weeks (voortgang-hub-redesign, docs/plans/2026-07-09-voortgang-hub-redesign.md
// §"The Woordenschat detail"). Replaced the prior 4-line rung chart (one line
// per introduced/learning/strengthening/mastered, with a legend toggle) — that
// chart read as "clunky" because the introduced/learning lines structurally
// DECLINE as words graduate into strengthening/mastered; a single usable-words
// area only ever climbs (words flow INTO "usable"), which matches how the
// ladder headline above it already frames progress. A bucket toggle switches
// vocab/grammar/morphology (supplied by the host Progress detail, no in-card
// toggle). Read-only over analytics.mastery (getFunnelSeries, direct import).
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

export interface GrowthCurveCardProps {
  userId: string
  /** Which content bucket to plot. Supplied by the host Progress detail
   * (Woordenschat/Grammatica/Morfologie) — no in-card toggle. */
  bucket: Bucket
  /** Noun for the caption, e.g. "woorden" / "patronen" / "affixen". */
  unitLabel: string
}

export function GrowthCurveCard({ userId, bucket, unitLabel }: GrowthCurveCardProps) {
  const T = useT()
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const [series, setSeries] = useState<FunnelWeek[] | null>(null)

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

  // Usable = strengthening + mastered — the same count the ladder headline
  // above this card already uses (MasteryLadder.tsx), so the two never
  // disagree about what "usable" means.
  const usable: number[] = useMemo(() => {
    if (!series) return []
    return series.map((w) => w[bucket].strengthening + w[bucket].mastered)
  }, [series, bucket])

  if (!series) return null

  const now = usable.length ? usable[usable.length - 1] : 0
  const priorIdx = Math.max(0, usable.length - 5)
  const prior = usable.length ? usable[priorIdx] : 0
  const delta = now - prior
  const hasData = usable.some((v) => v > 0)

  const caption = T.progress.growthUsableLabel(unitLabel)
  const line: TrendSeries = {
    key: 'usable',
    label: caption,
    color: 'var(--success)',
    values: usable,
    area: true,
  }

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
          <div className={classes.headline}>
            <span className={classes.hero}>{now}</span>
            {delta > 0 && <span className={classes.delta}>▲ +{delta}</span>}
          </div>
          <p className={classes.caption}>{caption}</p>
          <TrendChart xLabels={series.map((w) => w.weekStart)} series={[line]} showMaxLabel={false} />
          <div className={classes.xlab}>
            <span>{T.progress.growthWeeksAgo(WEEKS)}</span>
            <span>{T.progress.growthNow}</span>
          </div>
        </>
      )}
    </div>
  )
}
