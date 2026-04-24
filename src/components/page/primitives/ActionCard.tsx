// src/components/page/primitives/ActionCard.tsx
// Prominent CTA card primitive — a tone-driven, larger-icon sibling of
// ListCard. Absorbs the Dashboard "Action Cards" cluster (Dashboard.module.css
// lines 118-191) and the "Rescue" card (lines 345-378) into a single
// primitive with three tones: `accent`, `warning`, and `danger`.
//
// Differences from ListCard:
//   • A 3px solid tone-driven left border (accent / warning / danger).
//   • A larger 40×40 tinted icon box (ListCard's is 36×36) — a stronger
//     visual affordance appropriate for a primary call-to-action.
//   • A three-line body — title + focus + optional reason — instead of the
//     title + subtitle pair on ListCard.
//   • The `danger` tone additionally tints the background, matching the
//     `.rescueCard` shape that sat beside the action cluster on Dashboard.
//
// Critical design decision — `tone` is REQUIRED with no default. ActionCard
// exists to make one call-to-action visually dominant; a default would
// invite accidental usage as a neutral card (that's ListCard's job). Forcing
// callers to state intent keeps the CTA semantics intentional.
//
// The root renders as a <Link> when `to` is provided, otherwise a <div> —
// mirroring ListCard exactly so the entire card is a single clickable
// surface for navigational CTAs (Enter activates, single tab stop, full
// hover area). See ListCard.tsx for the rationale.
//
// No @container / @media / @layer / !important — responsive tweaks belong
// in token values, not in this file.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (item 7).

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconChevronRight } from '@tabler/icons-react'
import { cx } from './cx'
import classes from './ActionCard.module.css'

export interface ActionCardProps {
  /**
   * Visual tone — drives both the colored left border and the icon-box
   * tint. Required; no default. `danger` also tints the card background to
   * match the `.rescueCard` shape being absorbed.
   */
  tone: 'accent' | 'warning' | 'danger'
  /**
   * Icon rendered inside the 40×40 tinted icon box. Pre-sized by the caller
   * — ActionCard does not resize the icon itself; it only centers it inside
   * the tinted square and applies the tone's color via CSS.
   */
  icon: ReactNode
  /** Primary CTA label. Rendered as the title line (bold, prominent). */
  title: string
  /**
   * Optional secondary highlight line rendered directly under the title —
   * a short phrase that sharpens the CTA (e.g. a count, next-step hint).
   */
  focus?: string
  /**
   * Optional third line, rendered in a dimmer, smaller style below `focus`
   * — used to explain *why* this CTA is being suggested (e.g. "Aangeraden
   * nu", "Op basis van je voortgang").
   */
  reason?: string
  /**
   * If provided, the root renders as a React Router <Link> with this `to`
   * value — making the entire card a single clickable navigation surface.
   * If omitted, the root renders as a plain <div>. Mirrors ListCard.
   */
  to?: string
}

const TONE_ROOT_CLASS: Record<ActionCardProps['tone'], string> = {
  accent: classes.toneAccent,
  warning: classes.toneWarning,
  danger: classes.toneDanger,
}

const TONE_ICON_CLASS: Record<ActionCardProps['tone'], string> = {
  accent: classes.iconBoxAccent,
  warning: classes.iconBoxWarning,
  danger: classes.iconBoxDanger,
}

export function ActionCard({
  tone,
  icon,
  title,
  focus,
  reason,
  to,
}: ActionCardProps) {
  const rootClass = cx(classes.root, TONE_ROOT_CLASS[tone])
  const iconClass = cx(classes.iconBox, TONE_ICON_CLASS[tone])

  const content = (
    <>
      <div className={iconClass}>{icon}</div>
      <div className={cx(classes.body)}>
        <div className={cx(classes.title)}>{title}</div>
        {focus && <div className={cx(classes.focus)}>{focus}</div>}
        {reason && <div className={cx(classes.reason)}>{reason}</div>}
      </div>
      <div className={cx(classes.chevron)}>
        <IconChevronRight size={16} />
      </div>
    </>
  )

  if (to !== undefined) {
    return (
      <Link to={to} className={rootClass}>
        {content}
      </Link>
    )
  }

  return <div className={rootClass}>{content}</div>
}
