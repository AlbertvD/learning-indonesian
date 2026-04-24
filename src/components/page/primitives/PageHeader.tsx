// src/components/page/primitives/PageHeader.tsx
// Consolidated page-top header. Replaces the `.displaySm` / `.pageTitle`
// pattern duplicated across Dashboard / Lessons / Leaderboard / Podcasts
// pages with a single primitive owning the display-small type face + the
// title/subtitle/action layout row.
//
// Accessibility: renders the title as <h1>. Most existing pages currently
// use <div class="displaySm"> for the visual display-small face; promoting
// the page title to <h1> is a deliberate quality improvement as part of
// this refactor — the title of a page is its top-level heading per WCAG,
// and screen-reader landmark order benefits from a single <h1> per route.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (Layout chrome — 4).

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './PageHeader.module.css'

export interface PageHeaderProps {
  /** Required display text. Rendered as <h1> (page-level heading). */
  title: string
  /** Optional dim caption rendered below the title in a <p>. */
  subtitle?: string
  /**
   * Optional right-side slot for a button, link, Segmented control, etc.
   * Aligns to the top-right of the header row; will not shrink when the
   * title grows long.
   */
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className={cx(classes.root)}>
      <div className={cx(classes.titleBlock)}>
        <h1 className={cx(classes.title)}>{title}</h1>
        {subtitle && <p className={cx(classes.subtitle)}>{subtitle}</p>}
      </div>
      {action && <div className={cx(classes.action)}>{action}</div>}
    </div>
  )
}
