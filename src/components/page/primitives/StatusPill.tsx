// src/components/page/primitives/StatusPill.tsx
// Small colored badge primitive — communicates status in a single word or
// short phrase ("Op schema", "Risico", "Achieved"). Absorbs the Dashboard
// week-goal status pills (Dashboard.module.css:104-116) and matches the
// shape used by Lessons.module.css's `.badge` cluster (same 20px-radius
// pill geometry, mapped to tone semantics instead of color names).
//
// Critical design decision — `tone` is REQUIRED with no default. The entire
// purpose of StatusPill is communicating *which* status a thing is in; a
// default would let callers drop a pill on the page without committing to
// a semantic, defeating the primitive. Forcing an explicit tone keeps
// status signals intentional.
//
// Root is a <span> (not a <div>) so the pill flows inline inside headings,
// list rows, and text runs — the actual callsite shape on Dashboard and
// Lessons. Block-level positioning is the caller's job.
//
// The five-tone palette covers every status the current app surfaces:
//   • success — Achieved / Op schema (positive outcome)
//   • warning — Risico / At risk (approaching failure, still recoverable)
//   • danger  — Missed / Failed (negative outcome)
//   • accent  — In progress / On track (neutral-positive, in-flight)
//   • neutral — Inactive / Meta (de-emphasised / not-yet-started)
//
// No @container / @media / @layer / !important — pills keep their shape on
// every viewport; responsive tweaks belong in token values.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (item 10).

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './StatusPill.module.css'

export interface StatusPillProps {
  /**
   * Semantic tone — drives background + text color via tokenised pairs.
   * Required; no default. `success` = positive outcome, `warning` = at
   * risk, `danger` = failure, `accent` = in-progress, `neutral` = meta /
   * de-emphasised.
   */
  tone: 'success' | 'warning' | 'danger' | 'accent' | 'neutral'
  /**
   * Pill body — typically a short label ("Op schema", "Risico",
   * "Achieved"). Accepts ReactNode so callers can include an inline icon
   * before the label text if ever needed; the primitive itself doesn't
   * render an icon.
   */
  children: ReactNode
}

const TONE_CLASS: Record<StatusPillProps['tone'], string> = {
  success: classes.toneSuccess,
  warning: classes.toneWarning,
  danger: classes.toneDanger,
  accent: classes.toneAccent,
  neutral: classes.toneNeutral,
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={cx(classes.root, TONE_CLASS[tone])}>{children}</span>
  )
}
