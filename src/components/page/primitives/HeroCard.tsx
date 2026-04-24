// src/components/page/primitives/HeroCard.tsx
// Gradient-background signature card — the "prominent, eye-catching"
// primitive in the catalog. Dashboard's centerpiece "Planning van vandaag"
// card is the original (and, today, only) callsite; the primitive is still
// worth extracting because the shared `--hero-*` tokens and the
// mobile/desktop-invariant layout make pulling the shell out nearly free.
//
// Critical design decision — HeroCard is GENERIC. It provides only the
// outer shell (gradient background, border, radius, padding, optional
// title) and a children slot. All inner content — stats rows, progress
// mix bars, big CTA buttons, footnotes — is composed at the callsite
// using the caller's own classes. Baking Dashboard's specific stat-row /
// mix-bar / CTA layout into this primitive would couple it to one page's
// information architecture. Dashboard keeps those classes in its own
// CSS module and passes the resulting markup as `children`.
//
// The shell absorbs `Dashboard.module.css:195-207` (.heroCardV2 +
// .heroV2Title typography) so callers get a consistent card chrome
// without duplicating the styles. Phase 9 cleanup removes those Dashboard
// rules once the page migrates to HeroCard.
//
// Semantics: renders as a <section> — a hero card is a distinct thematic
// region of a page. When `title` is provided it is rendered as an <h2>
// inside the section, establishing the card's heading.
//
// No @container / @media / @layer / !important — responsive behaviour
// lives in the tokens the CSS references, not in this file.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (item 8).

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './HeroCard.module.css'

export interface HeroCardProps {
  /**
   * Body content — stats row, mix bars, CTA button, footnotes, or any
   * other composition the caller needs. HeroCard renders this inside a
   * `.body` wrapper but applies no further styling, so the caller owns
   * the inner layout entirely.
   */
  children: ReactNode
  /**
   * Optional heading rendered at the top of the card as an `<h2>`. Omit
   * if the card's content carries its own heading or needs none.
   */
  title?: string
}

export function HeroCard({ children, title }: HeroCardProps) {
  return (
    <section className={cx(classes.root)}>
      {title && <h2 className={cx(classes.title)}>{title}</h2>}
      <div className={cx(classes.body)}>{children}</div>
    </section>
  )
}
