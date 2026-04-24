// src/components/page/primitives/EmptyState.tsx
// Centered icon + message + optional CTA for blank slates — the primitive
// shape behind empty leaderboards, zero-review queues, empty card-set
// lists, etc. Absorbs the `<Center h="20vh"><Text c="dimmed">…</Text>
// </Center>` pattern used ad-hoc across pages (see Leaderboard.tsx:119-123)
// and adds an icon affordance plus an optional CTA so the empty state
// isn't just a dimmed line of text.
//
// Structure is a vertical stack: icon → message → optional CTA. All three
// slots are centered; the parent controls outer height (typical callers
// wrap this in a panel or `<Center h="20vh">` and let EmptyState own the
// internal rhythm).
//
// Props are minimal by design. `icon` is REQUIRED — every empty state in
// the app carries a Tabler icon above the copy; making it optional would
// invite callers to drop a bare line of dimmed text and lose the visual
// anchor. `cta` is optional because some blank slates have nothing to do
// (e.g. "no entries on this leaderboard tab yet" — the user can't add one).
//
// No @container / @media / @layer — the stack looks the same on every
// viewport. See docs/plans/2026-04-24-page-framework-design.md §3 (item 11).

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './EmptyState.module.css'

export interface EmptyStateProps {
  /**
   * Icon rendered above the message. Typically a Tabler icon component
   * (e.g. `<IconInbox size={48} />`). Required — every empty state carries
   * a visual anchor; there is no "iconless" variant of this primitive.
   */
  icon: ReactNode
  /**
   * The blank-slate copy. Plain string — rendered inside a `<p>` capped at
   * ~32ch so long sentences wrap instead of stretching edge-to-edge. Keep
   * it short and action-oriented ("Geen kaarten te leren vandaag").
   */
  message: string
  /**
   * Optional call-to-action rendered below the message — typically a
   * `<Button>` or inline link. Omit when the empty state is informational
   * only (e.g. "no leaderboard entries this week" — the user can't do
   * anything about it).
   */
  cta?: ReactNode
}

export function EmptyState({ icon, message, cta }: EmptyStateProps) {
  return (
    <div className={cx(classes.root)}>
      <div className={cx(classes.icon)}>{icon}</div>
      <p className={cx(classes.message)}>{message}</p>
      {cta && <div className={cx(classes.cta)}>{cta}</div>}
    </div>
  )
}
