// src/components/page/primitives/SectionHeading.tsx
// Mid-page subsection divider — the uppercase small-caps label + hairline
// rule that today lives as the global `.section-label` class in
// `src/index.css:98-116`. Wrapping it in a primitive gives us (a) semantic
// <h2> markup for the section title (the page's <h1> is owned by
// PageHeader), (b) an explicit action slot for "See all →" style links,
// and (c) a single source of truth so the visual can be tuned in one file.
//
// Structure note: the trailing hairline is a real <div aria-hidden="true">
// sibling rather than a `::after` pseudo-element. A pseudo can't have a
// following sibling in DOM order, so pairing it with an `action` slot would
// push the action off-canvas. A real divider element composes cleanly with
// or without the action and is flagged aria-hidden so screen readers skip
// the decoration.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (Layout chrome).

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './SectionHeading.module.css'

export interface SectionHeadingProps {
  /** Heading text. Rendered inside an <h2>; pass a string or inline element. */
  children: ReactNode
  /**
   * Optional trailing element — typically a small link or button such as
   * "See all →". Sits to the right of the hairline divider and does not
   * shrink when the label grows.
   */
  action?: ReactNode
}

export function SectionHeading({ children, action }: SectionHeadingProps) {
  return (
    <div className={cx(classes.root)}>
      <h2 className={cx(classes.label)}>{children}</h2>
      <div className={cx(classes.divider)} aria-hidden="true" />
      {action && <div className={cx(classes.action)}>{action}</div>}
    </div>
  )
}
