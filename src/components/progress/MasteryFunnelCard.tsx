// src/components/progress/MasteryFunnelCard.tsx
//
// Mastery progression (Axis 2) on the voortgang page. Fetches the read-only
// mastery funnels (client-side over getMasteryOverview evidence — no RPC,
// data-architect Q-C) and renders the split funnels. #208 ships the Vocabulary
// funnel; #209 adds the Grammar funnel beside it.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import {
  getMasteryFunnel,
  type MasteryFunnels,
} from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { FunnelBars } from './FunnelBars'

export interface MasteryFunnelCardProps {
  userId: string
}

export function MasteryFunnelCard({ userId }: MasteryFunnelCardProps) {
  const T = useT()
  const [funnels, setFunnels] = useState<MasteryFunnels | null>(null)

  useEffect(() => {
    let active = true
    getMasteryFunnel(userId)
      .then((value) => {
        if (active) setFunnels(value)
      })
      .catch((err) => {
        logError({ page: 'progress', action: 'masteryFunnel', error: err })
        notifications.show({
          color: 'red',
          title: T.common.error,
          message: T.common.somethingWentWrong,
        })
      })
    return () => {
      active = false
    }
  }, [userId, T.common.error, T.common.somethingWentWrong])

  if (!funnels) return null

  return (
    <FunnelBars title={T.progress.masteryVocabTitle} funnel={funnels.vocabulary} />
  )
}
