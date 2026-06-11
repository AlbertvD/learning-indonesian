// src/components/progress/SkillModeGapsCard.tsx
//
// Vocabulary skill profile (#211, redesigned): the receptive→productive→aural
// gap (Webb 2008). Per mode (Recognise / Produce / Listen), a gradient gauge of
// the SHARE of your words you know solidly — a proportion, not weakest-wins, so
// it never pins to red. Confidence-gated ("not enough data yet"). Client-side
// over the same evidence the funnel uses; vocabulary (item caps) only.
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

export function SkillModeGapsCard({ userId }: SkillModeGapsCardProps) {
  const T = useT()
  const [gaps, setGaps] = useState<SkillModeGap[]>([])

  useEffect(() => {
    let active = true
    getSkillModeGaps(userId)
      .then((v) => active && setGaps(v))
      .catch((err) => {
        logError({ page: 'progress', action: 'skillModeGaps', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
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
  const modeDesc: Record<SkillMode, string> = {
    recognise: T.progress.modeRecogniseDesc,
    produce: T.progress.modeProduceDesc,
    listen: T.progress.modeListenDesc,
  }

  return (
    <div className={classes.card}>
      <h3 className={classes.title}>{T.progress.skillGapsTitle}</h3>
      <p className={classes.subtitle}>{T.progress.skillGapsSubtitle}</p>
      {gaps.map((gap) => (
        <div key={gap.mode} className={classes.row}>
          <div className={classes.head}>
            <span className={classes.mode}>
              {modeLabel[gap.mode]}
              <span className={classes.desc}>{modeDesc[gap.mode]}</span>
            </span>
            {gap.confidence === 'none' ? (
              <span className={classes.none}>{T.progress.insufficientData}</span>
            ) : (
              <span>
                <span className={classes.pct}>{gap.strongPct}%</span>
                <span className={classes.count}>
                  {gap.strong} {T.progress.wordsKnownOf} {gap.total}
                </span>
              </span>
            )}
          </div>
          {gap.confidence !== 'none' && (
            <div className={classes.track}>
              <span
                className={classes.fill}
                style={{ ['--pct' as string]: `${gap.strongPct}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
