// src/components/page/primitives/MediaShowcaseCard.tsx
// Visual-forward "showcase" card primitive: banner area on top + body
// underneath. Built for content surfaces that benefit from imagery or strong
// visual identity per item — Lessons (location-themed banners), Podcasts
// (cover art + duration), and similar list-of-features pages.
//
// Differs from ListCard:
//   • ListCard is dense: 36×36 icon + one-line title + chevron, optimised for
//     quick scanning.
//   • MediaShowcaseCard is expressive: full-width banner slot at the top, then
//     a body with eyebrow + title + tags + status + CTA. Roomier, designed to
//     hold a gradient + glyph (no artwork yet) or a real <img> when present.
//
// Critical design decision — the BANNER is a slot, not a built-in image
// element. The primitive doesn't know whether you want a gradient + glyph,
// an <img>, an SVG illustration, or something else. Keeping it a children-
// style ReactNode means callers compose the visual identity (per-lesson
// palettes, per-podcast cover art) at the page level. The shell only
// guarantees the banner gets the same height + radius treatment everywhere.
//
// The root switches between <Link> and <div> based on `to` (matches ListCard
// / ActionCard). When `disabled` is true the root forces the <div> path and
// applies `aria-disabled="true"` even if `to` was supplied — pages that need
// a "Not available yet" state get a single, unambiguous shape.
//
// Featured variant: `featured` enlarges the banner area and bumps the title
// face. Use it for the recommended/hero item; keep the rest of the grid in
// the default size so the featured one actually stands out.
//
// No @container / @media / @layer / !important inside this file. Responsive
// behavior is owned by the page-level grid that places these cards (single-
// column on mobile, multi-column on desktop). The card itself is layout-
// agnostic.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowRight } from '@tabler/icons-react'
import { cx } from './cx'
import classes from './MediaShowcaseCard.module.css'

export interface MediaShowcaseCardProps {
  /**
   * Banner content rendered at the top of the card. Pass a gradient + glyph
   * div, an <img>, or an SVG illustration — the primitive only owns the
   * banner's outer height + radius. The banner is decorative; titles and
   * actions live in the body slots below.
   */
  banner: ReactNode
  /**
   * Optional small uppercase label rendered above the title. Use it for
   * categorical context like "LES 1" or "PODCAST". Plain string, rendered
   * as a <p> in dim, tracked-out type.
   */
  eyebrow?: string
  /** Required title. Rendered as an <h3> — sub-page heading, since the page
   * itself owns the <h1> via PageHeader. */
  title: string
  /**
   * Optional subtitle / supporting copy. Plain string rendered as a <p>
   * directly below the title. Use sparingly — the card is visual-forward;
   * heavy explanatory text belongs on the lesson detail page.
   */
  subtitle?: string
  /**
   * Optional tags slot — chips, comma-separated grammar topics, or any
   * inline-flow content. Rendered in its own row below the subtitle.
   */
  tags?: ReactNode
  /**
   * Optional status pill slot. Reserved space at the top-right of the body;
   * accepts a <StatusPill/> or any inline marker.
   */
  status?: ReactNode
  /**
   * Optional CTA label rendered at the bottom-right with an arrow icon.
   * Shown only when both `cta` and a destination (`to`) are present;
   * pages that need a non-link CTA should use a different primitive.
   */
  cta?: string
  /**
   * If provided, the card root is a React Router <Link>. Omit (or set
   * `disabled`) for a non-navigable card.
   */
  to?: string
  /**
   * Featured / hero variant. Bumps the banner height, the title face, and
   * the body padding so the card visually leads the page. Use for the
   * recommended/hero item; keep the rest of the grid at the default size.
   */
  featured?: boolean
  /**
   * Disabled / "not available yet" state. Forces the root to render as a
   * <div> with `aria-disabled="true"` even when a `to` value is supplied,
   * dims the card visually, and suppresses hover lift. Mirrors Lessons'
   * existing `coming_later` / unavailable rows.
   */
  disabled?: boolean
}

export function MediaShowcaseCard({
  banner,
  eyebrow,
  title,
  subtitle,
  tags,
  status,
  cta,
  to,
  featured = false,
  disabled = false,
}: MediaShowcaseCardProps) {
  const rootClass = cx(
    classes.root,
    featured && classes.featured,
    disabled && classes.disabled,
  )

  const content = (
    <>
      <div className={cx(classes.banner)}>{banner}</div>
      <div className={cx(classes.body)}>
        {status && <div className={cx(classes.status)}>{status}</div>}
        {eyebrow && <p className={cx(classes.eyebrow)}>{eyebrow}</p>}
        <h3 className={cx(classes.title)}>{title}</h3>
        {subtitle && <p className={cx(classes.subtitle)}>{subtitle}</p>}
        {tags && <div className={cx(classes.tags)}>{tags}</div>}
        {cta && (
          <div className={cx(classes.cta)}>
            <span>{cta}</span>
            {to && !disabled && <IconArrowRight size={16} />}
          </div>
        )}
      </div>
    </>
  )

  if (to !== undefined && !disabled) {
    return (
      <Link to={to} className={rootClass}>
        {content}
      </Link>
    )
  }

  const divProps = disabled ? { 'aria-disabled': true as const } : {}
  return (
    <div className={rootClass} {...divProps}>
      {content}
    </div>
  )
}
