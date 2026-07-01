// src/components/progress/DurabilityCard.tsx
//
// Groei tab, durability curve: average memory strength (FSRS stability, days)
// over the last 12 weeks. Read-only over analytics.memory (direct import, not the
// barrel). Plain-language calibrating headline ("your memory now holds ~X days")
// rather than a raw stability number — the point is to teach the learner what
// their retention is doing over time (design §3.4, research design read #3).
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { IconClockHeart } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import { memory, type StabilityWeek } from '@/lib/analytics/memory'
import { logError } from '@/lib/logger'
import { TrendChart } from './TrendChart'
import classes from './GroeiCard.module.css'

const WEEKS = 12

export interface DurabilityCardProps {
  userId: string
  timezone: string
}

/** Latest non-null value, and the value ~4 weeks earlier (for the delta). */
function latestAndPrior(series: StabilityWeek[]): { now: number | null; prior: number | null } {
  let now: number | null = null
  let nowIdx = -1
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].avgStabilityDays != null) {
      now = series[i].avgStabilityDays
      nowIdx = i
      break
    }
  }
  let prior: number | null = null
  if (nowIdx > 0) {
    for (let i = Math.max(0, nowIdx - 4); i < nowIdx; i++) {
      if (series[i].avgStabilityDays != null) {
        prior = series[i].avgStabilityDays
        break
      }
    }
  }
  return { now, prior }
}

export function DurabilityCard({ userId, timezone }: DurabilityCardProps) {
  const T = useT()
  const [series, setSeries] = useState<StabilityWeek[] | null>(null)

  useEffect(() => {
    let active = true
    memory
      .stabilitySeries(userId, timezone, WEEKS)
      .then((v) => active && setSeries(v))
      .catch((err) => {
        logError({ page: 'progress', action: 'durabilitySeries', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      })
    return () => {
      active = false
    }
  }, [userId, timezone, T.common.error, T.common.somethingWentWrong])

  if (!series) return null

  const { now, prior } = latestAndPrior(series)
  const hasData = now != null

  return (
    <div className={classes.card}>
      <div className={classes.head}>
        <IconClockHeart size={18} className={classes.icon} />
        <div>
          <h3 className={classes.title}>{T.progress.durabilityTitle}</h3>
          <p className={classes.subtitle}>{T.progress.durabilitySubtitle}</p>
        </div>
      </div>

      {!hasData ? (
        <p className={classes.empty}>{T.progress.durabilityEmpty}</p>
      ) : (
        <>
          <div className={classes.headline}>
            <span className={classes.hero}>{T.progress.durabilityHoldsNow}{Math.round(now)}</span>
            <span className={classes.heroUnit}>{T.progress.durabilityHoldsUnit}</span>
            {prior != null && Math.round(prior) !== Math.round(now) && (
              <span className={classes.was}>
                ({T.progress.durabilityWas} {Math.round(prior)})
              </span>
            )}
          </div>
          <TrendChart
            xLabels={series.map((w) => w.weekStart)}
            series={[
              {
                key: 'stability',
                label: T.progress.durabilityTitle,
                color: 'var(--mantine-color-teal-6, #0ca678)',
                values: series.map((w) => w.avgStabilityDays),
              },
            ]}
            formatMax={(v) => `${Math.round(v)} ${T.progress.durabilityHoldsUnit}`}
          />
        </>
      )}
    </div>
  )
}
