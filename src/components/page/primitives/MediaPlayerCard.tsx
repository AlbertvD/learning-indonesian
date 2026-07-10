// src/components/page/primitives/MediaPlayerCard.tsx
// Inline-media row card: medallion + title/subtitle head, then a full-width
// player row. Extracted from the grammar-podcast row (GrammarPodcasts) at its
// second occurrence (the pronunciation-primer podcast panel) — the
// MediaShowcaseCard extract-on-2nd-occurrence precedent.
//
// Differs from ListCard: no navigation, no chevron — the card's whole job is
// hosting an inline player the user operates in place (the locked ontdek
// card-nav decision: a row that plays inline must not carry go-deeper
// affordances). Differs from MediaShowcaseCard: no banner, no CTA, dense row
// geometry.
//
// Critical design decision — the PLAYER is a children slot, not a built-in
// <audio> element. Callers own the media element and its props (src, preload,
// data-testid), so the primitive never has to grow flags for player concerns.
// The slot styles any nested <audio> to full width; other media elements are
// the caller's layout responsibility.

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './MediaPlayerCard.module.css'

export interface MediaPlayerCardProps {
  /**
   * Medallion content — a lesson number ("01"), an icon, or any small glyph.
   * Rendered in a fixed 36×36 teal-subtle square at the head's left edge.
   */
  medallion: ReactNode
  /** Required title. Rendered as an <h3> — sub-page heading, since the page
   * itself owns the <h1> via PageHeader. */
  title: string
  /**
   * Optional supporting copy rendered as a dim <p> directly below the title.
   */
  subtitle?: string
  /**
   * The player element — typically the caller's <audio controls>. Rendered in
   * a full-width slot below the head; a nested <audio> is stretched to the
   * card's width automatically.
   */
  children: ReactNode
}

export function MediaPlayerCard({ medallion, title, subtitle, children }: MediaPlayerCardProps) {
  return (
    <section className={cx(classes.card)}>
      <div className={cx(classes.head)}>
        <div className={cx(classes.medallion)}>{medallion}</div>
        <div>
          <h3 className={cx(classes.title)}>{title}</h3>
          {subtitle && <p className={cx(classes.subtitle)}>{subtitle}</p>}
        </div>
      </div>
      <div className={cx(classes.playerSlot)}>{children}</div>
    </section>
  )
}
