// src/components/progress/MasteryFunnelCard.tsx
//
// Mastery progression (Axis 2) — a SINGLE journey funnel with a Vocabulary /
// Grammar segmented filter (no scrolling between two funnels). Client-side over
// getMasteryOverview evidence (data-architect Q-C); the journey re-animates when
// the filter switches.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { getMasteryFunnel, type MasteryFunnels } from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { MasteryJourney } from './MasteryJourney'
import { PillSegmented } from './PillSegmented'
import classes from './MasteryFunnelCard.module.css'

export interface MasteryFunnelCardProps {
  userId: string
}

type View = 'vocabulary' | 'grammar'

export function MasteryFunnelCard({ userId }: MasteryFunnelCardProps) {
  const T = useT()
  const [funnels, setFunnels] = useState<MasteryFunnels | null>(null)
  const [view, setView] = useState<View>('vocabulary')

  useEffect(() => {
    let active = true
    getMasteryFunnel(userId)
      .then((v) => active && setFunnels(v))
      .catch((err) => {
        logError({ page: 'progress', action: 'masteryFunnel', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      })
    return () => {
      active = false
    }
  }, [userId, T.common.error, T.common.somethingWentWrong])

  if (!funnels) return null

  const unitLabel = view === 'vocabulary' ? T.progress.unitWords : T.progress.unitTopics

  return (
    <div className={classes.panel}>
      <PillSegmented
        fullWidth
        value={view}
        onChange={(v) => setView(v as View)}
        data={[
          { value: 'vocabulary', label: T.progress.masteryVocabTitle },
          { value: 'grammar', label: T.progress.masteryGrammarTitle },
        ]}
      />
      {/* key re-mounts MasteryJourney so its entrance animation replays on switch */}
      <MasteryJourney key={view} funnel={funnels[view]} unitLabel={unitLabel} />
    </div>
  )
}
