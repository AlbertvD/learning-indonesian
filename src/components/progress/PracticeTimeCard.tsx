// src/components/progress/PracticeTimeCard.tsx
//
// Practice Time (Axis 1) on the voortgang page — the "are you showing up?" axis
// of the analytics redesign (#207). Exercises-only, read from the read-only
// `analytics.engagement` module (CONTEXT.md → Practice Time): streak, minutes
// today, minutes this week, and average time per session.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { StatCard } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { engagement, type PracticeTime } from '@/lib/analytics/engagement'
import { logError } from '@/lib/logger'
import classes from './PracticeTimeCard.module.css'

export interface PracticeTimeCardProps {
  userId: string
  timezone: string
}

export function PracticeTimeCard({ userId, timezone }: PracticeTimeCardProps) {
  const T = useT()
  const [pt, setPt] = useState<PracticeTime | null>(null)

  useEffect(() => {
    let active = true
    engagement
      .practiceTime(userId, timezone)
      .then((value) => {
        if (active) setPt(value)
      })
      .catch((err) => {
        logError({ page: 'progress', action: 'practiceTime', error: err })
        notifications.show({
          color: 'red',
          title: T.common.error,
          message: T.common.somethingWentWrong,
        })
      })
    return () => {
      active = false
    }
  }, [userId, timezone, T.common.error, T.common.somethingWentWrong])

  const value = (n: number | undefined) => (pt ? (n ?? 0) : '—')

  return (
    <div>
      <h2 className={classes.heading}>{T.progress.practiceTimeTitle}</h2>
      <div className={classes.grid}>
        <StatCard
          label={T.progress.practiceStreak}
          value={value(pt?.streakDays)}
          trailing={T.progress.daysShort}
        />
        <StatCard
          label={T.progress.practiceToday}
          value={value(pt?.minutesToday)}
          trailing={T.progress.minutesShort}
        />
        <StatCard
          label={T.progress.practiceThisWeek}
          value={value(pt?.minutesThisWeek)}
          trailing={T.progress.minutesShort}
        />
        <StatCard
          label={T.progress.practicePerSession}
          value={value(pt?.avgSessionMinutes)}
          trailing={T.progress.minutesShort}
        />
      </div>
    </div>
  )
}
