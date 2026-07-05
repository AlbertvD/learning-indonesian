// src/components/nav/SurfaceNav.tsx
//
// The shared hub-section nav, used by both the Leren and Ontdek hubs. It
// renders two viewport-exclusive things (identical to the pattern the Leren
// surfaces have always had):
//   • Desktop — a persistent switcher row of the hub's surfaces, so you can
//     jump between them without losing the row.
//   • Mobile — a "back to <hub>" link, since on mobile each surface is reached
//     from the hub landing one at a time.
//
// It is presentational: the caller derives `activeKey` from the location and
// supplies the hub's items + back target. LerenNav and OntdekNav are thin
// wrappers that pin those per-hub specifics.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BackLink } from './BackLink'
import classes from './SurfaceNav.module.css'

export interface SurfaceNavItem {
  key: string
  label: string
  icon: ReactNode
  to: string
}

export interface SurfaceNavProps {
  /** The hub's surfaces, in row order. */
  items: SurfaceNavItem[]
  /** Which item's `key` is the current surface (caller derives from location). */
  activeKey: string
  /** Where the mobile back link returns to (the hub landing). */
  backTo: string
  /** Mobile back link label, e.g. "Terug naar Ontdek". */
  backLabel: string
  /** Accessible name for the switcher <nav>. */
  ariaLabel: string
}

export function SurfaceNav({ items, activeKey, backTo, backLabel, ariaLabel }: SurfaceNavProps) {
  return (
    <>
      <nav className={classes.nav} aria-label={ariaLabel}>
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            aria-current={activeKey === item.key ? 'page' : undefined}
            className={`${classes.tab} ${activeKey === item.key ? classes.tabActive : ''}`}
          >
            {item.icon}
            <span className={classes.label}>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className={classes.mobileBack}>
        <BackLink to={backTo} label={backLabel} />
      </div>
    </>
  )
}
