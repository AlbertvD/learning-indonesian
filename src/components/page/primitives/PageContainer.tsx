// src/components/page/primitives/PageContainer.tsx
// Outer page wrapper. Declares @container page so child primitives can do
// width-responsive queries; owns fit-mode viewport-height math for single-
// screen surfaces. <div> on purpose — Layout.tsx / MobileLayout.tsx supply the
// outer <main> landmark, and nesting <main> inside another <main> is invalid.
// See docs/plans/2026-04-24-page-framework-design.md §3 and §4.

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './PageContainer.module.css'

export interface PageContainerProps {
  children: ReactNode
  /** Max-width preset. Defaults to `md` (720px). */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Fit-mode: flex column that fills the viewport minus app chrome. Composes with `size` to cap width. */
  fit?: boolean
}

const SIZE_CLASS: Record<NonNullable<PageContainerProps['size']>, string> = {
  sm: classes.sm,
  md: classes.md,
  lg: classes.lg,
  xl: classes.xl,
}

export function PageContainer({ children, size = 'md', fit = false }: PageContainerProps) {
  return (
    <div
      className={cx(classes.root, SIZE_CLASS[size], fit && classes.fit)}
      data-page-container-fit={fit || undefined}
    >
      {children}
    </div>
  )
}
