// src/components/progress/WeeklyRecapCard.tsx
//
// Weekly movement (#210) — the fast pulse on the slow Mastery axis. "↑N moved up
// a rung this week", + reached mastered, + slipped to needs-review. Server-side
// aggregation over the event log (ADR 0016); read-only.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { StatCard } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import {
  getWeeklyMovement,
  type WeeklyMovement,
} from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import classes from './PracticeTimeCard.module.css'

export interface WeeklyRecapCardProps {
  userId: string
  timezone: string
}

export function WeeklyRecapCard({ userId, timezone }: WeeklyRecapCardProps) {
  const T = useT()
  const [m, setM] = useState<WeeklyMovement | null>(null)

  useEffect(() => {
    let active = true
    getWeeklyMovement(userId, timezone)
      .then((value) => {
        if (active) setM(value)
      })
      .catch((err) => {
        logError({ page: 'progress', action: 'weeklyMovement', error: err })
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

  const value = (n: number | undefined) => (m ? (n ?? 0) : '—')

  return (
    <div>
      <h2 className={classes.heading}>{T.progress.weeklyRecapTitle}</h2>
      <div className={classes.grid}>
        <StatCard label={T.progress.recapAdvanced} value={value(m?.advanced)} />
        <StatCard label={T.progress.recapMastered} value={value(m?.reachedMastered)} />
        <StatCard label={T.progress.recapSlipped} value={value(m?.slipped)} />
      </div>
    </div>
  )
}
