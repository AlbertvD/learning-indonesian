// src/components/page/primitives/ListCard.tsx
// Horizontal row card primitive: icon + title + optional subtitle + trailing
// element (default: chevron). Consolidates two near-identical shapes that
// were duplicated across pages:
//   • Lessons.module.css `.lessonCard` (Lessons.tsx:70-106) — list of lessons
//   • Dashboard.module.css `.secondaryCard` (Dashboard.module.css:325-343)
//
// Critical design decision — the root element switches between <Link> and
// <div> based on whether `to` is provided. This mirrors the Mantine pattern
// (`<Paper component={Link} to={url}>`) and preserves a single clickable
// surface for the entire row, instead of nesting an anchor inside the card
// (which would create two tab stops and split the hover surface). When a
// page doesn't need navigation (e.g. a row that opens a modal or is purely
// informational) the caller simply omits `to` and gets a plain <div>.
//
// The default trailing element is <IconChevronRight size={16} />. Callers
// can override it with any ReactNode — a Mantine Badge, a button, a pill,
// an icon, or nothing (though passing `null` will fall back to the default;
// to truly suppress the trailing slot, pass a fragment with no children).
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (item 6).

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconChevronRight } from '@tabler/icons-react'
import { cx } from './cx'
import classes from './ListCard.module.css'

export interface ListCardProps {
  /**
   * Left-side icon. Pre-sized by the caller — ListCard does not resize the
   * icon itself; it only centers it inside a 36×36 accented square.
   */
  icon: ReactNode
  /** Primary label. Rendered as the title line. */
  title: string
  /** Optional dim caption rendered below the title. */
  subtitle?: string
  /**
   * Optional right-side element. Defaults to <IconChevronRight size={16}/>
   * so a navigational row always has an affordance hint; pass any ReactNode
   * to override (e.g. a Badge, a small button, a count).
   */
  trailing?: ReactNode
  /**
   * If provided, the root renders as a React Router <Link> with this `to`
   * value — making the entire card a single clickable navigation surface.
   * If omitted, the root renders as a plain <div>.
   */
  to?: string
}

export function ListCard({ icon, title, subtitle, trailing, to }: ListCardProps) {
  const content = (
    <>
      <div className={cx(classes.icon)}>{icon}</div>
      <div className={cx(classes.body)}>
        <div className={cx(classes.title)}>{title}</div>
        {subtitle && <div className={cx(classes.subtitle)}>{subtitle}</div>}
      </div>
      <div className={cx(classes.trailing)}>
        {trailing ?? <IconChevronRight size={16} />}
      </div>
    </>
  )

  if (to !== undefined) {
    return (
      <Link to={to} className={cx(classes.root)}>
        {content}
      </Link>
    )
  }

  return <div className={cx(classes.root)}>{content}</div>
}
