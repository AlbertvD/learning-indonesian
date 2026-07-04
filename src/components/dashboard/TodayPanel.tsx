// src/components/dashboard/TodayPanel.tsx — the deep-green "Vandaag" session
// hero on Home (desktop program slice 3): total exercise count, the four-way
// composition bar + legend, and the Start CTA with a rough duration estimate.
// The counts come from the pure summarizer over a buildSession pure read
// (sessionPreview.ts); rendering is presentational only.
import { Link } from 'react-router-dom'
import { IconPlayerPlayFilled } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import type { SessionPreviewCounts } from './sessionPreview'
import classes from './TodayPanel.module.css'

interface TodayPanelProps {
  counts: SessionPreviewCounts
  onStart: () => void
}

export function TodayPanel({ counts, onStart }: TodayPanelProps) {
  const T = useT()

  if (counts.total === 0) {
    return (
      <section className={classes.panel}>
        <div className={classes.label}>{T.dashboard.todayLabel}</div>
        <p className={classes.empty}>{T.dashboard.todayEmpty}</p>
        <div className={classes.emptyLinks}>
          <Link to="/leren" className={classes.quietLink}>{T.nav.leren} →</Link>
          <Link to="/ontdek" className={classes.quietLink}>{T.nav.ontdek} →</Link>
        </div>
      </section>
    )
  }

  const legend = [
    { key: 'reviews', count: counts.reviews, label: T.dashboard.todayReviews, className: classes.cReview },
    { key: 'new', count: counts.newItems, label: T.dashboard.todayNew, className: classes.cNew },
    { key: 'grammar', count: counts.grammar, label: T.dashboard.todayGrammar, className: classes.cGrammar },
    { key: 'listening', count: counts.listening, label: T.dashboard.todayListening, className: classes.cListening },
  ].filter(entry => entry.count > 0)

  return (
    <section className={classes.panel}>
      <div className={classes.label}>{T.dashboard.todayLabel}</div>
      <div className={classes.count}>
        <span className={classes.big}>{counts.total}</span>
        <span className={classes.countLabel}>
          {counts.total === 1 ? T.dashboard.todayReadyOne : T.dashboard.todayReady}
        </span>
      </div>
      <div className={classes.bar} aria-hidden="true">
        {legend.map(entry => (
          <span
            key={entry.key}
            className={entry.className}
            style={{ width: `${(entry.count / counts.total) * 100}%` }}
          />
        ))}
      </div>
      <div className={classes.legend}>
        {legend.map(entry => (
          <span key={entry.key} className={classes.legendItem}>
            <i className={entry.className} />
            <b>{entry.count}</b> <span>{entry.label}</span>
          </span>
        ))}
      </div>
      <button className={classes.cta} onClick={onStart}>
        <IconPlayerPlayFilled size={15} />
        {T.dashboard.startTodaysSessionMinimal} · {T.dashboard.todayEst(counts.estMinutes)}
      </button>
    </section>
  )
}
