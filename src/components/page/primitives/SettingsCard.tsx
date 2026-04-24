// src/components/page/primitives/SettingsCard.tsx
// Titled card for settings / forms / grouped controls. Absorbs the 8× inline
// `<Paper p="xl" radius="md"><Stack gap="md"><Title order={4}>...` pattern in
// `src/pages/Profile.tsx:197-380` and the mobile-vs-desktop `paperProps`
// branch at `Profile.tsx:197-205`.
//
// The mobile branch of that pattern is a frosted-glass treatment (rgba
// background + backdrop-filter + light border, no shadow). Desktop is
// Mantine's `withBorder shadow="sm"` equivalent — var(--card-bg) background,
// 1px var(--card-border), var(--shadow-sm). We absorb both branches into
// the CSS module via a `@media (max-width: 768px)` override, so the callsite
// no longer needs to read `useMediaQuery` or `colorScheme` just to style the
// container.
//
// Semantics: <section> with an <h3> title inside. The page-level <h1> lives
// in PageHeader; page-level subsections get SectionHeading's <h2>; settings
// cards sit one level deeper, so <h3> is the correct document-outline rung.
// Visual weight matches Mantine's `Title order={4}` (fs-md + fw-semibold).
//
// No @container / @layer / !important. The only responsive rule is the
// single mobile breakpoint that flips the card chrome to frosted-glass —
// the exact behaviour Profile.tsx implemented via inline JS.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (item 9).

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './SettingsCard.module.css'

export interface SettingsCardProps {
  /**
   * Card heading — rendered as an `<h3>` at the top of the card. Required;
   * settings cards always carry a label in the current design language.
   */
  title: string
  /**
   * Optional helper text rendered between the title and the body as a
   * dim-styled `<p>`. Matches the `<Text size="sm" c="dimmed">` pattern
   * Profile.tsx uses for timezone / session-size / listening-exercise
   * sub-descriptions.
   */
  description?: string
  /**
   * Body content — form controls, text groups, segmented controls, sliders,
   * etc. SettingsCard renders this inside a `.body` wrapper with no further
   * styling, so the caller owns the inner layout.
   */
  children: ReactNode
}

export function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <section className={cx(classes.root)}>
      <h3 className={cx(classes.title)}>{title}</h3>
      {description && <p className={cx(classes.description)}>{description}</p>}
      <div className={cx(classes.body)}>{children}</div>
    </section>
  )
}
