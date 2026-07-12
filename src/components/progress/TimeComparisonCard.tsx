// src/components/progress/TimeComparisonCard.tsx
//
// Practice-time comparison (the "Tijd" tab): this week vs last week, this month
// vs last month — Stripe-style stat cards with an up/down trend cue — plus the
// streak. Read-only over analytics.engagement.
//
// Loading/error states (2026-07-11 prod-ready audit): a Skeleton grid roughly
// the shape of the loaded 3-tile grid while the fetch is in flight, and the
// shared CardErrorNotice on failure (replaces the old "return null forever"
// branch). `retryTick` re-runs the effect.
import { useEffect, useState } from 'react'
import { Skeleton, SimpleGrid } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFlame, IconTrendingUp, IconTrendingDown, IconMinus } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import { engagement, type PracticeTime } from '@/lib/analytics/engagement'
import { logError } from '@/lib/logger'
import { CardErrorNotice } from './CardErrorNotice'
import classes from './TimeComparison.module.css'

export interface TimeComparisonCardProps {
  userId: string
  timezone: string
}

function Trend({ delta, suffix }: { delta: number; suffix: string }) {
  const cls = delta > 0 ? classes.up : delta < 0 ? classes.down : classes.flat
  const Icon = delta > 0 ? IconTrendingUp : delta < 0 ? IconTrendingDown : IconMinus
  return (
    <span className={`${classes.trend} ${cls}`}>
      <Icon size={13} />
      {delta > 0 ? '+' : ''}
      {delta} {suffix}
    </span>
  )
}

export function TimeComparisonCard({ userId, timezone }: TimeComparisonCardProps) {
  const T = useT()
  const [pt, setPt] = useState<PracticeTime | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    let active = true
    setLoadFailed(false)
    engagement
      .practiceTime(userId, timezone)
      .then((v) => active && setPt(v))
      .catch((err) => {
        if (!active) return
        logError({ page: 'progress', action: 'timeComparison', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
        setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [userId, timezone, retryTick, T.common.error, T.common.somethingWentWrong])

  if (loadFailed) return <CardErrorNotice onRetry={() => setRetryTick((t) => t + 1)} />

  if (!pt) {
    return (
      <SimpleGrid cols={2} spacing="0.6rem">
        <Skeleton height={90} radius="md" />
        <Skeleton height={90} radius="md" />
        <Skeleton height={90} radius="md" style={{ gridColumn: '1 / -1' }} />
      </SimpleGrid>
    )
  }

  return (
    <div className={classes.grid}>
      <div className={classes.card}>
        <span className={classes.label}>{T.progress.timeThisWeek}</span>
        <span className={classes.value}>
          <span className={classes.num}>{pt.minutesThisWeek}</span>
          <span className={classes.unit}>{T.progress.minutesShort}</span>
        </span>
        <Trend delta={pt.minutesThisWeek - pt.minutesLastWeek} suffix={T.progress.vsLastWeek} />
      </div>

      <div className={classes.card}>
        <span className={classes.label}>{T.progress.timeThisMonth}</span>
        <span className={classes.value}>
          <span className={classes.num}>{pt.minutesThisMonth}</span>
          <span className={classes.unit}>{T.progress.minutesShort}</span>
        </span>
        <Trend delta={pt.minutesThisMonth - pt.minutesLastMonth} suffix={T.progress.vsLastMonth} />
      </div>

      <div className={`${classes.card} ${classes.streak}`}>
        <span className={classes.label}>{T.progress.streakLabel}</span>
        <span className={classes.streakRow}>
          <IconFlame size={22} color="orange" />
          <span className={classes.num}>{pt.streakDays}</span>
          <span className={classes.unit}>{T.progress.daysUnit}</span>
        </span>
      </div>
    </div>
  )
}
