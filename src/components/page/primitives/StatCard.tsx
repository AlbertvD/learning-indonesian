// src/components/page/primitives/StatCard.tsx
// Metric display primitive. Hosts the four scorecards on Dashboard
// (Consistentie / Herinnering / Woordenschat / Achterstand) and any future
// small-card metric display elsewhere.
//
// Critical design decision — StatCard does NOT render a ring chart.
// Dashboard's ring is CSS conic-gradient math driven by custom properties
// (`--ring-color`, `--ring-deg`, `--target-deg`) that are specific to that
// page's progress model. Baking ring rendering into this primitive would
// couple the library to one metric shape. Instead, StatCard exposes a
// `ring` slot that accepts any ReactNode — a ring component, an icon, a
// sparkline, or nothing. Dashboard will later pass a <RingChart …/> into
// `ring`; that component is not built in this task.
//
// The shell absorbs `Dashboard.module.css:28-88` (.ringCard + .ringLabel +
// .ringValue) so callers get a consistent card chrome without duplicating
// the styles. Phase 9 cleanup removes those Dashboard rules once the page
// migrates to StatCard.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (item 5).

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './StatCard.module.css'

export interface StatCardProps {
  /** Uppercase small-caps label (e.g. "CONSISTENTIE"). Rendered as-is. */
  label: string
  /**
   * The metric value. Typed as ReactNode so callers can pass a plain
   * string ("0 / 4"), a number, or a styled element (e.g. a dimmed Mantine
   * <Text>) — the primitive stays type-agnostic about the payload.
   */
  value: ReactNode
  /**
   * Optional top-slot for a ring, icon, sparkline, or any other visual
   * indicator. StatCard does not render a ring itself; callers own the
   * indicator's markup and styling. Default slot size is 80×80 but a
   * caller-supplied component can override via its own sizing.
   */
  ring?: ReactNode
  /**
   * Optional bottom-slot rendered after the value — typically a
   * <StatusPill/> or small contextual element (e.g. "Op schema").
   */
  trailing?: ReactNode
}

export function StatCard({ label, value, ring, trailing }: StatCardProps) {
  return (
    <div className={cx(classes.root)}>
      {ring && <div className={cx(classes.ring)}>{ring}</div>}
      <div className={cx(classes.label)}>{label}</div>
      <div className={cx(classes.value)}>{value}</div>
      {trailing && <div className={cx(classes.trailing)}>{trailing}</div>}
    </div>
  )
}
