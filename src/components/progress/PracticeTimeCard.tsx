// src/components/progress/PracticeTimeCard.tsx
//
// Practice Time (Axis 1) on the voortgang page — the tracer-bullet surface for
// the analytics redesign (#206). Exercises-only weekly minutes, read from the
// new read-only `analytics.engagement` module (CONTEXT.md → Practice Time).
// Slice 2 (#207) thickens this into the full card (streak / min-per-day /
// time-per-session).
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { StatCard } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { engagement } from '@/lib/analytics/engagement'
import { logError } from '@/lib/logger'

export interface PracticeTimeCardProps {
  userId: string
  timezone: string
}

export function PracticeTimeCard({ userId, timezone }: PracticeTimeCardProps) {
  const T = useT()
  const [minutes, setMinutes] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    engagement
      .practiceMinutesThisWeek(userId, timezone)
      .then((value) => {
        if (active) setMinutes(value)
      })
      .catch((err) => {
        logError({
          page: 'progress',
          action: 'practiceMinutesThisWeek',
          error: err,
        })
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

  return (
    <StatCard
      label={T.progress.practiceThisWeek}
      value={minutes ?? '—'}
      trailing={T.progress.minutesShort}
    />
  )
}
