// src/components/page/primitives/PageBody.tsx
// Seam contract primitive — owns fit-mode viewport math alongside PageContainer.
// `auto` = block flow (whole page scrolls naturally). `fit` = flex child that
// fills remaining viewport space inside a <PageContainer fit> ancestor, so
// sticky regions + internal scroll containers compose cleanly.
// Task 22 adds the runtime warning hook; this scaffold exposes
// `data-page-body="true"` so the hook can find us via `el.closest()` and
// detect (a) fit without a fit container ancestor and (b) nested PageBody.
// See docs/plans/2026-04-24-page-framework-design.md §3 and §4.1.

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './PageBody.module.css'

export interface PageBodyProps {
  children: ReactNode
  /**
   * Layout variant. `auto` (default) leaves children in normal block flow so
   * the page scrolls naturally. `fit` turns the body into a flex column that
   * fills the remaining viewport height — requires a `<PageContainer fit>`
   * ancestor. Only PageContainer and PageBody own viewport math in this
   * codebase.
   */
  variant?: 'auto' | 'fit'
}

const VARIANT_CLASS: Record<NonNullable<PageBodyProps['variant']>, string> = {
  auto: classes.auto,
  fit: classes.fit,
}

export function PageBody({ children, variant = 'auto' }: PageBodyProps) {
  return (
    <div
      className={cx(classes.root, VARIANT_CLASS[variant])}
      data-page-body="true"
    >
      {children}
    </div>
  )
}
