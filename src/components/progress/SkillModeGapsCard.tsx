// src/components/progress/SkillModeGapsCard.tsx
//
// Vocabulary skill profile (#211, redesigned 2026-06-12): the receptive→
// productive→aural progression (Webb 2008; Laufer & Nation 1999). Per mode, the
// hero is an absolute COUNT of distinct words known solidly — a vocabulary size
// that climbs (Anki mature cards, Nation's VST), not a ratio over a growing pile
// (which can't climb) and not weakest-wins (which pinned every mode red). Bars
// scale to the largest mode so the receptive→productive gap is visible. Stage
// badges ①②③ frame the modes as a sequence, not a ranking — listening trails
// because it is scheduled last (FSRS), not because the learner is weaker; an
// info note says so to defuse gap-shaming. Tips are browsable (all collapsed),
// never auto-opened on a "weakest" mode. Client-side over the funnel's evidence;
// vocabulary (item caps) only.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import {
  getSkillModeGaps,
  type SkillModeGap,
  type SkillMode,
} from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { InsightTips } from './InsightTips'
import classes from './SkillModeGapsCard.module.css'

export interface SkillModeGapsCardProps {
  userId: string
}

const STAGE_BADGE = ['①', '②', '③']

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
  // What "known" means for each capability mode, phrased as the skill itself.
  const modeKnownLabel: Record<SkillMode, string> = {
    recognise: T.progress.skillKnownRecognise,
    produce: T.progress.skillKnownProduce,
    listen: T.progress.skillKnownListen,
  }

  // Bars are scaled to the largest mode's known-word count so the absolute
  // receptive→productive gap reads at a glance (recognise full, produce short).
  const maxKnown = Math.max(0, ...gaps.map((g) => g.knownWords))

  return (
    <div className={classes.card}>
      <h3 className={classes.title}>{T.progress.skillGapsTitle}</h3>
      <p className={classes.subtitle}>{T.progress.skillGapsSubtitle}</p>
      {gaps.map((gap, i) => (
        <div key={gap.mode} className={classes.row}>
          <div className={classes.head}>
            <span className={classes.mode}>
              <span className={classes.badge}>{STAGE_BADGE[i]}</span>
              {modeLabel[gap.mode]}
              <span className={classes.desc}>{modeDesc[gap.mode]}</span>
            </span>
            {gap.confidence === 'none' ? (
              <span className={classes.none}>{T.progress.insufficientData}</span>
            ) : (
              <span className={classes.practised}>
                {T.progress.skillPractisedConnector} {gap.practisedWords} {T.progress.skillPractisedLabel}
              </span>
            )}
          </div>
          {gap.confidence !== 'none' && (
            <>
              <div className={classes.heroLine}>
                <span className={classes.hero}>{gap.knownWords}</span>
                <span className={classes.heroUnit}>{modeKnownLabel[gap.mode]}</span>
              </div>
              <div className={classes.track}>
                <span
                  className={classes.fill}
                  style={{ ['--pct' as string]: `${maxKnown === 0 ? 0 : Math.round((gap.knownWords / maxKnown) * 100)}%` }}
                />
              </div>
            </>
          )}
        </div>
      ))}

      <p className={classes.note}>{T.progress.skillGapsNote}</p>

      {/* Tips are browsable, never auto-opened on a "weakest" mode (listening
          trails by design — gap-shaming it is wrong + non-actionable). */}
      {gaps.map((g) => (
        <InsightTips key={g.mode} area={g.mode} defaultOpen={false} />
      ))}
      <InsightTips area="general" defaultOpen={false} />
    </div>
  )
}
