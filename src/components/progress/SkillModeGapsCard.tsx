// src/components/progress/SkillModeGapsCard.tsx
//
// Skill-mode gaps (#211) — the orthogonal "where's my gap" map: Recognise /
// Produce / Listen, a coarse strength per mode (green/amber/red), confidence-
// gated so a sparse mode reads "not enough data yet" rather than a false gap.
// Client-side over the same evidence the funnels use; no RPC. The raw 11
// dimensions stay internal.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import {
  getSkillModeGaps,
  type SkillModeGap,
  type SkillMode,
} from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import classes from './SkillModeGapsCard.module.css'

export interface SkillModeGapsCardProps {
  userId: string
}

type Strength = 'strong' | 'developing' | 'weak' | 'none'

function strengthFor(gap: SkillModeGap): Strength {
  if (gap.confidence === 'none') return 'none'
  switch (gap.label) {
    case 'mastered':
    case 'strengthening':
      return 'strong'
    case 'at_risk':
      return 'weak'
    default:
      return 'developing'
  }
}

export function SkillModeGapsCard({ userId }: SkillModeGapsCardProps) {
  const T = useT()
  const [gaps, setGaps] = useState<SkillModeGap[]>([])

  useEffect(() => {
    let active = true
    getSkillModeGaps(userId)
      .then((value) => {
        if (active) setGaps(value)
      })
      .catch((err) => {
        logError({ page: 'progress', action: 'skillModeGaps', error: err })
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

  const modeLabel: Record<SkillMode, string> = {
    recognise: T.progress.modeRecognise,
    produce: T.progress.modeProduce,
    listen: T.progress.modeListen,
  }
  const strengthLabel: Record<Strength, string> = {
    strong: T.progress.strengthStrong,
    developing: T.progress.strengthDeveloping,
    weak: T.progress.strengthWeak,
    none: T.progress.insufficientData,
  }
  return (
    <div className={classes.card}>
      <h3 className={classes.title}>{T.progress.skillGapsTitle}</h3>
      {gaps.map((gap) => {
        const strength = strengthFor(gap)
        return (
          <div key={gap.mode} className={classes.row}>
            <span className={classes.mode}>{modeLabel[gap.mode]}</span>
            <span className={`${classes.badge} ${classes[strength]}`}>
              {strengthLabel[strength]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
