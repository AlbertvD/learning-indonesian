// src/components/progress/GrowthCurveCard.tsx
//
// "Groei over tijd" — the mastery ladder's 4 rungs (introduced/learning/
// strengthening/mastered), stacked bottom-to-top and reconstructed week by
// week over the last 12 weeks (voortgang-polish). Replaces the single
// climbing "usable words" area (strengthening + mastered only) that preceded
// this: a stacked area shows the SAME upward climb the usable-only area did
// (the total band height only grows) while also showing composition — how
// the mix shifts from grey (introduced) toward green (mastered) as words
// mature, which the ladder above this card already frames as the "journey."
// Colors are the mastery ladder's own ramp (MasteryLadder.module.css's
// .s1–.s4) mirrored here as CSS var strings, since SVG fills need a
// JS-reachable value where the ladder's CSS classes can't reach — the ladder
// is the single source of truth for the ramp; keep these two in sync. A
// bucket toggle switches vocab/grammar/morphology (supplied by the host
// Progress detail, no in-card toggle). Read-only over analytics.mastery
// (getFunnelSeries, direct import).
import { useEffect, useMemo, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { getFunnelSeries, type FunnelWeek } from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { TrendChart, type TrendSeries } from './TrendChart'
import classes from './GroeiCard.module.css'

const WEEKS = 12
type Bucket = 'vocabulary' | 'grammar' | 'morphology'

const RUNGS = ['introduced', 'learning', 'strengthening', 'mastered'] as const
type Rung = (typeof RUNGS)[number]

// Same ramp as MasteryLadder's .s1–.s4 (MasteryLadder.module.css) — grey →
// tamarind → gold → green. Keep in sync with that file if the ladder's ramp
// ever changes; don't invent a second palette here.
const RUNG_COLOR: Record<Rung, string> = {
  introduced: 'var(--text-tertiary)',
  learning: 'var(--mantine-color-tamarind-4)',
  strengthening: 'var(--rail-gold)',
  mastered: 'var(--success)',
}

export interface GrowthCurveCardProps {
  userId: string
  /** Which content bucket to plot. Supplied by the host Progress detail
   * (Woordenschat/Grammatica/Morfologie) — no in-card toggle. */
  bucket: Bucket
  /** Noun for the caption, e.g. "woorden" / "patronen" / "affixen". */
  unitLabel: string
}

export function GrowthCurveCard({ userId, bucket, unitLabel }: GrowthCurveCardProps) {
  const T = useT()
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const [series, setSeries] = useState<FunnelWeek[] | null>(null)

  useEffect(() => {
    let active = true
    getFunnelSeries(userId, timezone, WEEKS)
      .then((v) => active && setSeries(v))
      .catch((err) => {
        logError({ page: 'progress', action: 'funnelSeries', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      })
    return () => {
      active = false
    }
  }, [userId, timezone, T.common.error, T.common.somethingWentWrong])

  const rungLabel: Record<Rung, string> = {
    introduced: T.progress.ladderNetOntmoet,
    learning: T.progress.ladderAanHetOefenen,
    strengthening: T.progress.ladderKunJeGebruiken,
    mastered: T.progress.ladderZitErin,
  }

  // One band per rung, bottom-to-top — TrendChart's stacked mode fills
  // between each band's cumulative boundaries in this order.
  const bands: TrendSeries[] = useMemo(() => {
    if (!series) return []
    return RUNGS.map((rung) => ({
      key: rung,
      label: rungLabel[rung],
      color: RUNG_COLOR[rung],
      values: series.map((w) => w[bucket][rung]),
    }))
    // rungLabel is derived from T; safe to omit (stable within a render language).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, bucket])

  // Total = all 4 rungs combined — the honest "how many words has this
  // learner touched at all" headline, complementing the ladder's snapshot
  // above with a delta over time.
  const totals: number[] = useMemo(() => {
    if (!series) return []
    return series.map((w) => RUNGS.reduce((sum, rung) => sum + w[bucket][rung], 0))
  }, [series, bucket])

  if (!series) return null

  const now = totals.length ? totals[totals.length - 1] : 0
  const priorIdx = Math.max(0, totals.length - 5)
  const prior = totals.length ? totals[priorIdx] : 0
  const delta = now - prior
  const hasData = totals.some((v) => v > 0)

  const caption = T.progress.growthTotalLabel(unitLabel)

  return (
    <div className={classes.card}>
      <div className={classes.head}>
        <h3 className={classes.title}>{T.progress.growthCurveTitle}</h3>
        <p className={classes.subtitle}>{T.progress.growthCurveSubtitle}</p>
      </div>

      {!hasData ? (
        <p className={classes.empty}>{T.progress.growthCurveEmpty}</p>
      ) : (
        <>
          <div className={classes.headline}>
            <span className={classes.hero}>{now}</span>
            {delta > 0 && <span className={classes.delta}>▲ +{delta}</span>}
          </div>
          <p className={classes.caption}>{caption}</p>
          <TrendChart xLabels={series.map((w) => w.weekStart)} series={bands} stacked height={160} />
          <div className={classes.legendRow}>
            {RUNGS.map((rung) => (
              <span key={rung} className={classes.legendItem}>
                <span className={classes.legendDot} style={{ background: RUNG_COLOR[rung] }} />
                {rungLabel[rung]}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
