// src/components/lessons/LessonCard.tsx
// The Lessons-overview tile. A bespoke lesson-domain card (NOT the generic
// page/primitives/MediaShowcaseCard, whose only other use is the admin design
// lab) — it carries lessons-domain concepts the generic primitive shouldn't:
// the CEFR level badge and the two nested learning-progress bars (% geoefend
// nested under % beheerst). See
// docs/plans/2026-06-09-lesson-tile-redesign-and-practiced-metric.md and the
// lessons-overview module spec.
//
// Layout:
//   ┌ banner (gradient/glyph or hero img) — decorative, aria-hidden ───┐
//   │   10  Kantor Pos   ← number (aria-hidden art) + title <h3>       │
//   ├──────────────────────────────────────────────────────────────────┤
//   │  grammar topics, full width, 1–3 lines, untruncated               │
//   │  Geoefend ████░░ 70%   [A2]   ← bar ↔ level badge (row 1)         │
//   │  Beheerst ██░░░░ 42%   Actief ← bar ↔ status pill (row 2)         │
//   └──────────────────────────────────────────────────────────────────┘
//
// a11y: the banner art (incl. the big number) is aria-hidden; the title <h3>
// is a sibling OUTSIDE that subtree, so it is the card link's accessible name.
// Even grid (every tile == tallest) is owned by the page grid, not this card.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { StatusPill } from '@/components/page/primitives'
import { cx } from '@/components/page/primitives/cx'
import classes from './LessonCard.module.css'

export interface LessonCardBar {
  label: string
  // null → bar hidden (lesson not activated / nothing to show).
  percent: number | null
}

export interface LessonCardProps {
  /** Decorative banner art (gradient + glyph, or hero <img> + scrim). Rendered
   *  aria-hidden; composed by the page so the per-lesson palette stays there. */
  banner: ReactNode
  /** Lesson number, shown over the banner next to the title (decorative). */
  orderIndex: number
  /** Display-ready title (caller strips "Les N -"); becomes the card's <h3>. */
  title: string
  /** CEFR level badge text (e.g. "A2"); null hides the badge. */
  level: string | null
  /** Grammar topics, shown in full (no truncation); null hides the row. */
  grammarTopics: string | null
  /** The two nested progress bars. Both hidden when their percent is null. */
  practiced: LessonCardBar
  mastered: LessonCardBar
  status: { tone: 'success' | 'warning' | 'danger' | 'accent' | 'neutral'; label: string }
  to?: string
  disabled?: boolean
}

function Bar({ label, percent }: LessonCardBar) {
  const value = Math.max(0, Math.min(100, percent ?? 0))
  return (
    <div className={classes.bar}>
      <span className={classes.barLabel}>{label}</span>
      <span className={classes.barTrack} aria-hidden="true">
        <span className={classes.barFill} style={{ width: `${value}%` }} />
      </span>
      <span className={classes.barPercent}>{value}%</span>
    </div>
  )
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return null
  return <span className={classes.levelBadge}>{level}</span>
}

export function LessonCard({
  banner,
  orderIndex,
  title,
  level,
  grammarTopics,
  practiced,
  mastered,
  status,
  to,
  disabled = false,
}: LessonCardProps) {
  const showBars = practiced.percent !== null || mastered.percent !== null

  const content = (
    <>
      <div className={classes.banner}>
        <div className={classes.bannerArt} aria-hidden="true">
          {banner}
        </div>
        <div className={classes.caption}>
          <span className={classes.number} aria-hidden="true">{orderIndex}</span>
          <h3 className={classes.title}>{title}</h3>
        </div>
      </div>

      <div className={classes.body}>
        {grammarTopics && <p className={classes.grammar}>{grammarTopics}</p>}

        {showBars ? (
          // 2-col grid: both bars sit in the same 1fr column so their tracks are
          // identical length (comparable side by side); the meta column (auto)
          // holds the level badge over the status pill.
          <div className={classes.metrics}>
            <Bar label={practiced.label} percent={practiced.percent} />
            <div className={classes.metaCell}><LevelBadge level={level} /></div>
            <Bar label={mastered.label} percent={mastered.percent} />
            <div className={classes.metaCell}><StatusPill tone={status.tone}>{status.label}</StatusPill></div>
          </div>
        ) : (
          <div className={classes.metaOnly}>
            <LevelBadge level={level} />
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
        )}
      </div>
    </>
  )

  const rootClass = cx(classes.root, disabled && classes.disabled)

  if (to !== undefined && !disabled) {
    return <Link to={to} className={rootClass}>{content}</Link>
  }
  return <div className={rootClass} aria-disabled={disabled || undefined}>{content}</div>
}
